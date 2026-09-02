import { dbError } from "@/lib/db-error";
import { userIsCommunityMember } from "@/lib/auth/ownership";
import {
  currentDuelSessionKey,
  duelDayPct,
  duelStreak,
  duelWinnerSide,
  pickTodaysDuel,
  recentDuelSessionKeys,
  type DuelPick,
} from "@/lib/daily-duel";
import { fetchQuotesWithFallback } from "@/lib/market/quotes";
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
  day_key: string;
  ticker_a: string;
  ticker_b: string;
  pick: DuelPick;
};

/**
 * How far back a result is worth resolving.
 *
 * A quote carries about fifteen dated closes, which is the ceiling on how
 * many past sessions can be settled without asking a provider for anything
 * extra, so a streak is counted over ten and stops there rather than
 * pretending to know about a fortnight ago.
 */
const STREAK_DEPTH = 10;

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

function tally(rows: DuelRow[], authUserId: string) {
  const counts = { a: 0, b: 0 };
  let myPick: DuelPick | null = null;
  for (const row of rows) {
    if (row.pick === "a" || row.pick === "b") counts[row.pick] += 1;
    if (row.user_id === authUserId) myPick = row.pick;
  }
  return { counts, myPick };
}

async function namesById(
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseDataClient>>>,
  userIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (userIds.length === 0) return out;
  const { data: profiles } = await supabase
    .from(PORTFELL_TABLES.profiles)
    .select("id, display_name, email")
    .in("id", userIds);
  for (const p of (profiles ?? []) as {
    id: string;
    display_name: string | null;
    email: string | null;
  }[]) {
    out.set(p.id, p.display_name || p.email || "Someone");
  }
  return out;
}

/**
 * The circle's only game could never end.
 *
 * `currentDuelSessionKey` returns a session whose close is still ahead, by
 * construction, and this route used to decide "is the result in" by asking
 * `duelCanSettle` about that very key. It is false every time, so the card
 * said "Results come after the US close" forever, and at 16:00 the key
 * rolled to the next day and the picks everybody had made were never read
 * again. Nobody in a circle ever saw who won.
 *
 * So a GET answers with two duels. The live one, which is the same as it
 * always was and reveals nothing, and the last closed one, resolved from
 * the dated closes the quote already carries: who won, who called it, and
 * how many in a row the reader has now got right.
 */
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
  const closedKeys = recentDuelSessionKeys(STREAK_DEPTH);
  const oldest = closedKeys[closedKeys.length - 1] ?? dayKey;

  const { data: rows, error } = await supabase
    .from(PORTFELL_TABLES.communityDuels)
    .select("user_id, day_key, ticker_a, ticker_b, pick")
    .eq("community_id", id)
    .gte("day_key", oldest);

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/communities/[id]/duel") }, { status: 500 });
  }

  const all = (rows ?? []) as DuelRow[];
  const live = all.filter((r) => r.day_key === dayKey);
  let pair: { a: string; b: string } | null = live[0]
    ? { a: live[0].ticker_a, b: live[0].ticker_b }
    : null;
  if (!pair) {
    const tickers = await loadCommunityTickers(supabase, id);
    pair = pickTodaysDuel(tickers, dayKey, id);
  }

  const { counts, myPick } = tally(live, auth.user.id);

  // Every company that has been in a duel over the window, in one provider
  // walk. `dailyCloses` is dated, so one call settles every past session.
  const pastRows = all.filter((r) => r.day_key !== dayKey);
  const pastTickers = [
    ...new Set(pastRows.flatMap((r) => [r.ticker_a, r.ticker_b])),
  ];
  const closesByTicker = new Map<string, { date: string; close: number }[]>();
  if (pastTickers.length > 0) {
    try {
      const quotes = await fetchQuotesWithFallback(pastTickers);
      for (const [ticker, quote] of Object.entries(quotes.quotes)) {
        if (quote.dailyCloses?.length) {
          closesByTicker.set(ticker.toUpperCase(), quote.dailyCloses);
        }
      }
    } catch {
      // A provider having a bad minute costs the result strip, not the
      // whole card. Everything below simply resolves to null.
    }
  }

  type Settled = {
    dayKey: string;
    pair: { a: string; b: string };
    counts: { a: number; b: number };
    pctA: number | null;
    pctB: number | null;
    winner: DuelPick | "tie" | null;
    myPick: DuelPick | null;
    calledIt: string[];
  };

  const profileNames = await namesById(
    supabase,
    [...new Set(pastRows.map((r) => r.user_id))]
  );

  const settledSessions: Settled[] = [];
  for (const key of closedKeys) {
    const session = pastRows.filter((r) => r.day_key === key);
    const first = session[0];
    if (!first) continue;
    const sessionPair = { a: first.ticker_a, b: first.ticker_b };
    const pctA = duelDayPct(closesByTicker.get(sessionPair.a), key);
    const pctB = duelDayPct(closesByTicker.get(sessionPair.b), key);
    const winner = duelWinnerSide(pctA, pctB);
    const sessionCounts = { a: 0, b: 0 };
    let mine: DuelPick | null = null;
    const calledIt: string[] = [];
    for (const row of session) {
      if (row.pick === "a" || row.pick === "b") sessionCounts[row.pick] += 1;
      if (row.user_id === auth.user.id) mine = row.pick;
      if (winner && winner !== "tie" && row.pick === winner) {
        calledIt.push(profileNames.get(row.user_id) ?? "Someone");
      }
    }
    settledSessions.push({
      dayKey: key,
      pair: sessionPair,
      counts: sessionCounts,
      pctA,
      pctB,
      winner,
      myPick: mine,
      calledIt,
    });
  }

  const previous = settledSessions.find((s) => s.winner != null) ?? null;
  const streak = duelStreak(
    settledSessions.map((s) => ({ myPick: s.myPick, winner: s.winner }))
  );

  return NextResponse.json({
    dayKey,
    pair,
    myPick,
    counts,
    settled: false,
    pickCount: live.length,
    previous,
    streak,
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
    .select("user_id, day_key, ticker_a, ticker_b, pick")
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
