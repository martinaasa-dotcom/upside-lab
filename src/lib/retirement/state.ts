/**
 * The plan is kept in this browser and nowhere else.
 *
 * A retirement plan is the most personal thing anybody types into this app:
 * their age, their children, what they earn, whether they rent. None of it
 * is needed on the server to answer the question, because the whole module
 * is arithmetic that runs in the browser, so none of it is sent there. That
 * is a decision rather than an oversight, and it is why there is no table
 * behind this file.
 *
 * The cost of that decision is real and is worth stating: a plan does not
 * follow the reader to their phone. The alternative is a row in a database
 * carrying somebody's household and their salary, which is a much larger
 * promise to keep than a calculator needs to make.
 */

import { finiteNumber } from "@/lib/money";
import {
  defaultInputs,
  type Child,
  type Housing,
  type RetirementInputs,
} from "@/lib/retirement/plan";
import { regionById, type Household, type LivingStandard } from "@/lib/retirement/regions";
import type { Sex } from "@/lib/retirement/longevity";
import type { GlideSegment } from "@/lib/retirement/returns";

export const RETIREMENT_STORAGE_KEY = "upside-retirement-plan-v1";

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = finiteNumber(value, fallback);
  return Math.min(max, Math.max(min, n));
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function readChildren(value: unknown): Child[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 12)
    .map((raw, i) => {
      const row = raw as { id?: unknown; age?: unknown };
      return {
        id: typeof row?.id === "string" && row.id ? row.id : `child-${i}`,
        age: num(row?.age, 0, 0, 60),
      };
    });
}

function readGlide(value: unknown, fallback: GlideSegment[]): GlideSegment[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  const rows = value
    .slice(0, 8)
    .map((raw) => {
      const row = raw as { fromAge?: unknown; equityPct?: unknown };
      return {
        fromAge: num(row?.fromAge, 0, 0, 120),
        equityPct: num(row?.equityPct, 100, 0, 100),
      };
    })
    .sort((a, b) => a.fromAge - b.fromAge);
  return rows.length > 0 ? rows : fallback;
}

/**
 * Read a stored plan back, with every field checked.
 *
 * Nothing here trusts what it finds. A stored plan is a blob a previous
 * version of this app wrote, or a blob somebody edited by hand, and a
 * single NaN reaching `buildPlan` would put `n/a` where a person's
 * retirement pot goes. Missing fields fall back to the defaults for the
 * region, so a plan written before a field existed still opens.
 */
export function sanitizeInputs(raw: unknown): RetirementInputs {
  const row = (raw ?? {}) as Record<string, unknown>;
  const regionId = typeof row.regionId === "string" ? row.regionId : undefined;
  const base = defaultInputs(regionById(regionId).id);
  const retirementAge = num(row.retirementAge, base.retirementAge, 30, 100);

  return {
    regionId: base.regionId,
    household: oneOf<Household>(row.household, ["single", "couple"], base.household),
    sex: oneOf<Sex>(row.sex, ["male", "female", "average"], base.sex),
    currentAge: num(row.currentAge, base.currentAge, 16, 100),
    retirementAge,
    planningAge:
      row.planningAge == null ? null : num(row.planningAge, 100, 40, 125),
    planningSurvival: num(row.planningSurvival, base.planningSurvival, 0.005, 0.6),
    improvementPct: num(row.improvementPct, base.improvementPct, 0, 3),
    spendingMode: oneOf(row.spendingMode, ["standard", "custom"] as const, base.spendingMode),
    standard: oneOf<LivingStandard>(
      row.standard,
      ["minimum", "moderate", "comfortable"],
      base.standard
    ),
    customAnnualSpend: num(row.customAnnualSpend, base.customAnnualSpend, 0, 5_000_000),
    housing: oneOf<Housing>(row.housing, ["owned", "mortgage", "renting"], base.housing),
    mortgageAnnual: num(row.mortgageAnnual, base.mortgageAnnual, 0, 1_000_000),
    mortgageYearsLeft: num(row.mortgageYearsLeft, base.mortgageYearsLeft, 0, 60),
    rentAnnual: num(row.rentAnnual, base.rentAnnual, 0, 1_000_000),
    children: readChildren(row.children),
    childAnnualCost: num(row.childAnnualCost, base.childAnnualCost, 0, 500_000),
    childUntilAge: num(row.childUntilAge, base.childUntilAge, 0, 40),
    carMonthly: num(row.carMonthly, base.carMonthly, 0, 50_000),
    carYearsLeft: num(row.carYearsLeft, base.carYearsLeft, 0, 60),
    carForever: row.carForever === true,
    currentPot: num(row.currentPot, base.currentPot, 0, 1_000_000_000),
    otherSavings: num(row.otherSavings, base.otherSavings, 0, 1_000_000_000),
    annualContribution: num(row.annualContribution, base.annualContribution, 0, 10_000_000),
    contributionGrowthPct: num(row.contributionGrowthPct, base.contributionGrowthPct, -5, 15),
    costsReduceSaving: row.costsReduceSaving === true,
    includeStatePension: row.includeStatePension !== false,
    statePensionAnnual: num(row.statePensionAnnual, base.statePensionAnnual, 0, 1_000_000),
    statePensionAge: num(row.statePensionAge, base.statePensionAge, 50, 80),
    otherIncomeAnnual: num(row.otherIncomeAnnual, base.otherIncomeAnnual, 0, 5_000_000),
    otherIncomeFromAge: num(row.otherIncomeFromAge, base.otherIncomeFromAge, 30, 100),
    withdrawalTaxPct: num(row.withdrawalTaxPct, base.withdrawalTaxPct, 0, 70),
    glide: readGlide(row.glide, base.glide),
    returns: {
      equityPct: num(
        (row.returns as Record<string, unknown>)?.equityPct,
        base.returns.equityPct,
        -5,
        20
      ),
      bondPct: num(
        (row.returns as Record<string, unknown>)?.bondPct,
        base.returns.bondPct,
        -5,
        15
      ),
      cashPct: num(
        (row.returns as Record<string, unknown>)?.cashPct,
        base.returns.cashPct,
        -5,
        15
      ),
      feePct: num(
        (row.returns as Record<string, unknown>)?.feePct,
        base.returns.feePct,
        0,
        5
      ),
    },
    swrOverridePct:
      row.swrOverridePct == null ? null : num(row.swrOverridePct, 3.5, 0.1, 25),
    globalHaircut: row.globalHaircut !== false,
  };
}

export function loadRetirementInputs(): RetirementInputs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RETIREMENT_STORAGE_KEY);
    if (!raw) return null;
    return sanitizeInputs(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveRetirementInputs(inputs: RetirementInputs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RETIREMENT_STORAGE_KEY, JSON.stringify(inputs));
  } catch {
    /* A full or blocked store is not worth breaking the page over. */
  }
}
