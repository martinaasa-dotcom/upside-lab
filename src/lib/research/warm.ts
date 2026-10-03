/**
 * The only thing in this app allowed to spend a model run on a public
 * page, and it runs on a clock rather than on a stranger's click.
 *
 * This is the other half of the rule in `page-data.ts`. A public page view
 * may never generate, because a crawler walking a sitemap would then be
 * holding the trigger on the model budget. So the pages read whatever the
 * shared brief store has, and this keeps that store honest: it looks at a
 * few dozen published companies per run against today's figures and
 * headlines, and rewrites the ones whose page `judgeBrief` says is due,
 * with a hard ceiling on how many runs a day the whole section can cost.
 *
 * **The queue is ordered on when a company was last CHECKED, not on when
 * its page was written**, and that is what changed. While every page
 * expired on a five day clock, oldest-written-first walked the whole list.
 * Now a page is kept until something happens to the company, so the
 * oldest pages are the quiet companies with nothing to do, and that order
 * would spend every run re-checking the same handful at the front while
 * the rest of the list was never looked at, news and all. `checked_at` is
 * stamped on every company a run looks at, so the list rotates on its own
 * and nobody stores a cursor. Companies with no page at all go first. A run
 * that dies half way costs nothing: the companies it did not reach are
 * simply still the least recently checked ones next time.
 *
 * `buildCompanyPage` refuses to run the model when the stored page is
 * current, and takes a claim before it writes, so a company that a reader
 * inside the app is rewriting right now is skipped here for free. The two
 * paths cannot double up.
 */
import { buildCompanyPage } from "@/lib/company/page-build";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  missingCheckedColumn,
  stampBriefChecked,
} from "@/lib/company/brief-store";
import { RESEARCH_TICKERS } from "@/lib/research/universe";

/**
 * How many companies one run may write.
 *
 * With the schedule in `vercel.json` this is the whole model budget for
 * the section: four runs a day at eight is **at most 32 model calls a
 * day**, whatever happens on the internet in between. Most runs now write
 * far fewer, because most companies on most days have had nothing happen
 * to them.
 */
export const WARM_PER_RUN = 8;

/**
 * How many companies one run may look at, written or not.
 *
 * A look is the figures and the headlines, both of which the feed answers
 * for in about a second and neither of which costs a model run. Four runs a
 * day at this many is more than the whole published list, so every
 * company is checked against the news at least once a day, which is the
 * promise "rewritten when something happens" rests on for a company
 * nobody signed in is reading. `research-seo.test.ts` holds that.
 */
export const WARM_CHECKS_PER_RUN = 36;

/**
 * How long a run may keep starting new companies.
 *
 * A model call has its own budget inside `buildCompanyPage`, and the
 * platform kills the function at `maxDuration` whatever either of them
 * thinks. This stops a run beginning a company it has no chance of
 * finishing, so a killed run never leaves a half-written page: the work is
 * a whole company at a time and the next run picks the rest up.
 */
export const WARM_BUDGET_MS = 90_000;

export type WarmResult = {
  considered: number;
  checked: number;
  written: string[];
  skipped: string[];
  failed: string[];
};

type QueueRow = {
  ticker: string;
  generated_at: string;
  checked_at?: string | null;
};

let checkedColumnReady = true;

/**
 * The published companies in the order a run should look at them: the
 * ones with no page first, then the least recently checked, then the
 * oldest written.
 *
 * One read, bounded by the size of the published list, so it is exempt
 * from the paging rule for the reason that rule names: it has an explicit
 * limit and cannot be truncated into a silently short answer.
 */
export function orderWarmQueue(
  tickers: readonly string[],
  rows: readonly QueueRow[]
): string[] {
  const known = new Map(rows.map((r) => [r.ticker.toUpperCase(), r]));
  const never = tickers.filter((t) => !known.has(t));
  const seen = tickers.filter((t) => known.has(t));
  const checkedAt = (t: string) => known.get(t)?.checked_at ?? "";
  const writtenAt = (t: string) => known.get(t)?.generated_at ?? "";
  seen.sort((a, b) => {
    // A company never checked sorts ahead of every company that has been.
    const byCheck = checkedAt(a).localeCompare(checkedAt(b));
    if (byCheck !== 0) return byCheck;
    return writtenAt(a).localeCompare(writtenAt(b));
  });
  return [...never, ...seen];
}

async function warmQueue(): Promise<string[]> {
  const db = getSupabaseServer();
  if (!db) return [...RESEARCH_TICKERS];
  const ask = () =>
    db
      .from("portfell_company_briefs")
      .select(
        checkedColumnReady
          ? "ticker, generated_at, checked_at"
          : "ticker, generated_at"
      )
      .in("ticker", [...RESEARCH_TICKERS])
      .limit(RESEARCH_TICKERS.length);
  let { data, error } = await ask();
  if (missingCheckedColumn(error)) {
    // The migration has not landed: order on when pages were written, which
    // is what this did before, until it has.
    checkedColumnReady = false;
    ({ data, error } = await ask());
  }
  if (error) {
    console.error("research warm read failed", error.message);
    return [...RESEARCH_TICKERS];
  }
  return orderWarmQueue(
    RESEARCH_TICKERS,
    (data ?? []) as unknown as QueueRow[]
  );
}

export async function warmResearchPages(
  opts: { limit?: number; checks?: number; now?: () => number } = {}
): Promise<WarmResult> {
  const limit = Math.max(1, opts.limit ?? WARM_PER_RUN);
  const checks = Math.max(limit, opts.checks ?? WARM_CHECKS_PER_RUN);
  const clock = opts.now ?? Date.now;
  const startedAt = clock();
  const queue = await warmQueue();

  const result: WarmResult = {
    considered: queue.length,
    checked: 0,
    written: [],
    skipped: [],
    failed: [],
  };

  for (const ticker of queue) {
    if (result.written.length + result.failed.length >= limit) break;
    if (result.checked >= checks) break;
    if (clock() - startedAt > WARM_BUDGET_MS) break;
    result.checked += 1;
    try {
      /*
        The builder judges the stored page against today's figures and
        headlines and writes only when it is due, clearing the public page
        itself when it does. So this loop has nothing to decide: it only
        has to look at the right companies, in the right order.
      */
      const built = await buildCompanyPage(ticker, { generate: true });
      if (!built.ok) {
        result.failed.push(ticker);
      } else if (built.wroteBrief) {
        result.written.push(ticker);
      } else {
        // The page was current, somebody else was writing it, the feed
        // carries too little about this one to write from, or the run
        // failed and the page on file stands. None of them is worth a
        // second attempt this run.
        result.skipped.push(ticker);
      }
    } catch (err) {
      console.error("research warm failed", ticker, err);
      result.failed.push(ticker);
    }
    /*
      Stamped whatever the outcome, so the queue moves on. A company whose
      rewrite failed is looked at again when the list comes round, about a
      day later, rather than at the front of every run until the provider
      recovers.
    */
    await stampBriefChecked(ticker);
  }

  return result;
}
