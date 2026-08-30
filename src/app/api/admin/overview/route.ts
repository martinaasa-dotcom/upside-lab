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

  const { data: profiles, error: pErr } = await supabase
    .from(PORTFELL_TABLES.profiles)
    // `subscription_status` so the funnel can reach revenue. The Stripe
    // webhook is the only writer of it, so this is Stripe's own answer.
    .select(
      "id, email, display_name, avatar_url, bio, created_at, updated_at, last_advisor_at, subscription_status, current_period_end"
    )
    .order("created_at", { ascending: false });
  if (pErr) throw new Error(pErr.message);

  const { data: communities, error: cErr } = await supabase
    .from(PORTFELL_TABLES.communities)
    .select("id, name, created_by, created_at, updated_at")
    .order("name");
  if (cErr) throw new Error(cErr.message);

  const { data: members, error: mErr } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .select("community_id, user_id, role, joined_at");
  if (mErr) throw new Error(mErr.message);

  // Portfolio ownership — surfaced per-user so a "0 portfolios" profile
  // (like the Rasmus seed-claim bug) is visible here instead of requiring
  // a manual SQL query every time someone reports a login issue.
  const { data: ownerRows, error: oErr } = await supabase
    .from(PORTFELL_TABLES.portfolioOwners)
    .select("user_id, portfolio_id");
  if (oErr) throw new Error(oErr.message);

  const { data: portfolioRows, error: pfErr } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("id, name");
  if (pfErr) throw new Error(pfErr.message);

  const { data: holdingRows, error: hErr } = await supabase
    .from(PORTFELL_TABLES.holdings)
    .select("portfolio_id");
  if (hErr) throw new Error(hErr.message);

  const holdingsByPortfolio = new Map<string, number>();
  for (const row of (holdingRows ?? []) as { portfolio_id: string }[]) {
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
      { error: e instanceof Error ? e.message : "Failed to load admin overview" },
      { status: 500 }
    );
  }
}

export const GET = observeRoute(handleGET, '/api/admin/overview');
