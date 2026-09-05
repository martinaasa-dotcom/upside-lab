/**
 * A public circle lets people in; a private one still does not exist.
 *
 * This route runs on the service role, so the database is not standing
 * between a stranger and the members table: the rule is whatever the
 * handler checks. Three things it has to keep straight, and each of them
 * costs somebody their portfolios being read by a stranger if it slips:
 * the circle's own setting decides whether asking is joining, a circle
 * that is not public never reaches that setting at all, and nobody is
 * ever admitted who did not ask.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  fakeDataClient,
  type FakeDataClient,
  type FakeRow,
} from "@/lib/supabase/fake-data-client";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

const OPEN = "cccc0000-0000-0000-0000-0000000000c1";
const VETTED = "cccc0000-0000-0000-0000-0000000000c2";
const SECRET = "cccc0000-0000-0000-0000-0000000000c3";
const ASKER = "aaaa0000-0000-0000-0000-000000000001";

let caller = ASKER;
let client: FakeDataClient;
let tables: Record<string, FakeRow[]>;

vi.mock("@/lib/supabase/server-auth", () => ({
  requireAuthUser: async () => ({ user: { id: caller } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseDataClient: async () => client,
  getSupabaseServer: () => client,
  supabaseUsesServiceRole: () => true,
}));
vi.mock("@/lib/observe-route", () => ({
  observeRoute: (h: unknown) => h,
}));
vi.mock("@/lib/classroom", () => ({
  provisionClassroomSheet: async () => undefined,
}));
vi.mock("@/lib/community-share", () => ({
  parseSharePortfolioIds: (ids: unknown) => (Array.isArray(ids) ? ids : null),
  shareOwnedSheetsIntoCommunity: async () => undefined,
}));

import { POST } from "@/app/api/communities/[id]/join-request/route";

async function ask(communityId: string): Promise<Response> {
  const req = new NextRequest(
    `https://upsidelab.app/api/communities/${communityId}/join-request`,
    { method: "POST", body: JSON.stringify({}) }
  );
  return (await POST(req, {
    params: Promise.resolve({ id: communityId }),
  })) as Response;
}

const membersOf = (id: string) =>
  tables[PORTFELL_TABLES.communityMembers]
    .filter((r) => r.community_id === id)
    .map((r) => r.user_id as string);

const requestFor = (id: string) =>
  tables[PORTFELL_TABLES.communityJoinRequests].find(
    (r) => r.community_id === id && r.user_id === ASKER
  );

beforeEach(() => {
  caller = ASKER;
  tables = {
    [PORTFELL_TABLES.communities]: [
      { id: OPEN, name: "Upside Circle", visibility: "public", auto_approve_joins: true },
      { id: VETTED, name: "Vetted", visibility: "public", auto_approve_joins: false },
      { id: SECRET, name: "Family", visibility: "private", auto_approve_joins: true },
    ],
    [PORTFELL_TABLES.communityMembers]: [],
    [PORTFELL_TABLES.communityJoinRequests]: [],
  };
  client = fakeDataClient(tables);
});

describe("POST /api/communities/[id]/join-request", () => {
  it("a public circle that lets people in admits them on the spot", async () => {
    const res = await ask(OPEN);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ joined: true });
    expect(membersOf(OPEN)).toEqual([ASKER]);
    expect(requestFor(OPEN)?.status).toBe("approved");
  });

  it("a public circle whose admin asked to be asked keeps them waiting", async () => {
    const res = await ask(VETTED);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ joined: false });
    expect(membersOf(VETTED)).toEqual([]);
    expect(requestFor(VETTED)?.status).toBe("pending");
  });

  it("a private circle never reads the setting at all", async () => {
    const res = await ask(SECRET);
    expect(res.status).toBe(403);
    expect(membersOf(SECRET)).toEqual([]);
    expect(tables[PORTFELL_TABLES.communityJoinRequests]).toEqual([]);
  });

  it("admits only the person who asked", async () => {
    await ask(OPEN);
    expect(membersOf(OPEN)).toEqual([ASKER]);
    expect(
      tables[PORTFELL_TABLES.communityMembers].every(
        (r) => r.user_id === ASKER
      )
    ).toBe(true);
  });
});
