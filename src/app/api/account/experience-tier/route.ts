import { dbError } from "@/lib/db-error";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { experienceTierPostSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";

async function handleGET() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ tier: null });
  }

  /*
    Read the walkthrough column if it is there, and carry on without it if it
    is not.

    The house order is SQL first, app second (docs/ZERO_DOWNTIME_MIGRATIONS.md),
    and following it means this branch never runs. It is here because of what
    happens if the order slips: this endpoint is what every experience gate in
    the app reads, so a select naming a column that does not exist yet would
    not merely hide the walkthrough — it would 500 the tier read for everybody
    until the migration landed. A missing column reads as "has seen nothing",
    which is the right answer for a database that has never heard of the
    walkthrough.
  */
  const full = await supabase
    .from(PORTFELL_TABLES.profiles)
    .select("experience_tier, knows_options, welcome_tour_version")
    .eq("id", auth.user.id)
    .maybeSingle();

  // 42703 is Postgres' undefined_column.
  const missingColumn = full.error?.code === "42703";
  const { data, error } = missingColumn
    ? await supabase
        .from(PORTFELL_TABLES.profiles)
        .select("experience_tier, knows_options")
        .eq("id", auth.user.id)
        .maybeSingle()
    : full;

  if (error) return NextResponse.json({ error: dbError(error, "/api/account/experience-tier") }, { status: 500 });
  /*
    `tourVersion` rides along on the call the first-run gate was already
    making. It is a third column on a row that was being read anyway, and
    keeping it here is what lets the gate decide whether to open the
    walkthrough in one round trip rather than two — which matters, because
    the thing it is deciding is whether to put an overlay in front of Home.

    No row yet reads as zero rather than null: somebody whose profile has not
    been created is somebody who has certainly not seen the walkthrough.
  */
  return NextResponse.json({
    tier: data?.experience_tier ?? null,
    knowsOptions: data?.knows_options ?? null,
    /*
      `null` means the column is not there yet — a different answer from `0`,
      which is a row that has it and has never finished a walkthrough.

      Read as zero, a database without the migration would put the walkthrough
      in front of everybody while the POST below silently drops the write, so
      it would come back on the next device and never be recorded anywhere. A
      feature whose migration has not been applied should be off, not stuck
      on, so the gate treats `null` as "not yet" and shows nothing.
    */
    tourVersion:
      data && "welcome_tour_version" in data
        ? (data.welcome_tour_version ?? 0)
        : null,
  });
}

async function handlePOST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const parsed = await parseJsonBody(req, experienceTierPostSchema);
  if (!parsed.ok) return parsed.response;
  const { tier, knowsOptions, tourVersion } = parsed.data;
  if (tier === undefined && knowsOptions === undefined && tourVersion === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const patch: TablesUpdate<"portfell_profiles"> = {
    updated_at: new Date().toISOString(),
  };
  if (tier !== undefined) patch.experience_tier = tier;
  if (knowsOptions !== undefined) patch.knows_options = knowsOptions;
  if (tourVersion !== undefined) patch.welcome_tour_version = tourVersion;

  const first = await supabase
    .from(PORTFELL_TABLES.profiles)
    .update(patch)
    .eq("id", auth.user.id);

  /*
    Same reasoning as the GET: if the walkthrough column is not there yet, the
    two answers in the same patch must still land. Dropping the walkthrough
    field and writing again is better than failing the whole update — the
    reader has just told us how experienced they are, and losing that because
    of a column they have never heard of is the worse outcome. The walkthrough
    simply stays due, which it is.
  */
  const missingColumn = first.error?.code === "42703";
  const { error } = missingColumn
    ? await supabase
        .from(PORTFELL_TABLES.profiles)
        .update({ ...patch, welcome_tour_version: undefined })
        .eq("id", auth.user.id)
    : first;

  if (error) return NextResponse.json({ error: dbError(error, "/api/account/experience-tier") }, { status: 500 });
  return NextResponse.json({
    ok: true,
    tier,
    knowsOptions,
    tourVersion: missingColumn ? undefined : tourVersion,
  });
}

export const GET = observeRoute(handleGET, '/api/account/experience-tier');
export const POST = observeRoute(handlePOST, '/api/account/experience-tier');
