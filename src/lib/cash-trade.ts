import type { SupabaseClient } from "@supabase/supabase-js";
import { tracksTradeCash } from "@/lib/cash-balance";
import { logError } from "@/lib/error-log";
import { fetchQuotesWithFallback } from "@/lib/market/quotes";
import { roundMoney } from "@/lib/money";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { currency } from "@/lib/format";

export { importCashDelta, tradeCashDelta } from "@/lib/cash-delta";

export async function salePriceFor(
  ticker: string,
  fallback: number
): Promise<number> {
  const fb = roundMoney(fallback);
  try {
    const { quotes } = await fetchQuotesWithFallback([ticker]);
    const p = quotes[ticker.trim().toUpperCase()]?.price;
    if (typeof p === "number" && p > 0) return roundMoney(p);
  } catch {
    /* use what they paid */
  }
  return fb;
}

async function readCashBalance(
  supabase: SupabaseClient,
  portfolioId: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("cash_balance")
    .eq("id", portfolioId)
    .maybeSingle();
  if (error || !data) return null;
  const n = Number(data.cash_balance);
  return Number.isFinite(n) ? roundMoney(n) : null;
}

export async function portfolioTracksTradeCash(
  supabase: SupabaseClient,
  portfolioId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("classroom_community_id")
    .eq("id", portfolioId)
    .maybeSingle();
  if (error || !data) return false;
  return tracksTradeCash(data as { classroom_community_id?: string | null });
}

/**
 * Buy/sell cash only moves on a classroom paper sheet.
 *
 * `known` is what the caller already read off the portfolio row. Without it
 * this asks twice more on every write to an ordinary portfolio: once whether
 * the portfolio keeps a cash ledger, then once again for a balance that
 * nothing in the request moved, only to echo it back. A caller holding both
 * answers spends neither round trip. On a paper sheet the balance is still
 * read or moved by the database, because there the write really does change
 * it and a stale echo would be a wrong number.
 */
/**
 * The sentence a student reads instead of the database's own error.
 *
 * The floor lives in `portfell_apply_cash_delta` and has to: a check in Node
 * is a read and then an act, and two overlapping buys both read the same
 * balance and both pass. What this adds is the wording, said before anything
 * is written, because "not enough cash in this class portfolio" raised out
 * of a Postgres function is not a thing to show a fourteen-year-old.
 *
 * `cost` is what the trade takes OUT, so a sale or a reduction passes it a
 * number at or below zero and is never refused. Charging the whole position
 * rather than the increment is the mistake this exists to prevent: a student
 * who has spent most of their cash could not sell half a holding, because
 * the modal saves the new total and the guard read that total as a purchase.
 */
export function classCashRefusal(
  known: { tracksTradeCash: boolean; cashBalance: number | null },
  cost: number
): string | null {
  if (!known.tracksTradeCash) return null;
  if (known.cashBalance == null) return null;
  if (!(cost > known.cashBalance)) return null;
  return `That costs ${currency(cost)} and you have ${currency(known.cashBalance)} to spend. Try fewer shares.`;
}

export async function applyTradeCashDelta(
  supabase: SupabaseClient,
  portfolioId: string,
  delta: number,
  known?: { tracksTradeCash: boolean; cashBalance: number | null }
): Promise<number | null> {
  const tracks = known
    ? known.tracksTradeCash
    : await portfolioTracksTradeCash(supabase, portfolioId);
  if (!tracks) {
    return known ? known.cashBalance : readCashBalance(supabase, portfolioId);
  }
  return applyPortfolioCashDelta(supabase, portfolioId, delta);
}

/**
 * Move a sheet's cash by `delta` and return the new balance.
 *
 * The arithmetic happens inside Postgres (see migration 041). It used to be a
 * SELECT, add in Node, then UPDATE the absolute result, which loses one of two
 * concurrent deltas: both callers read the same starting balance and the
 * second UPDATE overwrites the first. Co-owned sheets, batch imports and
 * client retries all produce that overlap in normal use, and the symptom is a
 * cash balance quietly missing one trade.
 *
 * Callers must have already established co-ownership. The RPC also checks
 * co-ownership itself when the caller has a user JWT, so a stray PostgREST
 * call cannot move another sheet's cash. service_role skips that check
 * because auth.uid() is null on that connection.
 */
export async function applyPortfolioCashDelta(
  supabase: SupabaseClient,
  portfolioId: string,
  delta: number
): Promise<number | null> {
  if (!Number.isFinite(delta) || delta === 0) {
    return readCashBalance(supabase, portfolioId);
  }

  const { data, error } = await supabase.rpc("portfell_apply_cash_delta", {
    p_portfolio_id: portfolioId,
    p_delta: roundMoney(delta),
  });

  if (error) {
    const code =
      typeof error.code === "string" && error.code ? error.code : null;
    void logError({
      source: "server",
      event: "cash_rpc_failed",
      message: `portfell_apply_cash_delta failed: ${error.message}`,
      path: "rpc:portfell_apply_cash_delta",
      context: {
        rpc: "portfell_apply_cash_delta",
        portfolioId,
        delta: roundMoney(delta),
        code,
      },
    });
    return null;
  }
  const n = Number(data);
  return Number.isFinite(n) ? roundMoney(n) : null;
}
