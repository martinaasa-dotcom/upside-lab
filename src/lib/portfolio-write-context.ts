import type { SupabaseClient } from "@supabase/supabase-js";
import { tracksTradeCash } from "@/lib/cash-balance";
import { roundMoney } from "@/lib/money";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

/**
 * The three things every holdings write needs to know about the portfolio it
 * is aimed at, read once.
 *
 * A plain POST used to ask the database six times after auth: an owners row
 * to answer "may this caller write here", a portfolio row to answer "is this
 * a classroom sheet" for the class guard, the existing holding, the write
 * itself, then the same portfolio row twice more on the way out, once for
 * "does this portfolio keep a cash ledger" and once to read back a balance
 * that nothing had moved. Ownership, classroom status and cash all live on
 * rows one request can fetch together, so it does.
 *
 * Ownership is the join, not a second query: `!inner` on the owners table
 * filtered to the caller means a portfolio nobody has joined the caller to
 * simply does not come back. That fails closed the same way the separate
 * owners select did, and a read error is its own answer rather than a
 * silent "no", so a transient failure cannot read as a permission one.
 */
export type PortfolioWriteContext = {
  portfolioId: string;
  classroomCommunityId: string | null;
  /** Only a classroom paper sheet moves cash when a holding is written. */
  tracksTradeCash: boolean;
  cashBalance: number | null;
};

export type PortfolioWriteContextResult =
  | { ok: true; context: PortfolioWriteContext }
  | { ok: false; status: number; error: string };

function readCash(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? roundMoney(n) : null;
}

export async function loadPortfolioWriteContext(
  supabase: SupabaseClient,
  userId: string,
  portfolioId: string | null | undefined
): Promise<PortfolioWriteContextResult> {
  if (!portfolioId) {
    return { ok: false, status: 400, error: "portfolio_id required" };
  }

  const owners = PORTFELL_TABLES.portfolioOwners;
  const { data, error } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select(`id, classroom_community_id, cash_balance, ${owners}!inner(user_id)`)
    .eq("id", portfolioId)
    .eq(`${owners}.user_id`, userId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 503,
      error: "Couldn't check that portfolio. Try again.",
    };
  }
  if (!data) {
    return {
      ok: false,
      status: 403,
      error: "You can only edit portfolios you own",
    };
  }

  const row = data as {
    classroom_community_id?: string | null;
    cash_balance?: unknown;
  };
  return {
    ok: true,
    context: {
      portfolioId,
      classroomCommunityId: row.classroom_community_id ?? null,
      tracksTradeCash: tracksTradeCash(row),
      cashBalance: readCash(row.cash_balance),
    },
  };
}
