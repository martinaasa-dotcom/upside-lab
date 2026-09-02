import { dbError } from "@/lib/db-error";
import {
  addCoOwnerToPortfolio,
  portfolioCreatorId,
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

/**
 * What the reader is told when a removal is refused. Each is a sentence on
 * its own because the modal shows it under the button that was pressed.
 * (Not exported: a route file may only export handlers and config.)
 */
const OWNER_MESSAGES = {
  creatorStays:
    "The person who made this portfolio stays on it. To be rid of it, delete the portfolio.",
  onlyCreatorRemoves:
    "Only the person who made this portfolio can remove someone else. You can leave it yourself.",
  lastOwner: "Can't remove the last owner. A portfolio needs at least one.",
} as const;

/**
 * List co-owners for a portfolio (caller must be a co-owner). `creatorId`
 * is the person who made it, so the modal can show the remove button only
 * where a press would succeed.
 */
async function handleGET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const notOwner = await requirePortfolioOwner(auth.user.id, id);
  if (notOwner) return notOwner;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ owners: [], creatorId: null });
  }

  const { data: rows, error } = await supabase
    .from(PORTFELL_TABLES.portfolioOwners)
    .select("user_id, created_at")
    .eq("portfolio_id", id);

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/portfolios/[id]/owners") }, { status: 500 });
  }

  const userIds = ((rows ?? []) as { user_id: string }[]).map((r) => r.user_id);
  const [{ data: profiles }, creatorId] = await Promise.all([
    userIds.length
      ? supabase
          .from(PORTFELL_TABLES.profiles)
          .select("id, email, display_name, avatar_url")
          .in("id", userIds)
      : Promise.resolve({ data: [] }),
    portfolioCreatorId(id),
  ]);

  const byId = new Map(
    ((profiles ?? []) as { id: string }[]).map((p) => [p.id, p])
  );

  return NextResponse.json({
    creatorId,
    owners: ((rows ?? []) as { user_id: string; created_at: string }[]).map(
      (r) => ({
        user_id: r.user_id,
        created_at: r.created_at,
        profile: byId.get(r.user_id) ?? null,
      })
    ),
  });
}

/** Add a co-owner by email. Any co-owner may invite; see the DELETE note. */
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

/**
 * Remove a co-owner: yourself, or somebody else if you made the portfolio.
 *
 * This runs on the service role, so row level security does not apply and
 * the rule has to be here. Migration 20260824130000 narrowed the table's
 * own DELETE policy to "your own row" and said nothing in src/ deletes from
 * this table; that was not true, this handler always has, and until this
 * check it let any co-owner remove any other, the person who made the
 * portfolio included. Somebody who redeemed an invite could lock out the
 * person who sent it.
 *
 * So: leaving is always allowed (short of orphaning the portfolio), removing
 * somebody else is the creator's alone, and the creator is never removed.
 * A creator who wants out deletes the portfolio, which is theirs to delete.
 */
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

  const creatorId = await portfolioCreatorId(id);
  if (userId === creatorId) {
    return NextResponse.json(
      { error: OWNER_MESSAGES.creatorStays },
      { status: 403 }
    );
  }
  if (userId !== auth.user.id && auth.user.id !== creatorId) {
    return NextResponse.json(
      { error: OWNER_MESSAGES.onlyCreatorRemoves },
      { status: 403 }
    );
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
      { error: OWNER_MESSAGES.lastOwner },
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
