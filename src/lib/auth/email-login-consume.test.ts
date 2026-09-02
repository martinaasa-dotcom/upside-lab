import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashLinkToken } from "@/lib/auth/account-addresses";

/*
  Spending a sign-in link, against a table.

  A link works once, and "once" used to mean "the delete did not error",
  which is not the same thing: a delete that removes nothing succeeds. Two
  posts of one link arrive together often enough to matter, and both of them
  went on to mint a session. What settles it is asking Postgres which of them
  actually carried the row away.
*/

type Row = { email: string; token_hash: string; expires_at: string; next_path: string };

let rows: Row[] = [];
let reached: { userId: string; primaryEmail: string } | null = null;
let minted: string[] = [];

function builder(op: "select" | "delete") {
  const filters: Array<(r: Row) => boolean> = [];
  let single = false;
  let read = false;

  function run() {
    const hits = rows.filter((row) => filters.every((f) => f(row)));

    if (op === "select") {
      return { data: single ? (hits[0] ?? null) : hits, error: null };
    }

    rows = rows.filter((row) => !hits.includes(row));
    return { data: read ? hits : null, error: null };
  }

  const q = {
    select() {
      read = true;
      return q;
    },
    eq(col: keyof Row, value: unknown) {
      filters.push((row) => row[col] === value);
      return q;
    },
    lt(col: keyof Row, value: string) {
      filters.push((row) => String(row[col]) < value);
      return q;
    },
    maybeSingle() {
      single = true;
      return q;
    },
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(run()).then(resolve, reject);
    },
  };

  return q;
}

vi.mock("@/lib/supabase/server", () => ({
  supabaseUsesServiceRole: () => true,
  getSupabaseServer: () => ({
    from: () => ({
      select: () => builder("select").select(),
      delete: () => builder("delete"),
      upsert: async () => ({ error: null }),
    }),
    auth: {
      admin: {
        async createUser({ email }: { email: string }) {
          reached = { userId: "new-user", primaryEmail: email };
          return { error: null };
        },
      },
    },
  }),
}));

vi.mock("@/lib/auth/linked-addresses", () => ({
  accountReachedByAddress: async () => reached,
  hashedSessionTokenForAddress: async () =>
    reached ? `hashed:${reached.primaryEmail}` : null,
  magicTokenFor: async (email: string) => {
    minted.push(email);
    return `hashed:${email}`;
  },
}));

const { consumeEmailLogin, emailLoginTarget } = await import("@/lib/auth/email-login");

function link(token: string, email = "reader@x.com", hours = 1) {
  rows.push({
    email,
    token_hash: hashLinkToken(token),
    expires_at: new Date(Date.now() + hours * 3600_000).toISOString(),
    next_path: "/pulse",
  });
}

beforeEach(() => {
  rows = [];
  reached = null;
  minted = [];
});

describe("reading a sign-in link without spending it", () => {
  it("says which mailbox it opens and where it was going", async () => {
    link("tok");
    reached = { userId: "u1", primaryEmail: "reader@x.com" };

    const target = await emailLoginTarget("tok");

    expect(target).toEqual({
      email: "reader@x.com",
      next: "/pulse",
      account: { userId: "u1", primaryEmail: "reader@x.com" },
    });
    // Still there, so somebody who answers no keeps a working link.
    expect(rows).toHaveLength(1);
  });

  it("names the account when the address is a second one on somebody else's", async () => {
    link("tok", "second@x.com");
    reached = { userId: "u1", primaryEmail: "martin@upthink.ee" };

    const target = await emailLoginTarget("tok");

    expect(target?.email).toBe("second@x.com");
    expect(target?.account?.primaryEmail).toBe("martin@upthink.ee");
  });

  it("knows nothing about a link that has run out", async () => {
    link("tok", "reader@x.com", -1);
    expect(await emailLoginTarget("tok")).toBeNull();
  });

  it("knows nothing about a token nobody minted", async () => {
    expect(await emailLoginTarget("never-minted")).toBeNull();
    expect(await emailLoginTarget("  ")).toBeNull();
  });
});

describe("spending it", () => {
  it("opens the account the address already reaches", async () => {
    link("tok");
    reached = { userId: "u1", primaryEmail: "reader@x.com" };

    const spent = await consumeEmailLogin("tok");

    expect(spent).toEqual({
      kind: "ok",
      hashedToken: "hashed:reader@x.com",
      next: "/pulse",
    });
    expect(rows).toHaveLength(0);
  });

  it("lets exactly one of two posts of the same link mint a session", async () => {
    link("tok");
    reached = { userId: "u1", primaryEmail: "reader@x.com" };

    const [first, second] = await Promise.all([
      consumeEmailLogin("tok"),
      consumeEmailLogin("tok"),
    ]);

    const kinds = [first.kind, second.kind].sort();
    expect(kinds).toEqual(["fail", "ok"]);
  });

  it("makes the account on the first press when the address has none", async () => {
    link("tok", "new@x.com");

    const spent = await consumeEmailLogin("tok");

    expect(spent).toEqual({
      kind: "ok",
      hashedToken: "hashed:new@x.com",
      next: "/pulse",
    });
    expect(minted).toEqual(["new@x.com"]);
  });
});
