import { dbError } from "@/lib/db-error";
import { NextRequest, NextResponse } from "next/server";
import {
  emptyLabBundle,
  sanitizeWatchlist,
  type LabBundle,
} from "@/lib/lab-bundle";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { observeRoute } from "@/lib/observe-route";
import { labPutSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";

const LAB_COLS_FULL = "id, owner_id, conviction, watchlist, updated_at";
const LAB_COLS_BASE = "id, owner_id, conviction, updated_at";

/**
 * `watchlist` arrives with migration `20260819140000_lab_watchlist.sql`,
 * which may not be applied yet on a given environment. Every Lab save
 * sends the column, and both the read and the write name it — so without
 * this guard an unapplied migration doesn't just lose the watchlist, it
 * fails the whole request and takes conviction notes down with it.
 *
 * So: try with the column, and if Postgres says it doesn't exist, drop it
 * and retry once. The flag is per warm instance and resets when the
 * instance recycles, so the column starts being used again on its own
 * once the migration lands — no deploy or restart needed.
 */
let watchlistColumnReady = true;

function labCols(): string {
  return watchlistColumnReady ? LAB_COLS_FULL : LAB_COLS_BASE;
}

/** PostgREST's two shapes for "that column isn't in the schema". */
function isMissingWatchlistColumn(
  error: { code?: string; message?: string } | null
): boolean {
  if (!error || !watchlistColumnReady) return false;
  const code = error.code ?? "";
  if (code !== "PGRST204" && code !== "42703") return false;
  return /watchlist/i.test(error.message ?? "");
}

function rowToBundle(row: Record<string, unknown> | null): LabBundle {
  if (!row) return emptyLabBundle();
  return {
    conviction: (row.conviction as LabBundle["conviction"]) ?? {},
    watchlist: sanitizeWatchlist(row.watchlist),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined,
  };
}

async function handleGET() {
  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({
      source: "local",
      bundle: emptyLabBundle(),
    });
  }

  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const read = () =>
    supabase
      .from(PORTFELL_TABLES.labState)
      .select(labCols())
      .eq("owner_id", auth.user.id)
      .maybeSingle();

  let { data, error } = await read();
  if (isMissingWatchlistColumn(error)) {
    watchlistColumnReady = false;
    ({ data, error } = await read());
  }

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/lab") }, { status: 500 });
  }

  return NextResponse.json({
    source: "supabase",
    // `labCols()` is a runtime string, so PostgREST can't infer the row
    // shape the way it does for a literal select.
    bundle: rowToBundle(data as Record<string, unknown> | null),
  });
}

async function handlePUT(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured, Lab stays local" },
      { status: 400 }
    );
  }

  const parsed = await parseJsonBody(req, labPutSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from(PORTFELL_TABLES.labState)
    .select("id")
    .eq("owner_id", auth.user.id)
    .maybeSingle();

  // A partial save. The watchlist and the conviction notes are written by
  // different screens, so only touch the fields this request actually sent
  // — otherwise a watchlist-only save would blank someone's thesis notes.
  const write = async () => {
    const patch: {
      updated_at: string;
      conviction?: LabBundle["conviction"];
      watchlist?: string[];
    } = { updated_at: now };
    if (body.conviction !== undefined) {
      patch.conviction = body.conviction as LabBundle["conviction"];
    }
    if (body.watchlist !== undefined && watchlistColumnReady) {
      patch.watchlist = sanitizeWatchlist(body.watchlist);
    }

    if (existing) {
      return supabase
        .from(PORTFELL_TABLES.labState)
        .update(patch)
        .eq("owner_id", auth.user.id)
        .select(labCols())
        .single();
    }
    return supabase
      .from(PORTFELL_TABLES.labState)
      .insert({
        id: auth.user.id,
        owner_id: auth.user.id,
        conviction: (body.conviction ?? {}) as LabBundle["conviction"],
        ...(watchlistColumnReady
          ? { watchlist: sanitizeWatchlist(body.watchlist) }
          : {}),
        updated_at: now,
      })
      .select(labCols())
      .single();
  };

  let { data, error } = await write();
  if (isMissingWatchlistColumn(error)) {
    watchlistColumnReady = false;
    ({ data, error } = await write());
  }

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/lab") }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    bundle: rowToBundle(data as Record<string, unknown> | null),
  });
}

export const GET = observeRoute(handleGET, '/api/lab');
export const PUT = observeRoute(handlePUT, '/api/lab');
