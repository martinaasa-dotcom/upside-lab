"use client";

import { ClassroomRoster } from "@/components/ClassroomRoster";
import { ClassTradeBanner } from "@/components/ClassTradeBanner";
import {
  ClassroomPlanEditor,
  planFromCommunity,
} from "@/components/ClassroomPlanEditor";
import { DailyDuelCard } from "@/components/DailyDuelCard";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import { ShareSheets } from "@/components/ShareSheets";
import { SignInGate } from "@/components/SignInGate";
import { AppHeader } from "@/components/AppHeader";
import { MobileDock } from "@/components/mobile/MobileDock";
import { track } from "@vercel/analytics";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Checkbox } from "@/components/ui/checkbox";
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
  type ClassroomTrade,
  type ThesisCoverage,
} from "@/lib/classroom";
import { NO_VALUE, cashtag, cn, currency, percent, signedCurrency, signedPercent, signedTone } from "@/lib/format";
import { listingCurrenciesAreMixed, listingCurrency, listingPriceDigits } from "@/lib/listing-currency";
import {
  FluidRow,
  FluidTable,
  cellBase,
  cellTicker,
  tableCols,
} from "@/components/FluidTable";
import { TickerSymbol } from "@/components/TickerSymbol";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Score,
  Scoreboard,
  Segmented,
  SwatchLegend,
} from "@/components/ui/Panel";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
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
  THEME_COLOR,
  THEME_LABEL,
  animalCardTone,
  type PortfolioPersonality,
} from "@/lib/portfolio-personality";
import {
  forecastThemeForTicker,
  type ForecastTheme,
} from "@/lib/forecast-conviction";
import { buildCommunityFunFacts } from "@/lib/community-fun-facts";
import { loadCachedQuotes, mergeQuotes, saveCachedQuotes, quotesUnchanged } from "@/lib/quote-cache";
import { COMPOUND_MILESTONE_GOALS } from "@/lib/compound-play";
import { todayKeyInTz } from "@/lib/timezone";
import type { Holding, Portfolio, Quote } from "@/lib/types";
import {
  Award,
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  Globe,
  GraduationCap,
  HelpCircle,
  Lightbulb,
  Link2,
  Lock,
  LogOut,
  Medal,
  Layers,
  PieChart,
  Settings,
  Shield,
  Shuffle,
  Sparkles,
  Trash2,
  Trophy,
  UserCheck,
  UserMinus,
  Users,
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
import { quotePollMs, quotesUrl, isQuotePollFresh } from "@/lib/market/session";
import { quoteAsOfTitle } from "@/lib/market/quote-freshness";
import { isAbortError, isNetworkError } from "@/lib/abort";
import { useTimeout } from "@/lib/use-timeout";
import { useNetworkResume } from "@/lib/use-network-resume";
import {
  inviteDayLabel,
  inviteLockLabel,
  inviteUsesLabel,
  type InviteAdminRow,
} from "@/lib/community-invite-admin";

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio?: string | null;
};

type Member = {
  user_id: string;
  user_ids?: string[];
  emails?: string[];
  role: string;
  joined_at: string;
  profile: Profile | null;
  is_you?: boolean;
};

type PendingMember = {
  key: string;
  label: string;
  portfolio_ids: string[];
  emails: string[];
};

type CommunityMeta = {
  id: string;
  name: string;
  visibility?: "public" | "private";
  kind?: "circle" | "classroom";
  starting_cash?: number;
  house_note?: string | null;
  class_plan?: unknown;
  classTrade?: ClassroomTrade | null;
  created_by: string | null;
};

type JoinRequest = {
  id: string;
  user_id: string;
  message: string | null;
  requested_at: string;
  profile: {
    display_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
};

type OwnedPortfolio = Portfolio & { owner_id?: string };

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

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  const first = parts[0]![0] ?? "";
  const last = parts[parts.length - 1]![0] ?? "";
  return `${first}${last}`.toUpperCase();
}

function SharedNameRow({
  ticker,
  people,
  todayPct,
  avatarByName,
}: {
  ticker: string;
  people: string[];
  todayPct: number | null;
  avatarByName: Map<string, string>;
}) {
  return (
    <Item size="sm" className="px-0">
      <ItemMedia className="w-20">
        <AvatarGroup>
          {people.map((name) => {
            const src = avatarByName.get(name);
            return (
              <Avatar key={name} size="sm">
                {src ? <AvatarImage src={src} alt="" /> : null}
                <AvatarFallback>{initialsFromName(name)}</AvatarFallback>
              </Avatar>
            );
          })}
        </AvatarGroup>
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{cashtag(ticker)}</ItemTitle>
        <ItemDescription className="line-clamp-none">
          {people.join(" · ")}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            signedTone(todayPct, "text-muted-foreground")
          )}
        >
          {todayPct != null ? signedPercent(todayPct) : NO_VALUE}
        </span>
      </ItemActions>
    </Item>
  );
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
    setQuotes(loadCachedQuotes().quotes);
    setDuelCache(loadCommunityDuelCache(communityId, currentDuelSessionKey()));
    hasDataRef.current = Boolean(cache.meta);
    setLoading(!cache.meta);
    bootstrappedRef.current = false;
    fromPopRef.current = false;

    const params = new URLSearchParams(window.location.search);
    setSelectedOwnerId(params.get("member"));
    const rawView = params.get("view");
    if (rawView === "members") setView("members");
    else if (rawView === "play" || rawView === "league") setView("play");
    else setView("overview");
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
            ? "You look offline. Showing this circle when the connection is back."
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

    if (!bootstrappedRef.current) {
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
    const tick = async () => {
      if (cancelled || document.hidden) return;
      if (!isWorkspaceRoomActive(`community:${communityId}`)) return;
      if (isQuotePollFresh(quotesAtRef.current)) return;
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
    void tick();
    schedule();
    const onVisible = () => {
      if (!document.hidden) void tick();
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
  // animals grid, leaderboard, risk comparison, and fun facts — instead of
  // each section re-deriving its own copy of "which sheets does this
  // person own".
  type PersonMilestone = {
    total: number;
    hitCount: number;
    goalCount: number;
    next: number | null;
    remaining: number;
    progress: number;
    lastGoal: number;
  };
  type MemberStat = {
    id: string;
    name: string;
    isYou: boolean;
    isPending: boolean;
    sheetCount: number;
    sheetKey: string;
    totalValue: number;
    todayDollar: number;
    todayPct: number | null;
    /** Always 0 in community. Cost is not shared. */
    roiPct: number;
    personality: PortfolioPersonality | null;
    milestone: PersonMilestone;
  };

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

  const isClassroom = community?.kind === "classroom";
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

  // Fun superlative badges — deliberately don't repeat what the leaderboard
  // already shows (today's move, lifetime return); these highlight the
  // axes only Power Animals surfaces, so nothing here is a duplicate view
  // of another section's data.
  type Achievement = {
    id: string;
    emoji: string;
    title: string;
    winner: string;
    winnerId: string;
    stat: string;
    description: string;
  };
  const achievements = useMemo<Achievement[]>(() => {
    const withPersonality = membersWithBooks.filter((m) => m.personality);
    if (withPersonality.length === 0) return [];
    const out: Achievement[] = [];

    const mostDiversified = [...withPersonality].sort(
      (a, b) => b.personality!.diversificationScore - a.personality!.diversificationScore
    )[0]!;
    out.push({
      id: "diversifier",
      emoji: "🌐",
      title: "Most spread out",
      winner: mostDiversified.name,
      winnerId: mostDiversified.id,
      stat: `${mostDiversified.personality!.diversificationScore}/100`,
      description: "Most spread-out portfolio in the circle.",
    });

    const mostRisk = [...withPersonality].sort(
      (a, b) => b.personality!.riskScore - a.personality!.riskScore
    )[0]!;
    out.push({
      id: "risk-taker",
      emoji: "🔥",
      title: "Hottest portfolio",
      winner: mostRisk.name,
      winnerId: mostRisk.id,
      stat: `${mostRisk.personality!.riskScore}/100`,
      description: "The jumpiest mix of names in the circle.",
    });

    const steadiest = [...withPersonality].sort(
      (a, b) => a.personality!.riskScore - b.personality!.riskScore
    )[0]!;
    out.push({
      id: "steady-hand",
      emoji: "🛡️",
      title: "The Steady Hand",
      winner: steadiest.name,
      winnerId: steadiest.id,
      stat: `${steadiest.personality!.riskScore}/100`,
      description: "Calmest portfolio in the circle.",
    });

    const mostConviction = [...withPersonality].sort(
      (a, b) => b.personality!.convictionScore - a.personality!.convictionScore
    )[0]!;
    if (mostConviction.personality!.convictionScore >= 30) {
      out.push({
        id: "conviction",
        emoji: "🎯",
        title: "Biggest bet",
        winner: mostConviction.name,
        winnerId: mostConviction.id,
        stat: `${mostConviction.personality!.convictionScore}%${
          mostConviction.personality!.topTicker
            ? ` ${cashtag(mostConviction.personality!.topTicker)}`
            : ""
        }`,
        description: "Biggest single name relative to the rest of the portfolio.",
      });
    }

    const mostThemes = [...withPersonality].sort(
      (a, b) => b.personality!.themeCount - a.personality!.themeCount
    )[0]!;
    if (mostThemes.personality!.themeCount >= 2) {
      out.push({
        id: "themes",
        emoji: "🗺️",
        title: "Most kinds of stocks",
        winner: mostThemes.name,
        winnerId: mostThemes.id,
        stat: `${mostThemes.personality!.themeCount} groups`,
        description: "Holds the most different kinds of businesses.",
      });
    }

    const mostCash = [...withPersonality].sort(
      (a, b) => b.personality!.cashPct - a.personality!.cashPct
    )[0]!;
    if (mostCash.personality!.cashPct >= 8) {
      out.push({
        id: "dry-powder",
        emoji: "💧",
        title: "Most cash",
        winner: mostCash.name,
        winnerId: mostCash.id,
        stat: `${mostCash.personality!.cashPct}% cash`,
        description: "Largest cash stash relative to the portfolio.",
      });
    }

    const mostSpecialist = [...withPersonality]
      .filter((m) => m.personality!.specialistScore >= 55)
      .sort(
        (a, b) => b.personality!.specialistScore - a.personality!.specialistScore
      )[0];
    if (mostSpecialist) {
      out.push({
        id: "specialist",
        emoji: "⬡",
        title: "One-kind diet",
        winner: mostSpecialist.name,
        winnerId: mostSpecialist.id,
        stat: `${mostSpecialist.personality!.specialistScore}%`,
        description: "Heaviest bet on one kind of business.",
      });
    }
    const biggestBook = [...membersWithBooks].sort(
      (a, b) => b.totalValue - a.totalValue
    )[0]!;
    const smallestBook = [...membersWithBooks].sort(
      (a, b) => a.totalValue - b.totalValue
    )[0]!;
    if (biggestBook.id !== smallestBook.id) {
      out.push({
        id: "big-book",
        emoji: "🏦",
        title: "Largest portfolio",
        winner: biggestBook.name,
        winnerId: biggestBook.id,
        stat: currency(biggestBook.totalValue, 0),
        description: "Largest portfolio in the circle.",
      });
      out.push({
        id: "small-mighty",
        emoji: "🌱",
        title: "Small but Mighty",
        winner: smallestBook.name,
        winnerId: smallestBook.id,
        stat: currency(smallestBook.totalValue, 0),
        description: "Smallest portfolio. Every circle has a sapling.",
      });
    }

    const closestToGoal = [...membersWithBooks]
      .filter((m) => m.milestone.next != null)
      .sort((a, b) => a.milestone.remaining - b.milestone.remaining)[0];
    if (closestToGoal) {
      out.push({
        id: "closest-milestone",
        emoji: "🏁",
        title: "On the Doorstep",
        winner: closestToGoal.name,
        winnerId: closestToGoal.id,
        stat: `${currency(closestToGoal.milestone.remaining, 0)} away`,
        description: `Closest to hitting ${currency(closestToGoal.milestone.next ?? 0, 0)}.`,
      });
    }

    return out;
  }, [membersWithBooks]);

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

  const [funFactsShuffle, setFunFactsShuffle] = useState(0);
  const communityFunFacts = useMemo(
    () =>
      buildCommunityFunFacts(
        membersWithBooks,
        funFactsShuffle === 0 ? todayKeyInTz() : `shuffle-${funFactsShuffle}`,
        6
      ),
    [membersWithBooks, funFactsShuffle]
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

  const selectedCash = ownerPortfolios.reduce(
    (s, p) => s + sheetCashBalance(p),
    0
  );

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

  async function copyInviteLink(url: string | null, key: string) {
    let resolved = url;
    if (!resolved && key !== "fresh") {
      try {
        const res = await fetch(
          `/api/communities/${communityId}/invites/${key}`
        );
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          path?: string;
        };
        if (!res.ok) {
          throw new Error(plainError(data.error, "Couldn't copy that link."));
        }
        const path = typeof data.path === "string" ? data.path : "";
        if (!path) throw new Error("Couldn't copy that link.");
        resolved = `${window.location.origin}${path}`;
        setInvites((rows) =>
          rows.map((inv) => (inv.id === key ? { ...inv, path } : inv))
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't copy that link.");
        return;
      }
    }
    if (!resolved) {
      setError("Couldn't copy that link.");
      return;
    }
    const ok = await copyText(resolved);
    if (!ok) {
      setError("Couldn't copy that link. Select it and copy by hand.");
      setInviteUrl(resolved);
      return;
    }
    setError(null);
    setCopiedInviteId(key);
    later(() => setCopiedInviteId((id) => (id === key ? null : id)), 1500);
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

  return (
    <SignInGate>
      <div className={PAGE_FRAME_CLASS}>
        <MobileDock active="circle" />
        <AppHeader
          mobileTitle={community?.name ?? "Community"}
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
              <span className="truncate">{community?.name ?? "Community"}</span>
              {community && (
                <span
                  title={
                    community.kind === "classroom"
                      ? "Paper class"
                      : community.visibility === "public"
                        ? "Public community"
                        : "Private community"
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
          {loading && (
            <p className="text-sm text-muted-foreground">Loading community …</p>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!loading && !selectedOwnerId && (
            <>
              <section className="flex flex-col gap-3">
                <h1 className="text-2xl font-semibold text-foreground">
                  {community?.name ?? "Community"}
                </h1>
                {isClassroom &&
                community?.classTrade &&
                (community.classTrade.kind !== "open" ||
                  community.classTrade.until) ? (
                  <ClassTradeBanner
                    trade={community.classTrade}
                    teacherNote={
                      isAdmin
                        ? "You can still edit. Students cannot."
                        : undefined
                    }
                  />
                ) : community?.house_note?.trim() ? (
                  <p className="text-sm leading-relaxed text-foreground">
                    {community.house_note.trim()}
                  </p>
                ) : null}
                {isClassroom && !myClassSheet ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl glass ring-1 ring-foreground/20 px-6 py-4">
                    <p className="min-w-0 flex-1 text-sm text-foreground">
                      {isAdmin
                        ? "You are watching the class. Get a paper portfolio if you want to trade alongside them."
                        : "Your paper portfolio is not ready yet. Same starting cash as everyone else."}
                    </p>
                    <Button
                      type="button"
                      className="shrink-0"
                      disabled={claimBusy}
                      onClick={() => void claimClassSheet()}
                    >
                      {claimBusy ? "Making portfolio …" : "Get paper portfolio"}
                    </Button>
                  </div>
                ) : null}
                {isClassroom && myClassSheet ? (
                  <p className="text-sm text-muted-foreground">
                    Open your paper portfolio to buy names. Sunday note is
                    the weekly recap.
                  </p>
                ) : null}
              </section>

              <Segmented
                ariaLabel="Community view"
                value={view}
                onChange={setView}
                options={
                  isClassroom
                    ? [
                        { id: "overview" as const, label: "Roster" },
                        { id: "members" as const, label: "Members" },
                      ]
                    : [
                        { id: "overview" as const, label: "Overview" },
                        { id: "play" as const, label: "League" },
                        { id: "members" as const, label: "Members" },
                      ]
                }
              />

              <WidgetErrorBoundary name="Community totals">
                <Scoreboard cols={3}>
                  <Score
                    label="Today"
                    value={
                      overview.totals.todayPct != null
                        ? signedPercent(overview.totals.todayPct)
                        : NO_VALUE
                    }
                    sub={signedCurrency(overview.totals.todayDollar)}
                    tone={
                      (overview.totals.todayPct ?? 0) > 0
                        ? "up"
                        : (overview.totals.todayPct ?? 0) < 0
                          ? "down"
                          : undefined
                    }
                  />
                  <Score
                    label="Total value"
                    value={currency(overview.totals.totalValue)}
                  />
                  {isClassroom ? (
                    <Score
                      label="vs start"
                      value={
                        classVsStartPct != null
                          ? signedPercent(classVsStartPct)
                          : NO_VALUE
                      }
                      sub={`${signedCurrency(classVsStartDollar)} · ${currency(startingCash)} each`}
                      tone={
                        (classVsStartPct ?? 0) > 0
                          ? "up"
                          : (classVsStartPct ?? 0) < 0
                            ? "down"
                            : undefined
                      }
                    />
                  ) : (
                    <Score
                      label="Cash"
                      value={currency(overview.totals.cash)}
                      tone={overview.totals.cash < 0 ? "down" : undefined}
                    />
                  )}
                </Scoreboard>
              </WidgetErrorBoundary>

              {(effectiveView === "overview" || effectiveView === "play") && (
                <div className="flex flex-col gap-3">
                  {effectiveView === "overview" && isClassroom && (
                    <WidgetErrorBoundary name="Class roster" resetKey={communityId}>
                    <ClassroomRoster
                      members={memberStats.map((m) => ({
                        id: m.id,
                        name: m.name,
                        isYou: m.isYou,
                        sheetCount: m.sheetCount,
                        totalValue: m.totalValue,
                        todayDollar: m.todayDollar,
                        todayPct: m.todayPct,
                        topTicker: m.personality?.topTicker ?? null,
                        topWeight: m.personality?.convictionScore ?? null,
                      }))}
                      startingCash={startingCash}
                      holdings={holdings}
                      quotes={quotes}
                      ownership={ownership}
                      thesisCoverage={thesisCoverage}
                      onOpen={(id) => {
                        setSelectedOwnerId(id);
                      }}
                    />
                    </WidgetErrorBoundary>
                  )}
                  {effectiveView === "overview" &&
                    !isClassroom &&
                    membersWithBooks.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Nobody has shared a portfolio here yet. Pick which of
                      yours belong in this circle.
                    </p>
                  )}
                  {effectiveView === "overview" &&
                    isClassroom &&
                    membersWithBooks.length === 0 &&
                    isAdmin && (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm text-muted-foreground">
                        Send the invite. Each student gets the same starting
                        cash and an empty portfolio.
                      </p>
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => setView("members")}
                      >
                        Invite students
                      </Button>
                    </div>
                  )}
                  {effectiveView === "overview" &&
                    !isClassroom &&
                    membersWithBooks.length > 0 && (
                    <WidgetErrorBoundary name="Daily Duel" resetKey={communityId}>
                    <DailyDuelCard
                      compact
                      communityId={communityId}
                      initialDuel={duelCache}
                      tickers={overview.tickers.map((t) => ({
                        ticker: t.ticker,
                        todayPct: t.todayPct,
                      }))}
                    />
                    </WidgetErrorBoundary>
                  )}
                  {effectiveView === "play" && membersWithBooks.length > 0 && (
                    <section className="overview-fade order-3 rounded-xl glass ring-1 ring-foreground/20 p-6">
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="card-sheen glass-well rounded-xl p-2 text-primary">
                            <Sparkles className="h-4 w-4" />
                          </div>
                          <div>
                            <h3 className="text-foreground">
                              Power animals
                            </h3>
                            <p className="mt-0.5 text-sm text-muted-foreground">
                              How each portfolio is built. Tap someone to open their
                              portfolios.
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label="Field guide"
                          onClick={() => setBestiaryOpen(true)}
                        >
                          <HelpCircle data-icon="inline-start" />
                          <span className="hidden sm:inline">Field guide</span>
                        </Button>
                      </div>
                      <div className="grid gap-6 lg:grid-cols-2 lg:gap-y-5">
                        {membersWithBooks.map((m) => (
                          <PowerAnimalCard
                            key={m.id}
                            name={m.name}
                            isYou={m.isYou}
                            isPending={m.isPending}
                            totalValue={m.totalValue}
                            todayPct={m.todayPct}
                            personality={m.personality}
                            milestone={m.milestone}
                            onOpen={() => {
                              setSelectedOwnerId(m.id);
                            }}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {effectiveView === "play" && achievements.length > 0 && (
                    <section className="overview-fade order-2 rounded-xl glass ring-1 ring-foreground/20 p-6">
                      <div className="mb-4 flex items-center gap-2.5">
                        <div className="card-sheen glass-well rounded-lg p-2 text-muted-foreground">
                          <Award className="size-4" />
                        </div>
                        <div>
                          <h3 className="text-foreground">
                            Community superlatives
                          </h3>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            Fun awards pulled from the numbers above
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {achievements.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => {
                              setSelectedOwnerId(a.winnerId);
                            }}
                            className="veil-hover card-sheen glass-well flex w-full flex-col gap-1.5 rounded-lg p-3 text-left ring-1 ring-foreground/20 transition hover:scale-[1.01] hover:ring-primary/25"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-sm leading-none"
                                aria-hidden
                              >
                                {a.emoji}
                              </span>
                              <p className="text-sm font-medium tracking-tight text-foreground">
                                {a.title}
                              </p>
                            </div>
                            <p className="text-sm">
                              <span className="font-semibold text-foreground">
                                {a.winner}
                              </span>
                              <span className="text-muted-foreground">
                                {" · "}
                                {a.stat}
                              </span>
                            </p>
                            <p className="text-sm leading-relaxed text-muted-foreground">
                              {a.description}
                            </p>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  {effectiveView === "overview" && membersWithBooks.length > 0 && (
                    <section className="overview-fade order-1 rounded-xl glass ring-1 ring-foreground/20 p-6">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="card-sheen glass-well rounded-xl p-2 text-primary">
                            <Trophy className="h-4 w-4" />
                          </div>
                          <div>
                            <h3 className="text-foreground">
                              Today
                            </h3>
                            <p className="mt-0.5 text-sm text-muted-foreground">
                              Ranked by today&apos;s percent, not dollar size
                            </p>
                          </div>
                        </div>
                      </div>
                      <ItemGroup className="gap-0 has-data-[size=sm]:gap-0">
                        {[...membersWithBooks]
                          .sort(
                            (a, b) => (b.todayPct ?? -1) - (a.todayPct ?? -1)
                          )
                          .map((m, i) => {
                            const pct = m.todayPct;
                            return (
                              <Fragment key={m.id}>
                                {i > 0 ? (
                                  <ItemSeparator className="my-0" />
                                ) : null}
                                <Item
                                  asChild
                                  size="sm"
                                  className="px-0 hover:bg-muted"
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedOwnerId(m.id);
                                    }}
                                    className="cursor-pointer text-left"
                                  >
                                    <ItemMedia>
                                      {/* Gold/silver/bronze is not a
                                        * palette this app has. The three
                                        * medals are one accent stepping
                                        * down in strength instead, so
                                        * rank still reads at a glance
                                        * without borrowing the warning
                                        * orange for third place -- an
                                        * alert colour on a leaderboard
                                        * row that is not an alert. */}
                                      {i === 0 ? (
                                        <Medal className="size-4 text-primary" />
                                      ) : i === 1 ? (
                                        <Medal className="size-4 text-primary/65" />
                                      ) : i === 2 ? (
                                        <Medal className="size-4 text-primary/40" />
                                      ) : (
                                        <span className="w-4 text-center text-sm tabular-nums text-muted-foreground">
                                          {i + 1}
                                        </span>
                                      )}
                                    </ItemMedia>
                                    <ItemContent>
                                      <ItemTitle>
                                        {m.name}
                                        {m.isYou ? (
                                          <span className="font-normal text-muted-foreground">
                                            (you)
                                          </span>
                                        ) : null}
                                      </ItemTitle>
                                    </ItemContent>
                                    {/* Fixed-width so a wide dollar figure
                                      * cannot shove the percent column. */}
                                    <ItemActions className="shrink-0">
                                      <span
                                        className={cn(
                                          "w-16 text-right text-sm font-semibold tabular-nums",
                                          signedTone(
                                            pct,
                                            "text-muted-foreground"
                                          )
                                        )}
                                      >
                                        {pct != null ? percent(pct) : NO_VALUE}
                                      </span>
                                      <span
                                        className={cn(
                                          "hidden w-24 text-right text-sm tabular-nums sm:inline-block",
                                          signedTone(
                                            m.todayDollar,
                                            "text-muted-foreground"
                                          )
                                        )}
                                      >
                                        {signedCurrency(m.todayDollar, 0)}
                                      </span>
                                    </ItemActions>
                                  </button>
                                </Item>
                              </Fragment>
                            );
                          })}
                      </ItemGroup>
                    </section>
                  )}

                  {effectiveView === "overview" && !isClassroom && sharedNames.length > 0 && (
                    <section className="overview-fade order-4 rounded-xl glass ring-1 ring-foreground/20 p-6">
                      <div className="mb-4 flex items-center gap-2.5">
                        <div className="rounded-xl bg-gain/15 p-2 text-gain">
                          <Layers className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-foreground">
                            Shared names
                          </h3>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            Who else is in the same name today
                          </p>
                        </div>
                      </div>
                      <ItemGroup className="gap-0 has-data-[size=sm]:gap-0">
                        {sharedNames.map((row, i) => (
                          <Fragment key={row.ticker}>
                            {i > 0 ? <ItemSeparator className="my-0" /> : null}
                            <SharedNameRow
                              ticker={row.ticker}
                              people={row.people}
                              todayPct={row.todayPct}
                              avatarByName={avatarByName}
                            />
                          </Fragment>
                        ))}
                      </ItemGroup>
                    </section>
                  )}

                  {effectiveView === "play" && communityThemeBreakdown.length > 0 && (
                    <section className="overview-fade order-5 rounded-xl glass ring-1 ring-foreground/20 p-6">
                      <div className="mb-4 flex items-center gap-2.5">
                        <div className="card-sheen glass-well rounded-xl p-2 text-primary">
                          <PieChart className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-foreground">
                            What the circle owns
                          </h3>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            Everyone&apos;s holdings pooled by kind of
                            business. How the circle is built, not a
                            recommendation.
                          </p>
                        </div>
                      </div>
                      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                        {communityThemeBreakdown.map((t) => (
                          <div
                            key={t.theme}
                            style={{
                              width: `${Math.max(1.5, t.pct * 100)}%`,
                              backgroundColor: THEME_COLOR[t.theme],
                            }}
                            title={`${t.label}: ${Math.round(t.pct * 100)}%`}
                          />
                        ))}
                      </div>
                      <SwatchLegend
                        className="mt-4"
                        items={communityThemeBreakdown.map((t) => ({
                          key: t.theme,
                          label: t.label,
                          color: THEME_COLOR[t.theme],
                          value: `${Math.round(t.pct * 100)}%`,
                        }))}
                      />
                    </section>
                  )}

                  {effectiveView === "play" && (
                  <section className="overview-fade order-6 rounded-xl glass ring-1 ring-foreground/20 p-6">
                    <div className="mb-4 flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="card-sheen glass-well rounded-xl p-2 text-primary">
                          <Lightbulb className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-foreground">
                            Community fun facts
                          </h3>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {funFactsShuffle > 0
                              ? "Shuffled, reload for the daily batch"
                              : "New batch every day"}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="touch-target"
                        onClick={() => setFunFactsShuffle((n) => n + 1)}
                        title="Get a fresh random batch"
                      >
                        <Shuffle data-icon="inline-start" />
                        Shuffle
                      </Button>
                    </div>
                    {communityFunFacts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Not enough data yet. Check back once portfolios load.
                      </p>
                    ) : (
                      <ItemGroup className="gap-0 has-data-[size=sm]:gap-0">
                        {communityFunFacts.map((fact, i) => (
                          <Fragment key={`${i}-${fact.slice(0, 24)}`}>
                            {i > 0 ? (
                              <ItemSeparator className="my-0" />
                            ) : null}
                            {/* The number and the sentence sit on one
                              * baseline, which takes both halves of this.
                              *
                              * A plain `<p>`, not `ItemDescription`: that
                              * primitive is a two-line clamp in muted grey
                              * at `leading-normal`, and this call site was
                              * already overriding all three. Keeping it
                              * only bought `ItemMedia`'s
                              * `group-has-data-[slot=item-description]`
                              * rules -- a `translate-y-0.5` nudge and a
                              * `self-start` -- which exist to drop an
                              * *icon* level with a title above a
                              * description. There is no title here, so the
                              * nudge just pushed the numeral off the
                              * sentence's baseline.
                              *
                              * `leading-relaxed` on the media then matches
                              * the two line boxes exactly, so the numeral
                              * and the first line share a half-leading and
                              * land on the same baseline by construction
                              * rather than by a hand-tuned offset. */}
                            <Item className="items-start px-0">
                              <ItemMedia
                                className="w-4 justify-start self-start text-sm leading-relaxed tabular-nums text-muted-foreground"
                                aria-hidden
                              >
                                {i + 1}
                              </ItemMedia>
                              <ItemContent>
                                <p className="text-sm leading-relaxed text-foreground">
                                  {fact}
                                </p>
                              </ItemContent>
                            </Item>
                          </Fragment>
                        ))}
                      </ItemGroup>
                    )}
                  </section>
                  )}
                </div>
              )}

              {!isClassroom && (
                <div
                  className={
                    effectiveView === "members" ||
                    (effectiveView === "overview" &&
                      membersWithBooks.length === 0)
                      ? undefined
                      : "hidden"
                  }
                >
                  <ShareSheets
                    communityId={communityId}
                    onChanged={() => void load()}
                  />
                </div>
              )}

              {effectiveView === "members" && (
                <>
                  <section className="flex flex-col gap-3">
                    <h2 className="flex items-center gap-2 text-foreground">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      Members
                    </h2>
                    <ul className="divide-y divide-border overflow-hidden rounded-xl glass ring-1 ring-foreground/20">
                      {members.map((m) => {
                        const sheetIds = new Set(
                          ownership
                            .filter((o) => o.user_id === m.user_id)
                            .map((o) => o.portfolio_id)
                        );
                        const sheets = portfolios.filter((p) => sheetIds.has(p.id));
                        const sheetValue = sheets.reduce((sum, p) => {
                          const score = overview.sheets.find(
                            (s) => s.portfolio.id === p.id
                          );
                          return sum + (score?.totalValue ?? 0);
                        }, 0);
                        const sheetToday = sheets.reduce((sum, p) => {
                          const score = overview.sheets.find(
                            (s) => s.portfolio.id === p.id
                          );
                          return sum + (score?.todayDollar ?? 0);
                        }, 0);
                        const sheetTodayPct = bookTodayPct(sheetValue, sheetToday);
                        const memberCash = sheets.reduce(
                          (sum, p) => sum + sheetCashBalance(p),
                          0
                        );
                        const memberTickerValues = holdings
                          .filter((h) => sheetIds.has(h.portfolio_id))
                          .map((h) => ({
                            ticker: h.ticker,
                            value:
                              h.shares * (quotes[h.ticker]?.price ?? 0),
                          }));
                        const personality =
                          memberTickerValues.length > 0
                            ? buildPortfolioPersonality(
                                memberTickerValues,
                                memberCash
                              )
                            : null;
                        const emails = memberEmails(m);
                        const animalTone = personality
                          ? animalCardTone(personality.archetype.id)
                          : null;
                        return (
                          <li
                            key={m.user_id}
                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOwnerId(m.user_id);
                              }}
                              className="text-left"
                            >
                              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                {profileName(m.user_id)}
                                {m.is_you && (
                                  <span className="text-sm text-muted-foreground">
                                    (you)
                                  </span>
                                )}
                                {personality && animalTone && (
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm font-medium",
                                      animalTone.border,
                                      animalTone.wash,
                                      animalTone.name
                                    )}
                                    title={personality.whyThisAnimal}
                                  >
                                    <span aria-hidden>
                                      {personality.animalEmoji}
                                    </span>
                                    {personality.animal}
                                  </span>
                                )}
                              </div>
                              {m.profile?.bio ? (
                                <div className="text-sm text-muted-foreground">
                                  {m.profile.bio}
                                </div>
                              ) : null}
                              {emails.length > 1 ? (
                                <div className="text-sm text-muted-foreground">
                                  {emails.join(" · ")}
                                </div>
                              ) : null}
                              <div className="text-sm text-muted-foreground">
                                {m.role}
                                {" · "}
                                {sheets.length} portfolio
                                {sheets.length === 1 ? "" : "s"}
                                {sheets.length > 0 && (
                                  <>
                                    {" - today "}
                                    <span
                                      className={signedTone(
                                        sheetTodayPct,
                                        "text-muted-foreground"
                                      )}
                                    >
                                      {sheetTodayPct != null
                                        ? signedPercent(sheetTodayPct)
                                        : NO_VALUE}
                                    </span>
                                  </>
                                )}
                                {" · "}
                                {currency(sheetValue)}
                              </div>
                            </button>
                            {isAdmin && !m.is_you && (
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() =>
                                    void setRole(
                                      m.user_id,
                                      m.role === "admin" ? "member" : "admin"
                                    )
                                  }
                                >
                                  <Shield data-icon="inline-start" />
                                  {m.role === "admin" ? "Demote" : "Make admin"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() =>
                                    setRemoveTarget({
                                      userId: m.user_id,
                                      name: profileName(m.user_id),
                                    })
                                  }
                                >
                                  <UserMinus data-icon="inline-start" />
                                  Remove
                                </Button>
                              </div>
                            )}
                            {m.is_you && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => setLeaveOpen(true)}
                              >
                                <LogOut data-icon="inline-start" />
                                Leave
                              </Button>
                            )}
                          </li>
                        );
                      })}
                      {pendingMembers.map((p) => {
                        const sheets = portfolios.filter((x) =>
                          p.portfolio_ids.includes(x.id)
                        );
                        const sheetValue = sheets.reduce((sum, sheet) => {
                          const score = overview.sheets.find(
                            (s) => s.portfolio.id === sheet.id
                          );
                          return sum + (score?.totalValue ?? 0);
                        }, 0);
                        const sheetToday = sheets.reduce((sum, sheet) => {
                          const score = overview.sheets.find(
                            (s) => s.portfolio.id === sheet.id
                          );
                          return sum + (score?.todayDollar ?? 0);
                        }, 0);
                        const sheetTodayPct = bookTodayPct(sheetValue, sheetToday);
                        const ownerKey = `pending:${p.key}`;
                        return (
                          <li
                            key={ownerKey}
                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOwnerId(ownerKey);
                              }}
                              className="text-left"
                            >
                              <div className="text-sm font-medium text-foreground">
                                {p.label}
                                <span className="ml-2 text-sm font-normal text-caution">
                                  awaiting sign-in
                                </span>
                              </div>
                              {p.emails.length ? (
                                <div className="text-sm text-muted-foreground">
                                  {p.emails.join(" · ")}
                                </div>
                              ) : null}
                              <div className="text-sm text-muted-foreground">
                                {sheets.length} portfolio
                                {sheets.length === 1 ? "" : "s"}
                                {sheets.length > 0 && (
                                  <>
                                    {" - today "}
                                    <span
                                      className={signedTone(
                                        sheetTodayPct,
                                        "text-muted-foreground"
                                      )}
                                    >
                                      {sheetTodayPct != null
                                        ? signedPercent(sheetTodayPct)
                                        : NO_VALUE}
                                    </span>
                                  </>
                                )}
                                {" · "}
                                {currency(sheetValue)}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>

                  {isAdmin && joinRequests.length > 0 && (
                    <section className="card-sheen glass flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/20 sm:p-6">
                      <h2 className="flex items-center gap-2 text-foreground">
                        <UserCheck className="size-4 text-muted-foreground" />
                        Join requests
                        <Badge variant="secondary">{joinRequests.length}</Badge>
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        This community is public, so anyone can ask to join,
                        but nothing happens until you approve them here.
                      </p>
                      <ItemGroup>
                        {joinRequests.map((r) => (
                          <Item key={r.id} className="px-0">
                            <ItemContent>
                              <ItemTitle>
                                {r.profile?.display_name ??
                                  r.profile?.email ??
                                  "Unknown"}
                              </ItemTitle>
                              <ItemDescription>
                                {r.profile?.email}
                              </ItemDescription>
                            </ItemContent>
                            <ItemActions>
                              <Button
                                type="button"
                                size="xs"
                                disabled={joinDecisionBusyId === r.user_id}
                                onClick={() =>
                                  void decideJoinRequest(r.user_id, "approve")
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                type="button"
                                size="xs"
                                variant="outline"
                                disabled={joinDecisionBusyId === r.user_id}
                                onClick={() =>
                                  void decideJoinRequest(r.user_id, "reject")
                                }
                              >
                                Decline
                              </Button>
                            </ItemActions>
                          </Item>
                        ))}
                      </ItemGroup>
                    </section>
                  )}

                  {isAdmin && (
                    <section className="card-sheen glass flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/20 sm:p-6">
                      <h2 className="text-foreground">
                        Admin - invite
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {isClassroom
                          ? "This link works for 30 days. Students join with it. Each one gets the same paper cash and an empty portfolio. Put emails if you want us to send the link, and to lock it to those people. Separate them with a comma. Change the number of days if 30 is wrong for you."
                          : "This link works for 30 days. Anyone with it can join. Their portfolios show up here. They can turn one off later. Today's prices only. Put emails if you want us to send the link, and to lock it to those people. Separate them with a comma. Change the number of days if 30 is wrong for you."}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Input
                          type="text"
                          inputMode="email"
                          autoComplete="off"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="Emails (optional, comma between)"
                          className="min-w-[12rem] w-auto flex-1"
                        />
                        <Input
                          type="number"
                          min={1}
                          max={365}
                          inputMode="numeric"
                          value={inviteDays}
                          onChange={(e) => setInviteDays(e.target.value)}
                          disabled={inviteNeverExpires}
                          placeholder="Days live (30 by default)"
                          className="no-spinner w-[14rem] min-w-[14rem] shrink-0"
                        />
                        <Button
                          type="button"
                          disabled={busy}
                          onClick={() => void createInvite()}
                        >
                          <Link2 data-icon="inline-start" />
                          Create invite link
                        </Button>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox
                          checked={inviteNeverExpires}
                          onCheckedChange={(v) =>
                            setInviteNeverExpires(v === true)
                          }
                          aria-label="Link never expires"
                        />
                        Never expires. Anyone who ever sees this link can
                        join, so only use it somewhere private.
                      </label>
                      {inviteUrl && (
                        <Item className="items-start px-0">
                          <ItemContent>
                            {inviteEmailed > 0 ? (
                              <ItemTitle>
                                {inviteEmailed === 1
                                  ? "Sent the link to 1 person."
                                  : `Sent the link to ${inviteEmailed} people.`}
                              </ItemTitle>
                            ) : null}
                            <ItemDescription className="line-clamp-none break-all text-foreground">
                              {inviteUrl}
                            </ItemDescription>
                          </ItemContent>
                          <ItemActions>
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              onClick={() =>
                                void copyInviteLink(inviteUrl, "fresh")
                              }
                            >
                              {copiedInviteId === "fresh" ? (
                                <Check data-icon="inline-start" />
                              ) : (
                                <Copy data-icon="inline-start" />
                              )}
                              {copiedInviteId === "fresh" ? "Copied" : "Copy"}
                            </Button>
                          </ItemActions>
                        </Item>
                      )}
                      {invites.length > 0 && (
                        <ItemGroup className="gap-2">
                          {invites.map((inv) => {
                            const you = members.find((m) => m.is_you);
                            const youIds = you?.user_ids ?? (you ? [you.user_id] : []);
                            const creatorName =
                              inv.created_by && youIds.includes(inv.created_by.id)
                                ? "You"
                                : inv.created_by?.name ?? "Someone";
                            const usedNames = inv.used_by.map((u) => u.name);
                            const usedLine =
                              usedNames.length === 0
                                ? null
                                : usedNames.length <= 4
                                  ? usedNames.join(", ")
                                  : `${usedNames.slice(0, 4).join(", ")} and ${usedNames.length - 4} more`;
                            const statusLabel =
                              inv.status === "retired"
                                ? "Retired"
                                : inv.status === "expired"
                                  ? "Expired"
                                  : "Live";
                            const live = inv.status === "live";
                            const url = inv.path
                              ? `${window.location.origin}${inv.path}`
                              : null;
                            const copied = copiedInviteId === inv.id;
                            return (
                              <Item key={inv.id} variant="outline">
                                <ItemContent>
                                  <ItemTitle>
                                    {creatorName}
                                  </ItemTitle>
                                  <ItemDescription>
                                    {inviteLockLabel(inv.email)}
                                    {" · "}
                                    {inviteDayLabel(inv.created_at)}
                                    {" · "}
                                    {inviteUsesLabel(inv.uses)}
                                    {" · "}
                                    {statusLabel}
                                  </ItemDescription>
                                  {usedLine ? (
                                    <ItemDescription>
                                      {usedLine}
                                    </ItemDescription>
                                  ) : null}
                                </ItemContent>
                                <ItemActions>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={!live}
                                    title="Copy invite link"
                                    onClick={() =>
                                      void copyInviteLink(url, inv.id)
                                    }
                                  >
                                    {copied ? (
                                      <Check data-icon="inline-start" />
                                    ) : (
                                      <Copy data-icon="inline-start" />
                                    )}
                                    {copied ? "Copied" : "Copy link"}
                                  </Button>
                                  {live ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={busy}
                                      onClick={() => setRetireTarget(inv)}
                                    >
                                      Retire this link
                                    </Button>
                                  ) : null}
                                </ItemActions>
                              </Item>
                            );
                          })}
                        </ItemGroup>
                      )}
                    </section>
                  )}
                </>
              )}
            </>
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
                Back to community
              </Button>
              <div className="card-sheen glass sticky top-24 z-20 flex flex-col gap-3 rounded-xl p-4 shadow-sm ring-1 ring-foreground/20 sm:p-6">
                <p className="text-sm font-semibold text-foreground">
                  Read-only - owned by{" "}
                  {memberStats.find((m) => m.id === selectedOwnerId)?.name ??
                    profileName(selectedOwnerId)}
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  This is their portfolio. You can look, you cannot edit. Nothing
                  you tap here changes their holdings. Every portfolio they own is
                  pooled into one view here, so a name held in two of them shows
                  as a single line.
                </p>
              </div>

              <WidgetErrorBoundary
                name="Member portfolio"
                resetKey={selectedOwnerId ?? communityId}
              >
              <ReadOnlyHoldings
                holdings={selectedHoldings}
                quotes={quotes}
                cash={selectedCash}
              />
              </WidgetErrorBoundary>
            </section>
          )}
        </main>
      </div>

      <ConfirmModal
        open={Boolean(retireTarget)}
        title="Retire this link?"
        body="New people will not be able to join with it. People already in stay."
        confirmLabel="Retire this link"
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
        body={`Remove ${removeTarget?.name ?? "this member"} from the community? They'll lose read access to everyone else's portfolio and can be re-invited later.`}
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
        title="Leave this community?"
        body={`You'll stop seeing everyone else's portfolio in ${community?.name ?? "this community"}, and they'll stop seeing yours. Your own portfolios and holdings stay exactly as they are. You can rejoin later with an invite, or by requesting again if it's public.`}
        confirmLabel="Leave"
        destructive
        onClose={() => setLeaveOpen(false)}
        onConfirm={handleLeaveCommunity}
      />

      <ConfirmModal
        open={deleteConfirmOpen}
        title="Delete this community?"
        body={`This removes "${community?.name ?? "this community"}" for everyone. Members lose shared read access and the invite link stops working. Nobody's actual portfolio or holdings are touched, and it can't be undone.`}
        confirmLabel="Delete community"
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
          <div className="relative max-h-full w-full max-w-sm overflow-y-auto rounded-t-xl bg-popover ring-1 ring-foreground/20 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:rounded-xl sm:pb-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-foreground">
                Community settings
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
              Community name
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
                  Classes stay invite-only. Changing this adds or takes the
                  difference from every paper portfolio already handed out.
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
                  ? "Public: anyone signed in can find this community and ask to join. You still approve every request."
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
                  Deleting the community removes it for every member. Their
                  own portfolios and holdings are never affected.
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
                  Delete community
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
          <div className="relative max-h-full w-full overflow-y-auto rounded-t-xl bg-popover ring-1 ring-foreground/20 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-lg sm:rounded-xl sm:pb-6">
            <div className="mb-1 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  The power animal field guide
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Every portfolio gets scored on how spread out it is, how jumpy
                  the names are, and how big the largest name is. Then it
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
            <div className="flex flex-col mt-4 gap-3">
              {ANIMAL_BESTIARY.map((a) => {
                const tone = animalCardTone(a.id);
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
            </div>
          </div>
        </ViewportOverlay>
      )}
    </SignInGate>
  );
}

function bookTodayPct(
  totalValue: number,
  todayDollar: number
): number | null {
  const previous = totalValue - todayDollar;
  return previous > 0 ? todayDollar / previous : null;
}

function signedPctPoints(n: number): string {
  if (!Number.isFinite(n)) return NO_VALUE;
  const abs = Math.abs(n).toFixed(1);
  if (n > 0) return `+${abs}%`;
  if (n < 0) return `-${abs}%`;
  return `${abs}%`;
}

function PowerAnimalCard({
  name,
  isYou,
  isPending,
  totalValue,
  todayPct,
  personality,
  milestone,
  onOpen,
}: {
  name: string;
  isYou: boolean;
  isPending: boolean;
  totalValue: number;
  todayPct: number | null;
  personality: PortfolioPersonality | null;
  milestone: { next: number | null; progress: number };
  onOpen: () => void;
}) {
  const tone = animalCardTone(personality?.archetype.id);
  return (
    <button
      type="button"
      onClick={onOpen}
      /*
       * `.glass`, not a flat `bg-card`. This is a top-level card on the
       * page and it was the last opaque one — a solid slab that stopped
       * the ambient corner light dead where every panel around it lets it
       * through. `.glass` carries its own edge on `box-shadow`, so the
       * `border` goes with the fill; the accent bar down the left is a
       * separate absolute element and is untouched by that.
       */
      className="veil-hover card-sheen glass relative flex flex-col gap-4 overflow-hidden rounded-xl p-4 pl-4 text-left ring-1 ring-foreground/20 transition hover:scale-[1.01] active:scale-[0.995] sm:p-6 sm:pl-6 lg:grid lg:h-auto lg:grid-rows-subgrid lg:row-span-6"
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-1.5", tone.bar)}
        aria-hidden
      />
      <div className="flex items-start gap-4">
        <span
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-2xl",
            tone.well
          )}
          aria-hidden
        >
          {personality?.animalEmoji ?? "❔"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {name}
                {isYou && (
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                    (you)
                  </span>
                )}
                {isPending && (
                  <span className="ml-1.5 text-sm font-normal text-caution">
                    awaiting sign-in
                  </span>
                )}
              </p>
              <p className={cn("mt-1 text-base font-semibold", tone.name)}>
                {personality?.animal ?? "No portfolio yet"}
              </p>
            </div>
            <p className="shrink-0 text-right">
              <span
                className={cn(
                  "block text-base font-semibold tabular-nums",
                  signedTone(todayPct, "text-foreground")
                )}
              >
                {todayPct != null ? signedPercent(todayPct) : NO_VALUE}
              </span>
              <span className="mt-1 block text-sm tabular-nums text-muted-foreground">
                {currency(totalValue, 0)}
              </span>
            </p>
          </div>
        </div>
      </div>

      {personality ? (
        <>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {personality.whyThisAnimal}
          </p>
          <div className="flex flex-col gap-2 text-sm leading-relaxed">
            <p className="flex gap-2 text-gain">
              <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{personality.archetype.strength}</span>
            </p>
            <p className="flex gap-2 text-caution">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{personality.archetype.watchFor}</span>
            </p>
          </div>

          {/*
            * `grid-rows-subgrid`, not three independent stacks.
            *
            * Each read is four lines — label, figure, band, sentence — and
            * as three plain flow columns each one started its own second
            * line wherever its own first line happened to end. "How spread
            * out" wraps to two lines on a phone and the other two labels do
            * not, so its figure sat a row lower than theirs and the three
            * cells read as three unrelated things. Subgrid puts all four
            * rows on the parent, so every read's figure is on the figure
            * row and every band is on the band row whatever the labels do.
            */}
          <div className="glass-well grid grid-cols-3 grid-rows-[auto_auto_auto_auto] gap-x-2 gap-y-1 rounded-lg p-3">
            <ScoreRead
              label="How spread out"
              value={`${Math.round(personality.diversificationScore)}/100`}
              band={personality.diversificationBand.label}
              detail={personality.diversificationBand.description}
            />
            <ScoreRead
              label="How jumpy"
              value={`${Math.round(personality.riskScore)}/100`}
              band={personality.riskBand.label}
              detail={personality.riskBand.description}
            />
            <ScoreRead
              label="Biggest name"
              value={
                personality.topTicker
                  ? `${cashtag(personality.topTicker)} ${personality.convictionScore}%`
                  : `${personality.convictionScore}%`
              }
              band={personality.convictionBand.label}
              detail={personality.convictionBand.description}
            />
          </div>

          {/*
            * One column on a phone, and shorter words in it.
            *
            * Two-up, each of these cells had about 120px to work with:
            * "23.0% a year" ran straight out through the side of the card,
            * and the bad-year sentence under the other one stacked into a
            * nine-line ribbon taller than everything above it. The figure
            * is now just the number, the unit moved into the line under it
            * where there is room for words, and the pair stacks below `sm`.
            * The "not a forecast" half of that sentence is a disclaimer and
            * stays whatever else is trimmed.
            */}
          <Scoreboard
            className="min-h-min shrink-0 lg:h-full"
            cols={2}
            mobileCols={1}
          >
            <Score
              label="Modeled year"
              value={
                Number.isFinite(personality.expectedAnnualReturnPct)
                  ? `${personality.expectedAnnualReturnPct.toFixed(1)}%`
                  : NO_VALUE
              }
              sub={`A year, ${signedPctPoints(personality.modeledAlphaPct)} vs an index fund`}
              subClassName={signedTone(personality.modeledAlphaPct, "text-muted-foreground")}
            />
            <Score
              label="A rough year"
              value={`-${personality.maxDrawdownPct}%`}
              sub="How far names like these have fallen before. Illustrative, not a forecast."
              valueClassName="text-loss"
            />
          </Scoreboard>

          <div className={milestone.next == null ? "max-lg:hidden" : undefined}>
            {milestone.next != null && (
              <>
                <div className="flex items-baseline justify-between gap-2 text-sm text-muted-foreground">
                  <span>
                    Next{" "}
                    <span className="font-medium text-muted-foreground">
                      {currency(milestone.next, 0)}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {Math.round(milestone.progress * 100)}%
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", tone.milestone)}
                    style={{
                      width: `${Math.round(milestone.progress * 100)}%`,
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </>
      ) : null}
    </button>
  );
}

/**
 * Four rows of one read, handed to the parent grid rather than stacked
 * inside a box of its own — see the note at the call site for why. The
 * per-line `mt-*` are gone with it: row spacing is the parent's `gap-y`
 * now, or the three columns would drift apart again.
 */
function ScoreRead({
  label,
  value,
  band,
  detail,
}: {
  label: string;
  value: string;
  band: string;
  detail: string;
}) {
  return (
    <div className="row-span-4 grid min-w-0 grid-rows-subgrid">
      <p className="text-xs leading-snug text-muted-foreground">{label}</p>
      <p className="font-mono text-sm font-semibold leading-snug tabular-nums text-foreground">
        {value}
      </p>
      <p className="text-xs font-medium leading-snug text-foreground">{band}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

function ReadOnlyHoldings({
  holdings,
  quotes,
  cash,
}: {
  holdings: Holding[];
  quotes: Record<string, Quote>;
  cash: number;
}) {
  const totalValue =
    holdings.reduce((s, h) => s + (quotes[h.ticker]?.price ?? 0) * h.shares, 0) +
    cash;
  const previousCloseValue =
    holdings.reduce(
      (s, h) => s + (quotes[h.ticker]?.previousClose ?? quotes[h.ticker]?.price ?? 0) * h.shares,
      0
    ) + cash;
  const todayDollar = totalValue - previousCloseValue;
  const todayPct = previousCloseValue > 0 ? todayDollar / previousCloseValue : null;
  const mixedListings = listingCurrenciesAreMixed(
    holdings.map((h) => ({
      ticker: h.ticker,
      currency: quotes[h.ticker]?.currency,
    }))
  );
  const tickerCell = mixedListings ? cellTicker : cellBase;
  const todayCell = mixedListings
    ? "flex h-full w-full items-center justify-end whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums"
    : cellBase;

  // Biggest position first by default — matches the default sort in My
  // book, and is far more useful at a glance than raw creation order.
  const sortedHoldings = [...holdings].sort(
    (a, b) =>
      (quotes[b.ticker]?.price ?? 0) * b.shares -
      (quotes[a.ticker]?.price ?? 0) * a.shares
  );

  function holdingRow(h: Holding) {
    const listed = listingCurrency(h.ticker, quotes[h.ticker]?.currency);
    const digits = listingPriceDigits(listed);
    const native =
      quotes[h.ticker]?.nativePrice != null &&
      quotes[h.ticker]!.nativePrice! > 0
        ? quotes[h.ticker]!.nativePrice!
        : quotes[h.ticker]?.price ?? 0;
    const priceUsd = quotes[h.ticker]?.price ?? 0;
    const value = priceUsd * h.shares;
    const rowTodayPct = quotes[h.ticker]?.changePercent ?? null;
    const pctBook = totalValue > 0 ? value / totalValue : 0;
    return { listed, digits, native, value, rowTodayPct, pctBook };
  }

  return (
    <div className="flex flex-col gap-3">
      <Scoreboard cols={3}>
        <Score
          label="Today"
          value={todayPct != null ? signedPercent(todayPct) : NO_VALUE}
          sub={signedCurrency(todayDollar)}
          tone={todayDollar > 0 ? "up" : todayDollar < 0 ? "down" : undefined}
        />
        <Score label="Total value" value={currency(totalValue)} />
        <Score label="Cash" value={currency(cash)} />
      </Scoreboard>
      {holdings.length === 0 ? (
        <p className="glass-well rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No holdings in this portfolio.
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl glass ring-1 ring-foreground/20 md:hidden">
            <FluidTable template={tableCols(2, mixedListings)}>
              <FluidRow>
                <div
                  className={cn(
                    tickerCell,
                    "text-sm font-medium text-muted-foreground"
                  )}
                >
                  Ticker
                </div>
                <div
                  className={cn(
                    todayCell,
                    "text-sm font-medium text-muted-foreground"
                  )}
                >
                  Today
                </div>
              </FluidRow>
              {sortedHoldings.map((h) => {
                const row = holdingRow(h);
                return (
                  <FluidRow key={h.id}>
                    <div className={cn(tickerCell, "font-medium")}>
                      <TickerSymbol
                        ticker={h.ticker}
                        currency={row.listed}
                        showCurrency={mixedListings}
                      />
                    </div>
                    <div
                      className={cn(
                        todayCell,
                        "font-semibold",
                        signedTone(row.rowTodayPct, "text-muted-foreground")
                      )}
                    >
                      {row.rowTodayPct != null
                        ? signedPercent(row.rowTodayPct)
                        : NO_VALUE}
                    </div>
                  </FluidRow>
                );
              })}
              <FluidRow footer>
                <div className={cn(tickerCell, "text-muted-foreground")}>
                  Cash
                </div>
                <div className={cn(todayCell)}>{currency(cash)}</div>
              </FluidRow>
            </FluidTable>
          </div>
          <div className="hidden overflow-hidden rounded-xl glass ring-1 ring-foreground/20 md:block">
            <FluidTable template={tableCols(6, mixedListings)}>
              <FluidRow>
                <div
                  className={cn(
                    tickerCell,
                    "text-sm font-medium text-muted-foreground"
                  )}
                >
                  Ticker
                </div>
                <div className={cn(cellBase, "text-sm font-medium text-muted-foreground")}>
                  Today
                </div>
                <div className={cn(cellBase, "text-sm font-medium text-muted-foreground")}>
                  %
                </div>
                <div className={cn(cellBase, "text-sm font-medium text-muted-foreground")}>
                  Shares
                </div>
                <div className={cn(cellBase, "text-sm font-medium text-muted-foreground")}>
                  Price
                </div>
                <div className={cn(cellBase, "text-sm font-medium text-muted-foreground")}>
                  Value
                </div>
              </FluidRow>
              {sortedHoldings.map((h) => {
                const row = holdingRow(h);
                return (
                  <FluidRow key={h.id}>
                    <div className={cn(tickerCell, "font-medium")}>
                      <TickerSymbol
                        ticker={h.ticker}
                        currency={row.listed}
                        showCurrency={mixedListings}
                      />
                    </div>
                    <div
                      className={cn(
                        cellBase,
                        "font-semibold tabular-nums",
                        signedTone(row.rowTodayPct, "text-muted-foreground")
                      )}
                    >
                      {row.rowTodayPct != null
                        ? signedPercent(row.rowTodayPct)
                        : NO_VALUE}
                    </div>
                    <div className={cn(cellBase, "tabular-nums text-muted-foreground")}>
                      {percent(row.pctBook)}
                    </div>
                    <div className={cn(cellBase, "tabular-nums text-muted-foreground")}>
                      {h.shares}
                    </div>
                    <div
                      className={cn(cellBase, "tabular-nums text-muted-foreground")}
                      title={quoteAsOfTitle(quotes[h.ticker])}
                    >
                      {currency(row.native, row.digits, row.listed)}
                    </div>
                    <div className={cn(cellBase, "tabular-nums text-muted-foreground")}>
                      {currency(row.value)}
                    </div>
                  </FluidRow>
                );
              })}
              <FluidRow footer>
                <div className={cn(tickerCell, "text-muted-foreground")}>
                  Cash
                </div>
                <div className={cellBase} />
                <div className={cellBase} />
                <div className={cellBase} />
                <div className={cellBase} />
                <div className={cn(cellBase, "tabular-nums")}>
                  {currency(cash)}
                </div>
              </FluidRow>
            </FluidTable>
          </div>
        </>
      )}
    </div>
  );
}
