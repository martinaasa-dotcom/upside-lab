import { dbError } from "@/lib/db-error";
import { isSuperadminEmail } from "@/lib/auth/superadmin";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { ERROR_LOG_COLUMNS, PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const dynamic = "force-dynamic";

async function handleGET() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;
  if (!isSuperadminEmail(auth.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.errorLog)
    .select(ERROR_LOG_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(150);

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/admin/errors") }, { status: 500 });
  }
  return NextResponse.json({ errors: data ?? [] });
}

/** Clear the log after triage — superadmin only, matches the RLS delete policy. */
async function handleDELETE(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;
  if (!isSuperadminEmail(auth.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const query = supabase.from(PORTFELL_TABLES.errorLog).delete();
  const { error } = id
    ? await query.eq("id", id)
    : await query.gte("created_at", "1970-01-01");

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/admin/errors") }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export const GET = observeRoute(handleGET, '/api/admin/errors');
export const DELETE = observeRoute(handleDELETE, '/api/admin/errors');
