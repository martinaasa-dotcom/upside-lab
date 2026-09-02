/**
 * A class portfolio stays in its class.
 *
 * The route refused a real portfolio pinned into a class, and only checked
 * the class rule when the target was a class. So a student could pin the
 * class's paper portfolio into an ordinary circle, where every member would
 * read homework as somebody's real holdings. The insert policy in migration
 * 20260902120000 says the same thing to a direct PostgREST call;
 * `supabase/tests/class-portfolio-stays-in-class.test.sql` proves that one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  fakeDataClient,
  type FakeDataClient,
  type FakeRow,
} from "@/lib/supabase/fake-data-client";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

const ANN = "aaaa0000-0000-0000-0000-000000000001";
const CLASS = "cccc0000-0000-0000-0000-0000000000c1";
const CIRCLE = "cccc0000-0000-0000-0000-0000000000c2";
const HOMEWORK = "pppp0000-0000-0000-0000-0000000000p1";
const SAVINGS = "pppp0000-0000-0000-0000-0000000000p2";

let client: FakeDataClient;
let tables: Record<string, FakeRow[]>;

vi.mock("@/lib/supabase/server-auth", () => ({
  requireAuthUser: async () => ({ user: { id: ANN } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseDataClient: async () => client,
  getSupabaseServer: () => client,
  supabaseUsesServiceRole: () => true,
}));
vi.mock("@/lib/observe-route", () => ({
  observeRoute: (h: unknown) => h,
}));

import { POST } from "@/app/api/communities/[id]/sheets/route";

async function pin(
  communityId: string,
  portfolioId: string,
  shared = true
): Promise<Response> {
  const req = new NextRequest(
    `https://upsidelab.app/api/communities/${communityId}/sheets`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ portfolioId, shared }),
    }
  );
  return (await POST(req, {
    params: Promise.resolve({ id: communityId }),
  })) as Response;
}

function pinned(): [string, string][] {
  return tables[PORTFELL_TABLES.communityPortfolios].map((r) => [
    r.community_id as string,
    r.portfolio_id as string,
  ]);
}

beforeEach(() => {
  tables = {
    [PORTFELL_TABLES.communities]: [
      { id: CLASS, kind: "classroom" },
      { id: CIRCLE, kind: "circle" },
    ],
    [PORTFELL_TABLES.communityMembers]: [
      { community_id: CLASS, user_id: ANN, role: "member" },
      { community_id: CIRCLE, user_id: ANN, role: "member" },
    ],
    [PORTFELL_TABLES.portfolios]: [
      { id: HOMEWORK, name: "Ann homework", classroom_community_id: CLASS },
      { id: SAVINGS, name: "Ann savings", classroom_community_id: null },
    ],
    [PORTFELL_TABLES.portfolioOwners]: [
      { portfolio_id: HOMEWORK, user_id: ANN },
      { portfolio_id: SAVINGS, user_id: ANN },
    ],
    [PORTFELL_TABLES.communityPortfolios]: [],
  };
  client = fakeDataClient(tables);
});

describe("POST /api/communities/[id]/sheets", () => {
  it("refuses the class portfolio in an ordinary circle", async () => {
    const res = await pin(CIRCLE, HOMEWORK);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("A class portfolio stays in its class.");
    expect(pinned()).toEqual([]);
  });

  it("still lets the class portfolio into its own class", async () => {
    const res = await pin(CLASS, HOMEWORK);
    expect(res.status).toBe(200);
    expect(pinned()).toEqual([[CLASS, HOMEWORK]]);
  });

  it("still lets a real portfolio into a circle", async () => {
    const res = await pin(CIRCLE, SAVINGS);
    expect(res.status).toBe(200);
    expect(pinned()).toEqual([[CIRCLE, SAVINGS]]);
  });

  it("still refuses a real portfolio in a class", async () => {
    const res = await pin(CLASS, SAVINGS);
    expect(res.status).toBe(403);
    expect(pinned()).toEqual([]);
  });

  it("lets a class portfolio be taken out of a circle it should never have been in", async () => {
    tables[PORTFELL_TABLES.communityPortfolios].push({
      community_id: CIRCLE,
      portfolio_id: HOMEWORK,
    });
    const res = await pin(CIRCLE, HOMEWORK, false);
    expect(res.status).toBe(200);
    expect(pinned()).toEqual([]);
  });
});
