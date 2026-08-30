/**
 * The read that decides who gets a letter at all.
 *
 * Everything downstream of the recipient list was made to page when the
 * Sunday letter was batched. The list itself was not, so it stopped at
 * db-max-rows: past a thousand subscribers the readers beyond the cap were
 * simply not in it. That failure is silent in both directions -- no error
 * on the way out, and nothing on the way back that could notice, because a
 * person who is never fetched is never skipped either, so the run reports
 * a clean success having quietly not written to most of the list.
 *
 * The double below is PostgREST rather than a stub: it refuses to hand back
 * more than `DB_MAX_ROWS` in one response, exactly as the real thing does
 * and just as quietly. A single unpaged select therefore returns 1,000 of
 * the 1,200 opted-in readers and looks completely normal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const DB_MAX_ROWS = 1000;
const RECIPIENTS = 1200;

const sentTo: string[] = [];

function profiles() {
  return Array.from({ length: RECIPIENTS }, (_, i) => ({
    id: `u${i}`,
    email: `p${i}@example.com`,
    display_name: `Person ${i}`,
    note_sunday_sent_at: null,
  }));
}

function rowsFor(table: string): Record<string, unknown>[] {
  switch (table) {
    case "portfell_profiles":
      return profiles();
    case "portfell_portfolio_owners":
      return Array.from({ length: RECIPIENTS }, (_, i) => ({
        user_id: `u${i}`,
        portfolio_id: `b${i}`,
      }));
    case "portfell_portfolios":
      return Array.from({ length: RECIPIENTS }, (_, i) => ({
        id: `b${i}`,
        cash_balance: 1000,
        classroom_community_id: null,
      }));
    case "portfell_holdings":
      return Array.from({ length: RECIPIENTS }, (_, i) => ({
        portfolio_id: `b${i}`,
        ticker: "NVDA",
        shares: 10,
        buy_price: 100,
      }));
    default:
      return [];
  }
}

function builder(table: string) {
  let op: "select" | "update" = "select";
  let window: [number, number] | null = null;
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    or: () => chain,
    range: (from: number, to: number) => {
      window = [from, to];
      return chain;
    },
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    update: () => {
      op = "update";
      return chain;
    },
    then: (resolve: (v: unknown) => unknown) => {
      if (op === "update") {
        return Promise.resolve(resolve({ data: [{ id: "claimed" }], error: null }));
      }
      const all = rowsFor(table);
      const page = window ? all.slice(window[0], window[1] + 1) : all;
      // The cap, applied the way PostgREST applies it: silently.
      return Promise.resolve(
        resolve({ data: page.slice(0, DB_MAX_ROWS), error: null })
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
  sendNoteEmail: ({ to }: { to: string }) => {
    sentTo.push(to);
    return Promise.resolve(true);
  },
}));
vi.mock("@/lib/market/quotes", () => ({
  fetchQuotesWithFallback: (t: string[]) =>
    Promise.resolve({
      quotes: Object.fromEntries(t.map((x) => [x, { price: 100 }])),
    }),
}));
vi.mock("@/lib/market/yahoo", () => ({
  fetchWeekReturns: (t: string[]) =>
    Promise.resolve(
      Object.fromEntries(t.map((x) => [x, { start: 99, end: 100, pct: 0.0101 }]))
    ),
  fetchMarketEvents: () => Promise.resolve({ earnings: [] }),
}));
vi.mock("@/lib/weekly-margus", () => ({
  writeWeeklyTake: async () => "A take.",
}));

const { dispatchWeeklyLetters } = await import("@/lib/note-cron");

beforeEach(() => {
  sentTo.length = 0;
});

describe("the Sunday letter's mailing list", () => {
  it("writes to every opted-in reader, not the first thousand", async () => {
    const result = await dispatchWeeklyLetters();

    expect(result.optedIn).toBe(RECIPIENTS);
    expect(sentTo).toHaveLength(RECIPIENTS);
  });

  /*
    Naming the person who would have been dropped. `p1199@example.com` sits
    past the cap by two hundred, and an unpaged read leaves them out with
    the run still reporting success.
  */
  it("reaches the reader who sits past the cap", async () => {
    await dispatchWeeklyLetters();

    expect(sentTo).toContain("p1199@example.com");
    expect(sentTo).toContain(`p${DB_MAX_ROWS}@example.com`);
  });
});
