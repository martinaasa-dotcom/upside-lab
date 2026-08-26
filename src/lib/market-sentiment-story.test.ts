import { describe, expect, it } from "vitest";
import { sentimentCopyIsDescriptive } from "@/lib/market-sentiment";
import {
  buildSentimentCard,
  marketDaysPhrase,
  sentimentDailyFact,
  sentimentFitLine,
  sentimentHistoryLine,
  sentimentLead,
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
  it("leads with upward on a climb, and names the fit", () => {
    const card = buildSentimentCard(CLIMB);
    expect(card.lead.startsWith("Upward.")).toBe(true);
    expect(card.reading.label).toBe("Steady climb");
    expect(card.fitLine).toMatch(/^\d+% fit to this pattern$/);
    expect(card.history).toContain("47 market days");
    expect(card.history).toContain("about 2 months more");
    expect(card.gauges).toHaveLength(4);
    expect(card.gauges[0]!.sub).toContain("quiet band");
    expect(card.gauges[1]!.sub).toContain("speedometer");
    expect(card.gauges[2]!.sub).toContain("mood score");
    expect(card.gauges[3]!.sub).toContain("solid lead");
    expect(card.fact).toContain("26 August 2026");
  });

  it("leads with downward on a slide", () => {
    const card = buildSentimentCard(SLIDE);
    expect(card.lead.startsWith("Downward.")).toBe(true);
    expect(card.reading.label).toBe("Steady slide");
    expect(card.history).toContain("below its 200-day");
  });

  it("keeps every sentence descriptive", () => {
    const climb = buildSentimentCard(CLIMB);
    const slide = buildSentimentCard(SLIDE);
    for (const card of [climb, slide]) {
      expect(sentimentCopyIsDescriptive(card.lead)).toBe(true);
      if (card.fitLine) expect(sentimentCopyIsDescriptive(card.fitLine)).toBe(true);
      if (card.history) expect(sentimentCopyIsDescriptive(card.history)).toBe(true);
      if (card.fact) expect(sentimentCopyIsDescriptive(card.fact)).toBe(true);
      for (const gauge of card.gauges) {
        expect(sentimentCopyIsDescriptive(gauge.sub)).toBe(true);
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
      asOf: null,
    });
    expect(card.fitLine).toBeNull();
    expect(card.history).toBeNull();
    expect(card.fact).toBeNull();
    expect(sentimentFitLine(null)).toBeNull();
    expect(sentimentLead(card.reading)).toBe(card.reading.copy);
  });
});

describe("sentimentDailyFact", () => {
  it("is stable for the same snapshot", () => {
    const a = sentimentDailyFact(CLIMB);
    const b = sentimentDailyFact(CLIMB);
    expect(a).toBe(b);
    expect(a).toBeTruthy();
  });

  it("changes when the market numbers change", () => {
    const a = sentimentDailyFact(CLIMB);
    const b = sentimentDailyFact({ ...CLIMB, rsi: 61.2, smaRatio: 0.09 });
    expect(a).not.toBe(b);
  });

  it("changes when the session day changes, even if the numbers do not", () => {
    const a = sentimentDailyFact(CLIMB);
    const b = sentimentDailyFact({
      ...CLIMB,
      asOf: "2026-08-27T20:00:00.000Z",
    });
    expect(a).not.toBe(b);
    expect(b).toContain("27 August 2026");
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
    expect(line).toContain("180 market days");
    expect(line).toContain("longer than every completed stretch");
    expect(line).not.toContain("typically ran");
  });
});
