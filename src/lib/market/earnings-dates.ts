import { dateKeyInTz, calendarDaysBetweenKeys } from "@/lib/timezone";

export type YahooEarningsInput = {
  history?: Array<{
    quarter?: Date | string | null;
    period?: string | null;
    surprisePercent?: number | null;
    epsActual?: number | null;
    epsEstimate?: number | null;
  }>;
  earningsDates?: Array<Date | string | null> | null;
  earningsCallDates?: Array<Date | string | null> | null;
  nextIsEstimate?: boolean | null;
};

export type ResolvedEarnings = {
  lastDate: Date | null;
  lastKey: string | null;
  daysSinceLast: number | null;
  nextDate: Date | null;
  nextKey: string | null;
  daysUntilNext: number | null;
  nextIsEstimate: boolean;
  lastSurprisePct: number | null;
  lastEpsActual: number | null;
  lastEpsEstimate: number | null;
};

function toDate(raw: Date | string | null | undefined): Date | null {
  if (!raw) return null;
  if (typeof raw === "string" && /^-?\d+q$/i.test(raw.trim())) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function uniqueDates(raw: Array<Date | string | null> | null | undefined): Date[] {
  const seen = new Set<string>();
  const out: Date[] = [];
  for (const item of raw ?? []) {
    const d = toDate(item);
    if (!d) continue;
    const key = dateKeyInTz(d);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

/**
 * Yahoo mixes three clocks: the fiscal quarter end (`quarter`), the
 * announced results day (`earningsDate`), and the call (`earningsCallDate`).
 * `period` is "-1q", not a date. After a print, the call date is often
 * already in the past while the next dated results sit a quarter out.
 */
export function resolveYahooEarnings(
  input: YahooEarningsInput,
  now = new Date()
): ResolvedEarnings {
  const today = dateKeyInTz(now);
  const calls = uniqueDates(input.earningsCallDates);
  const prints = uniqueDates(input.earningsDates);
  const announced = [...calls, ...prints];
  const offset = (d: Date) => calendarDaysBetweenKeys(today, dateKeyInTz(d));

  const past = announced
    .filter((d) => offset(d) < 0)
    .sort((a, b) => b.getTime() - a.getTime());
  const futurePrints = prints
    .filter((d) => offset(d) >= 0)
    .sort((a, b) => a.getTime() - b.getTime());
  const futureCalls = calls
    .filter((d) => offset(d) >= 0)
    .sort((a, b) => a.getTime() - b.getTime());

  const history = input.history ?? [];
  const latestHist = history[history.length - 1];
  const quarter = toDate(latestHist?.quarter ?? null);

  const lastDate = past[0] ?? (quarter && dateKeyInTz(quarter) < today ? quarter : null);
  const lastKey = lastDate ? dateKeyInTz(lastDate) : null;

  const nextCandidate = futurePrints[0] ?? futureCalls[0] ?? null;
  const nextDate =
    nextCandidate && lastKey && dateKeyInTz(nextCandidate) <= lastKey
      ? null
      : nextCandidate;
  const nextKey = nextDate ? dateKeyInTz(nextDate) : null;

  return {
    lastDate,
    lastKey,
    daysSinceLast: lastKey ? calendarDaysBetweenKeys(lastKey, today) : null,
    nextDate,
    nextKey,
    daysUntilNext: nextKey ? calendarDaysBetweenKeys(today, nextKey) : null,
    nextIsEstimate: Boolean(input.nextIsEstimate) && nextKey != null,
    lastSurprisePct:
      typeof latestHist?.surprisePercent === "number"
        ? latestHist.surprisePercent
        : null,
    lastEpsActual:
      typeof latestHist?.epsActual === "number" ? latestHist.epsActual : null,
    lastEpsEstimate:
      typeof latestHist?.epsEstimate === "number" ? latestHist.epsEstimate : null,
  };
}

export type EarningsCalendarRow = {
  ticker: string;
  lastDate: string | null;
  daysSinceLast: number | null;
  nextDate: string | null;
  daysUntilNext: number | null;
  nextIsEstimate?: boolean;
};

function daysPhrase(days: number, when: "ago" | "until"): string {
  if (days === 0) return "today";
  if (days === 1) return when === "ago" ? "yesterday" : "tomorrow";
  return when === "ago" ? `${days} days ago` : `in ${days} days`;
}

/** Instructional block for Margus. Dates only. No invented Tuesdays. */
export function formatEarningsCalendarBlock(
  rows: EarningsCalendarRow[]
): string {
  if (rows.length === 0) {
    return `### Earnings calendar
No dates on file for this portfolio. Do not invent a day. If they ask, say you do not have a date.`;
  }
  const lines = rows.map((row) => {
    const bits: string[] = [];
    if (row.lastDate && row.daysSinceLast != null) {
      bits.push(
        `last report ${row.lastDate} (${daysPhrase(row.daysSinceLast, "ago")})`
      );
    }
    if (row.nextDate && row.daysUntilNext != null && row.daysUntilNext >= 0) {
      const estimate = row.nextIsEstimate ? ", estimate" : "";
      bits.push(
        `next ${row.nextDate} (${daysPhrase(row.daysUntilNext, "until")}${estimate})`
      );
    }
    if (bits.length === 0) return `- $${row.ticker}: no date on file`;
    return `- $${row.ticker}: ${bits.join(". ")}.`;
  });
  return `### Earnings calendar (Yahoo, live)
This is the only calendar you may use. Do not invent, recall, or guess a day.
If a name is not listed, or says no date on file, say you do not have a date.
Do not move a date to "Tuesday" or "two days after Monday" to make a story fit.

${lines.join("\n")}`;
}
