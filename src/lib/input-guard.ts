import { MAX_SAFE_MONEY, MAX_SAFE_SHARES } from "@/lib/money";

/** Strip tags and control chars, then cap length. Used for sheet names. */
export function sanitizeSheetName(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/** Live ticker field: letters, digits, and the exchange punctuation people type. */
export function sanitizeTickerDraft(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/<[^>]*>/g, "")
    .replace(/^[€$£]+/, "")
    .replace(/[^A-Z0-9.:=\-^]/g, "")
    .slice(0, 24);
}

/** Search box: a ticker or a company name. Keeps spaces. */
export const TICKER_QUERY_MAX = 48;

export function sanitizeTickerQuery(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/^[€$£]+/, "")
    .replace(/[^A-Za-z0-9.:=\-^&/' ]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, TICKER_QUERY_MAX);
}

export function isSafeShares(n: number): boolean {
  return Number.isFinite(n) && n > 0 && n <= MAX_SAFE_SHARES;
}

export function isSafePositiveMoney(n: number): boolean {
  return Number.isFinite(n) && n > 0 && n <= MAX_SAFE_MONEY;
}

export function isSafeSignedMoney(n: number): boolean {
  return Number.isFinite(n) && Math.abs(n) <= MAX_SAFE_MONEY;
}

/**
 * A Call % is a fraction of the share price, so 0.15 is fifteen per cent.
 * Above 1 is a strike more than double the price, which is not a covered
 * call anybody writes, and below 0 puts the strike under the price the
 * reader already owns at. Both reach the covered-call table, the write
 * plan and the Sunday letter as a real strike price, so the shape is
 * settled where the number is stored rather than where it is drawn.
 */
export function isSafeCallPct(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 1;
}

/**
 * A holding's place in its portfolio's list. Whole, and small: it only
 * orders rows on one screen, and an import writes it as a counter. Bounding
 * it keeps a number too large for the column out of the database, where it
 * would come back as a failed save with nothing on screen explaining it.
 */
export const MAX_SORT_ORDER = 9_999;

export function isSafeSortOrder(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= MAX_SORT_ORDER;
}
