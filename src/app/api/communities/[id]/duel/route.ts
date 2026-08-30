import { dbError } from "@/lib/db-error";
import { userIsCommunityMember } from "@/lib/auth/ownership";
import {
  currentDuelSessionKey,
  duelCanSettle,
  pickTodaysDuel,
  type DuelPick,
} from "@/lib/daily-duel";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { duelPostSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

type DuelRow = {
  user_id: string;
  ticker_a: string;
  ticker_b: string;
  pick: DuelPick;
};

async function loadCommunityTickers(
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseDataClient>>>,
  communityId: string
): Promise<string[]> {
  const { data: members } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .select("user_id")
    .eq("community_id", communityId);
  const userIds = ((members ?? []) as { user_id: string }[]).map((m) => m.user_id);
  if (userIds.length === 0) return [];

  const { data: ownership } = await supabase
    .from(PORTFELL_TABLES.portfolioOwners)
    .select("portfolio_id")
    .in("user_id", userIds);
  const portfolioIds = [
    ...new Set(
      ((ownership ?? []) as { portfolio_id: string }[]).map((o) => o.portfolio_id)
    ),
  ];
  if (portfolioIds.length === 0) return [];

  const { data: holdings } = await supabase
    .from(PORTFELL_TABLES.holdings)
    .select("ticker")
    .in("portfolio_id", portfolioIds);
  return [
    ...new Set(
      ((holdings ?? []) as { ticker: string }[])
        .map((h) => h.ticker.trim().toUpperCase())
        .filter(Boolean)
    ),
  ];
}

function tally(
  rows: DuelRow[],
  authUserId: string,
  settled: boolean,
  namesById: Map<string, string>
) {
  const counts = { a: 0, b: 0 };
  const names = { a: [] as string[], b: [] as string[] };
  let myPick: DuelPick | null = null;
  for (const row of rows) {
    if (row.pick === "a" || row.pick === "b") {
      counts[row.pick] += 1;
      if (settled) {
        names[row.pick].push(namesById.get(row.user_id) ?? "Someone");
      }
    }
    if (row.user_id === authUserId) myPick = row.pick;
  }
  return { counts, names: settled ? names : undefined, myPick };
}

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

  const dayKey = currentDuelSessionKey();
  const { data: rows, error } = await supabase
    .from(PORTFELL_TABLES.communityDuels)
    .select("user_id, ticker_a, ticker_b, pick")
    .eq("community_id", id)
    .eq("day_key", dayKey);

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/communities/[id]/duel") }, { status: 500 });
  }

  const list = (rows ?? []) as DuelRow[];
  let pair: { a: string; b: string } | null = list[0]
    ? { a: list[0].ticker_a, b: list[0].ticker_b }
    : null;
  if (!pair) {
    const tickers = await loadCommunityTickers(supabase, id);
    pair = pickTodaysDuel(tickers, dayKey, id);
  }

  const settled = duelCanSettle(dayKey);
  const userIds = [...new Set(list.map((r) => r.user_id))];
  const namesById = new Map<string, string>();
  if (settled && userIds.length) {
    const { data: profiles } = await supabase
      .from(PORTFELL_TABLES.profiles)
      .select("id, display_name, email")
      .in("id", userIds);
    for (const p of (profiles ?? []) as {
      id: string;
      display_name: string | null;
      email: string | null;
    }[]) {
      namesById.set(p.id, p.display_name || p.email || "Someone");
    }
  }

  const { counts, names, myPick } = tally(list, auth.user.id, settled, namesById);
  return NextResponse.json({
    dayKey,
    pair,
    myPick,
    counts,
    names,
    settled,
    pickCount: list.length,
  });
}

async function handlePOST(req: NextRequest, ctx: Ctx) {
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

  const parsed = await parseJsonBody(req, duelPostSchema);
  if (!parsed.ok) return parsed.response;
  const pick = parsed.data.pick;

  const dayKey = currentDuelSessionKey();
  const { data: existing } = await supabase
    .from(PORTFELL_TABLES.communityDuels)
    .select("user_id, ticker_a, ticker_b, pick")
    .eq("community_id", id)
    .eq("day_key", dayKey);

  const list = (existing ?? []) as DuelRow[];
  const mine = list.find((r) => r.user_id === auth.user.id);
  if (mine) {
    return NextResponse.json({ ok: true, already: true, pick: mine.pick });
  }

  let pair: { a: string; b: string } | null = list[0]
    ? { a: list[0].ticker_a, b: list[0].ticker_b }
    : null;
  if (!pair) {
    const tickers = await loadCommunityTickers(supabase, id);
    pair = pickTodaysDuel(tickers, dayKey, id);
  }
  if (!pair) {
    return NextResponse.json(
      { error: "Two holdings are needed in the circle before a duel can run" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from(PORTFELL_TABLES.communityDuels).insert({
    community_id: id,
    day_key: dayKey,
    user_id: auth.user.id,
    ticker_a: pair.a,
    ticker_b: pair.b,
    pick,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ ok: true, already: true, pick });
    }
    return NextResponse.json({ error: dbError(error, "/api/communities/[id]/duel") }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pick, pair, dayKey });
}

export const GET = observeRoute(handleGET, '/api/communities/[id]/duel');
export const POST = observeRoute(handlePOST, '/api/communities/[id]/duel');
