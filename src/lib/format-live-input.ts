/** Live-format helpers for money / percent inputs (en-US, as-you-type). */

import { MAX_SAFE_MONEY } from "@/lib/money";

export type CurrencyCode = "USD" | "EUR";

/** A typed percent above this is a joke, not a rate. */
const MAX_SAFE_PERCENT = 1_000_000;

function currencySymbol(currency: CurrencyCode): string {
  return currency === "EUR" ? "€" : "$";
}

/** Split cleaned numeric string into int / frac / trailing-dot flag. */
function splitNumeric(
  cleaned: string,
  fractionDigits: number
): { intPart: string; fracPart: string; trailingDot: boolean } {
  const dot = cleaned.indexOf(".");
  if (fractionDigits <= 0 || dot < 0) {
    return {
      intPart: cleaned.replace(/\./g, "") || "",
      fracPart: "",
      trailingDot: false,
    };
  }
  const intPart = cleaned.slice(0, dot).replace(/\./g, "");
  const after = cleaned.slice(dot + 1).replace(/\./g, "");
  const trailingDot = after.length === 0 && cleaned.endsWith(".");
  return {
    intPart,
    fracPart: after.slice(0, fractionDigits),
    trailingDot,
  };
}

function formatIntCommas(intPart: string): string {
  if (!intPart) return "0";
  // Preserve empty→0 only when we have a value; allow "" briefly via caller
  const n = Number(intPart);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function formatLiveMoney(
  value: number,
  currency: CurrencyCode,
  fractionDigits = 0
): string {
  const n = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n);
}

/** Format from raw keystrokes — keeps trailing `.` while typing. */
export function formatMoneyFromRaw(
  raw: string,
  currency: CurrencyCode,
  fractionDigits = 0
): { display: string; value: number } {
  const symbol = currencySymbol(currency);
  const stripped = raw.replace(/[^\d.]/g, "");
  if (!stripped) return { display: "", value: 0 };

  const { intPart, fracPart, trailingDot } = splitNumeric(
    stripped,
    fractionDigits
  );
  const value =
    fractionDigits > 0 && (fracPart || trailingDot)
      ? Number(`${intPart || "0"}.${fracPart}`)
      : Number(intPart || "0");

  if (!Number.isFinite(value) || value > MAX_SAFE_MONEY) {
    return {
      display: formatLiveMoney(MAX_SAFE_MONEY, currency, fractionDigits),
      value: MAX_SAFE_MONEY,
    };
  }

  const intFmt = formatIntCommas(intPart || "0");
  let body = intFmt;
  if (fractionDigits > 0) {
    if (trailingDot) body = `${intFmt}.`;
    else if (fracPart) body = `${intFmt}.${fracPart}`;
  }

  return {
    display: `${symbol}${body}`,
    value,
  };
}

export function formatLivePercent(value: number, fractionDigits = 2): string {
  const n = Number.isFinite(value) ? value : 0;
  const body = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(Number(n.toFixed(fractionDigits)));
  return `${body}%`;
}

export function formatPercentFromRaw(
  raw: string,
  fractionDigits = 2
): { display: string; value: number } {
  const stripped = raw.replace(/[^\d.]/g, "");
  if (!stripped) return { display: "", value: 0 };

  const { intPart, fracPart, trailingDot } = splitNumeric(
    stripped,
    fractionDigits
  );
  const value =
    fracPart || trailingDot
      ? Number(`${intPart || "0"}.${fracPart}`)
      : Number(intPart || "0");

  if (!Number.isFinite(value) || value > MAX_SAFE_PERCENT) {
    return {
      display: formatLivePercent(MAX_SAFE_PERCENT, fractionDigits),
      value: MAX_SAFE_PERCENT,
    };
  }

  const intFmt = formatIntCommas(intPart || "0");
  let body = intFmt;
  if (trailingDot) body = `${intFmt}.`;
  else if (fracPart) body = `${intFmt}.${fracPart}`;

  return {
    display: `${body}%`,
    value,
  };
}

/** Count digit characters before `caret` (ignores $, commas, %). */
export function digitCountBefore(value: string, caret: number): number {
  let n = 0;
  const end = Math.min(caret, value.length);
  for (let i = 0; i < end; i++) {
    if (/\d/.test(value[i]!)) n++;
  }
  // Treat a decimal point before caret as sticky: count digits only
  return n;
}

/**
 * Place caret after `digitCount` digits. If `afterDot` and a `.` exists,
 * place just after the decimal once digitCount digits of the integer are passed…
 * Simpler: after N digits total in the string.
 */
export function caretIndexForDigitCount(
  formatted: string,
  digitCount: number
): number {
  if (digitCount <= 0) {
    const firstDigit = formatted.search(/\d/);
    return firstDigit < 0 ? 0 : firstDigit;
  }
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i]!)) {
      seen++;
      if (seen === digitCount) return i + 1;
    }
  }
  if (formatted.endsWith("%")) return formatted.length - 1;
  return formatted.length;
}

/** Prefer keeping caret after a trailing `.` the user just typed. */
export function caretIndexPreferDot(
  formatted: string,
  digitCount: number,
  rawHadTrailingDot: boolean
): number {
  if (rawHadTrailingDot) {
    const dot = formatted.indexOf(".");
    if (dot >= 0) return dot + 1;
  }
  return caretIndexForDigitCount(formatted, digitCount);
}
