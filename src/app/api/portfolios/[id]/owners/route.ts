import { dbError } from "@/lib/db-error";
import {
  addCoOwnerToPortfolio,
  requirePortfolioOwner,
} from "@/lib/auth/ownership";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { portfolioOwnerPostSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** List co-owners for a portfolio (caller must be a co-owner). */
async function handleGET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const notOwner = await requirePortfolioOwner(auth.user.id, id);
  if (notOwner) return notOwner;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ owners: [] });
  }

  const { data: rows, error } = await supabase
    .from(PORTFELL_TABLES.portfolioOwners)
    .select("user_id, created_at")
    .eq("portfolio_id", id);

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/portfolios/[id]/owners") }, { status: 500 });
  }

  const userIds = ((rows ?? []) as { user_id: string }[]).map((r) => r.user_id);
  const { data: profiles } = userIds.length
    ? await supabase
        .from(PORTFELL_TABLES.profiles)
        .select("id, email, display_name, avatar_url")
        .in("id", userIds)
    : { data: [] };

  const byId = new Map(
    ((profiles ?? []) as { id: string }[]).map((p) => [p.id, p])
  );

  return NextResponse.json({
    owners: ((rows ?? []) as { user_id: string; created_at: string }[]).map(
      (r) => ({
        user_id: r.user_id,
        created_at: r.created_at,
        profile: byId.get(r.user_id) ?? null,
      })
    ),
  });
}

/** Add a co-owner by email. */
async function handlePOST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const notOwner = await requirePortfolioOwner(auth.user.id, id);
  if (notOwner) return notOwner;

  const parsed = await parseJsonBody(req, portfolioOwnerPostSchema);
  if (!parsed.ok) return parsed.response;
  const email = parsed.data.email;
  const result = await addCoOwnerToPortfolio(id, email);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }
  return NextResponse.json({ ok: true, userId: result.userId });
}

/** Remove a co-owner (self or another owner). Refuses to orphan a portfolio. */
async function handleDELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const notOwner = await requirePortfolioOwner(auth.user.id, id);
  if (notOwner) return notOwner;

  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { count } = await supabase
    .from(PORTFELL_TABLES.portfolioOwners)
    .select("user_id", { count: "exact", head: true })
    .eq("portfolio_id", id);
  if ((count ?? 0) <= 1) {
    return NextResponse.json(
      { error: "Can't remove the last owner. A portfolio needs at least one." },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from(PORTFELL_TABLES.portfolioOwners)
    .delete()
    .eq("portfolio_id", id)
    .eq("user_id", userId);
  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/portfolios/[id]/owners") }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export const GET = observeRoute(handleGET, '/api/portfolios/[id]/owners');
export const POST = observeRoute(handlePOST, '/api/portfolios/[id]/owners');
export const DELETE = observeRoute(handleDELETE, '/api/portfolios/[id]/owners');
