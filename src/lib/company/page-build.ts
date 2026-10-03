/**
 * One company page, built once, read by four callers.
 *
 * The app's own read (`GET /api/company/[ticker]`), the rewrite the room
 * asks for behind it (`POST /api/company/[ticker]/brief`), the public
 * research page and the cron that warms the public pages all need the same
 * thing: the feed's figures, the headlines, the links out, and the written
 * brief. The only thing they disagree about is **whether a missing or stale
 * brief is worth a model run right now**, and that is exactly one boolean.
 *
 * That split is the whole reason this file exists, and it is the load
 * bearing rule of the public pages. A page view may never call a model. If
 * it could, one crawler walking the sitemap would spend a run per company
 * in a couple of minutes, and a page that costs money to serve is a page
 * that cannot be published. So the public path asks with `generate: false`
 * and takes whatever the shared store has. The app's own read asks the same
 * way, for a different reason: a reader who opens a company is handed what
 * is on file in well under a second, and the rewrite, when one is due, is a
 * second request made behind the page they are already reading. Nobody
 * waits for a model to open a company any more. The two generating callers
 * are the room's rewrite, for somebody signed in, and the cron, at a rate
 * this app sets rather than a rate a stranger sets.
 *
 * What counts as "due" is `judgeBrief` in `brief-store.ts`: the company
 * reported, an event landed in the news, the price moved a fifth, or three
 * weeks passed. A price that merely moves is not news here. It is live on
 * every page and placed in the fair value zones in the browser.
 *
 * The other rule is the one the API route already had and it is kept
 * exactly: the figures and the prose are fetched apart and neither may
 * become the other. A company whose brief could not be written still
 * arrives with everything a reader can check.
 */
import {
  STRUCTURED_PROVIDER_OPTIONS,
  buildAdvisorProviderChain,
  modelIdFor,
  withAdvisorFallback,
} from "@/lib/ai/model";
import type { ModelRun } from "@/lib/ai/model-label";
import { humanizeMargusTree } from "@/lib/ai/humanize-copy";
import {
  buildCompanyBriefPrompt,
  resolveCompanyBrief,
  type CompanyBrief,
} from "@/lib/ai/company-brief";
import { companyBriefSchema } from "@/lib/ai/company-brief-schema";
import { companyFactsKey, factsAreThin } from "@/lib/company/facts";
import { companyReadings } from "@/lib/company/readings";
import { companyArticles, companySources } from "@/lib/company/sources";
import {
  briefIsShowable,
  briefWantsWriting,
  claimBriefWrite,
  judgeBrief,
  readCompanyBrief,
  releaseBriefWrite,
  saveCompanyBrief,
  type BriefState,
} from "@/lib/company/brief-store";
import type { CompanyPage } from "@/lib/company/client";
import { fetchCompanyFacts } from "@/lib/market/fundamentals";
import { fetchTickerPulseContext } from "@/lib/market/ticker-context";
import {
  anchorPathToGrowth,
  fillMissingForecastYears,
  forecastThemeForTicker,
  isNearLinearPath,
  reshapeToThemeRhythm,
  shapedPathForTicker,
} from "@/lib/forecast-conviction";
import { persistServerTickerCache } from "@/lib/forecast-ticker-cache-store";
import { researchPageTag } from "@/lib/research/page-tags";
import { generateObject } from "ai";
import { revalidateTag } from "next/cache";

/** Leave room to build and send the response after the model stops. */
export const LLM_BUDGET_MS = 80_000;

export type BuildOutcome =
  | {
      ok: true;
      page: CompanyPage;
      wroteBrief: boolean;
      /** What the stored page was judged to be before anything was written. */
      before: BriefState;
    }
  | { ok: false; reason: "unknown-ticker" };

export type BuildOptions = {
  /**
   * May this call spend a model run when the stored page is missing or has
   * gone stale?
   *
   * False on every path a stranger can trigger, and on the app's own read
   * as well: a reader opening a company is handed whatever is on file at
   * once, and the rewrite is a second request the room makes behind it
   * (`/api/company/[ticker]/brief`). See the file docstring.
   */
  generate: boolean;
  signal?: AbortSignal;
  /** Called just before a run starts, so a route can stamp its own user. */
  onModelRun?: () => void;
};

/** The figures half, which is returned whatever happens to the prose. */
async function buildBase(ticker: string) {
  const [facts, context] = await Promise.all([
    fetchCompanyFacts(ticker),
    fetchTickerPulseContext(ticker).catch(() => null),
  ]);
  if (!facts) return null;

  const readings = companyReadings(facts);
  const articles = companyArticles(context?.news, 6, { ticker, name: facts.name });
  const sources = companySources({
    ticker,
    listedSymbol: facts.listedSymbol,
    website: facts.website,
    name: facts.name,
  });
  return {
    facts,
    context,
    readings,
    articles,
    sources,
    factsKey: companyFactsKey(facts),
    thin: factsAreThin(facts),
  };
}

export async function buildCompanyPage(
  rawTicker: string,
  opts: BuildOptions
): Promise<BuildOutcome> {
  const ticker = rawTicker.trim().toUpperCase();
  const built = await buildBase(ticker);
  if (!built) return { ok: false, reason: "unknown-ticker" };

  const { facts, context, readings, articles, sources, factsKey, thin } = built;
  const base = {
    facts,
    readings,
    articles,
    sources,
    thin,
    nextEarnings: context?.nextEarningsDate ?? null,
    nextEarningsIsEstimate: context?.nextIsEstimate ?? false,
  };

  /*
    THE STORED PAGE IS JUDGED, NOT JUST LOOKED UP.

    `judgeBrief` answers fresh, stale or missing against today's figures,
    today's headlines and today's price. Fresh is served as it is. Stale is
    served too, at once, with the reason on the page, because the argument
    on file is still the best one there is until a new one has been
    written, and a reader made to wait a minute for it is the complaint
    this whole arrangement exists to answer. Missing is the only case with
    no written half to show.
  */
  const row = await readCompanyBrief(ticker);
  const judged = judgeBrief(row, {
    spot: facts.price,
    factsKey,
    articles,
  });
  const before: BriefState =
    judged.kind === "missing" && thin ? { kind: "thin" } : judged;

  const onFile = (writing = false): BuildOutcome =>
    row && briefIsShowable(before)
      ? {
          ok: true,
          page: {
            ...base,
            brief: row.brief,
            briefAt: row.generatedAt,
            briefShared: true,
            briefState: before,
            model: null,
            ...(writing ? { writing: true } : {}),
          },
          wroteBrief: false,
          before,
        }
      : {
          ok: true,
          page: {
            ...base,
            brief: null,
            briefAt: null,
            briefState: before,
            model: null,
            ...(writing ? { writing: true } : {}),
          },
          wroteBrief: false,
          before,
        };
  // The figures go out whatever happened to the prose, and the name stays
  // because it is the promise the rest of this file is held to.
  const figuresOnly = () => onFile();

  if (!briefWantsWriting(before) || !opts.generate) return onFile();

  /*
    A company the feed barely covers gets its figures and no written page.
    Asking a model to write a case for and against from two numbers and no
    description produces exactly the confident, unfalsifiable paragraph
    this room was built to replace.
  */
  if (thin) return figuresOnly();

  const chain = buildAdvisorProviderChain({ reasoning: true });
  if (chain.length === 0) return figuresOnly();

  /*
    One writer per company. Somebody else already writing this page is not
    a failure: this caller gets what is on file, marked as being written,
    and the room asks again in a few seconds rather than paying for the
    same run a second time.
  */
  if (!(await claimBriefWrite(ticker))) return onFile(true);

  opts.onModelRun?.();
  const startedAt = Date.now();

  try {
    const prompt = buildCompanyBriefPrompt({
      facts,
      readings,
      articles,
      nextEarnings: context?.nextEarningsDate ?? null,
    });

    // Recorded as the call lands, never guessed from the head of the
    // chain, because the chain walks past a rate-limited provider and a
    // panel naming the wrong model is worse than one naming none.
    let answeredBy: ModelRun | null = null;
    const { object, response } = await withAdvisorFallback(
      chain,
      (model, providerId, signal) => {
        answeredBy = {
          provider: providerId,
          model: modelIdFor(chain, providerId),
        };
        return generateObject({
          model,
          schema: companyBriefSchema,
          prompt,
          maxRetries: 1,
          abortSignal: signal ?? opts.signal,
          providerOptions: STRUCTURED_PROVIDER_OPTIONS,
        });
      },
      { deadlineAt: startedAt + LLM_BUDGET_MS, signal: opts.signal }
    );

    // OpenRouter may route to a different model and still answer 200, so
    // what the provider says ran wins over what we asked for.
    const reported = (response as { modelId?: string } | undefined)?.modelId;
    if (answeredBy && typeof reported === "string" && reported.trim()) {
      answeredBy = { ...(answeredBy as ModelRun), model: reported.trim() };
    }

    const resolved = resolveCompanyBrief(object, {
      readings,
      articles,
      hasProfile: Boolean(facts.about),
    });

    /*
      The path is shaped by exactly the rules the Growth room uses, and by
      no others. `fillMissingForecastYears` only ever writes a year the
      model skipped, and `reshapeToThemeRhythm` re-times an even ramp onto
      a typical rhythm while landing on the model's own final price. There
      is no floor, no lift and no minimum multiple: a path that ends below
      today reaches the reader as it was written.

      The re-timing is gated on `isNearLinearPath`, and the comment above
      claimed that for months while the code did no such thing. Re-timing
      ran on EVERY path this room built, so a model that had reasoned a
      rhythm for itself had it thrown away and the theme's substituted:
      only the final year survived, and each earlier year was moved to
      wherever the theme's own curve put it. Measured on NBIS, a path
      whose reason still said it "slips in 2027 when expected earnings
      turn negative" was drawn as a smooth rise through every year, the
      five prices reproducing the ai_infra curve to the cent under a
      sentence describing a path nobody could see. It moved magnitude as
      well as shape, since a theme whose first year is a small share of
      its total move drags an aggressive first year down to meet it. A
      theme shape is a guess about what a kind of business does; a path
      the model gave timing to is a guess about this company, and the
      second wins.
    */
    const spot = facts.price ?? 0;
    let path = resolved.path;
    if (spot > 0 && Object.keys(path).length > 0) {
      const theme = forecastThemeForTicker(ticker);
      const shaped = shapedPathForTicker(spot, ticker);
      const filled = fillMissingForecastYears(path, shaped);
      const timed =
        isNearLinearPath(filled, spot) && theme !== "index"
          ? reshapeToThemeRhythm(filled, shaped, spot)
          : filled;
      // Same order as the Growth room: shape first, destination last, so
      // the two rooms cannot tell a reader two different stories.
      path = anchorPathToGrowth(timed, spot, ticker).prices;
    }

    const brief: CompanyBrief = humanizeMargusTree({ ...resolved, path });
    const generatedAt = new Date().toISOString();

    /*
      Written back for the next reader, and written back to the forecast
      cache too, so a company somebody looked up and then bought does not
      pay for a second run of the same reasoning in the Growth room. The
      anchor is the server's own price, never a figure off a request.

      Awaited rather than left running behind the response, which is what
      the route used to do. A promise still in flight when a serverless
      handler returns is a promise the platform is free to kill, so the
      write that was meant to save the next reader a model run was the one
      thing least likely to survive. It costs one round trip after a call
      that has already taken most of a minute.
    */
    await saveCompanyBrief({
      ticker,
      brief,
      factsKey,
      anchorPrice: facts.price,
      generatedAt,
    });
    if (Object.keys(path).length > 0 && facts.price) {
      await persistServerTickerCache(
        [
          {
            ticker,
            prices: path,
            rationale: brief.pathReason || undefined,
            anchorPrice: facts.price,
          },
        ],
        { generatedAt }
      );
    }

    /*
      The public page for this company is cleared the moment its written
      half changes, so a stranger reading it next gets the new argument
      rather than waiting out the six hour clock. "max" is stale while
      revalidate: the very next visitor is still served the old page at
      once and the new one is built behind them, so nobody waits for this
      either. A page built in the background reads its data afresh rather
      than from the stale entry, which is what makes the new one carry the
      new brief.

      Best effort and outside a render: this runs only on a generating
      path, which is a route handler or the warmer, never the public page
      itself.
    */
    try {
      revalidateTag(researchPageTag(ticker), "max");
    } catch (err) {
      console.error("[company] could not clear the public page", err);
    }

    return {
      ok: true,
      page: {
        ...base,
        brief,
        briefAt: generatedAt,
        briefShared: false,
        briefState: { kind: "fresh" },
        model: answeredBy,
      },
      wroteBrief: true,
      before,
    };
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    console.error("[company]", err);
    // The figures are the half a reader can check, so they go out whatever
    // happened to the prose, along with the page on file if there was one.
    return figuresOnly();
  } finally {
    await releaseBriefWrite(ticker);
  }
}
