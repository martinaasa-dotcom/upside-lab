import { describe, expect, it } from "vitest";
import {
  FILM_COMPANIES,
  FILM_DAYS,
  FILM_DOMAIN,
  FILM_MARKET_SPREAD,
  FILM_TICKS,
  filmLanes,
  filmWeek,
  filmWeekAnswer,
  filmX,
} from "@/lib/landing-film";
import { cashtag, signedPercent } from "@/lib/format";
import { sampleHoldingBy } from "@/lib/sample-portfolio";

/*
  The made-up week the landing page and the walkthrough open on.

  It is the first thing a stranger is shown, and every number on it can be
  added up by somebody with a calculator: the figure, the day's move, each
  chip, and the sentence under them. So the arithmetic is held here rather
  than trusted, and so is the shape of the lesson, which is the part most
  likely to rot quietly when somebody edits one move: the companies that
  "moved with the market" have to actually sit by the market's line, and
  the one with news has to actually be somewhere else.
*/

describe("the week adds up", () => {
  it("is five companies out of the one sample, with its share counts", () => {
    expect(FILM_COMPANIES).toHaveLength(5);
    for (const c of FILM_COMPANIES) {
      expect(c.shares).toBe(sampleHoldingBy(c.ticker).shares);
    }
  });

  it("opens each day where the last one closed", () => {
    for (let i = 1; i < FILM_DAYS.length; i++) {
      expect(FILM_DAYS[i]!.open).toBeCloseTo(FILM_DAYS[i - 1]!.close, 6);
    }
  });

  it("adds every day up from its companies", () => {
    for (const d of FILM_DAYS) {
      const sum = d.moves.reduce((s, m) => s + m.dollars, 0);
      expect(d.dollars).toBeCloseTo(sum, 6);
      expect(d.close).toBeCloseTo(d.open + sum, 6);
      expect(d.pct).toBeCloseTo(sum / d.open, 10);
      for (const m of d.moves) {
        expect(m.dollars).toBeCloseTo(m.open * m.pct, 6);
      }
    }
  });

  it("adds the week up from its days", () => {
    const week = filmWeek();
    const sum = FILM_DAYS.reduce((s, d) => s + d.dollars, 0);
    expect(week.dollars).toBeCloseTo(sum, 6);
    expect(week.close).toBeCloseTo(FILM_DAYS.at(-1)!.close, 6);
  });
});

describe("the lesson is really in the numbers", () => {
  it("has at most one company with news on any day", () => {
    for (const d of FILM_DAYS) {
      expect(d.moves.filter((m) => m.news).length, d.day).toBeLessThanOrEqual(1);
    }
  });

  it("keeps every company without news by the market's line", () => {
    for (const d of FILM_DAYS) {
      for (const m of d.moves.filter((x) => !x.news)) {
        expect(
          Math.abs(m.pct - d.marketPct),
          `${m.ticker} on ${d.day} is too far out to read as the market`
        ).toBeLessThanOrEqual(FILM_MARKET_SPREAD);
      }
    }
  });

  it("puts the company with news far enough out to see at a glance", () => {
    for (const d of FILM_DAYS) {
      if (!d.news) continue;
      expect(Math.abs(d.news.pct - d.marketPct), d.day).toBeGreaterThan(
        FILM_MARKET_SPREAD * 3
      );
    }
  });

  it("has a quiet day, so the picture also shows nothing happening", () => {
    expect(FILM_DAYS.some((d) => !d.news)).toBe(true);
  });

  it("loses the reader no money on any day it plays (Martin's call)", () => {
    /*
      The page this replaced opened on a red day and every figure on its
      first screen was a loss. What the app is for is understanding your
      money on every day, so the film's days are a good one, a quiet one
      and one where the market fell and the portfolio did not.
    */
    for (const d of FILM_DAYS) {
      expect(d.dollars, d.day).toBeGreaterThanOrEqual(0);
    }
    expect(FILM_DAYS.some((d) => d.marketPct < 0)).toBe(true);
  });
});

describe("the sentences say what the numbers say", () => {
  it("only says a company made most of the day when it did", () => {
    for (const d of FILM_DAYS) {
      if (/made most of/.test(d.line)) expect(d.newsShare).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("only calls a day even when it was", () => {
    for (const d of FILM_DAYS) {
      if (/about even/.test(d.line)) expect(Math.abs(d.pct)).toBeLessThan(0.0025);
    }
  });

  it("says which way the market went on a day a company went the other way", () => {
    for (const d of FILM_DAYS) {
      if (!d.news || Math.sign(d.news.pct) === Math.sign(d.marketPct)) continue;
      expect(d.title).toContain(d.marketPct < 0 ? "market fell" : "market rose");
      expect(d.title).toContain(d.news.pct > 0 ? `${d.news.company} rose` : `${d.news.company} fell`);
    }
  });

  it("names, in the Margus answer, the company that made the most money", () => {
    const week = filmWeek();
    const best = [...FILM_COMPANIES]
      .map((c) => ({
        c,
        dollars: FILM_DAYS.reduce(
          (s, d) => s + d.moves.find((m) => m.ticker === c.ticker)!.dollars,
          0
        ),
      }))
      .sort((a, b) => b.dollars - a.dollars)[0]!;
    expect(week.biggest.ticker).toBe(best.c.ticker);
    const qa = filmWeekAnswer();
    expect(qa.answer[0]).toContain(best.c.company);
    // "So well" is only true of a week that went up.
    expect(week.dollars).toBeGreaterThan(0);
  });

  it("never tells anybody what to do", () => {
    const words = [
      ...FILM_DAYS.flatMap((d) => [d.title, d.line, ...d.moves.map((m) => m.verdict)]),
      ...filmWeekAnswer().answer,
    ].join(" ");
    expect(words).not.toMatch(/\b(buy|sell|should|consider|recommend)\b/i);
  });
});

describe("the picture", () => {
  it("fits every move of the week on its scale", () => {
    for (const d of FILM_DAYS) {
      for (const v of [d.marketPct, d.pct, ...d.moves.map((m) => m.pct)]) {
        expect(v).toBeGreaterThanOrEqual(FILM_DOMAIN.lo);
        expect(v).toBeLessThanOrEqual(FILM_DOMAIN.hi);
        expect(filmX(v)).toBeGreaterThan(0);
        expect(filmX(v)).toBeLessThan(1);
      }
    }
    expect(FILM_TICKS).toContain(0);
    for (const t of FILM_TICKS) {
      expect(t).toBeGreaterThanOrEqual(FILM_DOMAIN.lo);
      expect(t).toBeLessThanOrEqual(FILM_DOMAIN.hi);
    }
  });

  it("never lets two chips touch, at any width the film is drawn", () => {
    /*
      Widths are the generous end of what a chip measures (a cashtag at
      14px and a percent at 12px mono, plus padding), so the check is about
      the layout rather than about one font's metrics.
    */
    const width = (t: string, pct: number) =>
      22 + cashtag(t).length * 9 + 6 + signedPercent(pct).length * 7.5;
    for (const track of [240, 280, 320, 360, 420, 480, 560]) {
      for (const d of FILM_DAYS) {
        const chips = d.moves.map((m) => ({
          ticker: m.ticker,
          pct: m.pct,
          width: width(m.ticker, m.pct),
        }));
        const placed = filmLanes(chips, track, d.marketPct);
        expect(placed).toHaveLength(chips.length);
        for (const p of placed) {
          const w = chips.find((c) => c.ticker === p.ticker)!.width;
          expect(p.left, `${p.ticker} at ${track}px`).toBeGreaterThanOrEqual(0);
          expect(p.left + w, `${p.ticker} at ${track}px`).toBeLessThanOrEqual(track + 0.001);
          for (const q of placed) {
            if (q === p || q.lane !== p.lane) continue;
            const wq = chips.find((c) => c.ticker === q.ticker)!.width;
            const apart = p.left + w <= q.left || q.left + wq <= p.left;
            expect(apart, `${p.ticker} and ${q.ticker} on ${d.day} at ${track}px`).toBe(true);
          }
        }
      }
    }
  });
});
