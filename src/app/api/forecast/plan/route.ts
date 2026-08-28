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

  const portfolioId = String(body.portfolioId ?? "");
  const portfolioName = String(body.portfolioName ?? "Portfolio");
  const cashBalance = Number(body.cashBalance ?? 0);
  const forecast = body.forecast as ForecastModel;
  const convictions = body.convictions as
    | Record<string, { level: number; thesis: string }>
    | undefined;

  if (!portfolioId || !forecast?.rows) {
    return Response.json(
      { error: "portfolioId and forecast snapshot required" },
      { status: 400 }
    );
  }

  const fallbackPlan = () =>
    buildFallbackForecastPlan({
      forecast,
      portfolioId,
      portfolioName,
    });

  // Shared, cross-portfolio: once any portfolio has priced a ticker, every
  // other portfolio holding it reuses that path/rationale instead of paying
  // for another model run. See src/lib/forecast-ticker-cache-store.ts.
  const heldTickers = [...new Set(forecast.rows.map((r) => r.ticker.toUpperCase()))];
  const cacheHits = await loadServerTickerCache(heldTickers, convictions);
  // Which names were answered out of the shared cache rather than written
  // fresh, and when that earlier run happened. The eye beside a price says
  // so: a reused path was reasoned from the company, not from this
  // portfolio, and a reader comparing two portfolios deserves to know the
  // identical path is the same run and not two models agreeing.
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
      convictions,
    });

    // Recorded as the call happens, so the plan can name the model that
    // really answered rather than the one at the head of the chain. The
    // chain walks on a rate limit, so those two differ often enough that
    // guessing would make the eye a liar.
    let answeredBy: ModelRun | null = null;

    const { object } = await withAdvisorFallback(
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

    const plan = humanizeMargusTree({
      ...object,
      eoyTargets,
      generatedAt: new Date().toISOString(),
      portfolioId,
      portfolioName,
      stance: DEFAULT_FORECAST_STANCE,
      writtenBy: answeredBy,
      reused,
    });

    void persistServerTickerCache(plan, convictions);

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
