import { dbError } from "@/lib/db-error";
import { createHash, randomBytes } from "crypto";
import { userIsCommunityAdmin } from "@/lib/auth/ownership";
import {
  inviteJoinPath,
  renewedExpiry,
  tokenHintFromToken,
} from "@/lib/community-invite-admin";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { communityInvitePatchSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; inviteId: string }> };

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

type InviteSourceRow = {
  id: string;
  email: string | null;
  role: string;
  expires_at: string | null;
  revoked_at: string | null;
};

/**
 * Admin: make a new link in place of this one.
 *
 * There is no GET here any more, and that is the point. This route used to
 * read the raw token back out of the table to show a link a second time,
 * which made the stored hash decorative: anyone who could read the table
 * held every live credential in it. Only the hash is kept now, the same as
 * a portfolio invite, so a link exists exactly once, in the response that
 * made it. An admin who needs to share it again gets a fresh one that keeps
 * the old link's lock, role and expiry, and the old link stops working.
 *
 * The new row is written before the old one is retired. If the second
 * write fails the admin holds two live links for a moment, which costs
 * nothing; the other order could leave them with none.
 */
async function handlePOST(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id, inviteId } = await ctx.params;
  if (!(await userIsCommunityAdmin(auth.user.id, id))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.communityInvites)
    .select("id, email, role, expires_at, revoked_at")
    .eq("id", inviteId)
    .eq("community_id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/communities/[id]/invites/[inviteId]") }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  const old = data as InviteSourceRow;
  const token = randomBytes(24).toString("base64url");
  const { data: created, error: insertError } = await supabase
    .from(PORTFELL_TABLES.communityInvites)
    .insert({
      community_id: id,
      email: old.email,
      token_hash: hashToken(token),
      token_hint: tokenHintFromToken(token),
      role: old.role === "admin" ? "admin" : "member",
      created_by: auth.user.id,
      expires_at: renewedExpiry(old.expires_at),
    })
    .select("id, email, role, expires_at, created_at, token_hint")
    .single();

  if (insertError) {
    return NextResponse.json({ error: dbError(insertError, "/api/communities/[id]/invites/[inviteId]") }, { status: 500 });
  }

  if (!old.revoked_at) {
    const { error: revokeError } = await supabase
      .from(PORTFELL_TABLES.communityInvites)
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", inviteId)
      .eq("community_id", id)
      .is("revoked_at", null);
    if (revokeError) {
      return NextResponse.json({ error: dbError(revokeError, "/api/communities/[id]/invites/[inviteId]") }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    token,
    path: inviteJoinPath(token),
    invite: created,
    replaced: inviteId,
  });
}

/** Admin: retire an invite so new people cannot join with it. */
async function handlePATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id, inviteId } = await ctx.params;
  if (!(await userIsCommunityAdmin(auth.user.id, id))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const parsed = await parseJsonBody(req, communityInvitePatchSchema);
  if (!parsed.ok) return parsed.response;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.communityInvites)
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("community_id", id)
    .is("revoked_at", null)
    .select("id, revoked_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/communities/[id]/invites/[inviteId]") }, { status: 500 });
  }

  if (!data) {
    const { data: existing } = await supabase
      .from(PORTFELL_TABLES.communityInvites)
      .select("id, revoked_at")
      .eq("id", inviteId)
      .eq("community_id", id)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }
  }

  return NextResponse.json({ ok: true });
}

export const POST = observeRoute(handlePOST, '/api/communities/[id]/invites/[inviteId]');
export const PATCH = observeRoute(handlePATCH, '/api/communities/[id]/invites/[inviteId]');
