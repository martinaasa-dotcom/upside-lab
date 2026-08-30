import { dbError } from "@/lib/db-error";
import { noteEmailConfigured } from "@/lib/send-note";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { weeklyNotePostSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";

/**
 * The Sunday letter is the only email this app sends on a schedule. The
 * old weekday/after-close notes are gone, so `note_sunday` is the single
 * preference. `morning_note` is still written for the legacy column's
 * sake; nothing reads it to decide what to send any more.
 */
async function handleGET() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;
  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({
      sunday: false,
      enabled: false,
      canSend: noteEmailConfigured(),
    });
  }
  const { data, error } = await supabase
    .from(PORTFELL_TABLES.profiles)
    .select("note_sunday, morning_note")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: dbError(error, "/api/account/weekly-note") }, { status: 500 });
  const sunday = Boolean(data?.note_sunday ?? data?.morning_note);
  return NextResponse.json({
    sunday,
    enabled: sunday,
    canSend: noteEmailConfigured(),
  });
}

async function handlePOST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;
  const parsed = await parseJsonBody(req, weeklyNotePostSchema);
  if (!parsed.ok) return parsed.response;
  const next = parsed.data.sunday ?? parsed.data.enabled;
  if (next === undefined) {
    return NextResponse.json(
      { error: "sunday required" },
      { status: 400 }
    );
  }
  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }
  const { error } = await supabase
    .from(PORTFELL_TABLES.profiles)
    .update({
      note_sunday: next,
      note_morning: false,
      morning_note: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", auth.user.id);
  if (error) return NextResponse.json({ error: dbError(error, "/api/account/weekly-note") }, { status: 500 });
  return NextResponse.json({
    ok: true,
    sunday: next,
    enabled: next,
    canSend: noteEmailConfigured(),
  });
}

export const GET = observeRoute(handleGET, "/api/account/weekly-note");
export const POST = observeRoute(handlePOST, "/api/account/weekly-note");
