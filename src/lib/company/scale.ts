/**
 * The two things every other file in this room needs in order to talk
 * about size, kept apart from both of them so they do not import each
 * other.
 *
 * `readings.ts` needs the market's multiple to say what a company's own
 * multiple is next to, and `fair-value.ts` needs big-money formatting to
 * write its working out. Left where they were first written, those two
 * modules imported each other, which works until the day one of them is
 * evaluated first and reads a constant that is not there yet.
 */
import { NO_VALUE, currency } from "@/lib/format";

/**
 * The long-run average number of dollars the whole US market has paid for
 * $1 of annual profit.
 *
 * Broad, checkable, and deliberately not per-sector: a per-sector table is
 * a house view about what a company ought to look like, which is exactly
 * what this product took out of the forecast.
 */
export const MARKET_EARNINGS_MULTIPLE = 20;

/** Big money in words: $3.4 trillion reads, $3,400,000,000,000 does not. */
export function bigMoney(
  value: number | null | undefined,
  code = "USD"
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return NO_VALUE;
  const sign = value < 0 ? "-" : "";
  const n = Math.abs(value);
  if (n >= 1e12) return `${sign}${currency(n / 1e12, 2, code)} trillion`;
  if (n >= 1e9) return `${sign}${currency(n / 1e9, 1, code)} billion`;
  if (n >= 1e6) return `${sign}${currency(n / 1e6, 1, code)} million`;
  return currency(value, 0, code);
}
