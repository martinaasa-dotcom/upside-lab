/**
 * Turns the raw indicator numbers from trends-cache into something a
 * complete novice can read in one glance: a verdict, a plain sentence,
 * and the handful of signals that back it up.
 *
 * Deliberately a pure function over plain data (no fetching, no React) so
 * it's the same story-building logic on server and client, and testable
 * without touching the network.
 */
import { NO_VALUE, currency } from "@/lib/format";

export type TrendRegime =
  | "strong-up"
  | "weakening"
  | "strong-down"
  | "recovering"
  | "flat";

export type TrendRowLike = {
  ticker: string;
  regime: TrendRegime;
  aboveLongMa: boolean | null;
  rsi: number | null;
  macdBuilding: boolean | null;
  divergence: {
    kind: "bearish" | "bullish";
    weeksAgo: number;
    priceFrom: number;
    priceTo: number;
    rsiFrom: number;
    rsiTo: number;
  } | null;
  rs13: number | null;
  rs26: number | null;
  /** Raw price change over the last 2 / 4 weekly closes — fast enough to
   * catch a post-earnings re-rate before the slower trend/momentum reads
   * below have had time to react to it. */
  chg2w: number | null;
  chg4w: number | null;
  lastClose?: number | null;
  longMa?: number | null;
  vsLongMaPct?: number | null;
  longSlopePct?: number | null;
  macdHistogram?: number | null;
  macdHistogramPrev?: number | null;
};

export type Tone = "gain" | "loss" | "warn" | "neutral";

export type Signal = {
  key: string;
  label: string;
  value: string;
  tone: Tone;
  /** Compact scan chips under the figure. Methodology lives in `help`. */
  detail: string[];
  help: string;
};

export type TrendStory = {
  headline: string;
  tone: Tone;
  sentence: string;
  signals: Signal[];
  /** True when this name's story is actually moving, so it's worth surfacing first. */
  attention: boolean;
  /** Rough priority for sorting: higher sorts first. */
  priority: number;
};

const REGIME_BASE: Record<
  TrendRegime,
  { headline: string; tone: Tone; sentence: string }
> = {
  "strong-up": {
    headline: "Strong uptrend",
    tone: "gain",
    sentence: "TICKER is trending up: it's above its long-term average, and that average is still climbing.",
  },
  weakening: {
    headline: "Trend rolling over",
    tone: "warn",
    sentence: "TICKER is still above its long-term average, but that average has started turning down, often the first sign a trend is running out of road.",
  },
  "strong-down": {
    headline: "Downtrend",
    tone: "loss",
    sentence: "TICKER is trending down: it's below its long-term average, and that average is still falling.",
  },
  recovering: {
    headline: "Turning up",
    tone: "gain",
    sentence: "TICKER is still below its long-term average, but that average has started rising, an early sign of a turn.",
  },
  flat: {
    headline: "No clear trend",
    tone: "neutral",
    sentence: "TICKER isn't showing enough direction to call a trend either way right now.",
  },
};

/**
 * Divergence either reinforces or contradicts the regime's story. When it
 * contradicts, that's the actual news, so it wins the headline. All
 * sentences carry a literal "TICKER" placeholder swapped in at the end,
 * so composing them never risks doubling or misplacing the ticker name.
 */
function applyDivergence(
  base: { headline: string; tone: Tone; sentence: string },
  divergence: TrendRowLike["divergence"]
): { headline: string; tone: Tone; sentence: string } {
  if (!divergence) return base;
  const bearish = divergence.kind === "bearish";
  const bullishBase = base.tone === "gain";
  const bearishBase = base.tone === "loss";

  // Divergence agrees with the trend: reinforces it, doesn't change the verdict.
  if ((bearish && bearishBase) || (!bearish && bullishBase)) {
    return {
      headline: base.headline,
      tone: base.tone,
      sentence: `${base.sentence} Momentum backs that up too.`,
    };
  }

  // Divergence fights an uptrend: the warning is the headline.
  if (bearish && bullishBase) {
    return {
      headline: "Uptrend losing power",
      tone: "warn",
      sentence:
        "TICKER is still trending up, but each new high has come with less force behind it than the last one. That's usually the first crack, not the break itself.",
    };
  }

  // Divergence fights a downtrend: possible early turn.
  if (!bearish && bearishBase) {
    return {
      headline: "Downtrend, but showing cracks",
      tone: "warn",
      sentence:
        "TICKER is still trending down, but the latest low came with less selling force than the one before it. Often the first sign before a bottom, not a guarantee of one.",
    };
  }

  // Neutral/weakening/recovering regime plus a divergence that doesn't
  // cleanly agree: flag it as mixed rather than force a false clarity.
  return {
    headline: "Mixed signals",
    tone: "neutral",
    sentence:
      "TICKER's long-term trend and its recent momentum are pointing in different directions right now. No clean story yet, worth watching rather than acting on.",
  };
}

/** 2-week move ≥15%, or 4-week move ≥25% — big enough that it's very
 * unlikely to be normal daily noise, small enough that it still fires for
 * real catalysts (a beat-and-raise print, a guidance cut) without tripping
 * on every ordinary rally. */
const SURGE_2W = 0.15;
const SURGE_4W = 0.25;

type Surge = { weeks: 2 | 4; pct: number };

function detectSurge(row: TrendRowLike): Surge | null {
  if (row.chg2w != null && Math.abs(row.chg2w) >= SURGE_2W) {
    return { weeks: 2, pct: row.chg2w };
  }
  if (row.chg4w != null && Math.abs(row.chg4w) >= SURGE_4W) {
    return { weeks: 4, pct: row.chg4w };
  }
  return null;
}

/**
 * The 40-week trend line is deliberately slow, so it can keep calling a
 * name "weakening" for a couple of weeks after a catalyst — a blowout
 * earnings beat, a guidance raise — has already sent the price sharply
 * the other way. When the raw recent move flatly disagrees with the slow
 * read, the recent move is the actual news and wins the headline; the
 * slow read still shows up as a supporting signal below, just not as the
 * verdict. If the two already agree, this only adds color, not a new verdict.
 */
function applySurge(
  base: { headline: string; tone: Tone; sentence: string },
  surge: Surge | null
): { headline: string; tone: Tone; sentence: string } {
  if (!surge) return base;
  const bullish = surge.pct > 0;
  const alreadyAgrees = bullish ? base.tone === "gain" : base.tone === "loss";
  if (alreadyAgrees) return base;

  const pctText = `${surge.pct >= 0 ? "+" : ""}${(surge.pct * 100).toFixed(0)}%`;
  const weeksText = surge.weeks === 2 ? "two weeks" : "four weeks";
  if (bullish) {
    return {
      headline: "Sharp move higher",
      tone: "gain",
      sentence: `TICKER is up ${pctText} over the last ${weeksText}, a move sharp enough that the slower trend read below hasn't caught up to it yet. Worth checking what drove it, a beat, a guidance raise, a re-rate, rather than trusting the lagging trend label on its own.`,
    };
  }
  return {
    headline: "Sharp move lower",
    tone: "loss",
    sentence: `TICKER is down ${pctText} over the last ${weeksText}, a drop sharp enough that the slower trend read below hasn't caught up to it yet. Worth checking whether something actually broke before writing it off as noise.`,
  };
}

function rsiZone(rsi: number | null): { label: string; tone: Tone } {
  if (rsi == null) return { label: NO_VALUE, tone: "neutral" };
  if (rsi >= 70) return { label: "Overbought", tone: "warn" };
  if (rsi <= 30) return { label: "Oversold", tone: "gain" };
  return { label: "Neutral", tone: "neutral" };
}

function rsText(v: number | null): string {
  if (v == null) return NO_VALUE;
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

function signedPct(v: number | null, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return NO_VALUE;
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;
}

function arrow(v: number): "↑" | "↓" | "→" {
  if (v > 0) return "↑";
  if (v < 0) return "↓";
  return "→";
}

function trendDetail(row: TrendRowLike): string[] {
  const price = row.lastClose;
  const ma = row.longMa;
  const vs = row.vsLongMaPct;
  const slope = row.longSlopePct;
  if (price == null || ma == null || vs == null) {
    return ["Needs about 40 weekly closes for a 40-week average."];
  }
  const chips = [
    `${arrow(vs)} ${(Math.abs(vs) * 100).toFixed(1)}% vs 40-week (${currency(price)} vs ${currency(ma)})`,
  ];
  if (slope == null) {
    chips.push("40-week slope needs more history.");
  } else {
    chips.push(
      `40-week ${arrow(slope)} ${(Math.abs(slope) * 100).toFixed(1)}% / 8 weeks`
    );
  }
  return chips;
}

export function buildTrendStory(row: TrendRowLike): TrendStory {
  const base = REGIME_BASE[row.regime];
  const withDivergence = applyDivergence(base, row.divergence);
  const surge = detectSurge(row);
  const withSurge = applySurge(withDivergence, surge);
  const zone = rsiZone(row.rsi);

  const hist = row.macdHistogram ?? null;
  const histPrev = row.macdHistogramPrev ?? null;

  const signals: Signal[] = [
    {
      key: "trend",
      label: "Trend",
      value:
        row.regime === "strong-up"
          ? "Uptrend"
          : row.regime === "strong-down"
            ? "Downtrend"
            : row.regime === "weakening"
              ? "Weakening"
              : row.regime === "recovering"
                ? "Turning up"
                : "No trend",
      tone: REGIME_BASE[row.regime].tone,
      detail: trendDetail(row),
      help: "Price versus its own 40-week average, plus whether that average rose or fell over the last 8 weeks. Rising or falling needs more than a 0.5% slope. This is slow on purpose, so a sharp 2-week move can disagree with it for a while.",
    },
    {
      key: "recent",
      label: "Last 2 weeks",
      value: signedPct(row.chg2w),
      tone: row.chg2w == null ? "neutral" : row.chg2w >= 0 ? "gain" : "loss",
      detail:
        row.chg2w == null && row.chg4w == null
          ? ["Not enough weekly closes yet."]
          : [`2w ${signedPct(row.chg2w)}`, `4w ${signedPct(row.chg4w)}`],
      help: "Raw price change over the last two weekly closes, and the four-week change next to it. Usually the first place a real catalyst shows up.",
    },
    {
      key: "momentum",
      label: "Momentum",
      value:
        row.macdBuilding == null ? NO_VALUE : row.macdBuilding ? "Building" : "Fading",
      tone:
        row.macdBuilding == null
          ? "neutral"
          : row.macdBuilding
            ? "gain"
            : "neutral",
      detail:
        hist != null && histPrev != null
          ? [`${hist.toFixed(2)} now`, `${histPrev.toFixed(2)} 4w ago`]
          : ["Not enough weekly history."],
      help: "Whether the weekly momentum reading (12/26/9-week averages) is larger now than it was 4 weeks ago. Speeding up or losing pace, separate from which way price is going.",
    },
    {
      key: "rsi",
      label: "RSI",
      value: row.rsi == null ? NO_VALUE : `${row.rsi.toFixed(0)} · ${zone.label}`,
      tone: zone.tone,
      detail:
        row.rsi == null
          ? ["Not enough weekly history."]
          : ["70 overbought · 30 oversold"],
      help: "14-week RSI, the same formula a charting app shows, computed on weekly closes instead of daily.",
    },
    {
      key: "rs",
      label: "vs S&P (13w)",
      value: rsText(row.rs13),
      tone: row.rs13 == null ? "neutral" : row.rs13 >= 0 ? "gain" : "loss",
      detail:
        row.rs13 == null && row.rs26 == null
          ? ["Needs history for this name and the S&P."]
          : [`13w ${rsText(row.rs13)}`, `26w ${rsText(row.rs26)}`],
      help: "This name's return minus the S&P 500 over 13 weeks, and 26 weeks. Positive means it beat the index, not just rose with everything else.",
    },
  ];

  const attention =
    Boolean(row.divergence) ||
    Boolean(surge) ||
    row.regime === "weakening" ||
    row.regime === "recovering";

  // Rough sort priority: a surge or divergence fighting the slow trend is
  // the loudest story, then a regime that's actively changing, then
  // everything else ranked by how much it's leading or lagging the index.
  let priority = row.rs13 ?? 0;
  if (row.divergence) priority += withDivergence.tone === "warn" ? 10 : 3;
  if (surge && withSurge.headline !== withDivergence.headline) priority += 8;
  if (row.regime === "weakening" || row.regime === "recovering") priority += 5;

  return {
    headline: withSurge.headline,
    tone: withSurge.tone,
    sentence: withSurge.sentence.replace("TICKER", row.ticker),
    signals,
    attention,
    priority,
  };
}
