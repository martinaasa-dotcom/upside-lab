/**
 * The house account's own forecast, republished for anybody who has not
 * set a target or a ladder level of their own for that ticker.
 *
 * Public and cache-friendly on purpose, the same shape as
 * `/api/popular-tickers`: this is one small table every reader's page
 * load can read cheaply, never a live read of another account's data.
 * `mirrorHouseForecast` (`src/lib/forecast/house-forecast-sync.ts`) is
 * what keeps `portfell_house_forecast` current, written only when the
 * house account itself saves.
 */
import { publicCdnHeaders } from "@/lib/cdn-cache";
import type { LadderOverride } from "@/lib/company/plan-ladder";
import type {
  EoyTickerOverrides,
  PortfolioEoyOverrides,
  PortfolioEoySources,
} from "@/lib/forecast-overrides";
import { sanitizeEoySources } from "@/lib/forecast-overrides";
import { sanitizeEoyOverrides, sanitizeLadders } from "@/lib/lab-bundle";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const dynamic = "force-dynamic";

export type HouseForecastDefaults = {
  eoyPrices: PortfolioEoyOverrides;
  /**
   * Which of those the house account typed and which its own forecast
   * run wrote, so a reader drawing the site's default is told the true
   * one. A ticker or year missing from here is described as saved
   * earlier rather than as either.
   */
  eoySources: PortfolioEoySources;
  ladders: Record<string, LadderOverride>;
};

const EMPTY: HouseForecastDefaults = {
  eoyPrices: {},
  eoySources: {},
  ladders: {},
};

function sanitizeLadderRow(raw: unknown): LadderOverride | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  // Reuses the same shape sanitizeLadders already validates per ticker,
  // wrapped so one bad row from the table can't poison the whole map.
  const cleaned = sanitizeLadders({ X: raw });
  return cleaned.X ?? null;
}

/**
 * A COLUMN'S MIGRATION AND THE DEPLOY THAT READS IT DO NOT LAND TOGETHER,
 * AND NAMING ONE TOO EARLY TAKES THE WHOLE ANSWER DOWN.
 *
 * PostgREST refuses the entire select for one unknown column, and this
 * route's failure is silent by design (an empty default rather than an
 * error), so between a deploy and its migration every reader would
 * quietly lose the site's own forecast instead of losing the one word
 * that says who wrote it. `/api/lab` learned this the same way; the flag
 * is per warm instance, so the column starts being read on its own once
 * the migration lands, with no deploy needed.
 */
let sourcesColumnReady = true;

function missingSourcesColumn(
  error: { code?: string; message?: string } | null
): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (code !== "PGRST204" && code !== "42703") return false;
  return /eoy_sources/i.test(error.message ?? "");
}

async function loadHouseDefaults(): Promise<HouseForecastDefaults> {
  if (!supabaseUsesServiceRole()) return EMPTY;
  try {
    const supabase = getSupabaseServer();
    if (!supabase) return EMPTY;
    const cols = () =>
      sourcesColumnReady
        ? "ticker, eoy_prices, eoy_sources, ladder"
        : "ticker, eoy_prices, ladder";
    let { data, error } = await supabase
      .from(PORTFELL_TABLES.houseForecast)
      .select(cols());
    if (missingSourcesColumn(error)) {
      sourcesColumnReady = false;
      ({ data, error } = await supabase
        .from(PORTFELL_TABLES.houseForecast)
        .select(cols()));
    }
    if (error || !data) return EMPTY;

    type Row = {
      ticker: string;
      eoy_prices: unknown;
      eoy_sources: unknown;
      ladder: unknown;
    };
    const eoyPrices: PortfolioEoyOverrides = {};
    const eoySources: PortfolioEoySources = {};
    const ladders: Record<string, LadderOverride> = {};
    for (const row of data as unknown as Row[]) {
      const ticker = String(row.ticker).trim().toUpperCase();
      if (!ticker) continue;
      const prices = sanitizeEoyOverrides({ [ticker]: row.eoy_prices })[ticker];
      if (prices) eoyPrices[ticker] = prices as EoyTickerOverrides;
      const sources = sanitizeEoySources({ [ticker]: row.eoy_sources })[ticker];
      if (sources) eoySources[ticker] = sources;
      const ladder = sanitizeLadderRow(row.ladder);
      if (ladder) ladders[ticker] = ladder;
    }
    return { eoyPrices, eoySources, ladders };
  } catch {
    return EMPTY;
  }
}

async function handleGET() {
  const payload = await loadHouseDefaults();
  return NextResponse.json(payload, {
    headers: publicCdnHeaders(900, 3600),
  });
}

export const GET = observeRoute(handleGET, "/api/forecast/house-defaults");
