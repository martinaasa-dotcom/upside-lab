/**
 * Deleting a portfolio is the creator's alone.
 *
 * Every co-owner can edit the holdings, which is what an invite is for.
 * The route used to let any of them delete the whole portfolio as well,
 * out from under the person who made it and everybody else on it. Leaving
 * is still open to a co-owner, through the owners route.
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
const PORTFOLIO = "pppp0000-0000-0000-0000-0000000000p1";

let caller = CREATOR;
let client: FakeDataClient;
let tables: Record<string, FakeRow[]>;
let backups = 0;

vi.mock("@/lib/supabase/server-auth", () => ({
  requireAuthUser: async () => ({ user: { id: caller } }),
  createSupabaseServerAuth: async () => null,
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseDataClient: async () => client,
  getSupabaseServer: () => client,
  supabaseUsesServiceRole: () => true,
}));
vi.mock("@/lib/observe-route", () => ({
  observeRoute: (h: unknown) => h,
}));
vi.mock("@/lib/book-snapshot", () => ({
  captureBookPayload: async () => ({ portfolios: [], holdings: [] }),
  saveBookSnapshot: async () => {
    backups += 1;
    return { id: "snap" };
  },
}));

import { DELETE } from "@/app/api/portfolios/route";

async function del(): Promise<Response> {
  const req = new NextRequest(
    `https://upsidelab.app/api/portfolios?id=${PORTFOLIO}`,
    { method: "DELETE" }
  );
  return (await DELETE(req)) as Response;
}

beforeEach(() => {
  caller = CREATOR;
  backups = 0;
  tables = {
    [PORTFELL_TABLES.portfolios]: [
      {
        id: PORTFOLIO,
        name: "Savings",
        owner_id: CREATOR,
        classroom_community_id: null,
      },
    ],
    [PORTFELL_TABLES.portfolioOwners]: [
      { portfolio_id: PORTFOLIO, user_id: CREATOR, created_at: "2026-01-01" },
      { portfolio_id: PORTFOLIO, user_id: PARTNER, created_at: "2026-02-01" },
    ],
  };
  client = fakeDataClient(tables);
});

describe("DELETE /api/portfolios", () => {
  it("a co-owner cannot delete a portfolio somebody else made", async () => {
    caller = PARTNER;
    const res = await del();
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Only the person who made this portfolio/);
    expect(body.error).not.toMatch(/[–—]/);
    expect(tables[PORTFELL_TABLES.portfolios]).toHaveLength(1);
    expect(backups).toBe(0);
  });

  it("the creator can, with the backup first", async () => {
    const res = await del();
    expect(res.status).toBe(200);
    expect(tables[PORTFELL_TABLES.portfolios]).toHaveLength(0);
    expect(backups).toBe(1);
  });

  it("a stranger is refused before the creator check", async () => {
    caller = "dddd0000-0000-0000-0000-000000000004";
    const res = await del();
    expect(res.status).toBe(403);
    expect(tables[PORTFELL_TABLES.portfolios]).toHaveLength(1);
  });
});
