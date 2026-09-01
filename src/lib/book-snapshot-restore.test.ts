/**
 * Putting one portfolio back from a save only ever copies the caller's own
 * sheet, whatever the sheets in that save are called.
 *
 * A nightly save carries every portfolio in the project. The matcher used to
 * fall back from id to slug to name across all of them, and the route never
 * asked whether the sheet it was about to apply was the caller's, so a
 * reader who had renamed their portfolio to a name somebody else was using
 * had that person's holdings and cash copied in over their own.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  matchSnapshotSheet,
  restoreSheetFromSnapshot,
  SNAPSHOT_NOT_THIS_PORTFOLIO,
  type BookSnapshotPayload,
} from "@/lib/book-snapshot";
import { DB_ERROR_MESSAGE } from "@/lib/db-error";

const CALLER = "user-me";

type Row = Record<string, unknown>;
type Write = { table: string; op: "update" | "delete" | "insert"; rows: Row[] };

type Db = {
  portfell_book_snapshots: Row[];
  portfell_portfolios: Row[];
  portfell_holdings: Row[];
};

/*
  The stranger's sheet is called what the caller's live portfolio is called
  now. Their own sheet is in the save under its id, with a different name,
  because the save was taken before the rename.
*/
const THEIRS = {
  id: "theirs",
  slug: "retirement",
  name: "Retirement",
  cash_balance: 250000,
  sort_order: 1,
};
const MINE_SAVED = {
  id: "mine",
  slug: "growth",
  name: "Growth",
  cash_balance: 1200,
  sort_order: 1,
};

const NIGHTLY: BookSnapshotPayload = {
  portfolios: [THEIRS, MINE_SAVED],
  holdings: [
    { portfolio_id: "theirs", ticker: "NVDA", shares: 900, buy_price: 120 },
    { portfolio_id: "mine", ticker: "NBIS", shares: 500, buy_price: 109.96 },
  ],
};

function freshDb(): Db {
  return {
    portfell_book_snapshots: [{ id: "nightly-1", payload: NIGHTLY }],
    portfell_portfolios: [
      // Renamed since the save, to the stranger's name and slug.
      { id: "mine", slug: "retirement", name: "Retirement", cash_balance: 0 },
      // Made after the save, so the save has no row for it at all.
      {
        id: "mine-new",
        slug: "retirement",
        name: "Retirement",
        cash_balance: 0,
      },
      { id: "theirs", slug: "retirement", name: "Retirement", cash_balance: 250000 },
    ],
    portfell_holdings: [
      { portfolio_id: "mine", ticker: "CRWV", shares: 1100, buy_price: 83.27 },
      { portfolio_id: "mine-new", ticker: "RKLB", shares: 200, buy_price: 68.65 },
      { portfolio_id: "theirs", ticker: "NVDA", shares: 900, buy_price: 120 },
    ],
  };
}

/**
 * Enough of a PostgREST client for a restore: filters on eq and in, pages
 * through range, and applies every write to the table so the test can read
 * the portfolio back afterwards. Every write is recorded.
 */
function fakeSupabase(
  db: Db,
  writes: Write[],
  opts: { snapshotReadError?: { message: string } } = {}
): SupabaseClient {
  function from(table: keyof Db) {
    let op: "select" | Write["op"] = "select";
    let payload: Row | Row[] = {};
    const eqs: [string, unknown][] = [];
    const ins: [string, unknown[]][] = [];

    const matches = (row: Row) =>
      eqs.every(([col, v]) => row[col] === v) &&
      ins.every(([col, vs]) => vs.includes(row[col]));

    const run = (): { data: Row[]; error: null } => {
      const rows = db[table];
      if (op === "select") return { data: rows.filter(matches), error: null };
      if (op === "update") {
        const hit = rows.filter(matches);
        for (const row of hit) Object.assign(row, payload);
        writes.push({ table, op, rows: hit });
        return { data: hit, error: null };
      }
      if (op === "delete") {
        const hit = rows.filter(matches);
        db[table] = rows.filter((r) => !matches(r));
        writes.push({ table, op, rows: hit });
        return { data: hit, error: null };
      }
      const inserted = (Array.isArray(payload) ? payload : [payload]).map(
        (r, i) => ({ id: `${table}-${rows.length + i}`, ...r })
      );
      db[table] = [...rows, ...inserted];
      writes.push({ table, op, rows: inserted });
      return { data: inserted, error: null };
    };

    const chain = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      not: () => chain,
      neq: () => chain,
      eq: (col: string, v: unknown) => {
        eqs.push([col, v]);
        return chain;
      },
      in: (col: string, vs: unknown[]) => {
        ins.push([col, vs]);
        return chain;
      },
      update: (p: Row) => {
        op = "update";
        payload = p;
        return chain;
      },
      delete: () => {
        op = "delete";
        return chain;
      },
      insert: (p: Row | Row[]) => {
        op = "insert";
        payload = p;
        return chain;
      },
      range: (a: number, b: number) => {
        const { data, error } = run();
        return Promise.resolve({ data: data.slice(a, b + 1), error });
      },
      maybeSingle: () => {
        if (
          table === "portfell_book_snapshots" &&
          op === "select" &&
          opts.snapshotReadError
        ) {
          return Promise.resolve({ data: null, error: opts.snapshotReadError });
        }
        const { data, error } = run();
        return Promise.resolve({ data: data[0] ?? null, error });
      },
      single: () => {
        const { data, error } = run();
        return Promise.resolve({ data: data[0] ?? null, error });
      },
      then: (
        resolve: (v: { data: Row[]; error: null }) => unknown,
        reject?: (e: unknown) => unknown
      ) => Promise.resolve(run()).then(resolve, reject),
    };
    return chain;
  }
  return { from } as unknown as SupabaseClient;
}

const holdingsOf = (db: Db, id: string) =>
  db.portfell_holdings
    .filter((h) => h.portfolio_id === id)
    .map((h) => h.ticker);

describe("matchSnapshotSheet", () => {
  it("never picks a sheet the caller does not own, whatever it is called", () => {
    // Live portfolio made after the save, carrying the stranger's slug and
    // name. The old matcher answered with the stranger's sheet here.
    const live = { id: "mine-new", slug: "retirement", name: "Retirement" };
    expect(matchSnapshotSheet(NIGHTLY, live, ["mine-new"])).toBeNull();
  });

  it("finds the caller's own sheet by id even when renamed since the save", () => {
    const live = { id: "mine", slug: "retirement", name: "Retirement" };
    expect(matchSnapshotSheet(NIGHTLY, live, ["mine"])).toEqual(MINE_SAVED);
  });

  it("matches nothing for a live portfolio the caller does not own", () => {
    const live = { id: "theirs", slug: "retirement", name: "Retirement" };
    expect(matchSnapshotSheet(NIGHTLY, live, ["mine"])).toBeNull();
  });

  it("keeps the slug and name fallback for the caller's own sheets only", () => {
    // Both sheets are theirs; the live one is not in the save by id, so the
    // fallback is allowed to find their other sheet by its slug.
    const live = { id: "mine-new", slug: "growth", name: "Growth" };
    expect(matchSnapshotSheet(NIGHTLY, live, ["mine", "mine-new"])).toEqual(
      MINE_SAVED
    );
    // With the stranger's slug it still finds nothing of theirs.
    const renamed = { id: "mine-new", slug: "retirement", name: "Retirement" };
    expect(
      matchSnapshotSheet(NIGHTLY, renamed, ["mine", "mine-new"])
    ).toBeNull();
  });
});

describe("restoreSheetFromSnapshot", () => {
  it("refuses somebody else's sheet and writes nothing", async () => {
    const db = freshDb();
    const writes: Write[] = [];
    const out = await restoreSheetFromSnapshot(
      fakeSupabase(db, writes),
      NIGHTLY,
      "mine-new",
      ["mine-new"]
    );

    expect(out).toEqual({
      ok: false,
      status: 403,
      error: SNAPSHOT_NOT_THIS_PORTFOLIO,
    });
    expect(writes).toEqual([]);
    expect(holdingsOf(db, "mine-new")).toEqual(["RKLB"]);
  });

  it("puts the caller's own sheet back", async () => {
    const db = freshDb();
    const writes: Write[] = [];
    const out = await restoreSheetFromSnapshot(
      fakeSupabase(db, writes),
      NIGHTLY,
      "mine",
      ["mine"]
    );

    expect(out).toEqual({ ok: true, counts: { holdings: 1, cash: 1200 } });
    expect(holdingsOf(db, "mine")).toEqual(["NBIS"]);
    expect(db.portfell_portfolios.find((p) => p.id === "mine")?.cash_balance).toBe(
      1200
    );
    // The stranger's row is untouched, and nothing of theirs came across.
    expect(holdingsOf(db, "theirs")).toEqual(["NVDA"]);
    expect(writes.every((w) => w.rows.every((r) => r.ticker !== "NVDA"))).toBe(
      true
    );
  });
});

/*
  The route, with its collaborators stood in for. What matters here is what
  happens before the safety copy is written: a refused restore must leave
  no trace, and a refusal is worded for the reader.
*/
let client: SupabaseClient;
let owned: string[] = [];

vi.mock("@/lib/supabase/server-auth", () => ({
  requireAuthUser: async () => ({ user: { id: CALLER } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseDataClient: async () => client,
  supabaseUsesServiceRole: () => true,
}));
vi.mock("@/lib/auth/ownership", () => ({
  listOwnedPortfolioIds: async () => owned,
}));
vi.mock("@/lib/classroom-guard", () => ({
  denyClassroomWrite: async () => null,
}));
vi.mock("@/lib/observe-route", () => ({
  observeRoute: (h: (req: Request) => Promise<Response>) => h,
}));

import { POST } from "@/app/api/snapshots/route";

function post(body: Record<string, unknown>): Promise<Response> {
  return POST(
    new Request("https://upsidelab.app/api/snapshots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as NextRequest
  );
}

describe("POST /api/snapshots restore_sheet", () => {
  let db: Db;
  let writes: Write[];

  beforeEach(() => {
    db = freshDb();
    writes = [];
    client = fakeSupabase(db, writes);
  });

  it("refuses a save that holds none of the caller's copy of that portfolio", async () => {
    owned = ["mine-new"];

    const res = await post({
      action: "restore_sheet",
      snapshotId: "nightly-1",
      portfolioId: "mine-new",
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: SNAPSHOT_NOT_THIS_PORTFOLIO });
    // Not even the safety copy: nothing was written anywhere.
    expect(writes).toEqual([]);
    expect(holdingsOf(db, "mine-new")).toEqual(["RKLB"]);
  });

  it("refuses a target portfolio the caller does not own", async () => {
    owned = ["mine"];

    const res = await post({
      action: "restore_sheet",
      snapshotId: "nightly-1",
      portfolioId: "theirs",
    });

    expect(res.status).toBe(403);
    expect(writes).toEqual([]);
    expect(holdingsOf(db, "theirs")).toEqual(["NVDA"]);
  });

  it("still puts the caller's own portfolio back, after a safety copy", async () => {
    owned = ["mine"];

    const res = await post({
      action: "restore_sheet",
      snapshotId: "nightly-1",
      portfolioId: "mine",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      restoredSheet: { holdings: 1, cash: 1200 },
    });
    expect(holdingsOf(db, "mine")).toEqual(["NBIS"]);

    const safety = writes.find(
      (w) => w.table === "portfell_book_snapshots" && w.op === "insert"
    );
    expect(safety?.rows[0]?.kind).toBe("pre_delete");
    const copied = safety?.rows[0]?.payload as BookSnapshotPayload;
    expect(copied.portfolios.map((p) => (p as { id: string }).id)).toEqual([
      "mine",
    ]);
  });

  it("keeps a database error, and any name in it, out of the response", async () => {
    owned = ["mine"];
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    client = fakeSupabase(db, writes, {
      snapshotReadError: {
        message:
          'permission denied for relation "portfell_book_snapshots" (Retirement)',
      },
    });

    const res = await post({
      action: "restore_sheet",
      snapshotId: "nightly-1",
      portfolioId: "mine",
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: DB_ERROR_MESSAGE });
    expect(String(logged.mock.calls[0]?.[0])).toContain("Retirement");
    logged.mockRestore();
  });
});
