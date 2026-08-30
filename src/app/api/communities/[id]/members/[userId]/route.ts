import { dbError } from "@/lib/db-error";
import {
  collapseMembersByAlias,
  expandHouseholdUserIds,
  expandPersonUserIds,
  householdEmailsFor,
  loadAliasMap,
  normalizeEmail,
  type RawMember,
} from "@/lib/auth/identity";
import { userIsCommunityAdmin } from "@/lib/auth/ownership";
import { isClassroomKind } from "@/lib/classroom";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { memberPatchSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; userId: string }> };

/**
 * Resolve a person_id (or a raw user_id) to every user_id an admin action
 * should apply to. Google-alias logins (Martin's two logins, say) always
 * collapse together — that's the same person. Household partners (Martin +
 * Amanda, Rasmus + Karoliine) only collapse together for circles: classroom
 * membership stays strictly per person (AGENTS.md, migration 053's own
 * `c.kind = 'classroom'` guard on the DB-side mirror trigger). Without this
 * check here, removing or re-roling one student in a class could silently
 * sweep up their household partner too, even when the partner is enrolled
 * in the same class as an independent student.
 */
async function resolveTargetUserIds(
  communityId: string,
  personOrUserId: string,
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseDataClient>>>
): Promise<string[]> {
  const aliasMap = await loadAliasMap(supabase);
  const [{ data: members }, { data: community }] = await Promise.all([
    supabase
      .from(PORTFELL_TABLES.communityMembers)
      .select("user_id, role, joined_at")
      .eq("community_id", communityId),
    supabase
      .from(PORTFELL_TABLES.communities)
      .select("kind")
      .eq("id", communityId)
      .maybeSingle(),
  ]);
  const userIds = ((members ?? []) as { user_id: string }[]).map(
    (m) => m.user_id
  );
  const { data: profiles } = userIds.length
    ? await supabase
        .from(PORTFELL_TABLES.profiles)
        .select("id, email, display_name, avatar_url, bio")
        .in("id", userIds)
    : { data: [] };
  const profileById = new Map(
    ((profiles ?? []) as { id: string }[]).map((p) => [p.id, p])
  );
  const raw: RawMember[] = (
    (members ?? []) as { user_id: string; role: string; joined_at: string }[]
  ).map((m) => ({
    ...m,
    profile: (profileById.get(m.user_id) as RawMember["profile"]) ?? null,
  }));
  const people = collapseMembersByAlias(raw, null, aliasMap);
  const aliasIds = expandPersonUserIds(personOrUserId, people);

  if (isClassroomKind((community as { kind?: string } | null)?.kind)) {
    return aliasIds;
  }

  const memberProfiles = (profiles ?? []) as {
    id: string;
    email: string | null;
  }[];
  const householdEmails = new Set<string>();
  for (const id of aliasIds) {
    const email = memberProfiles.find((p) => p.id === id)?.email;
    for (const partner of householdEmailsFor(email)) householdEmails.add(partner);
  }
  const missingEmails = [...householdEmails].filter(
    (email) => !memberProfiles.some((p) => normalizeEmail(p.email) === email)
  );
  let extra: { id: string; email: string | null }[] = [];
  if (missingEmails.length) {
    const { data: extraProfiles } = await supabase
      .from(PORTFELL_TABLES.profiles)
      .select("id, email")
      .in("email", missingEmails);
    extra = (extraProfiles ?? []) as { id: string; email: string | null }[];
  }
  return expandHouseholdUserIds(aliasIds, [...memberProfiles, ...extra]);
}

/** Admin: remove member or change role (applies to alias logins and, for circles only, household partners — classrooms stay per person). */
async function handlePATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id, userId } = await ctx.params;
  if (!(await userIsCommunityAdmin(auth.user.id, id))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const parsed = await parseJsonBody(req, memberPatchSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const targetIds = await resolveTargetUserIds(id, userId, supabase);
  if (!targetIds.length) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (body.role === "member") {
    const { data: admins } = await supabase
      .from(PORTFELL_TABLES.communityMembers)
      .select("user_id")
      .eq("community_id", id)
      .eq("role", "admin");
    const adminIds = ((admins ?? []) as { user_id: string }[]).map(
      (a) => a.user_id
    );
    const remainingAdmins = adminIds.filter((a) => !targetIds.includes(a));
    if (remainingAdmins.length === 0) {
      return NextResponse.json(
        { error: "Keep at least one admin" },
        { status: 400 }
      );
    }
  }

  const { error } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .update({ role: body.role })
    .eq("community_id", id)
    .in("user_id", targetIds);

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/communities/[id]/members/[userId]") }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * Admin removes a member, or a member removes themselves.
 *
 * Self-removal matters now that public communities let people request in:
 * without it, anyone who joined one was stuck until an admin got around to
 * evicting them. The last-admin guard below still applies either way, so
 * nobody can leave a community with no admin behind.
 */
async function handleDELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id, userId } = await ctx.params;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const targetIds = await resolveTargetUserIds(id, userId, supabase);
  if (!targetIds.length) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Resolve first: "self" means any account linked to the caller's person,
  // so leaving with a household alias takes both logins out together.
  const isSelf = targetIds.includes(auth.user.id);
  if (!isSelf && !(await userIsCommunityAdmin(auth.user.id, id))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { data: admins } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .select("user_id")
    .eq("community_id", id)
    .eq("role", "admin");
  const adminIds = ((admins ?? []) as { user_id: string }[]).map(
    (a) => a.user_id
  );
  const removingAdmin = targetIds.some((t) => adminIds.includes(t));
  if (removingAdmin) {
    const remainingAdmins = adminIds.filter((a) => !targetIds.includes(a));
    if (remainingAdmins.length === 0) {
      return NextResponse.json(
        {
          error: isSelf
            ? "You're the only admin. Promote someone else first, or delete the community."
            : "Keep at least one admin",
        },
        { status: 400 }
      );
    }
  }

  const { data: classSheets } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("id")
    .eq("classroom_community_id", id)
    .in("owner_id", targetIds);
  const classIds = ((classSheets ?? []) as { id: string }[]).map((s) => s.id);
  if (classIds.length) {
    await supabase
      .from(PORTFELL_TABLES.communityPortfolios)
      .delete()
      .eq("community_id", id)
      .in("portfolio_id", classIds);
    await supabase
      .from(PORTFELL_TABLES.portfolios)
      .update({ classroom_community_id: null, updated_at: new Date().toISOString() })
      .in("id", classIds);
  }

  const { error } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .delete()
    .eq("community_id", id)
    .in("user_id", targetIds);

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/communities/[id]/members/[userId]") }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export const PATCH = observeRoute(handlePATCH, '/api/communities/[id]/members/[userId]');
export const DELETE = observeRoute(handleDELETE, '/api/communities/[id]/members/[userId]');
