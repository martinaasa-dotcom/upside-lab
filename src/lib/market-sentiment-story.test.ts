import { describe, expect, it } from "vitest";
import { sentimentCopyIsDescriptive } from "@/lib/market-sentiment";
import {
  buildSentimentCard,
  linearProbeCopy,
  marketDaysPhrase,
  sentimentFitLine,
  sentimentHistoryLine,
  sentimentLead,
  signedProbeCopy,
  sparkProbeCopy,
  stretchProbeCopy,
} from "@/lib/market-sentiment-story";
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
    expect(card.lead.startsWith("Upward.")).toBe(true);
    expect(card.lead).toContain("about 2 months more");
    expect(card.lead).not.toContain("speedometer");
    expect(card.reading.label).toBe("Steady climb");
    expect(card.reading.pill).toBe("good");
    expect(card.fitLine).toMatch(/^\d+% fit$/);
    expect(card.gauges).toHaveLength(4);
    expect(card.gauges[0]!.sub).toBe("Quiet");
    expect(card.gauges[0]!.valueClassName).toBe("text-gain");
    expect(card.gauges[0]!.explain).toContain("How jumpy US stocks");
    expect(card.gauges[1]!.sub).toBe("Mid-range");
    expect(card.gauges[2]!.sub).toBe("Neutral");
    expect(card.gauges[3]!.label).toBe("Usual price");
    expect(card.gauges[3]!.sub).toBe("Above usual");
    expect(card.gauges[3]!.kind).toBe("signed");
    expect(card.gauges[0]!.markerPct).toBeGreaterThan(0);
    expect(card.gauges[0]!.bandClass).toBe("bg-foreground/20");
    expect(card.gauges[0]!.bandClass).not.toMatch(/gain/);
    expect(card.stretch).not.toBeNull();
    expect(card.stretch!.inLabel).toContain("47 days above usual");
    expect(card.stretch!.moreLabel).toContain("about 2 months more");
    expect(card.stretch!.above).toBe(true);
    expect(card.gauges[3]!.explain).toContain("typical price over about the last year");
    expect(card).not.toHaveProperty("fact");
    expect(card).not.toHaveProperty("history");
  });

  it("leads with downward on a slide", () => {
    const card = buildSentimentCard(SLIDE);
    expect(card.lead.startsWith("Downward.")).toBe(true);
    expect(card.reading.label).toBe("Steady slide");
    expect(card.reading.pill).toBe("warn");
    expect(card.fitLine).toMatch(/^\d+% fit$/);
    expect(card.gauges[3]!.sub).toBe("Below usual");
    expect(card.gauges[3]!.valueClassName).toBe("text-loss");
  });

  it("keeps every sentence descriptive", () => {
    const climb = buildSentimentCard(CLIMB);
    const slide = buildSentimentCard(SLIDE);
    for (const card of [climb, slide]) {
      expect(sentimentCopyIsDescriptive(card.lead)).toBe(true);
      if (card.fitLine) expect(sentimentCopyIsDescriptive(card.fitLine)).toBe(true);
      for (const gauge of card.gauges) {
        expect(sentimentCopyIsDescriptive(gauge.sub)).toBe(true);
        expect(sentimentCopyIsDescriptive(gauge.explain)).toBe(true);
        expect(gauge.explain).not.toMatch(/speedometer|sprinting|walking/i);
      }
    }
  });

  it("does not write a fit line while waiting", () => {
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
    expect(card.fitLine).toBeNull();
    expect(sentimentFitLine(null)).toBeNull();
    expect(sentimentLead(card.reading)).toBe(card.reading.copy);
  });

  it("keeps the day count in the header when there is no stretch track", () => {
    const card = buildSentimentCard({
      ...CLIMB,
      typicalMoreDays: 2,
      alreadyLong: false,
    });
    expect(card.stretch).toBeNull();
    expect(card.fitLine).toMatch(/^\d+% fit · 47 days above usual$/);
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

describe("probe copy", () => {
  it("names the quiet band when you sit on today's VIX", () => {
    const vix = buildSentimentCard(CLIMB).gauges[0]!;
    expect(linearProbeCopy(vix, vix.markerPct!)).toContain("Quiet");
    expect(linearProbeCopy(vix, 90)).toContain("A scare");
  });

  it("reads the usual-price bar at the live marker", () => {
    const usual = buildSentimentCard(CLIMB).gauges[3]!;
    const copy = signedProbeCopy(usual, 50 + (usual.signedFillPct ?? 0));
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
