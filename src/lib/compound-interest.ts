/** Pure compound-interest math for the Compound sheet. */

import { finiteNumber, MAX_SAFE_MONEY } from "@/lib/money";

export type RatePeriod = "annual" | "monthly" | "quarterly" | "daily";
export type CompoundFrequency =
  | "annually"
  | "semiannually"
  | "quarterly"
  | "monthly"
  | "daily"
  | "continuous";
export type ContributionMode = "none" | "deposits" | "withdrawals" | "both";
export type ContributionFrequency = "monthly" | "quarterly" | "annually" | "biweekly";
export type IncreaseMode = "percent" | "fixed";

export type CompoundInputs = {
  principal: number;
  /** Nominal rate as percent, e.g. 5 for 5% */
  ratePercent: number;
  ratePeriod: RatePeriod;
  compound: CompoundFrequency;
  years: number;
  months: number;
  contributionMode: ContributionMode;
  depositAmount: number;
  depositFrequency: ContributionFrequency;
  withdrawalAmount: number;
  withdrawalFrequency: ContributionFrequency;
  increaseMode: IncreaseMode;
  /** % or $ depending on increaseMode */
  annualIncrease: number;
};

export type PeriodRow = {
  index: number;
  label: string;
  interest: number;
  accruedInterest: number;
  contributions: number;
  accruedContributions: number;
  balance: number;
};

export type CompoundResult = {
  futureValue: number;
  totalInterest: number;
  totalContributions: number;
  principal: number;
  totalDeposited: number;
  nominalAnnualRate: number;
  effectiveAnnualRate: number;
  allTimeRoR: number;
  doubleYears: number;
  doubleMonths: number;
  durationYears: number;
  yearly: PeriodRow[];
  monthly: PeriodRow[];
};

const COMPOUND_PER_YEAR: Record<Exclude<CompoundFrequency, "continuous">, number> = {
  annually: 1,
  semiannually: 2,
  quarterly: 4,
  monthly: 12,
  daily: 365,
};

const CONTRIB_PER_YEAR: Record<ContributionFrequency, number> = {
  monthly: 12,
  quarterly: 4,
  annually: 1,
  biweekly: 26,
};

export function toAnnualRate(ratePercent: number, period: RatePeriod): number {
  if (!Number.isFinite(ratePercent)) return 0;
  const r = ratePercent / 100;
  switch (period) {
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

export function compoundsPerYear(freq: CompoundFrequency): number {
  if (freq === "continuous") return Infinity;
  return COMPOUND_PER_YEAR[freq];
}

/** Effective annual rate from nominal annual rate + compounding. */
export function effectiveAnnualRate(
  annualRate: number,
  freq: CompoundFrequency
): number {
  if (!Number.isFinite(annualRate) || annualRate === 0) return 0;
  if (freq === "continuous") {
    const e = Math.exp(annualRate);
    return Number.isFinite(e) ? e - 1 : 0;
  }
  const n = COMPOUND_PER_YEAR[freq];
  const inner = 1 + annualRate / n;
  if (!(inner > 0)) return 0;
  const out = Math.pow(inner, n) - 1;
  return Number.isFinite(out) ? out : 0;
}

/** Time to double principal at this nominal rate + compounding (no contributions). */
export function timeToDouble(
  annualRate: number,
  freq: CompoundFrequency
): { years: number; months: number } {
  if (!Number.isFinite(annualRate) || annualRate <= 0) {
    return { years: Infinity, months: 0 };
  }
  let yearsExact: number;
  if (freq === "continuous") {
    yearsExact = Math.log(2) / annualRate;
  } else {
    const n = COMPOUND_PER_YEAR[freq];
    const inner = 1 + annualRate / n;
    if (!(inner > 0)) return { years: Infinity, months: 0 };
    yearsExact = Math.log(2) / (n * Math.log(inner));
  }
  if (!Number.isFinite(yearsExact) || yearsExact < 0) {
    return { years: Infinity, months: 0 };
  }
  const totalMonths = Math.round(yearsExact * 12);
  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
  };
}

function monthsInDuration(years: number, months: number): number {
  return Math.max(0, Math.floor(years) * 12 + Math.floor(months));
}

function contribEachMonth(
  amount: number,
  frequency: ContributionFrequency,
  monthIndex: number
): number {
  if (amount === 0) return 0;
  const perYear = CONTRIB_PER_YEAR[frequency];
  if (perYear === 12) return amount;
  if (perYear === 4) return monthIndex % 3 === 2 ? amount : 0;
  if (perYear === 1) return monthIndex % 12 === 11 ? amount : 0;
  // biweekly ≈ 26/yr → apply ~2.166/mo as every month amount*26/12
  return (amount * perYear) / 12;
}

/**
 * Month-by-month simulation so deposits, withdrawals, and annual increases
 * stay accurate under any compound frequency.
 */
export function calculateCompound(inputs: CompoundInputs): CompoundResult {
  const principal = Math.min(
    MAX_SAFE_MONEY,
    Math.max(0, finiteNumber(inputs.principal))
  );
  const rawRate = toAnnualRate(inputs.ratePercent, inputs.ratePeriod);
  // Cap so Math.exp / Math.pow stay finite. 2000%/yr is already a toy.
  const annualRate = Number.isFinite(rawRate)
    ? Math.min(20, Math.max(-0.99, rawRate))
    : 0;
  const totalMonths = Math.min(
    80 * 12,
    monthsInDuration(inputs.years, inputs.months)
  );
  const durationYears = totalMonths / 12;
  const ear = effectiveAnnualRate(annualRate, inputs.compound);
  const double = timeToDouble(annualRate, inputs.compound);

  const monthly: PeriodRow[] = [
    {
      index: 0,
      label: "Start",
      interest: 0,
      accruedInterest: 0,
      contributions: 0,
      accruedContributions: 0,
      balance: principal,
    },
  ];

  let balance = principal;
  let accruedInterest = 0;
  let accruedContributions = 0;
  let depositAmt = Math.min(
    MAX_SAFE_MONEY,
    Math.max(0, finiteNumber(inputs.depositAmount))
  );
  let withdrawalAmt = Math.min(
    MAX_SAFE_MONEY,
    Math.max(0, finiteNumber(inputs.withdrawalAmount))
  );

  const mode = inputs.contributionMode;
  const useDeposits = mode === "deposits" || mode === "both";
  const useWithdrawals = mode === "withdrawals" || mode === "both";

  for (let m = 0; m < totalMonths; m++) {
    // Interest for this month
    let interest = 0;
    if (inputs.compound === "continuous") {
      interest = balance * (Math.exp(annualRate / 12) - 1);
    } else {
      const n = COMPOUND_PER_YEAR[inputs.compound];
      // Apply compound events that fall in this month
      const eventsPerMonth = n / 12;
      if (eventsPerMonth >= 1) {
        /*
         * A month's worth of compound events, and a month is not a whole
         * number of them. Daily is 365/12 = 30.42, and rounding that to 30
         * whole steps builds the year out of 360 days while
         * `compoundsPerYear` reports 365 and the effective annual rate
         * printed beside the chart is worked from 365. So the headline rate
         * and the balance under it disagreed, and the balance was the one
         * that was wrong: $10,000 at 10% for 10 years came out $369.73
         * short of the closed form, 1.4% of the answer, growing with the
         * horizon. The exponent is the honest way to say it, exact for any
         * frequency, and over twelve months it multiplies out to exactly
         * (1 + r/n)^n. Monthly is unchanged: n/12 is 1.
         */
        interest = balance * (Math.pow(1 + annualRate / n, eventsPerMonth) - 1);
      } else {
        // quarterly/annual/semi: only on compound months
        const monthsPerEvent = Math.round(12 / n);
        if ((m + 1) % monthsPerEvent === 0) {
          interest = balance * (annualRate / n);
        }
      }
    }

    if (!Number.isFinite(interest)) interest = 0;
    balance += interest;
    if (!Number.isFinite(balance) || balance > MAX_SAFE_MONEY) {
      balance = MAX_SAFE_MONEY;
    }
    accruedInterest += interest;
    if (!Number.isFinite(accruedInterest) || accruedInterest > MAX_SAFE_MONEY) {
      accruedInterest = MAX_SAFE_MONEY;
    }

    // Contributions at end of month
    let contrib = 0;
    if (useDeposits) {
      contrib += contribEachMonth(depositAmt, inputs.depositFrequency, m);
    }
    if (useWithdrawals) {
      contrib -= contribEachMonth(withdrawalAmt, inputs.withdrawalFrequency, m);
    }
    if (!Number.isFinite(contrib)) contrib = 0;
    balance = Math.max(0, Math.min(MAX_SAFE_MONEY, balance + contrib));
    accruedContributions += contrib;
    if (
      !Number.isFinite(accruedContributions) ||
      Math.abs(accruedContributions) > MAX_SAFE_MONEY
    ) {
      accruedContributions =
        accruedContributions < 0 ? -MAX_SAFE_MONEY : MAX_SAFE_MONEY;
    }

    // Annual increase after each completed year
    if ((m + 1) % 12 === 0 && inputs.annualIncrease) {
      if (inputs.increaseMode === "percent") {
        const factor = 1 + finiteNumber(inputs.annualIncrease) / 100;
        depositAmt = Math.min(MAX_SAFE_MONEY, depositAmt * factor);
        withdrawalAmt = Math.min(MAX_SAFE_MONEY, withdrawalAmt * factor);
      } else {
        depositAmt = Math.min(
          MAX_SAFE_MONEY,
          depositAmt + finiteNumber(inputs.annualIncrease)
        );
        withdrawalAmt = Math.min(
          MAX_SAFE_MONEY,
          withdrawalAmt + finiteNumber(inputs.annualIncrease)
        );
      }
    }

    monthly.push({
      index: m + 1,
      label: `Month ${m + 1}`,
      interest,
      accruedInterest,
      contributions: contrib,
      accruedContributions,
      balance,
    });
  }

  // Yearly rollup (and year 0)
  const yearly: PeriodRow[] = [
    {
      index: 0,
      label: "Year 0",
      interest: 0,
      accruedInterest: 0,
      contributions: 0,
      accruedContributions: 0,
      balance: principal,
    },
  ];
  const yearCount = Math.ceil(totalMonths / 12);
  for (let y = 1; y <= yearCount; y++) {
    const endIdx = Math.min(y * 12, totalMonths);
    const startIdx = (y - 1) * 12;
    const end = monthly[endIdx];
    const start = monthly[startIdx];
    yearly.push({
      index: y,
      label: `Year ${y}`,
      interest: end.accruedInterest - start.accruedInterest,
      accruedInterest: end.accruedInterest,
      contributions: end.accruedContributions - start.accruedContributions,
      accruedContributions: end.accruedContributions,
      balance: end.balance,
    });
  }

  const futureValue = monthly[monthly.length - 1]?.balance ?? principal;
  const totalInterest = accruedInterest;
  const totalContributions = accruedContributions;
  const totalDeposited = principal + Math.max(0, totalContributions);
  const allTimeRoR =
    totalDeposited > 0 && Number.isFinite(totalInterest)
      ? totalInterest / totalDeposited
      : 0;

  return {
    futureValue,
    totalInterest,
    totalContributions,
    principal,
    totalDeposited,
    nominalAnnualRate: annualRate,
    effectiveAnnualRate: ear,
    allTimeRoR,
    doubleYears: double.years,
    doubleMonths: double.months,
    durationYears,
    yearly,
    monthly,
  };
}

export const DEFAULT_COMPOUND_INPUTS: CompoundInputs = {
  principal: 5000,
  // Overridden per-person once the sheet loads with a blended rate derived
  // from what's actually held (see blendedExpectedAnnualReturn) — this is
  // only the fallback before that computation is ready / for a book with
  // no holdings at all.
  ratePercent: 8,
  ratePeriod: "annual",
  compound: "monthly",
  years: 10,
  months: 0,
  contributionMode: "deposits",
  depositAmount: 500,
  depositFrequency: "monthly",
  withdrawalAmount: 0,
  withdrawalFrequency: "monthly",
  increaseMode: "percent",
  annualIncrease: 2,
};

export const COMPOUND_STORAGE_KEY = "upside-compound-inputs-v2";
