import {
  STRUCTURED_PROVIDER_OPTIONS,
  buildAdvisorProviderChain,
  modelIdFor,
  withAdvisorFallback,
} from "@/lib/ai/model";
import type { ModelRun } from "@/lib/ai/model-label";
import { humanizeMargusTree } from "@/lib/ai/humanize-copy";
import {
  buildCachedForecastPlan,
  buildFallbackForecastPlan,
  buildForecastPlanPrompt,
  ensureCompleteEoyTargets,
  DEFAULT_FORECAST_STANCE,
} from "@/lib/forecast-plan";
import { forecastPlanSchema } from "@/lib/forecast-plan-schema";
import type { ForecastModel } from "@/lib/forecast";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { rateLimitJson } from "@/lib/rate-limit";
import { takeDurableRateLimit } from "@/lib/rate-limit-durable";
import { stampAdvisorUse } from "@/lib/advisor-use";
import {
  loadServerTickerCache,
  persistServerTickerCache,
  serverAnchorPrices,
} from "@/lib/forecast-ticker-cache-store";
import { generateObject } from "ai";
import { observeRoute } from "@/lib/observe-route";
import { forecastPostSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const maxDuration = 120;
export const runtime = "nodejs";

/**
 * Stop reasoning with enough of maxDuration left to still build and send a
 * JSON response. Overrunning means the platform kills the function and the
 * browser gets its plain-text error page, which used to surface to the user
 * as a raw "... is not valid JSON" parser error.
 */
const LLM_BUDGET_MS = 95_000;

/**
 * How far the price a run was reasoned from may sit from the market's own
 * before that run is kept to the reader who asked for it.
 *
 * Not a validation bound: a reader may hold a slightly stale price for
 * perfectly ordinary reasons and is still shown their own answer. This is
 * the gate on what reaches the shared cross-reader cache, where one wrong
 * path is served to everybody holding that company for up to a fortnight.
 */
const PUBLISHABLE_SPOT_DRIFT = 0.02;

async function handlePOST(req: Request) {
  const startedAt = Date.now();
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const parsed = await parseJsonBody(req, forecastPostSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const limit = await takeDurableRateLimit(`forecast:${auth.user.id}`, 12, 10 * 60_000);
  if (!limit.ok) {
    return rateLimitJson(
      limit,
      "Forecast requests are limited. Try again in a bit."
    );
  }
  stampAdvisorUse(auth.user.id);

  const portfolioId = body.portfolioId;
  const portfolioName = body.portfolioName ?? "Portfolio";
  const cashBalance = body.cashBalance ?? 0;
  // Every row has a ticker, a share count, a price and a value by the time
  // the body has parsed: `forecastPostSchema` shapes them, so a row that
  // is missing one is a 400 from `parseJsonBody` rather than a throw from
  // `r.ticker.toUpperCase()` below, which used to come back as a 500.
  const forecast = body.forecast as ForecastModel;

  const fallbackPlan = () =>
    buildFallbackForecastPlan({
      forecast,
      portfolioId,
      portfolioName,
    });

  // Shared, cross-portfolio: once any portfolio has priced a ticker, every
  // other portfolio holding it reuses that path/rationale instead of paying
  // for another model run. A row is only reused while it is inside the age
  // bound and the stock is still near the price it was reasoned from, so
  // today's prices go in with the lookup. See forecast-ticker-cache-store.ts.
  const heldTickers = [...new Set(forecast.rows.map((r) => r.ticker.toUpperCase()))];

  /*
    Today's price is asked of the market, not of the caller.

    The publish block below already re-prices the anchor server-side, and its
    comment reasons about exactly this attack: taking the anchor off the
    request let a caller set the price a cached row would later be judged
    against. What it did not cover is the price the model *reasons from*,
    which still came out of `forecast.rows[].currentPrice` and reached the
    prompt verbatim as `spot=`.

    That is the same hole one step earlier and it is worse, because the
    anchor is then corrected on the way in. Send NVDA at 5.00 and the model
    answers a five-year path off five dollars; the row publishes, and the
    anchor it publishes with is the real price. Every other reader holding
    that company then passes the age and drift checks and is served a path a
    thirty-sixth of the truth, under the provenance mark, as a fact, for up
    to a fortnight. The attacker need not own the company.

    So the server's own price wins wherever it has one. The caller's figure
    is used only for a company the market could not price, and such a
    company is not published either: the publish filter below drops any
    ticker with no server anchor, which is the same rule from the other end.
  */
  const serverSpots = await serverAnchorPrices(heldTickers);
  const claimedSpots: Record<string, number> = {};
  const spots: Record<string, number> = {};
  for (const row of forecast.rows) {
    const key = row.ticker.toUpperCase();
    if (row.currentPrice > 0) claimedSpots[key] = row.currentPrice;
    const trusted = serverSpots[key];
    if (typeof trusted === "number" && trusted > 0) spots[key] = trusted;
    else if (row.currentPrice > 0) spots[key] = row.currentPrice;
  }
  const cacheHits = await loadServerTickerCache(heldTickers, { spots });
  // Which companies were answered out of the shared cache rather than
  // written fresh, and when that earlier run happened. The mark beside a
  // price says so: a reused path was reasoned from the company, not from
  // this portfolio, and a reader comparing two portfolios deserves to know
  // an identical path is the same run rather than two models agreeing.
  const reused: Record<string, string> = {};
  for (const [ticker, hit] of Object.entries(cacheHits)) {
    if (hit?.generatedAt) reused[ticker] = hit.generatedAt;
  }

  if (heldTickers.length > 0 && heldTickers.every((t) => cacheHits[t])) {
    return Response.json({
      plan: {
        ...buildCachedForecastPlan({
          forecast,
          portfolioId,
          portfolioName,
          cacheHits,
        }),
        reused,
      },
    });
  }

  const providerChain = buildAdvisorProviderChain({ reasoning: true });
  if (providerChain.length === 0) {
    return Response.json({ plan: fallbackPlan(), fallback: true });
  }

  try {
    const prompt = buildForecastPlanPrompt({
      portfolioName,
      cashBalance,
      forecast,
    });

    // Recorded as the call happens, so the plan can name the model that
    // really answered rather than the one at the head of the chain. The
    // chain walks on a rate limit, so those two differ often enough that
    // guessing would make the mark a liar.
    let answeredBy: ModelRun | null = null;

    const { object, response } = await withAdvisorFallback(
      providerChain,
      (model, providerId, signal) => {
        answeredBy = {
          provider: providerId,
          model: modelIdFor(providerChain, providerId),
        };
        return generateObject({
          model,
          schema: forecastPlanSchema,
          prompt,
          maxRetries: 1,
          abortSignal: signal ?? req.signal,
          providerOptions: STRUCTURED_PROVIDER_OPTIONS,
        });
      },
      { deadlineAt: startedAt + LLM_BUDGET_MS, signal: req.signal }
    );

    /*
      What the provider says answered, not what we asked for.

      `withAdvisorFallback` walks the chain when a provider fails, and the
      line above records each attempt, which covers that. It does not cover
      the other kind of fallback: `openRouterFetchWithFallbacks` injects a
      `models` array into the body, so OpenRouter may route the request to a
      different model on its own and still answer 200. Nothing here fails,
      the chain never moves, and the mark names the model at the head of the
      chain, which did not write a word of this.

      The provider reports what it actually ran, so that wins whenever it is
      there. `modelIdFor` stays as the fallback for a provider that reports
      nothing, which is better than naming none: `describeModelRun` hides
      the whole section on null, and a panel that quietly loses its model
      line is worse than one naming the model we asked for.
    */
    const reported = (response as { modelId?: string } | undefined)?.modelId;
    if (answeredBy && typeof reported === "string" && reported.trim()) {
      answeredBy = { ...(answeredBy as ModelRun), model: reported.trim() };
    }

    // Cached tickers keep their reused path/rationale rather than drifting
    // on every run; only tickers with no fresh cache take the model's fresh
    // answer.
    const mergedTargets = (object.eoyTargets ?? []).map((t) => {
      const hit = cacheHits[t.ticker.toUpperCase()];
      return hit
        ? {
            ticker: t.ticker,
            prices: hit.prices as typeof t.prices,
            rationale: hit.rationale ?? t.rationale,
          }
        : t;
    });

    const eoyTargets = ensureCompleteEoyTargets(forecast, mergedTargets);

    const generatedAt = new Date().toISOString();
    const plan = humanizeMargusTree({
      ...object,
      eoyTargets,
      generatedAt,
      portfolioId,
      portfolioName,
      stance: DEFAULT_FORECAST_STANCE,
      writtenBy: answeredBy,
      reused,
    });

    /*
      Only what the model actually reasoned this run goes into the shared
      table. ensureCompleteEoyTargets hands back a row for every holding,
      filling the names the model never mentioned from the generic shaper,
      and writing those would publish a shape to every other reader holding
      the name as though it had been reasoned, and stop the model ever being
      asked about it again. A ticker served from the cache is left alone too,
      so its age keeps running rather than resetting on every reader.
    */
    const reasonedTickers = new Set(
      (object.eoyTargets ?? [])
        .filter((t) => t.prices && Object.keys(t.prices).length > 0)
        .map((t) => t.ticker.toUpperCase())
    );
    const reasoned = eoyTargets
      .filter(
        (t) =>
          reasonedTickers.has(t.ticker.toUpperCase()) &&
          !cacheHits[t.ticker.toUpperCase()]
      )
      .map((t) => ({
        ticker: t.ticker,
        prices: t.prices,
        rationale: t.rationale,
        anchorPrice: spots[t.ticker.toUpperCase()],
      }));

    /*
      The anchor is the price the path was reasoned from, and it is half of
      what later decides whether this row may stand in for a fresh run for
      somebody else. Taking it off the request let a caller set it: anchor a
      row far from the real price and it survives every drift check, or
      anchor it absurdly and no other reader can ever reuse it. So the
      server prices the companies it is about to publish, and a company the
      server cannot price is simply not published.

      Fire and forget, exactly as before, so the reader is not kept waiting
      for a quote call that is only about what the next reader gets.
    */
    void (async () => {
      if (reasoned.length === 0) return;
      // Already resolved above, when the prompt was built. Asking again
      // would be a second provider call for the same answer, and worse, a
      // path could then publish against a price it was not reasoned from.
      const anchors = serverSpots;
      const priced = reasoned
        .map((t) => ({ ...t, anchorPrice: anchors[t.ticker.toUpperCase()] }))
        .filter((t) => typeof t.anchorPrice === "number" && t.anchorPrice > 0)
        /*
          And the path has to have been reasoned from roughly the truth.

          The prompt prints `spot=` from the caller's own row, so a request
          claiming a company at 5.00 gets a five-year path off five dollars.
          The anchor is corrected on the way in, which is exactly what makes
          it dangerous: the row lands looking perfectly healthy, passes every
          later age and drift check, and serves that path to every other
          reader holding the company for up to a fortnight, under the
          provenance mark, as a fact. Nobody has to own the company to do it.

          Correcting the reader's own view was the other option and is worse:
          their price, their value and the weights derived from it are one
          consistent set, and rewriting one of them mid-request would make a
          screen disagree with itself over a number nobody attacked.

          So the reader keeps whatever they sent, and the shared table takes
          only runs whose price agrees with the market's. Two per cent is
          wide enough for the gap between a reader's last poll and this
          request, and far too tight to move a path anywhere useful.
        */
        .filter((t) => {
          const claimed = claimedSpots[t.ticker.toUpperCase()];
          if (typeof claimed !== "number" || claimed <= 0) return true;
          const anchor = t.anchorPrice as number;
          return Math.abs(claimed - anchor) / anchor <= PUBLISHABLE_SPOT_DRIFT;
        });
      await persistServerTickerCache(priced, { generatedAt });
    })();

    return Response.json({ plan });
  } catch (err) {
    if (req.signal.aborted) {
      return Response.json({ error: "Stopped." }, { status: 499 });
    }
    console.error("[forecast/plan]", err);
    // A person is staring at a flat grid. Never leave them with an error
    // and today's price pasted across 2026-2030.
    return Response.json({ plan: fallbackPlan(), fallback: true });
  }
}

export const POST = observeRoute(handlePOST, '/api/forecast/plan');
