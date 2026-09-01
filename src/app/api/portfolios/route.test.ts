/**
 * GET /api/portfolios is the book's poll. The client asks it every 45
 * seconds and again every time a room is shown, and it used to run
 * `ensureProfileAndClaims` on every one of those: a profile upsert, a seed
 * claim read, a lab state read, all so that a brand-new account would have
 * its rows before the first book read. That step belongs where a session
 * begins (GET /api/auth/me, which AuthProvider calls once per session), and
 * on the one mutation a brand-new account makes (POST /api/portfolios). The
 * poll reads the book and nothing else.
 *
 * The Supabase client here is a counting stand-in: each `from()` or `rpc()`
 * is one request to PostgREST, which is the number this change is about.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ada@example.com",
  user_metadata: { full_name: "Ada" },
};

type Call = { table: string; ops: string[]; head: boolean };

let calls: Call[] = [];
/** Portfolio ids the owners table answers with, per read, in order. */
let ownedAnswers: string[][] = [["p1"]];
/** What the profiles HEAD count answers. */
let profileCount = 1;

function nextOwned(): string[] {
  const first = ownedAnswers[0] ?? [];
  if (ownedAnswers.length > 1) ownedAnswers = ownedAnswers.slice(1);
  return first;
}

function answer(call: Call): {
  data: unknown;
  error: null;
  count: number | null;
} {
  const { table, ops, head } = call;
  const none = { data: null, error: null, count: null };
  switch (table) {
    case "portfell_portfolio_owners":
      return {
        data: nextOwned().map((id) => ({ portfolio_id: id })),
        error: null,
        count: null,
      };
    case "portfell_profiles":
      if (head) return { data: null, error: null, count: profileCount };
      if (ops.includes("maybeSingle") || ops.includes("single")) {
        return {
          data: { id: USER.id, email: USER.email, display_name: "Ada" },
          error: null,
          count: null,
        };
      }
      return none;
    case "portfell_seed_claims":
      return { data: [], error: null, count: null };
    case "portfell_lab_state":
      return { data: { id: USER.id }, error: null, count: null };
    case "portfell_portfolios":
      return {
        data: [
          {
            id: "p1",
            name: "Main",
            slug: "main",
            sort_order: 1,
            cash_balance: 0,
            owner_id: USER.id,
            classroom_community_id: null,
          },
        ],
        error: null,
        count: null,
      };
    case "portfell_holdings":
      return { data: [], error: null, count: null };
    default:
      return none;
  }
}

/**
 * One builder per `from()`. Every method call is recorded and returns the
 * builder, and awaiting it answers from the table, which is how supabase-js
 * behaves: the chain is free and the await is the request.
 */
function builder(table: string) {
  const call: Call = { table, ops: [], head: false };
  calls.push(call);
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (
            resolve: (v: unknown) => unknown,
            reject: (e: unknown) => unknown
          ) => Promise.resolve(answer(call)).then(resolve, reject);
        }
        if (typeof prop === "symbol") return undefined;
        return (...args: unknown[]) => {
          call.ops.push(prop);
          const opts = args[1] as { head?: boolean } | undefined;
          if (prop === "select" && opts?.head) call.head = true;
          return proxy;
        };
      },
    }
  );
  return proxy;
}

const client = {
  from: (table: string) => builder(table),
  rpc: (name: string) => {
    calls.push({ table: `rpc:${name}`, ops: [], head: false });
    return Promise.resolve({
      data: { id: "p9", name: "Savings", slug: "savings" },
      error: null,
    });
  },
};

vi.mock("@/lib/supabase/server-auth", () => ({
  requireAuthUser: async () => ({ user: USER }),
  createSupabaseServerAuth: async () => client,
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseUsesServiceRole: () => true,
  getSupabaseServer: () => client,
  getSupabaseDataClient: async () => client,
}));

// The real ensure step, wrapped so the tests can count how often it runs
// while its own reads and writes still land on the counting client.
vi.mock("@/lib/auth/ensure-profile", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/auth/ensure-profile")>();
  return {
    ...actual,
    ensureProfileAndClaims: vi.fn(actual.ensureProfileAndClaims),
  };
});

vi.mock("@/lib/community-share", () => ({
  shareNewSheetIntoMemberCircles: async () => 0,
}));

vi.mock("@/lib/telemetry", () => ({
  logEvent: () => {},
  routeMeta: () => ({}),
  SLOW_ROUTE_MS: 1000,
}));
vi.mock("@/lib/observe-route", () => ({
  observeRoute: (h: (...args: unknown[]) => unknown) => h,
}));

import { ensureProfileAndClaims } from "@/lib/auth/ensure-profile";
import { GET, POST } from "@/app/api/portfolios/route";
import { GET as GET_ME } from "@/app/api/auth/me/route";

const ensure = vi.mocked(ensureProfileAndClaims);

/** Tables the ensure step touches and the book read never should. */
const ENSURE_TABLES = new Set([
  "portfell_profiles",
  "portfell_seed_claims",
  "portfell_lab_state",
]);

function getBook(): Promise<Response> {
  return GET(
    new NextRequest("https://upsidelab.app/api/portfolios")
  ) as Promise<Response>;
}

function postBook(): Promise<Response> {
  return POST(
    new NextRequest("https://upsidelab.app/api/portfolios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Savings" }),
    })
  ) as Promise<Response>;
}

beforeEach(() => {
  calls = [];
  ownedAnswers = [["p1"]];
  profileCount = 1;
  ensure.mockClear();
});

describe("GET /api/portfolios", () => {
  it("reads the book and nothing else for an account that has a portfolio", async () => {
    const res = await getBook();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { portfolios: unknown[] };
    expect(body.portfolios).toHaveLength(1);

    // Owners, portfolios, holdings, and nothing the ensure step touches.
    // Measured on this harness before the change: 6, the three above plus
    // a profiles upsert, a seed claims read and a lab state read.
    const touched = calls.map((c) => c.table);
    expect(ensure).not.toHaveBeenCalled();
    expect(touched.filter((t) => ENSURE_TABLES.has(t))).toEqual([]);
    expect(calls.length).toBe(3);
  });

  it("does not run the ensure step for an empty account that has a profile", async () => {
    // The empty-state Home polls this route too. A profile row means the
    // session already began somewhere, so there is nothing to ensure.
    ownedAnswers = [[]];
    profileCount = 1;

    const res = await getBook();

    expect(res.status).toBe(200);
    expect(ensure).not.toHaveBeenCalled();
    expect(calls.map((c) => c.table)).toEqual([
      "portfell_portfolio_owners",
      "portfell_profiles",
    ]);
    expect(calls[1]?.head).toBe(true);
  });

  it("runs it once for a caller with no portfolio and no profile, then reads again", async () => {
    /*
      The only case the guard exists for: a first read landing before the
      session's own ensure did. The seed claim can hand this person a
      portfolio, so the owners list is read a second time rather than
      answering empty on the strength of the first read.
    */
    ownedAnswers = [[], ["p1"]];
    profileCount = 0;

    const res = await getBook();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { portfolios: unknown[] };
    expect(body.portfolios).toHaveLength(1);
    expect(ensure).toHaveBeenCalledTimes(1);
    const owners = calls.filter(
      (c) => c.table === "portfell_portfolio_owners"
    );
    expect(owners).toHaveLength(2);
  });
});

describe("GET /api/auth/me", () => {
  it("is where the session begins, so it ensures the profile and the claims", async () => {
    const res = (await GET_ME()) as Response;

    expect(res.status).toBe(200);
    expect(ensure).toHaveBeenCalledTimes(1);
    const touched = calls.map((c) => c.table);
    expect(touched).toContain("portfell_profiles");
    expect(touched).toContain("portfell_seed_claims");
  });
});

describe("POST /api/portfolios", () => {
  it("ensures the profile and the claims, so a brand-new account can create one", async () => {
    const res = await postBook();

    expect(res.status).toBe(200);
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(calls.map((c) => c.table)).toContain(
      "rpc:portfell_create_portfolio_for_me"
    );
  });
});
