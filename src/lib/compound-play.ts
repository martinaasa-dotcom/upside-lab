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

/** Earliest year balance crosses goal (inclusive). */
export function yearsToGoal(
  yearly: PeriodRow[],
  goal: number
): number | null {
  if (goal <= 0) return null;
  for (const row of yearly) {
    if (row.balance >= goal) return row.index;
  }
  return null;
}

/** Fraction of goal reached (0–1+). */
export function goalProgress(balance: number, goal: number): number {
  if (!(goal > 0) || !Number.isFinite(goal) || !Number.isFinite(balance)) {
    return 0;
  }
  return Math.max(0, balance / goal);
}

/** Long-run US CPI-ish assumption — illustrative only, for the "real
 * value" mattress contrast, not a forecast. */
export const COMPOUND_INFLATION_ANNUAL_PCT = 3;
/** Rough high-yield-savings / money-market assumption — a genuine
 * alternative to a literal 0%-under-the-mattress comparison. */
export const COMPOUND_CASH_YIELD_ANNUAL_PCT = 4.5;

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

export function buildCompareScenarios(
  inputs: CompoundInputs,
  /** Extra annual % from covered-call premiums (e.g. 6). */
  ccBoostPercent = 6
): CompareScenario[] {
  const years = Math.max(inputs.years, 1);
  const base = { ...inputs, years, compound: "monthly" as const };

  // A literal mattress: 0% nominal, same deposits as everything else so
  // it's an apples-to-apples "what if this exact cash flow earned
  // nothing", then shown in today's purchasing power — inflation is the
  // whole point of this bar, not a footnote.
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
    ratePercent: 10,
    ratePeriod: "annual",
    contributionMode: inputs.contributionMode,
  });

  const upsideRate =
    toAnnualPct(inputs) +
    (inputs.contributionMode === "none" ? ccBoostPercent : ccBoostPercent * 0.5);
  const upside = calculateCompound({
    ...base,
    ratePercent: upsideRate,
    ratePeriod: "annual",
  });

  return [
    {
      id: "mattress",
      label: "Mattress",
      tagline: `0% nominal · loses ~${COMPOUND_INFLATION_ANNUAL_PCT}%/yr to inflation`,
      result: mattress,
      color: PALETTE.muted,
    },
    {
      id: "cash",
      label: "Cash / HYSA",
      tagline: `~${COMPOUND_CASH_YIELD_ANNUAL_PCT}% · savings / money-market yield`,
      result: cashYield,
      color: PALETTE.teal,
    },
    {
      id: "spy",
      label: "Index-ish",
      tagline: "~10% · a plain index bet",
      result: spy,
      color: PALETTE.steel,
    },
    {
      id: "upside",
      label: "Upside path",
      tagline: `~${upsideRate.toFixed(0)}% · your rate on this plan`,
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

export function stayTheCourseInputs(inputs: CompoundInputs): CompoundInputs {
  return {
    ...inputs,
    contributionMode: "none",
    depositAmount: 0,
    withdrawalAmount: 0,
    compound: "monthly",
  };
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
  rng: () => number;
}) => NarrativeBeat | null;

function beat(label: string, rng: () => number, bodies: string[]): NarrativeBeat {
  return { label, body: pick(rng, bodies) };
}

const NARRATIVE_ANGLES: NarrativeAngle[] = [
  ({ result, tip, rng }) => {
    if (!(result.totalContributions > 0)) return null;
    const tipSuffix = tip ? ` Tips past deposits by year ${tip}.` : "";
    return beat("Fuel in", rng, [
      `You add ${fmt(result.totalContributions)} along the way. Deposits are the fuel, compounding is the S-curve.${tipSuffix}`,
      `${fmt(result.totalContributions)} of that final number is your own deposits. The rest is the multiplier doing its job.${tipSuffix}`,
      `${fmt(result.totalContributions)} deposited over the horizon. Everything past that is the curve bending.${tipSuffix}`,
    ]);
  },
  ({ result, tip, rng }) => {
    if (result.totalContributions > 0 || tip != null) return null;
    return beat("Sitting still", rng, [
      `No fresh deposits, pure compounding. Rough double pace: ~${result.doubleYears}y ${result.doubleMonths}m at this rate. Stay the course through the breathers.`,
      `Zero new cash added. ${fmt(result.totalInterest)} of growth came purely from letting it sit.`,
      `This path never sees another deposit. Doubling every ~${result.doubleYears}y ${result.doubleMonths}m does the rest.`,
    ]);
  },
  ({ tip, rng }) => {
    if (tip == null) return null;
    return beat("Tipping point", rng, [
      `Year ${tip} is when yearly interest first beats what you put in. Money working harder than you, that's the multi-year edge.`,
      `By year ${tip}, a single year of interest outearns a full year of your deposits. That's the moment compounding takes the wheel.`,
      `Year ${tip} is the flip. Interest starts out-earning your own contributions from here on.`,
    ]);
  },
  ({ result, rng }) => {
    const mid = result.yearly.find(
      (y) => y.index === Math.floor(result.durationYears / 2)
    );
    if (!mid || mid.index <= 0) return null;
    return beat("Halfway", rng, [
      `Year ${mid.index}: ${fmt(mid.balance)} already there. Pullbacks along the way are resets, not a reason to quit.`,
      `By year ${mid.index} you're already sitting on ${fmt(mid.balance)}. The back half does the heavier lifting.`,
    ]);
  },
  ({ result, rng }) => {
    if (!Number.isFinite(result.doubleYears) || result.durationYears <= 0) return null;
    const doubleYearsExact = result.doubleYears + result.doubleMonths / 12;
    if (!(doubleYearsExact > 0)) return null;
    const doublings = result.durationYears / doubleYearsExact;
    if (!(doublings >= 0.4)) return null;
    return beat("Doubling", rng, [
      `At this rate, money doubles every ~${result.doubleYears}y ${result.doubleMonths}m. That's roughly ${doublings.toFixed(1)} doublings over the full horizon.`,
      `About ${result.doubleYears}y ${result.doubleMonths}m per double. This horizon fits about ${doublings.toFixed(1)} of them.`,
    ]);
  },
  ({ result, rng }) => {
    const first = result.yearly.find((y) => y.index === 1);
    const last = result.yearly[result.yearly.length - 1];
    if (!first || !last || first.interest <= 0 || last.index <= 1) return null;
    const growthMult = last.interest / first.interest;
    if (!(growthMult >= 1.4)) return null;
    return beat("The curve", rng, [
      `Year 1 earned ${fmt(first.interest)} in interest. The final year earns ${fmt(last.interest)}: ${growthMult.toFixed(1)}x more, same discipline.`,
      `Interest per year grew ${growthMult.toFixed(1)}x from year 1 (${fmt(first.interest)}) to year ${last.index} (${fmt(last.interest)}). That's the curve, not you, working harder.`,
    ]);
  },
  ({ result, rng }) => {
    if (!(result.effectiveAnnualRate > result.nominalAnnualRate + 0.001)) return null;
    return beat("The rate", rng, [
      `Compounding monthly turns your ${(result.nominalAnnualRate * 100).toFixed(1)}% stated rate into ${(result.effectiveAnnualRate * 100).toFixed(1)}% effective. Free lunch, technically.`,
      `The stated rate reads ${(result.nominalAnnualRate * 100).toFixed(1)}%, but compounding frequency bumps the effective rate to ${(result.effectiveAnnualRate * 100).toFixed(1)}%.`,
    ]);
  },
];

export function buildNarrative(result: CompoundResult): NarrativeBeat[] {
  const tip = findTippingYear(result.yearly);
  const seed = hashSeed(
    `upside-narrative|${result.principal}|${result.totalInterest.toFixed(0)}|${result.durationYears.toFixed(2)}|${result.totalContributions.toFixed(0)}`
  );
  const rng = mulberry32(seed);

  const beats: NarrativeBeat[] = [
    beat("Path", rng, [
      `${fmt(result.principal)} → ${fmt(result.futureValue)} over ${formatHorizon(result.durationYears)}. Slow at first, then not.`,
      `${fmt(result.principal)} becomes ${fmt(result.futureValue)} over ${formatHorizon(result.durationYears)}. Slow at first, then not slow at all.`,
      `Over ${formatHorizon(result.durationYears)}, ${fmt(result.principal)} compounds into ${fmt(result.futureValue)}. Slow at first, then it isn't.`,
    ]),
    beat("Interest", rng, [
      `${fmt(result.totalInterest)} of the work (${(result.allTimeRoR * 100).toFixed(0)}% all-time).`,
      `${fmt(result.totalInterest)} of the final number is interest, not principal. Compounding earned its keep (${(result.allTimeRoR * 100).toFixed(0)}% all-time).`,
      `Of what you end up with, ${fmt(result.totalInterest)} came from the math, not your wallet (${(result.allTimeRoR * 100).toFixed(0)}% all-time).`,
    ]),
  ];

  const angleOrder = shuffleInPlace(rng, NARRATIVE_ANGLES.map((_, i) => i));
  for (const idx of angleOrder) {
    if (beats.length >= 5) break;
    const candidate = NARRATIVE_ANGLES[idx]!({ result, tip, rng });
    if (candidate) beats.push(candidate);
  }

  return beats.slice(0, 5);
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatHorizon(years: number): string {
  const y = Math.floor(years);
  const m = Math.round((years - y) * 12);
  if (m <= 0) return `${y} year${y === 1 ? "" : "s"}`;
  return `${y}y ${m}m`;
}

const MILESTONE_ROUNDS = [
  50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000, 3_000_000,
  4_000_000, 5_000_000, 7_500_000, 10_000_000,
];

type YearStoryAngle = (ctx: {
  row: PeriodRow;
  prevRow: PeriodRow | null;
  result: CompoundResult;
  rng: () => number;
}) => string | null;

/** Different lenses on the same year so the story never feels canned. */
const YEAR_STORY_ANGLES: YearStoryAngle[] = [
  // Flip framing — interest out-earning fresh deposits.
  ({ row, rng }) => {
    if (!(row.contributions > 0 && row.interest > row.contributions)) return null;
    return pick(rng, [
      `Interest this year (${fmt(row.interest)}) beat your deposits (${fmt(row.contributions)}). The money's outworking you now.`,
      `${fmt(row.interest)} in interest vs ${fmt(row.contributions)} deposited. Compounding just clocked more hours than you did.`,
      `You put in ${fmt(row.contributions)}; the math added ${fmt(row.interest)} on top of it. That's the flip.`,
      `${fmt(row.interest)} of "free" money this year, more than the ${fmt(row.contributions)} you actually deposited.`,
    ]);
  },
  // Still deposit-led, pre-flip years.
  ({ row, rng }) => {
    if (!(row.contributions > 0 && row.interest <= row.contributions)) return null;
    return pick(rng, [
      `Still deposit-led this year: ${fmt(row.contributions)} in from you, ${fmt(row.interest)} from compounding. The flip is coming.`,
      `${fmt(row.contributions)} of your own cash vs ${fmt(row.interest)} of interest. The ratio's about to swap.`,
      `Interest (${fmt(row.interest)}) hasn't caught your deposits (${fmt(row.contributions)}) yet. Patience is the whole strategy.`,
    ]);
  },
  // Pure compounding, no deposits this year at all.
  ({ row, rng }) => {
    if (row.contributions !== 0 || row.index <= 0) return null;
    return pick(rng, [
      `Pure compounding: zero fresh cash added, and the balance still grew by ${fmt(row.interest)} this year.`,
      `No deposits, ${fmt(row.interest)} of growth anyway. This is compounding doing its one job.`,
      `You didn't add a cent this year. Math added ${fmt(row.interest)} on your behalf.`,
    ]);
  },
  // Year-over-year acceleration.
  ({ row, prevRow, rng }) => {
    if (!prevRow || prevRow.interest <= 0 || row.interest <= prevRow.interest) return null;
    const delta = row.interest - prevRow.interest;
    return pick(rng, [
      `Interest went from ${fmt(prevRow.interest)} last year to ${fmt(row.interest)} this year. The snowball's picking up speed.`,
      `+${fmt(delta)} more interest than last year, same habits. That's the S-curve talking.`,
      `Year-over-year interest is up ${fmt(delta)}. The balance is starting to do the work for you.`,
    ]);
  },
  // Growth multiple vs starting principal.
  ({ row, result, rng }) => {
    if (!(result.principal > 0) || row.index <= 0) return null;
    const mult = row.balance / result.principal;
    if (!(mult > 1.05)) return null;
    return pick(rng, [
      `Started at ${fmt(result.principal)}, now at ${fmt(row.balance)}: a ${mult.toFixed(1)}x multiple.`,
      `${mult.toFixed(1)}x your starting stake, and it's not done climbing.`,
      `Your original ${fmt(result.principal)} has turned into ${fmt(row.balance)}, ${mult.toFixed(1)}x and counting.`,
    ]);
  },
  // Share of balance that's pure interest.
  ({ row, rng }) => {
    if (!(row.balance > 0 && row.accruedInterest > 0)) return null;
    const sharePct = Math.round((row.accruedInterest / row.balance) * 100);
    if (sharePct < 5) return null;
    return pick(rng, [
      `${sharePct}% of this balance is interest you never had to lift a finger for.`,
      `Roughly ${sharePct}% of the pile is compounding's contribution, not yours.`,
      `${sharePct}% math, ${100 - sharePct}% deposits, and the math side only grows.`,
    ]);
  },
  // Round-number milestone crossed this specific year.
  ({ row, prevRow, rng }) => {
    const prevBalance = prevRow?.balance ?? 0;
    const crossed = [...MILESTONE_ROUNDS]
      .filter((m) => prevBalance < m && row.balance >= m)
      .pop();
    if (crossed == null) return null;
    return pick(rng, [
      `This is the year you crossed ${fmt(crossed)}. New bragging-rights tier unlocked.`,
      `${fmt(crossed)}, crossed. Onward.`,
      `Somewhere in year ${row.index}, the balance quietly stepped past ${fmt(crossed)}.`,
    ]);
  },
  // Fun real-world equivalent for this year's interest alone.
  ({ row, rng }) => {
    if (!(row.interest > 0)) return null;
    const rentMonths = row.interest / 1800;
    const flights = Math.round(row.interest / 450);
    const downPayments = row.interest / 5000;
    return pick(rng, [
      `${fmt(row.interest)} of interest this year ≈ ${rentMonths.toFixed(1)} months of rent. Math pays better than a raise.`,
      `${fmt(row.interest)} in interest could cover ~${flights.toLocaleString("en-US")} round-trip flights. Compounding, your unofficial travel agent.`,
      `This year's interest alone (${fmt(row.interest)}) is about ${downPayments.toFixed(1)} car down payments.`,
    ]);
  },
  // Doubling pace.
  ({ row, result, rng }) => {
    if (!(result.doubleYears < 60) || row.index <= 0) return null;
    const doubleYearsExact = result.doubleYears + result.doubleMonths / 12;
    if (!(doubleYearsExact > 0)) return null;
    const doublings = row.index / doubleYearsExact;
    if (!(doublings >= 0.4)) return null;
    return pick(rng, [
      `At this pace your money doubles roughly every ${result.doubleYears}y ${result.doubleMonths}m. You're about ${doublings.toFixed(1)} doublings in.`,
      `Doubling clock: every ~${result.doubleYears}y ${result.doubleMonths}m. Year ${row.index} puts you ${doublings.toFixed(1)} doublings deep.`,
    ]);
  },
  // Cumulative return on every dollar deposited, through this year.
  ({ row, result, rng }) => {
    const deposited = result.principal + Math.max(0, row.accruedContributions);
    if (!(deposited > 0 && row.accruedInterest > 0)) return null;
    const roiSoFar = row.accruedInterest / deposited;
    if (!(roiSoFar > 0.05)) return null;
    return pick(rng, [
      `Cumulative return through year ${row.index}: ${(roiSoFar * 100).toFixed(0)}% on every dollar you've put in.`,
      `Every dollar deposited has earned back ${(roiSoFar * 100).toFixed(0)}% so far, and it keeps compounding.`,
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
  tippingYear: number | null
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
          "Starting line. Nothing compounded yet.",
          "Day one. Every doubling starts here.",
          "The before picture. Check back next year.",
        ])
      );
      continue;
    }

    if (tippingYear != null && year === tippingYear) {
      out.set(
        year,
        pick(rng, [
          `The flip: year ${year} is the first time interest (${fmt(row.interest)}) outran your deposits (${fmt(row.contributions)}). From here, the money mostly carries itself.`,
          `Tipping point unlocked. Year ${year}, ${fmt(row.interest)} of interest beats ${fmt(row.contributions)} deposited for the first time.`,
        ])
      );
      continue;
    }

    let picked: string | null = null;
    for (let i = 0; i < angleOrder.length; i++) {
      const angle = YEAR_STORY_ANGLES[angleOrder[(rotation + i) % angleOrder.length]!]!;
      const candidate = angle({ row, prevRow, result, rng });
      if (candidate) {
        picked = candidate;
        rotation += i + 1;
        break;
      }
    }
    out.set(
      year,
      picked ??
        `Interest earned this year: ${fmt(row.interest)}. Accrued interest: ${fmt(row.accruedInterest)}.`
    );
  }

  return out;
}

/** Solve roughly how many years to hit goal at rate + optional monthly deposit. */
export function estimateYearsToGoal(opts: {
  principal: number;
  goal: number;
  annualRatePct: number;
  monthlyDeposit: number;
}): number | null {
  const { principal, goal, annualRatePct, monthlyDeposit } = opts;
  if (goal <= principal) return 0;
  if (annualRatePct <= 0 && monthlyDeposit <= 0) return null;

  let balance = principal;
  let deposit = monthlyDeposit;
  const r = annualRatePct / 100 / 12;
  for (let m = 1; m <= 600; m++) {
    balance = balance * (1 + r) + deposit;
    if (m % 12 === 0) deposit *= 1.02; // match default 2% YoY bump
    if (balance >= goal) return Math.ceil(m / 12);
  }
  return null;
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
  milestones: CompoundMilestone[]
): string | null {
  if (!milestones.length) return null;
  const hit = milestones.filter((m) => m.hit || m.actualDate).length;
  const next = milestones.find((m) => !m.hit && !m.actualDate);
  const seed = hashSeed(`upside-milestones|${hit}|${next?.goal ?? 0}`);
  const rng = mulberry32(seed);

  if (!next) {
    return pick(rng, [
      `All ${milestones.length} milestones on this ladder are already hit. Time for a bigger ladder.`,
      `Every goal on this list is cleared (${milestones.length}/${milestones.length}). Dial in a new one.`,
    ]);
  }
  const dateText =
    next.yearsUntil != null
      ? next.targetDate
        ? `around ${formatMilestoneDate(next.targetDate)} (~${next.yearsUntil.toFixed(1)}y out)`
        : `in ~${next.yearsUntil.toFixed(1)} years`
      : "beyond the 50-year window at this pace";

  return pick(rng, [
    `${hit} of ${milestones.length} milestones hit. Next up: ${fmt(next.goal)}, ${dateText}.`,
    `Scoreboard: ${hit}/${milestones.length} cleared. ${fmt(next.goal)} is next, ${dateText}.`,
    `${fmt(next.goal)} is the next line to cross, ${dateText}. ${hit} down, ${milestones.length - hit} to go.`,
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

/** Months until balance >= goal under the live compounder path (extends horizon). */
export function monthsToGoal(
  inputs: CompoundInputs,
  goal: number,
  maxYears = 50
): number | null {
  if (!(goal >= 0)) return null;
  if (goal <= inputs.principal) return 0;
  const sim = calculateCompound({
    ...inputs,
    years: maxYears,
    months: 0,
  });
  for (const row of sim.monthly) {
    if (row.index > 0 && row.balance >= goal) return row.index;
  }
  return null;
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

