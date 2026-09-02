/*
  GET /api/communities is what Home asks for the one line naming the circle
  a reader is in, and it fetches it on every mount. It used to read the
  membership rows and then, in a second request that could not start until
  the first came back, read the communities those rows had just named.

  PostgREST can join them on the foreign key, so this is one request now.
  The stand-in below counts them and answers with what the join really
  returns, so the test can hold the response byte for byte: the same eight
  community columns, the same role beside each, in the same name order.
*/
import { beforeEach, describe, expect, it, vi } from "vitest";

const USER = { id: "11111111-1111-4111-8111-111111111111" };

type Call = { table: string; ops: { name: string; args: unknown[] }[] };

let calls: Call[] = [];

const COMMUNITIES: Record<string, Record<string, unknown>> = {
  c1: {
    id: "c1",
    name: "Upside Circle",
    visibility: "private",
    kind: "circle",
    starting_cash: 0,
    created_by: USER.id,
    created_at: "2026-01-02T00:00:00Z",
    updated_at: "2026-01-03T00:00:00Z",
  },
  c2: {
    id: "c2",
    name: "Aasa household",
    visibility: "private",
    kind: "circle",
    starting_cash: 0,
    created_by: null,
    created_at: "2026-02-02T00:00:00Z",
    updated_at: "2026-02-03T00:00:00Z",
  },
};

/** Memberships this account has, in the order the database hands them back. */
let memberships: { community_id: string; role: string }[] = [
  { community_id: "c1", role: "admin" },
  { community_id: "c2", role: "member" },
];

function answer(call: Call): { data: unknown; error: null } {
  if (call.table !== "portfell_community_members") {
    return { data: null, error: null };
  }
  const select = String(call.ops.find((o) => o.name === "select")?.args[0] ?? "");
  // A to-one embed comes back as an object hanging off the membership row,
  // under whatever the select aliased it to.
  const alias = /(\w+):portfell_communities/.exec(select)?.[1];
  return {
    data: memberships.map((m) => ({
      role: m.role,
      ...(alias ? { [alias]: COMMUNITIES[m.community_id] } : {}),
    })),
    error: null,
  };
}

function builder(table: string): unknown {
  const call: Call = { table, ops: [] };
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
          call.ops.push({ name: String(prop), args });
          return proxy;
        };
      },
    }
  );
  return proxy;
}

const client = { from: (table: string) => builder(table) };

vi.mock("@/lib/supabase/server-auth", () => ({
  requireAuthUser: async () => ({ user: USER }),
  createSupabaseServerAuth: async () => client,
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseUsesServiceRole: () => true,
  getSupabaseServer: () => client,
  getSupabaseDataClient: async () => client,
}));

vi.mock("@/lib/observe-route", () => ({
  observeRoute: (h: (...args: unknown[]) => unknown) => h,
}));

import { GET } from "@/app/api/communities/route";

beforeEach(() => {
  calls = [];
  memberships = [
    { community_id: "c1", role: "admin" },
    { community_id: "c2", role: "member" },
  ];
});

describe("GET /api/communities", () => {
  it("asks once, and answers exactly what the two reads used to", async () => {
    const res = (await GET()) as Response;

    expect(res.status).toBe(200);
    // Measured on this harness before the change: 2 requests, the second
    // unable to start until the first came back.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.table).toBe("portfell_community_members");

    expect(await res.json()).toEqual({
      communities: [
        {
          id: "c2",
          name: "Aasa household",
          visibility: "private",
          kind: "circle",
          starting_cash: 0,
          created_by: null,
          created_at: "2026-02-02T00:00:00Z",
          updated_at: "2026-02-03T00:00:00Z",
          role: "member",
        },
        {
          id: "c1",
          name: "Upside Circle",
          visibility: "private",
          kind: "circle",
          starting_cash: 0,
          created_by: USER.id,
          created_at: "2026-01-02T00:00:00Z",
          updated_at: "2026-01-03T00:00:00Z",
          role: "admin",
        },
      ],
    });
  });

  it("reads only this account's memberships, and only real communities", async () => {
    await GET();

    const ops = calls[0]?.ops ?? [];
    expect(ops.find((o) => o.name === "eq")?.args).toEqual([
      "user_id",
      USER.id,
    ]);
    // `!inner` so a membership row whose community is gone drops out
    // rather than arriving as a nameless entry on somebody's Home.
    expect(String(ops.find((o) => o.name === "select")?.args[0])).toContain(
      "portfell_communities!inner"
    );
  });

  it("answers with nothing for an account in no communities", async () => {
    memberships = [];

    const res = (await GET()) as Response;

    expect(await res.json()).toEqual({ communities: [] });
    expect(calls).toHaveLength(1);
  });
});
