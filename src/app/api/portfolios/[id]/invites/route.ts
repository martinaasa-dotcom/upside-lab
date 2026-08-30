import { dbError } from "@/lib/db-error";
import { createHash, randomBytes } from "crypto";
import { requirePortfolioOwner } from "@/lib/auth/ownership";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { portfolioInvitePostSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** List open co-owner invites for a portfolio. */
async function handleGET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const notOwner = await requirePortfolioOwner(auth.user.id, id);
  if (notOwner) return notOwner;

  const supabase = await getSupabaseDataClient();
  if (!supabase) return NextResponse.json({ invites: [] });

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.portfolioInvites)
    .select("id, email, expires_at, accepted_at, revoked_at, created_at")
    .eq("portfolio_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/portfolios/[id]/invites") }, { status: 500 });
  }

  return NextResponse.json({ invites: data ?? [] });
}

/**
 * Mint a co-owner invite code/link for a sheet.
 * Optional email locks the invite to that address once they sign in.
 */
async function handlePOST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const notOwner = await requirePortfolioOwner(auth.user.id, id);
  if (notOwner) return notOwner;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const parsed = await parseJsonBody(req, portfolioInvitePostSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const token = randomBytes(18).toString("base64url");
  const days = Math.min(90, Math.max(1, Number(body.daysValid ?? 14)));
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  const email = body.email?.trim().toLowerCase() || null;

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.portfolioInvites)
    .insert({
      portfolio_id: id,
      token_hash: hashToken(token),
      email,
      created_by: auth.user.id,
      expires_at: expiresAt,
    })
    .select("id, email, expires_at, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/portfolios/[id]/invites") }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    token,
    code: token,
    path: `/account/join?code=${token}`,
    invite: data,
  });
}

export const GET = observeRoute(handleGET, '/api/portfolios/[id]/invites');
export const POST = observeRoute(handlePOST, '/api/portfolios/[id]/invites');
