/**
 * Per-sheet display currency. Book of record stays USD; UI converts via EURUSD.
 */

import { roundMoney } from "@/lib/money";

export type DisplayCurrency = "USD" | "EUR";

export const DISPLAY_CURRENCY_KEY = "upside-display-currency-v1";
export const COMPOUND_CURRENCY_KEY = "upside-compound-currency-v1";

export type EurUsdQuote = {
  /** Preferred conversion rate: USD per 1 EUR */
  rate: number | null;
  /** Session / regular open */
  open: number | null;
  /** Prior session close */
  previousClose: number | null;
  /** Live last */
  last: number | null;
};

/** Pick conversion rate from Yahoo EURUSD open / close / last. */
export function pickEurUsdRate(parts: {
  last?: number | null;
  open?: number | null;
  previousClose?: number | null;
}): number | null {
  const candidates = [parts.last, parts.previousClose, parts.open].filter(
    (n): n is number => typeof n === "number" && n > 0
  );
  return candidates[0] ?? null;
}

export function loadDisplayCurrencyMap(): Record<string, DisplayCurrency> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(DISPLAY_CURRENCY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    const out: Record<string, DisplayCurrency> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v === "USD" || v === "EUR") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveDisplayCurrencyMap(map: Record<string, DisplayCurrency>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DISPLAY_CURRENCY_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function getDisplayCurrency(
  map: Record<string, DisplayCurrency>,
  portfolioId: string
): DisplayCurrency {
  return map[portfolioId] ?? "USD";
}

export function loadCompoundCurrency(): DisplayCurrency {
  if (typeof window === "undefined") return "USD";
  try {
    const v = localStorage.getItem(COMPOUND_CURRENCY_KEY);
    return v === "EUR" ? "EUR" : "USD";
  } catch {
    return "USD";
  }
}

export function saveCompoundCurrency(currency: DisplayCurrency) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COMPOUND_CURRENCY_KEY, currency);
  } catch {
    /* ignore */
  }
}

/**
 * Convert a USD amount into the sheet display currency.
 * `eurUsd` = dollars per 1 euro (Yahoo EURUSD=X).
 */
export function usdToDisplay(
  amountUsd: number,
  currency: DisplayCurrency,
  eurUsd: number | null
): number {
  if (!Number.isFinite(amountUsd)) return 0;
  if (currency === "USD" || !eurUsd || eurUsd <= 0) return roundMoney(amountUsd);
  return roundMoney(amountUsd / eurUsd);
}

/** Convert a display-currency amount back to USD book of record. */
export function displayToUsd(
  amountDisplay: number,
  currency: DisplayCurrency,
  eurUsd: number | null
): number {
  if (!Number.isFinite(amountDisplay)) return 0;
  if (currency === "USD" || !eurUsd || eurUsd <= 0) return roundMoney(amountDisplay);
  return roundMoney(amountDisplay * eurUsd);
}

export function formatEurUsdHint(eurUsd: number | null, detail?: EurUsdQuote | null): string {
  if (!eurUsd || eurUsd <= 0) return "The euro rate is unavailable, so amounts are shown in dollars.";
  const bits = [`EURUSD ${eurUsd.toFixed(4)}`];
  if (detail?.open && detail.open > 0) bits.push(`O ${detail.open.toFixed(4)}`);
  if (detail?.previousClose && detail.previousClose > 0) {
    bits.push(`C ${detail.previousClose.toFixed(4)}`);
  }
  return bits.join(" · ");
}
