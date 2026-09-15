/** Undo stack for Margus / bulk sheet mutations (client-only). */

import type { Holding, Portfolio } from "@/lib/types";
import type {
  PortfolioEoyOverrides,
  PortfolioEoySources,
} from "@/lib/forecast-overrides";

export type BookUndoSnapshot = {
  id: string;
  label: string;
  at: number;
  portfolioId: string;
  cashBalance: number;
  holdings: Holding[];
  eoyOverrides: PortfolioEoyOverrides;
  /** Who wrote each of those, taken and put back with them. */
  eoySources: PortfolioEoySources;
};

const MAX = 12;

export function pushUndoSnapshot(
  stack: BookUndoSnapshot[],
  snap: Omit<BookUndoSnapshot, "id" | "at">
): BookUndoSnapshot[] {
  const next: BookUndoSnapshot = {
    ...snap,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: Date.now(),
  };
  return [...stack, next].slice(-MAX);
}

export function popUndoSnapshot(
  stack: BookUndoSnapshot[]
): { stack: BookUndoSnapshot[]; snap: BookUndoSnapshot | null } {
  if (!stack.length) return { stack, snap: null };
  const snap = stack[stack.length - 1]!;
  return { stack: stack.slice(0, -1), snap };
}

export function captureSheetSnapshot(opts: {
  label: string;
  portfolio: Portfolio;
  holdings: Holding[];
  eoyOverrides: PortfolioEoyOverrides;
  /**
   * Taken with the figures rather than left behind: putting prices back
   * without the words beside them would leave a restored figure wearing
   * whoever wrote the one that replaced it, which is the same false
   * sentence this pair of maps exists to end.
   */
  eoySources: PortfolioEoySources;
}): Omit<BookUndoSnapshot, "id" | "at"> {
  const sheetHoldings = opts.holdings
    .filter((h) => h.portfolio_id === opts.portfolio.id)
    .map((h) => ({ ...h }));
  return {
    label: opts.label,
    portfolioId: opts.portfolio.id,
    cashBalance: opts.portfolio.cash_balance,
    holdings: sheetHoldings,
    eoyOverrides: structuredClone(opts.eoyOverrides),
    eoySources: structuredClone(opts.eoySources),
  };
}
