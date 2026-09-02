/**
 * The import route takes the same guards as the single-holding route. It
 * used to accept any shares and buy price above zero with no ceiling and no
 * rounding, and to drop an out-of-range cash figure on the floor while the
 * holdings landed, so a CSV could store a figure the form would have
 * refused. Every row is judged before anything is written, because a
 * half-applied import is worse than none.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PORTFELL_TABLES } from "@/lib/supabase/tables";

type Write = { table: string; op: string; payload: unknown };
const writes: Write[] = [];

function query(table: string, op: string, payload?: unknown) {
  if (op !== "select") writes.push({ table, op, payload });
  const answer =
    op === "select" && table === PORTFELL_TABLES.holdings
      ? { data: [], error: null }
      : op === "select"
        ? { data: { cash_balance: 250 }, error: null }
        : op === "upsert"
          ? {
              data: {
                id: `h-${String((payload as { ticker: string }).ticker)}`,
                ticker: (payload as { ticker: string }).ticker,
                sort_order: 1,
              },
              error: null,
            }
          : { data: null, error: null };
  const self = {
    eq: () => self,
    in: () => self,
    select: () => self,
    single: () => self,
    maybeSingle: () => self,
    then: (
      resolve: (value: typeof answer) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(answer).then(resolve, reject),
  };
  return self;
}

const supabase = {
  from: (table: string) => ({
    select: () => query(table, "select"),
    update: (payload: unknown) => query(table, "update", payload),
    upsert: (payload: unknown) => query(table, "upsert", payload),
    delete: () => query(table, "delete"),
  }),
};

vi.mock("@/lib/supabase/server-auth", () => ({
  requireAuthUser: async () => ({ user: { id: "user-1" } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseDataClient: async () => supabase,
}));
vi.mock("@/lib/auth/ownership", () => ({
  requirePortfolioOwner: async () => null,
}));
vi.mock("@/lib/classroom-guard", () => ({
  denyClassroomWrite: async () => null,
}));
vi.mock("@/lib/cash-trade", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cash-trade")>();
  return {
    ...actual,
    portfolioTracksTradeCash: async () => false,
    applyTradeCashDelta: async () => 250,
    salePriceFor: async (_ticker: string, fallback: number) => fallback,
  };
});
vi.mock("@/lib/telemetry", () => ({
  logEvent: () => {},
  logError: () => {},
}));
vi.mock("@/lib/observe-route", () => ({
  observeRoute: (h: (req: Request) => Promise<Response>) => h,
}));

import { POST } from "@/app/api/holdings/import/route";

async function post(body: unknown): Promise<Response> {
  return POST(
    new Request("https://upsidelab.app/api/holdings/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never
  ) as Promise<Response>;
}

const PORTFOLIO = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  writes.length = 0;
});

describe("POST /api/holdings/import", () => {
  it("lands a normal import, rounded the way the single-holding route rounds", async () => {
    const res = await post({
      portfolio_id: PORTFOLIO,
      holdings: [
        { ticker: "NVDA", shares: 10.123456, buy_price: 100.006 },
        { ticker: "AAPL", shares: 3, buy_price: 190.5 },
      ],
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; upserted: number };
    expect(json.ok).toBe(true);
    expect(json.upserted).toBe(2);

    const upserts = writes.filter((w) => w.op === "upsert");
    expect(upserts).toHaveLength(2);
    const nvda = upserts.find(
      (w) => (w.payload as { ticker: string }).ticker === "NVDA"
    );
    expect(nvda?.payload).toMatchObject({ shares: 10.1235, buy_price: 100.01 });
  });

  it("refuses the whole import when one row carries 1e300 shares", async () => {
    const res = await post({
      portfolio_id: PORTFOLIO,
      holdings: [
        { ticker: "AAPL", shares: 3, buy_price: 190.5 },
        { ticker: "NVDA", shares: 1e300, buy_price: 100 },
      ],
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("Row 2 (NVDA)");
    expect(json.error).toContain("nothing was imported");
    // The good row before it did not land either.
    expect(writes).toHaveLength(0);
  });

  it("refuses a buy price past the ceiling and a share count of zero", async () => {
    const price = await post({
      portfolio_id: PORTFOLIO,
      holdings: [{ ticker: "AAPL", shares: 3, buy_price: 1e300 }],
    });
    expect(price.status).toBe(400);
    expect(((await price.json()) as { error: string }).error).toContain(
      "Row 1 (AAPL)"
    );

    const zero = await post({
      portfolio_id: PORTFOLIO,
      holdings: [{ ticker: "AAPL", shares: 0, buy_price: 190.5 }],
    });
    expect(zero.status).toBe(400);
    expect(writes).toHaveLength(0);
  });

  it("answers 400 for out-of-range cash instead of quietly ignoring it", async () => {
    const res = await post({
      portfolio_id: PORTFOLIO,
      cash: 1e300,
      holdings: [{ ticker: "AAPL", shares: 3, buy_price: 190.5 }],
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("cash");
    expect(writes).toHaveLength(0);
  });

  it("still stores borrowed money as negative cash", async () => {
    const res = await post({ portfolio_id: PORTFOLIO, cash: -7000 });
    expect(res.status).toBe(200);
    const update = writes.find(
      (w) => w.op === "update" && w.table === PORTFELL_TABLES.portfolios
    );
    expect(update?.payload).toMatchObject({ cash_balance: -7000 });
  });
});
