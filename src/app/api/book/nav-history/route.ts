import { listOwnedPortfolioIds } from "@/lib/auth/ownership";
import { ownedBookPortfolios } from "@/lib/classroom";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import {
  NIGHTLY_SNAPSHOT_WINDOW,
  type BookSnapshotPayload,
} from "@/lib/book-snapshot";
import {
  reconstructAssumedNav,
} from "@/lib/market/assumed-nav";
import { fetchYtdDailyCloses } from "@/lib/market/yahoo";
import { NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { navHistoryPostSchema } from "@/lib/api-schemas";
import { takeDurableRateLimit } from "@/lib/rate-limit-durable";
import { clientIp, rateLimitJson } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_TICKERS = 24;
/*
  Signed out, the same line is drawn from fewer names and on a budget. Ten
  covers a sample portfolio and any ordinary one somebody is looking around
  with; the budget is per address and shared with nobody, so a stranger
  cannot spend the provider's goodwill on behalf of the readers who own
  something.
*/
const ANON_MAX_TICKERS = 10;
const ANON_REQUESTS_PER_WINDOW = 20;
const ANON_WINDOW_MS = 10 * 60_000;

type NavPoint = { date: string; nav: number };

async function snapshotPointsForUser(
  userId: string,
  onlyIds?: string[]
): Promise<{ points: NavPoint[]; firstRealDate: string | null }> {
  const owned = await listOwnedPortfolioIds(userId);
  const allowed = onlyIds?.length
    ? owned.filter((id) => onlyIds.includes(id))
    : owned;
  if (allowed.length === 0) return { points: [], firstRealDate: null };
  const supabase = await getSupabaseDataClient();
  if (!supabase) return { points: [], firstRealDate: null };
  const { data: sheets } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("id, classroom_community_id")
    .in("id", allowed);
  const scoped = ownedBookPortfolios(
    ((sheets ?? []) as {
      id: string;
      classroom_community_id?: string | null;
    }[]).filter((p) => allowed.includes(p.id))
  );
  const ownedSet = new Set(scoped.map((p) => p.id));
  if (ownedSet.size === 0) return { points: [], firstRealDate: null };

  // Newest first, then reversed for the chart. Ascending + limit took the
  // *oldest* N nightly rows in the table, and since one nightly row covers
  // every user's book, that meant the chart would silently freeze on ancient
  // history the moment retention exceeded the limit. Bounded by the same
  // constant that governs retention so the two can't drift apart.
  const { data, error } = await supabase
    .from(PORTFELL_TABLES.snapshots)
    .select("created_at, payload")
    .eq("kind", "nightly")
    .order("created_at", { ascending: false })
    .limit(NIGHTLY_SNAPSHOT_WINDOW);

  if (error) return { points: [], firstRealDate: null };

  const points: NavPoint[] = [];
  for (const row of [...(data ?? [])].reverse()) {
    const payload = row.payload as BookSnapshotPayload | null;
    const marks = payload?.marks;
    if (!marks?.navByPortfolio) continue;
    let nav = 0;
    let hit = false;
    for (const [id, value] of Object.entries(marks.navByPortfolio)) {
      if (!ownedSet.has(id)) continue;
      hit = true;
      nav += Number(value) || 0;
    }
    if (!hit) continue;
    points.push({
      date: String(row.created_at).slice(0, 10),
      nav,
    });
  }

  return {
    points,
    firstRealDate: points[0]?.date ?? null,
  };
}

/**
 * Book NAV over time. Default is an assumed YTD path: current share counts
 * × each name's daily close since Jan 1, plus cash as it sits today.
 * Pass assumed=false to keep only nights we actually recorded.
 */
async function handleGET() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;
  const snaps = await snapshotPointsForUser(auth.user.id);
  return NextResponse.json({
    points: snaps.points,
    assumed: false,
    firstRealDate: snaps.firstRealDate,
  });
}

async function handlePOST(req: Request) {
  /*
    Two halves with two different answers to "who may ask".

    The recorded nights are somebody's own saved copies, so reading them
    needs their session and always did. The assumed line is arithmetic over
    a year of public closing prices for tickers the caller names, and that
    used to be free to anyone who found the address: a year of history for
    up to MAX_TICKERS names, with only the proxy's per-address ceiling in
    front of it. It is bounded rather than closed, because a reader looking
    around with a sample portfolio has no session and the line is the same
    public data a chart on any finance site shows. Signed out, the request
    costs a durable budget and carries fewer names.
  */
  const auth = await requireAuthUser();
  const signedIn = !("error" in auth);

  if (!signedIn) {
    const gate = await takeDurableRateLimit(
      `nav-history:${clientIp(req)}`,
      ANON_REQUESTS_PER_WINDOW,
      ANON_WINDOW_MS
    );
    if (!gate.ok) {
      return rateLimitJson(
        gate,
        "That is a lot of chart in a short time. Try again in a few minutes."
      );
    }
  }

  const parsed = await parseJsonBody(req, navHistoryPostSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const assumed = body.assumed !== false;
  const onlyIds = Array.isArray(body.portfolioIds)
    ? body.portfolioIds.map((id) => String(id)).filter(Boolean)
    : undefined;
  const snaps = signedIn
    ? await snapshotPointsForUser(auth.user.id, onlyIds)
    : { points: [] as NavPoint[], firstRealDate: null };

  if (!assumed) {
    let spyPoints: NavPoint[] | undefined;
    if (body.includeSpy) {
      const spyCloses = await fetchYtdDailyCloses(["SPY"]);
      const spyPath = reconstructAssumedNav(
        0,
        [{ ticker: "SPY", shares: 1 }],
        spyCloses
      );
      if (spyPath.length >= 2) spyPoints = spyPath;
    }
    return NextResponse.json({
      points: snaps.points,
      assumed: false,
      firstRealDate: snaps.firstRealDate,
      spyPoints,
    });
  }

  const cash = Number(body.cash ?? 0);
  const rawPositions = Array.isArray(body.positions) ? body.positions : [];
  const byTicker = new Map<string, number>();
  for (const p of rawPositions) {
    const ticker = String(p?.ticker ?? "")
      .trim()
      .toUpperCase();
    const shares = Number(p?.shares);
    if (!ticker || !Number.isFinite(shares)) continue;
    byTicker.set(ticker, (byTicker.get(ticker) ?? 0) + shares);
  }
  const positions = [...byTicker.entries()]
    .slice(0, signedIn ? MAX_TICKERS : ANON_MAX_TICKERS)
    .map(([ticker, shares]) => ({ ticker, shares }));

  if (positions.length === 0) {
    return NextResponse.json({
      points: snaps.points,
      assumed: false,
      firstRealDate: snaps.firstRealDate,
    });
  }

  const closes = await fetchYtdDailyCloses(positions.map((p) => p.ticker));
  const points = reconstructAssumedNav(cash, positions, closes);

  if (points.length < 2) {
    return NextResponse.json({
      points: snaps.points,
      assumed: false,
      firstRealDate: snaps.firstRealDate,
    });
  }

  let spyPoints: NavPoint[] | undefined;
  if (body.includeSpy) {
    const spyCloses = await fetchYtdDailyCloses(["SPY"]);
    const spyPath = reconstructAssumedNav(
      0,
      [{ ticker: "SPY", shares: 1 }],
      spyCloses
    );
    if (spyPath.length >= 2) spyPoints = spyPath;
  }

  return NextResponse.json({
    points,
    assumed: true,
    firstRealDate: snaps.firstRealDate,
    spyPoints,
  });
}

export const GET = observeRoute(handleGET, '/api/book/nav-history');
export const POST = observeRoute(handlePOST, '/api/book/nav-history');
