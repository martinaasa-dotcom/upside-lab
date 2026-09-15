/**
 * Mirrors the house account's own ladders and end-of-year targets into
 * `portfell_house_forecast`, the table every OTHER reader's forecast
 * falls back to when they have not set their own.
 *
 * This is never a live cross-account read: nothing on a reader's own page
 * load reaches into another account's `portfell_lab_state`. Instead the
 * one account whose plan is meant to be the site's starting point
 * (`isSuperadminEmail`'s first entry) republishes its own row here
 * whenever it saves, and every reader's own request reads this small
 * table instead, same shape as the monthly popular-tickers snapshot.
 *
 * `/api/lab`'s PUT is a partial save — a ladder-only save must not touch
 * anybody's watchlist — and the house account's saves are no different,
 * so a save that sends ladders but not eoyOverrides must not blank out
 * this table's own EOY half for a ticker it is not talking about. The
 * existing rows are read first and only the field that was actually sent
 * is replaced; a ticker left with neither an EOY target nor a ladder is
 * deleted rather than kept as an empty row nothing would ever read.
 */
import { isSuperadminEmail } from "@/lib/auth/superadmin";
import type { LadderOverrides } from "@/lib/company/plan-ladder";
import type { PortfolioEoyOverrides } from "@/lib/forecast-overrides";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import type { Json } from "@/lib/supabase/database.types";

export async function mirrorHouseForecast(input: {
  email: string | null | undefined;
  /** `undefined` means this save did not touch this field at all. */
  eoyOverrides?: PortfolioEoyOverrides;
  ladders?: LadderOverrides;
}): Promise<void> {
  if (!isSuperadminEmail(input.email)) return;
  if (input.eoyOverrides === undefined && input.ladders === undefined) return;
  if (!supabaseUsesServiceRole()) return;

  try {
    const supabase = getSupabaseServer();
    if (!supabase) return;
    const { data: existing } = await supabase
      .from(PORTFELL_TABLES.houseForecast)
      .select("ticker, eoy_prices, ladder");

    type Row = { ticker: string; eoy_prices: unknown; ladder: unknown };
    const prior = new Map<string, { eoy_prices: unknown; ladder: unknown }>();
    for (const row of (existing ?? []) as unknown as Row[]) {
      prior.set(row.ticker, { eoy_prices: row.eoy_prices, ladder: row.ladder });
    }

    const tickers = new Set(prior.keys());
    if (input.eoyOverrides) {
      for (const t of Object.keys(input.eoyOverrides)) tickers.add(t);
    }
    if (input.ladders) {
      for (const t of Object.keys(input.ladders)) tickers.add(t);
    }

    const now = new Date().toISOString();
    const upserts: Array<{
      ticker: string;
      eoy_prices: Json;
      ladder: Json;
      updated_at: string;
    }> = [];
    const deletes: string[] = [];

    for (const ticker of tickers) {
      const old = prior.get(ticker);
      const eoyPrices =
        input.eoyOverrides !== undefined
          ? (input.eoyOverrides[ticker] ?? {})
          : (old?.eoy_prices ?? {});
      const ladder =
        input.ladders !== undefined
          ? (input.ladders[ticker] ?? null)
          : (old?.ladder ?? null);
      const hasEoy =
        eoyPrices && typeof eoyPrices === "object"
          ? Object.keys(eoyPrices as Record<string, unknown>).length > 0
          : false;
      const hasLadder = ladder != null;
      if (!hasEoy && !hasLadder) {
        if (old) deletes.push(ticker);
        continue;
      }
      upserts.push({
        ticker,
        eoy_prices: eoyPrices as Json,
        ladder: ladder as Json,
        updated_at: now,
      });
    }

    if (upserts.length > 0) {
      await supabase
        .from(PORTFELL_TABLES.houseForecast)
        .upsert(upserts, { onConflict: "ticker" });
    }
    if (deletes.length > 0) {
      await supabase.from(PORTFELL_TABLES.houseForecast).delete().in("ticker", deletes);
    }
  } catch {
    // The reader's own save already went through; the site default
    // catching up is best-effort and must never fail their request.
  }
}
