/**
 * How many shares somebody holds, written the way they hold them.
 *
 * This app has held fractional shares from the start: a tenth of a Bitcoin
 * and two and a half shares of a fund are both ordinary rows. The holdings
 * table still printed them through a whole-number formatter, so a reader
 * with 0.12 of something was told, in the column headed Shares, that they
 * had "0", while the forecast card two panels down said "0.12 shares".
 *
 * So: a whole number stays whole, and anything else keeps up to four
 * decimals with the trailing zeros trimmed, because 0.1200 is noise and
 * 0.12 is what they typed. Four is the same ceiling the add-holding form
 * already uses, so nothing here can show a count that could not be saved.
 */

/** Decimals to show for a count: none when it is whole, up to four when not. */
export function shareDigits(value: number, max = 4): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 10 ** max) / 10 ** max;
  if (Number.isInteger(rounded)) return 0;
  for (let d = 1; d < max; d += 1) {
    if (Math.abs(rounded * 10 ** d - Math.round(rounded * 10 ** d)) < 1e-9) {
      return d;
    }
  }
  return max;
}

/** The count itself, grouped, with only the decimals it actually needs. */
export function shareCount(value: number, max = 4): string {
  if (!Number.isFinite(value)) return "0";
  const digits = shareDigits(value, max);
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * "12 shares" / "1 share" / "0.12 shares".
 *
 * A single share is the only singular: half a share is "0.5 shares", the
 * way a person says it out loud.
 */
export function sharesLabel(value: number, unit = "share"): string {
  const count = shareCount(value);
  return `${count} ${value === 1 ? unit : `${unit}s`}`;
}
