/**
 * Home's Worth noticing / What's missing used to reprint the mix lecture
 * every morning. These pin that a live move wins, a quiet mix prints
 * nothing, and a later look in the day can pick the next true card.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  buildBookInsights,
  concentrationDayLine,
  loneMoverLine,
  neighborGapsToday,
} from "@/lib/book-insights";
import { bumpInsightLook, INSIGHT_SITTING_MS } from "@/lib/insight-look";
import { buildMorningRead } from "@/lib/morning-read";
import type { OverviewModel, TickerScore } from "@/lib/overview";
import type { VisitDiff } from "@/lib/visit-diff";

function ticker(
  partial: Partial<TickerScore> & Pick<TickerScore, "ticker">
): TickerScore {
  return {
    portfolios: ["Aasad"],
    portfolioIds: ["p1"],
    shares: 100,
    buyValue: 10_000,
    currentValue: 10_000,
    roiDollar: 0,
    roiPct: 0,
    todayDollar: 0,
    todayPct: 0,
    price: 100,
    sparkline: [],
    ...partial,
  };
}

function model(
  tickers: TickerScore[],
  todayPct: number | null
): OverviewModel {
  const equity = tickers.reduce((s, x) => s + x.currentValue, 0);
  const todayDollar = tickers.reduce((s, x) => s + x.todayDollar, 0);
  return {
    sheets: [],
    tickers,
    winners: [],
    losers: [],
    todayWinners: [],
    todayLosers: [],
    topHoldings: tickers,
    funFacts: [],
    totals: {
      buyValue: equity,
      equityValue: equity,
      cash: 0,
      totalValue: equity,
      roiDollar: 0,
      roiPct: 0,
      todayDollar,
      todayPct,
      sheetCount: 1,
      positionCount: tickers.length,
      uniqueTickers: tickers.length,
    },
  };
}

function withStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  const g = globalThis as Record<string, unknown>;
  g.window = { localStorage: storage };
  g.localStorage = storage;
  return store;
}

function clearStorage() {
  const g = globalThis as Record<string, unknown>;
  delete g.window;
  delete g.localStorage;
}

afterEach(clearStorage);

describe("lone mover", () => {
  it("names the name that moved while the rest barely did", () => {
    const line = loneMoverLine([
      { ticker: "CRWV", value: 20_000, todayPct: 0.05 },
      { ticker: "AAPL", value: 80_000, todayPct: 0.002 },
    ]);
    expect(line).toMatch(/\$CRWV rose about 5% today/);
    expect(line).toMatch(/\$AAPL barely moved/);
    expect(line).toMatch(/whether something changed at the company/);
  });

  it("stays quiet when nothing stuck out", () => {
    expect(
      loneMoverLine([
        { ticker: "CRWV", value: 50_000, todayPct: 0.004 },
        { ticker: "AAPL", value: 50_000, todayPct: 0.003 },
      ])
    ).toBeNull();
  });
});

describe("neighbor gap is today's move, not a standing lecture", () => {
  it("stays quiet when the heavy group did not move", () => {
    expect(
      neighborGapsToday([
        { ticker: "CRWV", value: 80_000, todayPct: 0.002 },
        { ticker: "NBIS", value: 20_000, todayPct: 0.001 },
      ])
    ).toEqual([]);
  });

  it("names today's move, then the missing neighbor", () => {
    const gaps = neighborGapsToday([
      { ticker: "CRWV", value: 55_000, todayPct: -0.04 },
      { ticker: "NBIS", value: 20_000, todayPct: -0.03 },
      { ticker: "AAPL", value: 25_000, todayPct: 0.002 },
    ]);
    expect(gaps.length).toBeGreaterThanOrEqual(1);
    expect(gaps[0]?.text).toMatch(/AI computer companies are down about/);
    expect(gaps[0]?.text).toMatch(/today/);
    expect(gaps.some((g) => /power|electric/i.test(g.text))).toBe(true);
    expect(gaps.every((g) => !/power shortage is a portfolio/.test(g.text))).toBe(
      true
    );
  });
});

describe("Home notices", () => {
  it("does not reprint the mix lecture on a quiet day", () => {
    const mix = buildBookInsights([
      { ticker: "CRWV", value: 55_000, todayPct: 0.001 },
      { ticker: "NBIS", value: 20_000, todayPct: 0 },
      { ticker: "AAPL", value: 25_000, todayPct: 0 },
    ]);
    expect(mix.rotation).toMatch(/Most of your portfolio is AI computer builders/);

    const read = buildMorningRead(
      model(
        [
          ticker({ ticker: "CRWV", currentValue: 55_000, todayPct: 0.001 }),
          ticker({ ticker: "NBIS", currentValue: 20_000, todayPct: 0 }),
          ticker({ ticker: "AAPL", currentValue: 25_000, todayPct: 0 }),
        ],
        0.0007
      ),
      null,
      "open"
    );
    expect(read.notices).toEqual([]);
  });

  it("prefers a lone mover over the mix lecture, even on a quiet book", () => {
    const read = buildMorningRead(
      model(
        [
          ticker({
            ticker: "CRWV",
            currentValue: 20_000,
            todayPct: 0.05,
            todayDollar: 950,
          }),
          ticker({
            ticker: "AAPL",
            currentValue: 80_000,
            todayPct: 0.002,
            todayDollar: 160,
          }),
        ],
        0.011
      ),
      null,
      "open"
    );
    expect(read.quiet).toBe(true);
    const notice = read.notices.find((n) => n.kind === "notice");
    expect(notice?.text).toMatch(/\$CRWV rose about 5%/);
    expect(notice?.text).not.toMatch(/Most of your portfolio is/);
    expect(notice?.label).toMatch(/Worth noticing|Friday's close/);
  });

  it("rotates to the next true card on a later look", () => {
    const visit: VisitDiff = {
      previousAt: "2026-08-26T10:00:00.000Z",
      lines: [
        {
          id: "t-$CRWV",
          text: "$CRWV +3.2% (+$1,200)",
          tone: "up",
        },
      ],
    };
    const book = model(
      [
        ticker({
          ticker: "CRWV",
          currentValue: 20_000,
          todayPct: 0.05,
          todayDollar: 950,
        }),
        ticker({
          ticker: "AAPL",
          currentValue: 80_000,
          todayPct: 0.002,
          todayDollar: 160,
        }),
      ],
      0.011
    );
    const first = buildMorningRead(book, visit, "open", { lookIndex: 0 });
    const second = buildMorningRead(book, visit, "open", { lookIndex: 1 });
    const a = first.notices.find((n) => n.kind === "notice")?.text ?? "";
    const b = second.notices.find((n) => n.kind === "notice")?.text ?? "";
    expect(a).toMatch(/While you were away/);
    expect(b).toMatch(/\$CRWV rose about 5%/);
    expect(a).not.toBe(b);
  });

  it("surfaces Thesis watch on a name that moved, as a later look", () => {
    const book = model(
      [
        ticker({
          ticker: "CRWV",
          currentValue: 50_000,
          todayPct: -0.04,
          todayDollar: -2000,
        }),
        ticker({
          ticker: "NBIS",
          currentValue: 50_000,
          todayPct: 0.002,
          todayDollar: 100,
        }),
      ],
      0.019
    );
    const notes = [
      { ticker: "CRWV", thesisStatus: "watch" as const, hasThesis: true },
      { ticker: "NBIS", thesisStatus: "intact" as const, hasThesis: true },
    ];
    const first = buildMorningRead(book, null, "open", { lookIndex: 0, notes });
    const second = buildMorningRead(book, null, "open", { lookIndex: 1, notes });
    expect(first.notices.some((n) => /fell about 4%/.test(n.text))).toBe(true);
    expect(second.notices.some((n) => /Thesis watch/.test(n.text))).toBe(true);
  });

  it("says there is no thesis on file when a large name moved", () => {
    const book = model(
      [
        ticker({
          ticker: "CRWV",
          currentValue: 40_000,
          todayPct: -0.04,
          todayDollar: -1600,
        }),
        ticker({
          ticker: "AAPL",
          currentValue: 60_000,
          todayPct: 0.001,
          todayDollar: 60,
        }),
      ],
      0.015
    );
    const read = buildMorningRead(book, null, "open", {
      lookIndex: 0,
      notes: [
        { ticker: "CRWV", hasThesis: false },
        { ticker: "AAPL", hasThesis: true },
      ],
    });
    const gap = read.notices.find((n) => n.kind === "gap");
    expect(gap?.label).toBe("What's missing");
    expect(gap?.text).toMatch(/\$CRWV fell about 4%/);
    expect(gap?.text).toMatch(/no thesis on file/);
  });
});

describe("concentration as today's story", () => {
  it("only speaks when that group actually moved", () => {
    expect(
      concentrationDayLine([
        { ticker: "CRWV", value: 55_000, todayPct: 0.004 },
        { ticker: "NBIS", value: 20_000, todayPct: 0.002 },
        { ticker: "AAPL", value: 25_000, todayPct: 0 },
      ])
    ).toBeNull();
    const line = concentrationDayLine([
      { ticker: "CRWV", value: 55_000, todayPct: -0.03 },
      { ticker: "NBIS", value: 20_000, todayPct: -0.03 },
      { ticker: "AAPL", value: 25_000, todayPct: 0.01 },
    ]);
    expect(line).toMatch(/Most of your portfolio is AI computer builders \(75%\)/);
    expect(line).toMatch(/down about 3% today/);
    expect(line).not.toMatch(/If you did not mean to take that much/);
  });
});

describe("insight look counter", () => {
  it("stays on 0 inside a sitting, then bumps", () => {
    withStorage();
    const t0 = Date.parse("2026-08-27T09:00:00+03:00");
    expect(bumpInsightLook(t0)).toBe(0);
    expect(bumpInsightLook(t0 + 60_000)).toBe(0);
    expect(bumpInsightLook(t0 + INSIGHT_SITTING_MS + 1)).toBe(1);
    expect(bumpInsightLook(t0 + INSIGHT_SITTING_MS + 2)).toBe(1);
  });
});
