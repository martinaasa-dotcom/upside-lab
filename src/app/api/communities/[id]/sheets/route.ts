import { dbError } from "@/lib/db-error";
import {
  userIsCommunityMember,
  userOwnsPortfolio,
} from "@/lib/auth/ownership";
import { isClassroomKind } from "@/lib/classroom";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { communitySheetsPostSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Sheets the caller owns, and which of them are shared into this circle. */
async function handleGET(_req: NextRequest, ctx: Ctx) {
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

  const { data: owned } = await supabase
    .from(PORTFELL_TABLES.portfolioOwners)
    .select("portfolio_id")
    .eq("user_id", auth.user.id);
  const ids = ((owned ?? []) as { portfolio_id: string }[]).map(
    (r) => r.portfolio_id
  );
  if (ids.length === 0) {
    return NextResponse.json({ sheets: [] });
  }

  const [{ data: community }, { data: portfolios }, { data: shared }] =
    await Promise.all([
      supabase
        .from(PORTFELL_TABLES.communities)
        .select("kind")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from(PORTFELL_TABLES.portfolios)
        .select("id, name, sort_order, classroom_community_id")
        .in("id", ids)
        .order("sort_order"),
      supabase
        .from(PORTFELL_TABLES.communityPortfolios)
        .select("portfolio_id")
        .eq("community_id", id)
        .in("portfolio_id", ids),
    ]);
  const classroom = isClassroomKind(
    (community as { kind?: string } | null)?.kind
  );
  const visible = classroom
    ? ((portfolios ?? []) as {
        id: string;
        name: string;
        classroom_community_id?: string | null;
      }[]).filter((p) => p.classroom_community_id === id)
    : ((portfolios ?? []) as { id: string; name: string }[]);

  const sharedSet = new Set(
    ((shared ?? []) as { portfolio_id: string }[]).map((r) => r.portfolio_id)
  );

  return NextResponse.json({
    sheets: visible.map((p) => ({
      id: p.id,
      name: p.name,
      shared: sharedSet.has(p.id),
    })),
  });
}

async function handlePOST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  if (!(await userIsCommunityMember(auth.user.id, id))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const parsed = await parseJsonBody(req, communitySheetsPostSchema);
  if (!parsed.ok) return parsed.response;
  const portfolioId = parsed.data.portfolioId;
  const body = parsed.data;
  if (!portfolioId) {
    return NextResponse.json({ error: "portfolioId required" }, { status: 400 });
  }
  if (!(await userOwnsPortfolio(auth.user.id, portfolioId))) {
    return NextResponse.json(
      { error: "You can only share a portfolio you own" },
      { status: 403 }
    );
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const [{ data: community }, { data: sheet }] = await Promise.all([
    supabase
      .from(PORTFELL_TABLES.communities)
      .select("kind")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from(PORTFELL_TABLES.portfolios)
      .select("name, classroom_community_id")
      .eq("id", portfolioId)
      .maybeSingle(),
  ]);
  const classroom = isClassroomKind(
    (community as { kind?: string } | null)?.kind
  );
  const classId = (
    sheet as { classroom_community_id?: string | null } | null
  )?.classroom_community_id;
  if (classroom) {
    if (body.shared !== false && classId !== id) {
      return NextResponse.json(
        { error: "This class only shows the paper portfolio you were given." },
        { status: 403 }
      );
    }
    if (body.shared === false && classId === id) {
      return NextResponse.json(
        { error: "Your class portfolio stays in the circle." },
        { status: 400 }
      );
    }
  }
  /*
    The rule above only ran when the target was a class, so a student could
    pin the class's paper portfolio into an ordinary circle and every member
    there would read a homework portfolio as somebody's real one. A class
    portfolio is only ever shown in its own class. The insert policy on
    portfell_community_portfolios says the same (migration
    20260902120000), so a direct PostgREST call is refused too.
  */
  if (body.shared !== false && classId && classId !== id) {
    return NextResponse.json(
      { error: "A class portfolio stays in its class." },
      { status: 403 }
    );
  }

  const share = body.shared !== false;
  if (share) {
    const { error } = await supabase.from(PORTFELL_TABLES.communityPortfolios).insert({
      community_id: id,
      portfolio_id: portfolioId,
      label: (sheet as { name?: string } | null)?.name ?? null,
    });
    if (error && !/duplicate|unique/i.test(error.message)) {
      return NextResponse.json({ error: dbError(error, "/api/communities/[id]/sheets") }, { status: 500 });
    }
  } else {
    const { error } = await supabase
      .from(PORTFELL_TABLES.communityPortfolios)
      .delete()
      .eq("community_id", id)
      .eq("portfolio_id", portfolioId);
    if (error) {
      return NextResponse.json({ error: dbError(error, "/api/communities/[id]/sheets") }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, portfolioId, shared: share });
}

export const GET = observeRoute(handleGET, '/api/communities/[id]/sheets');
export const POST = observeRoute(handlePOST, '/api/communities/[id]/sheets');
