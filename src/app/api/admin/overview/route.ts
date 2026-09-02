import { dbError } from "@/lib/db-error";
import { isSuperadminEmail } from "@/lib/auth/superadmin";
import { funnelFromUsers, type AdminFunnel } from "@/lib/admin-funnel";
import {
  createSupabaseServerAuth,
  requireAuthUser,
} from "@/lib/supabase/server-auth";
import {
  getSupabaseServer,
  supabaseUsesServiceRole,
} from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { readAll } from "@/lib/supabase/read-all";
import { NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const dynamic = "force-dynamic";

type OverviewUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  profile_created_at: string | null;
  profile_updated_at: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  last_sign_in_at: string | null;
  last_advisor_at: string | null;
  email_confirmed_at: string | null;
  portfolios: { id: string; name: string }[];
  holding_count: number;
};

type OverviewMember = {
  user_id: string;
  role: string;
  joined_at: string | null;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type OverviewCommunity = {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  member_count: number;
  members: OverviewMember[];
};

async function loadViaServiceRole(): Promise<{
  users: OverviewUser[];
  communities: OverviewCommunity[];
  funnel: AdminFunnel;
}> {
  const supabase = getSupabaseServer();
  if (!supabase) {
    throw new Error("Supabase not configured");
  }

  /*
    Six reads of the whole project, so all six page.

    This is the one screen whose entire job is to say how many, and it had
    the failure that is hardest to notice on exactly that kind of screen: a
    silent cap does not produce an error or a blank, it produces a smaller
    number in a box that looks the same. The holdings read reaches the cap
    first, being every holding in the project, and it is also the one whose
    truncation is least visible, since it only ever becomes a per-portfolio
    count. `"throw"` throughout, matching what this route already does with
    a failed read: a wrong figure on an admin dashboard is worse than a
    page that says it could not load.
  */
  const profiles = await readAll<unknown>(
    () =>
      supabase
        .from(PORTFELL_TABLES.profiles)
        // `subscription_status` so the funnel can reach revenue. The Stripe
        // webhook is the only writer of it, so this is Stripe's own answer.
        .select(
          "id, email, display_name, avatar_url, bio, created_at, updated_at, last_advisor_at, subscription_status, current_period_end"
        )
        .order("created_at", { ascending: false })
        .order("id"),
    "throw"
  );

  const communities = await readAll<unknown>(
    () =>
      supabase
        .from(PORTFELL_TABLES.communities)
        .select("id, name, created_by, created_at, updated_at")
        .order("name")
        .order("id"),
    "throw"
  );

  const members = await readAll<unknown>(
    () =>
      supabase
        .from(PORTFELL_TABLES.communityMembers)
        .select("community_id, user_id, role, joined_at")
        .order("community_id")
        .order("user_id"),
    "throw"
  );

  // Portfolio ownership, surfaced per-user so a "0 portfolios" profile
  // (like the Rasmus seed-claim bug) is visible here instead of requiring
  // a manual SQL query every time someone reports a login issue.
  const ownerRows = await readAll<unknown>(
    () =>
      supabase
        .from(PORTFELL_TABLES.portfolioOwners)
        .select("user_id, portfolio_id")
        .order("portfolio_id")
        .order("user_id"),
    "throw"
  );

  const portfolioRows = await readAll<unknown>(
    () => supabase.from(PORTFELL_TABLES.portfolios).select("id, name")
    .order("id"),
    "throw"
  );

  const holdingRows = await readAll<{ portfolio_id: string }>(
    () => supabase.from(PORTFELL_TABLES.holdings).select("portfolio_id")
    .order("id"),
    "throw"
  );

  const holdingsByPortfolio = new Map<string, number>();
  for (const row of holdingRows) {
    holdingsByPortfolio.set(
      row.portfolio_id,
      (holdingsByPortfolio.get(row.portfolio_id) ?? 0) + 1
    );
  }

  const portfolioNameById = new Map(
    ((portfolioRows ?? []) as { id: string; name: string }[]).map((p) => [
      p.id,
      p.name,
    ])
  );
  const portfoliosByUser = new Map<string, { id: string; name: string }[]>();
  for (const row of (ownerRows ?? []) as {
    user_id: string;
    portfolio_id: string;
  }[]) {
    const name = portfolioNameById.get(row.portfolio_id);
    if (!name) continue;
    const list = portfoliosByUser.get(row.user_id) ?? [];
    list.push({ id: row.portfolio_id, name });
    portfoliosByUser.set(row.user_id, list);
  }
  for (const list of portfoliosByUser.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const profileById = new Map(
    ((profiles ?? []) as {
      id: string;
      email: string | null;
      display_name: string | null;
      avatar_url: string | null;
    }[]).map((p) => [p.id, p])
  );

  // last_sign_in lives in auth.users — best-effort via admin API when service role.
  const signInById = new Map<string, string | null>();
  try {
    const { data: authList } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    });
    for (const u of authList?.users ?? []) {
      signInById.set(u.id, u.last_sign_in_at ?? null);
    }
  } catch {
    /* ignore — profiles still useful */
  }

  const users: OverviewUser[] = ((profiles ?? []) as {
    id: string;
    email: string | null;
    display_name: string | null;
    avatar_url: string | null;
    bio: string | null;
    created_at: string | null;
    updated_at: string | null;
    last_advisor_at: string | null;
    subscription_status: string | null;
    current_period_end: string | null;
  }[]).map((p) => ({
    id: p.id,
    email: p.email,
    display_name: p.display_name,
    avatar_url: p.avatar_url,
    bio: p.bio,
    profile_created_at: p.created_at,
    profile_updated_at: p.updated_at,
    subscription_status: p.subscription_status,
    current_period_end: p.current_period_end,
    last_sign_in_at: signInById.get(p.id) ?? null,
    last_advisor_at: p.last_advisor_at,
    email_confirmed_at: null,
    portfolios: portfoliosByUser.get(p.id) ?? [],
    holding_count: (portfoliosByUser.get(p.id) ?? []).reduce(
      (n, sheet) => n + (holdingsByPortfolio.get(sheet.id) ?? 0),
      0
    ),
  }));

  users.sort((a, b) => {
    const ta = a.last_sign_in_at ?? a.profile_created_at ?? "";
    const tb = b.last_sign_in_at ?? b.profile_created_at ?? "";
    return tb.localeCompare(ta);
  });

  const membersByCommunity = new Map<string, OverviewMember[]>();
  for (const row of (members ?? []) as {
    community_id: string;
    user_id: string;
    role: string;
    joined_at: string | null;
  }[]) {
    const pr = profileById.get(row.user_id);
    const list = membersByCommunity.get(row.community_id) ?? [];
    list.push({
      user_id: row.user_id,
      role: row.role,
      joined_at: row.joined_at,
      email: pr?.email ?? null,
      display_name: pr?.display_name ?? null,
      avatar_url: pr?.avatar_url ?? null,
    });
    membersByCommunity.set(row.community_id, list);
  }

  const communityRows: OverviewCommunity[] = (
    (communities ?? []) as {
      id: string;
      name: string;
      created_by: string | null;
      created_at: string | null;
      updated_at: string | null;
    }[]
  ).map((c) => {
    const mem = (membersByCommunity.get(c.id) ?? []).slice().sort((a, b) => {
      if (a.role === "admin" && b.role !== "admin") return -1;
      if (b.role === "admin" && a.role !== "admin") return 1;
      return (a.display_name ?? a.email ?? "").localeCompare(
        b.display_name ?? b.email ?? ""
      );
    });
    return {
      id: c.id,
      name: c.name,
      created_by: c.created_by,
      created_at: c.created_at,
      updated_at: c.updated_at,
      member_count: mem.length,
      members: mem,
    };
  });

  return { users, communities: communityRows, funnel: funnelFromUsers(users) };
}

async function handleGET() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  if (!isSuperadminEmail(auth.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    if (supabaseUsesServiceRole()) {
      const overview = await loadViaServiceRole();
      return NextResponse.json(overview);
    }

    const supabase = await createSupabaseServerAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase not configured" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("portfell_superadmin_overview");
    if (error) {
      return NextResponse.json({ error: dbError(error, "/api/admin/overview") }, { status: 500 });
    }

    const payload = (data ?? {}) as {
      users?: OverviewUser[];
      communities?: OverviewCommunity[];
    };

    return NextResponse.json({
      users: payload.users ?? [],
      communities: payload.communities ?? [],
      funnel: funnelFromUsers(payload.users ?? []),
    });
  } catch (e) {
    return NextResponse.json(
      { error: dbError(e, "GET /api/admin/overview: load overview") },
      { status: 500 }
    );
  }
}

export const GET = observeRoute(handleGET, '/api/admin/overview');
