import { describe, expect, it } from "vitest";
import { rsi } from "@/lib/market/indicators";
import {
  SENTIMENT_COPY,
  SENTIMENT_DISCLAIMER,
  SENTIMENT_LABEL,
  classifyMarketSentiment,
  fearGreedCaption,
  lastDefined,
  preferSentimentSnapshot,
  sentimentCopyIsDescriptive,
  smaRatioFrom,
  spyMetricsFromCloses,
  type SentimentMetrics,
  type SentimentRegime,
} from "@/lib/market-sentiment";

const BASE = {
  vix: 18,
  rsi: 58,
  fearGreed: 55,
  smaRatio: 0.04,
};

describe("classifyMarketSentiment", () => {
  it("maps concurrent extremes to the historical low zone", () => {
    const out = classifyMarketSentiment({
      vix: 32,
      rsi: 32,
      fearGreed: 20,
      smaRatio: -0.2,
    });
    expect(out.regime).toBe("low-zone");
    expect(out.pill).toBe("good");
  });

  it("treats the low-zone thresholds as inclusive", () => {
    expect(
      classifyMarketSentiment({
        vix: 32,
        rsi: 32,
        fearGreed: 20,
        smaRatio: null,
      }).regime
    ).toBe("low-zone");
    expect(
      classifyMarketSentiment({
        vix: 31.9,
        rsi: 32,
        fearGreed: 20,
        smaRatio: null,
      }).regime
    ).not.toBe("low-zone");
  });

  it("maps a stretch above the 200-day to stretched higher", () => {
    const out = classifyMarketSentiment({
      vix: 14,
      rsi: 74,
      fearGreed: 78,
      smaRatio: 0.121,
    });
    expect(out.regime).toBe("stretched");
    expect(out.pill).toBe("bad");
    expect(out.panel).toBe("danger");
  });

  it("needs more than 12 percent above the 200-day, not equal to it", () => {
    expect(
      classifyMarketSentiment({
        vix: 14,
        rsi: 80,
        fearGreed: 90,
        smaRatio: 0.12,
      }).regime
    ).not.toBe("stretched");
  });

  it("prefers the low zone over a merely elevated VIX", () => {
    expect(
      classifyMarketSentiment({
        vix: 40,
        rsi: 20,
        fearGreed: 10,
        smaRatio: -0.15,
      }).regime
    ).toBe("low-zone");
  });

  it("prefers stretched higher when VIX is also elevated", () => {
    expect(
      classifyMarketSentiment({
        vix: 26,
        rsi: 80,
        fearGreed: 85,
        smaRatio: 0.2,
      }).regime
    ).toBe("stretched");
  });

  it("flags elevated VIX as higher swings", () => {
    const out = classifyMarketSentiment({
      ...BASE,
      vix: 24,
    });
    expect(out.regime).toBe("elevated");
    expect(out.pill).toBe("warn");
    expect(out.panel).toBe("warn");
  });

  it("flags a soft RSI and Fear & Greed as higher swings without a high VIX", () => {
    expect(
      classifyMarketSentiment({
        vix: 16,
        rsi: 39.9,
        fearGreed: 34.9,
        smaRatio: 0.02,
      }).regime
    ).toBe("elevated");
  });

  it("does not treat RSI 40 and Fear & Greed 35 as the soft pair", () => {
    expect(
      classifyMarketSentiment({
        vix: 16,
        rsi: 40,
        fearGreed: 35,
        smaRatio: 0.02,
      }).regime
    ).not.toBe("elevated");
  });

  it("maps a quiet uptrend to steady trend", () => {
    const out = classifyMarketSentiment(BASE);
    expect(out.regime).toBe("trend");
    expect(out.pill).toBe("brand");
  });

  it("needs Fear & Greed strictly above 50 for a steady trend", () => {
    expect(
      classifyMarketSentiment({
        ...BASE,
        fearGreed: 50,
      }).regime
    ).toBe("mixed");
  });

  it("needs price above the 200-day, not merely on it", () => {
    expect(
      classifyMarketSentiment({
        ...BASE,
        smaRatio: 0,
      }).regime
    ).toBe("mixed");
  });

  it("returns mixed when the gauges do not line up", () => {
    expect(
      classifyMarketSentiment({
        vix: 18,
        rsi: 45,
        fearGreed: 48,
        smaRatio: 0.03,
      }).regime
    ).toBe("mixed");
  });

  it("does not invent a regime from empty metrics", () => {
    const out = classifyMarketSentiment({
      vix: null,
      rsi: null,
      fearGreed: null,
      smaRatio: null,
    });
    expect(out.regime).toBe("unavailable");
    expect(out.pill).toBe("neutral");
  });

  it("does not call a partial set of gauges mixed", () => {
    expect(
      classifyMarketSentiment({
        vix: 18,
        rsi: null,
        fearGreed: null,
        smaRatio: null,
      }).regime
    ).toBe("unavailable");
    expect(
      classifyMarketSentiment({
        vix: 18,
        rsi: 58,
        fearGreed: 55,
        smaRatio: null,
      }).regime
    ).toBe("unavailable");
  });

  it("can still flag higher swings from VIX alone", () => {
    expect(
      classifyMarketSentiment({
        vix: 28,
        rsi: null,
        fearGreed: null,
        smaRatio: null,
      }).regime
    ).toBe("elevated");
  });
});

describe("preferSentimentSnapshot", () => {
  const full: SentimentMetrics = {
    vix: 15,
    rsi: 58,
    fearGreed: 55,
    cryptoFearGreed: 60,
    spyPrice: 580,
    sma200: 540,
    smaRatio: 0.07,
    asOf: "2026-08-26T20:00:00.000Z",
  };
  const vixOnly: SentimentMetrics = {
    ...full,
    rsi: null,
    fearGreed: null,
    cryptoFearGreed: null,
    spyPrice: null,
    sma200: null,
    smaRatio: null,
  };

  it("keeps a complete reading when the next fetch is VIX only", () => {
    expect(preferSentimentSnapshot(full, vixOnly)).toBe(full);
  });

  it("takes a complete fetch over a previous partial", () => {
    expect(preferSentimentSnapshot(vixOnly, full)).toBe(full);
  });

  it("uses the partial when that is all there has ever been", () => {
    expect(preferSentimentSnapshot(null, vixOnly)).toBe(vixOnly);
  });
});

describe("spyMetricsFromCloses", () => {
  it("reads Wilder RSI 100 on a long climb", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(spyMetricsFromCloses(closes).rsi).toBe(100);
    expect(lastDefined(rsi(closes, 14))).toBe(100);
  });

  it("reads Wilder RSI 0 on a long drop", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 - i);
    expect(spyMetricsFromCloses(closes).rsi).toBe(0);
  });

  it("needs 200 closes for the 200-day average", () => {
    const short = Array.from({ length: 199 }, () => 100);
    expect(spyMetricsFromCloses(short).sma200).toBeNull();
    expect(spyMetricsFromCloses(short).smaRatio).toBeNull();

    const long = [...Array.from({ length: 199 }, () => 100), 113];
    const out = spyMetricsFromCloses(long);
    expect(out.sma200).toBeCloseTo((199 * 100 + 113) / 200, 8);
    expect(out.lastClose).toBe(113);
    expect(out.smaRatio).toBeGreaterThan(0.12);
  });

  it("drops non-finite closes rather than poisoning the average", () => {
    const closes = [...Array.from({ length: 200 }, () => 100), Number.NaN];
    expect(spyMetricsFromCloses(closes).lastClose).toBe(100);
    expect(spyMetricsFromCloses(closes).sma200).toBe(100);
    expect(spyMetricsFromCloses(closes).smaRatio).toBe(0);
  });

  it("returns a ratio of price over the 200-day, or nothing", () => {
    expect(smaRatioFrom(112, 100)).toBeCloseTo(0.12);
    expect(smaRatioFrom(null, 100)).toBeNull();
    expect(smaRatioFrom(112, 0)).toBeNull();
  });
});

describe("fearGreedCaption", () => {
  it("names the CNN rating and the crypto score when both exist", () => {
    expect(fearGreedCaption(55, 65)).toBe("neutral · crypto 65");
    expect(fearGreedCaption(12, null)).toBe("extreme fear");
    expect(fearGreedCaption(null, null)).toBe("CNN, 0 to 100");
  });
});

describe("sentiment copy", () => {
  const regimes = Object.keys(SENTIMENT_COPY) as SentimentRegime[];

  it("stays descriptive, with no dash and no instruction to trade", () => {
    for (const regime of regimes) {
      expect(sentimentCopyIsDescriptive(SENTIMENT_COPY[regime])).toBe(true);
      expect(sentimentCopyIsDescriptive(SENTIMENT_LABEL[regime])).toBe(true);
    }
    expect(sentimentCopyIsDescriptive(SENTIMENT_DISCLAIMER)).toBe(true);
  });

  it("names the historical years on the low-zone reading", () => {
    expect(SENTIMENT_COPY["low-zone"]).toContain("2009");
    expect(SENTIMENT_COPY["low-zone"]).toContain("2020");
    expect(SENTIMENT_COPY["low-zone"]).toContain("2022");
  });

  it("does not claim the VIX is elevated on the higher-swings reading", () => {
    expect(SENTIMENT_COPY.elevated).not.toMatch(/VIX is elevated/i);
    expect(SENTIMENT_COPY.elevated).toMatch(/VIX is running high/i);
  });

  it("names the gauges a steady trend actually used", () => {
    expect(SENTIMENT_COPY.trend).toContain("200-day");
    expect(SENTIMENT_COPY.trend).toContain("14-day RSI");
    expect(SENTIMENT_COPY.trend).toContain("Fear & Greed");
    expect(SENTIMENT_COPY.trend).not.toMatch(/\bVIX\b/);
  });

  it("frames the footer as not personalized advice", () => {
    expect(SENTIMENT_DISCLAIMER).toContain("Not personalized investment advice");
    expect(SENTIMENT_DISCLAIMER).toContain("Not a recommendation to buy or sell");
  });
});
