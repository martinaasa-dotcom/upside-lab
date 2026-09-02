/*
  The ensure step runs where a session begins, which is a person waiting on
  a blank screen: GET /api/auth/me, the sign-in callbacks, and POST
  /api/portfolios. What it costs is round trips, and it used to take them
  one after the next -- a profile upsert, then a seed claims read, then a
  select and an owners upsert per claimed slug, then a lab read, then a lab
  write, then the household sync.

  The Supabase client below is a recording stand-in. Each `from()` or
  `rpc()` is one request to PostgREST, and a "wave" begins with the first
  request issued after something came back, so the wave count is how deep
  the chain of requests that wait on each other goes. That depth is the
  wall-clock cost and is what this change is about; the tests assert it
  along with every behaviour that has to survive the reshuffle, above all
  that signing in still joins nobody to a community.
*/
import { beforeEach, describe, expect, it, vi } from "vitest";

type Op = { name: string; args: unknown[] };
type Call = { table: string; ops: Op[]; wave: number };

let calls: Call[] = [];
let waves = 0;
/** Whether anything has come back since the last wave opened. */
let heardBack = true;

/** Slugs the claims table answers with for the email under test. */
let seedClaims: string[] = [];
/** Portfolio rows the slug lookup answers with. */
let portfolioRows: { id: string; slug: string; owner_id: string | null }[] = [];

function record(table: string): Call {
  if (heardBack) {
    waves += 1;
    heardBack = false;
  }
  const call: Call = { table, ops: [], wave: waves };
  calls.push(call);
  return call;
}

function answer(call: Call): { data: unknown; error: null } {
  const did = (name: string) => call.ops.some((o) => o.name === name);
  switch (call.table) {
    case "portfell_seed_claims":
      return {
        data: seedClaims.map((slug) => ({ portfolio_slug: slug })),
        error: null,
      };
    case "portfell_portfolios":
      return { data: did("select") ? portfolioRows : null, error: null };
    default:
      return { data: null, error: null };
  }
}

/** Resolve on a later task, so a request stays in flight across microtasks. */
async function settle(call: Call): Promise<{ data: unknown; error: null }> {
  await new Promise((r) => setTimeout(r, 0));
  heardBack = true;
  return answer(call);
}

/**
 * One builder per `from()`. Every method is recorded with its arguments and
 * returns the builder, and awaiting it answers, which is how supabase-js
 * behaves: the chain is free and the await is the request.
 */
function builder(table: string): unknown {
  const call = record(table);
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (
            resolve: (v: unknown) => unknown,
            reject: (e: unknown) => unknown
          ) => settle(call).then(resolve, reject);
        }
        if (typeof prop === "symbol") return undefined;
        return (...args: unknown[]) => {
          call.ops.push({ name: String(prop), args });
          return proxy;
        };
      },
    }
  );
  return proxy;
}

const client = {
  from: (table: string) => builder(table),
  rpc: (name: string, args?: unknown) => {
    const call = record(`rpc:${name}`);
    call.ops.push({ name: "rpc", args: [args] });
    return settle(call);
  },
};

vi.mock("@/lib/supabase/server", () => ({
  supabaseUsesServiceRole: () => true,
  getSupabaseServer: () => client,
  getSupabaseDataClient: async () => client,
}));

vi.mock("@/lib/supabase/server-auth", () => ({
  createSupabaseServerAuth: async () => client,
}));

import { ensureProfileAndClaims } from "@/lib/auth/ensure-profile";

type TestUser = Parameters<typeof ensureProfileAndClaims>[0];

function userWith(email: string): TestUser {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    email,
    user_metadata: { full_name: "Ada Lovelace" },
  } as unknown as TestUser;
}

function tables(): string[] {
  return calls.map((c) => c.table);
}

function callTo(table: string, op?: string): Call | undefined {
  return calls.find(
    (c) => c.table === table && (!op || c.ops.some((o) => o.name === op))
  );
}

function argsOf(call: Call | undefined, op: string): unknown[] {
  return call?.ops.find((o) => o.name === op)?.args ?? [];
}

beforeEach(() => {
  calls = [];
  waves = 0;
  heardBack = true;
  seedClaims = [];
  portfolioRows = [];
});

describe("ensureProfileAndClaims", () => {
  it("is one round trip for an account with nothing waiting on it", async () => {
    // Measured on this harness before the change: 4 requests, 4 deep --
    // the profile upsert, the claims read, a lab read and then a lab write.
    const { claimedSlugs } = await ensureProfileAndClaims(
      userWith("ada@example.com")
    );

    expect(claimedSlugs).toEqual([]);
    expect(tables().sort()).toEqual([
      "portfell_lab_state",
      "portfell_profiles",
      "portfell_seed_claims",
    ]);
    expect(waves).toBe(1);
  });

  it("makes the lab row without reading it first, and never overwrites one", async () => {
    await ensureProfileAndClaims(userWith("ada@example.com"));

    const lab = callTo("portfell_lab_state");
    expect(lab?.ops.map((o) => o.name)).toEqual(["upsert"]);
    // Insert, do nothing on conflict: an existing row keeps its conviction
    // notes and its watchlist, which is what the read it replaces decided.
    expect(argsOf(lab, "upsert")[1]).toEqual({
      onConflict: "id",
      ignoreDuplicates: true,
    });
  });

  it("claims every seed slug with one select and one upsert", async () => {
    // Measured on this harness before the change: 10 requests, 10 deep for
    // these two slugs. A select and an owners upsert per slug is why.
    seedClaims = ["aasad", "karud"];
    portfolioRows = [
      { id: "p-aasad", slug: "aasad", owner_id: "someone-else" },
      { id: "p-karud", slug: "karud", owner_id: null },
    ];

    const { claimedSlugs } = await ensureProfileAndClaims(
      userWith("ada@example.com")
    );

    expect(claimedSlugs).toEqual(["aasad", "karud"]);
    expect(calls.filter((c) => c.table === "portfell_portfolio_owners")).toHaveLength(1);
    expect(
      calls.filter(
        (c) => c.table === "portfell_portfolios" && c.ops.some((o) => o.name === "select")
      )
    ).toHaveLength(1);
    expect(waves).toBe(3);

    const owners = callTo("portfell_portfolio_owners", "upsert");
    expect(argsOf(owners, "upsert")[0]).toEqual([
      { portfolio_id: "p-aasad", user_id: "11111111-1111-4111-8111-111111111111" },
      { portfolio_id: "p-karud", user_id: "11111111-1111-4111-8111-111111111111" },
    ]);

    // Only the portfolio nobody owns yet takes this account as its creator,
    // and the database is asked to check that rather than this process.
    const update = callTo("portfell_portfolios", "update");
    expect(argsOf(update, "in")).toEqual(["id", ["p-karud"]]);
    expect(argsOf(update, "is")).toEqual(["owner_id", null]);
  });

  it("claims nothing beyond the slugs that exist, in the order they were claimed", async () => {
    seedClaims = ["aasad", "gone", "karud"];
    portfolioRows = [
      { id: "p-karud", slug: "karud", owner_id: null },
      { id: "p-aasad", slug: "aasad", owner_id: null },
    ];

    const { claimedSlugs } = await ensureProfileAndClaims(
      userWith("ada@example.com")
    );

    expect(claimedSlugs).toEqual(["aasad", "karud"]);
  });

  it("asks the database nothing about slugs when none are waiting", async () => {
    seedClaims = [];

    await ensureProfileAndClaims(userWith("ada@example.com"));

    expect(tables()).not.toContain("portfell_portfolio_owners");
    expect(tables()).not.toContain("portfell_portfolios");
  });

  it("joins nobody to a community", async () => {
    // The rule this whole file sits under: membership is opt-in, by an
    // invite or by a request an admin approved. Signing in is neither.
    seedClaims = ["karud"];
    portfolioRows = [{ id: "p-karud", slug: "karud", owner_id: null }];

    await ensureProfileAndClaims(userWith("ada@example.com"));

    expect(tables()).not.toContain("portfell_community_members");
    expect(tables().some((t) => t.startsWith("rpc:"))).toBe(false);
  });

  it("still copies a household partner's circles, after the profile row", async () => {
    await ensureProfileAndClaims(userWith("rasmusmarjapuu@gmail.com"));

    const sync = callTo("rpc:portfell_sync_household_community_memberships");
    expect(sync).toBeDefined();
    // The sync reads this account's profile row to find the address it
    // syncs on, so it waits for the wave that writes one.
    expect(sync?.wave).toBeGreaterThan(callTo("portfell_profiles")?.wave ?? 0);
  });

  it("adopts the circle for Martin without a wave of its own", async () => {
    seedClaims = ["aasad"];
    portfolioRows = [{ id: "p-aasad", slug: "aasad", owner_id: null }];

    await ensureProfileAndClaims(userWith("martin.aasa@upthink.ee"));

    const circle = callTo("portfell_communities", "update");
    expect(argsOf(circle, "is")).toEqual(["created_by", null]);
    // It rides along with the household sync and the slug lookup rather
    // than waiting for them.
    expect(circle?.wave).toBe(
      callTo("rpc:portfell_sync_household_community_memberships")?.wave
    );
    expect(circle?.wave).toBe(callTo("portfell_portfolios", "select")?.wave);
    // Measured on this harness before the change: 9 requests, 9 deep.
    expect(calls).toHaveLength(8);
    expect(waves).toBe(3);
  });
});
