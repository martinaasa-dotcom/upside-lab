/**
 * An expiry date read out of pasted text, as YYYY-MM-DD, or null.
 *
 * The point is copying a date from one row to another, and from a
 * broker's screen into this one, so it takes the shapes those actually
 * carry: this app's own `2026-11-20`, the day-first `20.11.2026` a
 * European date field shows, and the `NOV 20 '26` a broker prints on a
 * contract. Slash dates are refused, because `11/10/2026` is the tenth of
 * November to one reader and the eleventh of October to the next, and
 * guessing an expiry wrong prices a different contract.
 */
const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

function key(year: number, month: number, day: number): string | null {
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthOf(word: string): number {
  return MONTHS.indexOf(word.slice(0, 3).toLowerCase()) + 1;
}

export function parseExpiryText(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  let m = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return key(+m[1]!, +m[2]!, +m[3]!);
  m = text.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})\b/);
  if (m) return key(+m[3]!, +m[2]!, +m[1]!);
  // "NOV 20 '26", "Nov 20, 2026"
  m = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+'?(\d{2}|\d{4})\b/);
  if (m && monthOf(m[1]!) > 0) return key(+m[3]!, monthOf(m[1]!), +m[2]!);
  // "20 Nov 2026"
  m = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+'?(\d{2}|\d{4})\b/);
  if (m && monthOf(m[2]!) > 0) return key(+m[3]!, monthOf(m[2]!), +m[1]!);
  return null;
}
