import { dbError } from "@/lib/db-error";
import { NextRequest, NextResponse } from "next/server";
import { loadPortfolioWriteContext } from "@/lib/portfolio-write-context";
import {
  applyTradeCashDelta,
  importCashDelta,
  salePriceFor,
} from "@/lib/cash-trade";
import { classifyImportWrite } from "@/lib/classroom";
import { callPctForTicker, isCoinSymbol } from "@/lib/coins";
import { isSafeCallPct, isSafePositiveMoney, isSafeShares, isSafeSignedMoney } from "@/lib/input-guard";
import { roundMoney, roundShares } from "@/lib/money";
import { denyClassroomWrite } from "@/lib/classroom-guard";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import {
  isPlausibleTicker,
  normalizeYahooTicker,
  resolveImportTicker,
} from "@/lib/ticker";
import { isRecord, readFiniteNumber, readString } from "@/lib/unknown";
import { observeRoute } from "@/lib/observe-route";
import { holdingsImportSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";

type ImportRow = {
  ticker: string;
  shares: number;
  buy_price: number;
  target_call_pct?: number;
  isin?: string;
};

/**
 * The guards are the single-holding route's, so a figure the form would
 * refuse cannot arrive through a CSV instead. The raw value is judged as
 * well as the rounded one because `roundShares` and `roundMoney` clamp at
 * the ceiling rather than refusing: 1e300 shares would otherwise round to
 * the largest legal count and pass, and a trillion shares of anything is a
 * portfolio value nobody typed. The sentence names the row the way the
 * reader counts them, from one, and says the whole import was refused.
 */
function importRowFault(
  index: number,
  ticker: string,
  shares: number,
  buyPrice: number,
  isin: string | undefined,
  callPct: number | undefined
): string | null {
  const label = `Row ${index + 1} (${ticker.trim().toUpperCase()})`;
  if (!isSafeShares(shares) || !isSafeShares(roundShares(shares))) {
    const resolved = resolveImportTicker(ticker, isin) || ticker;
    const what = isCoinSymbol(resolved) ? "how many" : "shares";
    return `${label}: ${what} must be a positive number the app can hold, so nothing was imported.`;
  }
  if (
    !isSafePositiveMoney(buyPrice) ||
    !isSafePositiveMoney(roundMoney(buyPrice))
  ) {
    return `${label}: buy price must be a positive number the app can hold, so nothing was imported.`;
  }
  /*
    The same bound POST and PATCH apply, and this path had none.

    A Call % of 500, or of -30, landed cleanly in a numeric(8,4) column and
    from there into the strike arithmetic, the covered-call table and the
    model's own context. Three write paths for one column drift exactly this
    way, so the check is the shared predicate rather than a second copy of
    the rule, and it refuses the row the way an impossible share count does.
  */
  if (callPct !== undefined && !isSafeCallPct(callPct)) {
    return `${label}: Call % must be between 0 and 100, so nothing was imported.`;
  }
  return null;
}

/**
 * Atomic-ish sheet import: set cash (optional) + upsert all equity rows.
 * Optional replace removes holdings not present in the payload.
 */
async function handlePOST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured, use local demo store" },
      { status: 400 }
    );
  }

  const parsed = await parseJsonBody(req, holdingsImportSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const portfolioId = body.portfolio_id;
  if (!portfolioId) {
    return NextResponse.json({ error: "portfolio_id required" }, { status: 400 });
  }

  // Ownership, whether this portfolio keeps a cash ledger, and its balance,
  // in the one read that used to answer only the first of the three.
  const loaded = await loadPortfolioWriteContext(
    supabase,
    auth.user.id,
    portfolioId
  );
  if (!loaded.ok) {
    return NextResponse.json(
      { error: loaded.error },
      { status: loaded.status }
    );
  }
  const context = loaded.context;

  // Every row is checked before anything is written, because a half-applied
  // import is worse than none: a reader whose third row was refused would
  // have two names landed, the rest missing, and nothing on screen saying
  // which. The values stored on the row are the rounded ones, so the writes
  // below carry exactly what the single-holding route would have stored.
  const rows: ImportRow[] = [];
  const holdings = Array.isArray(body.holdings) ? body.holdings : [];
  for (const [index, row] of holdings.entries()) {
    if (!isRecord(row)) continue;
    const ticker = readString(row.ticker) ?? "";
    const shares = readFiniteNumber(row.shares);
    const buy = readFiniteNumber(row.buy_price);
    if (!ticker || shares == null || buy == null) continue;
    const isin = readString(row.isin);
    const callPct = readFiniteNumber(row.target_call_pct);
    const fault = importRowFault(index, ticker, shares, buy, isin, callPct);
    if (fault) return NextResponse.json({ error: fault }, { status: 400 });
    rows.push({
      ticker,
      shares: roundShares(shares),
      buy_price: roundMoney(buy),
      target_call_pct: callPct,
      isin,
    });
  }
  const cash =
    body.cash === null ? null : readFiniteNumber(body.cash) ?? null;
  if (rows.length === 0 && cash == null) {
    return NextResponse.json(
      { error: "cash or holdings required" },
      { status: 400 }
    );
  }
  // A cash figure past the ceiling used to be dropped on the floor while the
  // holdings landed, and the response said so only in a field no import
  // screen reads. Saying no out loud is the only honest answer.
  if (cash != null && !isSafeSignedMoney(cash)) {
    return NextResponse.json(
      {
        error:
          "That cash figure is bigger than the app can hold, so nothing was imported.",
      },
      { status: 400 }
    );
  }

  const { data: existing, error: exErr } = await supabase
    .from(PORTFELL_TABLES.holdings)
    .select("id, ticker, shares, buy_price, sort_order")
    .eq("portfolio_id", portfolioId);
  if (exErr) {
    return NextResponse.json({ error: dbError(exErr, "/api/holdings/import") }, { status: 500 });
  }

  const replacing = body.replace !== false && rows.length > 0;
  const blocked = await denyClassroomWrite(supabase, {
    portfolioId,
    userId: auth.user.id,
    classroomCommunityId: context.classroomCommunityId,
    action: classifyImportWrite({
      cash: cash != null,
      replace: replacing,
      rows: rows.map((row) => ({
        ticker:
          resolveImportTicker(String(row.ticker ?? ""), row.isin) ||
          normalizeYahooTicker(String(row.ticker ?? "")),
        shares: Number(row.shares),
      })),
      existing: (existing ?? []).flatMap((h) => {
        if (!isRecord(h)) return [];
        const ticker = readString(h.ticker);
        const shares = readFiniteNumber(h.shares);
        if (!ticker || shares == null) return [];
        return [{ ticker, shares }];
      }),
    }),
  });
  if (blocked) return blocked;

  const paperCash = context.tracksTradeCash;
  let cashUpdated = false;
  let writtenCash: number | null = null;
  // An imported cash line may be negative on any portfolio: a broker screen
  // showing borrowed money is exactly the case worth carrying through.
  // The write hands the stored balance back, so the response does not have
  // to select the same row again to say what it just put there.
  if (cash != null && isSafeSignedMoney(cash)) {
    const { data: written, error } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .update({
        cash_balance: roundMoney(cash),
        updated_at: new Date().toISOString(),
      })
      .eq("id", portfolioId)
      .select("cash_balance")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: dbError(error, "/api/holdings/import") }, { status: 500 });
    }
    const stored = Number(
      (written as { cash_balance?: number } | null)?.cash_balance
    );
    writtenCash = Number.isFinite(stored) ? stored : roundMoney(cash);
    cashUpdated = true;
  }

  const byTicker = new Map(
    (existing ?? []).map((h) => [String(h.ticker).toUpperCase(), h])
  );
  let sortBase = (existing ?? []).length;
  let upserted = 0;
  const failed: string[] = [];
  const keep = new Set<string>();

  // One row -> one write, but they don't depend on each other, so they go
  // out together instead of one-at-a-time: a 30-line brokerage CSV used to
  // mean 30 serial round trips before the import could finish. The
  // sort_order counter and `keep`/`failed` accumulation stay correct
  // because each callback's synchronous prefix (ticker/shares validation,
  // the sortBase bump, the byTicker lookup) runs to completion before the
  // next row's callback starts — .map() only interleaves at the `await`.
  await Promise.all(
    rows.map(async (row) => {
      const ticker = resolveImportTicker(
        String(row.ticker ?? ""),
        row.isin
      ) || normalizeYahooTicker(String(row.ticker ?? ""));
      if (!ticker) return;
      /*
        The one write path that stored whatever text arrived.

        POST and PATCH both check the shape; this did not, and
        `resolveImportTicker` and `normalizeYahooTicker` only uppercase and
        strip spaces, so a broker's export with a note in the symbol column,
        or a hand-made CSV, put that string in `portfell_holdings.ticker`,
        which has no constraint on it. From there it is the primary key of
        the quote cache, a name the provider walk asks about on every poll
        (the most expensive thing that layer can be handed, since nothing
        resolves it), a line in the Pulse and forecast prompts, and a row in
        the Sunday letter. It used to be a crash as well, in a regular
        expression built from the stored symbol, which took the Pulse room
        down for every co-owner; that regular expression is gone, and the
        rest of the list is reason enough on its own.

        The row is reported as failed rather than refusing the import, which
        is what the rest of this route does with a row it cannot use: one
        odd line in a hundred should not cost somebody the other ninety-nine.
      */
      if (!isPlausibleTicker(ticker.toUpperCase())) {
        failed.push(ticker.slice(0, 24));
        return;
      }
      // Already rounded and bounded above; a row failing either check
      // refused the whole import before this point.
      const shares = row.shares;
      const buyPrice = row.buy_price;
      const callPct = callPctForTicker(ticker, row.target_call_pct);

      keep.add(ticker.toUpperCase());
      const prev = byTicker.get(ticker.toUpperCase());
      if (prev) {
        const { error } = await supabase
          .from(PORTFELL_TABLES.holdings)
          .update({
            ticker,
            shares,
            buy_price: buyPrice,
            target_call_pct: callPct,
            updated_at: new Date().toISOString(),
          })
          .eq("id", prev.id);
        if (error) failed.push(ticker);
        else upserted += 1;
      } else {
        sortBase += 1;
        const rowSortOrder = sortBase;
        const { data, error } = await supabase
          .from(PORTFELL_TABLES.holdings)
          .upsert(
            {
              portfolio_id: portfolioId,
              ticker,
              shares,
              buy_price: buyPrice,
              target_call_pct: callPct,
              sort_order: rowSortOrder,
            },
            { onConflict: "portfolio_id,ticker" }
          )
          .select("id, ticker, sort_order")
          .single();
        if (error) failed.push(ticker);
        else {
          upserted += 1;
          if (data) {
            byTicker.set(String(data.ticker).toUpperCase(), {
              id: data.id,
              ticker: data.ticker,
              shares,
              buy_price: buyPrice,
              sort_order: data.sort_order,
            });
          }
        }
      }
    })
  );

  let removed = 0;
  if (body.replace !== false && rows.length > 0) {
    const toRemove = (existing ?? []).filter(
      (h) => !keep.has(String(h.ticker).toUpperCase())
    );
    if (toRemove.length > 0) {
      const { error } = await supabase
        .from(PORTFELL_TABLES.holdings)
        .delete()
        .in(
          "id",
          toRemove.map((h) => h.id)
        );
      removed = error ? 0 : toRemove.length;
    }
  }

  let cashBalance: number | null = null;
  if (cashUpdated) {
    cashBalance = writtenCash;
  } else {
    const accepted = rows
      .map((row) => {
        const ticker =
          resolveImportTicker(String(row.ticker ?? ""), row.isin) ||
          normalizeYahooTicker(String(row.ticker ?? ""));
        if (!ticker) return null;
        return { ticker, shares: row.shares, buy_price: row.buy_price };
      })
      .filter((row): row is { ticker: string; shares: number; buy_price: number } =>
        Boolean(row)
      );
    const existingRows = ((existing ?? []) as {
      ticker: string;
      shares: number;
      buy_price: number;
    }[]).map((h) => ({
      ticker: String(h.ticker),
      shares: Number(h.shares),
      buy_price: Number(h.buy_price),
    }));
    const saleTickers = new Set<string>();
    for (const old of existingRows) {
      const key = old.ticker.toUpperCase();
      const nxt = accepted.find((r) => r.ticker.toUpperCase() === key);
      if (!nxt) {
        if (replacing) saleTickers.add(old.ticker);
      } else if (nxt.shares < old.shares) {
        saleTickers.add(old.ticker);
      }
    }
    // One live price per name sold, and each one is a walk of the quote
    // providers. They feed importCashDelta and nothing else, and that only
    // runs on a classroom paper sheet, so an ordinary portfolio replacing a
    // thirty line CSV used to pay for thirty walks and discard the answers.
    if (paperCash) {
      const salePx: Record<string, number> = {};
      await Promise.all(
        [...saleTickers].map(async (ticker) => {
          const old = existingRows.find(
            (h) => h.ticker.toUpperCase() === ticker.toUpperCase()
          );
          salePx[ticker.toUpperCase()] = await salePriceFor(
            ticker,
            old?.buy_price ?? 0
          );
        })
      );
      const delta = importCashDelta(
        existingRows,
        accepted,
        replacing,
        salePx
      );
      cashBalance = await applyTradeCashDelta(
        supabase,
        portfolioId,
        delta,
        context
      );
      cashUpdated = delta !== 0;
    } else {
      cashBalance = context.cashBalance;
    }
  }

  return NextResponse.json({
    ok: failed.length === 0,
    cashUpdated,
    cash_balance: cashBalance,
    upserted,
    removed,
    failed,
    total: rows.length,
  });
}

export const POST = observeRoute(handlePOST, '/api/holdings/import');
