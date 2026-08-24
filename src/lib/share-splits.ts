import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { fetchSplits, type ShareSplit } from "@/lib/market/yahoo";
import { dateKeyInTz } from "@/lib/timezone";

/*
  Share splits, which are the one thing that changes a holding without
  anybody buying or selling.

  Nvidia split ten for one on 10 June 2024. A hundred shares became a
  thousand, each worth a tenth of what it had been, and nothing was traded.
  Every price this app can read is post-split from that morning, because the
  old one cannot be traded again, so a holdings row still saying a hundred is
  valued at a tenth of the truth and the person who owns it opens Upside Lab
  to a portfolio that says they have lost ninety per cent of their money.

  That figure does not stay on one screen either. It reaches Pulse, which
  reads it as a thesis breaking, the alerts, and the Sunday letter, which
  states its numbers as fact and would tell somebody in plain English that
  their week was a catastrophe. A reverse split does the same in the other
  direction and reads as a windfall.

  The arithmetic is in the database, in one transaction, because it moves the
  share count and every per-share figure on the row together. What is here is
  the part the database cannot do: knowing that a split happened at all.
*/

/**
 * How far back a check looks.
 *
 * Four days, so a long weekend or a day when the job did not run does not
 * lose a split. Applying one late is safe: the ledger refuses a repeat.
 */
const LOOKBACK_DAYS = 4;

/** New York, because that is where the market whose calendar this follows is. */
const MARKET_TZ = "America/New_York";

export type AppliedSplit = ShareSplit & { holdings: number };

export type SplitSweep = {
  day: string;
  status: "done" | "claimed-elsewhere" | "no-answer" | "off";
  tickers?: number;
  applied?: AppliedSplit[];
};

function shiftDays(isoDate: string, days: number): string {
  const at = new Date(`${isoDate}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/**
 * Which of a company's splits this sweep is responsible for.
 *
 * Pure, so the window can be tested without a market. A split dated ahead has
 * not happened yet, and applying one early would move somebody's shares
 * before the market did.
 */
export function splitsInWindow(
  events: readonly ShareSplit[],
  today: string,
  lookbackDays = LOOKBACK_DAYS
): ShareSplit[] {
  const from = shiftDays(today, -lookbackDays);
  return events.filter(
    (event) => event.effectiveOn >= from && event.effectiveOn <= today
  );
}

/**
 * Finds the day's splits and applies them, once a day for everybody.
 *
 * Safe to call as often as anyone likes. The day's claim means one worker
 * asks the provider, and the ledger means a split is applied once however
 * many workers get past it.
 */
export async function applyDueSplits(now = new Date()): Promise<SplitSweep> {
  const day = dateKeyInTz(now, MARKET_TZ);

  const supabase = getSupabaseServer();
  if (!supabase || !supabaseUsesServiceRole()) return { day, status: "off" };

  const { data: claimed } = await supabase.rpc("portfell_claim_split_check", {
    p_day: day,
  });

  if (claimed !== true) return { day, status: "claimed-elsewhere" };

  const { data: held } = await supabase.rpc("portfell_tickers_held");
  const tickers = [
    ...new Set(
      ((held ?? []) as { ticker: string }[])
        .map((row) => row.ticker?.toUpperCase())
        .filter(Boolean)
    ),
  ];

  if (tickers.length === 0) return { day, status: "done", tickers: 0, applied: [] };

  const from = shiftDays(day, -LOOKBACK_DAYS);

  /*
    One request per company somebody holds, and only for those. A split in a
    company nobody owns changes nothing here, so asking about it would be a
    request spent on nothing.
  */
  const answers = await Promise.all(
    tickers.map((ticker) => fetchSplits(ticker, from, day))
  );

  /*
    Nobody answered, which is not the same as nobody splitting. The day's
    claim exists so one worker asks and the rest do not, so a worker that
    asked into a provider having a bad minute has to give the claim back:
    otherwise the next check is tomorrow, and somebody spends today looking at
    a portfolio that says they are down ninety per cent.
  */
  if (answers.every((answer) => answer === null)) {
    await supabase.from("portfell_split_checks").delete().eq("day", day);
    return { day, status: "no-answer", tickers: tickers.length };
  }

  const found = answers
    .filter((answer): answer is ShareSplit[] => answer !== null)
    .flatMap((events) => splitsInWindow(events, day));

  const applied: AppliedSplit[] = [];

  for (const split of found) {
    const { data, error } = await supabase.rpc("portfell_apply_split", {
      p_ticker: split.ticker,
      p_effective_on: split.effectiveOn,
      p_numerator: split.numerator,
      p_denominator: split.denominator,
    });

    if (error) continue;

    const row = data as { holdings_adjusted?: number } | null;
    applied.push({ ...split, holdings: row?.holdings_adjusted ?? 0 });
  }

  return { day, status: "done", tickers: tickers.length, applied };
}
