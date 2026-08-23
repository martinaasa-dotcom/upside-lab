import { describe, expect, it } from "vitest";
import {
  ALWAYS_POPULAR_TICKERS,
  POPULAR_TICKER_COUNT,
  sanitizePopularTickers,
} from "@/lib/popular-tickers";

/*
  The watchlist screen asks a person to name companies cold, which is the
  hardest thing the walkthrough asks for. What it offers has to look like a
  list of real, current, recognisable companies every single month.

  Two things must hold whatever the monthly feed returns: the seven names
  almost anyone can name are always there, and the list is always full.
*/
describe("sanitizePopularTickers", () => {
  it("always offers the seven, even when the month returned none of them", () => {
    const month = ["RIG", "PLUG", "AAL", "ONDS", "SPCX", "NU", "F"];
    const out = sanitizePopularTickers(month);
    for (const t of ALWAYS_POPULAR_TICKERS) expect(out, t).toContain(t);
  });

  it("leads with them, so the row opens on familiar names", () => {
    const out = sanitizePopularTickers(["RIG", "PLUG"]);
    expect(out.slice(0, ALWAYS_POPULAR_TICKERS.length)).toEqual([
      ...ALWAYS_POPULAR_TICKERS,
    ]);
  });

  it("still carries the month's movers after them", () => {
    const out = sanitizePopularTickers(["RIG", "PLUG"]);
    expect(out).toContain("RIG");
    expect(out).toContain("PLUG");
  });

  it("fills to a full list from a short month", () => {
    expect(sanitizePopularTickers(["RIG"]).length).toBe(POPULAR_TICKER_COUNT);
  });

  it("fills to a full list when there is no month at all", () => {
    expect(sanitizePopularTickers(null).length).toBe(POPULAR_TICKER_COUNT);
    for (const t of ALWAYS_POPULAR_TICKERS) {
      expect(sanitizePopularTickers(null), t).toContain(t);
    }
  });

  it("never repeats a name when the month already had one of the seven", () => {
    const out = sanitizePopularTickers(["NVDA", "AAPL", "RIG"]);
    expect(new Set(out).size).toBe(out.length);
  });

  it("drops anything that is not a ticker", () => {
    const out = sanitizePopularTickers(["RIG", "not a ticker", "", null, 7]);
    expect(out).toContain("RIG");
    expect(out.every((t) => /^[A-Z]{1,5}([.-][A-Z])?$/.test(t))).toBe(true);
  });

  it("caps the list rather than growing it", () => {
    const many = Array.from({ length: 80 }, (_, i) => `AB${i % 10}`);
    expect(sanitizePopularTickers(many).length).toBe(POPULAR_TICKER_COUNT);
  });
});
