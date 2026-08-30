/** App calendar timezone — Martin / Upside book runs on Tallinn local days. */
export const APP_TIMEZONE = "Europe/Tallinn";

/** YYYY-MM-DD in the app timezone (not UTC ISO). */
export function dateKeyInTz(
  input: Date | string | number,
  timeZone: string = APP_TIMEZONE
): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function todayKeyInTz(timeZone: string = APP_TIMEZONE): string {
  return dateKeyInTz(new Date(), timeZone);
}

/** Calendar-day delta between two YYYY-MM-DD keys (to − from). */
export function calendarDaysBetweenKeys(fromKey: string, toKey: string): number {
  const parse = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(toKey) - parse(fromKey)) / 86_400_000);
}

/** Days from today (Tallinn) until the given instant’s Tallinn calendar date. */
export function daysUntilInTz(
  input: Date | string | number,
  timeZone: string = APP_TIMEZONE
): number {
  const target = dateKeyInTz(input, timeZone);
  if (!target) return NaN;
  return calendarDaysBetweenKeys(todayKeyInTz(timeZone), target);
}

/** Sub-day relative time — "just now", "12m ago", "3h ago", falling back to a date. */
export function formatRelativeTime(
  input: Date | string | number,
  now: number = Date.now()
): string {
  const d = input instanceof Date ? input : new Date(input);
  const ms = now - d.getTime();
  if (!Number.isFinite(ms) || Number.isNaN(d.getTime())) return "";
  if (ms < 0) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Clock readings are 24-hour everywhere in the app: 08:30 and 20:30, never
 * 8:30 AM / 8:30 PM. Reading a time should not depend on which country the
 * browser thinks it is in, and a shared sheet should read the same for
 * everyone looking at it.
 *
 * Only the hour is pinned — the reader's locale still picks date order and
 * month names. `hourCycle: "h23"` rather than `hour12: false`, because the
 * latter renders midnight as "24:00" in en-US.
 */
export type ClockFormatOptions = Omit<
  Intl.DateTimeFormatOptions,
  "hour12" | "hourCycle"
>;

const DEFAULT_CLOCK_OPTIONS: ClockFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

/** Date + 24-hour time. Returns "" for anything that isn't a real instant. */
export function formatDateTime(
  input: Date | string | number,
  options: ClockFormatOptions = DEFAULT_CLOCK_OPTIONS,
  locale?: Intl.LocalesArgument
): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(locale, { ...options, hourCycle: "h23" });
}
