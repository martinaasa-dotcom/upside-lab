/**
 * Server-side, cross-portfolio counterpart to the localStorage ticker cache
 * in forecast-plan.ts. That one only ever reused a path inside a single
 * browser; this is the shared table so once one portfolio has priced $RKLB,
 * the next portfolio holding it reuses the same reasoning instead of paying
 * for another model run. Best-effort: a read or write failure never blocks a
 * plan.
 *
 * Three rules keep a shared row honest, because this table is read by every
 * reader in the product rather than by the one person who caused the run:
 *
 * 1. A row ages out. A five-year path keyed on the ticker alone and never
 *    expired would mean the first portfolio ever to hold a name fixed that
 *    name's forecast for everybody, forever.
 * 2. A row is tied to the price it was reasoned from. The year-one number
 *    only means anything next to the price it grew out of, so a stock that
 *    has run away from its anchor is re-reasoned rather than reused.
 * 3. `generated_at` is when the model reasoned the path, and a later run
 *    that merely reused the row must not bump it. Re-stamping on reuse would
 *    make a popular ticker immortal and rule 1 unreachable.
 */
import type { Json } from "@/lib/supabase/database.types";
import type { ForecastYear } from "@/lib/forecast";
import { getSupabaseServer } from "@/lib/supabase/server";
import { tickerConvictionKey } from "@/lib/forecast-plan";

type ConvictionLike = Record<string, { level: number; thesis: string }>;

/**
 * How long a reasoned path may be reused. One shared run serves every reader
 * holding the name, so re-reasoning a name a couple of times a month costs
 * almost nothing next to a path that can never be revisited.
 */
export const FORECAST_CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * How far the share price may travel from the price the path was reasoned
 * from before the path stops describing the same stock. A fifth is wide
 * enough that ordinary weeks reuse the row and narrow enough that a name
 * which has re-rated is asked about again.
 */
export const FORECAST_CACHE_MAX_DRIFT = 0.2;

export type ServerTickerPath = {
  prices: Partial<Record<ForecastYear, number>>;
  rationale?: string;
  /** When the model reasoned this path, not when it was last handed out. */
  generatedAt: string;
  convictionKey: string;
  /** Share price the path was reasoned from. Absent on pre-anchor rows. */
  anchorPrice?: number;
};

/** A path the model reasoned this run, ready to be shared with everyone. */
export type ReasonedTickerPath = {
  ticker: string;
  prices: Partial<Record<ForecastYear, number>>;
  rationale?: string;
  /** Today's share price, which is what this path was reasoned from. */
  anchorPrice?: number;
};

function driftFrom(anchor: number | undefined, spot: number | undefined): number | null {
  if (typeof anchor !== "number" || !Number.isFinite(anchor) || anchor <= 0) return null;
  if (typeof spot !== "number" || !Number.isFinite(spot) || spot <= 0) return null;
  return Math.abs(spot - anchor) / anchor;
}

/**
 * Whether a stored row may stand in for a fresh model run.
 *
 * Exported so the rules are testable without a database.
 */
export function isReusableTickerPath(
  row: ServerTickerPath,
  ticker: string,
  input: { spot?: number; convictions?: ConvictionLike; now?: Date } = {}
): boolean {
  if (!row.prices || Object.keys(row.prices).length === 0) return false;

  const now = input.now ?? new Date();
  const at = Date.parse(row.generatedAt ?? "");
  // A row with no readable date cannot be shown to be inside the age bound,
  // and "cannot show" is the same answer as "too old" for a shared row.
  if (!Number.isFinite(at)) return false;
  if (now.getTime() - at > FORECAST_CACHE_MAX_AGE_MS) return false;

  const drift = driftFrom(row.anchorPrice, input.spot);
  if (drift !== null && drift > FORECAST_CACHE_MAX_DRIFT) return false;

  // No thesis shaped this row: fair game for any portfolio holding the ticker.
  if (!row.convictionKey) return true;
  return row.convictionKey === tickerConvictionKey(ticker, input.convictions);
}

/**
 * Reusable rows for the given tickers. A ticker whose row is missing, aged
 * out, adrift from its anchor, or shaped by somebody else's thesis is simply
 * absent from the result rather than an error.
 */
export async function loadServerTickerCache(
  tickers: string[],
  input: {
    convictions?: ConvictionLike;
    /** Today's price per ticker, for the drift bound. */
    spots?: Record<string, number>;
    now?: Date;
  } = {}
): Promise<Record<string, ServerTickerPath>> {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean))];
  const out: Record<string, ServerTickerPath> = {};
  if (unique.length === 0) return out;
  const db = getSupabaseServer();
  if (!db) return out;
  const { data, error } = await db
    .from("portfell_forecast_ticker_cache")
    .select("ticker, prices, rationale, conviction_key, generated_at, anchor_price")
    .in("ticker", unique);
  if (error || !data) {
    if (error) console.error("forecast ticker cache read failed", error.message);
    return out;
  }
  for (const row of data) {
    const key = row.ticker.toUpperCase();
    const path: ServerTickerPath = {
      prices: (row.prices ?? {}) as Partial<Record<ForecastYear, number>>,
      rationale: row.rationale ?? undefined,
      generatedAt: row.generated_at,
      convictionKey: row.conviction_key ?? "",
      anchorPrice: row.anchor_price ?? undefined,
    };
    if (
      isReusableTickerPath(path, row.ticker, {
        spot: input.spots?.[key],
        convictions: input.convictions,
        now: input.now,
      })
    ) {
      out[key] = path;
    }
  }
  return out;
}

/**
 * Write-through after a model run. Best-effort; never throws.
 *
 * Takes only the paths the model actually reasoned this run. A path the
 * generic shaper filled in for a name the model never mentioned must not be
 * written here: it would be served to every later portfolio holding that
 * ticker as though it had been reasoned, and would stop the model ever being
 * asked about the name again. Reused rows are left alone for the same
 * reason, so their age keeps running.
 */
export async function persistServerTickerCache(
  reasoned: ReasonedTickerPath[],
  input: { convictions?: ConvictionLike; generatedAt?: string } = {}
) {
  const db = getSupabaseServer();
  if (!db) return;
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const rows = reasoned
    .filter((t) => t.prices && Object.keys(t.prices).length > 0)
    .map((t) => ({
      ticker: t.ticker.toUpperCase(),
      prices: t.prices as unknown as Json,
      rationale: t.rationale ?? null,
      conviction_key: tickerConvictionKey(t.ticker, input.convictions),
      generated_at: generatedAt,
      anchor_price:
        typeof t.anchorPrice === "number" && t.anchorPrice > 0 ? t.anchorPrice : null,
      updated_at: new Date().toISOString(),
    }));
  if (rows.length === 0) return;
  const { error } = await db
    .from("portfell_forecast_ticker_cache")
    .upsert(rows, { onConflict: "ticker" });
  if (error) console.error("forecast ticker cache write failed", error.message);
}
