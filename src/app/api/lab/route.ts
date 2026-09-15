import { dbError } from "@/lib/db-error";
import { NextRequest, NextResponse } from "next/server";
import {
  emptyLabBundle,
  sanitizeEoyOverrides,
  sanitizeEoySources,
  sanitizeLadders,
  sanitizeWatchlist,
  type LabBundle,
} from "@/lib/lab-bundle";
import { mirrorHouseForecast } from "@/lib/forecast/house-forecast-sync";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { observeRoute } from "@/lib/observe-route";
import { labPutSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";

const LAB_BASE_COLS = ["id", "owner_id", "conviction", "updated_at"];

/**
 * A column that arrives with a migration may not be applied yet on a given
 * environment, and every Lab save names every column: without a guard an
 * unapplied migration does not just lose that one field, it fails the whole
 * request and takes the Pulse stamp trail down with it.
 *
 * So each optional column is tried, and if Postgres says it does not
 * exist it is dropped and the request retried once. The flags are per warm
 * instance and reset when the instance recycles, so a column starts being
 * used again on its own once its migration lands, with no deploy needed.
 *
 * `watchlist` came with `20260819140000_lab_watchlist.sql`, `ladders`
 * with `20260906140000_a_price_plan_belongs_to_the_reader.sql`,
 * `eoyOverrides` with `20260915120000_a_house_default_for_everyone_else.sql`
 * and `eoy_sources` with `20260915180000_a_figure_says_who_wrote_it.sql`.
 * They are tracked separately on purpose: one environment can have the
 * first two and not the third, and a single flag would take an applied
 * column out along with the missing one.
 */
const OPTIONAL_COLUMNS = [
  "watchlist",
  "ladders",
  "eoy_overrides",
  "eoy_sources",
] as const;
type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number];

const columnReady: Record<OptionalColumn, boolean> = {
  watchlist: true,
  ladders: true,
  eoy_overrides: true,
  eoy_sources: true,
};

function labCols(): string {
  return [
    ...LAB_BASE_COLS,
    ...OPTIONAL_COLUMNS.filter((c) => columnReady[c]),
  ].join(", ");
}

/** PostgREST's two shapes for "that column isn't in the schema". */
function missingColumn(
  error: { code?: string; message?: string } | null
): OptionalColumn | null {
  if (!error) return null;
  const code = error.code ?? "";
  if (code !== "PGRST204" && code !== "42703") return null;
  return (
    OPTIONAL_COLUMNS.find(
      (c) => columnReady[c] && new RegExp(c, "i").test(error.message ?? "")
    ) ?? null
  );
}

function rowToBundle(row: Record<string, unknown> | null): LabBundle {
  if (!row) return emptyLabBundle();
  return {
    conviction: (row.conviction as LabBundle["conviction"]) ?? {},
    watchlist: sanitizeWatchlist(row.watchlist),
    ladders: sanitizeLadders(row.ladders),
    eoyOverrides: sanitizeEoyOverrides(row.eoy_overrides),
    eoySources: sanitizeEoySources(row.eoy_sources),
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
  for (let attempt = 0; attempt < OPTIONAL_COLUMNS.length; attempt += 1) {
    const missing = missingColumn(error);
    if (!missing) break;
    columnReady[missing] = false;
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

  // A partial save. The watchlist and the Pulse history are written by
  // different screens, so only touch the fields this request actually sent
  // — otherwise a watchlist-only save would blank someone's Pulse history.
  const write = async () => {
    const patch: {
      updated_at: string;
      conviction?: LabBundle["conviction"];
      watchlist?: string[];
      ladders?: LabBundle["ladders"];
      eoy_overrides?: LabBundle["eoyOverrides"];
      eoy_sources?: LabBundle["eoySources"];
    } = { updated_at: now };
    if (body.conviction !== undefined) {
      patch.conviction = body.conviction as LabBundle["conviction"];
    }
    if (body.watchlist !== undefined && columnReady.watchlist) {
      patch.watchlist = sanitizeWatchlist(body.watchlist);
    }
    if (body.ladders !== undefined && columnReady.ladders) {
      patch.ladders = sanitizeLadders(body.ladders);
    }
    if (body.eoyOverrides !== undefined && columnReady.eoy_overrides) {
      patch.eoy_overrides = sanitizeEoyOverrides(body.eoyOverrides);
    }
    if (body.eoySources !== undefined && columnReady.eoy_sources) {
      patch.eoy_sources = sanitizeEoySources(body.eoySources);
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
        ...(columnReady.watchlist
          ? { watchlist: sanitizeWatchlist(body.watchlist) }
          : {}),
        ...(columnReady.ladders
          ? { ladders: sanitizeLadders(body.ladders) }
          : {}),
        ...(columnReady.eoy_overrides
          ? { eoy_overrides: sanitizeEoyOverrides(body.eoyOverrides) }
          : {}),
        ...(columnReady.eoy_sources
          ? { eoy_sources: sanitizeEoySources(body.eoySources) }
          : {}),
        updated_at: now,
      })
      .select(labCols())
      .single();
  };

  let { data, error } = await write();
  for (let attempt = 0; attempt < OPTIONAL_COLUMNS.length; attempt += 1) {
    const missing = missingColumn(error);
    if (!missing) break;
    columnReady[missing] = false;
    ({ data, error } = await write());
  }

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/lab") }, { status: 500 });
  }

  // Best-effort and after the reader's own save has already gone through:
  // the site default catching up must never slow down or fail their write.
  void mirrorHouseForecast({
    email: auth.user.email,
    eoyOverrides:
      body.eoyOverrides !== undefined && columnReady.eoy_overrides
        ? sanitizeEoyOverrides(body.eoyOverrides)
        : undefined,
    ladders:
      body.ladders !== undefined && columnReady.ladders
        ? sanitizeLadders(body.ladders)
        : undefined,
    /*
      Sent whether or not the column took it: the mirror needs to know
      which published figures the house account typed and which its own
      forecast run wrote, and that is a fact about this request rather
      than about what the account's row managed to store.
    */
    eoySources:
      body.eoySources !== undefined
        ? sanitizeEoySources(body.eoySources)
        : undefined,
  });

  return NextResponse.json({
    ok: true,
    bundle: rowToBundle(data as Record<string, unknown> | null),
  });
}

export const GET = observeRoute(handleGET, '/api/lab');
export const PUT = observeRoute(handlePUT, '/api/lab');
