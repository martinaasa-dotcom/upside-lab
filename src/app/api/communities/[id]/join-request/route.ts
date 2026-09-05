import { dbError } from "@/lib/db-error";
import {
  userIsCommunityAdmin,
  userIsCommunityMember,
} from "@/lib/auth/ownership";
import { admitToCommunity } from "@/lib/community-join";
import { parseSharePortfolioIds } from "@/lib/community-share";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { joinRequestPatchSchema, joinRequestPostSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Ask to join a PUBLIC community. Re-requesting after a rejection resets
 * the same row to pending rather than erroring on the unique constraint.
 *
 * Whether the asking is also the joining is the circle's own setting
 * (`auto_approve_joins`, on by default for a public circle): a door
 * marked public and then bolted only delays people, since the admin
 * approves whenever they next happen to look. An admin who wants to meet
 * everybody first turns it off in Settings and the request waits for
 * them, exactly as it always did. A private community is refused above
 * before any of this is read, so an invite is still the only way into
 * one, and a class is always private.
 */
async function handlePOST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const { data: community } = await supabase
    .from(PORTFELL_TABLES.communities)
    .select("id, visibility, auto_approve_joins")
    .eq("id", id)
    .maybeSingle();
  // A nonexistent id and a real private community both fail the same way —
  // a 404-vs-403 split here would let anyone who merely holds a private
  // community's id (a pasted link, a screenshot) confirm it exists at all,
  // even though they were never told its name or shown it anywhere.
  if (!community || (community as { visibility?: string }).visibility !== "public") {
    return NextResponse.json(
      { error: "This community is invite-only" },
      { status: 403 }
    );
  }

  if (await userIsCommunityMember(auth.user.id, id)) {
    return NextResponse.json({ error: "Already a member" }, { status: 400 });
  }

  const parsed = await parseJsonBody(req, joinRequestPostSchema);
  if (!parsed.ok) return parsed.response;
  const shareIds = parseSharePortfolioIds(parsed.data.portfolioIds);

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.communityJoinRequests)
    .upsert(
      {
        community_id: id,
        user_id: auth.user.id,
        status: "pending",
        requested_at: new Date().toISOString(),
        decided_at: null,
        decided_by: null,
        share_portfolio_ids: shareIds,
      },
      { onConflict: "community_id,user_id" }
    )
    .select("id, status, requested_at")
    .single();

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/communities/[id]/join-request") }, { status: 500 });
  }

  const autoApprove =
    (community as { auto_approve_joins?: boolean }).auto_approve_joins !== false;
  if (autoApprove) {
    // Decided by the person who asked, because nobody else was involved:
    // the circle said in advance that asking is enough.
    const admitted = await admitToCommunity(supabase, {
      communityId: id,
      userId: auth.user.id,
      sharePortfolioIds: shareIds,
      decidedBy: auth.user.id,
    });
    if (admitted.error) {
      return NextResponse.json(
        {
          error: dbError(
            admitted.error,
            "/api/communities/[id]/join-request"
          ),
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ request: data, joined: true });
  }

  return NextResponse.json({ request: data, joined: false });
}

/** Cancel your own pending request. */
async function handleDELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const { error } = await supabase
    .from(PORTFELL_TABLES.communityJoinRequests)
    .delete()
    .eq("community_id", id)
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/communities/[id]/join-request") }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Admin: approve or reject a pending request. */
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

  const parsed = await parseJsonBody(req, joinRequestPatchSchema);
  if (!parsed.ok) return parsed.response;
  const targetUserId = parsed.data.userId;
  const body = parsed.data;

  const { data: request } = await supabase
    .from(PORTFELL_TABLES.communityJoinRequests)
    .select("id, status, share_portfolio_ids")
    .eq("community_id", id)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (!request || (request as { status?: string }).status !== "pending") {
    return NextResponse.json({ error: "No pending request" }, { status: 404 });
  }

  if (body.decision === "approve") {
    const picked = (request as { share_portfolio_ids?: string[] | null })
      .share_portfolio_ids;
    const admitted = await admitToCommunity(supabase, {
      communityId: id,
      userId: targetUserId,
      sharePortfolioIds: picked ?? null,
      decidedBy: auth.user.id,
    });
    if (admitted.error) {
      return NextResponse.json(
        { error: dbError(admitted.error, "/api/communities/[id]/join-request") },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase
    .from(PORTFELL_TABLES.communityJoinRequests)
    .update({
      status: "rejected",
      decided_at: new Date().toISOString(),
      decided_by: auth.user.id,
    })
    .eq("community_id", id)
    .eq("user_id", targetUserId);

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/communities/[id]/join-request") }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export const POST = observeRoute(handlePOST, '/api/communities/[id]/join-request');
export const PATCH = observeRoute(handlePATCH, '/api/communities/[id]/join-request');
export const DELETE = observeRoute(handleDELETE, '/api/communities/[id]/join-request');
