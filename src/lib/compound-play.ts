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

  return [
    {
      id: "mattress",
      label: "Under the mattress",
      tagline: `No growth at all, and rising prices take about ${COMPOUND_INFLATION_ANNUAL_PCT}% a year off what it can buy. An assumption typed into this app.`,
      result: mattress,
      color: PALETTE.muted,
    },
    {
      id: "cash",
      label: "Cash in a savings account",
      tagline: `About ${COMPOUND_CASH_YIELD_ANNUAL_PCT}% a year, roughly what a good savings account has paid lately. An assumption, not a quote.`,
      result: cashYield,
      color: PALETTE.teal,
    },
    {
      id: "spy",
      label: "Index fund",
      tagline: `About ${BROAD_MARKET_ANNUAL_PCT}% a year, the long run average for the whole US market before inflation is taken off.`,
      result: spy,
      color: PALETTE.steel,
    },
    {
      id: "upside",
      label: "Your rate",
      tagline: `${yourRate.toFixed(0)}% a year, the number in the box.`,
      result: upside,
      color: PALETTE.bronze,
    },
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
  ({ result, tip, fmt, rng }) => {
    if (!(result.totalContributions > 0)) return null;
    const tipSuffix = tip
      ? ` Growth passes what you pay in during year ${tip}.`
      : "";
    return beat("Money you pay in", rng, [
      `You would pay in ${fmt(result.totalContributions)} along the way. Your deposits are the fuel, and growth is the curve that bends upward.${tipSuffix}`,
      `${fmt(result.totalContributions)} of that final number would be your own deposits. The rest is growth on top of them.${tipSuffix}`,
      `${fmt(result.totalContributions)} paid in along the way, on top of what you started with. Everything past that is the curve bending.${tipSuffix}`,
    ]);
  },
  ({ result, tip, fmt, rng }) => {
    if (result.totalContributions > 0 || tip != null) return null;
    const doubleText = yearsAndMonths(result.doubleYears, result.doubleMonths);
    return beat("Nothing added", rng, [
      `No fresh deposits, just growth on what is already there. At this rate the pot doubles about every ${doubleText}.`,
      `No new money at all. ${fmt(result.totalInterest)} of the end figure would come from letting it sit.`,
      `This path never sees another deposit. Doubling about every ${doubleText} does the rest.`,
    ]);
  },
  ({ tip, rng }) => {
    if (tip == null) return null;
    return beat("The year growth takes over", rng, [
      `Year ${tip} is when one year of growth would first add more than you pay in. Money working harder than you, which is what the years buy.`,
      `By year ${tip}, a single year of growth would outearn a full year of your deposits.`,
      `Year ${tip} is the turn. From there on growth adds more each year than your own deposits do.`,
    ]);
  },
  ({ result, fmt, rng }) => {
    const mid = result.yearly.find(
      (y) => y.index === Math.floor(result.durationYears / 2)
    );
    if (!mid || mid.index <= 0) return null;
    return beat("Halfway", rng, [
      `Year ${mid.index}: ${fmt(mid.balance)} by then. The second half of the run adds more than the first half does.`,
      `By year ${mid.index} the pot would be ${fmt(mid.balance)}. The back half does the heavier lifting.`,
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
      `At this rate money doubles about every ${doubleText}. That is roughly ${doublings.toFixed(1)} doublings over the whole stretch.`,
      `About ${doubleText} for each double. This many years fits about ${doublings.toFixed(1)} of them.`,
    ]);
  },
  ({ result, fmt, rng }) => {
    const first = result.yearly.find((y) => y.index === 1);
    const last = result.yearly[result.yearly.length - 1];
    if (!first || !last || first.interest <= 0 || last.index <= 1) return null;
    const growthMult = last.interest / first.interest;
    if (!(growthMult >= 1.4)) return null;
    return beat("The curve", rng, [
      `Year 1 would add ${fmt(first.interest)} of growth. The last year would add ${fmt(last.interest)}, ${growthMult.toFixed(1)} times as much, with nothing else changed.`,
      `Growth per year would go from ${fmt(first.interest)} in year 1 to ${fmt(last.interest)} in year ${last.index}, ${growthMult.toFixed(1)} times over. That is the curve, not you, working harder.`,
    ]);
  },
  ({ result, rng }) => {
    if (!(result.effectiveAnnualRate > result.nominalAnnualRate + 0.001)) return null;
    return beat("The rate", rng, [
      `Adding the growth every month rather than once a year turns a stated ${(result.nominalAnnualRate * 100).toFixed(1)}% into ${(result.effectiveAnnualRate * 100).toFixed(1)}% over a full year.`,
      `The stated rate reads ${(result.nominalAnnualRate * 100).toFixed(1)}%. Counting it month by month makes it ${(result.effectiveAnnualRate * 100).toFixed(1)}% over a year.`,
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
  const beats: NarrativeBeat[] = [
    beat("The path", rng, [
      `${from} becomes ${fmt(result.futureValue)} over ${formatHorizon(result.durationYears)}, if this rate holds the whole way. Slow at first, then not.`,
      `${from} would become ${fmt(result.futureValue)} over ${formatHorizon(result.durationYears)}. Slow at first, then not slow at all.`,
      `Over ${formatHorizon(result.durationYears)}, ${from} would grow into ${fmt(result.futureValue)}. Slow at first, then it is not.`,
    ]),
    beat("What growth adds", rng, [
      `${fmt(result.totalInterest)} of that would come from growth rather than from your pocket, which is ${(result.allTimeRoR * 100).toFixed(0)}% on top of what went in.`,
      `${fmt(result.totalInterest)} of the final number would be growth rather than money you paid in, ${(result.allTimeRoR * 100).toFixed(0)}% on top of what went in.`,
      `Of what you would end up with, ${fmt(result.totalInterest)} comes from the arithmetic rather than your wallet, ${(result.allTimeRoR * 100).toFixed(0)}% on top of what went in.`,
    ]),
  ];

  const angleOrder = shuffleInPlace(rng, NARRATIVE_ANGLES.map((_, i) => i));
  for (const idx of angleOrder) {
    if (beats.length >= 5) break;
    const candidate = NARRATIVE_ANGLES[idx]!({ result, tip, fmt, rng });
    if (candidate) beats.push(candidate);
  }

  return beats.slice(0, 5);
}

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
      `Growth this year (${fmt(row.interest)}) would beat what you pay in (${fmt(row.contributions)}). The money starts outworking you here.`,
      `${fmt(row.interest)} of growth against ${fmt(row.contributions)} paid in. Growth would put in more hours than you did.`,
      `You would pay in ${fmt(row.contributions)}, and the arithmetic would add ${fmt(row.interest)} on top of it. That is the turn.`,
      `${fmt(row.interest)} of growth this year, more than the ${fmt(row.contributions)} you would actually pay in.`,
    ]);
  },
  // Still led by deposits, before the turn.
  ({ row, fmt, rng }) => {
    if (!(row.contributions > 0 && row.interest <= row.contributions)) return null;
    return pick(rng, [
      `Your deposits still lead this year: ${fmt(row.contributions)} from you, ${fmt(row.interest)} from growth. The turn comes later.`,
      `${fmt(row.contributions)} of your own money against ${fmt(row.interest)} of growth. On this plan those two swap places later.`,
      `Growth (${fmt(row.interest)}) has not caught your deposits (${fmt(row.contributions)}) yet. On this plan it does later.`,
    ]);
  },
  // No deposits at all in this year.
  ({ row, fmt, rng }) => {
    if (row.contributions !== 0 || row.index <= 0) return null;
    return pick(rng, [
      `Nothing added this year, and the pot would still grow by ${fmt(row.interest)}.`,
      `No deposits, ${fmt(row.interest)} of growth anyway. This is the one thing compounding does.`,
      `You would not add a thing this year. The arithmetic would add ${fmt(row.interest)} for you.`,
    ]);
  },
  // Year on year acceleration.
  ({ row, prevRow, fmt, rng }) => {
    if (!prevRow || prevRow.interest <= 0 || row.interest <= prevRow.interest) return null;
    const delta = row.interest - prevRow.interest;
    return pick(rng, [
      `Growth would go from ${fmt(prevRow.interest)} last year to ${fmt(row.interest)} this year. The snowball picks up speed.`,
      `${fmt(delta)} more growth than the year before, with nothing else changed. That is the curve bending.`,
      `Year on year, growth would be up ${fmt(delta)}. The balance starts doing the work for you.`,
    ]);
  },
  // How many times the starting amount.
  ({ row, result, fmt, rng }) => {
    if (!(result.principal > 0) || row.index <= 0) return null;
    const mult = row.balance / result.principal;
    if (!(mult > 1.05)) return null;
    return pick(rng, [
      `Started at ${fmt(result.principal)}, ${fmt(row.balance)} by then: ${mult.toFixed(1)} times the starting amount.`,
      `${mult.toFixed(1)} times what you started with, and still climbing on this plan.`,
      `The ${fmt(result.principal)} you started with would be ${fmt(row.balance)}, ${mult.toFixed(1)} times over.`,
    ]);
  },
  // Share of the pot that is growth rather than money paid in.
  ({ row, rng }) => {
    if (!(row.balance > 0 && row.accruedInterest > 0)) return null;
    const sharePct = Math.round((row.accruedInterest / row.balance) * 100);
    if (sharePct < 5) return null;
    return pick(rng, [
      `${sharePct}% of the pot by then would be growth you never had to lift a finger for.`,
      `Roughly ${sharePct}% of the pile would be growth rather than your own money.`,
      `${sharePct}% growth, ${100 - sharePct}% money you paid in, and only the growth side keeps climbing.`,
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
      `This is the year the pot would cross ${fmt(crossed)}. A round number crossed.`,
      `${fmt(crossed)}, crossed. Onward.`,
      `Somewhere in year ${row.index} the pot would step past ${fmt(crossed)}.`,
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
      `At this pace the money doubles about every ${doubleText}. Year ${row.index} is about ${doublings.toFixed(1)} doublings in.`,
      `A double about every ${doubleText}. Year ${row.index} puts you ${doublings.toFixed(1)} doublings along.`,
    ]);
  },
  // Growth so far against everything paid in so far.
  ({ row, result, rng }) => {
    const paidIn = result.principal + Math.max(0, row.accruedContributions);
    if (!(paidIn > 0 && row.accruedInterest > 0)) return null;
    const roiSoFar = row.accruedInterest / paidIn;
    if (!(roiSoFar > 0.05)) return null;
    return pick(rng, [
      `By year ${row.index}, growth would have added ${(roiSoFar * 100).toFixed(0)}% on top of everything you had paid in.`,
      `Everything paid in would have earned back ${(roiSoFar * 100).toFixed(0)}% by then, and it keeps growing after that.`,
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
          "The starting line. Nothing has grown yet.",
          "Day one. Every doubling starts here.",
          "The before picture. Come back next year.",
        ])
      );
      continue;
    }

    if (tippingYear != null && year === tippingYear) {
      out.set(
        year,
        pick(rng, [
          `The turn: year ${year} is the first year growth (${fmt(row.interest)}) would add more than the ${fmt(row.contributions)} you pay in. From here the pot mostly carries itself.`,
          `The tipping point. Year ${year}, ${fmt(row.interest)} of growth against ${fmt(row.contributions)} paid in, for the first time.`,
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
      `All ${milestones.length} rungs on this ladder are already crossed. Time for a bigger ladder.`,
      `Every goal on this list is crossed, all ${milestones.length} of them. Set a bigger one.`,
    ]);
  }
  const dateText =
    next.yearsUntil != null
      ? next.targetDate
        ? `around ${formatMilestoneDate(next.targetDate)}, about ${next.yearsUntil.toFixed(1)} years away`
        : `in about ${next.yearsUntil.toFixed(1)} years`
      : "further away than fifty years at this pace";

  return pick(rng, [
    `${hit} of ${milestones.length} crossed. Next is ${fmt(next.goal)}, ${dateText}.`,
    `${hit} of ${milestones.length} crossed. ${fmt(next.goal)} is next, ${dateText}.`,
    `${fmt(next.goal)} is the next line to cross, ${dateText}. ${hit} behind you, ${milestones.length - hit} to go.`,
  ]);
}

export function formatMilestoneDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
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

