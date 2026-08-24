import {
  cyclePhaseForYear,
  cyclePhaseLabel,
  type PresidentialCyclePhase,
} from "@/lib/market/presidency";

export type DailyBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type CycleMonthlyRow = {
  month: number;
  label: string;
  /** Average total calendar-month return across same-cycle years. */
  avgMonthReturnPct: number;
  winRate: number;
  samples: number;
  history: Array<{ year: number; returnPct: number }>;
};

export type CycleDayRow = {
  day: number;
  avgReturnPct: number;
  winRate: number;
  samples: number;
  history: Array<{ year: number; returnPct: number }>;
};

export type ActionStance = "deploy" | "hold" | "raise_cash";

export type ActionSignal = {
  stance: ActionStance;
  headline: string;
  detail: string;
  /** Month return, shown as the figure on the right of the card. */
  figurePct?: number;
  winRate?: number;
  samples?: number;
};

export type SeasonalityModel = {
  ticker: string;
  from: string;
  to: string;
  tradingDays: number;
  asOfYear: number;
  asOfMonth: number;
  currentCyclePhase: PresidentialCyclePhase;
  currentCycleLabel: string;
  cycleMonthly: CycleMonthlyRow[];
  /** Calendar days 1–31 per month (1–12), filtered to current cycle years. */
  cycleDaysByMonth: Record<string, CycleDayRow[]>;
  signals: ActionSignal[];
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function dailyReturn(prevClose: number, close: number): number | null {
  if (prevClose <= 0 || close <= 0) return null;
  return (close / prevClose - 1) * 100;
}

function monthReturn(bars: DailyBar[]): number | null {
  if (bars.length < 1) return null;
  const first = bars[0]!;
  const last = bars[bars.length - 1]!;
  if (first.open <= 0 || last.close <= 0) return null;
  return (last.close / first.open - 1) * 100;
}

function round(n: number, digits: number): number {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

/**
 * Total month return per year-month, only for years in `phase`.
 *
 * `inProgress` is the YYYY-MM the reader is standing in, and it is left
 * out. The current year is always in the current cycle phase, by
 * definition, so without this the month in progress was counted as a
 * finished one: on the 24th, three weeks of August went into the average
 * and the win rate as if it were a whole August. The card built on it says
 * "prior Augusts" and "prior years only" three times over, and with six or
 * eight samples in a phase the half-month it was quietly carrying was a
 * sixth of the answer.
 *
 * Only the month in progress is dropped, not the year: a January that has
 * finished is a real January however recent it is.
 */
export function computeCycleMonthlyReturns(
  bars: DailyBar[],
  phase: PresidentialCyclePhase,
  opts?: { inProgress?: string | null }
): CycleMonthlyRow[] {
  const inProgress = opts?.inProgress ?? null;
  const byYearMonth = new Map<string, DailyBar[]>();
  for (const bar of bars) {
    const year = Number(bar.date.slice(0, 4));
    if (cyclePhaseForYear(year) !== phase) continue;
    const ym = bar.date.slice(0, 7);
    if (inProgress && ym === inProgress) continue;
    const list = byYearMonth.get(ym) ?? [];
    list.push(bar);
    byYearMonth.set(ym, list);
  }

  const byMonth = Array.from({ length: 12 }, () => [] as number[]);
  const historyByMonth = Array.from(
    { length: 12 },
    () => [] as Array<{ year: number; returnPct: number }>
  );

  for (const [ym, list] of byYearMonth) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const ret = monthReturn(list);
    if (ret == null) continue;
    const month = Number(ym.slice(5, 7));
    const year = Number(ym.slice(0, 4));
    if (month >= 1 && month <= 12) {
      byMonth[month - 1]!.push(ret);
      historyByMonth[month - 1]!.push({
        year,
        returnPct: round(ret, 2),
      });
    }
  }

  return byMonth.map((vals, idx) => {
    const avg =
      vals.length > 0
        ? vals.reduce((s, v) => s + v, 0) / vals.length
        : 0;
    const wins = vals.filter((v) => v > 0).length;
    return {
      month: idx + 1,
      label: MONTH_SHORT[idx]!,
      avgMonthReturnPct: round(avg, 2),
      winRate:
        vals.length > 0 ? round((wins / vals.length) * 100, 1) : 0,
      samples: vals.length,
      history: historyByMonth[idx]!.sort((a, b) => a.year - b.year),
    };
  });
}

/** Daily return by calendar day within each month, same-cycle years only. */
export function computeCycleDaysByMonth(
  bars: DailyBar[],
  phase: PresidentialCyclePhase
): Record<string, CycleDayRow[]> {
  const buckets = new Map<string, number[]>();
  const historyBuckets = new Map<
    string,
    Array<{ year: number; returnPct: number }>
  >();

  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1]!;
    const cur = bars[i]!;
    const year = Number(cur.date.slice(0, 4));
    if (cyclePhaseForYear(year) !== phase) continue;
    const ret = dailyReturn(prev.close, cur.close);
    if (ret == null) continue;
    const month = Number(cur.date.slice(5, 7));
    const day = Number(cur.date.slice(8, 10));
    const key = `${month}-${day}`;
    const list = buckets.get(key) ?? [];
    list.push(ret);
    buckets.set(key, list);
    const hist = historyBuckets.get(key) ?? [];
    hist.push({ year, returnPct: round(ret, 2) });
    historyBuckets.set(key, hist);
  }

  const out: Record<string, CycleDayRow[]> = {};
  for (let month = 1; month <= 12; month++) {
    const daysInMonth = month === 2 ? 29 : [4, 6, 9, 11].includes(month) ? 30 : 31;
    const rows: CycleDayRow[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${month}-${day}`;
      const vals = buckets.get(key) ?? [];
      const avg =
        vals.length > 0
          ? vals.reduce((s, v) => s + v, 0) / vals.length
          : 0;
      const wins = vals.filter((v) => v > 0).length;
      rows.push({
        day,
        avgReturnPct: round(avg, 3),
        winRate:
          vals.length > 0 ? round((wins / vals.length) * 100, 1) : 0,
        samples: vals.length,
        history: (historyBuckets.get(key) ?? []).sort(
          (a, b) => a.year - b.year
        ),
      });
    }
    out[String(month)] = rows;
  }
  return out;
}

function marketNow(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")?.value ?? 2026);
  const month = Number(parts.find((p) => p.type === "month")?.value ?? 1);
  return { year, month };
}

export function buildActionSignals(input: {
  cycleMonthly: CycleMonthlyRow[];
  asOfMonth: number;
}): ActionSignal[] {
  const curMonth = input.cycleMonthly[input.asOfMonth - 1];
  if (!curMonth || curMonth.samples === 0) return [];

  const stats = {
    figurePct: curMonth.avgMonthReturnPct,
    winRate: curMonth.winRate,
    samples: curMonth.samples,
  };

  if (curMonth.avgMonthReturnPct >= 1.5 && curMonth.winRate >= 55) {
    return [
      {
        stance: "deploy",
        headline: `${curMonth.label} has been a strong month in this cycle phase`,
        detail: `Across ${curMonth.samples} prior ${curMonth.label}s in the same presidential-cycle year.`,
        ...stats,
      },
    ];
  }
  if (curMonth.avgMonthReturnPct <= -0.5 || curMonth.winRate < 45) {
    return [
      {
        stance: "raise_cash",
        headline: `${curMonth.label} is historically soft in this cycle phase`,
        detail: `Same slot in the 4-year cycle, prior ${curMonth.label}s only.`,
        ...stats,
      },
    ];
  }
  return [
    {
      stance: "hold",
      headline: `${curMonth.label} has been mixed. No strong seasonal pattern.`,
      detail: `Cycle-phase ${curMonth.label}s, prior years only.`,
      ...stats,
    },
  ];
}

export function buildSeasonalityModel(input: {
  ticker: string;
  daily: DailyBar[];
}): SeasonalityModel {
  const daily = [...input.daily].sort((a, b) => a.date.localeCompare(b.date));
  const { year: asOfYear, month: asOfMonth } = marketNow();
  const phase = cyclePhaseForYear(asOfYear);
  const cycleMonthly = computeCycleMonthlyReturns(daily, phase, {
    inProgress: `${asOfYear}-${String(asOfMonth).padStart(2, "0")}`,
  });
  const cycleDaysByMonth = computeCycleDaysByMonth(daily, phase);

  return {
    ticker: input.ticker,
    from: daily[0]?.date ?? "",
    to: daily[daily.length - 1]?.date ?? "",
    tradingDays: daily.length,
    asOfYear,
    asOfMonth,
    currentCyclePhase: phase,
    currentCycleLabel: cyclePhaseLabel(phase),
    cycleMonthly,
    cycleDaysByMonth,
    signals: buildActionSignals({
      cycleMonthly,
      asOfMonth,
    }),
  };
}

export { MONTH_NAMES, MONTH_SHORT };
