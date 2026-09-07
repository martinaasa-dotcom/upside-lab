/**
 * One company page, built once, read by three callers.
 *
 * The app's own route (`/api/company/[ticker]`), the public research page
 * and the cron that warms the public pages all need the same thing: the
 * feed's figures, the headlines, the links out, and the written brief. The
 * only thing they disagree about is **whether a missing brief is worth a
 * model run right now**, and that is exactly one boolean.
 *
 * That split is the whole reason this file exists, and it is the load
 * bearing rule of the public pages. A page view may never call a model. If
 * it could, one crawler walking the sitemap would spend a run per company
 * in a couple of minutes, and a page that costs money to serve is a page
 * that cannot be published. So the public path asks with `generate: false`
 * and takes whatever the shared cache has, which is a page with figures
 * and no argument on the rare occasion the cache is cold. The cron asks
 * with `generate: true`, at a rate this app sets rather than a rate a
 * stranger sets.
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
import { loadCompanyBrief, saveCompanyBrief } from "@/lib/company/brief-store";
import type { CompanyPage } from "@/lib/company/client";
import { fetchCompanyFacts } from "@/lib/market/fundamentals";
import { fetchTickerPulseContext } from "@/lib/market/ticker-context";
import {
  fillMissingForecastYears,
  forecastThemeForTicker,
  reshapeToThemeRhythm,
  shapedFallbackPath,
} from "@/lib/forecast-conviction";
import { persistServerTickerCache } from "@/lib/forecast-ticker-cache-store";
import { generateObject } from "ai";

/** Leave room to build and send the response after the model stops. */
export const LLM_BUDGET_MS = 80_000;

export type BuildOutcome =
  | { ok: true; page: CompanyPage; wroteBrief: boolean }
  | { ok: false; reason: "unknown-ticker" };

export type BuildOptions = {
  /**
   * May this call spend a model run when the shared cache has nothing?
   *
   * False on every path a stranger can trigger. See the file docstring.
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
  const articles = companyArticles(context?.news);
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
  const figuresOnly = (): BuildOutcome => ({
    ok: true,
    page: { ...base, brief: null, briefAt: null, model: null },
    wroteBrief: false,
  });

  const cached = await loadCompanyBrief(ticker, {
    spot: facts.price,
    factsKey,
  });
  if (cached) {
    return {
      ok: true,
      page: {
        ...base,
        brief: cached.brief,
        briefAt: cached.generatedAt,
        briefShared: true,
        model: null,
      },
      wroteBrief: false,
    };
  }

  /*
    A company the feed barely covers gets its figures and no written page.
    Asking a model to write a case for and against from two numbers and no
    description produces exactly the confident, unfalsifiable paragraph
    this room was built to replace.
  */
  if (thin || !opts.generate) return figuresOnly();

  const chain = buildAdvisorProviderChain({ reasoning: true });
  if (chain.length === 0) return figuresOnly();

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
    */
    const spot = facts.price ?? 0;
    let path = resolved.path;
    if (spot > 0 && Object.keys(path).length > 0) {
      const shaped = shapedFallbackPath(spot, forecastThemeForTicker(ticker));
      const filled = fillMissingForecastYears(path, shaped);
      path = reshapeToThemeRhythm(filled, shaped, spot);
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

    return {
      ok: true,
      page: {
        ...base,
        brief,
        briefAt: generatedAt,
        briefShared: false,
        model: answeredBy,
      },
      wroteBrief: true,
    };
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    console.error("[company]", err);
    // The figures are the half a reader can check, so they go out whatever
    // happened to the prose.
    return figuresOnly();
  }
}
