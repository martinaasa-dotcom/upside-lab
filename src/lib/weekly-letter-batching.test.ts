/**
 * The Sunday letter used to cost four database round trips per recipient and
 * a full round of market calls per recipient, inside a function capped at
 * 60s. These tests count what actually leaves the process, so the claim
 * "constant, not linear" is measured rather than asserted.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { table: string; op: string }[] = [];
const marketCalls: string[] = [];
let letterMs = 0;
let clockOffset = 0;
const realNow = Date.now.bind(Date);
vi.spyOn(Date, "now").mockImplementation(() => realNow() + clockOffset);

function fixtureRows(table: string): unknown[] {
  const n = RECIPIENTS;
  switch (table) {
    case "portfell_profiles":
      return Array.from({ length: n }, (_, i) => ({
        id: `u${i}`,
        email: `p${i}@example.com`,
        display_name: `Person ${i}`,
        note_sunday_sent_at: null,
      }));
    case "portfell_portfolio_owners":
      return Array.from({ length: n }, (_, i) => ({
        user_id: `u${i}`,
        portfolio_id: `b${i}`,
      }));
    case "portfell_portfolios":
      return Array.from({ length: n }, (_, i) => ({
        id: `b${i}`,
        cash_balance: 1000,
        classroom_community_id: null,
      }));
    case "portfell_holdings":
      // Everyone holds the same two names, which is the case that used to
      // multiply upstream quote calls by the size of the mailing list.
      return Array.from({ length: n }, (_, i) => i).flatMap((i) => [
        { portfolio_id: `b${i}`, ticker: "NVDA", shares: 10, buy_price: 100 },
        { portfolio_id: `b${i}`, ticker: "MSFT", shares: 5, buy_price: 200 },
      ]);
    default:
      return [];
  }
}

let RECIPIENTS = 1;

function builder(table: string) {
  let op = "select";
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    or: () => chain,
    maybeSingle: () => {
      calls.push({ table, op });
      return Promise.resolve({ data: null, error: null });
    },
    update: () => {
      op = "update";
      return chain;
    },
    then: (resolve: (v: unknown) => unknown) => {
      calls.push({ table, op });
      return Promise.resolve(
        resolve({
          // An update that comes back with a row is a won claim on that
          // recipient -- see `claimRecipient` in note-cron.
          data: op === "update" ? [{ id: "claimed" }] : fixtureRows(table),
          error: null,
        })
      );
    },
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: () => ({ from: (t: string) => builder(t) }),
  supabaseUsesServiceRole: () => true,
}));
vi.mock("@/lib/send-note", () => ({
  noteEmailConfigured: () => true,
  sendNoteEmail: () => Promise.resolve(true),
}));
vi.mock("@/lib/market/quotes", () => ({
  fetchQuotesWithFallback: (t: string[]) => {
    marketCalls.push(`quotes:${t.join(",")}`);
    return Promise.resolve({
      quotes: Object.fromEntries(t.map((x) => [x, { price: 100 }])),
    });
  },
}));
vi.mock("@/lib/market/yahoo", () => ({
  fetchWeekReturns: (t: string[]) => {
    marketCalls.push(`week:${t.join(",")}`);
    // The real shape: {start, end, pct}, pct a fraction. A bare number here
    // is what `weeklyNumbersAreSound` now refuses to mail.
    return Promise.resolve(
      Object.fromEntries(
        t.map((x) => [x, { start: 99, end: 100, pct: 0.0101 }])
      )
    );
  },
  fetchMarketEvents: (t: string[]) => {
    marketCalls.push(`events:${t.join(",")}`);
    return Promise.resolve({ earnings: [] });
  },
}));
vi.mock("@/lib/weekly-margus", () => ({
  writeWeeklyTake: async () => {
    // Stand in for the model call, which is what actually consumes the
    // function's 60s budget in production. Time is moved on the clock rather
    // than actually slept, so the test costs milliseconds.
    clockOffset += letterMs;
    return "A take.";
  },
}));

const { dispatchWeeklyLetters } = await import("@/lib/note-cron");

beforeEach(() => {
  calls.length = 0;
  marketCalls.length = 0;
  letterMs = 0;
  clockOffset = 0;
});

describe("the Sunday letter's cost per recipient", () => {
  it("reads the same number of times for 1 recipient and for 25", async () => {
    RECIPIENTS = 1;
    const one = await dispatchWeeklyLetters();
    const readsForOne = calls.filter((c) => c.op === "select").length;

    calls.length = 0;
    RECIPIENTS = 25;
    const many = await dispatchWeeklyLetters();
    const readsForMany = calls.filter((c) => c.op === "select").length;

    expect(one.sent).toBe(1);
    expect(many.sent).toBe(25);
    // The whole point: reads do not grow with the mailing list.
    expect(readsForMany).toBe(readsForOne);
  });

  it("quotes each ticker once for the whole run, not once per reader", async () => {
    RECIPIENTS = 25;
    await dispatchWeeklyLetters();
    // 25 readers holding NVDA and MSFT: three upstream calls in total.
    expect(marketCalls).toEqual([
      "quotes:NVDA,MSFT",
      "week:NVDA,MSFT",
      "events:NVDA,MSFT",
    ]);
  });

  it("stops before its deadline and reports who is left instead of being killed", async () => {
    RECIPIENTS = 25;
    // Each letter costs 10s of the 50s budget, so the run cannot finish.
    letterMs = 10_000;
    const result = await dispatchWeeklyLetters();
    expect(result.ok).toBe(true);
    // 50s of budget at 10s a letter: five go out, twenty wait for the next
    // run. Before this change the platform killed the function instead and
    // those twenty were simply never written to.
    expect(result.sent).toBe(5);
    expect(result.remaining).toBe(20);
    // Everyone is accounted for: nobody is silently dropped.
    expect(result.sent + result.skipped + result.remaining).toBe(25);
    expect(result.optedIn).toBe(25);
  });
});
