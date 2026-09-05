"use client";

import {
  ClassroomPlanEditor,
  planFromCommunity,
} from "@/components/ClassroomPlanEditor";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import { SignInGate } from "@/components/SignInGate";
import { AppHeader } from "@/components/AppHeader";
import { MobileDock } from "@/components/mobile/MobileDock";
import { track } from "@vercel/analytics";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { StartingCashField } from "@/components/StartingCashField";
import {
  DEFAULT_STARTING_CASH,
  parseStartingCash,
  type ClassPeriodKind,
  type ClassPlan,
  type ThesisCoverage,
} from "@/lib/classroom";
import { cashtag, cn } from "@/lib/format";
import { buildCircleAwards } from "@/lib/circle-awards";
import {
  circleChangeSentence,
  circleChanges,
  type CircleBookSnapshot,
} from "@/lib/circle-changes";
import { namedRoom, RoomNoun, roomNoun } from "@/lib/community-words";
import { CircleHome } from "@/components/CircleHome";
import { ClassroomHome } from "@/components/ClassroomHome";
import { CommunityMembersPanel } from "@/components/CommunityMembersPanel";
import type {
  CommunityAchievement,
  CommunityJoinRequest as JoinRequest,
  CommunityMember as Member,
  CommunityMeta,
  CommunityPendingMember as PendingMember,
  CommunityProfile as Profile,
  MemberStat,
  OwnedPortfolio,
  PersonMilestone,
} from "@/components/community-types";
import { ReadOnlyHoldings } from "@/components/CircleCards";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Segmented } from "@/components/ui/Panel";
import { combineHouseholdNames } from "@/lib/auth/identity";
import { copyText } from "@/lib/copy-text";
import { PAGE_FRAME_CLASS, PAGE_MAIN_CLASS } from "@/lib/page-shell";
import { plainError } from "@/lib/plain-error";
import { overlapRows } from "@/lib/circle-overlap";
import { sheetCashBalance } from "@/lib/cash-balance";
import { buildOverview } from "@/lib/overview";
import {
  loadCommunityCache,
  loadCommunityDuelCache,
  saveCommunityCache,
  clearCommunityCache,
  isCommunityCacheFresh,
  COMMUNITY_VISIBLE_REFRESH_MS,
  type CommunityDuelCache,
} from "@/lib/community-cache";
import {
  isWorkspaceRoomActive,
  onWorkspaceRefresh,
  saveLastCircleId,
} from "@/lib/workspace-rooms";
import { currentDuelSessionKey } from "@/lib/daily-duel";
import {
  buildPortfolioPersonality,
  ANIMAL_BESTIARY,
  THEME_LABEL,
  animalCardTone,
} from "@/lib/portfolio-personality";
import {
  forecastThemeForTicker,
  type ForecastTheme,
} from "@/lib/forecast-conviction";
import { buildCommunityFunFacts } from "@/lib/community-fun-facts";
import { loadCachedQuotes, mergeQuotes, saveCachedQuotes, quotesUnchanged } from "@/lib/quote-cache";
import { COMPOUND_MILESTONE_GOALS } from "@/lib/compound-play";
import { todayKeyInTz } from "@/lib/timezone";
import type { Holding, Quote } from "@/lib/types";
import {
  AlertTriangle,
  ArrowLeft,
  Globe,
  GraduationCap,
  Lock,
  Settings,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  quotePollMs,
  quotesUrl,
  isQuotePollFresh,
  isQuoteFreshForView,
} from "@/lib/market/session";
import { isAbortError, isNetworkError } from "@/lib/abort";
import { useTimeout } from "@/lib/use-timeout";
import { useNetworkResume } from "@/lib/use-network-resume";
import {
  type InviteAdminRow,
} from "@/lib/community-invite-admin";

type Props = {
  communityId: string;
};

/** Shape of the two API responses this view combines — matches what
 * /api/communities/[id] and /api/communities/[id]/book return. */
type CommunityMetaResponse = {
  community: CommunityMeta;
  members?: Member[];
  pending_members?: PendingMember[];
  isAdmin?: boolean;
  join_requests?: JoinRequest[];
};
type CommunityBookResponse = {
  portfolios?: OwnedPortfolio[];
  holdings?: Holding[];
  profiles?: Profile[];
  ownership?: { portfolio_id: string; user_id: string }[];
  thesisCoverage?: Record<string, ThesisCoverage>;
  /**
   * Person id to ticker to the reason they wrote, for members who share
   * their reasons. A circle whose whole subject is why you own something
   * had no way to show it, so this is what the reason sheet and the muted
   * line under each holding read.
   */
  theses?: Record<string, Record<string, string>>;
};

/** Synchronous cache read shared by every piece of state below, so they
 * all hydrate from the exact same snapshot instead of some fields lagging
 * a render behind others. */
type CommunityCache = {
  meta: CommunityMetaResponse | null;
  book: CommunityBookResponse | null;
};

function readCommunityCache(communityId: string): CommunityCache {
  const cached = loadCommunityCache(communityId);
  if (!cached) return { meta: null, book: null };
  return {
    meta: (cached.meta as CommunityMetaResponse) ?? null,
    book: (cached.book as CommunityBookResponse) ?? null,
  };
}

export function CommunityView({ communityId }: Props) {
  const router = useRouter();
  // /communities/[id] sits behind no auth gate, so this component really is
  // server-rendered and then hydrated. Every one of these used to be seeded
  // straight out of localStorage (and out of window.location) during render,
  // which meant the server tree and the first client tree disagreed on
  // basically all of it: React discarded the server HTML and re-rendered the
  // whole page, so the cache that existed to make this instant was making it
  // slower. State now starts at the server-safe value and the cache is applied
  // in a layout effect below, before the browser paints.
  const initialCacheRef = useRef<CommunityCache>({ meta: null, book: null });
  const [community, setCommunity] = useState<CommunityMeta | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [joinDecisionBusyId, setJoinDecisionBusyId] = useState<string | null>(
    null
  );
  const [portfolios, setPortfolios] = useState<OwnedPortfolio[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [ownership, setOwnership] = useState<
    { portfolio_id: string; user_id: string }[]
  >([]);
  const [thesisCoverage, setThesisCoverage] = useState<
    Record<string, ThesisCoverage>
  >({});
  const [theses, setTheses] = useState<Record<string, Record<string, string>>>(
    {}
  );
  /*
    The copy of this circle that was in the browser when the reader arrived.
    Diffed against the fresh one to say what changed while they were away,
    which needs no table because the cache is already there. Held in state
    rather than only in `initialCacheRef` so the diff re-runs when the fresh
    book lands.
  */
  const [previousBook, setPreviousBook] = useState<CircleBookSnapshot | null>(
    null
  );
  const [claimBusy, setClaimBusy] = useState(false);
  // Community books paint instantly from cache, so without seeding prices
  // too every member's value would render at cost basis for a beat.
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  // Only true when we have nothing at all to show yet — a cache hit
  // (even a stale one) renders immediately while load() quietly confirms
  // it's current in the background, instead of blanking the page on
  // every single visit the way an unconditional loading flag would.
  const [loading, setLoading] = useState(true);
  const [duelCache, setDuelCache] = useState<CommunityDuelCache | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [view, setView] = useState<"overview" | "play" | "members">("overview");
  const hasDataRef = useRef(false);
  const loadAbortRef = useRef<AbortController | null>(null);
  const fromPopRef = useRef(false);
  const bootstrappedRef = useRef(false);
  /*
    What the layout effect read out of the address, so the writer below can
    tell "the reader has not changed anything yet" from "this render is
    still carrying the defaults".
  */
  const urlSeedRef = useRef<{
    view: "overview" | "play" | "members";
    member: string | null;
  } | null>(null);
  const correctingRef = useRef(false);

  useLayoutEffect(() => {
    const cache = readCommunityCache(communityId);
    initialCacheRef.current = cache;

    // Assigned unconditionally, including the empty case. React can keep this
    // component mounted across a move from one community to another, and
    // leaving the previous one's rows on screen while the new one loads would
    // show a person someone else's book under the wrong name.
    setCommunity(cache.meta?.community ?? null);
    if (cache.meta?.community) saveLastCircleId(communityId);
    setMembers(cache.meta?.members ?? []);
    setPendingMembers(cache.meta?.pending_members ?? []);
    setIsAdmin(cache.meta?.isAdmin ?? false);
    setJoinRequests(cache.meta?.join_requests ?? []);
    setPortfolios(cache.book?.portfolios ?? []);
    setHoldings(cache.book?.holdings ?? []);
    setProfiles(cache.book?.profiles ?? []);
    setOwnership(cache.book?.ownership ?? []);
    setThesisCoverage(cache.book?.thesisCoverage ?? {});
    setTheses(cache.book?.theses ?? {});
    setPreviousBook(
      cache.book
        ? {
            ownership: cache.book.ownership ?? [],
            holdings: (cache.book.holdings ?? []).map((h) => ({
              portfolio_id: h.portfolio_id,
              ticker: h.ticker,
              shares: h.shares,
            })),
          }
        : null
    );
    setQuotes(loadCachedQuotes().quotes);
    setDuelCache(loadCommunityDuelCache(communityId, currentDuelSessionKey()));
    hasDataRef.current = Boolean(cache.meta);
    setLoading(!cache.meta);
    bootstrappedRef.current = false;
    fromPopRef.current = false;

    const params = new URLSearchParams(window.location.search);
    const rawView = params.get("view");
    const seedView =
      rawView === "members"
        ? ("members" as const)
        : rawView === "play" || rawView === "league"
          ? ("play" as const)
          : ("overview" as const);
    const seedMember = params.get("member");
    urlSeedRef.current = { view: seedView, member: seedMember };
    setSelectedOwnerId(seedMember);
    setView(seedView);
  }, [communityId]);
  const [bestiaryOpen, setBestiaryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsName, setSettingsName] = useState("");
  const [settingsNote, setSettingsNote] = useState("");
  const [settingsStartingCash, setSettingsStartingCash] = useState(
    DEFAULT_STARTING_CASH
  );
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteEmailed, setInviteEmailed] = useState(0);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDays, setInviteDays] = useState("");
  const [inviteNeverExpires, setInviteNeverExpires] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const later = useTimeout();
  const [invites, setInvites] = useState<InviteAdminRow[]>([]);
  const [retireTarget, setRetireTarget] = useState<InviteAdminRow | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{
    userId: string;
    name: string;
  } | null>(null);

  // Tracks whether we have SOME data already (from cache or a prior
  // successful load) — a ref so `load` doesn't need `community` etc. in
  // its own dependency array just to decide whether to show a spinner.
  // Mount + visibility-regain can both trigger `load()` in quick succession
  // (e.g. flip tabs away and back before the first request lands). Without
  // this, whichever request happens to resolve last wins, even if it was
  // the older/stale one — a classic out-of-order response race. Only the
  // most-recently-started call is allowed to commit state.
  const loadCallIdRef = useRef(0);

  const load = useCallback(async () => {
    loadAbortRef.current?.abort();
    const ctrl = new AbortController();
    loadAbortRef.current = ctrl;
    const callId = ++loadCallIdRef.current;
    const isBackgroundRefresh = hasDataRef.current;
    if (!isBackgroundRefresh) setLoading(true);
    if (!isBackgroundRefresh) setError(null);
    try {
      const [metaRes, bookRes] = await Promise.all([
        fetch(`/api/communities/${communityId}`, {
          cache: "no-store",
          signal: ctrl.signal,
        }),
        fetch(`/api/communities/${communityId}/book`, {
          cache: "no-store",
          signal: ctrl.signal,
        }),
      ]);
      if (!metaRes.ok) {
        const err = await metaRes.json().catch(() => ({}));
        throw new Error(
          plainError((err as { error?: string }).error, "Couldn't load this circle.")
        );
      }
      if (!bookRes.ok) {
        const err = await bookRes.json().catch(() => ({}));
        throw new Error(
          plainError((err as { error?: string }).error, "Couldn't load this circle's portfolios.")
        );
      }
      const meta = await metaRes.json();
      const book = await bookRes.json();
      if (callId !== loadCallIdRef.current) return;
      setCommunity(meta.community);
      saveLastCircleId(communityId);
      setMembers(meta.members ?? []);
      setPendingMembers(meta.pending_members ?? []);
      setIsAdmin(Boolean(meta.isAdmin));
      setJoinRequests(meta.join_requests ?? []);
      setPortfolios(book.portfolios ?? []);
      setHoldings(book.holdings ?? []);
      setProfiles(book.profiles ?? []);
      setOwnership(book.ownership ?? []);
      setThesisCoverage(book.thesisCoverage ?? {});
      setTheses(book.theses ?? {});
      hasDataRef.current = true;
      saveCommunityCache(communityId, { meta, book });
    } catch (e) {
      if (isAbortError(e) || callId !== loadCallIdRef.current) return;
      // A background refresh failing behind already-visible cached
      // content shouldn't slap an error over it — only surface the error
      // when there was nothing on screen to begin with.
      if (!isBackgroundRefresh) {
        setError(
          isNetworkError(e)
            ? "You appear to be offline. This circle will load as soon as the connection is back."
            : e instanceof Error
              ? e.message
              : "Couldn't load this circle."
        );
      }
    } finally {
      if (callId === loadCallIdRef.current) setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    const cached = loadCommunityCache(communityId);
    if (
      hasDataRef.current &&
      isCommunityCacheFresh(cached, COMMUNITY_VISIBLE_REFRESH_MS)
    ) {
      return () => {
        loadAbortRef.current?.abort();
        loadCallIdRef.current += 1;
      };
    }
    void load();
    return () => {
      loadAbortRef.current?.abort();
      loadCallIdRef.current += 1;
    };
  }, [load, communityId]);

  useNetworkResume(() => {
    void load();
  });

  // Ownership/membership can change server-side (e.g. someone else's first
  // sign-in claims a pending sheet) while this tab sits in the background —
  // refetch on return so "awaiting sign-in" / portfolio counts don't go stale.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const cached = loadCommunityCache(communityId);
      if (isCommunityCacheFresh(cached, COMMUNITY_VISIBLE_REFRESH_MS)) return;
      void load();
    }
    document.addEventListener("visibilitychange", onVisible);
    /*
      A pull asks for the circle again with no freshness check in front of it.
      Coming back to a tab may reasonably decide the cached answer is recent
      enough; somebody who has just dragged the page down has said it is not.
    */
    const offPull = onWorkspaceRefresh(`community:${communityId}`, () => load());
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      offPull();
    };
  }, [load, communityId]);

  // Drill-down (member -> their portfolio) mirrors into ?member=&portfolio=
  // so a hard refresh lands back on the exact view, and Back/Forward step
  // through the hierarchy naturally (member list -> member -> portfolio)
  // instead of leaving the page entirely on the first Back press.
  useEffect(() => {
    function onPopState() {
      fromPopRef.current = true;
      const params = new URLSearchParams(window.location.search);
      setSelectedOwnerId(params.get("member"));
      const raw = params.get("view");
      setView(
        raw === "members"
          ? raw
          : raw === "play" || raw === "league"
            ? "play"
            : "overview"
      );
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.pathname.startsWith(`/communities/${communityId}`)) {
      return;
    }
    const url = new URL(window.location.href);
    if (selectedOwnerId) url.searchParams.set("member", selectedOwnerId);
    else url.searchParams.delete("member");
    // No per-sheet view any more, so a stale ?portfolio= from an old link
    // must not linger in the URL.
    url.searchParams.delete("portfolio");
    if (view === "members") url.searchParams.set("view", view);
    else if (view === "play") url.searchParams.set("view", "league");
    else url.searchParams.delete("view");
    const href = `${url.pathname}${url.search}`;

    /*
      A shared link did not survive its own page load.

      This effect is queued from the first render, whose `view` is still the
      default, and the layout effect that reads the address commits a second
      render after it. Both passive effects then run, so the first one wrote
      the address back without the query it had arrived with. That alone
      only cost an extra history entry, but `WorkspaceShell` can remount the
      room, and the layout effect then re-read an address that no longer
      said anything: a link to `?view=league` landed on Overview, and
      `?member=` never opened the drill-down at all.

      So nothing is written until the state agrees with what the layout
      effect actually parsed. A render still carrying the defaults is a
      render that has not caught up, not a reader who has changed their
      mind, and it leaves the address alone.
    */
    if (!bootstrappedRef.current) {
      const seed = urlSeedRef.current;
      if (!seed) return;
      if (seed.view !== view || seed.member !== selectedOwnerId) return;
      bootstrappedRef.current = true;
      window.history.replaceState(window.history.state, "", href);
      return;
    }
    if (fromPopRef.current) {
      fromPopRef.current = false;
      window.history.replaceState(window.history.state, "", href);
      return;
    }
    if (correctingRef.current) {
      correctingRef.current = false;
      window.history.replaceState(window.history.state, "", href);
      return;
    }
    window.history.pushState(window.history.state, "", href);
  }, [communityId, selectedOwnerId, view]);

  // A ?member=/?portfolio= link can go stale (member left, sheet deleted) or
  // just be wrong — once real data is in, drop selections that don't
  // resolve to anything instead of leaving the drill-down view blank.
  useEffect(() => {
    if (loading || !selectedOwnerId) return;
    const valid =
      members.some(
        (m) =>
          m.user_id === selectedOwnerId ||
          m.user_ids?.includes(selectedOwnerId)
      ) || pendingMembers.some((p) => `pending:${p.key}` === selectedOwnerId);
    if (!valid) {
      correctingRef.current = true;
      setSelectedOwnerId(null);
    }
  }, [loading, selectedOwnerId, members, pendingMembers]);

  const holdingsTickerKey = useMemo(
    () =>
      [...new Set(holdings.map((h) => h.ticker).filter(Boolean))]
        .sort()
        .join(","),
    [holdings]
  );
  const quotesAtRef = useRef(0);

  useEffect(() => {
    const tickers = holdingsTickerKey
      ? holdingsTickerKey.split(",")
      : [];
    if (!tickers.length) return;
    let cancelled = false;
    let timer = 0;
    const ctrl = new AbortController();
    if (quotesAtRef.current === 0) {
      quotesAtRef.current = loadCachedQuotes().savedAt ?? 0;
    }
    const tick = async (reason: "background" | "view" = "background") => {
      if (cancelled || document.hidden) return;
      if (!isWorkspaceRoomActive(`community:${communityId}`)) return;
      const alreadyFresh =
        reason === "view"
          ? isQuoteFreshForView(quotesAtRef.current)
          : isQuotePollFresh(quotesAtRef.current);
      if (alreadyFresh) return;
      try {
        const res = await fetch(quotesUrl(tickers), { signal: ctrl.signal });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        const fresh = (data.quotes ?? {}) as Record<string, Quote>;
        let merged = fresh;
        setQuotes((prev) => {
          merged = mergeQuotes(prev, fresh);
          if (quotesUnchanged(prev, merged)) {
            merged = prev;
            return prev;
          }
          return merged;
        });
        quotesAtRef.current = Date.now();
        saveCachedQuotes(merged);
      } catch {
        /* ignore */
      }
    };
    const schedule = () => {
      timer = window.setTimeout(() => {
        void tick().then(() => {
          if (!cancelled) schedule();
        });
      }, quotePollMs());
    };
    void tick("view");
    schedule();
    const onVisible = () => {
      if (!document.hidden) void tick("view");
    };
    document.addEventListener("visibilitychange", onVisible);
    /*
      Prices are registered separately from the circle itself because they are
      owned by this effect and nothing outside it can reach `tick`. Both land
      in the same pull and the ring waits on the pair of them.
    */
    const offPull = onWorkspaceRefresh(`community:${communityId}`, () => {
      quotesAtRef.current = 0;
      return tick();
    });
    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      offPull();
    };
  }, [holdingsTickerKey, communityId]);

  const profileName = useCallback(
    (id: string) => {
      if (id.startsWith("pending:")) {
        const key = id.slice("pending:".length);
        return (
          pendingMembers.find((p) => p.key === key)?.label ??
          key.charAt(0).toUpperCase() + key.slice(1)
        );
      }
      const p =
        profiles.find((x) => x.id === id) ??
        members.find((m) => m.user_id === id)?.profile;
      return p?.display_name || p?.email || "Member";
    },
    [profiles, members, pendingMembers]
  );

  const memberEmails = useCallback(
    (m: Member) => {
      const emails =
        m.emails?.length
          ? m.emails
          : m.profile?.email
            ? [m.profile.email]
            : [];
      return emails;
    },
    []
  );

  const overview = useMemo(
    () => buildOverview(portfolios, holdings, quotes),
    [portfolios, holdings, quotes]
  );

  // One combined per-person stat, computed once and reused by the power
  // animals grid, leaderboard, risk comparison, and fun facts, instead of
  // each section re-deriving its own copy of "which sheets does this
  // person own".
  const memberStats = useMemo<MemberStat[]>(() => {
    const milestoneFor = (total: number): PersonMilestone => {
      const hitCount = COMPOUND_MILESTONE_GOALS.filter((g) => total >= g).length;
      const next = COMPOUND_MILESTONE_GOALS.find((g) => total < g) ?? null;
      const lastGoal =
        [...COMPOUND_MILESTONE_GOALS].reverse().find((g) => total >= g) ?? 0;
      // Progress WITHIN the current bracket (lastGoal -> next), so the bar
      // fill actually lines up with the lastGoal/next labels instead of
      // always reading against zero.
      const bracketSize = next != null ? next - lastGoal : 1;
      const progress =
        next != null && bracketSize > 0
          ? Math.min(1, (total - lastGoal) / bracketSize)
          : 1;
      return {
        total,
        hitCount,
        goalCount: COMPOUND_MILESTONE_GOALS.length,
        next,
        remaining: next != null ? next - total : 0,
        progress,
        lastGoal,
      };
    };

    const statFor = (
      id: string,
      name: string,
      sheetIds: Set<string>,
      isYou: boolean,
      isPending: boolean
    ): MemberStat => {
      const sheets = portfolios.filter((p) => sheetIds.has(p.id));
      const scores = sheets
        .map((p) => overview.sheets.find((s) => s.portfolio.id === p.id))
        .filter((s): s is (typeof overview.sheets)[number] => Boolean(s));
      const totalValue = scores.reduce((s, sc) => s + sc.totalValue, 0);
      const todayDollar = scores.reduce((s, sc) => s + sc.todayDollar, 0);
      const previousTotal = totalValue - todayDollar;
      const todayPct = previousTotal > 0 ? todayDollar / previousTotal : null;
      const cash = sheets.reduce((s, p) => s + sheetCashBalance(p), 0);
      const tickerValues = holdings
        .filter((h) => sheetIds.has(h.portfolio_id))
        .map((h) => ({
          ticker: h.ticker,
          value: h.shares * (quotes[h.ticker]?.price ?? 0),
        }));
      const personality =
        tickerValues.length > 0
          ? buildPortfolioPersonality(tickerValues, cash)
          : null;
      return {
        id,
        name,
        isYou,
        isPending,
        sheetCount: sheets.length,
        sheetKey: [...sheetIds].sort().join(","),
        totalValue,
        todayDollar,
        todayPct,
        roiPct: 0,
        personality,
        milestone: milestoneFor(totalValue),
      };
    };

    const rawMembers: MemberStat[] = members.map((m) => {
      const sheetIds = new Set(
        ownership.filter((o) => o.user_id === m.user_id).map((o) => o.portfolio_id)
      );
      return statFor(
        m.user_id,
        profileName(m.user_id),
        sheetIds,
        Boolean(m.is_you),
        false
      );
    });

    // Co-owners of the exact same sheet(s) are one household, not two
    // separate "members" — a couple sharing a book shouldn't double up in
    // the leaderboard/power-animals grid with identical numbers twice.
    const bySheetKey = new Map<string, MemberStat[]>();
    const solo: MemberStat[] = [];
    for (const m of rawMembers) {
      if (!m.sheetKey) {
        solo.push(m);
        continue;
      }
      const arr = bySheetKey.get(m.sheetKey) ?? [];
      arr.push(m);
      bySheetKey.set(m.sheetKey, arr);
    }
    const list: MemberStat[] = [...solo];
    for (const group of bySheetKey.values()) {
      if (group.length === 1) {
        list.push(group[0]!);
        continue;
      }
      const first = group[0]!;
      list.push({
        ...first,
        name: combineHouseholdNames(group.map((g) => g.name)),
        isYou: group.some((g) => g.isYou),
      });
    }

    for (const p of pendingMembers) {
      const sheetIds = new Set(p.portfolio_ids);
      list.push(statFor(`pending:${p.key}`, p.label, sheetIds, false, true));
    }
    return list;
  }, [members, pendingMembers, ownership, portfolios, overview, holdings, quotes, profileName]);

  const membersWithBooks = useMemo(
    () => memberStats.filter((m) => m.sheetCount > 0),
    [memberStats]
  );

  const teacherIds = useMemo(
    () =>
      new Set(
        members.filter((m) => m.role === "admin").map((m) => m.user_id)
      ),
    [members]
  );

  const isClassroom = community?.kind === "classroom";
  /*
    One word for the room, everywhere a reader can see it. The same view
    serves a circle of friends and a paper class, and the copy called both
    of them a "community" in fourteen places, so a student leaving a class
    was asked "Leave this community?". `community-words.ts` owns the noun
    and `reader-copy.test.ts` fails on the old one in any markup.
  */
  const roomWord = roomNoun(community?.kind);
  const RoomWord = RoomNoun(community?.kind);
  const thisRoomWord = `this ${roomWord}`;
  const startingCash = Number(community?.starting_cash) || DEFAULT_STARTING_CASH;
  const classStartTotal =
    startingCash * Math.max(1, membersWithBooks.length);
  const classVsStartDollar = overview.totals.totalValue - classStartTotal;
  const classVsStartPct =
    classStartTotal > 0 ? classVsStartDollar / classStartTotal : null;
  const myMember = members.find((m) => m.is_you);
  const myClassSheet = Boolean(
    isClassroom &&
      myMember &&
      portfolios.some(
        (p) =>
          p.classroom_community_id === communityId &&
          ownership.some(
            (o) => o.portfolio_id === p.id && o.user_id === myMember.user_id
          )
      )
  );
  const effectiveView = isClassroom && view === "play" ? "overview" : view;

  async function claimClassSheet() {
    setClaimBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/communities/${communityId}/classroom-sheet`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          plainError((data as { error?: string }).error, "Couldn't make the paper portfolio.")
        );
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the paper portfolio.");
    } finally {
      setClaimBusy(false);
    }
  }

  const sharedNames = useMemo(
    () =>
      overlapRows(overview.tickers, (portfolioIds) => {
        const names = new Set<string>();
        for (const pid of portfolioIds) {
          for (const o of ownership.filter((x) => x.portfolio_id === pid)) {
            names.add(profileName(o.user_id));
          }
        }
        return [...names];
      }),
    [overview.tickers, ownership, profileName]
  );

  const avatarByName = useMemo(() => {
    const map = new Map<string, string>();
    const add = (name: string, url: string | null | undefined) => {
      if (name && url && !map.has(name)) map.set(name, url);
    };
    for (const m of members) {
      add(profileName(m.user_id), m.profile?.avatar_url);
    }
    for (const p of profiles) {
      add(p.display_name || p.email || "Member", p.avatar_url);
    }
    return map;
  }, [members, profiles, profileName]);

  /*
    One award per person, and never one about how much money they have.

    This used to be nine independent sorts handing out ten awards to six
    people, so the same person collected three and two of them contradicted
    each other on the same grid (an index fund tops both the spread-out
    score and the one-kind score). Two of them ranked people by the size of
    their portfolio, which is the figure a circle promises never to show:
    the friend with the smallest one was labelled the sapling in front of
    everybody. `circle-awards.ts` holds the rule and the argument.
  */
  const achievements = useMemo<CommunityAchievement[]>(
    () =>
      buildCircleAwards(
        membersWithBooks.map((m) => ({
          id: m.id,
          name: m.name,
          personality: m.personality,
        }))
      ),
    [membersWithBooks]
  );

  // Combined family sector fingerprint — every member's holdings pooled
  // into one dollar-weighted theme breakdown, a level up from "What the
  // community is holding" (which is per-ticker) to "what does the family
  // collectively believe in."
  const communityThemeBreakdown = useMemo(() => {
    const byTheme = new Map<string, number>();
    let total = 0;
    for (const t of overview.tickers) {
      if (t.currentValue <= 0) continue;
      const theme = forecastThemeForTicker(t.ticker);
      byTheme.set(theme, (byTheme.get(theme) ?? 0) + t.currentValue);
      total += t.currentValue;
    }
    if (total <= 0) return [];
    return [...byTheme.entries()]
      .map(([theme, value]) => ({
        theme: theme as ForecastTheme,
        label: THEME_LABEL[theme as ForecastTheme] ?? theme,
        value,
        pct: value / total,
      }))
      .sort((a, b) => b.value - a.value);
  }, [overview.tickers]);

  /*
    The same breakdown for the reader alone, so the chart can answer the one
    question it exists to answer: how you differ from the room. A single
    stacked bar of the group tells nobody anything about themselves.
  */
  const yourThemeBreakdown = useMemo(() => {
    const you = memberStats.find((m) => m.isYou);
    if (!you) return [];
    const mySheets = new Set(
      ownership
        .filter((o) => o.user_id === you.id)
        .map((o) => o.portfolio_id)
    );
    const byTheme = new Map<string, number>();
    let total = 0;
    for (const h of holdings) {
      if (!mySheets.has(h.portfolio_id)) continue;
      const value = h.shares * (quotes[h.ticker]?.price ?? 0);
      if (value <= 0) continue;
      const theme = forecastThemeForTicker(h.ticker);
      byTheme.set(theme, (byTheme.get(theme) ?? 0) + value);
      total += value;
    }
    if (total <= 0) return [];
    return [...byTheme.entries()]
      .map(([theme, value]) => ({
        theme: theme as ForecastTheme,
        label: THEME_LABEL[theme as ForecastTheme] ?? theme,
        value,
        pct: value / total,
      }))
      .sort((a, b) => b.value - a.value);
  }, [memberStats, ownership, holdings, quotes]);

  /** Every person's reason for a shared company, keyed on the ticker. */
  const sharedReasons = useMemo(() => {
    const map = new Map<string, { person: string; reason: string | null }[]>();
    for (const row of sharedNames) {
      const people = row.people.map((person) => {
        const stat = memberStats.find((m) => m.name === person);
        const reason = stat ? theses[stat.id]?.[row.ticker] ?? null : null;
        return { person, reason: reason?.trim() ? reason.trim() : null };
      });
      map.set(row.ticker, people);
    }
    return map;
  }, [sharedNames, memberStats, theses]);

  /**
   * Companies the reader owns and has written nothing about, so the reason
   * sheet asks only the person it can actually ask. Owning it is not enough:
   * a reader whose own reason is already on the sheet was being told to go
   * and write one.
   */
  const needYourReason = useMemo(() => {
    const you = memberStats.find((m) => m.isYou);
    if (!you) return new Set<string>();
    const mySheets = new Set(
      ownership.filter((o) => o.user_id === you.id).map((o) => o.portfolio_id)
    );
    const mine = theses[you.id] ?? {};
    return new Set(
      holdings
        .filter((h) => mySheets.has(h.portfolio_id))
        .map((h) => h.ticker)
        .filter((ticker) => !mine[ticker]?.trim())
    );
  }, [memberStats, ownership, holdings, theses]);

  /*
    What changed since the reader last opened this circle. Six lines at
    most: past that it stops being news and starts being a list.
  */
  const changes = useMemo(
    () =>
      circleChanges(
        previousBook,
        {
          ownership,
          holdings: holdings.map((h) => ({
            portfolio_id: h.portfolio_id,
            ticker: h.ticker,
            shares: h.shares,
          })),
        },
        profileName
      )
        .slice(0, 6)
        .map((c) => circleChangeSentence(c, cashtag)),
    [previousBook, ownership, holdings, profileName]
  );

  /**
   * Who in this circle wears each animal, and the three groups the field
   * guide is read in: you, then the room, then everything else.
   */
  const bestiaryHolders = useMemo(() => {
    const map = new Map<string, string>();
    const names = new Map<string, string[]>();
    for (const m of membersWithBooks) {
      const id = m.personality?.archetype.id;
      if (!id) continue;
      names.set(id, [...(names.get(id) ?? []), m.isYou ? "You" : m.name]);
    }
    for (const [id, list] of names) {
      const joined =
        list.length === 1
          ? list[0]!
          : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
      map.set(id, `${joined} ${list.length === 1 && list[0] !== "You" ? "has" : "have"} this one.`);
    }
    return map;
  }, [membersWithBooks]);

  const bestiaryGroups = useMemo(() => {
    const you = membersWithBooks.find((m) => m.isYou)?.personality?.archetype.id;
    const here = new Set(
      membersWithBooks
        .map((m) => m.personality?.archetype.id)
        .filter((id): id is string => Boolean(id))
    );
    const mine = ANIMAL_BESTIARY.filter((a) => a.id === you);
    const inRoom = ANIMAL_BESTIARY.filter((a) => a.id !== you && here.has(a.id));
    const rest = ANIMAL_BESTIARY.filter((a) => a.id !== you && !here.has(a.id));
    return [
      { title: "Yours", animals: mine },
      { title: "In this circle", animals: inRoom },
      { title: "Every other animal", animals: rest },
    ].filter((g) => g.animals.length > 0);
  }, [membersWithBooks]);

  const [funFactsShuffle, setFunFactsShuffle] = useState(0);
  const communityFunFacts = useMemo(
    () =>
      buildCommunityFunFacts(
        membersWithBooks,
        funFactsShuffle === 0 ? todayKeyInTz() : `shuffle-${funFactsShuffle}`,
        6,
        achievements.map((a) => a.id)
      ),
    [membersWithBooks, funFactsShuffle, achievements]
  );

  /** Every book the drilled-into member owns. */
  const ownerPortfolios = useMemo(() => {
    if (!selectedOwnerId) return [];
    return portfolios.filter((p) =>
      ownership.some(
        (o) => o.portfolio_id === p.id && o.user_id === selectedOwnerId
      )
    );
  }, [portfolios, ownership, selectedOwnerId]);

  /**
   * Holdings for the current drill-down: every book the member owns,
   * pooled, so a ticker held in two of them collapses into one row. Cost
   * is never shown here.
   *
   * There is deliberately no per-sheet picker. Which sheets someone happens
   * to split their positions across is their own filing system, not
   * something a Circle member needs to page through -- what you came to see
   * is what they hold, once.
   */
  const selectedHoldings = useMemo(() => {
    const ids = new Set(ownerPortfolios.map((p) => p.id));
    const mine = holdings.filter((h) => ids.has(h.portfolio_id));
    const byTicker = new Map<string, Holding>();
    for (const h of mine) {
      const prev = byTicker.get(h.ticker);
      if (!prev) {
        byTicker.set(h.ticker, { ...h });
        continue;
      }
      const shares = prev.shares + h.shares;
      byTicker.set(h.ticker, {
        ...prev,
        shares,
      });
    }
    return [...byTicker.values()];
  }, [ownerPortfolios, holdings]);

  const selectedOwnerName = selectedOwnerId
    ? memberStats.find((m) => m.id === selectedOwnerId)?.name ??
      profileName(selectedOwnerId)
    : "";

  const loadInvites = useCallback(async () => {
    try {
      const res = await fetch(`/api/communities/${communityId}/invites`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const raw: unknown = await res.json().catch(() => ({}));
      const data = raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as { invites?: InviteAdminRow[] })
        : {};
      setInvites(Array.isArray(data.invites) ? data.invites : []);
    } catch {
      /* keep whatever was already loaded */
    }
  }, [communityId]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadInvites();
  }, [isAdmin, loadInvites]);

  async function createInvite() {
    setBusy(true);
    setInviteUrl(null);
    setInviteEmailed(0);
    try {
      const days = Math.floor(Number(inviteDays.trim()));
      const res = await fetch(`/api/communities/${communityId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim() || undefined,
          ...(Number.isFinite(days) && days >= 1 ? { daysValid: days } : {}),
          ...(inviteNeverExpires ? { neverExpires: true } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(plainError(data.error, "Couldn't send that invite."));
      track("community_invite_created");
      const url = `${window.location.origin}${data.path}`;
      setInviteUrl(url);
      setInviteEmailed(
        typeof data.emailed === "number" && data.emailed > 0 ? data.emailed : 0
      );
      await copyInviteLink(url, "fresh");
      await loadInvites();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send that invite.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * The link is only ever the one the server just handed back. The database
   * holds a hash of the token and nothing else, so there is no call that
   * fetches an existing invite's link; an admin who needs one again makes a
   * new link (`renewInvite`).
   */
  async function copyInviteLink(url: string | null, key: string) {
    if (!url) {
      setError("Couldn't copy that link.");
      return;
    }
    const ok = await copyText(url);
    if (!ok) {
      setError("Couldn't copy that link. Select it and copy by hand.");
      setInviteUrl(url);
      return;
    }
    setError(null);
    setCopiedInviteId(key);
    later(() => setCopiedInviteId((id) => (id === key ? null : id)), 1500);
  }

  /** A fresh link in place of an existing one. The old link stops working. */
  async function renewInvite(inviteId: string) {
    setBusy(true);
    setInviteUrl(null);
    setInviteEmailed(0);
    try {
      const res = await fetch(
        `/api/communities/${communityId}/invites/${inviteId}`,
        { method: "POST" }
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        path?: string;
      };
      if (!res.ok || typeof data.path !== "string") {
        throw new Error(plainError(data.error, "Couldn't make a new link."));
      }
      track("community_invite_created");
      const url = `${window.location.origin}${data.path}`;
      setInviteUrl(url);
      await copyInviteLink(url, "fresh");
      await loadInvites();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make a new link.");
    } finally {
      setBusy(false);
    }
  }

  async function retireInvite(inviteId: string) {
    const res = await fetch(
      `/api/communities/${communityId}/invites/${inviteId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revoked: true }),
      }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(plainError(data.error, "Couldn't retire that link."));
    }
    await loadInvites();
    return true;
  }

  async function removeMember(userId: string) {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/communities/${communityId}/members/${userId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(plainError((data as { error?: string }).error, "Couldn't remove that person."));
      }
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove that person.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function setRole(userId: string, role: "admin" | "member") {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/communities/${communityId}/members/${userId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          plainError((data as { error?: string }).error, "Couldn't change that role.")
        );
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change that role.");
    } finally {
      setBusy(false);
    }
  }

  function openSettings() {
    setSettingsName(community?.name ?? "");
    setSettingsNote(community?.house_note ?? "");
    setSettingsStartingCash(
      Number(community?.starting_cash) || DEFAULT_STARTING_CASH
    );
    setSettingsError(null);
    setSettingsOpen(true);
  }

  async function handleSaveHouseNote() {
    const note = settingsNote.trim();
    if (note === (community?.house_note ?? "").trim()) return;
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      const res = await fetch(`/api/communities/${communityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ houseNote: note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(plainError((data as { error?: string }).error, "Couldn't save that note."));
      }
      setCommunity((data as { community: CommunityMeta }).community);
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : "Couldn't save that note.");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function handleStartPeriod(kind: ClassPeriodKind) {
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      const res = await fetch(`/api/communities/${communityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startPeriod: kind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          plainError((data as { error?: string }).error, "Couldn't change that.")
        );
      }
      setCommunity((data as { community: CommunityMeta }).community);
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : "Couldn't change that.");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function handleSaveClassPlan(plan: ClassPlan) {
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      const res = await fetch(`/api/communities/${communityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classPlan: plan }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          plainError((data as { error?: string }).error, "Couldn't save the schedule.")
        );
      }
      setCommunity((data as { community: CommunityMeta }).community);
    } catch (e) {
      setSettingsError(
        e instanceof Error ? e.message : "Couldn't save the schedule."
      );
    } finally {
      setSettingsBusy(false);
    }
  }

  async function handleRename() {
    const name = settingsName.trim();
    if (!name || name === community?.name) return;
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      const res = await fetch(`/api/communities/${communityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(plainError((data as { error?: string }).error, "Couldn't rename this circle."));
      }
      setCommunity((data as { community: CommunityMeta }).community);
      setSettingsOpen(false);
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : "Couldn't rename this circle.");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function handleSaveStartingCash() {
    const next = parseStartingCash(settingsStartingCash);
    const current = Number(community?.starting_cash) || DEFAULT_STARTING_CASH;
    if (next == null || next === current) return;
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      const res = await fetch(`/api/communities/${communityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startingCash: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          plainError(
            (data as { error?: string }).error,
            "Couldn't update starting cash."
          )
        );
      }
      setCommunity((data as { community: CommunityMeta }).community);
      void load();
    } catch (e) {
      setSettingsError(
        e instanceof Error ? e.message : "Couldn't update starting cash."
      );
    } finally {
      setSettingsBusy(false);
    }
  }

  async function handleVisibilityChange(next: "public" | "private") {
    if (!community || community.visibility === next) return;
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      const res = await fetch(`/api/communities/${communityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(plainError((data as { error?: string }).error, "Couldn't update that."));
      }
      setCommunity((data as { community: CommunityMeta }).community);
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : "Couldn't update that.");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function decideJoinRequest(userId: string, decision: "approve" | "reject") {
    setJoinDecisionBusyId(userId);
    try {
      const res = await fetch(`/api/communities/${communityId}/join-request`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, decision }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(plainError((data as { error?: string }).error, "Couldn't save that decision."));
      }
      setJoinRequests((rows) => rows.filter((r) => r.user_id !== userId));
      if (decision === "approve") await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that decision.");
    } finally {
      setJoinDecisionBusyId(null);
    }
  }

  async function handleLeaveCommunity() {
    const me = members.find((m) => m.is_you);
    if (!me) throw new Error("Couldn't tell which member you are. Try again.");
    const res = await fetch(
      `/api/communities/${communityId}/members/${me.user_id}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(plainError((data as { error?: string }).error, "Couldn't leave this circle."));
    }
    clearCommunityCache(communityId);
    router.push("/communities");
    return true;
  }

  async function handleDeleteCommunity() {
    const res = await fetch(`/api/communities/${communityId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(plainError((data as { error?: string }).error, "Couldn't delete this circle."));
    }
    clearCommunityCache(communityId);
    router.push("/communities");
    return true;
  }

  const membersPanel = (
    <CommunityMembersPanel
      isClassroom={Boolean(isClassroom)}
      isAdmin={isAdmin}
      members={members}
      pendingMembers={pendingMembers}
      joinRequests={joinRequests}
      joinDecisionBusyId={joinDecisionBusyId}
      portfolios={portfolios}
      holdings={holdings}
      quotes={quotes}
      ownership={ownership}
      overview={overview}
      profileName={profileName}
      memberEmails={memberEmails}
      busy={busy}
      inviteEmail={inviteEmail}
      setInviteEmail={setInviteEmail}
      inviteDays={inviteDays}
      setInviteDays={setInviteDays}
      inviteNeverExpires={inviteNeverExpires}
      setInviteNeverExpires={setInviteNeverExpires}
      inviteUrl={inviteUrl}
      inviteEmailed={inviteEmailed}
      invites={invites}
      copiedInviteId={copiedInviteId}
      createInvite={createInvite}
      copyInviteLink={copyInviteLink}
      renewInvite={renewInvite}
      setRole={setRole}
      decideJoinRequest={decideJoinRequest}
      setRemoveTarget={setRemoveTarget}
      setLeaveOpen={setLeaveOpen}
      setRetireTarget={setRetireTarget}
      setSelectedOwnerId={setSelectedOwnerId}
    />
  );

  return (
    <SignInGate>
      <div className={PAGE_FRAME_CLASS}>
        <MobileDock active="circle" />
        <AppHeader
          mobileTitle={community?.name ?? RoomWord}
          mobileEnd={
            /*
             * `ghost`/`icon-sm`, matching the feedback and account controls
             * beside it. As `outline`/`icon` this was the only boxed
             * button in the phone header — a bordered 32px square sitting
             * between two borderless 28px glyphs, which read as a stray
             * control rather than part of the bar.
             */
            isAdmin && community ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={openSettings}
                aria-expanded={settingsOpen}
                aria-label="Settings"
                title="Settings"
                className="touch-target"
              >
                <Settings />
              </Button>
            ) : undefined
          }
          title={
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{community?.name ?? RoomWord}</span>
              {community && (
                <span
                  title={
                    community.kind === "classroom"
                      ? "Paper class"
                      : community.visibility === "public"
                        ? "Public circle"
                        : "Private circle"
                  }
                >
                  {community.kind === "classroom" ? (
                    <GraduationCap className="h-3.5 w-3.5 shrink-0 text-primary/80" />
                  ) : community.visibility === "public" ? (
                    <Globe className="h-3.5 w-3.5 shrink-0 text-primary" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </span>
              )}
            </span>
          }
        >
          {isAdmin && joinRequests.length > 0 && (
            <Badge
              title={`${joinRequests.length} pending join request${joinRequests.length === 1 ? "" : "s"}`}
            >
              {joinRequests.length}
            </Badge>
          )}
          {isAdmin && community && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openSettings}
              aria-expanded={settingsOpen}
              aria-label="Settings"
            >
              <Settings data-icon="inline-start" />
              Settings
            </Button>
          )}
        </AppHeader>

        <main id="main" className={PAGE_MAIN_CLASS}>
          {/*
            A skeleton in the shape of the room that is about to arrive,
            rather than one grey sentence and then the whole page popping
            in. The list this came from has used skeletons all along.
          */}
          {loading && (
            <div className="flex flex-col gap-4" aria-hidden>
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-10 w-64" />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </div>
              <Skeleton className="h-52" />
            </div>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!loading && !selectedOwnerId && (
            isClassroom ? (
              <ClassroomHome
                name={community?.name ?? RoomWord}
                houseNote={community?.house_note?.trim() || null}
                classTrade={community?.classTrade}
                isAdmin={isAdmin}
                myClassSheet={myClassSheet}
                claimBusy={claimBusy}
                onClaim={() => void claimClassSheet()}
                view={view}
                setView={setView}
                contentView={effectiveView}
                overview={overview}
                membersWithBooks={membersWithBooks}
                memberStats={memberStats}
                teacherIds={teacherIds}
                startingCash={startingCash}
                classVsStartPct={classVsStartPct}
                classVsStartDollar={classVsStartDollar}
                holdings={holdings}
                quotes={quotes}
                ownership={ownership}
                thesisCoverage={thesisCoverage}
                communityId={communityId}
                onOpenMember={setSelectedOwnerId}
                members={membersPanel}
              />
            ) : (
              <CircleHome
                name={community?.name ?? RoomWord}
                houseNote={community?.house_note?.trim() || null}
                view={view}
                setView={setView}
                overview={overview}
                membersWithBooks={membersWithBooks}
                achievements={achievements}
                sharedNames={sharedNames}
                sharedReasons={sharedReasons}
                needYourReason={needYourReason}
                avatarByName={avatarByName}
                communityThemeBreakdown={communityThemeBreakdown}
                yourThemeBreakdown={yourThemeBreakdown}
                communityFunFacts={communityFunFacts}
                funFactsShuffle={funFactsShuffle}
                setFunFactsShuffle={setFunFactsShuffle}
                changes={changes}
                communityId={communityId}
                duelCache={duelCache}
                isAdmin={isAdmin}
                memberCount={members.length}
                waitingToJoin={isAdmin ? joinRequests.length : 0}
                inviteBusy={busy}
                inviteUrl={inviteUrl}
                createInvite={() => void createInvite()}
                copyInviteLink={(url, key) => void copyInviteLink(url, key)}
                onOpenMember={setSelectedOwnerId}
                onOpenBestiary={() => setBestiaryOpen(true)}
                onShareChanged={() => void load()}
                members={membersPanel}
              />
            )
          )}

          {/* One view, not two. Opening a member used to land on a list of
            * their books, so seeing a single position always cost two
            * clicks (and for the many members with exactly one book, that
            * list was a page containing one row). It now opens on the
            * combined book, with a picker only when there's more than one
            * to pick from. */}
          {!loading && selectedOwnerId && (
            <section className="flex flex-col gap-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => {
                  setSelectedOwnerId(null);
                }}
              >
                <ArrowLeft data-icon="inline-start" />
                Back to {community?.name ?? thisRoomWord}
              </Button>
              {/*
                Not sticky, and it says its one thing once.

                Measured at 390 after 260px of scroll, the sticky card sat
                over the reader's own figures with the numbers peeking out
                beneath it, and it said "you can look but not edit" three
                times in four lines under a title that said it a fourth.
              */}
              <div className="flex flex-col gap-1">
                <h2 className="text-foreground">
                  {selectedOwnerName}
                  &apos;s portfolio
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  You can look, not change anything. Every portfolio they own
                  is pooled here, so a company held in two of them shows as one
                  line.
                </p>
              </div>

              <WidgetErrorBoundary
                name="Member portfolio"
                resetKey={selectedOwnerId ?? communityId}
              >
              <ReadOnlyHoldings
                holdings={selectedHoldings}
                quotes={quotes}
                theses={theses[selectedOwnerId] ?? undefined}
              />
              </WidgetErrorBoundary>
            </section>
          )}
        </main>
      </div>

      <ConfirmModal
        open={Boolean(retireTarget)}
        title="Turn off this link?"
        body="New people will not be able to join with it. People already in stay."
        confirmLabel="Turn off this link"
        destructive
        onClose={() => setRetireTarget(null)}
        onConfirm={async () => {
          if (!retireTarget) return false;
          return retireInvite(retireTarget.id);
        }}
      />

      <ConfirmModal
        open={Boolean(removeTarget)}
        title="Remove member?"
        body={`Remove ${removeTarget?.name ?? "this member"} from this ${roomWord}? They will stop seeing everyone else's portfolios, and you can invite them again later.`}
        confirmLabel="Remove"
        destructive
        onClose={() => setRemoveTarget(null)}
        onConfirm={async () => {
          if (!removeTarget) return false;
          return removeMember(removeTarget.userId);
        }}
      />

      <ConfirmModal
        open={leaveOpen}
        title={`Leave ${thisRoomWord}?`}
        body={`You will stop seeing everyone else's portfolios in ${namedRoom(community?.kind, community?.name)}, and they will stop seeing yours. Your own portfolios and holdings stay exactly as they are. You can come back later with an invite, or by asking again if it is public.`}
        confirmLabel="Leave"
        destructive
        onClose={() => setLeaveOpen(false)}
        onConfirm={handleLeaveCommunity}
      />

      <ConfirmModal
        open={deleteConfirmOpen}
        title={`Delete ${thisRoomWord}?`}
        body={`This removes "${namedRoom(community?.kind, community?.name)}" for everyone. Members stop seeing each other's portfolios and the invite link stops working. Nobody's own portfolio or holdings are touched, and it cannot be undone.`}
        confirmLabel={`Delete this ${roomWord}`}
        destructive
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteCommunity}
      />

      {settingsOpen && (
        <ViewportOverlay
          className="z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
          onClose={() => setSettingsOpen(false)}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            aria-label="Close"
            onClick={() => setSettingsOpen(false)}
          />
          <div className="scroll-host relative max-h-full w-full max-w-sm overflow-y-auto rounded-t-xl bg-popover ring-1 ring-foreground/20 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:rounded-xl sm:pb-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-foreground">
                {RoomWord} settings
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close"
                className="touch-target shrink-0 sm:size-7"
              >
                <X />
              </Button>
            </div>

            <label className="block text-sm font-medium text-muted-foreground">
              {RoomWord} name
            </label>
            <Input
              value={settingsName}
              onChange={(e) => setSettingsName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleRename();
              }}
              maxLength={80}
              disabled={settingsBusy}
              className="mt-1.5"
            />
            {settingsError && (
              <p className="mt-2 text-sm text-loss">{settingsError}</p>
            )}
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                onClick={() => void handleRename()}
                disabled={
                  settingsBusy ||
                  !settingsName.trim() ||
                  settingsName.trim() === community?.name
                }
              >
                {settingsBusy ? "Saving …" : "Save name"}
              </Button>
            </div>

            <label className="mt-4 block text-sm font-medium text-muted-foreground">
              {isClassroom ? "What we're learning" : "House note"}
            </label>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {isClassroom
                ? "Change this whenever the lesson changes. Students see it at the top."
                : "One paragraph for the room. Public circles show this on Discover too."}
            </p>
            <Textarea
              value={settingsNote}
              onChange={(e) => setSettingsNote(e.target.value)}
              maxLength={isClassroom ? 800 : 400}
              rows={3}
              disabled={settingsBusy}
              placeholder={
                isClassroom
                  ? "Week 2: only sell. Write why you sold."
                  : "Family portfolios, today's prices, no advice."
              }
              className="mt-1.5 min-h-20"
            />
            <div className="mt-2 flex justify-end">
              <Button
                type="button"
                onClick={() => void handleSaveHouseNote()}
                disabled={
                  settingsBusy ||
                  settingsNote.trim() === (community?.house_note ?? "").trim()
                }
              >
                {settingsBusy ? "Saving …" : "Save note"}
              </Button>
            </div>

            {isClassroom ? (
              <>
                <ClassroomPlanEditor
                  plan={planFromCommunity(community?.class_plan)}
                  trade={community?.classTrade ?? null}
                  busy={settingsBusy}
                  onStart={(kind) => void handleStartPeriod(kind)}
                  onSavePlan={(plan) => void handleSaveClassPlan(plan)}
                />
                <div className="mt-4">
                  <StartingCashField
                    value={settingsStartingCash}
                    onChange={setSettingsStartingCash}
                    disabled={settingsBusy}
                  />
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Changing this adds the difference to, or takes it from, every
                  paper portfolio already handed out. Classes are always
                  invite-only.
                </p>
                <div className="mt-2 flex justify-end">
                  <Button
                    type="button"
                    onClick={() => void handleSaveStartingCash()}
                    disabled={
                      settingsBusy ||
                      Number(settingsStartingCash) === startingCash
                    }
                  >
                    {settingsBusy ? "Saving …" : "Save starting cash"}
                  </Button>
                </div>
              </>
            ) : (
            <div className="mt-4 border-t border-border pt-4">
              <label className="block text-sm font-medium text-muted-foreground">
                Visibility
              </label>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {community?.visibility === "public"
                  ? "Public: anyone signed in can find this circle and ask to join. You still approve every request."
                  : "Private: invite-only. No one can find or join without a link."}
              </p>
              <Segmented
                className="mt-2"
                ariaLabel="Visibility"
                columns={2}
                disabled={settingsBusy}
                value={community?.visibility ?? "private"}
                onChange={(id) => void handleVisibilityChange(id)}
                options={[
                  { id: "private" as const, label: "Private" },
                  { id: "public" as const, label: "Public" },
                ]}
              />
            </div>
            )}

            {isAdmin && (
              <div className="mt-6 rounded-xl border border-loss/40 bg-loss/10 p-3.5">
                <p className="text-sm font-semibold text-loss">
                  Danger zone
                </p>
                <p className="mt-1 text-sm leading-relaxed text-loss">
                  Deleting {thisRoomWord} removes it for every member. Their own
                  portfolios and holdings are never affected.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSettingsOpen(false);
                    setDeleteConfirmOpen(true);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-loss/40 bg-loss/10 px-3 py-1.5 text-sm font-semibold text-loss hover:bg-loss/15"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete this {roomWord}
                </button>
              </div>
            )}
          </div>
        </ViewportOverlay>
      )}

      {bestiaryOpen && (
        <ViewportOverlay
          className="z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
          onClose={() => setBestiaryOpen(false)}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            aria-label="Close"
            onClick={() => setBestiaryOpen(false)}
          />
          <div className="scroll-host relative max-h-full w-full overflow-y-auto rounded-t-xl bg-popover ring-1 ring-foreground/20 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-lg sm:rounded-xl sm:pb-6">
            <div className="mb-1 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  The power animal field guide
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Every portfolio gets scored on how spread out it is, how jumpy
                  the companies are, and how big the largest holding is. Then it
                  gets the animal that fits. A fun lens, not a grade.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setBestiaryOpen(false)}
                aria-label="Close"
                className="touch-target shrink-0 sm:size-7"
              >
                <X />
              </Button>
            </div>
            {/*
              A mirror before a glossary.

              This was twenty-one identical cards in decision order, so the
              reader's own animal and the ones actually in the room were no
              easier to find than the eighteen nobody here has. Yours first,
              with the sentence explaining why you got it, then the ones
              present in this circle and who has them, then the rest.
            */}
            <div className="flex flex-col mt-4 gap-3">
              {bestiaryGroups.map((group) => (
                <Fragment key={group.title}>
                  <p className="mt-2 text-sm font-medium text-muted-foreground first:mt-0">
                    {group.title}
                  </p>
                  {group.animals.map((a) => {
                const tone = animalCardTone(a.id);
                const who = bestiaryHolders.get(a.id);
                return (
                  <div
                    key={a.id}
                    className="card-sheen glass relative overflow-hidden rounded-xl p-4 pl-5 ring-1 ring-foreground/20"
                  >
                    <span
                      className={cn("absolute inset-y-0 left-0 w-1", tone.bar)}
                      aria-hidden
                    />
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-2xl",
                          tone.well
                        )}
                        aria-hidden
                      >
                        {a.emoji}
                      </span>
                      <div className="min-w-0">
                        <p className={cn("text-sm font-semibold", tone.name)}>
                          {a.animal}
                        </p>
                        <p className="text-sm text-muted-foreground">{a.criteria}</p>
                      </div>
                    </div>
                    {who ? (
                      <p className="mt-2 text-sm text-foreground">{who}</p>
                    ) : null}
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {a.vibe}
                    </p>
                    <div className="flex flex-col mt-2 gap-1 text-sm leading-relaxed">
                      <p className="flex gap-1.5 text-gain">
                        <Shield className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>{a.strength}</span>
                      </p>
                      <p className="flex gap-1.5 text-caution">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>{a.watchFor}</span>
                      </p>
                    </div>
                  </div>
                );
              })}
                </Fragment>
              ))}
            </div>
          </div>
        </ViewportOverlay>
      )}
    </SignInGate>
  );
}
