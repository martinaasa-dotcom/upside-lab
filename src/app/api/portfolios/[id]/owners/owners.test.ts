/**
 * Who can take whom off a portfolio.
 *
 * This route runs on the service role, so nothing in the database stands
 * between a co-owner and the owners table: the rule is whatever the handler
 * checks. It used to check only that the caller was a co-owner, and then
 * delete whichever userId it was handed, so somebody who redeemed an invite
 * could remove the person who invited them and be left the only owner of a
 * portfolio they did not make. Migration 20260824130000 closed the direct
 * PostgREST path and said nothing in src/ deletes from this table, which
 * was false: this file does.
 *
 * The rule now: leaving is always allowed, removing somebody else is the
 * creator's alone, and the creator is never removed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  fakeDataClient,
  type FakeDataClient,
  type FakeRow,
} from "@/lib/supabase/fake-data-client";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

const CREATOR = "aaaa0000-0000-0000-0000-000000000001";
const PARTNER = "bbbb0000-0000-0000-0000-000000000002";
const THIRD = "cccc0000-0000-0000-0000-000000000003";
const PORTFOLIO = "pppp0000-0000-0000-0000-0000000000p1";

let caller = CREATOR;
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

import { DELETE, GET } from "@/app/api/portfolios/[id]/owners/route";

function ctx() {
  return { params: Promise.resolve({ id: PORTFOLIO }) };
}

async function remove(userId: string): Promise<Response> {
  const req = new NextRequest(
    `https://upsidelab.app/api/portfolios/${PORTFOLIO}/owners?userId=${userId}`,
    { method: "DELETE" }
  );
  return (await DELETE(req, ctx())) as Response;
}

function ownersLeft(): string[] {
  return tables[PORTFELL_TABLES.portfolioOwners]
    .map((r) => r.user_id as string)
    .sort();
}

beforeEach(() => {
  caller = CREATOR;
  tables = {
    [PORTFELL_TABLES.portfolios]: [
      { id: PORTFOLIO, name: "Savings", owner_id: CREATOR },
    ],
    [PORTFELL_TABLES.portfolioOwners]: [
      { portfolio_id: PORTFOLIO, user_id: CREATOR, created_at: "2026-01-01" },
      { portfolio_id: PORTFOLIO, user_id: PARTNER, created_at: "2026-02-01" },
      { portfolio_id: PORTFOLIO, user_id: THIRD, created_at: "2026-03-01" },
    ],
    [PORTFELL_TABLES.profiles]: [],
  };
  client = fakeDataClient(tables);
});

describe("DELETE /api/portfolios/[id]/owners", () => {
  it("a co-owner cannot remove the person who made the portfolio", async () => {
    caller = PARTNER;
    const res = await remove(CREATOR);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/made this portfolio stays on it/);
    expect(ownersLeft()).toEqual([CREATOR, PARTNER, THIRD].sort());
    expect(client.writes).toEqual([]);
  });

  it("a co-owner cannot remove another co-owner", async () => {
    caller = PARTNER;
    const res = await remove(THIRD);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Only the person who made this portfolio/);
    expect(ownersLeft()).toEqual([CREATOR, PARTNER, THIRD].sort());
  });

  it("a co-owner can leave", async () => {
    caller = PARTNER;
    const res = await remove(PARTNER);
    expect(res.status).toBe(200);
    expect(ownersLeft()).toEqual([CREATOR, THIRD].sort());
  });

  it("the creator can remove a co-owner", async () => {
    const res = await remove(THIRD);
    expect(res.status).toBe(200);
    expect(ownersLeft()).toEqual([CREATOR, PARTNER].sort());
  });

  it("the creator is not removed even by themselves", async () => {
    const res = await remove(CREATOR);
    expect(res.status).toBe(403);
    expect(ownersLeft()).toEqual([CREATOR, PARTNER, THIRD].sort());
  });

  it("a stranger is refused before any of this", async () => {
    caller = "dddd0000-0000-0000-0000-000000000004";
    const res = await remove(PARTNER);
    expect(res.status).toBe(403);
    expect(ownersLeft()).toEqual([CREATOR, PARTNER, THIRD].sort());
  });

  it("a seed row with no owner_id treats its first claimant as the creator", async () => {
    tables[PORTFELL_TABLES.portfolios][0].owner_id = null;
    caller = PARTNER;
    const refused = await remove(CREATOR);
    expect(refused.status).toBe(403);
    caller = CREATOR;
    const allowed = await remove(PARTNER);
    expect(allowed.status).toBe(200);
    expect(ownersLeft()).toEqual([CREATOR, THIRD].sort());
  });

  it("never orphans a portfolio", async () => {
    tables[PORTFELL_TABLES.portfolioOwners] = [
      { portfolio_id: PORTFOLIO, user_id: PARTNER, created_at: "2026-02-01" },
    ];
    tables[PORTFELL_TABLES.portfolios][0].owner_id = null;
    caller = PARTNER;
    // The lone owner is the creator by fallback, so this is refused on
    // that ground; the last-owner guard stands behind it either way.
    const res = await remove(PARTNER);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(ownersLeft()).toEqual([PARTNER]);
  });

  it("says nothing plain-English readers cannot follow", async () => {
    caller = PARTNER;
    for (const target of [CREATOR, THIRD]) {
      const body = (await (await remove(target)).json()) as { error: string };
      expect(body.error).not.toMatch(/[–—]/);
      expect(body.error).not.toMatch(/owner_id|user_id|portfell/);
    }
  });
});

describe("GET /api/portfolios/[id]/owners", () => {
  it("names the creator so the modal draws the remove button only where a press would succeed", async () => {
    caller = PARTNER;
    const res = (await GET(
      new NextRequest(`https://upsidelab.app/api/portfolios/${PORTFOLIO}/owners`),
      ctx()
    )) as Response;
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      creatorId: string | null;
      owners: { user_id: string }[];
    };
    expect(body.creatorId).toBe(CREATOR);
    expect(body.owners.map((o) => o.user_id).sort()).toEqual(
      [CREATOR, PARTNER, THIRD].sort()
    );
  });
});
