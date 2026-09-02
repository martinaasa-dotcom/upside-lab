/**
 * A circle invite link is a bearer credential: whoever holds it joins the
 * circle. It used to be stored twice, as a hash and as the raw token beside
 * it, so that an admin could be shown the link a second time. That made the
 * hash decorative, because a single read of the table handed out every live
 * link in it. Portfolio invites have never done that: they keep the hash and
 * show the link once.
 *
 * These tests hold the new shape. Nothing written to the table carries the
 * token, the link appears only in the response that made it, and an admin who
 * needs to share one again gets a fresh link that turns the old one off.
 *
 * The Supabase client here is a recording stand-in: every `from()` starts a
 * call, every method on the chain is recorded, and awaiting it answers, which
 * is how supabase-js behaves.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";
import { NextRequest } from "next/server";

const USER = { id: "11111111-1111-4111-8111-111111111111" };
const COMMUNITY = "22222222-2222-4222-8222-222222222222";
const INVITE = "33333333-3333-4333-8333-333333333333";

type Call = {
  table: string;
  ops: string[];
  /** The row handed to `insert()` or `update()`, when there was one. */
  written: Record<string, unknown> | null;
  /** Column list handed to `select()`, when there was one. */
  selected: string | null;
};

let calls: Call[] = [];
/** What the existing invite row reads back as, or null for "not found". */
let existingInvite: Record<string, unknown> | null = null;

function answer(call: Call): { data: unknown; error: null } {
  if (call.ops.includes("insert")) {
    return { data: { id: "new-invite", ...(call.written ?? {}) }, error: null };
  }
  switch (call.table) {
    case "portfell_community_invites":
      return { data: existingInvite, error: null };
    case "portfell_communities":
      return { data: { name: "Family", kind: "community" }, error: null };
    default:
      return { data: [], error: null };
  }
}

function builder(table: string) {
  const call: Call = { table, ops: [], written: null, selected: null };
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
          if (prop === "insert" || prop === "update") {
            call.written = args[0] as Record<string, unknown>;
          }
          if (prop === "select" && typeof args[0] === "string") {
            call.selected = args[0];
          }
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
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseDataClient: async () => client,
}));
vi.mock("@/lib/auth/ownership", () => ({
  userIsCommunityAdmin: async () => true,
}));
vi.mock("@/lib/send-note", () => ({
  noteEmailConfigured: () => false,
  sendNoteEmail: async () => true,
}));
vi.mock("@/lib/telemetry", () => ({
  logEvent: () => {},
  routeMeta: () => ({}),
  SLOW_ROUTE_MS: 1000,
}));
vi.mock("@/lib/observe-route", () => ({
  observeRoute: (h: (...args: unknown[]) => unknown) => h,
}));

import {
  GET as LIST_INVITES,
  POST as CREATE_INVITE,
} from "@/app/api/communities/[id]/invites/route";
import { POST as RENEW_INVITE } from "@/app/api/communities/[id]/invites/[inviteId]/route";

const ctx = { params: Promise.resolve({ id: COMMUNITY }) };
const inviteCtx = {
  params: Promise.resolve({ id: COMMUNITY, inviteId: INVITE }),
};

function createInvite(body: Record<string, unknown> = {}): Promise<Response> {
  return CREATE_INVITE(
    new NextRequest(`https://upsidelab.app/api/communities/${COMMUNITY}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    ctx
  ) as Promise<Response>;
}

function writesTo(table: string): Call[] {
  return calls.filter((c) => c.table === table && c.written !== null);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

beforeEach(() => {
  calls = [];
  existingInvite = {
    id: INVITE,
    email: "ada@example.com",
    role: "member",
    expires_at: null,
    revoked_at: null,
  };
});

describe("POST /api/communities/[id]/invites", () => {
  it("stores the hash of the token and never the token", async () => {
    const res = await createInvite();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; path: string };

    const written = writesTo("portfell_community_invites");
    expect(written).toHaveLength(1);
    const row = written[0].written as Record<string, unknown>;
    // The regression this guards: `token: token` sitting beside the hash,
    // which is a live credential anybody who can read the table can spend.
    expect(row).not.toHaveProperty("token");
    expect(Object.values(row)).not.toContain(body.token);
    expect(row.token_hash).toBe(sha256(body.token));
    // The hint is the tail of the token. Six characters tell two links
    // apart and cannot be guessed back into one.
    expect(row.token_hint).toBe(body.token.slice(-6));
  });

  it("hands the full link back once, in the response that made it", async () => {
    const res = await createInvite();
    const body = (await res.json()) as { token: string; path: string };

    expect(body.path).toBe(`/communities/join?token=${body.token}`);
  });
});

describe("GET /api/communities/[id]/invites", () => {
  it("does not ask the table for a token and offers no link", async () => {
    existingInvite = [] as unknown as Record<string, unknown>;

    const res = await LIST_INVITES(
      new NextRequest(
        `https://upsidelab.app/api/communities/${COMMUNITY}/invites`
      ),
      ctx
    );

    expect(res.status).toBe(200);
    const read = calls.find((c) => c.table === "portfell_community_invites");
    expect(read?.selected).toBeTruthy();
    expect(read?.selected?.split(/\s*,\s*/)).not.toContain("token");
  });
});

describe("POST /api/communities/[id]/invites/[inviteId]", () => {
  it("mints a new link, stores only its hash, and retires the old one", async () => {
    const res = await RENEW_INVITE(
      new NextRequest(
        `https://upsidelab.app/api/communities/${COMMUNITY}/invites/${INVITE}`,
        { method: "POST" }
      ),
      inviteCtx
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; path: string };

    const written = writesTo("portfell_community_invites");
    expect(written).toHaveLength(2);

    const [insert, revoke] = written;
    const row = insert.written as Record<string, unknown>;
    expect(insert.ops).toContain("insert");
    expect(row).not.toHaveProperty("token");
    expect(row.token_hash).toBe(sha256(body.token));
    // The new link keeps what the admin chose about the old one.
    expect(row.email).toBe("ada@example.com");
    expect(row.role).toBe("member");
    expect(row.expires_at).toBeNull();

    expect(revoke.ops).toContain("update");
    expect(revoke.written).toHaveProperty("revoked_at");
    expect(body.path).toBe(`/communities/join?token=${body.token}`);
  });

  it("leaves an already retired invite alone", async () => {
    existingInvite = {
      id: INVITE,
      email: null,
      role: "member",
      expires_at: null,
      revoked_at: "2026-01-01T00:00:00.000Z",
    };

    await RENEW_INVITE(
      new NextRequest(
        `https://upsidelab.app/api/communities/${COMMUNITY}/invites/${INVITE}`,
        { method: "POST" }
      ),
      inviteCtx
    );

    const written = writesTo("portfell_community_invites");
    expect(written).toHaveLength(1);
    expect(written[0].ops).toContain("insert");
  });

  it("says so when there is no such invite", async () => {
    existingInvite = null;

    const res = await RENEW_INVITE(
      new NextRequest(
        `https://upsidelab.app/api/communities/${COMMUNITY}/invites/${INVITE}`,
        { method: "POST" }
      ),
      inviteCtx
    );

    expect(res.status).toBe(404);
    expect(writesTo("portfell_community_invites")).toHaveLength(0);
  });
});
