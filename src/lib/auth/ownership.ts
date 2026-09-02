import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextResponse } from "next/server";

async function db() {
  return getSupabaseDataClient();
}

/** True when user is listed in portfell_portfolio_owners for this sheet. */
export async function userOwnsPortfolio(
  userId: string,
  portfolioId: string
): Promise<boolean> {
  const supabase = await db();
  if (!supabase) return false;
  const { data } = await supabase
    .from(PORTFELL_TABLES.portfolioOwners)
    .select("portfolio_id")
    .eq("portfolio_id", portfolioId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

/** Portfolio ids the user co-owns (My book). */
export async function listOwnedPortfolioIds(
  userId: string
): Promise<string[]> {
  const supabase = await db();
  if (!supabase) return [];
  const { data } = await supabase
    .from(PORTFELL_TABLES.portfolioOwners)
    .select("portfolio_id")
    .eq("user_id", userId);
  return ((data ?? []) as { portfolio_id: string }[]).map((r) => r.portfolio_id);
}

/**
 * The person who made a portfolio.
 *
 * Every co-owner can edit the holdings, and that is the whole point of
 * inviting somebody. Two things stay with the person who made it: deleting
 * the portfolio, and taking somebody else off it. Without that line an
 * invited partner could remove the person who invited them and be left the
 * only owner of a portfolio they did not make, which is a lockout with one
 * request and nothing on screen saying it could happen.
 *
 * `portfell_portfolios.owner_id` names them. A seed row from before that
 * column was always written falls back to the earliest ownership row,
 * which is the first person who claimed it, so the answer is the same
 * whichever way the row was made. Null only when nobody owns it at all.
 */
export async function portfolioCreatorId(
  portfolioId: string
): Promise<string | null> {
  const supabase = await db();
  if (!supabase) return null;
  const { data: sheet } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("owner_id")
    .eq("id", portfolioId)
    .maybeSingle();
  const ownerId = (sheet as { owner_id?: string | null } | null)?.owner_id;
  if (ownerId) return ownerId;
  const { data: first } = await supabase
    .from(PORTFELL_TABLES.portfolioOwners)
    .select("user_id")
    .eq("portfolio_id", portfolioId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (first as { user_id?: string } | null)?.user_id ?? null;
}

export async function requirePortfolioOwner(
  userId: string,
  portfolioId: string | null | undefined
): Promise<NextResponse | null> {
  if (!portfolioId) {
    return NextResponse.json(
      { error: "portfolio_id required" },
      { status: 400 }
    );
  }
  if (!(await userOwnsPortfolio(userId, portfolioId))) {
    return NextResponse.json(
      { error: "You can only edit portfolios you own" },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Add a co-owner by email. Caller must already be a co-owner.
 * Creates a profile stub only if the target has already signed in (has a profile).
 *
 * The email->profile lookup goes through a security-definer RPC on the
 * service-role client. Execute was revoked from authenticated in migration
 * 043 so a stolen user JWT cannot enumerate profiles by email. The insert
 * still goes through the same data client; production always has the
 * service-role key.
 */
export async function addCoOwnerToPortfolio(
  portfolioId: string,
  targetUserEmail: string
): Promise<{ ok: true; userId: string } | { error: string; status: number }> {
  const email = targetUserEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { error: "Valid email required", status: 400 };
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return { error: "Supabase not configured", status: 400 };
  }

  const { data: userId, error: lookupError } = await supabase.rpc(
    "portfell_lookup_profile_id_by_email",
    { p_email: email }
  );

  if (lookupError) {
    return { error: lookupError.message, status: 500 };
  }
  if (!userId) {
    return {
      error:
        "No Upside Lab profile for that email yet. They need to sign in first.",
      status: 404,
    };
  }

  const { error } = await supabase.from(PORTFELL_TABLES.portfolioOwners).upsert(
    {
      portfolio_id: portfolioId,
      user_id: userId as string,
    },
    { onConflict: "portfolio_id,user_id" }
  );

  if (error) {
    return { error: error.message, status: 500 };
  }

  return { ok: true, userId: userId as string };
}

/**
 * Which of these communities the user is an admin of, in one round trip.
 *
 * Callers resolving a set of communities were mapping userIsCommunityAdmin over
 * the list inside Promise.all, which is one query per community. Concurrency
 * hides it at three classrooms and stops hiding it well before thirty.
 */
export async function communityAdminFlags(
  userId: string,
  communityIds: string[]
): Promise<Set<string>> {
  const ids = [...new Set(communityIds.filter(Boolean))];
  if (ids.length === 0) return new Set();
  const supabase = await db();
  if (!supabase) return new Set();
  const { data } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .select("community_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .in("community_id", ids);
  return new Set(
    ((data ?? []) as { community_id: string }[]).map((r) => r.community_id)
  );
}

export async function userIsCommunityAdmin(
  userId: string,
  communityId: string
): Promise<boolean> {
  const supabase = await db();
  if (!supabase) return false;
  const { data } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .select("role")
    .eq("community_id", communityId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { role?: string } | null)?.role === "admin";
}

export async function userIsCommunityMember(
  userId: string,
  communityId: string
): Promise<boolean> {
  const supabase = await db();
  if (!supabase) return false;
  const { data } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .select("user_id")
    .eq("community_id", communityId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}
