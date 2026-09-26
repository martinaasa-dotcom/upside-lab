/**
 * YOUR MONEY ACROSS YOUR WHOLE LIFE, AND WHAT ONE MONTH OF RETIREMENT COSTS.
 *
 * The answer card used to draw two lines, what the pot would be on the day
 * of stopping at each age against what stopping then would need, and it
 * was accurate and nobody outside finance could read it: a falling dashed
 * line called "what stopping then needs" is a concept, not a picture. What
 * a person can read at a glance is a mountain. The money climbs while they
 * work, peaks the day they stop, and is spent down across retirement, and
 * whether the far side of the mountain reaches the end of their life is
 * the whole question. `lifePath` is that mountain, read straight off the
 * plan's own ledger, so it cannot disagree with anything else in the room.
 *
 * THE MOUNTAIN IS DRAWN AT THE AVERAGE RETURN AND THE VERDICT IS NOT, and
 * the card says so rather than hiding it. The ledger compounds at the rate
 * the reader chose every single year; the verdict asks for a pot that
 * survives a bad run of markets. So a plan can be "not yet" while its
 * mountain still reaches the far side, and the card's line under the
 * headline names exactly that case ("enough if markets behave, not through
 * a bad run"), which is the honest version and also the more useful one.
 *
 * `retirementMonth` is the other half: the first month of retirement as
 * the things a person already knows they pay for (living, home, car,
 * children), and how much of it a pension covers. Every figure is the
 * plan's own year divided by twelve.
 */

import type { PlanResult, PlanYear } from "@/lib/retirement/plan";

export type LifePoint = {
  age: number;
  /** What the pot holds at the start of this age. */
  pot: number;
  retired: boolean;
};

export type LifePath = {
  points: LifePoint[];
  /** The age the pot peaks, which is the day of stopping, give or take. */
  peakAge: number;
  peak: number;
  /** The age the money runs out on the average path, or null if it lasts. */
  emptyAt: number | null;
  /** The last age the plan covers. */
  endAge: number;
};

export function lifePath(plan: PlanResult): LifePath {
  const rows = plan.ledger;
  const points: LifePoint[] = [];
  if (rows.length > 0) {
    points.push({ age: rows[0].age, pot: Math.max(0, rows[0].startPot), retired: rows[0].retired });
    for (const row of rows) {
      points.push({
        age: row.age + 1,
        pot: Math.max(0, row.endPot),
        retired: row.retired,
      });
    }
  }
  let peakAge = points[0]?.age ?? 0;
  let peak = 0;
  for (const p of points) {
    if (p.pot > peak) {
      peak = p.pot;
      peakAge = p.age;
    }
  }
  return {
    points,
    peakAge,
    peak,
    emptyAt: plan.emptyAtAge,
    endAge: plan.planningAge,
  };
}

export type MonthPart = {
  id: "living" | "home" | "car" | "children";
  label: string;
  monthly: number;
};

export type RetirementMonth = {
  age: number;
  parts: MonthPart[];
  /** Everything above, added up. */
  total: number;
  /** What pensions and other guaranteed income pay in that month. */
  pension: number;
  /** The first age any guaranteed income arrives, or null if none ever does. */
  pensionFrom: number | null;
  /** What the pension pays a month once it has started. */
  pensionMonthly: number;
};

/**
 * The first month of retirement. A part that costs nothing is left out,
 * because "Car: 0" is a line of nothing on a picture about money.
 */
export function retirementMonth(plan: PlanResult): RetirementMonth | null {
  const first: PlanYear | undefined = plan.years[0];
  if (!first) return null;
  const parts: MonthPart[] = (
    [
      { id: "living", label: "Everyday life", monthly: first.living / 12 },
      { id: "home", label: "Home", monthly: first.housing / 12 },
      { id: "car", label: "Car", monthly: first.car / 12 },
      { id: "children", label: "Children", monthly: first.children / 12 },
    ] as MonthPart[]
  ).filter((p) => p.monthly >= 0.5);
  const withIncome = plan.years.find((y) => y.income > 0.5);
  return {
    age: first.age,
    parts,
    total: first.spend / 12,
    pension: first.income / 12,
    pensionFrom: withIncome ? withIncome.age : null,
    pensionMonthly: withIncome ? withIncome.income / 12 : 0,
  };
}

/**
 * Round a large figure the way a person says it: 1.8 million, 240
 * thousand. For the labels on the picture, never for a figure that is the
 * answer itself, which is printed in full.
 */
export function shortMoney(n: number, symbol: string): string {
  const v = Math.max(0, n);
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    return `${symbol}${m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, "")}m`;
  }
  if (v >= 1_000) return `${symbol}${Math.round(v / 1_000)}k`;
  return `${symbol}${Math.round(v)}`;
}
