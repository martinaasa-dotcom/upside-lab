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
import { fetchCompanyFacts } from "@/lib/market/fundamentals";
import { fetchTickerPulseContext } from "@/lib/market/ticker-context";
import {
  fillMissingForecastYears,
  forecastThemeForTicker,
  reshapeToThemeRhythm,
  shapedFallbackPath,
} from "@/lib/forecast-conviction";
import { persistServerTickerCache } from "@/lib/forecast-ticker-cache-store";
import { isQuotableTicker } from "@/lib/ticker";
import { observeRoute } from "@/lib/observe-route";
import { rateLimitJson } from "@/lib/rate-limit";
import { takeDurableRateLimit } from "@/lib/rate-limit-durable";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { stampAdvisorUse } from "@/lib/advisor-use";
import { generateObject } from "ai";
import { noStoreHeaders } from "@/lib/cdn-cache";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Leave room to build and send the response after the model stops. */
const LLM_BUDGET_MS = 80_000;

/**
 * One company page.
 *
 * The whole shape of this route follows from one rule: **the figures and
 * the prose are fetched separately and neither is allowed to become the
 * other.** The feed answers with numbers, which are returned whatever
 * happens to the model, so a company whose page could not be written still
 * arrives with everything a reader can check. The model answers with prose,
 * which is returned only after every point it made has been matched back to
 * one of those numbers or one of the headlines.
 *
 * That is also why the figures are never awaited on the model's behalf: a
 * page with the numbers and no argument is a useful page, and a page with
 * an argument and no numbers is the thing this room exists to replace.
 */
async function handleGET(
  req: Request,
  ctx: { params: Promise<{ ticker: string }> }
) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { ticker: raw } = await ctx.params;
  const ticker = decodeURIComponent(raw ?? "").trim().toUpperCase();
  /*
    Refused before anything is fetched, and this is the check that makes
    the shared cache safe. The ticker is the one caller-supplied value that
    reaches this route at all, and a row written under a symbol the market
    does not list would be a page nobody could ever check.
  */
  if (!ticker || !isQuotableTicker(ticker)) {
    return Response.json(
      { error: "That does not look like a ticker." },
      { status: 400, headers: noStoreHeaders() }
    );
  }

  const limit = await takeDurableRateLimit(
    `company:${auth.user.id}`,
    30,
    10 * 60_000
  );
  if (!limit.ok) {
    return rateLimitJson(
      limit,
      "You are looking up companies faster than the feeds allow. Try again in a few minutes."
    );
  }

  const [facts, context] = await Promise.all([
    fetchCompanyFacts(ticker),
    fetchTickerPulseContext(ticker).catch(() => null),
  ]);

  if (!facts) {
    return Response.json(
      {
        error:
          "Nothing came back for that symbol. Check the spelling, or it may not be one the feed covers.",
      },
      { status: 404, headers: noStoreHeaders() }
    );
  }

  const readings = companyReadings(facts);
  const articles = companyArticles(context?.news);
  const sources = companySources({
    ticker,
    listedSymbol: facts.listedSymbol,
    website: facts.website,
    name: facts.name,
  });
  const factsKey = companyFactsKey(facts);
  const thin = factsAreThin(facts);

  const base = {
    facts,
    readings,
    articles,
    sources,
    thin,
    nextEarnings: context?.nextEarningsDate ?? null,
    nextEarningsIsEstimate: context?.nextIsEstimate ?? false,
  };

  const cached = await loadCompanyBrief(ticker, {
    spot: facts.price,
    factsKey,
  });
  if (cached) {
    return Response.json(
      {
        ...base,
        brief: cached.brief,
        briefAt: cached.generatedAt,
        briefShared: true,
        model: null,
      },
      { headers: noStoreHeaders() }
    );
  }

  /*
    A company the feed barely covers gets its figures and no written page.
    Asking a model to write a case for and against from two numbers and no
    description produces exactly the confident, unfalsifiable paragraph
    this room was built to replace.
  */
  if (thin) {
    return Response.json(
      { ...base, brief: null, briefAt: null, model: null },
      { headers: noStoreHeaders() }
    );
  }

  const chain = buildAdvisorProviderChain({ reasoning: true });
  if (chain.length === 0) {
    return Response.json(
      { ...base, brief: null, briefAt: null, model: null },
      { headers: noStoreHeaders() }
    );
  }

  stampAdvisorUse(auth.user.id);
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
        answeredBy = { provider: providerId, model: modelIdFor(chain, providerId) };
        return generateObject({
          model,
          schema: companyBriefSchema,
          prompt,
          maxRetries: 1,
          abortSignal: signal ?? req.signal,
          providerOptions: STRUCTURED_PROVIDER_OPTIONS,
        });
      },
      { deadlineAt: startedAt + LLM_BUDGET_MS, signal: req.signal }
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
    */
    void (async () => {
      await saveCompanyBrief({
        ticker,
        brief,
        factsKey,
        anchorPrice: facts.price,
        generatedAt,
      });
      if (Object.keys(path).length === 0 || !facts.price) return;
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
    })();

    return Response.json(
      { ...base, brief, briefAt: generatedAt, briefShared: false, model: answeredBy },
      { headers: noStoreHeaders() }
    );
  } catch (err) {
    if (req.signal.aborted) {
      return Response.json({ error: "Stopped." }, { status: 499 });
    }
    console.error("[company]", err);
    // The figures are the half a reader can check, so they go out whatever
    // happened to the prose.
    return Response.json(
      { ...base, brief: null, briefAt: null, model: null },
      { headers: noStoreHeaders() }
    );
  }
}

export const GET = observeRoute(handleGET, "/api/company/[ticker]");
