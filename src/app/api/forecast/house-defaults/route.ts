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
import type { EoyTickerOverrides, PortfolioEoyOverrides } from "@/lib/forecast-overrides";
import { sanitizeEoyOverrides, sanitizeLadders } from "@/lib/lab-bundle";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const dynamic = "force-dynamic";

export type HouseForecastDefaults = {
  eoyPrices: PortfolioEoyOverrides;
  ladders: Record<string, LadderOverride>;
};

const EMPTY: HouseForecastDefaults = { eoyPrices: {}, ladders: {} };

function sanitizeLadderRow(raw: unknown): LadderOverride | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  // Reuses the same shape sanitizeLadders already validates per ticker,
  // wrapped so one bad row from the table can't poison the whole map.
  const cleaned = sanitizeLadders({ X: raw });
  return cleaned.X ?? null;
}

async function loadHouseDefaults(): Promise<HouseForecastDefaults> {
  if (!supabaseUsesServiceRole()) return EMPTY;
  try {
    const supabase = getSupabaseServer();
    if (!supabase) return EMPTY;
    const { data, error } = await supabase
      .from(PORTFELL_TABLES.houseForecast)
      .select("ticker, eoy_prices, ladder");
    if (error || !data) return EMPTY;

    type Row = { ticker: string; eoy_prices: unknown; ladder: unknown };
    const eoyPrices: PortfolioEoyOverrides = {};
    const ladders: Record<string, LadderOverride> = {};
    for (const row of data as unknown as Row[]) {
      const ticker = String(row.ticker).trim().toUpperCase();
      if (!ticker) continue;
      const prices = sanitizeEoyOverrides({ [ticker]: row.eoy_prices })[ticker];
      if (prices) eoyPrices[ticker] = prices as EoyTickerOverrides;
      const ladder = sanitizeLadderRow(row.ladder);
      if (ladder) ladders[ticker] = ladder;
    }
    return { eoyPrices, ladders };
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
