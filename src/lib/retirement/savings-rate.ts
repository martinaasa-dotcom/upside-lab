/**
 * WHAT YOU KEEP OF WHAT YOU EARN, AND WHY IT DECIDES MORE THAN WHAT YOU EARN.
 *
 * The rest of this module answers "when can I stop" from a whole plan: a
 * published basket for retirement, state pensions, a glide path, a safe
 * rate. This file answers a smaller question on purpose, the one that
 * explains why the big answer moves: if the reader went on living exactly
 * as they live now, with no pension counted, how long until what they have
 * put away could pay for that life on its own?
 *
 * The answer to that question depends on almost one number, the share of
 * pay that is kept rather than spent, and it depends on it twice. A pound
 * not spent goes into the pot, and it is also a pound the pot never has to
 * find again, because the target is a multiple of spending. Earning a pound
 * more and saving it only does the first. That asymmetry is the lesson, and
 * everything here is arithmetic that shows it with the reader's own figures
 * rather than a sentence that asserts it.
 *
 * PENSION CONTRIBUTIONS ARE SAVINGS. Money paid into a pension straight from
 * pay never reaches the bank account, so a reader asked "what do you save"
 * leaves it out and reads their savings rate as far lower than it is. It is
 * counted on both sides: in what is kept, and in what was earned, since an
 * employer's share is pay the reader never saw.
 *
 * Everything is in today's money and grows at a real return, like the rest
 * of the module. Pure and tested.
 */

export type PaySplitInputs = {
  /** What lands in the bank each month, after tax and after any pension. */
  takeHomeMonthly: number;
  /** Paid into a pension from pay each month, yours and your employer's. */
  pensionMonthly: number;
  /**
   * Everything the plan says goes in each month, pension included, which is
   * how the plan's own field is described to the reader.
   */
  planMonthly: number;
};

export type PaySplit = {
  /** Take-home plus what went to a pension before it: the whole of pay. */
  earned: number;
  pension: number;
  /** Put away out of take-home pay. */
  invested: number;
  /** Everything else in take-home pay. */
  spent: number;
  /** Pension plus invested. */
  saved: number;
  /** Saved as a share of earned, 0 to 1. */
  rate: number;
  /**
   * True when the pension alone is more than the plan says goes in each
   * month, which means the plan is leaving the pension out.
   */
  pensionExceedsPlan: boolean;
};

function money(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Splits a month of pay three ways. Null without a take-home figure, since
 * there is nothing to take a share of.
 */
export function paySplit(input: PaySplitInputs): PaySplit | null {
  const takeHome = money(input.takeHomeMonthly);
  if (takeHome <= 0) return null;
  const pension = money(input.pensionMonthly);
  const plan = money(input.planMonthly);
  /*
    The plan's monthly figure includes the pension, so what came out of
    take-home is the rest of it. It cannot be more than take-home itself:
    somebody typing a plan larger than their pay is saving from elsewhere,
    and a negative spend would be a sentence nobody could believe.
  */
  const invested = Math.min(takeHome, Math.max(0, plan - pension));
  const earned = takeHome + pension;
  const saved = pension + invested;
  return {
    earned,
    pension,
    invested,
    spent: takeHome - invested,
    saved,
    rate: saved / earned,
    pensionExceedsPlan: pension > plan + 0.5,
  };
}

/** The longest wait this answers with a number rather than "not in a lifetime". */
export const MAX_YEARS = 100;

/**
 * Years until the pot is `multiple` times a year of spending, saving a fixed
 * amount a year at a fixed real return, compounded monthly. Zero when it
 * already is. Null past `MAX_YEARS`, which is also what saving nothing and
 * earning nothing on it comes to.
 *
 * The month the line is crossed is interpolated, so a change of a few
 * pounds moves the answer a little rather than by a whole month or not at
 * all, which matters for the comparisons that are the point of this file.
 */
export function yearsToIndependence({
  saveYear,
  spendYear,
  startPot,
  realReturnPct,
  multiple,
}: {
  saveYear: number;
  spendYear: number;
  startPot: number;
  realReturnPct: number;
  multiple: number;
}): number | null {
  const target = money(spendYear) * Math.max(1, multiple);
  let pot = money(startPot);
  if (pot >= target) return 0;
  const save = money(saveYear) / 12;
  const r = Number.isFinite(realReturnPct) ? realReturnPct / 100 : 0;
  const monthly = Math.pow(1 + Math.max(-0.99, r), 1 / 12) - 1;
  for (let m = 1; m <= MAX_YEARS * 12; m++) {
    const next = pot * (1 + monthly) + save;
    if (next >= target) {
      const step = next - pot;
      const part = step > 0 ? (target - pot) / step : 1;
      return (m - 1 + part) / 12;
    }
    pot = next;
  }
  return null;
}

export type LessonContext = {
  split: PaySplit;
  startPot: number;
  realReturnPct: number;
  /** Times a year of spending the pot must reach: 100 over the safe rate. */
  multiple: number;
};

/** The reader's own wait, at their own split. */
export function ownYears(ctx: LessonContext): number | null {
  return yearsToIndependence({
    saveYear: ctx.split.saved * 12,
    spendYear: ctx.split.spent * 12,
    startPot: ctx.startPot,
    realReturnPct: ctx.realReturnPct,
    multiple: ctx.multiple,
  });
}

export type RatePoint = { ratePct: number; years: number | null };

/** The steps the curve is drawn at, as whole percentages. */
export const CURVE_RATES = Array.from({ length: 19 }, (_, i) => 5 + i * 5);

/**
 * The wait at every savings rate, on the same pay, pot and return. What
 * changes along it is only how the same pay is divided, which is exactly
 * the thing the reader decides.
 */
export function rateCurve(ctx: Omit<LessonContext, "split"> & { earned: number }): RatePoint[] {
  return CURVE_RATES.map((ratePct) => {
    const s = ratePct / 100;
    return {
      ratePct,
      years: yearsToIndependence({
        saveYear: ctx.earned * s * 12,
        spendYear: ctx.earned * (1 - s) * 12,
        startPot: ctx.startPot,
        realReturnPct: ctx.realReturnPct,
        multiple: ctx.multiple,
      }),
    };
  });
}

/** A round amount near a twentieth of pay: 1, 2 or 5 times a power of ten. */
export function roundStep(n: number): number {
  if (!(n > 0) || !Number.isFinite(n)) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(n)));
  const m = n / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

export type Lever = {
  id: "spend-less" | "earn-save" | "earn-spend";
  /** Years of the wait: negative is sooner. Null when either side is past the limit. */
  change: number | null;
  years: number | null;
};

/**
 * The same amount a month, three ways. Spending it less, earning it more
 * and keeping it, and earning it more and spending it. The first always
 * beats the second, because it moves both the pot and the target; the
 * third makes the wait longer, because the target rises and nothing more
 * goes in.
 */
export function levers(ctx: LessonContext, monthly: number): { base: number | null; levers: Lever[] } {
  const base = ownYears(ctx);
  const s = ctx.split;
  const cut = Math.min(monthly, s.spent);
  const run = (save: number, spend: number) =>
    yearsToIndependence({
      saveYear: save * 12,
      spendYear: spend * 12,
      startPot: ctx.startPot,
      realReturnPct: ctx.realReturnPct,
      multiple: ctx.multiple,
    });
  const make = (id: Lever["id"], years: number | null): Lever => ({
    id,
    years,
    change: years != null && base != null ? years - base : null,
  });
  return {
    base,
    levers: [
      make("spend-less", run(s.saved + cut, s.spent - cut)),
      make("earn-save", run(s.saved + monthly, s.spent)),
      make("earn-spend", run(s.saved, s.spent + monthly)),
    ],
  };
}

/** Future value of a yearly amount put in monthly, at a real return, over whole years. */
export function investedFor(yearly: number, years: number, realReturnPct: number): number {
  const n = Math.max(0, Math.round(years * 12));
  const r = Number.isFinite(realReturnPct) ? realReturnPct / 100 : 0;
  const monthly = Math.pow(1 + Math.max(-0.99, r), 1 / 12) - 1;
  const each = money(yearly) / 12;
  if (Math.abs(monthly) < 1e-12) return each * n;
  return each * ((Math.pow(1 + monthly, n) - 1) / monthly);
}

/** How often a small cost comes round, and how many times that is a year. */
export const HABIT_PERIODS = {
  day: { perYear: 365, word: "a day" },
  workday: { perYear: 260, word: "a working day" },
  week: { perYear: 52, word: "a week" },
  month: { perYear: 12, word: "a month" },
} as const;

export type HabitPeriod = keyof typeof HABIT_PERIODS;

/**
 * Everyday costs, priced in pounds and moved onto the reader's prices the
 * way every other anchor in this module is. They are examples of what adds
 * up, not a list of things anybody ought to give up.
 */
export const HABITS: ReadonlyArray<{
  id: string;
  label: string;
  gbp: number;
  period: HabitPeriod;
}> = [
  { id: "coffee", label: "A coffee out", gbp: 3.5, period: "day" },
  { id: "lunch", label: "Lunch bought at work", gbp: 8, period: "workday" },
  { id: "takeaway", label: "A takeaway", gbp: 25, period: "week" },
  { id: "subs", label: "Subscriptions", gbp: 40, period: "month" },
];

export type HabitResult = {
  yearly: number;
  /** What the same money would reach by the age the plan stops, invested. */
  invested: number;
  /** How much less the pot needs, if the cost is gone for good. */
  targetLess: number;
  /** Years sooner the pot alone could pay for this life. Null when unknown. */
  sooner: number | null;
};

export function habitResult(
  amount: number,
  period: HabitPeriod,
  ctx: { yearsToStop: number; realReturnPct: number; multiple: number; lesson: LessonContext | null }
): HabitResult {
  const yearly = money(amount) * HABIT_PERIODS[period].perYear;
  let sooner: number | null = null;
  if (ctx.lesson) {
    const s = ctx.lesson.split;
    const cut = Math.min(yearly / 12, s.spent);
    const base = ownYears(ctx.lesson);
    const after = yearsToIndependence({
      saveYear: (s.saved + cut) * 12,
      spendYear: (s.spent - cut) * 12,
      startPot: ctx.lesson.startPot,
      realReturnPct: ctx.lesson.realReturnPct,
      multiple: ctx.lesson.multiple,
    });
    if (base != null && after != null) sooner = Math.max(0, base - after);
  }
  return {
    yearly,
    invested: investedFor(yearly, Math.max(0, ctx.yearsToStop), ctx.realReturnPct),
    targetLess: yearly * Math.max(1, ctx.multiple),
    sooner,
  };
}

/** "31 years", "8 months", "less than a month", or null past the limit. */
export function yearsSaid(years: number | null): string | null {
  if (years == null) return null;
  const y = Math.abs(years);
  if (y < 1 / 12) return "less than a month";
  if (y < 1) {
    const m = Math.round(y * 12);
    return `${m} month${m === 1 ? "" : "s"}`;
  }
  const r = Math.round(y * 10) / 10;
  const whole = Number.isInteger(r);
  return `${whole ? r.toFixed(0) : r.toFixed(1)} year${r === 1 ? "" : "s"}`;
}

const PAY_KEY = "upside-retirement-pay-v1";

export type StoredPay = { takeHomeMonthly: number; pensionMonthly: number };

/**
 * Pay is kept apart from the plan on purpose. Pressing an example life
 * rebuilds the whole plan from that life, and a reader's own pay is a fact
 * about them that no example should overwrite. It never leaves the browser.
 */
export function loadPay(): StoredPay {
  try {
    const raw = window.localStorage.getItem(PAY_KEY);
    if (!raw) return { takeHomeMonthly: 0, pensionMonthly: 0 };
    const v = JSON.parse(raw) as Partial<StoredPay>;
    return {
      takeHomeMonthly: Math.min(1e9, money(Number(v.takeHomeMonthly))),
      pensionMonthly: Math.min(1e9, money(Number(v.pensionMonthly))),
    };
  } catch {
    return { takeHomeMonthly: 0, pensionMonthly: 0 };
  }
}

export function savePay(pay: StoredPay): void {
  try {
    window.localStorage.setItem(PAY_KEY, JSON.stringify(pay));
  } catch {
    /* A private window or blocked storage: the page still works for this visit. */
  }
}

/**
 * An everyday price moved from pounds onto the reader's prices and money,
 * the way `localiseFromGbp` moves every other anchor, but rounded to a step
 * a till would print rather than to the nearest ten.
 */
export function localHabitPrice(
  region: { priceLevel: number; perGbp: number },
  gbp: number
): number {
  const local = gbp * (region.priceLevel / 100) * region.perGbp;
  if (!Number.isFinite(local) || local <= 0) return 0;
  const step = local < 10 ? 0.5 : local < 100 ? 1 : local < 1000 ? 5 : 50;
  return Math.round(local / step) * step;
}
