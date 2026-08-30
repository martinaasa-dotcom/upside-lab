import { dbError } from "@/lib/db-error";
import { createHash } from "crypto";
import { provisionClassroomSheet } from "@/lib/classroom";
import { shareOwnedSheetsIntoCommunity } from "@/lib/community-share";
import { clipInviteName } from "@/lib/invite-landing";
import { clientIp } from "@/lib/rate-limit";
import { takeDurableRateLimit } from "@/lib/rate-limit-durable";
import {
  getSupabaseDataClient,
  getSupabaseServer,
} from "@/lib/supabase/server";
import { createSupabaseServerAuth, requireAuthUser } from "@/lib/supabase/server-auth";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { communityJoinPostSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const TOKEN_RE = /^[A-Za-z0-9_-]{12,128}$/;

/**
 * Public peek for the sign-in page. Token possession is the only gate.
 * Returns the community name and kind, nothing else.
 */
async function handleGET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim() ?? "";
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const ip = clientIp(req);
  const limit = await takeDurableRateLimit(`invite-peek:${ip}`, 30, 5 * 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Try again in a minute." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec ?? 60) } }
    );
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ name: null, kind: "community" });
  }

  const { data: invite } = await supabase
    .from(PORTFELL_TABLES.communityInvites)
    .select("community_id, email, expires_at, accepted_at, revoked_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  const row = invite as {
    community_id?: string;
    email?: string | null;
    expires_at?: string | null;
    accepted_at?: string | null;
    revoked_at?: string | null;
  } | null;

  if (!row?.community_id || row.revoked_at) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  }

  const { data: community } = await supabase
    .from(PORTFELL_TABLES.communities)
    .select("name, kind")
    .eq("id", row.community_id)
    .maybeSingle();

  const meta = community as { name?: string; kind?: string } | null;
  const classroom = meta?.kind === "classroom";
  return NextResponse.json({
    name: clipInviteName(meta?.name),
    kind: classroom ? "classroom" : "community",
  });
}

/**
 * Accept a community invite token.
 *
 * Redemption goes through a security-definer RPC: the redeemer is by
 * definition not a member yet, so membership-based RLS can never authorize
 * this lookup directly. Possessing the valid token is the grant. Open
 * community links stay reusable. An email list locks the link to those
 * people, and they can all use it.
 */
async function handlePOST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const parsed = await parseJsonBody(req, communityJoinPostSchema);
  if (!parsed.ok) return parsed.response;
  const token = parsed.data.token;

  // Cookie-session client, not getSupabaseDataClient() -- this RPC is
  // self-scoped to auth.uid(), which resolves to null (and the RPC just
  // raises "not authenticated") over the service-role client that
  // getSupabaseDataClient() prefers whenever SUPABASE_SERVICE_ROLE_KEY is
  // set, since a service-role connection carries no per-request end-user
  // JWT. The function is still SECURITY DEFINER, so its writes bypass RLS
  // regardless of which client invokes it.
  const supabase = await createSupabaseServerAuth();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc(
    "portfell_redeem_community_invite",
    { p_token_hash: hashToken(token) }
  );

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/communities/join") }, { status: 500 });
  }

  const result = data as { ok: boolean; error?: string; community_id?: string };
  if (!result?.ok) {
    return NextResponse.json(
      { error: result?.error ?? "Invalid invite" },
      { status: 404 }
    );
  }

  const dataClient = await getSupabaseDataClient();
  let name: string | null = null;
  let kind: string | null = null;
  if (dataClient && result.community_id) {
    await provisionClassroomSheet(dataClient, {
      communityId: result.community_id,
      userId: auth.user.id,
    });
    await shareOwnedSheetsIntoCommunity(dataClient, {
      communityId: result.community_id,
      userId: auth.user.id,
    });
    const { data: community } = await dataClient
      .from(PORTFELL_TABLES.communities)
      .select("name, kind")
      .eq("id", result.community_id)
      .maybeSingle();
    name = (community as { name?: string } | null)?.name ?? null;
    kind = (community as { kind?: string } | null)?.kind ?? null;
  }

  return NextResponse.json({
    ok: true,
    communityId: result.community_id,
    name,
    kind,
  });
}

export const GET = observeRoute(handleGET, '/api/communities/join');
export const POST = observeRoute(handlePOST, '/api/communities/join');
