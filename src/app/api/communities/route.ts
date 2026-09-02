import { dbError } from "@/lib/db-error";
import {
  CLASSROOM_KIND,
  CIRCLE_KIND,
  CLASS_PERIOD_KINDS,
  DEFAULT_CLASS_ASSIGNMENT,
  DEFAULT_STARTING_CASH,
  emptyClassPlan,
  isClassroomKind,
  parseStartingCash,
  startPeriodNow,
  type ClassPeriodKind,
} from "@/lib/classroom";
import { shareOwnedSheetsIntoCommunity } from "@/lib/community-share";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { communityPostSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";

async function handleGET() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ communities: [] });
  }

  /*
    One request rather than two. Home fetches this on every mount, and
    reading the memberships and then reading the communities those rows had
    just named was two serial round trips for one line of text. PostgREST
    joins them on the foreign key, so a membership row arrives carrying its
    own community.

    The sort is done here rather than by the database: PostgREST orders a
    result by columns of the table it was asked for, and the name is on the
    embedded side. A person is in a handful of circles, so this costs
    nothing next to the round trip it saves.
  */
  const { data: memberships, error } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .select(
      "role, community:portfell_communities!inner(id, name, visibility, kind, starting_cash, created_by, created_at, updated_at)"
    )
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/communities") }, { status: 500 });
  }

  const rows = (memberships ?? []) as unknown as {
    role: string | null;
    community:
      | ({ id: string; name: string } & Record<string, unknown>)
      | null;
  }[];

  const communities = rows.flatMap((m) =>
    m.community ? [{ ...m.community, role: m.role ?? "member" }] : []
  );
  communities.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ communities });
}

async function handlePOST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const parsed = await parseJsonBody(req, communityPostSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const name = body.name.trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const kind =
    body.kind === CLASSROOM_KIND ? CLASSROOM_KIND : CIRCLE_KIND;
  const classroom = isClassroomKind(kind);
  const visibility =
    classroom || body.visibility !== "public" ? "private" : "public";
  const startingCash = classroom
    ? parseStartingCash(body.startingCash) ?? DEFAULT_STARTING_CASH
    : DEFAULT_STARTING_CASH;
  if (classroom && body.startingCash != null) {
    if (parseStartingCash(body.startingCash) == null) {
      return NextResponse.json({ error: "invalid starting cash" }, { status: 400 });
    }
  }
  const houseNote = classroom
    ? String(body.assignment ?? "").trim().slice(0, 800) ||
      DEFAULT_CLASS_ASSIGNMENT
    : undefined;
  const startPeriodRaw = String(body.startPeriod ?? "");
  const startPeriod = CLASS_PERIOD_KINDS.includes(
    startPeriodRaw as ClassPeriodKind
  )
    ? (startPeriodRaw as ClassPeriodKind)
    : "open";
  const classPlan = classroom
    ? startPeriod === "open"
      ? { ...emptyClassPlan(), purpose: houseNote }
      : startPeriodNow({ purpose: houseNote, periods: [] }, startPeriod)
    : undefined;

  const { data: community, error } = await supabase
    .from(PORTFELL_TABLES.communities)
    .insert({
      name,
      visibility,
      kind,
      starting_cash: startingCash,
      ...(houseNote ? { house_note: houseNote } : {}),
      ...(classPlan ? { class_plan: classPlan } : {}),
      created_by: auth.user.id,
    })
    .select("id, name, visibility, kind, starting_cash, house_note, created_by, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/communities") }, { status: 500 });
  }

  const { error: mErr } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .insert({
      community_id: (community as { id: string }).id,
      user_id: auth.user.id,
      role: "admin",
    });

  if (mErr) {
    return NextResponse.json({ error: dbError(mErr, "/api/communities") }, { status: 500 });
  }

  await shareOwnedSheetsIntoCommunity(supabase, {
    communityId: (community as { id: string }).id,
    userId: auth.user.id,
  });

  return NextResponse.json({
    community: { ...(community as object), role: "admin" },
  });
}

export const GET = observeRoute(handleGET, '/api/communities');
export const POST = observeRoute(handlePOST, '/api/communities');
