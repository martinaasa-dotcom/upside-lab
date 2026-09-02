import { TICKER_SECTORS } from "@/lib/forecast-plan";
import {
  forecastThemeForTicker,
  type ForecastTheme,
} from "@/lib/forecast-conviction";
import { finiteNumber, safeDiv, sumMoney } from "@/lib/money";
import { THEME_LABEL } from "@/lib/portfolio-personality";

export type AllocationSlice = {
  key: string;
  label: string;
  value: number;
  pct: number;
};

export type ThemeSlice = {
  theme: ForecastTheme;
  label: string;
  value: number;
  pct: number;
};

/** Holdings pooled by forecast theme, biggest first. Shared by Lab's
 * allocation fingerprint and the community sector chart so "what am I
 * actually betting on" is computed one way everywhere. */
export function themeBreakdown(
  holdings: Array<{ ticker: string; currentValue: number }>
): ThemeSlice[] {
  const byTheme = new Map<ForecastTheme, number>();
  for (const h of holdings) {
    const value = finiteNumber(h.currentValue);
    if (value <= 0) continue;
    const theme = forecastThemeForTicker(h.ticker);
    byTheme.set(theme, sumMoney([byTheme.get(theme) ?? 0, value]));
  }
  const total = sumMoney(byTheme.values());
  if (total <= 0) return [];
  return [...byTheme.entries()]
    .map(([theme, value]) => ({
      theme,
      label: THEME_LABEL[theme] ?? theme,
      value,
      pct: safeDiv(value, total),
    }))
    .sort((a, b) => b.value - a.value);
}

export type ConcentrationRead = {
  /** 1/HHI: how many equally-sized positions this book behaves like. A
   * 10-name book with one 60% position behaves like ~2.5, not 10. */
  effectivePositions: number;
  positionCount: number;
  /** Largest single position as a share of the book. */
  topWeightPct: number;
  topWeightTicker: string | null;
  /** Combined weight of the three and five largest positions. Which one is
   * worth showing depends on how many names you hold: "top 5" is
   * tautologically 100% for a book of five or fewer. */
  topThreePct: number;
  topFivePct: number;
};

export function concentrationRead(
  holdings: Array<{ ticker: string; currentValue: number }>
): ConcentrationRead {
  const positive = holdings.filter((h) => finiteNumber(h.currentValue) > 0);
  const total = sumMoney(positive.map((h) => h.currentValue));
  if (total <= 0 || positive.length === 0) {
    return {
      effectivePositions: 0,
      positionCount: 0,
      topWeightPct: 0,
      topWeightTicker: null,
      topThreePct: 0,
      topFivePct: 0,
    };
  }
  const sorted = [...positive].sort((a, b) => b.currentValue - a.currentValue);
  const hhi = sorted.reduce((s, h) => {
    const w = safeDiv(h.currentValue, total);
    return s + w * w;
  }, 0);
  const sumTop = (n: number) =>
    safeDiv(sumMoney(sorted.slice(0, n).map((h) => h.currentValue)), total);
  return {
    effectivePositions: hhi > 0 ? 1 / hhi : 0,
    positionCount: sorted.length,
    topWeightPct: safeDiv(sorted[0]!.currentValue, total),
    topWeightTicker: sorted[0]!.ticker,
    topThreePct: sumTop(3),
    topFivePct: sumTop(5),
  };
}

export function allocationBySector(
  holdings: Array<{ ticker: string; currentValue: number }>
): AllocationSlice[] {
  const totals = new Map<string, number>();
  let sum = 0;
  // Positive exposures only. A short (or a fat-fingered negative value)
  // used to be summed into the denominator, which pushed one slice over
  // 100% and rendered the other as a negative bar width.
  for (const h of holdings) {
    const value = finiteNumber(h.currentValue);
    if (value <= 0) continue;
    const base = h.ticker.split(".")[0]!.toUpperCase();
    const sector =
      TICKER_SECTORS[h.ticker] ?? TICKER_SECTORS[base] ?? "Not sorted yet";
    totals.set(sector, sumMoney([totals.get(sector) ?? 0, value]));
    sum = sumMoney([sum, value]);
  }
  if (sum <= 0) return [];
  return [...totals.entries()]
    .map(([label, value]) => ({
      key: label,
      label,
      value,
      pct: safeDiv(value, sum),
    }))
    .sort((a, b) => b.value - a.value);
}

export function allocationByTicker(
  holdings: Array<{ ticker: string; currentValue: number }>,
  topN = 8
): AllocationSlice[] {
  const positive = holdings.filter((h) => finiteNumber(h.currentValue) > 0);
  const sum = sumMoney(positive.map((h) => h.currentValue));
  if (sum <= 0) return [];
  const sorted = [...positive].sort((a, b) => b.currentValue - a.currentValue);
  const top = sorted.slice(0, topN);
  const rest = sumMoney(sorted.slice(topN).map((h) => h.currentValue));
  const slices = top.map((h) => ({
    key: h.ticker,
    label: h.ticker,
    value: h.currentValue,
    pct: safeDiv(h.currentValue, sum),
  }));
  if (rest > 0) {
    slices.push({ key: "other", label: "Other", value: rest, pct: safeDiv(rest, sum) });
  }
  return slices;
}
