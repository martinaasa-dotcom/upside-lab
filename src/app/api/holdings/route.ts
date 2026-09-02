import { dbError } from "@/lib/db-error";
import {
  loadPortfolioWriteContext,
  type PortfolioWriteContext,
} from "@/lib/portfolio-write-context";
import {
  applyTradeCashDelta,
  salePriceFor,
  tradeCashDelta,
} from "@/lib/cash-trade";
import { holdingWriteActions } from "@/lib/classroom";
import { denyClassroomWrite } from "@/lib/classroom-guard";
import { logError } from "@/lib/error-log";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { callPctForTicker, isCoinSymbol, matchCoinQuery } from "@/lib/coins";
import { isSafePositiveMoney, isSafeShares } from "@/lib/input-guard";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { HOLDING_COLUMNS, PORTFELL_TABLES } from "@/lib/supabase/tables";
import { isPlausibleTicker, normalizeYahooTicker } from "@/lib/ticker";
import { roundMoney, roundShares } from "@/lib/money";
import { logEvent } from "@/lib/telemetry";
import { isRecord, readFiniteNumber, readString } from "@/lib/unknown";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { holdingPatchSchema, holdingPostSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";

const HOLDING_WRITE_ATTEMPTS = 3;
const UNIQUE_VIOLATION = "23505";

type HoldingRow = {
  portfolio_id: string;
  shares: number;
  ticker: string;
  buy_price: number;
};

function parseHoldingRow(value: unknown): HoldingRow | null {
  if (!isRecord(value)) return null;
  const portfolioId = readString(value.portfolio_id);
  const ticker = readString(value.ticker);
  const shares = readFiniteNumber(value.shares);
  const buyPrice = readFiniteNumber(value.buy_price);
  if (!portfolioId || !ticker || shares == null || buyPrice == null) return null;
  return {
    portfolio_id: portfolioId,
    ticker,
    shares,
    buy_price: buyPrice,
  };
}

function parseShareCost(value: unknown): { shares: number; buy_price: number } | null {
  if (!isRecord(value)) return null;
  const shares = readFiniteNumber(value.shares);
  const buyPrice = readFiniteNumber(value.buy_price);
  if (shares == null || buyPrice == null) return null;
  return { shares, buy_price: buyPrice };
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === UNIQUE_VIOLATION;
}

function conflictResponse() {
  return NextResponse.json(
    { error: "That holding changed under you. Try again." },
    { status: 409 }
  );
}

function logHoldingRetry(fields: {
  method: string;
  attempt: number;
  reason: "unique_violation" | "cas_miss";
  portfolioId: string;
  ticker?: string;
  holdingId?: string;
}) {
  logEvent("holding_cas_retry", fields, "warn");
}

function logHoldingWriteFailed(fields: {
  method: string;
  event: "holding_write_failed" | "holding_cas_exhausted";
  portfolioId?: string;
  ticker?: string;
  holdingId?: string;
  attempts?: number;
  message?: string;
  code?: string | null;
}) {
  const { event, ...rest } = fields;
  void logError({
    source: "server",
    event,
    message:
      event === "holding_cas_exhausted"
        ? `holdings ${fields.method} compare-and-swap exhausted`
        : `holdings ${fields.method} failed: ${fields.message ?? "unknown"}`,
    path: "/api/holdings",
    context: { event, ...rest },
  });
}

/**
 * Load the holding a write is aimed at, or the response explaining why not.
 *
 * Authorization for a row-level write has to come from the stored row, never
 * from the request body. This used to read the row and then fall back to
 * `body.portfolio_id` when the read came back empty, while the read's error
 * was discarded — so a failed lookup (timeout, transient error) turned into
 * "authorize against whatever portfolio the caller named". Since
 * getSupabaseDataClient() is the service-role client in production, RLS is
 * not there to catch it: these checks are the only thing standing between a
 * caller and another tenant's row.
 *
 * Fails closed on every path: a lookup error is a 503, a missing row is a
 * 404, and the portfolio id used for the ownership check is always the one
 * persisted on the row.
 */
async function loadWritableHolding(
  supabase: SupabaseClient,
  userId: string,
  holdingId: string
): Promise<
  | { row: HoldingRow; portfolioId: string; context: PortfolioWriteContext }
  | { error: NextResponse }
> {
  const { data, error } = await supabase
    .from(PORTFELL_TABLES.holdings)
    .select("portfolio_id, shares, ticker, buy_price")
    .eq("id", holdingId)
    .maybeSingle();

  if (error) {
    return {
      error: NextResponse.json(
        { error: "Couldn't check that holding. Try again." },
        { status: 503 }
      ),
    };
  }
  const row = parseHoldingRow(data);
  if (!row) {
    return {
      error: NextResponse.json({ error: "Holding not found" }, { status: 404 }),
    };
  }

  const ctx = await loadPortfolioWriteContext(supabase, userId, row.portfolio_id);
  if (!ctx.ok) {
    return {
      error: NextResponse.json({ error: ctx.error }, { status: ctx.status }),
    };
  }

  return { row, portfolioId: row.portfolio_id, context: ctx.context };
}

async function handlePOST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const parsedBody = await parseJsonBody(req, holdingPostSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;
  const portfolioId = body.portfolio_id;
  const ticker =
    matchCoinQuery(body.ticker)?.symbol ?? normalizeYahooTicker(body.ticker);
  if (!portfolioId || !ticker) {
    return NextResponse.json(
      { error: "portfolio_id and ticker required" },
      { status: 400 }
    );
  }

  if (!isPlausibleTicker(ticker)) {
    return NextResponse.json(
      { error: "That ticker doesn't look like a real symbol." },
      { status: 400 }
    );
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured, use local demo store" },
      { status: 400 }
    );
  }

  const shares = roundShares(Number(body.shares));
  const buyPrice = roundMoney(Number(body.buy_price));
  if (!isSafeShares(shares)) {
    return NextResponse.json(
      {
        error: isCoinSymbol(ticker)
          ? "How many must be a positive number"
          : "Shares must be a positive number",
      },
      { status: 400 }
    );
  }
  if (!isSafePositiveMoney(buyPrice)) {
    return NextResponse.json({ error: "Buy price must be a positive number" }, { status: 400 });
  }

  const row = {
    portfolio_id: portfolioId,
    ticker,
    shares,
    buy_price: buyPrice,
    eoy_target: body.eoy_target != null ? Number(body.eoy_target) : null,
    target_call_pct: callPctForTicker(ticker, body.target_call_pct),
    stock_target_override:
      body.stock_target_override != null
        ? Number(body.stock_target_override)
        : null,
    sort_order: Number(body.sort_order ?? 99),
    updated_at: new Date().toISOString(),
  };

  // May this caller write here, is this a classroom sheet, and what is the
  // balance: one read of the portfolio row with the owners table joined and
  // filtered on the caller. Three separate selects used to answer those, two
  // of them after the write had already landed. It sits after the range
  // checks because a request the app is going to refuse should not cost a
  // query at all.
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

  for (let attempt = 0; attempt < HOLDING_WRITE_ATTEMPTS; attempt++) {
    const { data: existingRaw, error: existingErr } = await supabase
      .from(PORTFELL_TABLES.holdings)
      .select("shares, buy_price")
      .eq("portfolio_id", portfolioId)
      .eq("ticker", ticker)
      .maybeSingle();
    if (existingErr) {
      logHoldingWriteFailed({
        method: "POST",
        event: "holding_write_failed",
        portfolioId,
        ticker,
        message: existingErr.message,
        code: existingErr.code ?? null,
      });
      return NextResponse.json(
        { error: "Couldn't check that holding. Try again." },
        { status: 503 }
      );
    }
    const existingRow = parseShareCost(existingRaw);

    const blocked = await denyClassroomWrite(supabase, {
      portfolioId,
      userId: auth.user.id,
      classroomCommunityId: context.classroomCommunityId,
      action: holdingWriteActions({
        isNew: !existingRow,
        isDelete: false,
        existingShares: existingRow ? existingRow.shares : 0,
        nextShares: shares,
      }),
    });
    if (blocked) return blocked;

    if (!existingRow) {
      const { data, error } = await supabase
        .from(PORTFELL_TABLES.holdings)
        .insert(row)
        .select(HOLDING_COLUMNS)
        .single();
      if (error) {
        if (isUniqueViolation(error)) {
          logHoldingRetry({
            method: "POST",
            attempt: attempt + 1,
            reason: "unique_violation",
            portfolioId,
            ticker,
          });
          continue;
        }
        logHoldingWriteFailed({
          method: "POST",
          event: "holding_write_failed",
          portfolioId,
          ticker,
          message: error.message,
          code: error.code ?? null,
        });
        return NextResponse.json({ error: dbError(error, "/api/holdings") }, { status: 500 });
      }
      // A buy is arithmetic and costs nothing to work out, so it is handed
      // over whether or not it will be spent. Selling is the expensive one.
      const cash = await applyTradeCashDelta(
        supabase,
        portfolioId,
        tradeCashDelta({ buyShares: shares, buyPrice }),
        context
      );
      return NextResponse.json({ holding: data, cash_balance: cash });
    }

    const { data, error } = await supabase
      .from(PORTFELL_TABLES.holdings)
      .update(row)
      .eq("portfolio_id", portfolioId)
      .eq("ticker", ticker)
      .eq("shares", existingRow.shares)
      .select(HOLDING_COLUMNS)
      .maybeSingle();
    if (error) {
      logHoldingWriteFailed({
        method: "POST",
        event: "holding_write_failed",
        portfolioId,
        ticker,
        message: error.message,
        code: error.code ?? null,
      });
      return NextResponse.json({ error: dbError(error, "/api/holdings") }, { status: 500 });
    }
    if (!data) {
      logHoldingRetry({
        method: "POST",
        attempt: attempt + 1,
        reason: "cas_miss",
        portfolioId,
        ticker,
      });
      continue;
    }

    const prevShares = existingRow.shares;
    const prevBuy = existingRow.buy_price;
    // Only a classroom paper sheet moves cash on a trade, so on every other
    // portfolio this arithmetic is worked out and thrown away. Selling asks
    // salePriceFor for a live price, which is a walk of the quote providers
    // and the slowest thing in the request, so the ledger question is asked
    // first and the walk does not happen at all.
    let delta = 0;
    if (context.tracksTradeCash) {
      if (shares > prevShares) {
        delta = tradeCashDelta({
          buyShares: shares - prevShares,
          buyPrice,
        });
      } else if (shares < prevShares) {
        const px = await salePriceFor(ticker, prevBuy || buyPrice);
        delta = tradeCashDelta({
          sellShares: prevShares - shares,
          sellPrice: px,
        });
      }
    }
    const cash = await applyTradeCashDelta(
      supabase,
      portfolioId,
      delta,
      context
    );
    return NextResponse.json({ holding: data, cash_balance: cash });
  }

  logHoldingWriteFailed({
    method: "POST",
    event: "holding_cas_exhausted",
    portfolioId,
    ticker,
    attempts: HOLDING_WRITE_ATTEMPTS,
  });
  return conflictResponse();
}

async function handlePATCH(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const parsedBody = await parseJsonBody(req, holdingPatchSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;
  const id = body.id;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured, use local demo store" },
      { status: 400 }
    );
  }

  const patch: TablesUpdate<"portfell_holdings"> = {
    updated_at: new Date().toISOString(),
  };
  if (body.ticker !== undefined) {
    const t = normalizeYahooTicker(String(body.ticker));
    if (!isPlausibleTicker(t)) {
      return NextResponse.json(
        { error: "That ticker doesn't look like a real symbol." },
        { status: 400 }
      );
    }
    patch.ticker = t;
  }
  if (body.eoy_target === null) patch.eoy_target = null;
  if (body.stock_target_override === null) patch.stock_target_override = null;
  if (body.shares !== undefined) {
    const n = roundShares(Number(body.shares));
    if (!isSafeShares(n)) {
      return NextResponse.json(
        { error: "Shares must be a positive number" },
        { status: 400 }
      );
    }
    patch.shares = n;
  }
  if (body.buy_price !== undefined) {
    const n = roundMoney(Number(body.buy_price));
    if (!isSafePositiveMoney(n)) {
      return NextResponse.json(
        { error: "Buy price must be a positive number" },
        { status: 400 }
      );
    }
    patch.buy_price = n;
  }
  if (body.eoy_target !== undefined && body.eoy_target !== null) {
    patch.eoy_target = Number(body.eoy_target);
  }
  if (
    body.stock_target_override !== undefined &&
    body.stock_target_override !== null
  ) {
    patch.stock_target_override = Number(body.stock_target_override);
  }
  if (body.target_call_pct !== undefined) {
    patch.target_call_pct = Number(body.target_call_pct);
  }
  if (body.sort_order !== undefined) {
    patch.sort_order = Number(body.sort_order);
  }

  const casOnShares = body.shares !== undefined;

  for (let attempt = 0; attempt < HOLDING_WRITE_ATTEMPTS; attempt++) {
    const loaded = await loadWritableHolding(supabase, auth.user.id, id);
    if ("error" in loaded) return loaded.error;
    const { row: existing, portfolioId, context } = loaded;

    const prevShares = existing.shares;
    const prevBuy = existing.buy_price;
    const prevTicker = existing.ticker;
    const nextShares =
      body.shares !== undefined ? roundShares(Number(body.shares)) : prevShares;
    const nextBuy =
      body.buy_price !== undefined
        ? roundMoney(Number(body.buy_price))
        : prevBuy;
    const nextTicker =
      body.ticker !== undefined
        ? matchCoinQuery(String(body.ticker))?.symbol ??
          normalizeYahooTicker(String(body.ticker))
        : prevTicker;
    if (isCoinSymbol(nextTicker)) {
      patch.target_call_pct = 0;
    }
    const renamed =
      Boolean(prevTicker) &&
      Boolean(nextTicker) &&
      prevTicker.toUpperCase() !== nextTicker.toUpperCase();

    const blocked = await denyClassroomWrite(supabase, {
      portfolioId,
      userId: auth.user.id,
      classroomCommunityId: context.classroomCommunityId,
      action: holdingWriteActions({
        isNew: false,
        isDelete: false,
        existingShares: prevShares,
        nextShares,
        tickerChanged: renamed,
      }),
    });
    if (blocked) return blocked;

    // Scoped to the portfolio the ownership check just cleared, not only to the
    // row id. Authorization and mutation then describe the same rows, so the
    // window between the two reads can't be used to retarget the write.
    // When shares change, also match the shares we just read so two overlapping
    // edits cannot both compute a cash delta from the same starting count.
    let query = supabase
      .from(PORTFELL_TABLES.holdings)
      .update(patch)
      .eq("id", id)
      .eq("portfolio_id", portfolioId);
    if (casOnShares) query = query.eq("shares", prevShares);
    const { data, error } = await query.select(HOLDING_COLUMNS).maybeSingle();

    if (error) {
      logHoldingWriteFailed({
        method: "PATCH",
        event: "holding_write_failed",
        portfolioId,
        ticker: nextTicker,
        holdingId: id,
        message: error.message,
        code: error.code ?? null,
      });
      return NextResponse.json({ error: dbError(error, "/api/holdings") }, { status: 500 });
    }
    if (!data) {
      if (casOnShares) {
        logHoldingRetry({
          method: "PATCH",
          attempt: attempt + 1,
          reason: "cas_miss",
          portfolioId,
          ticker: nextTicker,
          holdingId: id,
        });
        continue;
      }
      return NextResponse.json({ error: "Holding not found" }, { status: 404 });
    }

    // As in the POST above: the delta is only ever spent on a classroom paper
    // sheet, and two of these three branches pay for a live quote to compute
    // it. On an ordinary portfolio there is nothing to compute.
    let delta = 0;
    if (context.tracksTradeCash) {
      if (renamed) {
        const sellPx = await salePriceFor(prevTicker, prevBuy);
        delta += tradeCashDelta({ sellShares: prevShares, sellPrice: sellPx });
        delta += tradeCashDelta({
          buyShares: nextShares,
          buyPrice: nextBuy || prevBuy,
        });
      } else if (nextShares > prevShares) {
        delta = tradeCashDelta({
          buyShares: nextShares - prevShares,
          buyPrice: nextBuy || prevBuy,
        });
      } else if (nextShares < prevShares) {
        const px = await salePriceFor(prevTicker, prevBuy);
        delta = tradeCashDelta({
          sellShares: prevShares - nextShares,
          sellPrice: px,
        });
      }
    }
    const cash = await applyTradeCashDelta(
      supabase,
      portfolioId,
      delta,
      context
    );
    return NextResponse.json({ holding: data, cash_balance: cash });
  }

  logHoldingWriteFailed({
    method: "PATCH",
    event: "holding_cas_exhausted",
    holdingId: id,
    attempts: HOLDING_WRITE_ATTEMPTS,
  });
  return conflictResponse();
}

async function handleDELETE(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured, use local demo store" },
      { status: 400 }
    );
  }

  const loaded = await loadWritableHolding(supabase, auth.user.id, id);
  if ("error" in loaded) return loaded.error;
  const { row: existing, portfolioId, context } = loaded;

  const blocked = await denyClassroomWrite(supabase, {
    portfolioId,
    userId: auth.user.id,
    classroomCommunityId: context.classroomCommunityId,
    action: "sell",
  });
  if (blocked) return blocked;

  const { data: deletedRaw, error } = await supabase
    .from(PORTFELL_TABLES.holdings)
    .delete()
    .eq("id", id)
    .eq("portfolio_id", portfolioId)
    .select("shares, buy_price, ticker")
    .maybeSingle();
  if (error) {
    logHoldingWriteFailed({
      method: "DELETE",
      event: "holding_write_failed",
      portfolioId,
      ticker: existing.ticker,
      holdingId: id,
      message: error.message,
      code: error.code ?? null,
    });
    return NextResponse.json({ error: dbError(error, "/api/holdings") }, { status: 500 });
  }
  // Only the delete that actually removed the row may move cash. A second
  // overlapping DELETE would otherwise credit the sale twice.
  if (!deletedRaw) {
    logHoldingRetry({
      method: "DELETE",
      attempt: 1,
      reason: "cas_miss",
      portfolioId,
      ticker: existing.ticker,
      holdingId: id,
    });
    const cash = await applyTradeCashDelta(supabase, portfolioId, 0, context);
    return NextResponse.json({ ok: true, cash_balance: cash });
  }
  const deleted = parseHoldingRow({
    ...(isRecord(deletedRaw) ? deletedRaw : {}),
    portfolio_id: portfolioId,
  });
  const shares = deleted?.shares ?? existing.shares;
  const buy = deleted?.buy_price ?? existing.buy_price;
  const ticker = deleted?.ticker ?? existing.ticker;
  // A sale credits cash on a classroom paper sheet and nowhere else, so
  // only a paper sheet pays for the live price the credit is worked out
  // from. Deleting a holding from an ordinary portfolio used to walk the
  // quote providers for a number the next line threw away.
  let delta = 0;
  if (context.tracksTradeCash) {
    const px = ticker ? await salePriceFor(ticker, buy) : buy;
    delta = tradeCashDelta({ sellShares: shares, sellPrice: px });
  }
  const cash = await applyTradeCashDelta(supabase, portfolioId, delta, context);
  return NextResponse.json({ ok: true, cash_balance: cash });
}

export const POST = observeRoute(handlePOST, '/api/holdings');
export const PATCH = observeRoute(handlePATCH, '/api/holdings');
export const DELETE = observeRoute(handleDELETE, '/api/holdings');
