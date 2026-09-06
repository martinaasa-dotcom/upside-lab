import {
  collapseMembersByAlias,
  expandPersonUserIds,
  loadAliasMap,
  type RawMember,
} from "@/lib/auth/identity";
import { userIsCommunityMember } from "@/lib/auth/ownership";
import { isClassroomKind } from "@/lib/classroom";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { readAll } from "@/lib/supabase/read-all";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Full community book: portfolios shown here, opt-out (read-only). */
async function handleGET(req: NextRequest, ctx: Ctx) {
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

  const ownerFilter = req.nextUrl.searchParams.get("ownerId");
  const pendingKey = ownerFilter?.startsWith("pending:")
    ? ownerFilter.slice("pending:".length)
    : null;

  // The alias map doesn't depend on members/pinned, so it rides along
  // instead of costing its own serial round-trip before them.
  /*
    The member list is paged because everything on this page is derived
    from it: the profiles, the ownership, the thesis coverage, and
    `viewerIsAdmin`. A silently short read is not a shorter roster, it is
    an admin who stops being one part way down a large class, and in a
    classroom that is what decides whether cost basis is visible.
  */
  const [aliasMap, members, pinned, { data: communityRow }] =
    await Promise.all([
      loadAliasMap(supabase),
      readAll<{ user_id: string; role?: string; joined_at?: string }>(() =>
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
      supabase
        .from(PORTFELL_TABLES.communities)
        .select("kind")
        .eq("id", id)
        .maybeSingle(),
    ]);
  const classroom = isClassroomKind(
    (communityRow as { kind?: string } | null)?.kind
  );
  // Derived from the members rows already fetched above, so this costs no
  // extra round trip.
  const viewerIsAdmin = (members as { user_id: string; role?: string }[]).some(
    (m) => m.user_id === auth.user.id && m.role === "admin"
  );

  const memberIds = (members as { user_id: string }[]).map(
    (m) => m.user_id
  );

  const profiles = memberIds.length
    ? await readAll<{ id: string }>(() =>
        supabase
          .from(PORTFELL_TABLES.profiles)
          .select("id, email, display_name, avatar_url, bio")
          .order("id")
          .in("id", memberIds)
      )
    : [];

  const profileById = new Map(
    (profiles as { id: string }[]).map((p) => [p.id, p])
  );

  const rawMembers: RawMember[] = (
    members as { user_id: string; role: string; joined_at: string }[]
  ).map((m) => ({
    ...m,
    profile: (profileById.get(m.user_id) as RawMember["profile"]) ?? null,
  }));

  const people = collapseMembersByAlias(rawMembers, auth.user.id, aliasMap);

  let userIds = memberIds;
  let pinnedOnlyIds: string[] | null = null;

  if (pendingKey) {
    userIds = [];
    const pinnedIds = (pinned as { portfolio_id: string }[]).map(
      (p) => p.portfolio_id
    );
    if (pinnedIds.length) {
      const sheets = await readAll<{ id: string; slug: string }>(() =>
        supabase
          .from(PORTFELL_TABLES.portfolios)
          .select("id, slug")
          .order("id")
          .in("id", pinnedIds)
      );
      pinnedOnlyIds = sheets
        .filter((s) => s.slug === pendingKey)
        .map((s) => s.id);
    } else {
      pinnedOnlyIds = [];
    }
  } else if (ownerFilter) {
    const expanded = expandPersonUserIds(ownerFilter, people);
    if (!expanded.some((uid) => memberIds.includes(uid))) {
      return NextResponse.json({ error: "Owner not in community" }, { status: 403 });
    }
    userIds = expanded;
  }

  const sharedIds = (pinned as { portfolio_id: string }[]).map(
    (p) => p.portfolio_id
  );
  const pinnedIdsAll = sharedIds;

  let portfolioIds: string[];
  if (pinnedOnlyIds) {
    portfolioIds = pinnedOnlyIds;
  } else if (ownerFilter) {
    const owned0 = userIds.length
      ? await readAll<{ portfolio_id: string; user_id: string }>(() =>
          supabase
            .from(PORTFELL_TABLES.portfolioOwners)
            .select("portfolio_id, user_id")
            .order("portfolio_id")
            .order("user_id")
            .in("user_id", userIds)
        )
      : [];
    const owned = owned0;
    const shared = new Set(sharedIds);
    portfolioIds = [
      ...new Set(
        (owned as { portfolio_id: string }[])
          .map((o) => o.portfolio_id)
          .filter((id) => shared.has(id))
      ),
    ];
  } else {
    portfolioIds = [...new Set(sharedIds)];
  }

  const ownership = portfolioIds.length
    ? await readAll<{ portfolio_id: string; user_id: string }>(() =>
        supabase
          .from(PORTFELL_TABLES.portfolioOwners)
          .select("portfolio_id, user_id")
          .order("portfolio_id")
          .order("user_id")
          .in("portfolio_id", portfolioIds)
      )
    : [];

  // Sheets and their holdings both key off portfolioIds and don't depend
  // on each other, so they go out together rather than back to back.
  let portfolios: unknown[] = [];
  let holdings: unknown[] = [];
  if (portfolioIds.length) {
    /*
      Both are paged. A community's holdings are every shared portfolio's
      holdings at once, and PostgREST stops at db-max-rows (1,000 by
      default) without saying so. A class of thirty students at twenty-five
      names each is already 750 rows; forty is past the cap. What a
      truncated read produces is not an obviously broken page, it is a
      leaderboard whose values were computed from part of somebody's
      portfolio and are printed as fact beside their name. The `.order`
      makes it worse rather than better: the cut falls across every
      portfolio at once rather than dropping the last one whole.
    */
    const [p, h] = await Promise.all([
      readAll<unknown>(() =>
        supabase
          .from(PORTFELL_TABLES.portfolios)
          .select(
            "id, name, slug, sort_order, cash_balance, owner_id, classroom_community_id"
          )
          .in("id", portfolioIds)
          .order("sort_order")
          .order("id")
      ),
      readAll<unknown>(() =>
        supabase
          .from(PORTFELL_TABLES.holdings)
          .select(
            "id, portfolio_id, ticker, shares, buy_price, eoy_target, target_call_pct, stock_target_override, sort_order"
          )
          .in("portfolio_id", portfolioIds)
          .order("sort_order")
          .order("id")
      ),
    ]);
    portfolios = p;
    // Circles hide cost outright. A class shows it to the **teacher**, and
    // to each student on their own sheet. That was the stated intent ("so
    // the teacher can see what students actually paid"), but the check was
    // on `classroom` alone, so every student saw every classmate's cost
    // basis. Comparing picks is the teaching goal and that works on
    // returns, which stay visible to everyone; what someone paid is theirs.
    const ownIds = new Set(
      (ownership as { portfolio_id: string; user_id: string }[])
        .filter((o) => o.user_id === auth.user.id)
        .map((o) => o.portfolio_id)
    );
    const showAllCost = classroom && viewerIsAdmin;
    holdings = (h as Array<Record<string, unknown>>).map((row) => {
      const own = ownIds.has(String(row.portfolio_id));
      return {
        ...row,
        buy_price: showAllCost || (classroom && own) ? row.buy_price : 0,
      };
    });
  }

  const userToPerson = new Map<string, string>();
  for (const person of people) {
    for (const uid of person.user_ids) {
      userToPerson.set(uid, person.person_id);
    }
  }

  const memberSet = new Set(memberIds);
  const ownershipOut = (
    ownership as { portfolio_id: string; user_id: string }[]
  )
    .filter((o) => memberSet.has(o.user_id))
    .map((o) => ({
      portfolio_id: o.portfolio_id,
      user_id: userToPerson.get(o.user_id) ?? o.user_id,
    }));

  if (!ownerFilter) {
    for (const pid of pinnedIdsAll) {
      const sheet = (portfolios as { id: string; slug: string }[]).find(
        (p) => p.id === pid
      );
      if (!sheet) continue;
      const alreadyOwned = ownershipOut.some((o) => o.portfolio_id === pid);
      if (!alreadyOwned) {
        ownershipOut.push({
          portfolio_id: pid,
          user_id: `pending:${sheet.slug}`,
        });
      }
    }
  } else if (pendingKey && pinnedOnlyIds) {
    for (const pid of pinnedOnlyIds) {
      ownershipOut.push({
        portfolio_id: pid,
        user_id: `pending:${pendingKey}`,
      });
    }
  }

  return NextResponse.json({
    readOnly: true,
    profiles: profiles ?? [],
    portfolios,
    holdings,
    ownership: ownershipOut,
  });
}

export const GET = observeRoute(handleGET, '/api/communities/[id]/book');
