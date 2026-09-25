import { dbError } from "@/lib/db-error";
import { loadPortfolioWriteContext } from "@/lib/portfolio-write-context";
import {
  MAX_TRACKED_CALLS,
  validateCallDraft,
  type TrackedCall,
} from "@/lib/options/tracked-calls";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { COVERED_CALL_COLUMNS, PORTFELL_TABLES } from "@/lib/supabase/tables";
import { isRecord, readString } from "@/lib/unknown";
import { observeRoute } from "@/lib/observe-route";
import { listOwnedPortfolioIds } from "@/lib/auth/ownership";
import { coveredCallBodySchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/*
  The covered calls a portfolio has sold or plans to sell.

  Every write is authorized against the portfolio stored on the row, never
  against one the request names, for the reason `/api/holdings` gives: this
  runs on the service role in production, so these checks are the only
  thing between a caller and somebody else's row.
*/

function notConfigured() {
  return NextResponse.json(
    { error: "Supabase not configured, use local demo store" },
    { status: 400 }
  );
}

function rowToCall(row: Record<string, unknown>): TrackedCall {
  return {
    id: String(row.id),
    portfolio_id: String(row.portfolio_id),
    ticker: String(row.ticker),
    status: row.status === "planned" ? "planned" : "sold",
    strike: Number(row.strike),
    expiry: String(row.expiry).slice(0, 10),
    contracts: Number(row.contracts),
    premium: row.premium == null ? null : Number(row.premium),
    opened_on: row.opened_on == null ? null : String(row.opened_on).slice(0, 10),
    created_at: row.created_at == null ? null : String(row.created_at),
    updated_at: row.updated_at == null ? null : String(row.updated_at),
  };
}

async function loadOwnedCall(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<{ portfolioId: string } | { error: NextResponse }> {
  const { data, error } = await supabase
    .from(PORTFELL_TABLES.coveredCalls)
    .select("portfolio_id")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return {
      error: NextResponse.json(
        { error: "Couldn't check that call. Try again." },
        { status: 503 }
      ),
    };
  }
  const portfolioId = isRecord(data) ? readString(data.portfolio_id) : null;
  if (!portfolioId) {
    return { error: NextResponse.json({ error: "Call not found" }, { status: 404 }) };
  }
  const ctx = await loadPortfolioWriteContext(supabase, userId, portfolioId);
  if (!ctx.ok) {
    return { error: NextResponse.json({ error: ctx.error }, { status: ctx.status }) };
  }
  return { portfolioId };
}

async function handleGET(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;
  const supabase = await getSupabaseDataClient();
  if (!supabase) return notConfigured();

  /*
    With a portfolio named, that portfolio's calls. With none, every call on
    every portfolio the caller co-owns, which is what Home's alerts read: a
    call past its roll level matters whichever portfolio happens to be open.
    The ids come from the caller's own ownership rows, never the request.
  */
  const portfolioId = req.nextUrl.searchParams.get("portfolio_id");
  let ids: string[];
  if (portfolioId) {
    const ctx = await loadPortfolioWriteContext(supabase, auth.user.id, portfolioId);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    ids = [ctx.context.portfolioId];
  } else {
    ids = await listOwnedPortfolioIds(auth.user.id);
    if (ids.length === 0) return NextResponse.json({ calls: [] });
  }

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.coveredCalls)
    .select(COVERED_CALL_COLUMNS)
    .in("portfolio_id", ids)
    .order("expiry", { ascending: true })
    .limit(MAX_TRACKED_CALLS * ids.length);
  if (error) {
    return NextResponse.json(
      { error: dbError(error, "GET /api/covered-calls: read calls") },
      { status: 500 }
    );
  }
  const calls = (data ?? []).filter(isRecord).map(rowToCall);
  return NextResponse.json({ calls });
}

async function handlePOST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;
  const supabase = await getSupabaseDataClient();
  if (!supabase) return notConfigured();

  const parsed = await parseJsonBody(req, coveredCallBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const ctx = await loadPortfolioWriteContext(
    supabase,
    auth.user.id,
    readString(body.portfolio_id)
  );
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const verdict = validateCallDraft(body);
  if (!verdict.ok) return NextResponse.json({ error: verdict.error }, { status: 400 });

  const { count, error: countError } = await supabase
    .from(PORTFELL_TABLES.coveredCalls)
    .select("id", { count: "exact", head: true })
    .eq("portfolio_id", ctx.context.portfolioId);
  if (countError) {
    return NextResponse.json(
      { error: dbError(countError, "POST /api/covered-calls: count calls") },
      { status: 500 }
    );
  }
  if ((count ?? 0) >= MAX_TRACKED_CALLS) {
    return NextResponse.json(
      { error: `A portfolio can track up to ${MAX_TRACKED_CALLS} calls. Remove an old one first.` },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.coveredCalls)
    .insert({ ...verdict.draft, portfolio_id: ctx.context.portfolioId })
    .select(COVERED_CALL_COLUMNS)
    .single();
  if (error || !isRecord(data)) {
    return NextResponse.json(
      { error: dbError(error, "POST /api/covered-calls: insert call") },
      { status: 500 }
    );
  }
  return NextResponse.json({ call: rowToCall(data) });
}

async function handlePATCH(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;
  const supabase = await getSupabaseDataClient();
  if (!supabase) return notConfigured();

  const parsed = await parseJsonBody(req, coveredCallBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const id = readString(body.id);
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const owned = await loadOwnedCall(supabase, auth.user.id, id);
  if ("error" in owned) return owned.error;

  const verdict = validateCallDraft(body);
  if (!verdict.ok) return NextResponse.json({ error: verdict.error }, { status: 400 });

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.coveredCalls)
    .update({ ...verdict.draft, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("portfolio_id", owned.portfolioId)
    .select(COVERED_CALL_COLUMNS)
    .single();
  if (error || !isRecord(data)) {
    return NextResponse.json(
      { error: dbError(error, "PATCH /api/covered-calls: update call") },
      { status: 500 }
    );
  }
  return NextResponse.json({ call: rowToCall(data) });
}

async function handleDELETE(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;
  const supabase = await getSupabaseDataClient();
  if (!supabase) return notConfigured();

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const owned = await loadOwnedCall(supabase, auth.user.id, id);
  if ("error" in owned) return owned.error;

  const { error } = await supabase
    .from(PORTFELL_TABLES.coveredCalls)
    .delete()
    .eq("id", id)
    .eq("portfolio_id", owned.portfolioId);
  if (error) {
    return NextResponse.json(
      { error: dbError(error, "DELETE /api/covered-calls: delete call") },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}

export const GET = observeRoute(handleGET, "/api/covered-calls");
export const POST = observeRoute(handlePOST, "/api/covered-calls");
export const PATCH = observeRoute(handlePATCH, "/api/covered-calls");
export const DELETE = observeRoute(handleDELETE, "/api/covered-calls");
