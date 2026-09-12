/** Live-format helpers for money / percent inputs (en-US, as-you-type). */

import { MAX_SAFE_MONEY } from "@/lib/money";

/*
  Widened past the dollar and the euro for the retirement module, which
  asks where the reader lives and then has to print a Swedish krona or a
  Swiss franc in an input they can type into. Nothing else about these
  inputs is currency-aware: the grouping and the decimal point are en-US
  throughout the app, and changing that here would move every figure in
  every other panel.
*/
export type CurrencyCode =
  | "USD"
  | "EUR"
  | "GBP"
  | "CHF"
  | "SEK"
  | "NOK"
  | "DKK"
  | "PLN"
  | "CZK"
  | "CAD"
  | "AUD";

/** A typed percent above this is a joke, not a rate. */
const MAX_SAFE_PERCENT = 1_000_000;

/**
 * THE SYMBOL IS TAKEN FROM `Intl`, NEVER TYPED OUT HERE.
 *
 * There are two formatters in this file and they must agree: one runs on
 * every keystroke and one runs on blur. The blur path has always gone
 * through `Intl.NumberFormat`, and the keystroke path used a hand-written
 * map, which was harmless while the only currencies were the dollar and
 * the euro and both spellings matched.
 *
 * Widening this type for the retirement module broke that silently. Intl in
 * en-US prints `SEK 411,000`, and the hand-written map said `kr `, so a
 * Swedish krona field read `kr 411,000` while the reader typed and
 * `SEK 411,000` the moment they tabbed out: the prefix changed under them
 * for no reason they could see. The Canadian and Australian dollars were
 * worse than cosmetic, typing as a bare `$` and settling as `CA$` and `A$`,
 * so mid-edit the field was indistinguishable from US dollars.
 *
 * Asking Intl for the parts removes the second spelling rather than
 * correcting it, so a currency added later cannot reintroduce the drift.
 */
const symbolCache = new Map<CurrencyCode, string>();

function currencySymbol(currency: CurrencyCode): string {
  const cached = symbolCache.get(currency);
  if (cached !== undefined) return cached;
  let symbol = "$";
  try {
    const parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).formatToParts(0);
    /*
      Everything before the digits, so a currency Intl writes as `CHF 0`
      keeps its space and one written as `$0` does not gain one. Taking the
      currency part alone would drop that space and put `SEK411,000` on
      screen for the length of one keystroke.
    */
    const upTo = parts.findIndex((part) => part.type === "integer");
    const lead = (upTo < 0 ? parts : parts.slice(0, upTo))
      .filter((part) => part.type === "currency" || part.type === "literal")
      .map((part) => part.value)
      .join("");
    if (lead) symbol = lead;
  } catch {
    /* An unknown code falls back to the dollar, as it always did. */
  }
  symbolCache.set(currency, symbol);
  return symbol;
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

/**
 * A number with no currency symbol and no percent sign, comma-grouped.
 *
 * This is what a field shows while it is being typed into: the symbol is
 * chrome, not part of the value, and a reader trying to replace "$1,000"
 * has nothing to type over but its digits. The symbol comes back on blur.
 */
export function formatPlainNumber(value: number, fractionDigits = 0): string {
  const n = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(Number(n.toFixed(fractionDigits)));
}

/** Format from raw keystrokes — keeps trailing `.` while typing. */
export function formatMoneyFromRaw(
  raw: string,
  currency: CurrencyCode,
  fractionDigits = 0,
  opts?: { plain?: boolean }
): { display: string; value: number } {
  const symbol = opts?.plain ? "" : currencySymbol(currency);
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
      display: opts?.plain
        ? formatPlainNumber(MAX_SAFE_MONEY, fractionDigits)
        : formatLiveMoney(MAX_SAFE_MONEY, currency, fractionDigits),
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
  fractionDigits = 2,
  opts?: { plain?: boolean }
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
      display: opts?.plain
        ? formatPlainNumber(MAX_SAFE_PERCENT, fractionDigits)
        : formatLivePercent(MAX_SAFE_PERCENT, fractionDigits),
      value: MAX_SAFE_PERCENT,
    };
  }

  const intFmt = formatIntCommas(intPart || "0");
  let body = intFmt;
  if (trailingDot) body = `${intFmt}.`;
  else if (fracPart) body = `${intFmt}.${fracPart}`;

  return {
    display: opts?.plain ? body : `${body}%`,
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
