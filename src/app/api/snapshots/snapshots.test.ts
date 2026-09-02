/**
 * A co-owner sees only the saves made of portfolios they are on.
 *
 * A save is one person's whole account and its label names a portfolio,
 * so listing every save that touched any portfolio the caller shares used
 * to hand a co-owner the names and ids of the other person's private
 * portfolios: "Before delete: Retirement" over a portfolio they had never
 * been told existed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fakeDataClient,
  type FakeDataClient,
  type FakeRow,
} from "@/lib/supabase/fake-data-client";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

const ANN = "aaaa0000-0000-0000-0000-000000000001";
const BOB = "bbbb0000-0000-0000-0000-000000000002";
const SHARED = "pppp0000-0000-0000-0000-0000000000p1";
const ANN_PRIVATE = "pppp0000-0000-0000-0000-0000000000p2";

let caller = BOB;
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

import { GET } from "@/app/api/snapshots/route";

beforeEach(() => {
  caller = BOB;
  tables = {
    [PORTFELL_TABLES.portfolioOwners]: [
      { portfolio_id: SHARED, user_id: ANN },
      { portfolio_id: SHARED, user_id: BOB },
      { portfolio_id: ANN_PRIVATE, user_id: ANN },
    ],
    [PORTFELL_TABLES.snapshots]: [
      {
        id: "s-shared",
        owner_id: ANN,
        kind: "pre_delete",
        label: "Before portfolio restore",
        created_at: "2026-09-01T00:00:00Z",
        payload: { portfolios: [{ id: SHARED }] },
      },
      {
        id: "s-ann-account",
        owner_id: ANN,
        kind: "manual",
        label: "Before delete: Retirement",
        created_at: "2026-08-31T00:00:00Z",
        payload: { portfolios: [{ id: SHARED }, { id: ANN_PRIVATE }] },
      },
      {
        id: "s-nightly",
        owner_id: null,
        kind: "nightly",
        label: "",
        created_at: "2026-08-30T00:00:00Z",
        payload: { portfolios: [{ id: SHARED }] },
      },
      {
        id: "s-empty",
        owner_id: BOB,
        kind: "manual",
        label: "Nothing in it",
        created_at: "2026-08-29T00:00:00Z",
        payload: { portfolios: [] },
      },
    ],
  };
  client = fakeDataClient(tables);
});

async function list(): Promise<{ id: string; label: string }[]> {
  const res = (await GET()) as Response;
  expect(res.status).toBe(200);
  const body = (await res.json()) as { snapshots: { id: string; label: string }[] };
  return body.snapshots;
}

describe("GET /api/snapshots", () => {
  it("lists a save made only of portfolios the caller is on", async () => {
    const ids = (await list()).map((s) => s.id);
    expect(ids).toContain("s-shared");
  });

  it("hides a save that carries somebody else's portfolio, label and all", async () => {
    const rows = await list();
    expect(rows.map((s) => s.id)).not.toContain("s-ann-account");
    expect(JSON.stringify(rows)).not.toContain("Retirement");
    expect(JSON.stringify(rows)).not.toContain(ANN_PRIVATE);
  });

  it("shows the whole-account save to the person whose account it is", async () => {
    caller = ANN;
    const ids = (await list()).map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["s-shared", "s-ann-account"]));
  });

  it("never lists a nightly save or an empty one", async () => {
    caller = ANN;
    const ids = (await list()).map((s) => s.id);
    expect(ids).not.toContain("s-nightly");
    expect(ids).not.toContain("s-empty");
  });
});
