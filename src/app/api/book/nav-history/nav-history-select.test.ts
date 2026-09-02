/**
 * The chart asks for the one path it reads, not the whole night.
 *
 * A nightly snapshot payload is every portfolio and every holding in the
 * product. This route wants a handful of numbers out of it, under
 * marks.navByPortfolio, for the caller's own portfolios only. It used to
 * select the whole `payload` column for fourteen nights and throw almost all
 * of it away in Node, and BookNavChart posts this on every Home open, so the
 * cost grew with the product rather than with the reader.
 *
 * The client below records every select string it is handed, because the
 * saving is entirely in what was asked for: a route that reads the right
 * field out of the wrong response looks exactly the same from the outside.
 * The response shape is asserted beside it, since narrowing a select is only
 * worth anything if the answer is unchanged.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

const selects: { table: string; select: string }[] = [];

/** Rows the fake snapshots table hands back, set per test. */
let snapshotRows: Record<string, unknown>[] = [];

function builder(table: string) {
  const rows = () =>
    table === PORTFELL_TABLES.portfolios
      ? [{ id: "p1", classroom_community_id: null }]
      : snapshotRows;
  const chain: Record<string, unknown> = {
    select: (columns: string) => {
      selects.push({ table, select: columns });
      return chain;
    },
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
      Promise.resolve({ data: rows(), error: null }).then(resolve),
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseDataClient: async () => ({ from: (table: string) => builder(table) }),
}));

vi.mock("@/lib/supabase/server-auth", () => ({
  requireAuthUser: async () => ({ user: { id: "u1" } }),
}));

vi.mock("@/lib/auth/ownership", () => ({
  listOwnedPortfolioIds: async () => ["p1"],
}));

vi.mock("@/lib/market/yahoo", () => ({
  fetchYtdDailyCloses: async () => ({}),
}));

const { GET, POST } = await import("./route");

/** One night, with the marks nested exactly as PostgREST returns an object. */
function night(date: string, nav: number, key = "navByPortfolio") {
  return { created_at: `${date}T02:00:00.000Z`, [key]: { p1: nav, other: 999 } };
}

beforeEach(() => {
  selects.length = 0;
  // Newest first, which is the order the real query asks for.
  snapshotRows = [night("2026-09-01", 110), night("2026-08-31", 100)];
});

describe("nav history reads one json path, not the whole night", () => {
  it("selects the marks path and never the whole payload", async () => {
    await GET();
    const snapshot = selects.find(
      (s) => s.table === PORTFELL_TABLES.snapshots
    );
    expect(snapshot?.select).toBe(
      "created_at, navByPortfolio:payload->marks->navByPortfolio"
    );
    // The column on its own would carry every portfolio and every holding
    // in the product, which is the whole point of the narrowing.
    expect(snapshot?.select).not.toMatch(/(^|[\s,])payload(\s*[,)]|$)/);
  });

  it("answers the same shape it always did", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    // Newest row is selected first and reversed for the chart, so the
    // oldest night leads and firstRealDate names it.
    await expect(res.json()).resolves.toEqual({
      points: [
        { date: "2026-08-31", nav: 100 },
        { date: "2026-09-01", nav: 110 },
      ],
      assumed: false,
      firstRealDate: "2026-08-31",
    });
  });

  it("reads the map whichever name the response gave it", async () => {
    // Older PostgREST names an arrow select after the whole expression
    // rather than after the last key. Reading the wrong one would not
    // raise: every row would be skipped and the chart would draw nothing.
    snapshotRows = [
      night("2026-09-01", 110, "payload->marks->navByPortfolio"),
    ];
    const body = await (await GET()).json();
    expect(body.points).toEqual([{ date: "2026-09-01", nav: 110 }]);
  });

  it("passes over a night that has no marks", async () => {
    // A snapshot written before marks existed walks the arrow path to null
    // rather than failing, so null here is an ordinary older night.
    snapshotRows = [
      night("2026-09-01", 110),
      { created_at: "2026-08-30T02:00:00.000Z", navByPortfolio: null },
    ];
    const body = await (await GET()).json();
    expect(body.points).toEqual([{ date: "2026-09-01", nav: 110 }]);
    expect(body.firstRealDate).toBe("2026-09-01");
  });

  it("narrows the same read on the post the chart actually makes", async () => {
    const req = new Request("https://example.test/api/book/nav-history", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assumed: false, portfolioIds: ["p1"] }),
    });
    const res = await POST(req);
    const snapshot = selects.find(
      (s) => s.table === PORTFELL_TABLES.snapshots
    );
    expect(snapshot?.select).toBe(
      "created_at, navByPortfolio:payload->marks->navByPortfolio"
    );
    await expect(res.json()).resolves.toEqual({
      points: [
        { date: "2026-08-31", nav: 100 },
        { date: "2026-09-01", nav: 110 },
      ],
      assumed: false,
      firstRealDate: "2026-08-31",
    });
  });
});
