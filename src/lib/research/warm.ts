/**
 * The only thing in this app allowed to spend a model run on a public
 * page, and it runs on a clock rather than on a stranger's click.
 *
 * This is the other half of the rule in `page-data.ts`. A public page view
 * may never generate, because a crawler walking a sitemap would then be
 * holding the trigger on the model budget. So the pages read whatever the
 * shared brief store has, and this fills that store: a few companies per
 * run, at times this app chooses, with a hard ceiling on how many runs a
 * day the whole section can possibly cost.
 *
 * **The order is oldest first, and that is what makes the ceiling work.**
 * Every run asks the store which of the published companies have the
 * oldest briefs, or none at all, and takes the first few. Over a day the
 * cursor walks the whole list without anybody storing a cursor, and a
 * company whose brief was written an hour ago is never asked again. A run
 * that dies half way costs nothing: the companies it did not reach are
 * simply still the oldest ones next time.
 *
 * `buildCompanyPage` already refuses to run the model when the store has a
 * usable row, so a company that was warmed by somebody looking it up
 * inside the app is skipped here for free. The two paths cannot double up.
 */
import { revalidatePath, revalidateTag } from "next/cache";
import { buildCompanyPage } from "@/lib/company/page-build";
import { getSupabaseServer } from "@/lib/supabase/server";
import { researchPageTag } from "@/lib/research/page-data";
import { RESEARCH_TICKERS, researchHref } from "@/lib/research/universe";

/**
 * How many companies one run may write.
 *
 * With the schedule in `vercel.json` this is the whole budget for the
 * section, and the arithmetic is the point of choosing it this way. Four
 * runs a day at eight companies is **at most 32 model calls a day**,
 * whatever happens on the internet in between, and it walks the published
 * list in three days. The store retires a brief after five, so the list is
 * covered inside its own expiry with two days to spare for the runs that
 * find a company the feed is having a bad minute about.
 *
 * Changing either number changes the other side of that: raise the list
 * far enough, or drop this far enough, and pages start going stale faster
 * than they are written. `research-seo.test.ts` holds the relationship.
 */
export const WARM_PER_RUN = 8;

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
  written: string[];
  skipped: string[];
  failed: string[];
};

/**
 * The published companies, oldest brief first, ones with no brief at all
 * ahead of them.
 *
 * One read, bounded by the size of the published list, so it is exempt
 * from the paging rule for the reason that rule names: it has an explicit
 * limit and cannot be truncated into a silently short answer.
 */
async function staleFirst(): Promise<string[]> {
  const db = getSupabaseServer();
  if (!db) return [...RESEARCH_TICKERS];
  const { data, error } = await db
    .from("portfell_company_briefs")
    .select("ticker, generated_at")
    .in("ticker", [...RESEARCH_TICKERS])
    .order("generated_at", { ascending: true })
    .limit(RESEARCH_TICKERS.length);
  if (error) {
    console.error("research warm read failed", error.message);
    return [...RESEARCH_TICKERS];
  }
  const known = new Map<string, string>(
    (data ?? []).map((row) => [row.ticker, row.generated_at])
  );
  const never = RESEARCH_TICKERS.filter((t) => !known.has(t));
  const dated = RESEARCH_TICKERS.filter((t) => known.has(t)).sort((a, b) =>
    (known.get(a) ?? "").localeCompare(known.get(b) ?? "")
  );
  return [...never, ...dated];
}

export async function warmResearchPages(
  opts: { limit?: number; now?: () => number } = {}
): Promise<WarmResult> {
  const limit = Math.max(1, opts.limit ?? WARM_PER_RUN);
  const clock = opts.now ?? Date.now;
  const startedAt = clock();
  const queue = await staleFirst();

  const result: WarmResult = {
    considered: queue.length,
    written: [],
    skipped: [],
    failed: [],
  };

  for (const ticker of queue) {
    if (result.written.length + result.failed.length >= limit) break;
    if (clock() - startedAt > WARM_BUDGET_MS) break;
    try {
      const built = await buildCompanyPage(ticker, { generate: true });
      if (!built.ok) {
        result.failed.push(ticker);
        continue;
      }
      if (!built.wroteBrief) {
        // The store already had a usable row, or the feed carries too
        // little about this one to write a page from. Neither costs a run
        // and neither is worth clearing a cached page over.
        result.skipped.push(ticker);
        continue;
      }
      result.written.push(ticker);
      /*
        The page is cleared by hand the moment its written half changes,
        rather than waiting out the six hour clock. Both, because they
        invalidate different things: the tag drops the cached load of this
        company, and the path drops the rendered HTML that was built from
        it. The CDN keeps its own copy until the page's own TTL expires,
        which is the documented behaviour and is why the clock is still
        the floor rather than something this replaces.
      */
      /*
        `{ expire: 0 }` is the two argument form this version requires,
        and it is the one documented for a route handler called by an
        outside scheduler: expire now rather than at the end of some cache
        profile. `updateTag` is the read-your-own-writes version and is
        only callable from a Server Action, which a cron is not.
      */
      revalidateTag(researchPageTag(ticker), { expire: 0 });
      revalidatePath(researchHref(ticker));
    } catch (err) {
      console.error("research warm failed", ticker, err);
      result.failed.push(ticker);
    }
  }

  return result;
}
