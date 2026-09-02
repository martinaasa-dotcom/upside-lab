import { describe, expect, it } from "vitest";
import { sentimentCopyIsDescriptive } from "@/lib/market-sentiment";
import {
  buildSentimentCard,
  linearProbeCopy,
  marketDaysPhrase,
  rsiTrackScale,
  vixTrackScale,
  sentimentFitLine,
  sentimentHistoryLine,
  sentimentLead,
  signedProbeCopy,
  sparkProbeCopy,
  stretchProbeCopy,
} from "@/lib/market-sentiment-story";
import { signedTrackFill } from "@/lib/market-sentiment-viz";
import type { SentimentMetrics } from "@/lib/market-sentiment";

const CLIMB: SentimentMetrics = {
  vix: 15.21,
  rsi: 54.3,
  fearGreed: 55,
  cryptoFearGreed: 65,
  spyPrice: 580,
  sma200: 536.5,
  smaRatio: 0.081,
  streakDays: 47,
  typicalMoreDays: 42,
  alreadyLong: false,
  spark: null,
  asOf: "2026-08-26T20:00:00.000Z",
};

const SLIDE: SentimentMetrics = {
  ...CLIMB,
  rsi: 42,
  fearGreed: 40,
  smaRatio: -0.04,
  typicalMoreDays: 21,
  asOf: "2026-08-27T20:00:00.000Z",
};

describe("marketDaysPhrase", () => {
  it("speaks in weeks, then months", () => {
    expect(marketDaysPhrase(5)).toBe("about a week");
    expect(marketDaysPhrase(10)).toBe("about 2 weeks");
    expect(marketDaysPhrase(42)).toBe("about 2 months");
  });
});

describe("buildSentimentCard", () => {
  it("leads with upward, stitches history into one body, and keeps gauges short", () => {
    const card = buildSentimentCard(CLIMB);
    expect(card.lead.startsWith("The market is trending up.")).toBe(true);
    expect(card.lead).toContain("about 2 months more");
    expect(card.lead).not.toContain("speedometer");
    expect(card.reading.label).toBe("Steady climb");
    expect(card.reading.pill).toBe("good");
    expect(card.fitLine).toMatch(/^S&P 500 · \d+% match this reading$/);
    expect(card.gauges).toHaveLength(3);
    expect(card.gauges.map((g) => g.label)).toEqual(["VIX", "RSI", "Fear & Greed"]);
    expect(card.gauges[0]!.sub).toBe("Normal");
    expect(card.gauges[0]!.valueClassName).toBeUndefined();
    expect(card.gauges[0]!.explain).toContain("Under 15 is unusually quiet");
    expect(card.gauges[0]!.explain).toContain("15 to 25 is the normal range");
    expect(card.gauges[0]!.ticks.map((t) => t.label)).toEqual(["10", "40"]);
    expect(card.gauges[0]!.fills.some((f) => f.className === "bg-foreground/20")).toBe(
      true
    );
    expect(card.gauges[0]!.fills.some((f) => f.className === "bg-gain/20")).toBe(true);
    expect(card.gauges[1]!.sub).toBe("Middle of its range");
    expect(card.gauges[1]!.ticks.map((t) => t.label)).toEqual(["20", "80"]);
    expect(card.gauges[1]!.scaleLo).toBe(20);
    expect(card.gauges[1]!.scaleHi).toBe(80);
    expect(card.gauges[2]!.sub).toBe("Neutral");
    expect(card.gauges[2]!.ticks.map((t) => t.label)).toEqual(["0", "100"]);
    // Both ends of Fear & Greed are caution, never a gain on one side and a
    // loss on the other: unusual either way, and neither is good or bad for
    // somebody who holds their companies for years.
    expect(
      card.gauges[2]!.fills.filter((f) => f.className.includes("warning"))
    ).toHaveLength(4);
    expect(
      card.gauges[2]!.fills.filter(
        (f) => f.className.includes("loss") || f.className.includes("gain")
      )
    ).toHaveLength(0);
    expect(card.gauges[2]!.explain).toContain("extreme fear");
    expect(card.gauges[2]!.explain).toContain("extreme greed");
    expect(card.gauges[2]!.explain).not.toMatch(/panic|party/i);
    expect(card.gauges[0]!.markerPct).toBeGreaterThan(0);
    expect(card.stretch).not.toBeNull();
    expect(card.stretch!.inLabel).toContain("47 days above usual");
    // Past tense: the fragment is what everybody reads, so it must not
    // read as a promise that the run has two more months left in it.
    expect(card.stretch!.moreLabel).toContain(
      "Past runs lasted about 2 months longer"
    );
    expect(card.stretch!.above).toBe(true);
    expect(card).not.toHaveProperty("fact");
    expect(card).not.toHaveProperty("history");
  });

  it("leads with downward on a slide", () => {
    const card = buildSentimentCard(SLIDE);
    expect(card.lead.startsWith("The market is trending down.")).toBe(true);
    expect(card.reading.label).toBe("Steady slide");
    expect(card.reading.pill).toBe("warn");
    expect(card.fitLine).toMatch(/^S&P 500 · \d+% match this reading$/);
    expect(card.gauges).toHaveLength(3);
  });

  it("keeps every sentence descriptive", () => {
    const climb = buildSentimentCard(CLIMB);
    const slide = buildSentimentCard(SLIDE);
    for (const card of [climb, slide]) {
      expect(sentimentCopyIsDescriptive(card.lead)).toBe(true);
      expect(sentimentCopyIsDescriptive(card.fitLine)).toBe(true);
      for (const gauge of card.gauges) {
        expect(sentimentCopyIsDescriptive(gauge.sub)).toBe(true);
        expect(sentimentCopyIsDescriptive(gauge.explain)).toBe(true);
        expect(gauge.explain).not.toMatch(/speedometer|sprinting|walking/i);
      }
    }
  });

  it("names the S&P 500 while waiting", () => {
    const card = buildSentimentCard({
      vix: null,
      rsi: null,
      fearGreed: null,
      cryptoFearGreed: null,
      spyPrice: null,
      sma200: null,
      smaRatio: null,
      streakDays: null,
      typicalMoreDays: null,
      alreadyLong: false,
      spark: null,
      asOf: null,
    });
    expect(card.fitLine).toBe("S&P 500");
    expect(sentimentFitLine(null)).toBe("S&P 500");
    expect(sentimentLead(card.reading)).toBe(card.reading.copy);
  });

  it("keeps the day count in the header when there is no stretch track", () => {
    const card = buildSentimentCard({
      ...CLIMB,
      typicalMoreDays: 2,
      alreadyLong: false,
    });
    expect(card.stretch).toBeNull();
    expect(card.fitLine).toMatch(
      /^S&P 500 · \d+% match this reading · 47 days above usual$/
    );
  });
});

describe("sentimentHistoryLine", () => {
  it("names an already-long stretch without inventing leftover weeks", () => {
    const line = sentimentHistoryLine({
      ...CLIMB,
      typicalMoreDays: null,
      alreadyLong: true,
      streakDays: 180,
    });
    expect(line).toContain("already longer than every completed stretch");
    expect(line).not.toContain("typically ran");
    expect(line).not.toContain("180");
  });
});

describe("rsiTrackScale", () => {
  it("stays on 20 to 80 until a reading is actually outside", () => {
    expect(rsiTrackScale(54.3)).toEqual({ lo: 20, hi: 80 });
    expect(rsiTrackScale(20)).toEqual({ lo: 20, hi: 80 });
    expect(rsiTrackScale(80)).toEqual({ lo: 20, hi: 80 });
    expect(rsiTrackScale(12)).toEqual({ lo: 10, hi: 80 });
    expect(rsiTrackScale(86)).toEqual({ lo: 20, hi: 90 });
  });

  it("cannot leave 0 to 100, which is the whole range RSI has", () => {
    expect(rsiTrackScale(3)).toEqual({ lo: 0, hi: 80 });
    expect(rsiTrackScale(99)).toEqual({ lo: 20, hi: 100 });
  });
});

describe("vixTrackScale", () => {
  /*
    The VIX gauge was a fixed 10 to 40 while RSI opened its ends, and
    `linearMarkerPct` clamps, so every reading above 40 parked the marker on
    the right edge: VIX 45 and VIX 80 drew the same bar, beside a number
    saying otherwise. The VIX printed above 80 in March 2020 and above 60 in
    August 2024, and those are the days somebody opens this panel.
  */
  it("stays on 10 to 40 for an ordinary reading", () => {
    expect(vixTrackScale(15.21)).toEqual({ lo: 10, hi: 40 });
    expect(vixTrackScale(10)).toEqual({ lo: 10, hi: 40 });
    expect(vixTrackScale(40)).toEqual({ lo: 10, hi: 40 });
  });

  it("opens the top rather than pinning the marker in a scare", () => {
    expect(vixTrackScale(45)).toEqual({ lo: 10, hi: 50 });
    expect(vixTrackScale(65.4)).toEqual({ lo: 10, hi: 70 });
    expect(vixTrackScale(82.7)).toEqual({ lo: 10, hi: 90 });
  });

  it("opens the bottom on the quietest readings, and never below zero", () => {
    expect(vixTrackScale(9.1)).toEqual({ lo: 0, hi: 40 });
  });

  it("has no reading at all when the gauge is missing", () => {
    expect(vixTrackScale(null)).toEqual({ lo: 10, hi: 40 });
  });
});

describe("probe copy", () => {
  it("names the normal band when you sit on today's VIX", () => {
    const vix = buildSentimentCard(CLIMB).gauges[0]!;
    expect(linearProbeCopy(vix, vix.markerPct!)).toContain("Normal");
    expect(linearProbeCopy(vix, 90)).toContain("A scare");
    expect(
      linearProbeCopy(buildSentimentCard({ ...CLIMB, vix: 14 }).gauges[0]!, 0)
    ).toContain("Unusually quiet");
  });

  it("reads the usual-price bar at the live marker", () => {
    const vix = buildSentimentCard(CLIMB).gauges[0]!;
    const fill = signedTrackFill(0.081);
    expect(fill).not.toBeNull();
    const copy = signedProbeCopy(vix, 50 + fill!);
    expect(copy).toContain("+8.1%");
    expect(copy).toContain("Above usual");
  });

  it("counts days along a typical stretch", () => {
    const stretch = buildSentimentCard(CLIMB).stretch!;
    expect(stretchProbeCopy(stretch, 0)).toMatch(/^0 days of a typical/);
    expect(stretchProbeCopy(stretch, 100)).toContain("89 days");
  });

  it("says price versus usual, with the day when we have one", () => {
    const copy = sparkProbeCopy(766, 709, "2026-08-26");
    expect(copy.vs).toContain("766");
    expect(copy.vs).toContain("709");
    expect(copy.ratio).toBeCloseTo(766 / 709 - 1, 5);
    expect(copy.date).toMatch(/26/);
    expect(copy.vs).not.toMatch(/[\u2014\u2013]/);
  });
});
