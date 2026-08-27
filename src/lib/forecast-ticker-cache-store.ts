/**
 * Server-side, cross-portfolio counterpart to the localStorage ticker cache
 * in forecast-plan.ts. That one only ever reused a path inside a single
 * browser; this is the shared table so once Aasad's portfolio has priced
 * $RKLB, Anu's portfolio reuses the same reasoning instead of paying for
 * another model run. Best-effort: a read/write failure never blocks a plan.
 */
import type { Json } from "@/lib/supabase/database.types";
import type { ForecastPlan } from "@/lib/forecast-plan";
import type { ForecastYear } from "@/lib/forecast";
import { getSupabaseServer } from "@/lib/supabase/server";
import { tickerConvictionKey } from "@/lib/forecast-plan";

type ConvictionLike = Record<string, { level: number; thesis: string }>;

export type ServerTickerPath = {
  prices: Partial<Record<ForecastYear, number>>;
  rationale?: string;
  generatedAt: string;
  convictionKey: string;
};

function isFresh(
  row: ServerTickerPath,
  ticker: string,
  convictions?: ConvictionLike
): boolean {
  if (!row.prices || Object.keys(row.prices).length === 0) return false;
  // No thesis shaped this row: fair game for any portfolio holding the ticker.
  if (!row.convictionKey) return true;
  return row.convictionKey === tickerConvictionKey(ticker, convictions);
}

/** Fresh, reusable rows for the given tickers. Missing/stale tickers are
 * simply absent from the result rather than erroring. */
export async function loadServerTickerCache(
  tickers: string[],
  convictions?: ConvictionLike
): Promise<Record<string, ServerTickerPath>> {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean))];
  const out: Record<string, ServerTickerPath> = {};
  if (unique.length === 0) return out;
  const db = getSupabaseServer();
  if (!db) return out;
  const { data, error } = await db
    .from("portfell_forecast_ticker_cache")
    .select("ticker, prices, rationale, conviction_key, generated_at")
    .in("ticker", unique);
  if (error || !data) {
    if (error) console.error("forecast ticker cache read failed", error.message);
    return out;
  }
  for (const row of data) {
    const path: ServerTickerPath = {
      prices: (row.prices ?? {}) as Partial<Record<ForecastYear, number>>,
      rationale: row.rationale ?? undefined,
      generatedAt: row.generated_at,
      convictionKey: row.conviction_key ?? "",
    };
    if (isFresh(path, row.ticker, convictions)) {
      out[row.ticker.toUpperCase()] = path;
    }
  }
  return out;
}

/** Write-through after a model run. Best-effort; never throws. */
export async function persistServerTickerCache(
  plan: Pick<ForecastPlan, "eoyTargets" | "generatedAt">,
  convictions?: ConvictionLike
) {
  const db = getSupabaseServer();
  if (!db) return;
  const rows = (plan.eoyTargets ?? [])
    .filter((t) => t.prices)
    .map((t) => ({
      ticker: t.ticker.toUpperCase(),
      prices: t.prices as unknown as Json,
      rationale: t.rationale ?? null,
      conviction_key: tickerConvictionKey(t.ticker, convictions),
      generated_at: plan.generatedAt ?? new Date().toISOString(),
    }));
  if (rows.length === 0) return;
  const { error } = await db
    .from("portfell_forecast_ticker_cache")
    .upsert(rows, { onConflict: "ticker" });
  if (error) console.error("forecast ticker cache write failed", error.message);
}
