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
import type {
  PortfolioEoyOverrides,
  PortfolioEoySources,
} from "@/lib/forecast-overrides";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import type { Json } from "@/lib/supabase/database.types";

export async function mirrorHouseForecast(input: {
  email: string | null | undefined;
  /** `undefined` means this save did not touch this field at all. */
  eoyOverrides?: PortfolioEoyOverrides;
  /**
   * Which of those the house account typed and which its own forecast
   * run wrote. Published beside the prices because this table is the
   * site's default for everybody else, and a figure a model wrote,
   * presented to a stranger as one this app's account chose, is the
   * exact claim `20260915180000_a_figure_says_who_wrote_it.sql` exists
   * to end. A missing entry is described as saved earlier, never as
   * either.
   */
  eoySources?: PortfolioEoySources;
  ladders?: LadderOverrides;
}): Promise<void> {
  if (!isSuperadminEmail(input.email)) return;
  if (input.eoyOverrides === undefined && input.ladders === undefined) return;
  if (!supabaseUsesServiceRole()) return;

  try {
    const supabase = getSupabaseServer();
    if (!supabase) return;
    /*
      The same deploy-ordering guard the published route carries: a
      select naming a column whose migration has not landed is refused
      whole, and here that would silently stop the house account's own
      plan being mirrored at all. See that route for the argument.
    */
    let sourcesColumn = true;
    let existingRead = await supabase
      .from(PORTFELL_TABLES.houseForecast)
      .select("ticker, eoy_prices, eoy_sources, ladder");
    const missingSources =
      (existingRead.error?.code === "PGRST204" ||
        existingRead.error?.code === "42703") &&
      /eoy_sources/i.test(existingRead.error?.message ?? "");
    if (missingSources) {
      sourcesColumn = false;
      existingRead = await supabase
        .from(PORTFELL_TABLES.houseForecast)
        .select("ticker, eoy_prices, ladder");
    }
    const existing = existingRead.data;

    type Row = {
      ticker: string;
      eoy_prices: unknown;
      eoy_sources: unknown;
      ladder: unknown;
    };
    const prior = new Map<
      string,
      { eoy_prices: unknown; eoy_sources: unknown; ladder: unknown }
    >();
    for (const row of (existing ?? []) as unknown as Row[]) {
      prior.set(row.ticker, {
        eoy_prices: row.eoy_prices,
        eoy_sources: row.eoy_sources,
        ladder: row.ladder,
      });
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
      eoy_sources?: Json;
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
      /*
        The sources move with the prices they describe, never on their
        own: a save that replaced the figures and kept the old words
        beside them would say a model wrote a price the account has since
        typed over, which is the same false sentence in a new place.
      */
      const eoySources =
        input.eoyOverrides !== undefined
          ? (input.eoySources?.[ticker] ?? {})
          : (old?.eoy_sources ?? {});
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
        // Left out entirely where the column is not there yet, so the
        // write lands rather than being refused for one word.
        ...(sourcesColumn ? { eoy_sources: eoySources as Json } : {}),
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
