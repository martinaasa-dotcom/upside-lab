/**
 * What writing one holding actually costs.
 *
 * A plain POST used to ask the database six times after auth, and a PATCH or
 * a DELETE that reduced a share count also walked the quote providers for a
 * live price that only a classroom paper sheet ever spends. This counts the
 * round trips and the provider walks per method, on an ordinary portfolio
 * and on a classroom sheet, so a helper quietly growing a second select of
 * the same row shows up as a number rather than as latency nobody traced.
 *
 * The recorded names are table and operation, in order, because the order is
 * the point: ownership has to be settled before anything is written, and the
 * classroom's cash still has to move by the database delta rather than by a
 * total worked out here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { PORTFELL_TABLES } from "@/lib/supabase/tables";

const state = vi.hoisted(() => ({
  trips: [] as string[],
  quoteWalks: 0,
  classroomId: null as string | null,
  cashBalance: 400,
  portfolioRow: true,
  portfolioError: false,
  existingHolding: null as Record<string, unknown> | null,
  existingList: [] as Record<string, unknown>[],
  rpcArgs: [] as unknown[],
}));

vi.mock("@/lib/supabase/server-auth", () => ({
  requireAuthUser: async () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/lib/observe-route", () => ({
  observeRoute: (h: (req: NextRequest) => Promise<Response>) => h,
}));

vi.mock("@/lib/telemetry", () => ({ logEvent: () => {} }));
vi.mock("@/lib/error-log", () => ({ logError: async () => {} }));

vi.mock("@/lib/market/quotes", () => ({
  fetchQuotesWithFallback: async (tickers: string[]) => {
    state.quoteWalks += 1;
    return {
      quotes: Object.fromEntries(
        tickers.map((t) => [t.toUpperCase(), { price: 120 }])
      ),
      sources: {},
    };
  },
}));

vi.mock("@/lib/supabase/server", () => {
  function reply(table: string, op: string, one: boolean) {
    if (table.endsWith("_portfolios")) {
      if (state.portfolioError) {
        return { data: null, error: { message: "down", code: "57014" } };
      }
      return {
        data: state.portfolioRow
          ? {
              id: "p1",
              classroom_community_id: state.classroomId,
              cash_balance: state.cashBalance,
            }
          : null,
        error: null,
      };
    }
    if (table.endsWith("_portfolio_owners")) {
      return {
        data: state.portfolioRow
          ? { portfolio_id: "p1", user_id: "user-1" }
          : null,
        error: null,
      };
    }
    if (table.endsWith("_community_members")) {
      return { data: { role: "member" }, error: null };
    }
    if (table.endsWith("_communities")) {
      return { data: { class_plan: null, house_note: null }, error: null };
    }
    if (table.endsWith("_holdings")) {
      if (op === "select") {
        // A row read asks for one; the import route asks for the whole list.
        return {
          data: one ? state.existingHolding : state.existingList,
          error: null,
        };
      }
      if (op === "delete") {
        return {
          data: { shares: 10, buy_price: 100, ticker: "NVDA" },
          error: null,
        };
      }
      return {
        data: {
          id: "h1",
          portfolio_id: "p1",
          ticker: "NVDA",
          shares: 4,
          buy_price: 100,
        },
        error: null,
      };
    }
    return { data: null, error: null };
  }

  function chain(table: string, op: string) {
    let one = false;
    const answer = () => reply(table, op, one);
    const self = {
      eq: () => self,
      in: () => self,
      order: () => self,
      limit: () => self,
      select: () => self,
      single: () => {
        one = true;
        return self;
      },
      maybeSingle: () => {
        one = true;
        return self;
      },
      then: (
        ok: (value: ReturnType<typeof answer>) => unknown,
        fail?: (reason: unknown) => unknown
      ) => {
        state.trips.push(`${table}.${op}`);
        return Promise.resolve(answer()).then(ok, fail);
      },
    };
    return self;
  }

  const client = {
    from: (table: string) => ({
      select: () => chain(table, "select"),
      insert: () => chain(table, "insert"),
      update: () => chain(table, "update"),
      upsert: () => chain(table, "upsert"),
      delete: () => chain(table, "delete"),
    }),
    rpc: (name: string, args: unknown) => {
      state.trips.push(`rpc.${name}`);
      state.rpcArgs.push(args);
      return Promise.resolve({ data: 8400, error: null });
    },
  };

  return {
    getSupabaseDataClient: async () => client,
    getSupabaseServer: () => null,
    supabaseUsesServiceRole: () => false,
  };
});

import { DELETE, PATCH, POST } from "@/app/api/holdings/route";
import { POST as IMPORT } from "@/app/api/holdings/import/route";

const PORTFOLIO = "11111111-1111-4111-8111-111111111111";
const OWNED = `${PORTFELL_TABLES.portfolios}.select`;
const HOLDING_READ = `${PORTFELL_TABLES.holdings}.select`;

function send(
  method: "POST" | "PATCH",
  body: unknown
): Promise<Response> {
  const handler = method === "POST" ? POST : PATCH;
  return handler(
    new NextRequest("https://upsidelab.app/api/holdings", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  ) as Promise<Response>;
}

function remove(id: string): Promise<Response> {
  return DELETE(
    new NextRequest(`https://upsidelab.app/api/holdings?id=${id}`, {
      method: "DELETE",
    })
  ) as Promise<Response>;
}

const STORED = {
  portfolio_id: "p1",
  ticker: "NVDA",
  shares: 10,
  buy_price: 100,
};

beforeEach(() => {
  state.trips.length = 0;
  state.rpcArgs.length = 0;
  state.quoteWalks = 0;
  state.classroomId = null;
  state.cashBalance = 400;
  state.portfolioRow = true;
  state.portfolioError = false;
  state.existingHolding = null;
  state.existingList = [];
});

describe("an ordinary portfolio", () => {
  it("adds a holding in three round trips and no provider walk", async () => {
    const res = await send("POST", {
      portfolio_id: PORTFOLIO,
      ticker: "NVDA",
      shares: 10,
      buy_price: 100,
    });
    expect(res.status).toBe(200);
    expect(state.quoteWalks).toBe(0);
    expect(state.trips).toEqual([
      OWNED,
      HOLDING_READ,
      `${PORTFELL_TABLES.holdings}.insert`,
    ]);
    // The balance comes back from the row the ownership check already read.
    expect(((await res.json()) as { cash_balance: number }).cash_balance).toBe(
      400
    );
  });

  it("sells down through POST without asking a quote provider", async () => {
    state.existingHolding = STORED;
    const res = await send("POST", {
      portfolio_id: PORTFOLIO,
      ticker: "NVDA",
      shares: 4,
      buy_price: 100,
    });
    expect(res.status).toBe(200);
    expect(state.quoteWalks).toBe(0);
    expect(state.trips).toEqual([
      OWNED,
      HOLDING_READ,
      `${PORTFELL_TABLES.holdings}.update`,
    ]);
  });

  it("patches a share count in three round trips and no provider walk", async () => {
    state.existingHolding = STORED;
    const res = await send("PATCH", { id: "h1", shares: 4 });
    expect(res.status).toBe(200);
    expect(state.quoteWalks).toBe(0);
    expect(state.trips).toEqual([
      HOLDING_READ,
      OWNED,
      `${PORTFELL_TABLES.holdings}.update`,
    ]);
  });

  it("deletes in three round trips and no provider walk", async () => {
    state.existingHolding = STORED;
    const res = await remove("h1");
    expect(res.status).toBe(200);
    expect(state.quoteWalks).toBe(0);
    expect(state.trips).toEqual([
      HOLDING_READ,
      OWNED,
      `${PORTFELL_TABLES.holdings}.delete`,
    ]);
    expect(state.rpcArgs).toHaveLength(0);
  });
});

describe("a classroom paper sheet", () => {
  beforeEach(() => {
    state.classroomId = "class-1";
    state.cashBalance = 10_000;
  });

  it("still moves cash by the database delta when a holding is added", async () => {
    const res = await send("POST", {
      portfolio_id: PORTFOLIO,
      ticker: "NVDA",
      shares: 10,
      buy_price: 100,
    });
    expect(res.status).toBe(200);
    expect(state.trips).toEqual([
      OWNED,
      HOLDING_READ,
      PORTFELL_TABLES.communities + ".select",
      PORTFELL_TABLES.communityMembers + ".select",
      `${PORTFELL_TABLES.holdings}.insert`,
      "rpc.portfell_apply_cash_delta",
    ]);
    expect(state.rpcArgs).toEqual([
      { p_portfolio_id: PORTFOLIO, p_delta: -1000 },
    ]);
  });

  it("still credits a sale at the live price when a holding is deleted", async () => {
    state.existingHolding = STORED;
    const res = await remove("h1");
    expect(res.status).toBe(200);
    // The quote walk survives exactly where its answer is spent.
    expect(state.quoteWalks).toBe(1);
    expect(state.trips).toEqual([
      HOLDING_READ,
      OWNED,
      PORTFELL_TABLES.communities + ".select",
      PORTFELL_TABLES.communityMembers + ".select",
      `${PORTFELL_TABLES.holdings}.delete`,
      "rpc.portfell_apply_cash_delta",
    ]);
    // A row-level write is authorized against the portfolio stored on the
    // row, never one named in the request, so the delta lands there too.
    expect(state.rpcArgs).toEqual([{ p_portfolio_id: "p1", p_delta: 1200 }]);
  });
});

describe("the one read that answers ownership", () => {
  it("refuses a portfolio the caller is not joined to, before any write", async () => {
    state.portfolioRow = false;
    const res = await send("POST", {
      portfolio_id: PORTFOLIO,
      ticker: "NVDA",
      shares: 10,
      buy_price: 100,
    });
    expect(res.status).toBe(403);
    expect(state.trips).toEqual([OWNED]);
  });

  it("fails closed when the read itself fails, rather than reading as a refusal", async () => {
    state.portfolioError = true;
    const res = await send("POST", {
      portfolio_id: PORTFOLIO,
      ticker: "NVDA",
      shares: 10,
      buy_price: 100,
    });
    expect(res.status).toBe(503);
    expect(state.trips).toEqual([OWNED]);
  });

  it("refuses a holding whose portfolio the caller is not joined to", async () => {
    state.existingHolding = STORED;
    state.portfolioRow = false;
    const res = await remove("h1");
    expect(res.status).toBe(403);
    expect(state.trips).toEqual([HOLDING_READ, OWNED]);
  });
});

describe("a CSV import, which shares the same helpers", () => {
  function importRows(rows: unknown[]): Promise<Response> {
    return IMPORT(
      new NextRequest("https://upsidelab.app/api/holdings/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolio_id: PORTFOLIO, holdings: rows }),
      })
    ) as Promise<Response>;
  }

  it("replaces a list on an ordinary portfolio with no provider walk", async () => {
    state.existingList = [
      { id: "h1", ticker: "NVDA", shares: 10, buy_price: 100, sort_order: 1 },
    ];
    const res = await importRows([
      { ticker: "NVDA", shares: 4, buy_price: 100 },
    ]);
    expect(res.status).toBe(200);
    expect(state.trips).toEqual([
      OWNED,
      HOLDING_READ,
      `${PORTFELL_TABLES.holdings}.update`,
    ]);
    // Selling six shares would have priced them, and then dropped the price.
    expect(state.quoteWalks).toBe(0);
    expect(((await res.json()) as { cash_balance: number }).cash_balance).toBe(
      400
    );
  });

  it("still prices the sale and moves cash on a classroom sheet", async () => {
    state.classroomId = "class-1";
    state.cashBalance = 10_000;
    state.existingList = [
      { id: "h1", ticker: "NVDA", shares: 10, buy_price: 100, sort_order: 1 },
    ];
    const res = await importRows([
      { ticker: "NVDA", shares: 4, buy_price: 100 },
    ]);
    expect(res.status).toBe(200);
    expect(state.quoteWalks).toBe(1);
    expect(state.trips).toEqual([
      OWNED,
      HOLDING_READ,
      `${PORTFELL_TABLES.communities}.select`,
      `${PORTFELL_TABLES.communityMembers}.select`,
      `${PORTFELL_TABLES.holdings}.update`,
      "rpc.portfell_apply_cash_delta",
    ]);
    expect(state.rpcArgs).toEqual([
      { p_portfolio_id: PORTFOLIO, p_delta: 720 },
    ]);
  });
});
