import { dbError } from "@/lib/db-error";
import {
  collapseMembersByAlias,
  HOUSEHOLD_PENDING_EMAILS,
  loadAliasMap,
  type PendingHousehold,
  type RawMember,
} from "@/lib/auth/identity";
import {
  userIsCommunityAdmin,
  userIsCommunityMember,
} from "@/lib/auth/ownership";
import {
  CLASS_PERIOD_KINDS,
  isClassroomKind,
  parseClassPlan,
  parseStartingCash,
  resolveClassroomTrade,
  startPeriodNow,
  type ClassPeriodKind,
} from "@/lib/classroom";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { readAll } from "@/lib/supabase/read-all";
import { applyPortfolioCashDelta } from "@/lib/cash-trade";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { communityPatchSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function handleGET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  if (!(await userIsCommunityMember(auth.user.id, id))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  // None of these depend on each other, and isAdmin is only consumed much
  // further down, so fetching it here costs nothing extra instead of an
  // extra serial round-trip later.
  /*
    The roster is paged, so this screen and the community book agree.

    Permissions here do not come from it (`isAdmin` is its own call), so a
    short read would not have let anybody through a door. It would have
    done something quieter and stranger: the same class showing a
    different set of members depending on which of the two screens you
    opened it from.
  */
  const [aliasMap, isAdmin, { data: community }, members, pinned] =
    await Promise.all([
      loadAliasMap(supabase),
      userIsCommunityAdmin(auth.user.id, id),
      supabase
        .from(PORTFELL_TABLES.communities)
        .select("id, name, visibility, auto_approve_joins, kind, starting_cash, house_note, class_plan, created_by, created_at, updated_at")
        .eq("id", id)
        .single(),
      readAll<{ user_id: string; role: string; joined_at: string }>(() =>
        supabase
          .from(PORTFELL_TABLES.communityMembers)
          .select("user_id, role, joined_at")
          .order("community_id")
          .order("user_id")
          .eq("community_id", id)
      ),
      readAll<{ portfolio_id: string; label: string | null }>(() =>
        supabase
          .from(PORTFELL_TABLES.communityPortfolios)
          .select("portfolio_id, label")
          .order("community_id")
          .order("portfolio_id")
          .eq("community_id", id)
      ),
    ]);

  if (!community) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const userIds = members.map((m) => m.user_id);
  const profiles = userIds.length
    ? await readAll<{ id: string }>(() =>
        supabase
          .from(PORTFELL_TABLES.profiles)
          .select("id, email, display_name, avatar_url, bio")
          .order("id")
          .in("id", userIds)
      )
    : [];

  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const rawMembers: RawMember[] = members.map((m) => ({
    ...m,
    profile: (profileById.get(m.user_id) as RawMember["profile"]) ?? null,
  }));

  const people = collapseMembersByAlias(
    rawMembers,
    auth.user.id,
    aliasMap
  );

  const pinnedRows = pinned;
  const pinnedIds = pinnedRows.map((p) => p.portfolio_id);

  const ownership = pinnedIds.length
    ? await readAll<{ portfolio_id: string; user_id: string }>(() =>
        supabase
          .from(PORTFELL_TABLES.portfolioOwners)
          .select("portfolio_id, user_id")
          .order("portfolio_id")
          .order("user_id")
          .in("portfolio_id", pinnedIds)
      )
    : [];

  const ownedIds = [
    ...new Set(
      ownership
        .filter((o) => userIds.includes(o.user_id))
        .map((o) => o.portfolio_id)
    ),
  ];
  const portfolioIds = [...new Set(pinnedIds)];

  const portfolios = portfolioIds.length
    ? await readAll<{
        id: string;
        name: string;
        slug: string;
        owner_id?: string | null;
      }>(() =>
        supabase
          .from(PORTFELL_TABLES.portfolios)
          .select("id, name, slug, sort_order, cash_balance, owner_id, classroom_community_id")
          .in("id", portfolioIds)
          .order("sort_order")
          .order("id")
      )
    : [];

  // Pending households: pinned sheets not yet owned by any signed-in member.
  const ownedSet = new Set(ownedIds);
  const memberUserIds = new Set(userIds);
  const portfolioRows = portfolios;

  const isOwnedByMember = (portfolioId: string) => {
    if (ownedSet.has(portfolioId)) return true;
    const row = portfolioRows.find((p) => p.id === portfolioId);
    return Boolean(row?.owner_id && memberUserIds.has(row.owner_id));
  };

  const pendingPortfolioIds = pinnedIds.filter((pid) => !isOwnedByMember(pid));
  let pending_members: PendingHousehold[] = [];

  if (pendingPortfolioIds.length) {
    const pendingPortfolios = (
      (portfolios ?? []) as { id: string; name: string; slug: string }[]
    ).filter((p) => pendingPortfolioIds.includes(p.id));

    const slugs = pendingPortfolios.map((p) => p.slug);
    const { data: claims } = slugs.length
      ? await supabase
          .from(PORTFELL_TABLES.seedClaims)
          .select("email, portfolio_slug")
          .in("portfolio_slug", slugs)
      : { data: [] };

    const emailsBySlug = new Map<string, string[]>(
      Object.entries(HOUSEHOLD_PENDING_EMAILS)
    );
    for (const c of (claims ?? []) as {
      email: string;
      portfolio_slug: string;
    }[]) {
      const list = emailsBySlug.get(c.portfolio_slug) ?? [];
      const em = c.email.toLowerCase();
      if (!list.includes(em)) list.push(em);
      emailsBySlug.set(c.portfolio_slug, list);
    }

    pending_members = pendingPortfolios.map((p) => {
      const pin = pinnedRows.find((r) => r.portfolio_id === p.id);
      return {
        key: p.slug,
        label: pin?.label || p.name,
        portfolio_ids: [p.id],
        emails: emailsBySlug.get(p.slug) ?? [],
      };
    });
  }

  let join_requests: {
    id: string;
    user_id: string;
    message: string | null;
    requested_at: string;
    profile: { display_name: string | null; email: string | null; avatar_url: string | null } | null;
  }[] = [];
  if (isAdmin) {
    const pendingRequests = await readAll<{
      id: string;
      user_id: string;
      message: string | null;
      requested_at: string;
    }>(() =>
      supabase
        .from(PORTFELL_TABLES.communityJoinRequests)
        .select("id, user_id, message, requested_at")
        .eq("community_id", id)
        .eq("status", "pending")
        .order("requested_at", { ascending: true })
        .order("id")
    );
    const reqUserIds = pendingRequests.map((r) => r.user_id);
    const reqProfiles = reqUserIds.length
      ? await readAll<{ id: string }>(() =>
          supabase
            .from(PORTFELL_TABLES.profiles)
            .select("id, email, display_name, avatar_url")
            .order("id")
            .in("id", reqUserIds)
        )
      : [];
    const reqProfileById = new Map(
      (
        (reqProfiles ?? []) as {
          id: string;
          email: string | null;
          display_name: string | null;
          avatar_url: string | null;
        }[]
      ).map((p) => [p.id, p])
    );
    join_requests = (
      (pendingRequests ?? []) as {
        id: string;
        user_id: string;
        message: string | null;
        requested_at: string;
      }[]
    ).map((r) => ({
      ...r,
      profile: reqProfileById.get(r.user_id) ?? null,
    }));
  }

  // Remap ownership to person_id for client attribution
  const userToPerson = new Map<string, string>();
  for (const person of people) {
    for (const uid of person.user_ids) {
      userToPerson.set(uid, person.person_id);
    }
  }

  const ownershipForClient = (
    (ownership ?? []) as { portfolio_id: string; user_id: string }[]
  ).map((o) => ({
    portfolio_id: o.portfolio_id,
    user_id: userToPerson.get(o.user_id) ?? o.user_id,
    raw_user_id: o.user_id,
  }));

  const attributedPortfolioIds = new Set(
    ownershipForClient.map((o) => o.portfolio_id)
  );
  for (const p of portfolioRows) {
    if (
      p.owner_id &&
      memberUserIds.has(p.owner_id) &&
      !attributedPortfolioIds.has(p.id)
    ) {
      ownershipForClient.push({
        portfolio_id: p.id,
        user_id: userToPerson.get(p.owner_id) ?? p.owner_id,
        raw_user_id: p.owner_id,
      });
      attributedPortfolioIds.add(p.id);
    }
  }

  // Synthetic ownership for pending pinned sheets (household key as user_id)
  for (const pending of pending_members) {
    for (const pid of pending.portfolio_ids) {
      ownershipForClient.push({
        portfolio_id: pid,
        user_id: `pending:${pending.key}`,
        raw_user_id: `pending:${pending.key}`,
      });
    }
  }

  const communityRow = community as {
    kind?: string;
    class_plan?: unknown;
    house_note?: string | null;
  };
  const classTrade = isClassroomKind(communityRow.kind)
    ? resolveClassroomTrade(
        parseClassPlan(communityRow.class_plan),
        new Date(),
        communityRow.house_note
      )
    : null;

  return NextResponse.json({
    community: { ...(community as object), classTrade },
    isAdmin,
    join_requests,
    members: people.map((p) => ({
      user_id: p.person_id,
      user_ids: p.user_ids,
      emails: p.emails,
      role: p.role,
      joined_at: p.joined_at,
      profile: p.profile,
      is_you: p.is_you,
    })),
    pending_members,
    portfolios: portfolios ?? [],
    ownership: ownershipForClient,
  });
}

/** Admin: rename the community and/or flip public/private visibility. */
async function handlePATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  if (!(await userIsCommunityAdmin(auth.user.id, id))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const parsed = await parseJsonBody(req, communityPatchSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const patch: TablesUpdate<"portfell_communities"> = {
    updated_at: new Date().toISOString(),
  };
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 80);
    if (!name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    patch.name = name;
  }
  if (body.visibility !== undefined) {
    if (body.visibility !== "public" && body.visibility !== "private") {
      return NextResponse.json({ error: "invalid visibility" }, { status: 400 });
    }
    const { data: current } = await supabase
      .from(PORTFELL_TABLES.communities)
      .select("kind")
      .eq("id", id)
      .maybeSingle();
    if (
      body.visibility === "public" &&
      (current as { kind?: string } | null)?.kind === "classroom"
    ) {
      return NextResponse.json(
        { error: "Classes stay invite-only" },
        { status: 400 }
      );
    }
    patch.visibility = body.visibility;
  }
  if (body.autoApproveJoins !== undefined) {
    /*
      Only a public circle can be let open: a class and a private circle
      are reached by invite alone, and a stored true on one of those would
      be a setting that reads as a promise the join route never keeps.
    */
    const { data: current } = await supabase
      .from(PORTFELL_TABLES.communities)
      .select("kind, visibility")
      .eq("id", id)
      .maybeSingle();
    const row = current as { kind?: string; visibility?: string } | null;
    const nextVisibility = patch.visibility ?? row?.visibility;
    if (body.autoApproveJoins && (row?.kind === "classroom" || nextVisibility !== "public")) {
      return NextResponse.json(
        { error: "Only a public circle can let people in on the spot" },
        { status: 400 }
      );
    }
    patch.auto_approve_joins = body.autoApproveJoins;
  }
  if (body.houseNote !== undefined) {
    patch.house_note = String(body.houseNote).trim().slice(0, 800);
  }
  if (
    body.classPlan !== undefined ||
    body.startPeriod !== undefined ||
    body.houseNote !== undefined
  ) {
    const { data: current } = await supabase
      .from(PORTFELL_TABLES.communities)
      .select("kind, class_plan, house_note")
      .eq("id", id)
      .maybeSingle();
    const classroom = isClassroomKind((current as { kind?: string } | null)?.kind);
    if (
      !classroom &&
      (body.classPlan !== undefined || body.startPeriod !== undefined)
    ) {
      return NextResponse.json({ error: "Not a class" }, { status: 400 });
    }
    if (classroom) {
      let plan = parseClassPlan(
        body.classPlan !== undefined
          ? body.classPlan
          : (current as { class_plan?: unknown } | null)?.class_plan
      );
      if (body.startPeriod !== undefined) {
        if (!CLASS_PERIOD_KINDS.includes(body.startPeriod as ClassPeriodKind)) {
          return NextResponse.json(
            { error: "Pick what students can do." },
            { status: 400 }
          );
        }
        plan = startPeriodNow(plan, body.startPeriod as ClassPeriodKind);
      }
      if (body.houseNote !== undefined) {
        const note = String(body.houseNote).trim().slice(0, 800);
        plan.purpose = note || undefined;
      } else if (
        (current as { house_note?: string | null } | null)?.house_note &&
        !plan.purpose
      ) {
        plan.purpose = String(
          (current as { house_note?: string | null }).house_note
        ).trim();
      }
      patch.class_plan = plan;
    }
  }
  let startingCashDelta = 0;
  if (body.startingCash !== undefined) {
    const nextCash = parseStartingCash(body.startingCash);
    if (nextCash == null) {
      return NextResponse.json(
        { error: "Starting cash has to be between $1,000 and $10,000,000." },
        { status: 400 }
      );
    }
    const { data: current } = await supabase
      .from(PORTFELL_TABLES.communities)
      .select("kind, starting_cash")
      .eq("id", id)
      .maybeSingle();
    if (!isClassroomKind((current as { kind?: string } | null)?.kind)) {
      return NextResponse.json({ error: "Not a class" }, { status: 400 });
    }
    const prevCash = Number(
      (current as { starting_cash?: number } | null)?.starting_cash ?? 0
    );
    startingCashDelta = nextCash - prevCash;
    patch.starting_cash = nextCash;
  }
  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { data: community, error } = await supabase
    .from(PORTFELL_TABLES.communities)
    .update(patch)
    .eq("id", id)
    .select("id, name, visibility, kind, starting_cash, house_note, class_plan, created_by, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/communities/[id]") }, { status: 500 });
  }
  if (startingCashDelta !== 0) {
    /*
      The delta is applied by the database, one row at a time, and never
      read into Node and written back.

      This used to select every class sheet's `cash_balance`, add the delta
      here, and write the absolute result. That is the lost update that
      migration 041 and `portfell_apply_cash_delta` were written to remove
      from the trade path, and it was still here: a student who buys
      something between the teacher's read and the teacher's write has that
      trade silently erased, because the write does not know it happened.
      A class is exactly where those overlap, since changing starting cash
      is a thing a teacher does while thirty students are trading.

      The comment this replaces said PostgREST cannot express a
      column-relative delta. That is true of a batch update and not of the
      RPC, which does one row atomically and is what the trade path already
      calls. The round trips are unchanged: one read for the ids, then one
      call per sheet, still concurrent.

      The read is paged because it decides which sheets move at all: a
      short one leaves the students past the cap on the old figure while
      the teacher is told the change went through.

      Permission is unchanged in both directions. The RPC skips its
      co-ownership check for the service-role connection these routes use,
      and demands exactly `portfell_is_portfolio_co_owner` otherwise, which
      is the same predicate the table's own update policy applies to the
      write this replaces.
    */
    const sheets = await readAll<{ id: string }>(() =>
      supabase
        .from(PORTFELL_TABLES.portfolios)
        .select("id")
        .order("id")
        .eq("classroom_community_id", id)
    );
    /*
      A student who cannot absorb the change is a fact the teacher has to be
      told, not one to swallow.

      Lowering the class's starting cash debits every portfolio. A student
      who has already spent most of theirs would go below zero, and the
      floor in portfell_apply_cash_delta refuses that: the RPC's transaction
      rolls back and it answers null. Every one of those was discarded here,
      so the teacher was told the change went through while some of the
      class stayed on the old figure, and the difference shows up later as
      one student inexplicably richer than the rest in the same league.

      The change is not undone for the students it did reach. Rolling back a
      partial adjustment needs a transaction across every portfolio in the
      class, and the honest half-measure is to say exactly who was missed so
      the teacher can lower it in two steps or ask those students to sell.
    */
    const outcomes = await Promise.all(
      sheets.map(async (sheet) => ({
        id: sheet.id,
        ok:
          (await applyPortfolioCashDelta(
            supabase,
            sheet.id,
            startingCashDelta
          )) != null,
      }))
    );
    const refused = outcomes.filter((o) => !o.ok);
    if (refused.length > 0) {
      return NextResponse.json(
        {
          error:
            refused.length === 1
              ? "One student has already spent too much for that change, so their portfolio was left as it was. Everyone else has been moved."
              : `${refused.length} students have already spent too much for that change, so their portfolios were left as they were. Everyone else has been moved.`,
          adjusted: outcomes.length - refused.length,
          refused: refused.length,
        },
        { status: 409 }
      );
    }
  }
  const saved = community as {
    kind?: string;
    class_plan?: unknown;
    house_note?: string | null;
  };
  return NextResponse.json({
    community: {
      ...(community as object),
      classTrade: isClassroomKind(saved.kind)
        ? resolveClassroomTrade(
            parseClassPlan(saved.class_plan),
            new Date(),
            saved.house_note
          )
        : null,
    },
  });
}

/** Admin: delete the community outright. Members lose shared read access;
 * everyone's own portfolios are untouched (only community_members and
 * community_portfolios rows cascade-delete). */
async function handleDELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  if (!(await userIsCommunityAdmin(auth.user.id, id))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const { error } = await supabase
    .from(PORTFELL_TABLES.communities)
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/communities/[id]") }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export const GET = observeRoute(handleGET, '/api/communities/[id]');
export const PATCH = observeRoute(handlePATCH, '/api/communities/[id]');
export const DELETE = observeRoute(handleDELETE, '/api/communities/[id]');
