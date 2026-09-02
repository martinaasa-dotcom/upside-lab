import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashLinkToken } from "@/lib/auth/account-addresses";

/*
  The addresses that reach one account, against a table rather than a stub of
  the function under test.

  Three of the four things checked here are only visible with real rows: a
  pending confirmation belonging to somebody else, two posts of one link
  arriving together, and the difference between an address that has an account
  and one that has never been near this product. The last of those is the whole
  finding: an address nobody has ever signed up with used to be bound to
  whoever asked for it, on the strength of one branded letter, and from then on
  its owner's first Google sign-in landed in that person's account.
*/

type Row = {
  id: string;
  user_id: string;
  email: string;
  token_hash: string | null;
  token_expires_at: string | null;
  verified_at: string | null;
  created_at: string;
};

let rows: Row[] = [];
/** auth.users, as much of it as this file needs. */
let authUsers = new Map<string, string>();
/** What `portfell_account_for_login_email` answers. */
let loginAccounts = new Map<string, string>();
let neverUsed = new Set<string>();
let deletedUsers: string[] = [];
let sent: Array<{ to: string; subject: string; text: string }> = [];
let taken: string[] = [];
/** Keys the rate limiter should refuse next time they are asked for. */
let refuse = new Set<string>();

let nextId = 1;

type Filter = (row: Row) => boolean;

function builder(op: "select" | "insert" | "update" | "delete", payload?: Partial<Row>) {
  const filters: Filter[] = [];
  let single = false;
  let head = false;
  let read = false;

  function run() {
    const hits = rows.filter((row) => filters.every((f) => f(row)));

    if (op === "select") {
      if (head) return { data: null, count: hits.length, error: null };
      if (single) return { data: hits[0] ?? null, error: null };
      return { data: hits, error: null };
    }

    if (op === "delete") {
      rows = rows.filter((row) => !hits.includes(row));
      return { data: read ? hits : null, error: null };
    }

    if (op === "update") {
      for (const row of hits) Object.assign(row, payload);
      return { data: read ? hits : null, error: null };
    }

    // The unique index on the address, which is what makes two accounts
    // racing for one mailbox end with exactly one row.
    if (rows.some((row) => row.email === payload?.email)) {
      return { data: null, error: { code: "23505", message: "duplicate" } };
    }

    const blank = {
      token_hash: null,
      token_expires_at: null,
      verified_at: null,
    };

    rows.push({
      ...blank,
      ...(payload as Row),
      id: `row-${nextId++}`,
      created_at: new Date().toISOString(),
    });
    return { data: null, error: null };
  }

  const q = {
    select(_cols?: string, opts?: { count?: string; head?: boolean }) {
      read = true;
      if (opts?.head) head = true;
      return q;
    },
    eq(col: keyof Row, value: unknown) {
      filters.push((row) => row[col] === value);
      return q;
    },
    neq(col: keyof Row, value: unknown) {
      filters.push((row) => row[col] !== value);
      return q;
    },
    is(col: keyof Row, value: unknown) {
      filters.push((row) => row[col] === value);
      return q;
    },
    not(col: keyof Row) {
      filters.push((row) => row[col] != null);
      return q;
    },
    lt(col: keyof Row, value: string) {
      filters.push((row) => row[col] != null && String(row[col]) < value);
      return q;
    },
    order() {
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
      select: (cols?: string, opts?: { count?: string; head?: boolean }) =>
        builder("select").select(cols, opts),
      insert: (payload: Partial<Row>) => builder("insert", payload),
      update: (payload: Partial<Row>) => builder("update", payload),
      delete: () => builder("delete"),
    }),
    rpc: async (name: string, args: Record<string, string>) => {
      if (name === "portfell_account_for_login_email") {
        return { data: loginAccounts.get(args.p_email) ?? null, error: null };
      }
      if (name === "portfell_account_never_used") {
        return { data: neverUsed.has(args.p_user), error: null };
      }
      return { data: null, error: null };
    },
    auth: {
      admin: {
        async getUserById(id: string) {
          const email = authUsers.get(id);
          return email
            ? { data: { user: { id, email } }, error: null }
            : { data: { user: null }, error: { message: "no user" } };
        },
        async deleteUser(id: string) {
          deletedUsers.push(id);
          authUsers.delete(id);
          return { error: null };
        },
        async generateLink() {
          return { data: { properties: { hashed_token: "hashed" } }, error: null };
        },
      },
    },
  }),
}));

vi.mock("@/lib/send-note", () => ({
  noteEmailConfigured: () => true,
  sendNoteEmail: async (mail: { to: string; subject: string; text: string }) => {
    sent.push(mail);
    return true;
  },
}));

vi.mock("@/lib/rate-limit-durable", () => ({
  takeDurableRateLimit: async (key: string) => {
    taken.push(key);
    if (refuse.has(key)) return { ok: false, retryAfterSec: 60 };
    return { ok: true };
  },
}));

const {
  confirmAddressLink,
  pendingAddressLink,
  startAddressLink,
} = await import("@/lib/auth/linked-addresses");

const ME = "user-me";
const OTHER = "user-other";
const MY_EMAIL = "martin@upthink.ee";

function pending(email: string, account: string, token: string, hours = 1): Row {
  const row: Row = {
    id: `row-${nextId++}`,
    user_id: account,
    email,
    token_hash: hashLinkToken(token),
    token_expires_at: new Date(Date.now() + hours * 3600_000).toISOString(),
    verified_at: null,
    created_at: new Date().toISOString(),
  };
  rows.push(row);
  return row;
}

function start(email: string, userId = ME) {
  return startAddressLink({ userId, primaryEmail: MY_EMAIL, email });
}

beforeEach(() => {
  rows = [];
  authUsers = new Map([
    [ME, MY_EMAIL],
    [OTHER, "someone@else.com"],
  ]);
  loginAccounts = new Map();
  neverUsed = new Set();
  deletedUsers = [];
  sent = [];
  taken = [];
  refuse = new Set();
  nextId = 1;
});

describe("asking for an address", () => {
  it("writes it down as pending and mails the link", async () => {
    const result = await start("second@x.com");

    expect(result).toEqual({ kind: "sent", email: "second@x.com", closes: false });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.verified_at).toBeNull();
    expect(sent.map((m) => m.to)).toEqual(["second@x.com"]);
  });

  it("takes an unconfirmed request off another account rather than being blocked by it", async () => {
    // A pending row reaches no account and opens nothing, so the first person
    // to type a stranger's address must not be able to keep everybody else
    // off it by asking again every hour.
    pending("second@x.com", OTHER, "their-token");

    const result = await start("second@x.com");

    expect(result.kind).toBe("sent");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBe(ME);
  });

  it("makes one account wait before asking for the same address again", async () => {
    refuse.add(`address-link-pair:${ME}:second@x.com`);

    const result = await start("second@x.com");

    expect(result).toEqual({ kind: "error", code: "slow-down" });
    expect(sent).toHaveLength(0);
    // And it stopped before touching a row somebody may already be holding.
    expect(rows).toHaveLength(0);
  });

  it("stops at a few letters a day to one address, whoever is asking", async () => {
    refuse.add("address-link-to:second@x.com");

    const result = await start("second@x.com");

    expect(result).toEqual({ kind: "error", code: "slow-down" });
    expect(sent).toHaveLength(0);
  });

  it("answers an address that already has an account exactly like a free one", async () => {
    loginAccounts.set("taken@x.com", OTHER);

    const result = await start("taken@x.com");

    // Nothing about the address comes back to the person who typed it, or the
    // field is a way of asking whether strangers have accounts here.
    expect(result).toEqual({ kind: "quiet" });
    expect(rows).toHaveLength(0);
  });

  it("says so in the one place it is news, which is that mailbox", async () => {
    loginAccounts.set("taken@x.com", OTHER);

    await start("taken@x.com");

    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("taken@x.com");
    expect(sent[0]!.text).toMatch(/not connected/i);
    expect(sent[0]!.text).toContain(MY_EMAIL);
  });

  it("counts a refusal letter against the same daily total as a confirmation", async () => {
    loginAccounts.set("taken@x.com", OTHER);

    await start("taken@x.com");

    expect(taken).toContain("address-link-to:taken@x.com");
  });

  it("still tells the caller the truth about their own address", async () => {
    const result = await start(MY_EMAIL);
    expect(result).toEqual({ kind: "already" });
    expect(sent).toHaveLength(0);
  });
});

describe("confirming the link", () => {
  it("refuses an address with no account here unless the asking account is signed in", async () => {
    /*
      The finding. Nobody at this address has ever signed up, so nothing ever
      warned them and nothing ever will: bound here, their first Google
      sign-in would land in whoever asked for it.
    */
    pending("stranger@x.com", ME, "tok");

    const result = await confirmAddressLink("tok", { signedInUserId: null });

    expect(result).toEqual({ kind: "fail", reason: "sign-in-first" });
    // And the link still works, so they can sign in and press it again.
    expect(rows[0]!.verified_at).toBeNull();
    expect(rows[0]!.token_hash).not.toBeNull();
  });

  it("refuses it just as firmly for a browser signed in to somebody else", async () => {
    pending("stranger@x.com", ME, "tok");

    const result = await confirmAddressLink("tok", { signedInUserId: OTHER });

    expect(result).toEqual({ kind: "fail", reason: "sign-in-first" });
  });

  it("connects it once the asking account is the one pressing the button", async () => {
    pending("stranger@x.com", ME, "tok");

    const result = await confirmAddressLink("tok", { signedInUserId: ME });

    expect(result).toEqual({ kind: "linked", email: "stranger@x.com" });
    expect(rows[0]!.verified_at).not.toBeNull();
    expect(rows[0]!.token_hash).toBeNull();
  });

  it("needs no session when the address has an account of its own to speak for it", async () => {
    // Holding the mailbox is the whole proof here, and the link may well be
    // read on a phone that has never been signed in to this app.
    pending("second@x.com", ME, "tok");
    loginAccounts.set("second@x.com", OTHER);
    neverUsed.add(OTHER);

    const result = await confirmAddressLink("tok", { signedInUserId: null });

    expect(result).toEqual({ kind: "linked", email: "second@x.com" });
    expect(deletedUsers).toEqual([OTHER]);
  });

  it("refuses an address whose account has things in it", async () => {
    pending("second@x.com", ME, "tok");
    loginAccounts.set("second@x.com", OTHER);

    const result = await confirmAddressLink("tok", { signedInUserId: null });

    expect(result).toEqual({ kind: "fail", reason: "address-taken" });
    expect(deletedUsers).toEqual([]);
  });

  it("tells the account's own address that a second one now opens it", async () => {
    pending("stranger@x.com", ME, "tok");

    await confirmAddressLink("tok", { signedInUserId: ME });

    const note = sent.find((m) => m.to === MY_EMAIL);
    expect(note).toBeTruthy();
    expect(note!.text).toContain("stranger@x.com");
    expect(note!.text).toMatch(/if that was not you/i);
  });

  it("lets exactly one of two posts of the same link do the work", async () => {
    pending("stranger@x.com", ME, "tok");

    const [first, second] = await Promise.all([
      confirmAddressLink("tok", { signedInUserId: ME }),
      confirmAddressLink("tok", { signedInUserId: ME }),
    ]);

    const kinds = [first.kind, second.kind].sort();
    expect(kinds).toEqual(["fail", "linked"]);
    expect(rows).toHaveLength(1);
  });

  it("has nothing to say about an expired link", async () => {
    pending("stranger@x.com", ME, "tok", -1);

    expect(await confirmAddressLink("tok", { signedInUserId: ME })).toEqual({
      kind: "fail",
      reason: "expired",
    });
  });
});

describe("reading the link without spending it", () => {
  it("names the account it would open, with the mailbox masked", async () => {
    pending("second@x.com", ME, "tok");

    const found = await pendingAddressLink("tok");

    expect(found).toEqual({
      email: "second@x.com",
      maskedPrimary: "ma...@upthink.ee",
      account: ME,
    });
    expect(rows[0]!.verified_at).toBeNull();
  });

  it("knows nothing about a token that has been spent", async () => {
    pending("second@x.com", ME, "tok");
    await confirmAddressLink("tok", { signedInUserId: ME });

    expect(await pendingAddressLink("tok")).toBeNull();
  });
});
