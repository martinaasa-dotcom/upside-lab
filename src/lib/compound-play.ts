import {
  calculateCompound,
  type CompoundInputs,
  type CompoundResult,
  type PeriodRow,
} from "@/lib/compound-interest";
import { cagr, finiteNumber } from "@/lib/money";
import { PALETTE } from "@/lib/palette";
import { hashSeed, mulberry32, pick, shuffleInPlace } from "@/lib/seeded-rng";

export type CompareScenario = {
  id: string;
  label: string;
  tagline: string;
  result: CompoundResult;
  color: string;
};

/** First year where period interest exceeds that year's net contributions. */
export function findTippingYear(yearly: PeriodRow[]): number | null {
  for (const row of yearly) {
    if (row.index <= 0) continue;
    if (row.contributions > 0 && row.interest > row.contributions) {
      return row.index;
    }
    if (row.contributions <= 0 && row.interest > 0 && row.index >= 1) {
      // no deposits — tipping is less meaningful; skip
      continue;
    }
  }
  return null;
}

/** Long-run US CPI-ish assumption — illustrative only, for the "real
 * value" mattress contrast, not a forecast. */
export const COMPOUND_INFLATION_ANNUAL_PCT = 3;
/** Rough high-yield-savings / money-market assumption — a genuine
 * alternative to a literal 0%-under-the-mattress comparison. */
export const COMPOUND_CASH_YIELD_ANNUAL_PCT = 4.5;
/**
 * The whole US market's long-run average, before inflation is taken off.
 * This is the rate the calculator opens on, because a page that compounds
 * one number for thirty years should open on the most ordinary number
 * there is rather than on the most flattering one.
 */
export const BROAD_MARKET_ANNUAL_PCT = 10;

/** Deflate a nominal result into "today's dollars" at a fixed annual
 * inflation rate — same principal/deposits, just eroded purchasing power
 * instead of 0% meaning "no change at all". */
function applyInflationErosion(
  result: CompoundResult,
  annualInflationPct: number
): CompoundResult {
  const infl = finiteNumber(annualInflationPct) / 100;
  if (!(infl > -1) || !Number.isFinite(infl)) return result;
  const yearly = result.yearly.map((row) => {
    const factor = Math.pow(1 + infl, row.index);
    const balance =
      Number.isFinite(factor) && factor > 0
        ? row.balance / factor
        : row.balance;
    return { ...row, balance: Number.isFinite(balance) ? balance : 0 };
  });
  const endFactor = Math.pow(1 + infl, Math.max(result.durationYears, 0));
  const futureValue =
    Number.isFinite(endFactor) && endFactor > 0
      ? result.futureValue / endFactor
      : result.futureValue;
  return {
    ...result,
    futureValue,
    totalInterest:
      futureValue - result.principal - Math.max(0, result.totalContributions),
    yearly,
  };
}

/**
 * Four paths for the same money. Every rate here is an assumption, so every
 * tagline says whose assumption it is: nothing on this page is a quote and
 * nothing on it is measured.
 *
 * There used to be a fifth number hidden inside the fourth. The reader's own
 * rate was quietly given six extra points a year for premiums from selling
 * covered calls, for thirty years, and the label still called it "your rate".
 * Nothing may be added to the number in the box without the screen saying so,
 * so the addition is gone rather than named.
 */
export function buildCompareScenarios(inputs: CompoundInputs): CompareScenario[] {
  const years = Math.max(inputs.years, 1);
  const base = { ...inputs, years, compound: "monthly" as const };

  // A literal mattress: 0% nominal, same deposits as everything else so
  // it's an apples-to-apples "what if this exact cash flow earned
  // nothing", then shown in today's purchasing power. Rising prices are
  // the whole point of this line, not a footnote.
  const mattressNominal = calculateCompound({ ...base, ratePercent: 0 });
  const mattress = applyInflationErosion(
    mattressNominal,
    COMPOUND_INFLATION_ANNUAL_PCT
  );

  const cashYield = calculateCompound({
    ...base,
    ratePercent: COMPOUND_CASH_YIELD_ANNUAL_PCT,
    ratePeriod: "annual",
  });

  const spy = calculateCompound({
    ...base,
    ratePercent: BROAD_MARKET_ANNUAL_PCT,
    ratePeriod: "annual",
    contributionMode: inputs.contributionMode,
  });

  const yourRate = toAnnualPct(inputs);
  const upside = calculateCompound({
    ...base,
    ratePercent: yourRate,
    ratePeriod: "annual",
  });

  /*
   * Your rate is only a path of its own when it is actually a different
   * rate.
   *
   * The rate box opens on the market's own long run 10%, which is also the
   * index fund row's rate, so on the default screen the last two rows were
   * the same arithmetic printed twice: identical ending figure, identical
   * growth figure, two labels, and two lines drawn exactly on top of each
   * other in the chart below. A reader meeting "Index fund $157,935" and
   * "Your rate $157,935" reasonably concludes the panel is broken, and the
   * panel's whole job is to show that different rates land in different
   * places. When the two agree there is one path and the index row says so.
   */
  const yourRateIsMarket =
    Math.abs(yourRate - BROAD_MARKET_ANNUAL_PCT) < 0.05;

  return [
    {
      id: "mattress",
      label: "Under the mattress",
      tagline: `No growth, and rising prices take about ${COMPOUND_INFLATION_ANNUAL_PCT}% a year off what it buys. An assumption typed into this app.`,
      result: mattress,
      color: PALETTE.muted,
    },
    {
      id: "cash",
      label: "Savings account",
      tagline: `About ${COMPOUND_CASH_YIELD_ANNUAL_PCT}% a year, roughly a good savings account lately. An assumption, not a quote.`,
      result: cashYield,
      color: PALETTE.teal,
    },
    {
      id: "spy",
      label: yourRateIsMarket ? "Index fund, and your rate" : "Index fund",
      tagline: yourRateIsMarket
        ? `About ${BROAD_MARKET_ANNUAL_PCT}% a year, the whole US market's long run average before inflation. Also the number in your box.`
        : `About ${BROAD_MARKET_ANNUAL_PCT}% a year, the whole US market's long run average before inflation.`,
      result: spy,
      color: yourRateIsMarket ? PALETTE.bronze : PALETTE.steel,
    },
    ...(yourRateIsMarket
      ? []
      : [
          {
            id: "upside",
            label: "Your rate",
            tagline: `${yourRate.toFixed(0)}% a year, the number in the box.`,
            result: upside,
            color: PALETTE.bronze,
          },
        ]),
  ];
}

function toAnnualPct(inputs: CompoundInputs): number {
  const r = inputs.ratePercent;
  switch (inputs.ratePeriod) {
    case "annual":
      return r;
    case "monthly":
      return r * 12;
    case "quarterly":
      return r * 4;
    case "daily":
      return r * 365;
  }
}

export function storyYears(horizon: number): number[] {
  const candidates = [1, 3, 5, 7, 10, 15, 20, 25, 30];
  const picked = candidates.filter((y) => y <= Math.max(horizon, 1));
  if (!picked.includes(horizon) && horizon > 0) picked.push(horizon);
  return picked.slice(0, 6);
}

export type NarrativeBeat = {
  label: string;
  body: string;
};

type NarrativeAngle = (ctx: {
  result: CompoundResult;
  tip: number | null;
  fmt: MoneyText;
  rng: () => number;
}) => NarrativeBeat | null;

/**
 * How a figure is written. The calculator can be switched to euros, and it
 * used to hand these sentences a dollar formatter of their own, so the
 * heading said one currency and the sentence under it said another about the
 * same pot.
 */
export type MoneyText = (amountUsd: number) => string;

function beat(label: string, rng: () => number, bodies: string[]): NarrativeBeat {
  return { label, body: pick(rng, bodies) };
}

/**
 * Every sentence here is about a projection, so none of them may be written
 * in the past tense: this is what one typed rate would do, never what any
 * market did.
 */
const NARRATIVE_ANGLES: NarrativeAngle[] = [
  ({ result, fmt, rng }) => {
    if (!(result.totalContributions > 0)) return null;
    return beat("Money you pay in", rng, [
      `You would pay in ${fmt(result.totalContributions)} along the way.`,
      `${fmt(result.totalContributions)} of the end figure would be your own deposits.`,
      `${fmt(result.totalContributions)} paid in along the way.`,
    ]);
  },
  ({ result, tip, fmt, rng }) => {
    if (result.totalContributions > 0 || tip != null) return null;
    const doubleText = yearsAndMonths(result.doubleYears, result.doubleMonths);
    return beat("Nothing added", rng, [
      `No new money, just growth. The pot doubles about every ${doubleText}.`,
      `No new money. ${fmt(result.totalInterest)} of the end figure would be growth.`,
      `No deposits at all. Doubling about every ${doubleText} does the rest.`,
    ]);
  },
  /*
   * There is deliberately no beat about the year growth takes over, and no
   * suffix about it either.
   *
   * That year already sits on the paths chart's own pill a screen above,
   * "Growth takes over in year N", with the sentence behind it. A beat here
   * said the same thing in the same words, and so did the suffix that
   * used to hang off "Money you pay in", so the panel that exists to add
   * something was spending its room repeating a pill.
   */
  ({ result, fmt, rng }) => {
    const mid = result.yearly.find(
      (y) => y.index === Math.floor(result.durationYears / 2)
    );
    if (!mid || mid.index <= 0) return null;
    return beat("Halfway", rng, [
      `${fmt(mid.balance)} by year ${mid.index}. The second half adds more than the first.`,
      `${fmt(mid.balance)} by year ${mid.index}. The back half does more of the work.`,
    ]);
  },
  ({ result, rng }) => {
    if (!Number.isFinite(result.doubleYears) || result.durationYears <= 0) return null;
    const doubleYearsExact = result.doubleYears + result.doubleMonths / 12;
    if (!(doubleYearsExact > 0)) return null;
    const doublings = result.durationYears / doubleYearsExact;
    if (!(doublings >= 0.4)) return null;
    const doubleText = yearsAndMonths(result.doubleYears, result.doubleMonths);
    return beat("Doubling", rng, [
      `Money doubles about every ${doubleText} here, ${doublings.toFixed(1)} times over the stretch.`,
      `About ${doubleText} per double, so about ${doublings.toFixed(1)} doublings in all.`,
    ]);
  },
  ({ result, fmt, rng }) => {
    const first = result.yearly.find((y) => y.index === 1);
    const last = result.yearly[result.yearly.length - 1];
    if (!first || !last || first.interest <= 0 || last.index <= 1) return null;
    const growthMult = last.interest / first.interest;
    if (!(growthMult >= 1.4)) return null;
    return beat("The curve", rng, [
      `Year 1 would add ${fmt(first.interest)}. The last year would add ${fmt(last.interest)}, ${growthMult.toFixed(1)} times as much.`,
      `Growth per year would go from ${fmt(first.interest)} to ${fmt(last.interest)}, ${growthMult.toFixed(1)} times over.`,
    ]);
  },
  ({ result, rng }) => {
    if (!(result.effectiveAnnualRate > result.nominalAnnualRate + 0.001)) return null;
    return beat("The rate", rng, [
      `Added monthly, a stated ${(result.nominalAnnualRate * 100).toFixed(1)}% works out to ${(result.effectiveAnnualRate * 100).toFixed(1)}% a year.`,
      `Counted month by month, ${(result.nominalAnnualRate * 100).toFixed(1)}% becomes ${(result.effectiveAnnualRate * 100).toFixed(1)}% over a year.`,
    ]);
  },
];

export function buildNarrative(
  result: CompoundResult,
  fmt: MoneyText = usdText
): NarrativeBeat[] {
  const tip = findTippingYear(result.yearly);
  const seed = hashSeed(
    `upside-narrative|${result.principal}|${result.totalInterest.toFixed(0)}|${result.durationYears.toFixed(2)}|${result.totalContributions.toFixed(0)}`
  );
  const rng = mulberry32(seed);

  const from =
    result.totalContributions > 0
      ? `${fmt(result.principal)} plus what you pay in`
      : fmt(result.principal);

  /*
   * The panel opens on an angle, not on the figures the reader has already
   * read.
   *
   * This list used to start with two fixed beats, "The path" and "What
   * growth adds", and every figure in both was already on screen: the
   * ending value is the hero figure at the top of the room, the growth
   * figure and its share are the score cell beside it, and the percentage
   * on top of what went in is the total return cell. So a panel titled
   * "What this actually tells you" opened by telling the reader what they
   * had just been told, twice, and the genuinely new observations were
   * pushed below them. The angles are what the figures cannot say on their
   * own: when growth overtakes the deposits, what the halfway point looks
   * like, how much steeper the last year is than the first. Those are the
   * panel now.
   *
   * `fallbackPath` is kept for the one shape where every angle stands down,
   * because a panel with a heading and nothing under it reads as content
   * that failed to arrive.
   */
  const fallbackPath = (): NarrativeBeat =>
    beat("The path", rng, [
      `${from} becomes ${fmt(result.futureValue)} over ${formatHorizon(result.durationYears)} if this rate holds. Slow at first, then not.`,
      `${from} would become ${fmt(result.futureValue)} over ${formatHorizon(result.durationYears)}. Slow at first, then fast.`,
      `Over ${formatHorizon(result.durationYears)}, ${from} would grow into ${fmt(result.futureValue)}.`,
    ]);

  const beats: NarrativeBeat[] = [];
  const angleOrder = shuffleInPlace(rng, NARRATIVE_ANGLES.map((_, i) => i));
  for (const idx of angleOrder) {
    if (beats.length >= NARRATIVE_BEATS) break;
    const candidate = NARRATIVE_ANGLES[idx]!({ result, tip, fmt, rng });
    if (candidate) beats.push(candidate);
  }
  if (beats.length === 0) beats.push(fallbackPath());

  return beats.slice(0, NARRATIVE_BEATS);
}

/*
 * Two, not five. Five beats of two sentences each was the longest block
 * of prose in the room, under a chart that already draws most of it, and
 * three still left the room's last panel reading as a paragraph. Two is
 * enough to say something the figures above do not.
 */
const NARRATIVE_BEATS = 2;

/** The fallback for a caller with no currency of its own. */
function usdText(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

/** "7 years and 3 months", never "7y 3m". */
function yearsAndMonths(years: number, months: number): string {
  const y = `${years} ${years === 1 ? "year" : "years"}`;
  if (!(months > 0)) return y;
  return `${y} and ${months} ${months === 1 ? "month" : "months"}`;
}

function formatHorizon(years: number): string {
  const y = Math.floor(years);
  const m = Math.round((years - y) * 12);
  return yearsAndMonths(y, m);
}

const MILESTONE_ROUNDS = [
  50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000, 3_000_000,
  4_000_000, 5_000_000, 7_500_000, 10_000_000,
];

type YearStoryAngle = (ctx: {
  row: PeriodRow;
  prevRow: PeriodRow | null;
  result: CompoundResult;
  fmt: MoneyText;
  rng: () => number;
}) => string | null;

/** Different lenses on the same year so the story never feels canned. */
const YEAR_STORY_ANGLES: YearStoryAngle[] = [
  // Growth out-earning the money paid in that year.
  ({ row, fmt, rng }) => {
    if (!(row.contributions > 0 && row.interest > row.contributions)) return null;
    return pick(rng, [
      `Growth this year (${fmt(row.interest)}) would beat what you pay in (${fmt(row.contributions)}).`,
      `${fmt(row.interest)} of growth against ${fmt(row.contributions)} paid in. Growth would do more than you.`,
      `You would pay in ${fmt(row.contributions)}, and growth would add ${fmt(row.interest)}.`,
      `${fmt(row.interest)} of growth this year, more than the ${fmt(row.contributions)} you would pay in.`,
    ]);
  },
  // Still led by deposits, before the turn.
  ({ row, fmt, rng }) => {
    if (!(row.contributions > 0 && row.interest <= row.contributions)) return null;
    return pick(rng, [
      `Your deposits still lead: ${fmt(row.contributions)} from you, ${fmt(row.interest)} from growth.`,
      `${fmt(row.contributions)} of your own money against ${fmt(row.interest)} of growth. They swap places later.`,
      `Growth (${fmt(row.interest)}) has not caught your deposits (${fmt(row.contributions)}) yet.`,
    ]);
  },
  // No deposits at all in this year.
  ({ row, fmt, rng }) => {
    if (row.contributions !== 0 || row.index <= 0) return null;
    return pick(rng, [
      `Nothing added this year, and the pot would still grow by ${fmt(row.interest)}.`,
      `No deposits, and ${fmt(row.interest)} of growth anyway.`,
      `You would add nothing this year. Growth would add ${fmt(row.interest)}.`,
    ]);
  },
  // Year on year acceleration.
  ({ row, prevRow, fmt, rng }) => {
    if (!prevRow || prevRow.interest <= 0 || row.interest <= prevRow.interest) return null;
    const delta = row.interest - prevRow.interest;
    return pick(rng, [
      `Growth would rise from ${fmt(prevRow.interest)} last year to ${fmt(row.interest)}.`,
      `${fmt(delta)} more growth than the year before, with nothing else changed.`,
      `Year on year, growth would be up ${fmt(delta)}.`,
    ]);
  },
  // How many times the starting amount.
  ({ row, result, fmt, rng }) => {
    if (!(result.principal > 0) || row.index <= 0) return null;
    const mult = row.balance / result.principal;
    if (!(mult > 1.05)) return null;
    return pick(rng, [
      `From ${fmt(result.principal)} to ${fmt(row.balance)}: ${mult.toFixed(1)} times the start.`,
      `${mult.toFixed(1)} times what you started with, and still climbing.`,
      `The ${fmt(result.principal)} you started with would be ${fmt(row.balance)}.`,
    ]);
  },
  // Share of the pot that is growth rather than money paid in.
  ({ row, rng }) => {
    if (!(row.balance > 0 && row.accruedInterest > 0)) return null;
    const sharePct = Math.round((row.accruedInterest / row.balance) * 100);
    if (sharePct < 5) return null;
    return pick(rng, [
      `${sharePct}% of the pot would be growth by then.`,
      `About ${sharePct}% of it would be growth, not your own money.`,
      `${sharePct}% growth, ${100 - sharePct}% money you paid in.`,
    ]);
  },
  // Round number crossed in this particular year.
  ({ row, prevRow, fmt, rng }) => {
    const prevBalance = prevRow?.balance ?? 0;
    const crossed = [...MILESTONE_ROUNDS]
      .filter((m) => prevBalance < m && row.balance >= m)
      .pop();
    if (crossed == null) return null;
    return pick(rng, [
      `The pot would cross ${fmt(crossed)} this year.`,
      `This year the pot would pass ${fmt(crossed)}.`,
      `Somewhere in year ${row.index} the pot would pass ${fmt(crossed)}.`,
    ]);
  },
  // Doubling pace.
  ({ row, result, rng }) => {
    if (!(result.doubleYears < 60) || row.index <= 0) return null;
    const doubleYearsExact = result.doubleYears + result.doubleMonths / 12;
    if (!(doubleYearsExact > 0)) return null;
    const doublings = row.index / doubleYearsExact;
    if (!(doublings >= 0.4)) return null;
    const doubleText = yearsAndMonths(result.doubleYears, result.doubleMonths);
    return pick(rng, [
      `It doubles about every ${doubleText}. Year ${row.index} is ${doublings.toFixed(1)} doublings in.`,
      `A double about every ${doubleText}, so ${doublings.toFixed(1)} by year ${row.index}.`,
    ]);
  },
  // Growth so far against everything paid in so far.
  ({ row, result, rng }) => {
    const paidIn = result.principal + Math.max(0, row.accruedContributions);
    if (!(paidIn > 0 && row.accruedInterest > 0)) return null;
    const roiSoFar = row.accruedInterest / paidIn;
    if (!(roiSoFar > 0.05)) return null;
    return pick(rng, [
      `By year ${row.index}, growth would add ${(roiSoFar * 100).toFixed(0)}% on top of everything paid in.`,
      `Everything paid in would have grown ${(roiSoFar * 100).toFixed(0)}% by then.`,
    ]);
  },
];

/**
 * One story per requested year, deterministic for a given result + year set,
 * round-robined across different angles so tabs don't repeat the same
 * template — that repetition was the whole complaint with the old version.
 */
export function buildYearStories(
  result: CompoundResult,
  years: number[],
  tippingYear: number | null,
  fmt: MoneyText = usdText
): Map<number, string> {
  const out = new Map<number, string>();
  const seed = hashSeed(
    `upside-year-story|${result.principal}|${result.totalInterest.toFixed(0)}|${years.join(",")}`
  );
  const rng = mulberry32(seed);
  const angleOrder = shuffleInPlace(rng, YEAR_STORY_ANGLES.map((_, i) => i));

  let rotation = 0;
  for (const year of years) {
    const row = result.yearly.find((y) => y.index === year);
    if (!row) continue;
    const prevRow = result.yearly.find((y) => y.index === year - 1) ?? null;

    if (row.index === 0) {
      out.set(
        year,
        pick(rng, [
          "The start. Nothing has grown yet.",
          "Day one. Every doubling starts here.",
          "The before picture.",
        ])
      );
      continue;
    }

    if (tippingYear != null && year === tippingYear) {
      out.set(
        year,
        pick(rng, [
          `The turn: the first year growth (${fmt(row.interest)}) would beat the ${fmt(row.contributions)} you pay in.`,
          `The tipping point: ${fmt(row.interest)} of growth against ${fmt(row.contributions)} paid in.`,
        ])
      );
      continue;
    }

    let picked: string | null = null;
    for (let i = 0; i < angleOrder.length; i++) {
      const angle = YEAR_STORY_ANGLES[angleOrder[(rotation + i) % angleOrder.length]!]!;
      const candidate = angle({ row, prevRow, result, fmt, rng });
      if (candidate) {
        picked = candidate;
        rotation += i + 1;
        break;
      }
    }
    out.set(
      year,
      picked ??
        `Growth this year: ${fmt(row.interest)}. Growth so far: ${fmt(row.accruedInterest)}.`
    );
  }

  return out;
}

/**
 * Net-worth ladder. Tight steps while the number is still small, then
 * round millions from $1M, then $7.5M and $10M after $5M.
 */
export const COMPOUND_MILESTONE_GOALS = [
  25_000, 50_000, 75_000,
  100_000, 150_000, 200_000, 250_000, 300_000, 350_000, 400_000, 450_000,
  500_000, 750_000,
  1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000,
  7_500_000, 10_000_000,
] as const;

export const MILESTONE_ACTUALS_KEY = "upside-compound-milestone-actuals-v1";

export type MilestoneActuals = Record<string, string>; // goal → YYYY-MM-DD

export type CompoundMilestone = {
  goal: number;
  /** Already at/above this goal from current principal. */
  hit: boolean;
  /** Fractional years from now until balance crosses goal (0 if hit). */
  yearsUntil: number | null;
  /** Calendar target if yearsUntil is known. */
  targetDate: Date | null;
  /** Stored hit date (local), if any. */
  actualDate: string | null;
  /** Annual % used for this projection (from compounder dial). */
  estGrowthPct: number;
  /**
   * CAGR between this hit goal and the previous hit goal, when both have
   * actual dates. Null for projections / incomplete history.
   */
  cagrPct: number | null;
};

/** One-line summary of milestone progress for the top of the tracker. */
export function buildMilestoneTakeaway(
  milestones: CompoundMilestone[],
  fmt: MoneyText = usdText
): string | null {
  if (!milestones.length) return null;
  const hit = milestones.filter((m) => m.hit || m.actualDate).length;
  const next = milestones.find((m) => !m.hit && !m.actualDate);
  const seed = hashSeed(`upside-milestones|${hit}|${next?.goal ?? 0}`);
  const rng = mulberry32(seed);

  if (!next) {
    return pick(rng, [
      `All ${milestones.length} round numbers here are crossed.`,
      `Every round number here is crossed, all ${milestones.length}.`,
    ]);
  }
  /*
   * The date itself is on the first row of the ladder directly below, so
   * the sentence carries the wait and not the date a second time.
   */
  const dateText =
    next.yearsUntil != null
      ? `in about ${next.yearsUntil.toFixed(1)} years`
      : "more than fifty years out at this pace";

  return pick(rng, [
    `${hit} of ${milestones.length} crossed. Next: ${fmt(next.goal)}, ${dateText}.`,
    `Next is ${fmt(next.goal)}, ${dateText}.`,
    `${fmt(next.goal)} is next, ${dateText}.`,
  ]);
}

export function formatMilestoneDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** A projected milestone: the month it lands in, not a day. */
export function formatMilestoneMonth(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

export function loadMilestoneActuals(): MilestoneActuals {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(MILESTONE_ACTUALS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as MilestoneActuals;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveMilestoneActuals(actuals: MilestoneActuals) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MILESTONE_ACTUALS_KEY, JSON.stringify(actuals));
  } catch {
    /* ignore */
  }
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

function yearsBetweenKeys(fromIso: string, toIso: string): number | null {
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return (b - a) / (365.25 * 24 * 3600 * 1000);
}

/**
 * Build the milestone ladder from the live compounder dial.
 * Est. growth = the dialed annual rate (same path for every future goal).
 * Target / Years until recompute whenever principal, rate, or deposits change.
 */
export function buildCompoundMilestones(opts: {
  inputs: CompoundInputs;
  annualRatePct: number;
  actuals?: MilestoneActuals;
  asOf?: Date;
  goals?: readonly number[];
  maxYears?: number;
}): CompoundMilestone[] {
  const {
    inputs,
    annualRatePct,
    actuals = {},
    asOf = new Date(),
    goals = COMPOUND_MILESTONE_GOALS,
    maxYears = 50,
  } = opts;

  const pending = goals.filter((g) => g > inputs.principal);
  const sim =
    pending.length > 0
      ? calculateCompound({ ...inputs, years: maxYears, months: 0 })
      : null;

  const monthHits = new Map<number, number>();
  if (sim) {
    for (const goal of pending) {
      for (const row of sim.monthly) {
        if (row.index > 0 && row.balance >= goal) {
          monthHits.set(goal, row.index);
          break;
        }
      }
    }
  }

  const rows: CompoundMilestone[] = goals.map((goal) => {
    const hit = inputs.principal >= goal;
    if (hit) {
      return {
        goal,
        hit: true,
        yearsUntil: 0,
        targetDate: null,
        actualDate: actuals[String(goal)] ?? null,
        estGrowthPct: annualRatePct,
        cagrPct: null,
      };
    }
    const months = monthHits.get(goal) ?? null;
    const yearsUntil =
      months == null ? null : Math.round((months / 12) * 10) / 10;
    return {
      goal,
      hit: false,
      yearsUntil,
      targetDate: months == null ? null : addMonths(asOf, months),
      actualDate: actuals[String(goal)] ?? null,
      estGrowthPct: annualRatePct,
      cagrPct: null,
    };
  });

  // CAGR between consecutive goals that both have actual dates
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]!;
    const cur = rows[i]!;
    if (!prev.actualDate || !cur.actualDate || prev.goal <= 0) continue;
    const yrs = yearsBetweenKeys(prev.actualDate, cur.actualDate);
    if (yrs == null || yrs <= 0) continue;
    const growth = cagr(prev.goal, cur.goal, yrs);
    if (growth == null) continue;
    cur.cagrPct = Math.round(growth * 1000) / 10;
  }

  return rows;
}

