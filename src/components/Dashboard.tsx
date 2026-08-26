"use client";

import { track } from "@vercel/analytics";
import { AppHeader } from "@/components/AppHeader";
import { CashModal } from "@/components/CashModal";
import type { AdvisorAction, SilentScreenshotImport } from "@/components/CcAdvisorChat";
import { CommandPalette, type CommandItem } from "@/components/CommandPalette";
import { CsvImportModal } from "@/components/CsvImportModal";
import { CostBasisModal, type CostBasisRow } from "@/components/CostBasisModal";
import { ForecastOffStub } from "@/components/ForecastPanel";
import { HoldingModal, type HoldingFormValues } from "@/components/HoldingModal";
import { useFeedback } from "@/components/FeedbackHost";
import { HeaderOverflowMenu, type HeaderMenuItem } from "@/components/HeaderOverflowMenu";
import { OverviewDashboard, type LabDeepLink } from "@/components/OverviewDashboard";
import {
  PortfolioTable,
  type HoldingPatch,
} from "@/components/PortfolioTable";
import { PortfolioTabs } from "@/components/PortfolioTabs";
import { hrefForDockTarget, stashDockTab } from "@/components/BookModeDock";
import { RenameSheetModal } from "@/components/RenameSheetModal";
import { ClassTradeBanner } from "@/components/ClassTradeBanner";
import { sheetCashBalance, tracksTradeCash } from "@/lib/cash-balance";
import { isPaperClassOnly, ownedBookPortfolios } from "@/lib/classroom";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import { TickerDrawer } from "@/components/TickerDrawer";
import { useAuth } from "@/components/AuthProvider";
import {
  Alert,
  AlertAction,
  AlertDescription,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SnapshotsModal } from "@/components/SnapshotsModal";
import { useToast } from "@/components/ui/Toast";
import { usePathname, useRouter } from "next/navigation";
import {
  buildDecisionAlerts,
  buildEarningsAlerts,
  buildStrikeAlerts,
  type UpsideAlert,
} from "@/lib/alerts";
import {
  captureSheetSnapshot,
  popUndoSnapshot,
  pushUndoSnapshot,
  type BookUndoSnapshot,
} from "@/lib/book-undo";
import { buildSnapshot, STRATEGY } from "@/lib/calculations";
import type { CsvHoldingRow } from "@/lib/csv-import";
import { clearChatHistory } from "@/lib/chat-history";
import { loadWatchlist } from "@/lib/watchlist";
import { PAGE_FRAME_CLASS, PAGE_MAIN_CLASS } from "@/lib/page-shell";
import {
  loadDismissedAlertIds,
  saveDismissedAlertIds,
} from "@/lib/alert-dismiss";
import { setConviction } from "@/lib/conviction";
import { PULSE_REFRESH_MS, effectiveMove, isEmptyPulseCheck, loadPulseTickerCache, type PulseCheck } from "@/lib/thesis-pulse";
import { loadForecastPlan, type ForecastPlan } from "@/lib/forecast-plan";
import {
  milestoneToast,
  recordVisitToday,
} from "@/lib/visit-streak";
import {
  pickChatPortfolio,
  resolveLastPortfolioId,
  saveActiveSheetId,
  saveLastPortfolioId,
  takeOpenTab,
} from "@/lib/active-sheet";
import type { CcChatContext } from "@/lib/ai/cc-advisor";
import { loadLastUser } from "@/lib/last-session";
import { isAbortError, retryOnNetwork } from "@/lib/abort";
import { isSafePositiveMoney, isSafeShares, sanitizeSheetName } from "@/lib/input-guard";
import { buildForecast, type ForecastYear } from "@/lib/forecast";
import {
  loadEoyOverrides,
  mergeEoyTargetPaths,
  saveEoyOverrides,
  setEoyOverride,
  type PortfolioEoyOverrides,
} from "@/lib/forecast-overrides";
import { tradeCashDelta } from "@/lib/cash-delta";
import { roundMoney } from "@/lib/money";
import { parseHolding, parseHoldingList, parsePortfolio, parsePortfolioList } from "@/lib/parse-book";
import { readJsonOrThrow } from "@/lib/http";
import { isRecord, readFiniteNumber } from "@/lib/unknown";
import {
  addPortfolio,
  deleteHolding,
  deletePortfolio,
  hasLockedSave,
  loadDemoStore,
  lockDemoStore,
  patchHolding,
  renamePortfolio,
  resetDemoStore,
  updateCash,
  upsertHolding,
} from "@/lib/demo-store";
import {
  getDisplayCurrency,
  loadDisplayCurrencyMap,
  saveDisplayCurrencyMap,
  type DisplayCurrency,
} from "@/lib/display-currency";
import { normalizeYahooTicker } from "@/lib/ticker";
import { imageFilesFromList } from "@/lib/chat-images";
import { plainError } from "@/lib/plain-error";
import {
  BOOK_REFRESH_EVENT,
  clearBookCache,
  markSeedClaimed,
  readBookCache,
  shouldClaimSeed,
  writeBookCache,
  isBookFetchFresh,
} from "@/lib/book-cache";
import {
  isLiveSheetId,
  isUnsignedLocalCache,
  keepLiveSheetsOnly,
} from "@/lib/book-isolation";
import {
  GO_HOME_EVENT,
  WORKSPACE_SHOW_EVENT,
  isWorkspaceRoomActive,
  onWorkspaceRefresh,
  takeGoHomeRequest,
  workspaceRoomId,
} from "@/lib/workspace-rooms";
import {
  COMPOUND_TAB_ID,
  LAB_TAB_ID,
  OVERVIEW_TAB_ID,
  PULSE_TAB_ID,
  SEASONALITY_TAB_ID,
  ALERTS_TAB_ID,
  buildOverview,
  todayDollarFor,
} from "@/lib/overview";
import type {
  Holding,
  OptionCandidate,
  Portfolio,
  PortfolioSnapshot,
  Quote,
} from "@/lib/types";
import {
  Plus,
  RefreshCw,
  SlidersHorizontal,
  UserPlus,
} from "lucide-react";
import {
  quotePollMs,
  quotesUrl,
  isQuotePollFresh,
  isQuoteFreshForView,
} from "@/lib/market/session";
import { useTimeout } from "@/lib/use-timeout";
import { useStableCallback } from "@/lib/use-stable-callback";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

import {
  CC_DEFAULT_VISIBLE,
  CC_VISIBLE_KEY,
  FORECAST_DEFAULT_VISIBLE,
  FORECAST_VISIBLE_KEY,
  isPanelVisible,
  loadVisibilityMap,
  saveVisibilityMap,
  setPanelVisible,
  toggleVisibilityMap,
  type VisibilityMap,
} from "@/lib/panel-visibility";
import {
  shouldHideOptions,
  shouldSkipExperienceOnboarding,
  EXPERIENCE_TIER_EVENT,
  loadStoredKnowsOptions,
  loadStoredTier,
  saveStoredKnowsOptions,
  saveStoredTier,
  TIER_HIDDEN_LAB_TABS,
  TIER_HIDDEN_META_TABS,
  type ExperienceTier,
} from "@/lib/experience-tier";
import { InvitePartnerModal } from "@/components/InvitePartnerModal";
import { DashboardLoading } from "@/components/DashboardLoading";
import { MobileTabBar } from "@/components/mobile/MobileTabBar";
import { mobileTabFromActiveId, PORTFOLIO_TAB_PENDING } from "@/lib/mobile-tab";
import { SheetPicker } from "@/components/SheetPicker";
import { useLabSync } from "@/components/use-lab-sync";
import { FIRST_SHEET_NAME } from "@/lib/product";
import { useLoadingMessage } from "@/lib/use-loading-message";
import { loadCachedQuotes, mergeQuotes, saveCachedQuotes, quotesUnchanged } from "@/lib/quote-cache";
import { quotesAreDelayed, quotesStampMs } from "@/lib/market/quote-freshness";
import { OFFLINE_CACHE_READY } from "@/lib/offline/snapshots";
import { postJsonOrQueue } from "@/lib/offline/queued-fetch";
import { markSheetImported } from "@/lib/sheet-import-stamp";
import {
  dismissInviteNudge,
  markInviteOffered,
  shouldOfferInvite,
} from "@/lib/invite-nudge";
import { addPulseStamp } from "@/lib/conviction";

/**
 * Margus is a collapsed floating panel almost nobody opens on first paint,
 * but eagerly importing him put the AI SDK, react-markdown, remark-gfm and
 * zod on every dashboard load. Deferred here and warmed on idle below, so
 * the chunk is nearly always in cache before the first click.
 */
const CcAdvisorChat = dynamic(
  () => import("@/components/CcAdvisorChat").then((m) => m.CcAdvisorChat),
  { ssr: false }
);

/**
 * These are per-tab panels: only one is on screen at a time (Overview is
 * the default), but before this they were all imported eagerly, so every
 * visit to the book shipped Pulse, Lab (which itself pulls in Seasonality,
 * Trends, and the scenario simulator), Compound, Forecast, and Covered
 * Calls whether or not the tab was ever opened. Split like BookRoom/
 * FundRoom/AccountPage etc. in WorkspaceShell — ssr: true keeps a direct
 * link or refresh on a non-Overview tab (e.g. "/?tab=pulse") server-
 * rendered instead of flashing a loading state.
 */
const PulsePage = dynamic(
  () => import("@/components/PulsePage").then((m) => m.PulsePage),
  { ssr: true }
);
const LabSheet = dynamic(
  () => import("@/components/LabSheet").then((m) => m.LabSheet),
  { ssr: true }
);
const CompoundInterestSheet = dynamic(
  () =>
    import("@/components/CompoundInterestSheet").then(
      (m) => m.CompoundInterestSheet
    ),
  { ssr: true }
);
const ForecastPanel = dynamic(
  () => import("@/components/ForecastPanel").then((m) => m.ForecastPanel),
  { ssr: true }
);
const CoveredCallPanel = dynamic(
  () =>
    import("@/components/CoveredCallPanel").then((m) => m.CoveredCallPanel),
  { ssr: true }
);

type DataSource = "demo" | "supabase";

const EMPTY_HIDDEN_TABS: string[] = [];

function bookFingerprint(ps: Portfolio[], hs: Holding[]) {
  return JSON.stringify([
    ps.map((p) => [p.id, p.cash_balance, p.name]),
    hs.map((h) => [
      h.id,
      h.ticker,
      h.shares,
      h.buy_price,
      h.target_call_pct,
      h.stock_target_override,
    ]),
  ]);
}

function extendedHoursFromQuote(q: Quote | null | undefined) {
  if (!q) {
    return {
      marketState: null as string | null,
      preMarketPrice: null as number | null,
      preMarketChange: null as number | null,
      preMarketChangePercent: null as number | null,
      postMarketPrice: null as number | null,
      postMarketChange: null as number | null,
      postMarketChangePercent: null as number | null,
    };
  }
  return {
    marketState: q.marketState,
    preMarketPrice: q.preMarketPrice,
    preMarketChange: q.preMarketChange,
    preMarketChangePercent: q.preMarketChangePercent,
    postMarketPrice: q.postMarketPrice,
    postMarketChange: q.postMarketChange,
    postMarketChangePercent: q.postMarketChangePercent,
  };
}

function margusChatContext(input: {
  portfolio: Portfolio | null;
  snapshot: PortfolioSnapshot | null;
  hideOptions: boolean;
  marketState: string | null;
  eurUsd: number | null;
  gbpUsd: number | null;
  convictions: CcChatContext["convictions"];
  pulseByTicker: Record<string, PulseCheck>;
  forecastPlan: ForecastPlan | null;
}): CcChatContext {
  const watchlist = loadWatchlist();
  const {
    portfolio,
    snapshot,
    hideOptions,
    marketState,
    eurUsd,
    gbpUsd,
    convictions,
    pulseByTicker,
    forecastPlan,
  } = input;
  if (!portfolio || !snapshot) {
    return {
      portfolioName: "Your portfolio",
      cashBalance: 0,
      adviseOnly: true,
      hideOptions,
      eurUsd,
      gbpUsd,
      watchlist,
      convictions,
      pulseByTicker,
      forecastPlan: null,
      holdings: [],
      rows: [],
      marketState,
      totals: {
        cost: 0,
        value: 0,
        roiPct: 0,
        roiDollar: 0,
        yield2wAvg: 0,
        premiumTotal: 0,
      },
    };
  }
  return {
    portfolioName: portfolio.name,
    cashBalance: portfolio.cash_balance,
    classroom: Boolean(portfolio.classroom_community_id),
    hideOptions,
    eurUsd,
    gbpUsd,
    watchlist,
    convictions,
    pulseByTicker,
    forecastPlan,
    holdings: snapshot.holdings.map((h) => ({
      ticker: h.ticker,
      shares: h.shares,
      buyPrice: h.buy_price,
      price: h.quote?.price ?? h.buy_price,
      cost: h.buyValue,
      value: h.currentValue,
      roiPct: h.roiPct,
      roiDollar: h.roiDollar,
      pctOfTotal: h.pctOfTotal,
      todayPct: h.quote?.changePercent ?? null,
      ...extendedHoursFromQuote(h.quote),
    })),
    rows: hideOptions
      ? []
      : snapshot.coveredCallRows.map((r) => ({
          ticker: r.holding.ticker,
          spot: r.spot,
          callPct: r.targetCall,
          stockTarget: r.stockTarget,
          distance: r.targetDistance,
          nextStrike: r.nextStrike,
          contracts: r.contracts,
          yield2w: r.yield2w,
          premium: r.premium,
          expiration: r.expiration,
        })),
    marketState,
    totals: {
      cost: snapshot.totals.buyValue,
      value: snapshot.totals.currentValue,
      roiPct: snapshot.totals.roiPct,
      roiDollar: snapshot.totals.roiDollar,
      yield2wAvg: snapshot.totals.yield2wAvg,
      premiumTotal: snapshot.totals.premiumTotal,
    },
  };
}

/**
 * Resolves the `?portfolio=` URL param (meta-tab keyword, slug, id, or name)
 * to an active-portfolio id. Pure and synchronous so it can run both in the
 * `activeId` state initializer (first paint, before any network call) and
 * later in `pickInitialSheet` (popstate / portfolio-list changes) without
 * duplicating the matching rules in two places. Returns null when there's
 * no param or it doesn't match anything, so callers can fall through to
 * their own next-best default (previous tab, localStorage, Overview).
 *
 * `?sheet=` and `tab=book` are the old spellings. We stopped writing them
 * when portfolios stopped being called sheets, but they are still read so
 * that links and bookmarks people already have keep landing in the right
 * place.
 */
/**
 * Meta-tab ids that are still real top-level tabs. Pulse and Seasonality
 * moved inside Lab, so anything persisted (localStorage, history state)
 * from before that move has to fold onto Lab rather than resolving to a
 * tab that no longer renders and leaving the user on a blank page.
 */
function normalizeMetaTabId(id: string): string | null {
  if (
    id === OVERVIEW_TAB_ID ||
    id === COMPOUND_TAB_ID ||
    id === LAB_TAB_ID ||
    id === PULSE_TAB_ID
  ) {
    return id;
  }
  if (id === ALERTS_TAB_ID) return ALERTS_TAB_ID;
  // Seasonality is a Lab sub-tab, so a persisted id from when it was
  // top-level folds onto Lab rather than resolving to a tab that no
  // longer renders and leaving the user on a blank page.
  if (id === SEASONALITY_TAB_ID) return LAB_TAB_ID;
  return null;
}

function metaTabFromToken(raw: string): string | null {
  if (raw === "compound" || raw === COMPOUND_TAB_ID) return COMPOUND_TAB_ID;
  if (raw === "lab" || raw === LAB_TAB_ID) return LAB_TAB_ID;
  if (raw === "pulse" || raw === PULSE_TAB_ID) return PULSE_TAB_ID;
  if (raw === "alerts" || raw === ALERTS_TAB_ID) return ALERTS_TAB_ID;
  if (raw === "overview" || raw === OVERVIEW_TAB_ID) return OVERVIEW_TAB_ID;
  // Seasonality is a Lab sub-tab. Old links still resolve, they just land
  // on Lab with the right sub-tab selected via ?labtab=.
  if (
    raw === "statistics" ||
    raw === "stats" ||
    raw === "seasonality" ||
    raw === SEASONALITY_TAB_ID
  ) {
    return LAB_TAB_ID;
  }
  return null;
}

/**
 * `?tab=portfolio` with no portfolio named and no list to name one from
 * is `PORTFOLIO_TAB_PENDING`: a real room id, distinct from `null`.
 */

function resolveSheetIdFromUrl(
  list: Portfolio[],
  pendingTab?: string | null
): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const tabParam =
    pendingTab?.trim().toLowerCase() ||
    params.get("tab")?.trim().toLowerCase() ||
    "";
  const portfolioParam = params.get("portfolio")?.trim().toLowerCase() || "";
  const sheetParam = params.get("sheet")?.trim().toLowerCase() || "";
  // `tab=portfolio` (and legacy `tab=book`) is a portfolio view; which one
  // comes from `portfolio` / legacy `sheet`. `tab=forecast` is a panel on a
  // portfolio, not a meta tab.
  const tabToken =
    tabParam &&
    tabParam !== "portfolio" &&
    tabParam !== "book" &&
    tabParam !== "forecast"
      ? tabParam
      : "";
  if (tabToken) {
    const meta = metaTabFromToken(tabToken);
    if (meta) return meta;
  }
  // Legacy ?sheet=stats bookmarks, only when they are not a real portfolio id.
  if (!tabToken && !portfolioParam && sheetParam) {
    const meta = metaTabFromToken(sheetParam);
    if (meta) return meta;
  }
  const raw = portfolioParam || sheetParam;
  if (!raw) {
    /*
     * `?tab=portfolio` with nothing after it is the phone dock's Holdings
     * cell, which cannot name a portfolio: it draws on every page, including
     * the ones that never load a book, so it has no list to pick from and no
     * way to tell a remembered id from one somebody has since deleted. This
     * is the only place that does, so it answers here: the portfolio you were
     * last in, else your first one. Falling through to Overview would send
     * that cell straight back to the room the reader is trying to leave.
     */
    if (tabParam === "portfolio" || tabParam === "book") {
      return resolveLastPortfolioId(list) ?? PORTFOLIO_TAB_PENDING;
    }
    return null;
  }
  const bySlugOrId = list.find(
    (p) =>
      p.id === raw ||
      p.slug?.toLowerCase() === raw ||
      p.name.toLowerCase() === raw
  );
  if (bySlugOrId) return bySlugOrId.id;
  // Hard refresh of ?tab=portfolio&portfolio=… before the portfolio is in
  // memory: keep the URL token so we don't paint Overview for a frame.
  if (list.length === 0) return raw;
  return null;
}

export function Dashboard() {
  const { push: toast } = useToast();
  const { profile, signOut, refresh, user, ready: authReady } = useAuth();
  const { openManual } = useFeedback();
  const later = useTimeout();
  const router = useRouter();
  const pathname = usePathname();
  const onBook = workspaceRoomId(pathname) === "book";
  const loadingMessage = useLoadingMessage();
  const [source, setSource] = useState<DataSource>(
    user ? "supabase" : "demo"
  );
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [saveFlash, setSaveFlash] = useState(false);
  const [locked, setLocked] = useState(false);
  const [activeId, setActiveId] = useState<string>(OVERVIEW_TAB_ID);
  // The mount layout effect below resolves the real starting tab from the
  // URL/cache and calls setActiveId — but the URL write-back effect (which
  // depends on activeId) can run its first pass against the OVERVIEW_TAB_ID
  // placeholder before that update lands, stripping ?tab=pulse (etc.) from
  // the URL before it was ever read. This ref keeps the write-back effect
  // from touching the URL until the real initial tab has been resolved.
  const initialSheetResolvedRef = useRef(false);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [options, setOptions] = useState<Record<string, OptionCandidate | null>>(
    {}
  );
  /*
   * Expiry the user picked per holding, for the covered-call table.
   *
   * Kept in component state rather than on the holding row: it is a
   * "what would this be worth if I wrote it to *this* date" question, not
   * a property of the position, and it should not follow the holding into
   * a shared book or a snapshot. Empty means "let the scan choose", which
   * is what it did before this was editable at all.
   */
  const [ccExpiry, setCcExpiry] = useState<Record<string, string | null>>({});
  const ccExpiryRef = useRef(ccExpiry);
  ccExpiryRef.current = ccExpiry;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quotesUpdatedAt, setQuotesUpdatedAt] = useState<number | null>(null);
  const [quotesDelayed, setQuotesDelayed] = useState(false);
  const [missingTickers, setMissingTickers] = useState<string[]>([]);
  const [eurUsd, setEurUsd] = useState<number | null>(null);
  const [eurUsdDetail, setEurUsdDetail] = useState<{
    open: number | null;
    previousClose: number | null;
    last: number | null;
    rate: number | null;
  } | null>(null);
  const [gbpUsd, setGbpUsd] = useState<number | null>(null);
  const [usdPer, setUsdPer] = useState<Record<string, number>>({ USD: 1 });
  const [displayCurrencyByPortfolio, setDisplayCurrencyByPortfolio] = useState<
    Record<string, DisplayCurrency>
  >({});
  const [modalOpen, setModalOpen] = useState(false);
  const [cashModalOpen, setCashModalOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: "holding"; id: string; label: string }
    | { kind: "sheet"; id: string; label: string }
    | null
  >(null);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [margusExpandSignal, setMargusExpandSignal] = useState(0);
  const [silentScreenshot, setSilentScreenshot] =
    useState<SilentScreenshotImport | null>(null);
  const [screenshotPending, setScreenshotPending] = useState(false);
  const silentScreenshotSeq = useRef(0);
  const [confirmResetForecast, setConfirmResetForecast] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteNudgeOpen, setInviteNudgeOpen] = useState(false);
  const emptyInviteSeenRef = useRef<Set<string>>(new Set());
  const creatingFirstSheetRef = useRef<Promise<Portfolio | undefined> | null>(
    null
  );
  const [undoStack, setUndoStack] = useState<BookUndoSnapshot[]>([]);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [labIntent, setLabIntent] = useState<LabDeepLink | null>(null);
  const [pulseIntent, setPulseIntent] = useState<string | null>(null);
  /** Home "Open covered calls" should land on the options table, not holdings. */
  const sheetFocusRef = useRef<"covered-calls" | null>(null);
  const { labBundle, labReady, patchLab } = useLabSync();
  /** Browser Back/Forward: sync sheet from history without pushing again. */
  const historyFromPopRef = useRef(false);
  /** Until first book load settles, only replaceState (no fake history stack). */
  const historyBootstrappingRef = useRef(true);
  const lastHistorySheetRef = useRef<string | null>(null);
  const [costBasisOpen, setCostBasisOpen] = useState(false);
  const [costBasisRows, setCostBasisRows] = useState<CostBasisRow[]>([]);
  const [drawerTicker, setDrawerTicker] = useState<string | null>(null);
  const convictionMap = labBundle.conviction;
  const [earningsEvents, setEarningsEvents] = useState<
    Array<{ ticker: string; date: string; days: number }>
  >([]);
  const [alertToastsSent, setAlertToastsSent] = useState<Set<string>>(
    () => new Set()
  );
  // Read inside effects without adding alertToastsSent as a dependency
  // (that would re-trigger the alert effect on every toast it fires).
  const alertToastsSentRef = useRef(alertToastsSent);
  alertToastsSentRef.current = alertToastsSent;
  const bookRef = useRef({ portfolios, holdings });
  bookRef.current = { portfolios, holdings };
  const bookAbortRef = useRef<AbortController | null>(null);
  const quotesAbortRef = useRef<AbortController | null>(null);
  const quotesRef = useRef(quotes);
  quotesRef.current = quotes;
  const quotesPolledAtRef = useRef(0);
  const bookFetchedAtRef = useRef(0);
  const holdingPatchSeqRef = useRef(new Map<string, number>());
  const cashWriteSeqRef = useRef(new Map<string, number>());
  const pendingBookWritesRef = useRef(0);
  const reloadAfterWritesRef = useRef(false);
  const bookWriteChainRef = useRef(Promise.resolve());
  const addingSheetRef = useRef<Promise<Portfolio | undefined> | null>(null);
  /*
   * The phone dock's Holdings cell arriving before the book does.
   *
   * `/?tab=portfolio` names no portfolio, so it can only be answered against
   * a list, and on a cold cache -- a first visit in this browser, or the
   * first one after a sign-out -- there is no list at mount. Overview is
   * where that lands, and by the time the book arrives the URL effect has
   * already stripped the query, so nothing is left to say what was asked
   * for. This is what is left: set when the question could not be answered,
   * spent by the first `pickInitialSheet` that has portfolios to answer it
   * with. Every other tab resolves from the token alone and never needs it.
   */
  const wantsHoldingsRef = useRef(false);

  /**
   * `resolveSheetIdFromUrl` with the pending case handled: the sentinel
   * stays a room id so Holdings stays lit, and a note is left so the next
   * call that has a book can finish answering it. See `wantsHoldingsRef`.
   */
  const takeSheetIdFromUrl = useCallback(
    (list: Portfolio[], pendingTab?: string | null) => {
      const fromUrl = resolveSheetIdFromUrl(list, pendingTab);
      if (fromUrl === PORTFOLIO_TAB_PENDING) {
        wantsHoldingsRef.current = true;
        return fromUrl;
      }
      if (fromUrl) wantsHoldingsRef.current = false;
      return fromUrl;
    },
    []
  );

  const [ccVisibleByPortfolio, setCcVisibleByPortfolio] =
    useState<VisibilityMap>({});
  const [forecastVisibleByPortfolio, setForecastVisibleByPortfolio] =
    useState<VisibilityMap>({});
  const [eoyOverrides, setEoyOverrides] = useState<PortfolioEoyOverrides>({});
  const [experienceTier, setExperienceTier] = useState<ExperienceTier | null>(
    null
  );
  const [tierChecked, setTierChecked] = useState(false);
  // Tri-state and deliberately separate from experienceTier: null = hasn't
  // answered, true/false = explicit answer to "have you used options
  // before". A "very experienced" tier and "no options experience" are a
  // real, valid combination -- this can't be derived from the tier.
  // Options UI only appears after an explicit yes.
  const [knowsOptions, setKnowsOptions] = useState<boolean | null>(null);
  const hideOptionsUI = shouldHideOptions(knowsOptions);

  useLayoutEffect(() => {
    const uid = user?.id ?? loadLastUser()?.id ?? null;
    const cached = readBookCache(uid);
    const signedIn = Boolean(user?.id);
    if (cached && !(signedIn && isUnsignedLocalCache(cached))) {
      const book = signedIn
        ? keepLiveSheetsOnly(cached.portfolios, cached.holdings)
        : { portfolios: cached.portfolios, holdings: cached.holdings };
      setSource(signedIn ? "supabase" : cached.source);
      setPortfolios(book.portfolios);
      setHoldings(book.holdings);
      setLocked(cached.locked);
      setLoading(false);
      bookFetchedAtRef.current = cached.fetchedAt;
      const fromUrl = takeSheetIdFromUrl(book.portfolios, takeOpenTab());
      setActiveId(fromUrl ?? OVERVIEW_TAB_ID);
      initialSheetResolvedRef.current = true;
    } else {
      if (signedIn) {
        setSource("supabase");
        setPortfolios([]);
        setHoldings([]);
        setLocked(false);
        bookFetchedAtRef.current = 0;
        setLoading(true);
      }
      const fromUrl = takeSheetIdFromUrl([], takeOpenTab());
      setActiveId(fromUrl ?? OVERVIEW_TAB_ID);
      initialSheetResolvedRef.current = true;
    }
    const cachedQuotes = loadCachedQuotes();
    setQuotes(cachedQuotes.quotes);
    setQuotesUpdatedAt(cachedQuotes.savedAt);
    quotesPolledAtRef.current = cachedQuotes.savedAt ?? 0;
    const eur = cachedQuotes.quotes["EURUSD=X"]?.price;
    if (eur && eur > 0) setEurUsd(eur);
    const gbp = cachedQuotes.quotes["GBPUSD=X"]?.price;
    if (gbp && gbp > 0) setGbpUsd(gbp);
    setUsdPer((prev) => {
      const next: Record<string, number> = { ...prev, USD: 1 };
      if (eur && eur > 0) next.EUR = eur;
      if (gbp && gbp > 0) next.GBP = gbp;
      return next;
    });
    setDisplayCurrencyByPortfolio(loadDisplayCurrencyMap());
    setAlertToastsSent(loadDismissedAlertIds());
    setCcVisibleByPortfolio(loadVisibilityMap(CC_VISIBLE_KEY));
    setForecastVisibleByPortfolio(loadVisibilityMap(FORECAST_VISIBLE_KEY));
    setExperienceTier(loadStoredTier());
    setKnowsOptions(loadStoredKnowsOptions());
  }, [user?.id, takeSheetIdFromUrl]);

  useEffect(() => {
    const apply = () => {
      const uid = user?.id ?? loadLastUser()?.id ?? null;
      const cached = readBookCache(uid);
      if (!cached || bookFetchedAtRef.current > 0) return;
      const signedIn = Boolean(user?.id);
      if (signedIn && isUnsignedLocalCache(cached)) return;
      const book = signedIn
        ? keepLiveSheetsOnly(cached.portfolios, cached.holdings)
        : { portfolios: cached.portfolios, holdings: cached.holdings };
      setSource(signedIn ? "supabase" : cached.source);
      setPortfolios(book.portfolios);
      setHoldings(book.holdings);
      setLocked(cached.locked);
      setLoading(false);
      bookFetchedAtRef.current = cached.fetchedAt;
      const cachedQuotes = loadCachedQuotes();
      if (
        Object.keys(quotesRef.current).length === 0 &&
        Object.keys(cachedQuotes.quotes).length > 0
      ) {
        setQuotes(cachedQuotes.quotes);
        setQuotesUpdatedAt(cachedQuotes.savedAt);
        quotesPolledAtRef.current = cachedQuotes.savedAt ?? 0;
      }
    };
    window.addEventListener(OFFLINE_CACHE_READY, apply);
    return () => window.removeEventListener(OFFLINE_CACHE_READY, apply);
  }, [user?.id]);

  // Confirm/sync against the server once — localStorage is read
  // synchronously above for an instant first paint, but the DB value is
  // the source of truth across devices (e.g. answered on phone, opens on
  // desktop next). Only real signed-in accounts get asked; demo/guest
  // preview stays exactly as-is.
  useEffect(() => {
    if (source !== "supabase" || !user) {
      setTierChecked(true);
      return;
    }
    setTierChecked(false);
    const ctrl = new AbortController();
    void fetch("/api/account/experience-tier", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            tier?: ExperienceTier | null;
            knowsOptions?: boolean | null;
          } | null
        ) => {
          if (ctrl.signal.aborted) return;
          if (data?.tier) {
            setExperienceTier(data.tier);
            saveStoredTier(data.tier);
          }
          if (typeof data?.knowsOptions === "boolean") {
            setKnowsOptions(data.knowsOptions);
            saveStoredKnowsOptions(data.knowsOptions);
          }
        }
      )
      .catch((err) => {
        if (isAbortError(err)) return;
        /* keep whatever localStorage already had */
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setTierChecked(true);
      });
    return () => {
      ctrl.abort();
    };
  }, [source, user]);

  useEffect(() => {
    const sync = () => {
      setExperienceTier(loadStoredTier());
      setKnowsOptions(loadStoredKnowsOptions());
    };
    window.addEventListener(EXPERIENCE_TIER_EVENT, sync);
    return () => window.removeEventListener(EXPERIENCE_TIER_EVENT, sync);
  }, []);

  const skipExperienceOnboarding =
    isPaperClassOnly(portfolios) ||
    shouldSkipExperienceOnboarding({
      holdingsCount: holdings.length,
      portfolioSlugs: portfolios.map((p) => p.slug),
    });

  // Seed-claimed household (Karud, Lap, family books) already has names.
  // Don't send them through "Add what you own". Persist investor so the
  // next device also skips. Leave options unanswered (hidden).
  const inheritedTierRef = useRef(false);
  useEffect(() => {
    if (isPaperClassOnly(portfolios)) return;
    if (inheritedTierRef.current) return;
    if (!tierChecked || experienceTier) return;
    if (source !== "supabase" || !user || loading) return;
    if (!skipExperienceOnboarding) return;
    inheritedTierRef.current = true;
    setExperienceTier("investor");
    saveStoredTier("investor");
    void postJsonOrQueue("/api/account/experience-tier", { tier: "investor" }).catch(
      () => {
        /* localStorage already has the tier */
      }
    );
  }, [
    tierChecked,
    experienceTier,
    source,
    user,
    loading,
    skipExperienceOnboarding,
    portfolios,
  ]);

  // If the tier changes (questionnaire just answered, or changed later in
  // Account) and it hides whatever meta-tab is currently open, don't leave
  // the viewer stranded on a tab with no button back to it.
  useEffect(() => {
    if (!experienceTier) return;
    if (TIER_HIDDEN_META_TABS[experienceTier].includes(activeId)) {
      setActiveId(OVERVIEW_TAB_ID);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experienceTier]);

  const hiddenMetaTabIds = useMemo(() => {
    return experienceTier ? TIER_HIDDEN_META_TABS[experienceTier] : [];
  }, [experienceTier]);
  const labHiddenForTier = hiddenMetaTabIds.includes(LAB_TAB_ID);
  const pulseHiddenForTier = hiddenMetaTabIds.includes(PULSE_TAB_ID);

  const isOverview = activeId === OVERVIEW_TAB_ID;
  const isCompound = activeId === COMPOUND_TAB_ID;
  const isLab = activeId === LAB_TAB_ID;
  const isPulse = activeId === PULSE_TAB_ID;
  const isAlerts = activeId === ALERTS_TAB_ID;
  const isMetaTab = isOverview || isCompound || isLab || isPulse || isAlerts;
  const mobileTab = mobileTabFromActiveId(activeId);

  const activePortfolio =
    isMetaTab
      ? null
      : (portfolios.find(
          (p) =>
            p.id === activeId ||
            p.slug?.toLowerCase() === activeId.toLowerCase()
        ) ?? null);
  const inviteSheet = activePortfolio ?? portfolios[0] ?? null;
  const classTrade = activePortfolio?.classTrade ?? null;
  const canClassBuy = !classTrade || classTrade.canBuy;
  const canClassCash = !classTrade || classTrade.canCash;

  const ccVisible =
    hideOptionsUI
      ? false
      : activePortfolio
        ? isPanelVisible(ccVisibleByPortfolio, activePortfolio, experienceTier !== "novice")
        : true;
  // Forecast defaults to visible for every experience tier — unlike Lab/
  // Pulse/Seasonality, it's plain price-scenario modeling, not something
  // that needs "growing into."
  const forecastVisible = activePortfolio
    ? isPanelVisible(forecastVisibleByPortfolio, activePortfolio, FORECAST_DEFAULT_VISIBLE)
    : true;

  const allTickers = useMemo(() => {
    const set = new Set(holdings.map((h) => h.ticker));
    return [...set];
  }, [holdings]);
  const allTickersKey = allTickers.join(",");

  useEffect(() => {
    if (!activePortfolio) {
      setEoyOverrides({});
      return;
    }
    setEoyOverrides(loadEoyOverrides(activePortfolio.id));
  }, [activePortfolio]);

  useEffect(() => {
    const sheet = inviteSheet;
    if (!sheet) return;
    const n = holdings.filter((h) => h.portfolio_id === sheet.id).length;
    if (n === 0) {
      emptyInviteSeenRef.current.add(sheet.id);
      return;
    }
    if (!emptyInviteSeenRef.current.has(sheet.id)) return;
    emptyInviteSeenRef.current.delete(sheet.id);
    if (
      !shouldOfferInvite({
        portfolioId: sheet.id,
        classroom: Boolean(sheet.classroom_community_id),
        holdingCountBefore: 0,
        holdingCountAfter: n,
      })
    ) {
      return;
    }
    markInviteOffered(sheet.id);
    setInviteNudgeOpen(true);
  }, [inviteSheet, holdings]);

  function seedNewSheetPanelDefaults(portfolio: {
    id: string;
    slug?: string | null;
  }) {
    setCcVisibleByPortfolio((prev) => {
      const next = setPanelVisible(prev, portfolio, CC_DEFAULT_VISIBLE);
      saveVisibilityMap(CC_VISIBLE_KEY, next);
      return next;
    });
    setForecastVisibleByPortfolio((prev) => {
      const next = setPanelVisible(prev, portfolio, FORECAST_DEFAULT_VISIBLE);
      saveVisibilityMap(FORECAST_VISIBLE_KEY, next);
      return next;
    });
  }

  function toggleCcVisible() {
    if (!activePortfolio) return;
    setCcVisibleByPortfolio((prev) => {
      // Unset legacy sheets default to visible; new sheets are seeded hidden.
      const next = toggleVisibilityMap(prev, activePortfolio, true);
      saveVisibilityMap(CC_VISIBLE_KEY, next);
      return next;
    });
  }

  function openSheet(id: string, focus?: "covered-calls") {
    if (focus === "covered-calls" && !hideOptionsUI) {
      const p = portfolios.find((x) => x.id === id);
      if (p) {
        setCcVisibleByPortfolio((prev) => {
          const next = setPanelVisible(prev, p, true);
          saveVisibilityMap(CC_VISIBLE_KEY, next);
          return next;
        });
        sheetFocusRef.current = "covered-calls";
      }
    } else {
      sheetFocusRef.current = null;
    }
    setActiveId(id);
  }

  function toggleForecastVisible() {
    if (!activePortfolio) return;
    setForecastVisibleByPortfolio((prev) => {
      const next = toggleVisibilityMap(
        prev,
        activePortfolio,
        FORECAST_DEFAULT_VISIBLE
      );
      saveVisibilityMap(FORECAST_VISIBLE_KEY, next);
      return next;
    });
  }

  const portfolioHoldings = useMemo(
    () =>
      holdings
        .filter((h) => h.portfolio_id === activePortfolio?.id)
        .sort((a, b) => a.sort_order - b.sort_order),
    [holdings, activePortfolio?.id]
  );

  const snapshot = useMemo(() => {
    if (!activePortfolio) return null;
    return buildSnapshot(activePortfolio, portfolioHoldings, quotes, options);
  }, [activePortfolio, portfolioHoldings, quotes, options]);

  /** Margus always talks to one portfolio: the open tab, or the last one opened. */
  const margusPortfolio = useMemo(
    () => pickChatPortfolio(portfolios, activePortfolio),
    [portfolios, activePortfolio]
  );

  const margusHoldings = useMemo(() => {
    if (margusPortfolio?.id === activePortfolio?.id) return portfolioHoldings;
    return holdings
      .filter((h) => h.portfolio_id === margusPortfolio?.id)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [holdings, margusPortfolio?.id, activePortfolio?.id, portfolioHoldings]);

  const margusSnapshot = useMemo(() => {
    if (!margusPortfolio) return null;
    if (margusPortfolio.id === activePortfolio?.id) return snapshot;
    return buildSnapshot(margusPortfolio, margusHoldings, quotes, options);
  }, [
    margusPortfolio,
    margusHoldings,
    quotes,
    options,
    activePortfolio?.id,
    snapshot,
  ]);

  const realPortfolios = useMemo(
    () => ownedBookPortfolios(portfolios),
    [portfolios]
  );
  const realHoldings = useMemo(() => {
    const ids = new Set(realPortfolios.map((p) => p.id));
    return holdings.filter((h) => ids.has(h.portfolio_id));
  }, [holdings, realPortfolios]);
  const overview = useMemo(
    () => buildOverview(realPortfolios, realHoldings, quotes),
    [realPortfolios, realHoldings, quotes]
  );
  const homeworkEmpty =
    portfolios.length > 0 &&
    portfolios.every((p) => p.classroom_community_id);
  const homeworkCash =
    homeworkEmpty && portfolios.length === 1
      ? portfolios[0]!.cash_balance
      : undefined;

  // Book-wide CC rows, computed once and shared by Lab (Alerts/calendar) and
  // the alert builders below — was previously an inline flatMap recomputed
  // on every render just for the Lab prop.
  const bookCoveredCallRows = useMemo(
    () =>
      realPortfolios.flatMap((p) => {
        const rows = holdings.filter((h) => h.portfolio_id === p.id);
        return buildSnapshot(p, rows, quotes, options).coveredCallRows;
      }),
    [realPortfolios, holdings, quotes, options]
  );

  const drawerCoveredCallRow = useMemo(() => {
    if (!drawerTicker || hideOptionsUI) return null;
    return (
      bookCoveredCallRows.find(
        (r) => r.holding.ticker.toUpperCase() === drawerTicker.toUpperCase()
      ) ?? null
    );
  }, [drawerTicker, bookCoveredCallRows, hideOptionsUI]);

  // Single source of truth for "what needs attention" — earnings, near
  // strike/target, margin, concentration. Lab's Alerts tab and Overview's
  // briefing both read from this one list (and its one shared dismissal
  // state) instead of each re-deriving their own copy of these conditions.
  const bookAlerts = useMemo<UpsideAlert[]>(() => {
    // No options experience -> no strike-planning alerts at all, not just
    // a de-emphasized card. These are pure covered-call mechanics.
    const strike = hideOptionsUI
      ? []
      : buildStrikeAlerts(
          bookCoveredCallRows.map((r) => ({
            ticker: r.holding.ticker,
            spot: r.spot,
            stockTarget: r.stockTarget,
            nextStrike: r.nextStrike,
          }))
        );
    const earn = buildEarningsAlerts(earningsEvents, hideOptionsUI);
    const top = [...overview.tickers].sort(
      (a, b) => b.currentValue - a.currentValue
    )[0];
    const decisions = buildDecisionAlerts({
      cash: overview.totals.cash,
      equityValue: overview.totals.equityValue,
      topTicker: top ? { ticker: top.ticker, value: top.currentValue } : null,
    });
    return [...earn, ...strike, ...decisions];
  }, [bookCoveredCallRows, earningsEvents, overview, hideOptionsUI]);

  const activeAlerts = useMemo(
    () => bookAlerts.filter((a) => !alertToastsSent.has(a.id)),
    [bookAlerts, alertToastsSent]
  );

  // Glanceable up/down dot per sheet tab. Uses the same live move Pulse
  // does (regular, pre-market, or after-hours), so the dots don't vanish
  // the moment the regular session prints $0.
  const sheetTodayTone = useMemo(() => {
    const map: Record<string, "up" | "down" | null> = {};
    for (const s of overview.sheets) {
      let dollar = 0;
      for (const h of holdings) {
        if (h.portfolio_id !== s.portfolio.id) continue;
        const q = quotes[h.ticker];
        const pct = effectiveMove(q).pct;
        if (pct == null) continue;
        const value = h.shares * (q?.price ?? h.buy_price);
        dollar += todayDollarFor(value, pct).dollar;
      }
      map[s.portfolio.id] =
        dollar > 0 ? "up" : dollar < 0 ? "down" : null;
    }
    return map;
  }, [overview.sheets, holdings, quotes]);

  const forecast = useMemo(() => {
    if (!activePortfolio) return null;
    return buildForecast(
      portfolioHoldings,
      quotes,
      activePortfolio.cash_balance,
      eoyOverrides
    );
  }, [activePortfolio, portfolioHoldings, quotes, eoyOverrides]);

  const margusSheetTickersKey = useMemo(() => {
    if (!margusSnapshot) return "";
    return margusSnapshot.holdings
      .map((h) => h.ticker.toUpperCase())
      .sort()
      .join("|");
  }, [margusSnapshot]);

  const margusPulseByTicker = useMemo(() => {
    const out: Record<string, PulseCheck> = {};
    for (const t of margusSheetTickersKey.split("|").filter(Boolean)) {
      const cached = loadPulseTickerCache(t);
      if (cached?.check && !isEmptyPulseCheck(cached.check)) {
        out[t] = cached.check;
      }
    }
    return out;
  }, [margusSheetTickersKey]);

  const margusForecastPlan = useMemo(() => {
    if (!margusPortfolio) return null;
    return loadForecastPlan(margusPortfolio.id);
    // id is the cache key; the portfolio object is a new reference every paint
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [margusPortfolio?.id]);

  const margusConvictionsForChat = useMemo(() => {
    const out: Record<
      string,
      {
        level?: number;
        thesis?: string;
        stamps?: Array<{ at?: string; line?: string; verdict?: string }>;
      }
    > = {};
    for (const t of margusSheetTickersKey.split("|").filter(Boolean)) {
      const entry = convictionMap[t];
      if (!entry) continue;
      out[t] = {
        level: entry.level,
        thesis: entry.thesis,
        stamps: entry.stamps,
      };
    }
    return out;
  }, [margusSheetTickersKey, convictionMap]);

  function commitEoyPrice(
    ticker: string,
    year: ForecastYear,
    price: number
  ) {
    if (!activePortfolio) return;
    setEoyOverrides((prev) => {
      const next = setEoyOverride(prev, ticker, year, price);
      saveEoyOverrides(activePortfolio.id, next);
      return next;
    });
  }

  function applyMargusEoyPaths(
    paths: { ticker: string; prices: Partial<Record<ForecastYear, number>> }[]
  ) {
    if (!activePortfolio) return;
    setEoyOverrides((prev) => {
      const next = mergeEoyTargetPaths(prev, paths);
      saveEoyOverrides(activePortfolio.id, next);
      return next;
    });
  }

  function clearEoyOverrides() {
    if (!activePortfolio) return;
    setEoyOverrides({});
    saveEoyOverrides(activePortfolio.id, {});
  }

  const marketState = useMemo(() => {
    for (const q of Object.values(quotes)) {
      if (q.marketState) return q.marketState;
    }
    return null;
  }, [quotes]);

  const margusContext = useMemo(
    () =>
      margusChatContext({
        portfolio: margusPortfolio,
        snapshot: margusSnapshot,
        hideOptions: hideOptionsUI,
        marketState,
        eurUsd,
        gbpUsd,
        convictions: margusConvictionsForChat,
        pulseByTicker: margusPulseByTicker,
        forecastPlan: margusForecastPlan,
      }),
    [
      margusPortfolio,
      margusSnapshot,
      hideOptionsUI,
      marketState,
      eurUsd,
      gbpUsd,
      margusConvictionsForChat,
      margusPulseByTicker,
      margusForecastPlan,
    ]
  );

  const pickInitialSheet = useCallback(
    (list: Portfolio[]) => {
      const fromUrl = takeSheetIdFromUrl(list);
      if (fromUrl && fromUrl !== PORTFOLIO_TAB_PENDING) return fromUrl;
      /*
       * The Holdings cell was pressed before the book existed. Now it does,
       * so the question it asked gets its answer rather than being dropped
       * on the floor with the query string.
       */
      if (fromUrl === PORTFOLIO_TAB_PENDING || wantsHoldingsRef.current) {
        const target = resolveLastPortfolioId(list);
        if (target) {
          wantsHoldingsRef.current = false;
          return target;
        }
        return PORTFOLIO_TAB_PENDING;
      }
      return OVERVIEW_TAB_ID;
    },
    [takeSheetIdFromUrl]
  );

  const loadPortfolios = useCallback(async (opts?: { silent?: boolean; retry?: boolean }) => {
    const userId = user?.id ?? null;
    const hasCache = Boolean(readBookCache(userId));
    if (typeof navigator !== "undefined" && !navigator.onLine && hasCache) {
      setLoading(false);
      return;
    }
    // Cold start only — remounts (My book from Communities/Account) use cache.
    const showSplash = !opts?.silent && !hasCache;
    if (showSplash) {
      setLoading(true);
      setLoadError(null);
    } else {
      setLoading(false);
    }
    bookAbortRef.current?.abort();
    const ctrl = new AbortController();
    bookAbortRef.current = ctrl;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, 20_000);

    const fetchBook = async () => {
      const res = await fetch("/api/portfolios", {
        cache: "no-store",
        signal: ctrl.signal,
      });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Sign in required to load your portfolio");
        }
        throw new Error(`Portfolios request failed (${res.status})`);
      }
      return readJsonOrThrow<unknown>(
        res,
        "Couldn't load your portfolios. Try again."
      );
    };

    try {
      if (shouldClaimSeed(userId)) {
        await fetch("/api/auth/me", {
          cache: "no-store",
          signal: ctrl.signal,
        }).catch(() => null);
        if (userId) markSeedClaimed(userId);
      }

      let data: unknown;
      try {
        data = opts?.retry
          ? await retryOnNetwork(fetchBook, { signal: ctrl.signal })
          : await fetchBook();
      } catch (first) {
        if (ctrl.signal.aborted) throw first;
        if (
          first instanceof Error &&
          /Sign in required/i.test(first.message)
        ) {
          if (!userId) {
            data = {};
          } else {
            await refresh();
            await new Promise((r) => window.setTimeout(r, 400));
            data = await fetchBook();
          }
        } else {
          throw first;
        }
      }

      if (ctrl.signal.aborted) return;

      if (pendingBookWritesRef.current > 0) {
        reloadAfterWritesRef.current = true;
        return;
      }

      const payload = isRecord(data) ? data : {};
      const sourceName = typeof payload.source === "string" ? payload.source : "";
      if (sourceName === "supabase" || userId) {
        const parsed = keepLiveSheetsOnly(
          parsePortfolioList(payload.portfolios),
          parseHoldingList(payload.holdings)
        );
        const nextPortfolios =
          sourceName === "supabase" ? parsed.portfolios : [];
        const nextHoldings =
          sourceName === "supabase" ? parsed.holdings : [];
        const fetchedAt = Date.now();
        bookFetchedAtRef.current = fetchedAt;
        const sameBook =
          bookFingerprint(nextPortfolios, nextHoldings) ===
          bookFingerprint(bookRef.current.portfolios, bookRef.current.holdings);
        if (!sameBook) {
          setSource("supabase");
          setPortfolios(nextPortfolios);
          setHoldings(nextHoldings);
          setActiveId(() => pickInitialSheet(nextPortfolios));
        } else {
          setSource("supabase");
        }
        if (userId) {
          writeBookCache({
            userId,
            source: "supabase",
            portfolios: nextPortfolios,
            holdings: nextHoldings,
            locked: false,
            fetchedAt,
          });
        }
      } else {
        const demo = loadDemoStore();
        setSource("demo");
        setPortfolios(demo.portfolios);
        setHoldings(demo.holdings);
        setActiveId(() => pickInitialSheet(demo.portfolios));
        const isLocked = hasLockedSave();
        setLocked(isLocked);
      }
    } catch (err) {
      if (bookAbortRef.current !== ctrl) return;
      if (isAbortError(err) && !timedOut) return;
      console.error(err);
      if (showSplash) {
        setLoadError(
          timedOut
            ? "Timed out loading your portfolio. Check the connection and retry."
            : err instanceof Error
              ? err.message
              : userId
                ? "Couldn't load your portfolio. Retry when ready."
                : "Couldn't load the shared portfolio. Showing local demo, retry when ready."
        );
        if (!timedOut && !(err instanceof Error && /Sign in/i.test(err.message))) {
          if (userId) {
            setSource("supabase");
            setPortfolios([]);
            setHoldings([]);
            setLocked(false);
            writeBookCache({
              userId,
              source: "supabase",
              portfolios: [],
              holdings: [],
              locked: false,
              fetchedAt: Date.now(),
            });
          } else {
            const demo = loadDemoStore();
            setSource("demo");
            setPortfolios(demo.portfolios);
            setHoldings(demo.holdings);
            setActiveId(() => pickInitialSheet(demo.portfolios));
            setLocked(hasLockedSave());
          }
        } else if (!hasCache) {
          if (userId) {
            setSource("supabase");
            setPortfolios([]);
            setHoldings([]);
          } else {
            const demo = loadDemoStore();
            setSource("demo");
            setPortfolios(demo.portfolios);
            setHoldings(demo.holdings);
            setActiveId(() => pickInitialSheet(demo.portfolios));
            setLocked(hasLockedSave());
          }
        }
      }
    } finally {
      window.clearTimeout(timeout);
      if (bookAbortRef.current === ctrl) setLoading(false);
    }
  }, [pickInitialSheet, refresh, user?.id]);

  function beginBookWrite() {
    pendingBookWritesRef.current += 1;
  }
  function endBookWrite() {
    pendingBookWritesRef.current = Math.max(0, pendingBookWritesRef.current - 1);
    if (pendingBookWritesRef.current === 0 && reloadAfterWritesRef.current) {
      reloadAfterWritesRef.current = false;
      void loadPortfolios({ silent: true });
    }
  }
  function enqueueBookWrite(task: () => Promise<void>) {
    const run = bookWriteChainRef.current.then(task, task);
    bookWriteChainRef.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  const applyFxPayload = useCallback((fx: {
    eurUsd?: number | null;
    eurUsdOpen?: number | null;
    eurUsdPreviousClose?: number | null;
    eurUsdLast?: number | null;
    gbpUsd?: number | null;
    usdPer?: Record<string, number | null | undefined>;
  } | null | undefined) => {
    if (!fx) return;
    const last = typeof fx.eurUsdLast === "number" ? fx.eurUsdLast : null;
    const open = typeof fx.eurUsdOpen === "number" ? fx.eurUsdOpen : null;
    const previousClose =
      typeof fx.eurUsdPreviousClose === "number"
        ? fx.eurUsdPreviousClose
        : null;
    const rate =
      typeof fx.eurUsd === "number" && fx.eurUsd > 0
        ? fx.eurUsd
        : last ?? previousClose ?? open;
    if (rate && rate > 0) setEurUsd(rate);
    setEurUsdDetail({
      rate: rate && rate > 0 ? rate : null,
      open,
      previousClose,
      last,
    });
    if (typeof fx.gbpUsd === "number" && fx.gbpUsd > 0) setGbpUsd(fx.gbpUsd);
    setUsdPer((prev) => {
      const next: Record<string, number> = { ...prev, USD: 1 };
      if (rate && rate > 0) next.EUR = rate;
      if (typeof fx.gbpUsd === "number" && fx.gbpUsd > 0) next.GBP = fx.gbpUsd;
      if (fx.usdPer) {
        for (const [key, value] of Object.entries(fx.usdPer)) {
          if (typeof value === "number" && value > 0) {
            next[key.toUpperCase()] = value;
          }
        }
      }
      return next;
    });
  }, []);

  const refreshFx = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/quotes?tickers=EURUSD%3DX", { signal });
      if (!res.ok) return;
      const json = await res.json();
      applyFxPayload(json.fx);
    } catch (err) {
      if (isAbortError(err)) return;
      /* ignore */
    }
  }, [applyFxPayload]);

  const refreshMarkets = useCallback(
    async (
      tickers: string[],
      rows: Holding[],
      existingQuotes?: Record<string, Quote>,
      opts?: { quotesOnly?: boolean; silent?: boolean }
    ) => {
      if (tickers.length === 0) {
        setQuotes({});
        setOptions({});
        await refreshFx();
        return;
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return;
      }
      quotesAbortRef.current?.abort();
      const ctrl = new AbortController();
      quotesAbortRef.current = ctrl;
      try {
        let nextQuotes = existingQuotes;
        if (!nextQuotes || Object.keys(nextQuotes).length === 0) {
          const quotesRes = await fetch(quotesUrl(tickers), { signal: ctrl.signal });
          if (!quotesRes.ok) {
            setQuotesDelayed(true);
            throw new Error(`Quotes request failed (${quotesRes.status})`);
          }
          const quotesJson = await quotesRes.json();
          const incoming = (quotesJson.quotes ?? {}) as Record<string, Quote>;
          const missing = (quotesJson.missing ?? []) as string[];
          let merged = incoming;
          let unchanged = false;
          setQuotes((prev) => {
            merged = mergeQuotes(prev, incoming);
            if (quotesUnchanged(prev, merged)) {
              unchanged = true;
              merged = prev;
              nextQuotes = prev;
              return prev;
            }
            nextQuotes = merged;
            return merged;
          });
          saveCachedQuotes(merged);
          quotesPolledAtRef.current = Date.now();
          setQuotesUpdatedAt(quotesStampMs(quotesJson));
          if (!unchanged) {
            setQuotesDelayed(quotesAreDelayed(quotesJson));
            setMissingTickers((prev) =>
              prev.length === missing.length &&
              prev.every((t, i) => t === missing[i])
                ? prev
                : missing
            );
          }
          applyFxPayload(quotesJson.fx);
        }

        // No options experience -> don't even fetch options-chain data;
        // the panel that would show it never renders for these viewers.
        if (opts?.quotesOnly || hideOptionsUI) {
          if (hideOptionsUI) setOptions({});
          return;
        }

        const positions = rows.map((h) => {
          const q = nextQuotes![h.ticker];
          const spot = q?.price ?? h.buy_price;
          const history = q?.sparkline?.length
            ? q.sparkline
            : undefined;
          return {
            ticker: h.ticker,
            shares: h.shares,
            spot,
            target_call_pct: h.target_call_pct,
            stock_target: h.stock_target_override,
            // Read through a ref so picking a date doesn't have to
            // invalidate the whole quote-refresh callback.
            expiry: ccExpiryRef.current[h.id] ?? null,
            price_history: history,
          };
        });

        const optRes = await fetch("/api/options/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ positions }),
          signal: ctrl.signal,
        });
        if (!optRes.ok) return;
        const optJson = (await optRes.json().catch(() => ({}))) as {
          options?: Record<string, OptionCandidate | null>;
        };
        if (optJson.options && typeof optJson.options === "object") {
          setOptions(optJson.options);
        }
      } catch (err) {
        if (isAbortError(err) || quotesAbortRef.current !== ctrl) return;
        console.error(err);
        setQuotesDelayed(true);
      }
    },
    [applyFxPayload, refreshFx, hideOptionsUI]
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void refreshFx(ctrl.signal);
    const id = window.setInterval(() => {
      if (document.hidden) return;
      if (!isWorkspaceRoomActive("book")) return;
      if (isQuotePollFresh(quotesPolledAtRef.current)) return;
      void refreshFx(ctrl.signal);
    }, 120_000);
    return () => {
      ctrl.abort();
      window.clearInterval(id);
    };
  }, [refreshFx]);

  useEffect(() => {
    const cached = readBookCache(user?.id);
    void loadPortfolios({ silent: Boolean(cached) });
  }, [loadPortfolios, user?.id]);

  useEffect(() => {
    return () => {
      bookAbortRef.current?.abort();
      quotesAbortRef.current?.abort();
    };
  }, []);

  /*
    A pull on this room asks for exactly what coming back to the app asks for:
    the portfolios again and fresh prices for what is in them.

    Silent, because the ring above the page is already the feedback and a
    skeleton flashing under it would be the same news told twice. It is
    awaited rather than fired and forgotten, so the ring turns for as long as
    the answer really takes.
  */
  useEffect(
    () =>
      onWorkspaceRefresh("book", async () => {
        await Promise.all([
          loadPortfolios({ silent: true, retry: true }),
          allTickers.length === 0
            ? Promise.resolve()
            : refreshMarkets(allTickers, holdings, undefined, {
                quotesOnly: true,
                silent: true,
              }),
        ]);
      }),
    [loadPortfolios, refreshMarkets, allTickers, holdings]
  );

  useEffect(() => {
    const resume = () => {
      void loadPortfolios({ silent: true, retry: true });
      if (allTickers.length === 0) return;
      void refreshMarkets(allTickers, holdings, undefined, {
        quotesOnly: true,
        silent: true,
      });
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) resume();
    };
    window.addEventListener("online", resume);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("online", resume);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [loadPortfolios, refreshMarkets, allTickers, holdings]);

  // Keep session cache warm so My book remounts paint instantly.
  // Signed-in users only persist live sheets they co-own. Empty books
  // still write so a leftover local seed cannot come back on the next paint.
  useEffect(() => {
    if (loading || !user?.id) return;
    if (source !== "supabase") return;
    if (portfolios.some((p) => !isLiveSheetId(p.id))) return;
    writeBookCache({
      userId: user.id,
      source: "supabase",
      portfolios,
      holdings,
      locked,
      fetchedAt: Date.now(),
    });
  }, [portfolios, holdings, source, locked, user?.id, loading]);

  // Personal daily-visit streak — device-local, counts once per Tallinn day
  // regardless of which tab loads first.
  useEffect(() => {
    const { justHitMilestone } = recordVisitToday();
    if (justHitMilestone) toast(milestoneToast(justHitMilestone), "success");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per app load
  }, []);

  // Warm Margus's chunk once the page is idle. Keeps him off the critical
  // path without making the first click wait on a download.
  useEffect(() => {
    const warm = () => void import("@/components/CcAdvisorChat");
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(warm, { timeout: 3000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(warm, 1500);
    return () => window.clearTimeout(id);
  }, []);

  // After initial load, sheet switches push history so Back stays in-app.
  useEffect(() => {
    if (loading) {
      historyBootstrappingRef.current = true;
      return;
    }
    const t = window.setTimeout(() => {
      historyBootstrappingRef.current = false;
    }, 0);
    return () => window.clearTimeout(t);
  }, [loading]);

  /**
   * A new tab starts at the top. Switching tabs swaps the whole page body
   * but leaves the window scrolled wherever the previous tab was, so going
   * from halfway down Overview to Compound dropped you into the middle of
   * it. Skipped on back/forward, where the browser restores the position
   * you actually left.
   */
  const scrollResetSkipRef = useRef(true);
  useEffect(() => {
    if (scrollResetSkipRef.current) {
      scrollResetSkipRef.current = false;
      return;
    }
    if (historyFromPopRef.current) return;
    if (sheetFocusRef.current) return;
    window.scrollTo({ top: 0 });
  }, [activeId]);

  useEffect(() => {
    if (sheetFocusRef.current !== "covered-calls") return;
    if (!ccVisible) return;
    const t = window.setTimeout(() => {
      document
        .getElementById("covered-calls")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      sheetFocusRef.current = null;
    }, 80);
    return () => window.clearTimeout(t);
  }, [activeId, ccVisible]);

  useEffect(() => {
    // Skip until auth has actually settled and the mount layout effect has
    // resolved the real starting tab. The layout effect's dependency on
    // `user?.id` means it runs once with that value still undefined (auth
    // resolving) and again once it settles to its final id/null — and this
    // effect's own first pass can land in between, with activeId still on
    // its OVERVIEW_TAB_ID placeholder, stripping a deep-linked ?tab= from
    // the URL before it was ever actually read.
    if (!authReady || !initialSheetResolvedRef.current) return;
    if (activeId !== PORTFOLIO_TAB_PENDING) saveActiveSheetId(activeId);
    /*
     * Remembered separately from the tab above, which is holding a meta-tab
     * id most of the time and so cannot answer "which portfolio was I in".
     * The phone dock's Holdings cell asks exactly that from rooms that never
     * load a book, so it needs its own note. Written only for a portfolio the
     * account really has, since a token that resolves to nothing is worse
     * than no memory at all.
     */
    if (activePortfolio) saveLastPortfolioId(activePortfolio.id);
    if (typeof window === "undefined") return;
    // Hidden keep-alive Dashboard still runs this. Do not rewrite Fund or
    // Circle while UPSIDE LAB is sending us home.
    if (window.location.pathname !== "/") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("sheet");
    url.searchParams.delete("tab");
    url.searchParams.delete("portfolio");
    if (activeId === OVERVIEW_TAB_ID) {
      /* overview is the default; keep the URL clean */
    } else if (activeId === COMPOUND_TAB_ID) {
      url.searchParams.set("tab", "compound");
    } else if (activeId === LAB_TAB_ID) {
      url.searchParams.set("tab", "lab");
    } else if (activeId === PULSE_TAB_ID) {
      url.searchParams.set("tab", "pulse");
    } else if (activeId === ALERTS_TAB_ID) {
      url.searchParams.set("tab", "alerts");
    } else if (activeId === PORTFOLIO_TAB_PENDING) {
      url.searchParams.set("tab", "portfolio");
    } else {
      const p = portfolios.find((x) => x.id === activeId);
      url.searchParams.set("tab", "portfolio");
      url.searchParams.set("portfolio", p?.slug || activeId);
    }
    // Drop legacy guest/share query params if present.
    url.searchParams.delete("share");
    url.searchParams.delete("view");
    const href = `${url.pathname}${url.search}`;
    const state = { upsideSheet: activeId };

    if (historyFromPopRef.current) {
      historyFromPopRef.current = false;
      lastHistorySheetRef.current = activeId;
      window.history.replaceState(state, "", href);
      return;
    }

    const prev = lastHistorySheetRef.current;
    lastHistorySheetRef.current = activeId;

    if (
      historyBootstrappingRef.current ||
      prev === null ||
      prev === activeId
    ) {
      window.history.replaceState(state, "", href);
      return;
    }

    window.history.pushState(state, "", href);
  }, [activeId, activePortfolio, portfolios, authReady]);

  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      historyFromPopRef.current = true;
      const fromState =
        e.state &&
        typeof e.state === "object" &&
        "upsideSheet" in e.state &&
        typeof (e.state as { upsideSheet?: unknown }).upsideSheet === "string"
          ? (e.state as { upsideSheet: string }).upsideSheet
          : null;

      if (fromState) {
        const meta = normalizeMetaTabId(fromState);
        if (meta || portfolios.some((p) => p.id === fromState)) {
          setActiveId(meta ?? fromState);
          return;
        }
      }

      setActiveId(() => pickInitialSheet(portfolios));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [portfolios, pickInitialSheet]);

  useEffect(() => {
    const onShow = () => {
      if (!isWorkspaceRoomActive("book")) return;
      setActiveId((prev) => {
        if (takeGoHomeRequest()) return OVERVIEW_TAB_ID;
        const fromUrl = takeSheetIdFromUrl(portfolios, takeOpenTab());
        return fromUrl ?? prev;
      });
      if (!isBookFetchFresh(bookFetchedAtRef.current)) {
        void loadPortfolios({ silent: true });
      }
    };
    const onGoHome = () => {
      setActiveId(OVERVIEW_TAB_ID);
      if (isWorkspaceRoomActive("book")) takeGoHomeRequest();
    };
    const onBookRefresh = () => {
      void loadPortfolios({ silent: true });
    };
    window.addEventListener(WORKSPACE_SHOW_EVENT, onShow);
    window.addEventListener(GO_HOME_EVENT, onGoHome);
    window.addEventListener(BOOK_REFRESH_EVENT, onBookRefresh);
    return () => {
      window.removeEventListener(WORKSPACE_SHOW_EVENT, onShow);
      window.removeEventListener(GO_HOME_EVENT, onGoHome);
      window.removeEventListener(BOOK_REFRESH_EVENT, onBookRefresh);
    };
  }, [portfolios, loadPortfolios, takeSheetIdFromUrl]);

  useEffect(() => {
    if (source !== "supabase") return;

    let pollAbort: AbortController | null = null;
    const tick = async () => {
      if (document.hidden) return;
      if (!isWorkspaceRoomActive("book")) return;
      pollAbort?.abort();
      const ctrl = new AbortController();
      pollAbort = ctrl;
      try {
        const res = await fetch("/api/portfolios", {
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.source !== "supabase") return;
        const nextP = (data.portfolios ?? []) as Portfolio[];
        const nextH = (data.holdings ?? []) as Holding[];
        const nextSig = bookFingerprint(nextP, nextH);
        const local = bookRef.current;
        const localSig = bookFingerprint(local.portfolios, local.holdings);
        bookFetchedAtRef.current = Date.now();
        if (nextSig === localSig) return;
        setPortfolios(nextP);
        setHoldings(nextH);
        if (user?.id) {
          writeBookCache({
            userId: user.id,
            source: "supabase",
            portfolios: nextP,
            holdings: nextH,
            locked: false,
            fetchedAt: Date.now(),
          });
        }
        toast("This portfolio changed on another device. We pulled in the latest.", "info");
      } catch (err) {
        if (isAbortError(err)) return;
        /* ignore */
      }
    };

    const id = window.setInterval(() => void tick(), 45_000);
    return () => {
      window.clearInterval(id);
      pollAbort?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const ccSignature = portfolioHoldings
    .map(
      (h) =>
        `${h.id}:${h.ticker}:${h.shares}:${h.target_call_pct}:${h.stock_target_override ?? ""}`
    )
    .join("|");

  // Quotes for every ticker; options when on a sheet OR Lab (CC calendar needs premiums).
  // Silent: this effect re-runs on tab changes. Prices poll in the
  // background. There is no header Refresh.
  useEffect(() => {
    if (holdings.length === 0) return;
    const fresh = isQuoteFreshForView(quotesPolledAtRef.current);
    const cachedQuotes =
      fresh && Object.keys(quotesRef.current).length > 0
        ? quotesRef.current
        : undefined;

    if (isLab) {
      void refreshMarkets(allTickers, holdings, cachedQuotes, { silent: true });
      return;
    }
    if (isMetaTab) {
      if (cachedQuotes) return;
      void refreshMarkets(allTickers, holdings, undefined, {
        quotesOnly: true,
        silent: true,
      });
      return;
    }
    if (!activePortfolio) return;
    const rows = holdings.filter((h) => h.portfolio_id === activePortfolio.id);
    void refreshMarkets(allTickers, rows, cachedQuotes, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activePortfolio?.id,
    isMetaTab,
    isLab,
    ccSignature,
    allTickersKey,
    refreshMarkets,
  ]);

  /**
   * Live price poll. Cadence follows the New York clock rather than a flat 45s:
   * out of hours the same close comes back every time, and the quote chain is
   * a shared free tier. Options stay on demand.
   *
   * Holdings are read through a ref so editing the book doesn't tear the timer
   * down and start the interval over.
   */
  const pollRowsRef = useRef({ holdings, isMetaTab, portfolioId: activePortfolio?.id });
  pollRowsRef.current = { holdings, isMetaTab, portfolioId: activePortfolio?.id };

  useEffect(() => {
    if (allTickers.length === 0) return;

    let cancelled = false;
    let timer = 0;

    // `background` is the timer: skip when the cadence says nothing is due.
    // `view` is the reader arriving, where the bar is much lower, because a
    // ten minute overnight cadence must not put a ten minute old price in
    // front of somebody who just opened the app.
    const tick = (reason: "background" | "view" = "background") => {
      if (cancelled || document.hidden) return;
      if (!isWorkspaceRoomActive("book")) return;
      const fresh =
        reason === "view"
          ? isQuoteFreshForView(quotesPolledAtRef.current)
          : isQuotePollFresh(quotesPolledAtRef.current);
      if (fresh) return;
      const { holdings: rowsAll, isMetaTab: meta, portfolioId } =
        pollRowsRef.current;
      const rows = meta
        ? rowsAll
        : rowsAll.filter((h) => h.portfolio_id === portfolioId);
      void refreshMarkets(allTickers, rows, undefined, {
        quotesOnly: true,
        silent: true,
      });
    };

    // Re-armed each cycle so the cadence changes when the session does,
    // instead of being fixed at whatever it was when the tab opened.
    const schedule = () => {
      timer = window.setTimeout(() => {
        tick();
        schedule();
      }, quotePollMs());
    };
    schedule();

    const onVisibility = () => {
      if (!document.hidden && isWorkspaceRoomActive("book")) tick("view");
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // ticker identity via allTickersKey fingerprint
    // eslint-disable-next-line react-hooks/exhaustive-deps -- allTickers covered by key
  }, [allTickersKey, refreshMarkets]);

  /**
   * fetch for our own API that reports a dead network as a failed response
   * instead of throwing.
   *
   * Every optimistic write here follows the same shape: apply the change to
   * local state, fire the request, and roll back when `!res.ok`. A bare fetch
   * rejects rather than returning when the device is offline or DNS fails, so
   * those blocks skipped their own rollback and left the person looking at a
   * number that was never saved, plus an unhandled rejection in the console.
   * Offline is the normal failure for a phone app, so it has to travel the same
   * path as a 500 rather than a separate one every caller must remember.
   */
  async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
      ...(init?.headers as Record<string, string> | undefined),
    };
    if (init?.body && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
    try {
      return await fetch(input, { ...init, headers });
    } catch (err) {
      console.warn("[api] request failed", input, err);
      return Response.json(
        { error: "You look offline. Nothing was saved." },
        { status: 503 }
      );
    }
  }

  function applyCashBalance(portfolioId: string, cash: number | null | undefined) {
    if (cash == null || !Number.isFinite(Number(cash))) return;
    const next = Number(cash);
    setPortfolios((prev) =>
      prev.map((p) => (p.id === portfolioId ? { ...p, cash_balance: next } : p))
    );
  }

  function applyCashDelta(portfolioId: string, delta: number) {
    if (!Number.isFinite(delta) || delta === 0) return;
    setPortfolios((prev) =>
      prev.map((p) =>
        p.id === portfolioId
          ? { ...p, cash_balance: roundMoney(p.cash_balance + delta) }
          : p
      )
    );
  }

  function salePx(ticker: string, fallback: number) {
    const p = quotes[ticker]?.price ?? quotes[ticker.toUpperCase()]?.price;
    return typeof p === "number" && p > 0 ? p : fallback;
  }

  function handleSave(batch: HoldingFormValues[]) {
    if (!activePortfolio || batch.length === 0) return;

    let working = bookRef.current.holdings.slice();
    const applied: {
      values: HoldingFormValues;
      ticker: string;
      existing: Holding | undefined;
      optimistic: Holding;
      cashDelta: number;
      sortOrder: number;
    }[] = [];

    for (const values of batch) {
      const ticker = normalizeYahooTicker(values.ticker);
      const sortOrder =
        working.filter((h) => h.portfolio_id === activePortfolio.id).length +
        1;
      const existing = working.find(
        (h) =>
          h.portfolio_id === activePortfolio.id &&
          h.ticker.toUpperCase() === ticker
      );
      const optimistic: Holding = existing
        ? {
            ...existing,
            shares: values.shares,
            buy_price: values.buy_price,
            target_call_pct: values.target_call_pct,
          }
        : {
            id: `tmp-${crypto.randomUUID()}`,
            portfolio_id: activePortfolio.id,
            ticker,
            shares: values.shares,
            buy_price: values.buy_price,
            eoy_target: null,
            target_call_pct: values.target_call_pct,
            stock_target_override: null,
            sort_order: sortOrder,
          };

      working = existing
        ? working.map((h) =>
            h.id === existing.id ? { ...optimistic, id: existing.id } : h
          )
        : [...working, optimistic];

      let cashDelta = 0;
      if (!existing) {
        cashDelta = tradeCashDelta({
          buyShares: values.shares,
          buyPrice: values.buy_price,
        });
      } else if (values.shares > existing.shares) {
        cashDelta = tradeCashDelta({
          buyShares: values.shares - existing.shares,
          buyPrice: values.buy_price,
        });
      } else if (values.shares < existing.shares) {
        cashDelta = tradeCashDelta({
          sellShares: existing.shares - values.shares,
          sellPrice: salePx(ticker, existing.buy_price),
        });
      }
      applyCashDelta(activePortfolio.id, cashDelta);
      applied.push({
        values,
        ticker,
        existing,
        optimistic,
        cashDelta,
        sortOrder,
      });
    }

    setHoldings(working);
    setModalOpen(false);
    toast(batch.length === 1 ? "Holding saved" : "Holdings saved", "success");
    for (const row of applied) {
      track("holding_added", { ticker: row.ticker });
    }
    void refreshMarkets(
      applied.map((row) => row.ticker),
      working.filter((h) => h.portfolio_id === activePortfolio.id)
    );

    if (source === "supabase") {
      for (const row of applied) {
        const writeKey = row.existing?.id ?? row.optimistic.id;
        const writeSeq = (holdingPatchSeqRef.current.get(writeKey) ?? 0) + 1;
        holdingPatchSeqRef.current.set(writeKey, writeSeq);
        beginBookWrite();
        enqueueBookWrite(async () => {
          try {
            const res = await apiFetch("/api/holdings", {
              method: "POST",
              body: JSON.stringify({
                ...row.values,
                ticker: row.ticker,
                portfolio_id: activePortfolio.id,
                sort_order: row.sortOrder,
              }),
            });
            const raw: unknown = await res.json().catch(() => ({}));
            const data = isRecord(raw) ? raw : {};
            if (!res.ok) {
              applyCashDelta(activePortfolio.id, -row.cashDelta);
              if (holdingPatchSeqRef.current.get(writeKey) === writeSeq) {
                setHoldings((prev) => {
                  if (row.existing) {
                    return prev.map((h) =>
                      h.id === row.existing!.id ? row.existing! : h
                    );
                  }
                  return prev.filter((h) => h.id !== row.optimistic.id);
                });
              } else {
                reloadAfterWritesRef.current = true;
              }
              toast(
                plainError(
                  data.error,
                  "Couldn't save that holding. We put it back how it was."
                ),
                "error"
              );
              return;
            }
            if (holdingPatchSeqRef.current.get(writeKey) === writeSeq) {
              applyCashBalance(
                activePortfolio.id,
                readFiniteNumber(data.cash_balance)
              );
            }
            const saved = parseHolding(data.holding);
            if (saved) {
              holdingPatchSeqRef.current.set(saved.id, writeSeq);
              setHoldings((prev) => {
                const withoutTemp = prev.filter(
                  (h) => h.id !== row.optimistic.id
                );
                const exists = withoutTemp.some((h) => h.id === saved.id);
                return exists
                  ? withoutTemp.map((h) => (h.id === saved.id ? saved : h))
                  : [...withoutTemp, saved];
              });
            }
          } catch (err) {
            applyCashDelta(activePortfolio.id, -row.cashDelta);
            if (holdingPatchSeqRef.current.get(writeKey) === writeSeq) {
              setHoldings((prev) => {
                if (row.existing) {
                  return prev.map((h) =>
                    h.id === row.existing!.id ? row.existing! : h
                  );
                }
                return prev.filter((h) => h.id !== row.optimistic.id);
              });
            } else {
              reloadAfterWritesRef.current = true;
            }
            toast(
              plainError(
                err instanceof Error ? err.message : null,
                "Couldn't save that holding. We put it back how it was."
              ),
              "error"
            );
          } finally {
            endBookWrite();
          }
        });
      }
      return;
    }

    let store = loadDemoStore();
    for (const row of applied) {
      store = upsertHolding(store, {
        ...row.values,
        ticker: row.ticker,
        eoy_target: null,
        stock_target_override: null,
        portfolio_id: activePortfolio.id,
        sort_order: row.sortOrder,
      });
    }
    setPortfolios(store.portfolios);
    setHoldings(store.holdings);
  }

  function handlePatch(patch: HoldingPatch): boolean {
    const { id, ...fields } = patch;
    if (
      fields.shares != null &&
      !isSafeShares(fields.shares)
    ) {
      toast("Share count has to be bigger than 0 and not enormous.", "error");
      return false;
    }
    if (
      fields.buy_price != null &&
      !isSafePositiveMoney(fields.buy_price)
    ) {
      toast("Buy price has to be bigger than 0 and not enormous.", "error");
      return false;
    }
    const patchSeq = (holdingPatchSeqRef.current.get(id) ?? 0) + 1;
    holdingPatchSeqRef.current.set(id, patchSeq);
    const previous = bookRef.current.holdings.find((h) => h.id === id);

    // Clear stale option when strike-driving fields change
    if (
      fields.target_call_pct !== undefined ||
      fields.stock_target_override !== undefined
    ) {
      const ticker = previous?.ticker;
      if (ticker) {
        setOptions((prev) => ({ ...prev, [ticker]: null }));
      }
    }

    // Optimistic: apply immediately so every keystroke commit feels instant,
    // regardless of Supabase round-trip time. Background request rolls the
    // field back (via the same setHoldings the UI already reads from) and
    // toasts on failure instead of making the input wait.
    setHoldings((prev) =>
      prev.map((h) => (h.id === id ? { ...h, ...fields } : h))
    );
    let cashDelta = 0;
    if (previous && fields.shares != null && fields.shares !== previous.shares) {
      const buyPrice = fields.buy_price ?? previous.buy_price;
      if (fields.shares > previous.shares) {
        cashDelta = tradeCashDelta({
          buyShares: fields.shares - previous.shares,
          buyPrice,
        });
      } else {
        cashDelta = tradeCashDelta({
          sellShares: previous.shares - fields.shares,
          sellPrice: salePx(previous.ticker, previous.buy_price),
        });
      }
      applyCashDelta(previous.portfolio_id, cashDelta);
    }

    if (source === "supabase") {
      beginBookWrite();
      enqueueBookWrite(async () => {
        try {
          const res = await apiFetch("/api/holdings", {
            method: "PATCH",
            body: JSON.stringify({ id, ...fields }),
          });
          const raw: unknown = await res.json().catch(() => ({}));
          const data = isRecord(raw) ? raw : {};
          if (holdingPatchSeqRef.current.get(id) !== patchSeq) {
            if (!res.ok) reloadAfterWritesRef.current = true;
            return;
          }
          if (!res.ok) {
            if (previous) {
              setHoldings((prev) =>
                prev.map((h) => (h.id === id ? previous : h))
              );
              applyCashDelta(previous.portfolio_id, -cashDelta);
            }
            toast(
              plainError(data.error, "Couldn't update that holding. We put it back how it was."),
              "error"
            );
            return;
          }
          if (previous) {
            applyCashBalance(
              previous.portfolio_id,
              readFiniteNumber(data.cash_balance)
            );
          }
        } catch (err) {
          if (holdingPatchSeqRef.current.get(id) !== patchSeq) {
            reloadAfterWritesRef.current = true;
            return;
          }
          if (previous) {
            setHoldings((prev) =>
              prev.map((h) => (h.id === id ? previous : h))
            );
            applyCashDelta(previous.portfolio_id, -cashDelta);
          }
          toast(
            plainError(
              err instanceof Error ? err.message : null,
              "Couldn't update that holding. We put it back how it was."
            ),
            "error"
          );
        } finally {
          endBookWrite();
        }
      });
      return true;
    }
    const next = patchHolding(loadDemoStore(), id, fields);
    setHoldings(next.holdings);
    setPortfolios(next.portfolios);
    return true;
  }

  /**
   * `into` is the portfolio to write to when the caller already knows it and
   * this render does not yet.
   *
   * Every write here used to read `activePortfolio` straight off the render
   * closure and return silently when it was null. That is correct for the
   * advisor tools, which only ever run on a portfolio the reader is looking
   * at, and quietly wrong for the one path that matters most: the very
   * first paste on an empty account.
   *
   * There, `onPasteHoldings` creates the first portfolio and then imports
   * into it in the same tick. Creating it calls `setActiveId`, but React has
   * not re-rendered by the time the import runs, so `activePortfolio` is
   * still the `null` it was when the empty state was drawn. The import hit
   * this guard and returned. The portfolio appeared, the page navigated to
   * it, the holdings were dropped, and nothing anywhere said so: the button
   * simply did nothing, on the first thing a new person ever asks the app to
   * do.
   *
   * Passing the freshly created portfolio in removes the dependency on a
   * render that has not happened yet. Callers that are already on a
   * portfolio pass nothing and keep the old behaviour.
   */
  const applyAdvisorActions = useCallback(
    (actions: AdvisorAction[], into?: Portfolio) => {
      const sheet = into ?? margusPortfolio ?? activePortfolio;
      if (!actions.length || !sheet) return;

      setUndoStack((stack) =>
        pushUndoSnapshot(
          stack,
          captureSheetSnapshot({
            label: `Margus · ${actions.map((a) => a.action).slice(0, 3).join(", ")}`,
            portfolio: sheet,
            holdings,
            eoyOverrides,
          })
        )
      );

      const findHolding = (ticker: string, list: Holding[]) =>
        list.find(
          (h) =>
            h.portfolio_id === sheet.id &&
            h.ticker.toUpperCase() === ticker.toUpperCase()
        );

      if (source === "demo") {
        let store = loadDemoStore();
        let nextHoldings = store.holdings;

        for (const action of actions) {
          if (action.action === "set_call_pct") {
            const h = findHolding(action.ticker, nextHoldings);
            if (!h) continue;
            store = patchHolding(store, h.id, {
              target_call_pct: action.callPct,
            });
            nextHoldings = store.holdings;
            setOptions((opts) => ({ ...opts, [h.ticker]: null }));
          } else if (action.action === "set_call_pct_bulk") {
            for (const u of action.updates) {
              const h = findHolding(u.ticker, nextHoldings);
              if (!h) continue;
              store = patchHolding(store, h.id, {
                target_call_pct: u.callPct,
              });
              nextHoldings = store.holdings;
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            }
          } else if (action.action === "set_uniform_call_pct") {
            for (const h of nextHoldings.filter(
              (x) => x.portfolio_id === sheet.id
            )) {
              store = patchHolding(store, h.id, {
                target_call_pct: action.callPct,
              });
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            }
            nextHoldings = store.holdings;
          } else if (action.action === "update_holding") {
            const h = findHolding(action.ticker, nextHoldings);
            if (!h) continue;
            const fields: Partial<Holding> = {};
            if (action.shares != null) fields.shares = action.shares;
            if (action.buyPrice != null) fields.buy_price = action.buyPrice;
            if (Object.keys(fields).length === 0) continue;
            store = patchHolding(store, h.id, fields);
            nextHoldings = store.holdings;
            if (fields.shares != null) {
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            }
          } else if (action.action === "set_cash") {
            store = updateCash(store, sheet.id, action.cash);
          } else if (action.action === "add_holding") {
            const existing = findHolding(action.ticker, nextHoldings);
            store = upsertHolding(store, {
              id: existing?.id,
              portfolio_id: sheet.id,
              ticker: action.ticker,
              shares: action.shares,
              buy_price: action.buyPrice,
              eoy_target: existing?.eoy_target ?? null,
              target_call_pct: action.callPct,
              stock_target_override: existing?.stock_target_override ?? null,
              sort_order:
                existing?.sort_order ??
                nextHoldings.filter(
                  (h) => h.portfolio_id === sheet.id
                ).length + 1,
            });
            nextHoldings = store.holdings;
            void refreshMarkets(
              [action.ticker],
              nextHoldings.filter((h) => h.portfolio_id === sheet.id)
            );
          } else if (action.action === "import_portfolio") {
            let sortBase = nextHoldings.filter(
              (h) => h.portfolio_id === sheet.id
            ).length;
            const imported = new Set<string>();
            for (const row of action.holdings) {
              const existing = findHolding(row.ticker, nextHoldings);
              if (!existing) sortBase += 1;
              store = upsertHolding(store, {
                id: existing?.id,
                portfolio_id: sheet.id,
                ticker: row.ticker,
                shares: row.shares,
                buy_price: row.buyPrice,
                eoy_target: existing?.eoy_target ?? null,
                target_call_pct: row.callPct,
                stock_target_override: existing?.stock_target_override ?? null,
                sort_order: existing?.sort_order ?? sortBase,
              });
              nextHoldings = store.holdings;
              imported.add(row.ticker.toUpperCase());
            }
            if (action.replace !== false) {
              for (const h of nextHoldings.filter(
                (x) => x.portfolio_id === sheet.id
              )) {
                if (imported.has(h.ticker.toUpperCase())) continue;
                store = deleteHolding(store, h.id);
                setOptions((opts) => {
                  const next = { ...opts };
                  delete next[h.ticker];
                  return next;
                });
              }
              nextHoldings = store.holdings;
            }
            const tickers = action.holdings.map((h) => h.ticker);
            void refreshMarkets(
              tickers,
              nextHoldings.filter((h) => h.portfolio_id === sheet.id)
            );
            setCostBasisRows(
              action.holdings.map((row) => ({
                ticker: row.ticker,
                shares: row.shares,
                suggestedBuy: row.buyPrice,
                buyPrice: row.buyPrice,
              }))
            );
            setCostBasisOpen(true);
            if (action.cash != null) {
              store = updateCash(store, sheet.id, action.cash);
            }
          } else if (action.action === "remove_holding") {
            const h = findHolding(action.ticker, nextHoldings);
            if (!h) continue;
            store = deleteHolding(store, h.id);
            nextHoldings = store.holdings;
            setOptions((opts) => {
              const next = { ...opts };
              delete next[h.ticker];
              return next;
            });
          } else if (action.action === "set_stock_target") {
            const h = findHolding(action.ticker, nextHoldings);
            if (!h) continue;
            store = patchHolding(store, h.id, {
              stock_target_override: action.stockTarget,
            });
            nextHoldings = store.holdings;
            setOptions((opts) => ({ ...opts, [h.ticker]: null }));
          } else if (action.action === "set_stock_target_bulk") {
            for (const u of action.updates) {
              const h = findHolding(u.ticker, nextHoldings);
              if (!h) continue;
              store = patchHolding(store, h.id, {
                stock_target_override: u.stockTarget,
              });
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            }
            nextHoldings = store.holdings;
          } else if (action.action === "clear_stock_target") {
            const h = findHolding(action.ticker, nextHoldings);
            if (!h) continue;
            store = patchHolding(store, h.id, {
              stock_target_override: null,
            });
            nextHoldings = store.holdings;
            setOptions((opts) => ({ ...opts, [h.ticker]: null }));
          } else if (action.action === "apply_write_plan") {
            for (const u of action.updates) {
              const h = findHolding(u.ticker, nextHoldings);
              if (!h) continue;
              store = patchHolding(store, h.id, {
                stock_target_override: u.stockTarget,
                target_call_pct: u.callPct,
              });
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            }
            nextHoldings = store.holdings;
          }
        }

        setPortfolios(store.portfolios);
        setHoldings(store.holdings);
        return;
      }

      // Supabase path — await mutations + dedicated import endpoint
      beginBookWrite();
      enqueueBookWrite(async () => {
        try {
        let working = [...holdings];
        const findH = (ticker: string) =>
          working.find(
            (h) =>
              h.portfolio_id === sheet.id &&
              h.ticker.toUpperCase() === ticker.toUpperCase()
          );

        let failures = 0;
        const patchHoldingApi = async (
          id: string,
          fields: Record<string, number | null>
        ) => {
          const res = await apiFetch("/api/holdings", {
            method: "PATCH",
            body: JSON.stringify({ id, ...fields }),
          });
          if (!res.ok) {
            failures += 1;
            return false;
          }
          const data = (await res.json().catch(() => ({}))) as {
            cash_balance?: number | null;
          };
          applyCashBalance(sheet.id, data.cash_balance);
          working = working.map((x) =>
            x.id === id ? ({ ...x, ...fields } as Holding) : x
          );
          setHoldings((prev) =>
            prev.map((x) => (x.id === id ? { ...x, ...fields } : x))
          );
          return true;
        };

        for (const action of actions) {
          if (
            action.action === "set_call_pct" ||
            action.action === "update_holding"
          ) {
            const h = findH(action.ticker);
            if (!h) continue;
            const fields: Record<string, number | null> = {};
            if (action.action === "set_call_pct") {
              fields.target_call_pct = action.callPct;
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            } else {
              if (action.shares != null) fields.shares = action.shares;
              if (action.buyPrice != null) fields.buy_price = action.buyPrice;
              if (action.shares != null) {
                setOptions((opts) => ({ ...opts, [h.ticker]: null }));
              }
            }
            if (!Object.keys(fields).length) continue;
            await patchHoldingApi(h.id, fields);
          } else if (action.action === "set_call_pct_bulk") {
            for (const u of action.updates) {
              const h = findH(u.ticker);
              if (!h) continue;
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
              await patchHoldingApi(h.id, { target_call_pct: u.callPct });
            }
          } else if (action.action === "set_uniform_call_pct") {
            for (const h of working.filter(
              (x) => x.portfolio_id === sheet.id
            )) {
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
              await patchHoldingApi(h.id, { target_call_pct: action.callPct });
            }
          } else if (action.action === "set_cash") {
            const res = await apiFetch("/api/portfolios", {
              method: "PATCH",
              body: JSON.stringify({
                id: sheet.id,
                cash_balance: action.cash,
              }),
            });
            if (!res.ok) failures += 1;
            else {
              setPortfolios((prev) =>
                prev.map((p) =>
                  p.id === sheet.id
                    ? { ...p, cash_balance: action.cash }
                    : p
                )
              );
            }
          } else if (action.action === "add_holding") {
            const res = await apiFetch("/api/holdings", {
              method: "POST",
              body: JSON.stringify({
                portfolio_id: sheet.id,
                ticker: action.ticker,
                shares: action.shares,
                buy_price: action.buyPrice,
                target_call_pct: action.callPct,
                sort_order:
                  working.filter((h) => h.portfolio_id === sheet.id)
                    .length + 1,
              }),
            });
            if (!res.ok) failures += 1;
            else {
              const data = (await res.json().catch(() => ({}))) as {
                cash_balance?: number | null;
              };
              applyCashBalance(sheet.id, data.cash_balance);
              await loadPortfolios({ silent: true });
            }
          } else if (action.action === "import_portfolio") {
            const res = await apiFetch("/api/holdings/import", {
              method: "POST",
              body: JSON.stringify({
                portfolio_id: sheet.id,
                cash: action.cash ?? null,
                replace: action.replace !== false,
                holdings: action.holdings.map((row) => ({
                  ticker: row.ticker,
                  shares: row.shares,
                  buy_price: row.buyPrice,
                  target_call_pct: row.callPct,
                })),
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              failures += 1;
              toast(
                plainError(data.error, "Couldn't import that file. Try again."),
                "error"
              );
            } else {
              const upserted = Number(data.upserted ?? 0);
              const removed = Number(data.removed ?? 0);
              const failed = Array.isArray(data.failed) ? data.failed.length : 0;
              const cashBit = data.cashUpdated ? " - cash updated" : "";
              const removeBit = removed ? ` - removed ${removed}` : "";
              toast(
                `Imported ${upserted} ticker${upserted === 1 ? "" : "s"}${cashBit}${removeBit}${
                  failed ? ` - ${failed} failed` : ""
                }`,
                failed ? "error" : "success"
              );
              await loadPortfolios({ silent: true });
              if (upserted > 0) {
                setCostBasisRows(
                  action.holdings.map((row) => ({
                    ticker: row.ticker,
                    shares: row.shares,
                    suggestedBuy: row.buyPrice,
                    buyPrice: row.buyPrice,
                  }))
                );
                setCostBasisOpen(true);
              }
            }
          } else if (action.action === "remove_holding") {
            const h = findH(action.ticker);
            if (!h) continue;
            const res = await apiFetch(`/api/holdings?id=${h.id}`, {
              method: "DELETE",
            });
            if (!res.ok) failures += 1;
            else {
              const data = (await res.json().catch(() => ({}))) as {
                cash_balance?: number | null;
              };
              applyCashBalance(sheet.id, data.cash_balance);
              working = working.filter((x) => x.id !== h.id);
              setHoldings((prev) => prev.filter((x) => x.id !== h.id));
            }
          } else if (action.action === "set_stock_target") {
            const h = findH(action.ticker);
            if (!h) continue;
            setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            await patchHoldingApi(h.id, {
              stock_target_override: action.stockTarget,
            });
          } else if (action.action === "set_stock_target_bulk") {
            for (const u of action.updates) {
              const h = findH(u.ticker);
              if (!h) continue;
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
              await patchHoldingApi(h.id, {
                stock_target_override: u.stockTarget,
              });
            }
          } else if (action.action === "clear_stock_target") {
            const h = findH(action.ticker);
            if (!h) continue;
            setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            await patchHoldingApi(h.id, { stock_target_override: null });
          } else if (action.action === "apply_write_plan") {
            for (const u of action.updates) {
              const h = findH(u.ticker);
              if (!h) continue;
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
              await patchHoldingApi(h.id, {
                stock_target_override: u.stockTarget,
                target_call_pct: u.callPct,
              });
            }
          }
        }

        if (failures > 0) {
          toast(
            failures === 1
              ? "Couldn't save what Margus suggested. Try again."
              : `Couldn't save ${failures} of Margus's suggestions. Try again.`,
            "error"
          );
          await loadPortfolios({ silent: true });
        }
        } catch (err) {
          toast(
            plainError(
              err instanceof Error ? err.message : null,
              "Couldn't save what Margus suggested. Try again."
            ),
            "error"
          );
          await loadPortfolios({ silent: true });
        } finally {
          endBookWrite();
        }
      });
    },
    // refreshMarkets / loadPortfolios are stable enough via closure for advisor tools
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activePortfolio, margusPortfolio, holdings, source, eoyOverrides]
  );

  /**
   * First-run actions fire from Overview, which is a meta-tab with no
   * active sheet, and every write path bails out without one (handleSave
   * returns early on a null activePortfolio). Create the first sheet if
   * needed, then switch to it so the import lands where they can see it.
   */
  const startFirstRunAction = useCallback(
    (kind: "manual" | "csv") => {
      void (async () => {
        try {
          const target = await ensureFirstSheet();
          if (!target) return;
          if (activeId !== target.id) setActiveId(target.id);
          if (kind === "manual") setModalOpen(true);
          else setCsvImportOpen(true);
        } catch (err) {
          toast(
            plainError(
              err instanceof Error ? err.message : null,
              "Couldn't create the first portfolio. Try again."
            ),
            "error"
          );
        }
      })();
    },
    // ensureFirstSheet is a function declaration in this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, portfolios]
  );

  const handleCsvImport = useCallback(
    (
      input: { rows: CsvHoldingRow[]; cash: number | null; replace: boolean },
      // The portfolio to land in, for a caller that just created it. See the
      // note on `applyAdvisorActions`.
      into?: Portfolio
    ) => {
      if (input.rows.length === 0 && input.cash == null) return;
      track("csv_import", { rows: input.rows.length, replace: input.replace });
      applyAdvisorActions(
        [
          {
            action: "import_portfolio",
            cash: input.cash,
            replace: input.replace,
            holdings: input.rows.map((r) => ({
              ticker: r.ticker,
              shares: r.shares,
              buyPrice: r.buyPrice,
              callPct: r.callPct ?? STRATEGY.defaultCallPct,
            })),
          },
        ],
        into
      );
      const sheetId = into?.id ?? inviteSheet?.id ?? activePortfolio?.id;
      if (sheetId) markSheetImported(sheetId);
    },
    [applyAdvisorActions, inviteSheet?.id, activePortfolio?.id]
  );

  function undoLastMargusWrite() {
    const { stack, snap } = popUndoSnapshot(undoStack);
    if (!snap) {
      toast("Nothing to undo", "info");
      return;
    }
    setUndoStack(stack);
    setPortfolios((prev) =>
      prev.map((p) =>
        p.id === snap.portfolioId ? { ...p, cash_balance: snap.cashBalance } : p
      )
    );
    setHoldings((prev) => [
      ...prev.filter((h) => h.portfolio_id !== snap.portfolioId),
      ...snap.holdings,
    ]);
    setEoyOverrides(snap.eoyOverrides);
    saveEoyOverrides(snap.portfolioId, snap.eoyOverrides);
    if (source === "demo") {
      const store = loadDemoStore();
      let next = updateCash(store, snap.portfolioId, snap.cashBalance);
      for (const h of next.holdings.filter(
        (x) => x.portfolio_id === snap.portfolioId
      )) {
        next = deleteHolding(next, h.id);
      }
      for (const h of snap.holdings) {
        next = upsertHolding(next, { ...h });
      }
      setPortfolios(next.portfolios);
      setHoldings(next.holdings);
    }
    toast(`Undid: ${snap.label}`, "success");
  }

  function requestDeleteHolding(id: string) {
    const h = holdings.find((x) => x.id === id);
    setConfirmDelete({
      kind: "holding",
      id,
      label: h?.ticker ?? "holding",
    });
  }

  function deleteHoldingById(id: string): boolean {
    const removed = bookRef.current.holdings.find((h) => h.id === id);
    const cashDelta = removed
      ? tradeCashDelta({
          sellShares: removed.shares,
          sellPrice: salePx(removed.ticker, removed.buy_price),
        })
      : 0;
    if (removed) applyCashDelta(removed.portfolio_id, cashDelta);
    if (source === "supabase") {
      const writeSeq = (holdingPatchSeqRef.current.get(id) ?? 0) + 1;
      holdingPatchSeqRef.current.set(id, writeSeq);
      setHoldings((prev) => prev.filter((h) => h.id !== id));
      beginBookWrite();
      enqueueBookWrite(async () => {
        try {
          const res = await apiFetch(`/api/holdings?id=${id}`, {
            method: "DELETE",
          });
          const raw: unknown = await res.json().catch(() => ({}));
          const data = isRecord(raw) ? raw : {};
          if (holdingPatchSeqRef.current.get(id) !== writeSeq) {
            if (!res.ok) reloadAfterWritesRef.current = true;
            return;
          }
          if (!res.ok) {
            if (removed) {
              setHoldings((prev) => [...prev, removed]);
              applyCashDelta(removed.portfolio_id, -cashDelta);
            }
            toast(
              plainError(data.error, "Couldn't delete that holding. It's still there."),
              "error"
            );
            return;
          }
          if (removed) {
            applyCashBalance(
              removed.portfolio_id,
              readFiniteNumber(data.cash_balance)
            );
          }
        } catch (err) {
          if (holdingPatchSeqRef.current.get(id) !== writeSeq) {
            reloadAfterWritesRef.current = true;
            return;
          }
          if (removed) {
            setHoldings((prev) => [...prev, removed]);
            applyCashDelta(removed.portfolio_id, -cashDelta);
          }
          toast(
            plainError(
              err instanceof Error ? err.message : null,
              "Couldn't delete that holding. It's still there."
            ),
            "error"
          );
        } finally {
          endBookWrite();
        }
      });
    } else {
      const next = deleteHolding(loadDemoStore(), id);
      setHoldings(next.holdings);
      setPortfolios(next.portfolios);
    }
    toast("Holding deleted", "success");
    return true;
  }

  async function handleAddSheet(
    name: string,
    opts?: { silent?: boolean }
  ): Promise<Portfolio | undefined> {
    if (addingSheetRef.current) return addingSheetRef.current;
    const run = (async () => {
    const isFirstSheet = bookRef.current.portfolios.filter((p) =>
      isLiveSheetId(p.id)
    ).length === 0;
    const trimmed = sanitizeSheetName(name);
    if (!trimmed) return undefined;
    if (user) {
      const res = await apiFetch("/api/portfolios", {
        method: "POST",
        body: JSON.stringify({ name: trimmed }),
      });
      const raw: unknown = await res.json().catch(() => ({}));
      const data = isRecord(raw) ? raw : {};
      if (!res.ok) {
        toast(
          plainError(data.error, "Couldn't add that portfolio. Try again."),
          "error"
        );
        return undefined;
      }
      const created = parsePortfolio(data.portfolio);
      if (!created) {
        toast("Couldn't add that portfolio. Try again.", "error");
        return undefined;
      }
      setSource("supabase");
      setPortfolios((prev) => {
        const own = prev.filter((p) => isLiveSheetId(p.id));
        return own.some((p) => p.id === created.id) ? own : [...own, created];
      });
      setHoldings((prev) => prev.filter((h) => isLiveSheetId(h.portfolio_id)));
      seedNewSheetPanelDefaults(created);
      setActiveId(created.id);
      track("sheet_created", { first_sheet: isFirstSheet });
      if (!opts?.silent) toast("Portfolio added", "success");
      return created;
    }
    const next = addPortfolio(loadDemoStore(), trimmed);
    setPortfolios(next.portfolios);
    const created = next.portfolios[next.portfolios.length - 1];
    seedNewSheetPanelDefaults(created);
    setActiveId(created.id);
    track("sheet_created", { first_sheet: isFirstSheet });
    if (!opts?.silent) toast("Portfolio added", "success");
    return created;
    })();
    addingSheetRef.current = run;
    try {
      return await run;
    } finally {
      addingSheetRef.current = null;
    }
  }

  async function ensureFirstSheet(): Promise<Portfolio | undefined> {
    const own = portfolios.filter((p) => isLiveSheetId(p.id));
    if (own[0]) return own[0];
    if (creatingFirstSheetRef.current) return creatingFirstSheetRef.current;
    const pending = handleAddSheet(FIRST_SHEET_NAME, { silent: true });
    creatingFirstSheetRef.current = pending;
    try {
      return await pending;
    } finally {
      creatingFirstSheetRef.current = null;
    }
  }

  async function beginSilentScreenshotImport(files: File[]) {
    const images = imageFilesFromList(files).slice(0, 1);
    if (images.length === 0) return;
    setScreenshotPending(true);
    try {
      let targetId = margusPortfolio?.id ?? activePortfolio?.id ?? null;
      if (!targetId) {
        const created = await ensureFirstSheet();
        if (!created) {
          setScreenshotPending(false);
          return;
        }
        targetId = created.id;
        if (activeId !== created.id) setActiveId(created.id);
      }
      silentScreenshotSeq.current += 1;
      setSilentScreenshot({
        id: silentScreenshotSeq.current,
        portfolioId: targetId,
        files: images,
      });
    } catch (err) {
      setScreenshotPending(false);
      toast(
        plainError(
          err instanceof Error ? err.message : null,
          "Couldn't start that screenshot import. Try again."
        ),
        "error"
      );
    }
  }

  function handleRenameSheet(id: string, name: string) {
    const previousName = bookRef.current.portfolios.find((p) => p.id === id)?.name;
    const renameSeq = (cashWriteSeqRef.current.get(`rename:${id}`) ?? 0) + 1;
    cashWriteSeqRef.current.set(`rename:${id}`, renameSeq);
    setPortfolios((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name } : p))
    );
    setRenameTarget(null);
    toast("Portfolio renamed", "success");

    if (source === "supabase") {
      beginBookWrite();
      enqueueBookWrite(async () => {
        try {
          const res = await apiFetch("/api/portfolios", {
            method: "PATCH",
            body: JSON.stringify({ id, name }),
          });
          if (!res.ok) {
            const raw: unknown = await res.json().catch(() => ({}));
            const data = isRecord(raw) ? raw : {};
            if (cashWriteSeqRef.current.get(`rename:${id}`) === renameSeq && previousName != null) {
              setPortfolios((prev) =>
                prev.map((p) => (p.id === id ? { ...p, name: previousName } : p))
              );
            }
            toast(
              plainError(data.error, "Couldn't rename that portfolio. We put the old name back."),
              "error"
            );
          }
        } catch (err) {
          if (cashWriteSeqRef.current.get(`rename:${id}`) === renameSeq && previousName != null) {
            setPortfolios((prev) =>
              prev.map((p) => (p.id === id ? { ...p, name: previousName } : p))
            );
          }
          toast(
            plainError(
              err instanceof Error ? err.message : null,
              "Couldn't rename that portfolio. We put the old name back."
            ),
            "error"
          );
        } finally {
          endBookWrite();
        }
      });
    } else {
      renamePortfolio(loadDemoStore(), id, name);
    }
  }

  async function deleteSheetById(id: string): Promise<boolean> {
    try {
    if (source === "supabase") {
      const res = await apiFetch(`/api/portfolios?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const raw: unknown = await res.json().catch(() => ({}));
        const data = isRecord(raw) ? raw : {};
        toast(
          plainError(data.error, "Couldn't delete that portfolio. Try again."),
          "error"
        );
        return false;
      }
      clearChatHistory(id);
      setPortfolios((prev) => prev.filter((p) => p.id !== id));
      setHoldings((prev) => prev.filter((h) => h.portfolio_id !== id));
      setActiveId((prev) => (prev === id ? OVERVIEW_TAB_ID : prev));
    } else {
      const next = deletePortfolio(loadDemoStore(), id);
      clearChatHistory(id);
      setPortfolios(next.portfolios);
      setHoldings(next.holdings);
      if (activeId === id) setActiveId(OVERVIEW_TAB_ID);
    }
    toast("Portfolio deleted", "success");
    return true;
    } catch (err) {
      toast(
        plainError(
          err instanceof Error ? err.message : null,
          "Couldn't delete that portfolio. Try again."
        ),
        "error"
      );
      return false;
    }
  }

  function handleSaveCash(cash: number) {
    if (!activePortfolio) return;
    const portfolioId = activePortfolio.id;
    const previousCash = activePortfolio.cash_balance;
    const cashSeq = (cashWriteSeqRef.current.get(portfolioId) ?? 0) + 1;
    cashWriteSeqRef.current.set(portfolioId, cashSeq);

    if (source === "demo") {
      const next = updateCash(loadDemoStore(), portfolioId, cash);
      setPortfolios(next.portfolios);
    } else {
      setPortfolios((prev) =>
        prev.map((p) => (p.id === portfolioId ? { ...p, cash_balance: cash } : p))
      );
      beginBookWrite();
      enqueueBookWrite(async () => {
        try {
          const res = await apiFetch("/api/portfolios", {
            method: "PATCH",
            body: JSON.stringify({ id: portfolioId, cash_balance: cash }),
          });
          if (!res.ok) {
            const raw: unknown = await res.json().catch(() => ({}));
            const data = isRecord(raw) ? raw : {};
            if (cashWriteSeqRef.current.get(portfolioId) === cashSeq) {
              setPortfolios((prev) =>
                prev.map((p) =>
                  p.id === portfolioId ? { ...p, cash_balance: previousCash } : p
                )
              );
            }
            toast(
              plainError(data.error, "Couldn't update cash. We put the old number back."),
              "error"
            );
          }
        } catch (err) {
          if (cashWriteSeqRef.current.get(portfolioId) === cashSeq) {
            setPortfolios((prev) =>
              prev.map((p) =>
                p.id === portfolioId ? { ...p, cash_balance: previousCash } : p
              )
            );
          }
          toast(
            plainError(
              err instanceof Error ? err.message : null,
              "Couldn't update cash. We put the old number back."
            ),
            "error"
          );
        } finally {
          endBookWrite();
        }
      });
    }
    setCashModalOpen(false);
    toast("Cash updated", "success");
  }

  function resetDemo() {
    // v1–v7 are legacy schema versions; v8 is today's STORAGE_KEY in
    // demo-store.ts — included here on purpose so Reset fully reseeds it.
    // Do NOT remove portfell-locked — Reset restores the last Save.
    for (let v = 1; v <= 8; v++) {
      localStorage.removeItem(`portfell-demo-v${v}`);
    }
    const demo = resetDemoStore();
    setPortfolios(demo.portfolios);
    setHoldings(demo.holdings);
    setActiveId(OVERVIEW_TAB_ID);
    setLocked(hasLockedSave());
  }

  function saveLock() {
    const lockedStore = lockDemoStore({ portfolios, holdings });
    setPortfolios(lockedStore.portfolios);
    setHoldings(lockedStore.holdings);
    setLocked(true);
    setSaveFlash(true);
    later(() => setSaveFlash(false), 1600);
    void fetch("/api/demo/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lockedStore),
    }).catch((err) => {
      console.warn("[demo] lock snapshot failed", err);
    });
  }

  const overviewTickerKey = overview.tickers
    .map((t) => t.ticker)
    .slice(0, 40)
    .join(",");
  useEffect(() => {
    if (!overviewTickerKey) return;
    const ctrl = new AbortController();

    const load = () => {
      void fetch(
        `/api/market/events?tickers=${encodeURIComponent(overviewTickerKey)}`,
        { signal: ctrl.signal }
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (ctrl.signal.aborted || !data) return;
          const events = Array.isArray(data.earnings) ? data.earnings : [];
          setEarningsEvents(events);
        })
        .catch((err) => {
          if (isAbortError(err)) return;
          /* keep whatever was already loaded */
        });
    };

    load();
    // Hourly background refresh, no market-session gating — pre-market and
    // after-hours refresh the same as regular trading hours. Skipped while
    // the tab is hidden; resumes on the next tick once visible again.
    const id = window.setInterval(() => {
      if (!document.hidden && isWorkspaceRoomActive("book")) load();
    }, PULSE_REFRESH_MS);
    return () => {
      ctrl.abort();
      window.clearInterval(id);
    };
  }, [overviewTickerKey]);

  useEffect(() => {
    const prev = alertToastsSentRef.current;
    const fresh = bookAlerts.filter((a) => !prev.has(a.id));
    if (fresh.length === 0) return;
    // Compute the new Set as a plain value (not a functional updater) so the
    // toast() side effects below never run inside React's state-update path
    // — doing that was tripping "Cannot update a component while rendering
    // a different component" (setAlertToastsSent's updater was calling
    // toast(), which itself calls setState on ToastProvider).
    const updated = new Set(prev);
    for (const a of fresh) updated.add(a.id);
    saveDismissedAlertIds(updated);
    setAlertToastsSent(updated);
    for (const a of fresh) toast(a.title, "info");
  }, [bookAlerts, toast]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commandItems: CommandItem[] = useMemo(() => {
    const items: CommandItem[] = [
      {
        id: "overview",
        label: "Overview",
        group: "Go",
        run: () => setActiveId(OVERVIEW_TAB_ID),
      },
      {
        id: "compound",
        label: "Compound",
        group: "Go",
        run: () => setActiveId(COMPOUND_TAB_ID),
      },
      {
        id: "pulse",
        label: "Pulse: check why you own it",
        group: "Go",
        hint: "Big movers",
        run: () => setActiveId(PULSE_TAB_ID),
      },
      {
        id: "statistics",
        label: "Seasonality",
        group: "Go",
        hint: "In Lab - year & calendar patterns",
        run: () => {
          setLabIntent("seasonality");
          setActiveId(LAB_TAB_ID);
        },
      },
    ];
    items.push({
      id: "lab",
      label: "Lab",
      group: "Go",
      hint: "Analysis tools",
      run: () => setActiveId(LAB_TAB_ID),
    });
    items.push({
      id: "undo",
      label: "Undo last Margus write",
      group: "Edit",
      run: () => undoLastMargusWrite(),
    });
    items.push({
      id: "snapshots",
      label: "Snapshots",
      group: "Edit",
      run: () => setSnapshotsOpen(true),
    });
    for (const p of portfolios) {
      items.push({
        id: `sheet-${p.id}`,
        label: p.name,
        group: "Portfolios",
        run: () => setActiveId(p.id),
      });
    }
    for (const t of overview.tickers.slice(0, 30)) {
      items.push({
        id: `ticker-${t.ticker}`,
        label: t.ticker,
        group: "Tickers",
        hint: t.portfolios[0],
        run: () => {
          const sheet = portfolios.find((p) => t.portfolios.includes(p.name));
          if (sheet) setActiveId(sheet.id);
          setDrawerTicker(t.ticker);
        },
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [portfolios, overview.tickers, undoStack.length]);

  // Page-level view toggles for the current sheet — kept separate from
  // account actions below so one menu isn't a junk drawer of unrelated
  // things. Doesn't duplicate Communities/My account: those are already
  // one click away via WorkspaceSwitcher right next to this. Command
  // palette isn't listed here — ⌘K already opens it globally (see the
  // keydown listener below), so a menu entry was just a redundant, often
  // lone item making this button show up for no reason.
  const viewMenuItems: HeaderMenuItem[] = useMemo(() => {
    const items: HeaderMenuItem[] = [];
    if (undoStack.length > 0) {
      items.push({
        id: "undo",
        label: "Undo Margus write",
        onSelect: () => undoLastMargusWrite(),
      });
    }
    if (!isMetaTab) {
      if (source === "supabase" && activePortfolio) {
        items.push({
          id: "invite",
          label: "Invite a partner",
          onSelect: () => setInviteOpen(true),
        });
      }
      if (!hideOptionsUI) {
        items.push({
          id: "cc",
          label: ccVisible ? "Hide covered calls" : "Show covered calls",
          onSelect: () => toggleCcVisible(),
        });
      }
      items.push({
        id: "forecast",
        label: forecastVisible ? "Hide forecast" : "Show forecast",
        onSelect: () => toggleForecastVisible(),
      });
    }
    if (source === "demo") {
      items.push({
        id: "save",
        label: saveFlash ? "Saved" : "Save demo lock",
        onSelect: () => saveLock(),
      });
      items.push({
        id: "reset",
        label: locked ? "Restore save" : "Reset demo",
        onSelect: () => resetDemo(),
      });
    }
    return items;
    // Handlers are plain functions in this component; rebuild when visible UI state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- menu chrome deps only
  }, [
    undoStack.length,
    source,
    isMetaTab,
    ccVisible,
    hideOptionsUI,
    forecastVisible,
    saveFlash,
    locked,
    activePortfolio?.id,
  ]);

  // Account-scoped actions. Rooms are Book/Fund/Communities; Account
  // lives here so it isn't a second tab next to the avatar.
  const accountMenuItems: HeaderMenuItem[] = useMemo(() => {
    if (source !== "supabase") return [];
    return [
      {
        id: "account",
        label: "Account",
        onSelect: () => router.push("/account"),
      },
      {
        id: "feedback",
        label: "Feedback",
        onSelect: () => openManual(),
      },
      {
        id: "snapshots",
        label: "Snapshots",
        onSelect: () => setSnapshotsOpen(true),
      },
      {
        id: "signout",
        label: "Sign out",
        onSelect: () =>
          void signOut().then(() => {
            clearBookCache();
            router.push("/");
            router.refresh();
          }),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- menu chrome deps only
  }, [source]);

  const onOpenSheet = useStableCallback(openSheet);
  const onPulseIntentConsumed = useStableCallback(() => setPulseIntent(null));
  const onLabIntentConsumed = useStableCallback(() => setLabIntent(null));
  const onWriteThesis = useStableCallback((t: string) => setDrawerTicker(t));
  const onStampPulse = useStableCallback(
    (
      ticker: string,
      stamp: {
        at: string;
        verdict: string;
        line: string;
        action?: string;
        thesisStatus?: string;
      }
    ) => {
      patchLab({
        conviction: addPulseStamp(convictionMap, ticker, stamp),
      });
    }
  );
  const onOpenCompound = useStableCallback(() => setActiveId(COMPOUND_TAB_ID));
  const onOpenAlerts = useStableCallback(() => setActiveId(ALERTS_TAB_ID));
  const onOpenCash = useStableCallback(() => {
    const target = [...portfolios].sort(
      (a, b) => a.cash_balance - b.cash_balance
    )[0];
    if (!target) return;
    setActiveId(target.id);
    setCashModalOpen(true);
  });
  const onOpenLab = useStableCallback((tab?: LabDeepLink) => {
    if (tab) setLabIntent(tab);
    setActiveId(LAB_TAB_ID);
  });
  const onOpenPulse = useStableCallback((ticker?: string) => {
    if (ticker) setPulseIntent(ticker);
    setActiveId(PULSE_TAB_ID);
  });
  const onOverviewAddHolding = useStableCallback(() =>
    startFirstRunAction("manual")
  );
  const onOverviewImportScreenshot = useStableCallback((files: File[]) => {
    void beginSilentScreenshotImport(files);
  });
  const onOverviewImportCsv = useStableCallback(() =>
    startFirstRunAction("csv")
  );
  const onPasteHoldings = useStableCallback(
    (input: {
      rows: CsvHoldingRow[];
      cash: number | null;
      replace: boolean;
    }) => {
      void (async () => {
        try {
          const target = await ensureFirstSheet();
          // `handleAddSheet` has already said why if this is undefined.
          if (!target) return;
          // Pass the portfolio explicitly: on a first run it was created a
          // moment ago and this render still thinks there isn't one.
          handleCsvImport(input, target);
          markSheetImported(target.id);
        } catch (err) {
          toast(
            plainError(
              err instanceof Error ? err.message : null,
              "Couldn't import those holdings. Try again."
            ),
            "error"
          );
        }
      })();
    }
  );
  const onPatchHolding = useStableCallback(handlePatch);
  const onDeleteHolding = useStableCallback(requestDeleteHolding);
  const onSetEoyPrice = useStableCallback(commitEoyPrice);
  const onApplyMargusPaths = useStableCallback(applyMargusEoyPaths);
  const onClearForecastOverrides = useStableCallback(() =>
    setConfirmResetForecast(true)
  );
  const onAddHolding = useStableCallback(() => setModalOpen(true));
  const onEditCash = useStableCallback(() => {
    if (!canClassCash) return;
    setCashModalOpen(true);
  });
  const onAskMargus = useStableCallback(() =>
    setMargusExpandSignal((n) => n + 1)
  );
  const onImportScreenshot = useStableCallback((files: File[]) => {
    void beginSilentScreenshotImport(files);
  });
  const onImportCsv = useStableCallback(() => setCsvImportOpen(true));
  const onOpenTicker = useStableCallback((t: string) => setDrawerTicker(t));
  const onDisplayCurrencyChange = useStableCallback((code: DisplayCurrency) => {
    if (!activePortfolio) return;
    setDisplayCurrencyByPortfolio((prev) => {
      const next = { ...prev, [activePortfolio.id]: code };
      saveDisplayCurrencyMap(next);
      return next;
    });
  });
  const onPatchTargetCall = useStableCallback(
    (id: string, target_call_pct: number) =>
      handlePatch({ id, target_call_pct })
  );
  const onPatchStockTarget = useStableCallback(
    (id: string, stockTarget: number) =>
      handlePatch({ id, stock_target_override: stockTarget })
  );
  /**
   * Pick the expiry the covered-call premium is quoted for.
   *
   * Re-scans immediately rather than waiting for the next poll: the whole
   * point of editing the date is to see what that tenor pays, and a
   * premium that lags the expiry beside it would be worse than not
   * letting it be edited at all. `quotesOnly: false` so the options leg
   * actually runs.
   */
  const onPatchExpiry = useStableCallback(
    (id: string, expiry: string | null) => {
      setCcExpiry((prev) => {
        if ((prev[id] ?? null) === expiry) return prev;
        const next = { ...prev };
        if (expiry) next[id] = expiry;
        else delete next[id];
        ccExpiryRef.current = next;
        return next;
      });
      void refreshFx();
    }
  );
  const onShowForecast = useStableCallback(() => toggleForecastVisible());

  const tradeLock = useMemo(
    () =>
      classTrade
        ? {
            canBuy: classTrade.canBuy,
            canSell: classTrade.canSell,
            canCash: classTrade.canCash,
            message: classTrade.message,
          }
        : null,
    [classTrade]
  );

  const headerAvatar = useMemo(
    () => ({
      url: profile?.avatar_url,
      initial: (profile?.display_name || user?.email || "?")
        .trim()
        .charAt(0)
        .toUpperCase(),
    }),
    [profile?.avatar_url, profile?.display_name, user?.email]
  );

  const headerStatus = useMemo(
    () => ({
      quotesUpdatedAt,
      quotesDelayed,
      quotedCount: Math.max(0, allTickers.length - missingTickers.length),
      totalCount: allTickers.length,
    }),
    [quotesUpdatedAt, quotesDelayed, allTickers.length, missingTickers.length]
  );

  /** Paper-class accounts cannot open a real book, so they get no add cell. */
  const paperClassOnly = isPaperClassOnly(portfolios);

  const sheetPickerSheets = useMemo(
    () => portfolios.map((p) => ({ id: p.id, name: p.name })),
    [portfolios]
  );

  const compoundSheets = useMemo(
    () =>
      overview.sheets.map((s) => ({
        id: s.portfolio.id,
        name: s.portfolio.name,
        value: s.totalValue,
      })),
    [overview.sheets]
  );

  const compoundTickerValues = useMemo(
    () =>
      overview.tickers.map((t) => ({
        ticker: t.ticker,
        value: t.currentValue,
      })),
    [overview.tickers]
  );

  const labHiddenTabs = experienceTier
    ? TIER_HIDDEN_LAB_TABS[experienceTier]
    : EMPTY_HIDDEN_TABS;

  const accountEnd =
    source === "supabase" ? (
      <HeaderOverflowMenu
        items={accountMenuItems}
        label={profile?.display_name || user?.email || "Account"}
        avatar={headerAvatar}
      />
    ) : null;

  function selectDockTarget(id: string) {
    setActiveId(id);
    if (onBook) return;
    stashDockTab(id);
    router.push(hrefForDockTarget(id, portfolios));
  }

  const dock = (
    <PortfolioTabs
      className="hidden md:block"
      portfolios={portfolios}
      activeId={onBook ? activeId : null}
      onChange={selectDockTarget}
      onAdd={() => setCreatingSheet(true)}
      sheetTodayTone={sheetTodayTone}
      hiddenModeIds={hiddenMetaTabIds}
      /*
       * Account-level, never route-level. This used to be `!onBook`, which
       * dropped the add cell the moment you left the book -- so the dock
       * lost a cell, the centred well re-measured, and every label slid
       * sideways on the way to Circle. Whether a cell exists has to depend
       * on your data alone, or the bar moves under the cursor.
       */
      hideAdd={paperClassOnly}
      onRenameRequest={
        onBook ? (id, name) => setRenameTarget({ id, name }) : undefined
      }
      onDeleteRequest={
        onBook
          ? (id, name) => setConfirmDelete({ kind: "sheet", id, label: name })
          : undefined
      }
    />
  );

  if (loading) {
    return (
      <>
        <DashboardLoading message={loadingMessage} />
        {dock}
      </>
    );
  }

  if (!isMetaTab && (!activePortfolio || !snapshot)) {
    return (
      <>
      <div className={PAGE_FRAME_CLASS}>
        <AppHeader
          showWorkspaceNav={source === "supabase"}
          title={mobileTab === "holdings" ? "Holdings" : "Overview"}
          end={accountEnd}
        />
        {/*
          The portfolio is named but not loaded yet, so the marker follows the
          cell that asked for it. Hardcoding `home` here lit Overview while a
          holdings table was on its way, which is the one moment a reader is
          most likely to think the tap missed.
        */}
        <MobileTabBar active={mobileTab} hiddenModeIds={hiddenMetaTabIds} />
      </div>
      {dock}
      </>
    );
  }

  const showSheetPicker =
    portfolios.length > 0 && (isOverview || !isMetaTab);
  const mobileSheetTitle = isAlerts
    ? "Alerts"
    : showSheetPicker
      ? (
          <SheetPicker
            sheets={sheetPickerSheets}
            value={isOverview ? "all" : activeId}
            onChange={(id) =>
              setActiveId(id === "all" ? OVERVIEW_TAB_ID : id)
            }
            onAdd={() => setCreatingSheet(true)}
          />
        )
      : "";

  return (
    <>
    <div className={PAGE_FRAME_CLASS}>
      <AppHeader
        showWorkspaceNav={source === "supabase"}
        mobileTitle={mobileSheetTitle}
        alertCount={activeAlerts.length}
        /*
         * One button, and it is the one thing a reader does on this
         * screen. The View menu used to be a second glyph beside it, and
         * the bar drew its own Upgrade and Feedback glyphs after that: four
         * 44px controls and an avatar, which left the portfolio name a
         * single letter. Everything that is not Add holding is a row in
         * the bar's one overflow menu now.
         */
        mobileEnd={
          !isMetaTab && canClassBuy ? (
            <Button
              type="button"
              size="icon"
              onClick={() => setModalOpen(true)}
              aria-label="Add holding"
              className="touch-target"
            >
              <Plus />
            </Button>
          ) : undefined
        }
        mobileMenuItems={viewMenuItems}
        title={
          isOverview
            ? "Overview"
            : isAlerts
              ? "Alerts"
              : isCompound
              ? "Compound"
              : isLab
                ? "Lab"
                : isPulse
                  ? "Pulse"
                  : activePortfolio!.name
        }
        end={accountEnd}
        status={headerStatus}
      >
            {!isMetaTab && canClassBuy && (
              <Button
                type="button"
                onClick={() => setModalOpen(true)}
              >
                <Plus data-icon="inline-start" />
                <span className="hidden sm:inline">Add holding</span>
                <span className="sm:hidden">Add</span>
              </Button>
            )}
            {!isMetaTab && source === "supabase" && activePortfolio && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setInviteOpen(true)}
                className="hidden md:inline-flex"
              >
                <UserPlus data-icon="inline-start" />
                <span className="hidden sm:inline">Invite</span>
              </Button>
            )}
            <HeaderOverflowMenu
              items={viewMenuItems}
              label="View"
              icon={SlidersHorizontal}
            />
      </AppHeader>

      <main id="main" className={PAGE_MAIN_CLASS}>
        {!isMetaTab &&
        classTrade &&
        (classTrade.kind !== "open" || classTrade.until) ? (
          <ClassTradeBanner trade={classTrade} />
        ) : null}

        {loadError && (
          <Alert variant="destructive">
            <AlertDescription>{loadError}</AlertDescription>
            <AlertAction>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadPortfolios()}
              >
                <RefreshCw data-icon="inline-start" />
                Retry
              </Button>
            </AlertAction>
          </Alert>
        )}

        {isAlerts ? (
          <WidgetErrorBoundary name="Alerts">
          <div className="flex flex-col gap-4">
            {activeAlerts.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nothing waiting. That&apos;s a good hour.
              </p>
            ) : (
              activeAlerts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setActiveId(OVERVIEW_TAB_ID)}
                  className="w-full rounded-xl glass ring-1 ring-foreground/20 p-6 text-left"
                >
                  <p className="text-sm font-semibold text-foreground">{a.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {a.detail}
                  </p>
                </button>
              ))
            )}
          </div>
          </WidgetErrorBoundary>
        ) : isPulse ? (
          <WidgetErrorBoundary name="Pulse">
          <PulsePage
            model={overview}
            quotes={quotes}
            convictions={convictionMap}
            intentTicker={pulseIntent}
            onIntentConsumed={onPulseIntentConsumed}
            onWriteThesis={onWriteThesis}
            onStamp={onStampPulse}
          />
          </WidgetErrorBoundary>
        ) : isLab ? (
          <WidgetErrorBoundary name="Lab">
          <LabSheet
            overview={overview}
            portfolios={portfolios}
            holdings={holdings}
            quotes={quotes}
            intentTab={labIntent}
            onIntentConsumed={onLabIntentConsumed}
            hiddenTabs={labHiddenTabs}
          />
          </WidgetErrorBoundary>
        ) : isCompound ? (
          <WidgetErrorBoundary name="Compound">
          <CompoundInterestSheet
            bookValue={overview.totals.totalValue}
            sheets={compoundSheets}
            tickerValues={compoundTickerValues}
            bookCash={overview.totals.cash}
            eurUsd={eurUsd}
            eurUsdDetail={eurUsdDetail}
            hideOptions={hideOptionsUI}
          />
          </WidgetErrorBoundary>
        ) : isOverview ? (
          <WidgetErrorBoundary name="Overview">
            <OverviewDashboard
              model={overview}
              onOpenSheet={onOpenSheet}
              coveredCallRows={bookCoveredCallRows}
              activeAlerts={activeAlerts}
              marketState={marketState}
              showCommunities={source === "supabase"}
              hideOptions={hideOptionsUI}
              onAddHolding={onOverviewAddHolding}
              onImportScreenshot={onOverviewImportScreenshot}
              onImportCsv={onOverviewImportCsv}
              onPasteHoldings={onPasteHoldings}
              homework={homeworkEmpty}
              homeworkCash={homeworkCash}
              onOpenLab={labHiddenForTier ? undefined : onOpenLab}
              onOpenPulse={pulseHiddenForTier ? undefined : onOpenPulse}
              onOpenCompound={onOpenCompound}
              onOpenCash={onOpenCash}
              onOpenAlerts={onOpenAlerts}
              inviteNudge={inviteNudgeOpen && source === "supabase"}
              onInvitePartner={() => {
                setInviteNudgeOpen(false);
                setInviteOpen(true);
              }}
              onDismissInvite={() => {
                dismissInviteNudge();
                setInviteNudgeOpen(false);
              }}
            />
          </WidgetErrorBoundary>
        ) : (
          <>
            <WidgetErrorBoundary name="Holdings">
            <PortfolioTable
              portfolio={activePortfolio!}
              holdings={snapshot!.holdings}
              totals={snapshot!.totals}
              onPatch={onPatchHolding}
              onDelete={onDeleteHolding}
              onEditCash={onEditCash}
              onAddHolding={canClassBuy ? onAddHolding : undefined}
              tradeLock={tradeLock}
              onAskMargus={onAskMargus}
              onImportScreenshot={
                canClassBuy ? onImportScreenshot : undefined
              }
              onImportCsv={canClassBuy ? onImportCsv : undefined}
              onOpenTicker={onOpenTicker}
              displayCurrency={getDisplayCurrency(
                displayCurrencyByPortfolio,
                activePortfolio!.id
              )}
              eurUsd={eurUsd}
              usdPer={usdPer}
              onDisplayCurrencyChange={onDisplayCurrencyChange}
            />
            </WidgetErrorBoundary>

            {ccVisible && (
              <WidgetErrorBoundary name="Covered calls">
              <CoveredCallPanel
                rows={snapshot!.coveredCallRows}
                yield2wAvg={snapshot!.totals.yield2wAvg}
                premiumTotal={snapshot!.totals.premiumTotal}
                onPatchTargetCall={onPatchTargetCall}
                onPatchStockTarget={onPatchStockTarget}
                onPatchExpiry={onPatchExpiry}
                onAddHolding={canClassBuy ? onAddHolding : undefined}
              />
              </WidgetErrorBoundary>
            )}

            {forecastVisible ? (
              forecast &&
              activePortfolio && (
                <WidgetErrorBoundary name="Forecast">
                <ForecastPanel
                  model={forecast}
                  portfolioId={activePortfolio.id}
                  portfolioName={activePortfolio.name}
                  cashBalance={activePortfolio.cash_balance}
                  overrides={eoyOverrides}
                  onSetEoyPrice={onSetEoyPrice}
                  onApplyMargusPaths={onApplyMargusPaths}
                  onClearOverrides={onClearForecastOverrides}
                  convictions={convictionMap}
                  labReady={labReady}
                />
                </WidgetErrorBoundary>
              )
            ) : (
              <ForecastOffStub onShow={onShowForecast} />
            )}
          </>
        )}
      </main>

      {dock}
      <MobileTabBar
        active={mobileTab}
        alertCount={activeAlerts.length}
        pulseHref={pulseHiddenForTier ? "/" : "/?tab=pulse"}
        hiddenModeIds={hiddenMetaTabIds}
        onSelect={(id) => {
          if (id === "home") {
            wantsHoldingsRef.current = false;
            setActiveId(OVERVIEW_TAB_ID);
            return true;
          }
          if (id === "holdings") {
            /*
             * Same answer the URL gets, resolved against the list already in
             * memory so the table is on screen without a round trip. With no
             * portfolios at all the pending sentinel keeps this cell lit:
             * Overview is where Add a holding lives, but the room you asked
             * for is still Holdings, empty table or not. `wantsHoldingsRef`
             * is the note pickInitialSheet reads if a book load lands in the
             * same tick and would otherwise send this cell back to Overview
             * because the URL has not been rewritten yet.
             */
            wantsHoldingsRef.current = true;
            const target = resolveLastPortfolioId(portfolios);
            setActiveId(target ?? PORTFOLIO_TAB_PENDING);
            return true;
          }
          if (id === "pulse") {
            if (pulseHiddenForTier) return false;
            wantsHoldingsRef.current = false;
            setActiveId(PULSE_TAB_ID);
            return true;
          }
          if (id === "lab") {
            if (labHiddenForTier) return false;
            wantsHoldingsRef.current = false;
            setActiveId(LAB_TAB_ID);
            return true;
          }
          if (id === "compound") {
            wantsHoldingsRef.current = false;
            setActiveId(COMPOUND_TAB_ID);
            return true;
          }
          return false;
        }}
      />

      <HoldingModal
        open={modalOpen}
        portfolioName={inviteSheet?.name ?? ""}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        hideCallPct={hideOptionsUI}
      />

      <CsvImportModal
        open={csvImportOpen}
        portfolioName={inviteSheet?.name ?? ""}
        onClose={() => setCsvImportOpen(false)}
        onImport={handleCsvImport}
        hideCallPct={hideOptionsUI}
      />

      {inviteSheet && (
        <InvitePartnerModal
          open={inviteOpen}
          portfolioId={inviteSheet.id}
          portfolioName={inviteSheet.name}
          onClose={() => setInviteOpen(false)}
        />
      )}

      <CashModal
        open={cashModalOpen}
        portfolioName={activePortfolio?.name ?? ""}
        initialCash={
          activePortfolio ? sheetCashBalance(activePortfolio) : 0
        }
        paperCash={activePortfolio ? tracksTradeCash(activePortfolio) : false}
        onClose={() => setCashModalOpen(false)}
        onSave={handleSaveCash}
      />

      <RenameSheetModal
        open={Boolean(renameTarget) || creatingSheet}
        initialName={creatingSheet ? "" : renameTarget?.name ?? ""}
        title={creatingSheet ? "New portfolio" : undefined}
        confirmLabel={creatingSheet ? "Add" : undefined}
        onClose={() => {
          setRenameTarget(null);
          setCreatingSheet(false);
        }}
        onSave={(name) => {
          if (creatingSheet) {
            setCreatingSheet(false);
            void handleAddSheet(name).then((created) => {
              // Created from Circle or Fund: go to the sheet, or the new
              // portfolio is only reachable by finding it yourself.
              if (created && !onBook) {
                stashDockTab(created.id);
                router.push(hrefForDockTarget(created.id, [created]));
              }
            });
            return;
          }
          if (!renameTarget) return;
          void handleRenameSheet(renameTarget.id, name);
        }}
      />

      <ConfirmModal
        open={Boolean(confirmDelete)}
        title={
          confirmDelete?.kind === "sheet"
            ? "Delete this portfolio?"
            : "Delete holding?"
        }
        body={
          confirmDelete?.kind === "sheet"
            ? `Delete “${confirmDelete.label}” and all of its holdings? We take a backup save first.`
            : `Remove ${confirmDelete?.label ?? "this holding"} from this portfolio?`
        }
        confirmLabel="Delete"
        destructive
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return false;
          if (confirmDelete.kind === "sheet") {
            return deleteSheetById(confirmDelete.id);
          }
          return deleteHoldingById(confirmDelete.id);
        }}
      />

      <ConfirmModal
        open={confirmResetForecast}
        title="Reset forecast overrides?"
        body={`Clears every manual and Margus-generated EOY price target on ${
          activePortfolio?.name ?? "this portfolio"
        }. Margus will need to re-reason the whole forecast from scratch on next visit. This can't be undone.`}
        confirmLabel="Reset"
        destructive
        onClose={() => setConfirmResetForecast(false)}
        onConfirm={() => {
          clearEoyOverrides();
        }}
      />

      <SnapshotsModal
        open={snapshotsOpen}
        onClose={() => setSnapshotsOpen(false)}
        activePortfolioId={
          !isMetaTab ? activePortfolio?.id ?? null : null
        }
        activePortfolioName={
          !isMetaTab ? activePortfolio?.name ?? null : null
        }
        onRestored={(mode) => {
          toast(
            mode === "sheet"
              ? "Portfolio put back to how it looked in that save"
              : "All portfolios put back to how they looked in that save",
            "success"
          );
          void loadPortfolios({ silent: true });
        }}
      />

      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        items={commandItems}
      />

      <CostBasisModal
        open={costBasisOpen}
        rows={costBasisRows}
        onChangeRow={(ticker, buyPrice) =>
          setCostBasisRows((prev) =>
            prev.map((r) =>
              r.ticker === ticker ? { ...r, buyPrice } : r
            )
          )
        }
        onClose={() => setCostBasisOpen(false)}
        onApply={async () => {
          if (!activePortfolio) {
            setCostBasisOpen(false);
            return;
          }
          for (const row of costBasisRows) {
            const h = holdings.find(
              (x) =>
                x.portfolio_id === activePortfolio.id &&
                x.ticker.toUpperCase() === row.ticker.toUpperCase()
            );
            if (!h) continue;
            await handlePatch({
              id: h.id,
              buy_price: row.buyPrice,
            });
          }
          setCostBasisOpen(false);
          toast("Buy prices saved", "success");
        }}
      />

      <WidgetErrorBoundary name="Ticker">
      <TickerDrawer
        open={Boolean(drawerTicker)}
        ticker={drawerTicker}
        spot={drawerTicker ? quotes[drawerTicker]?.price ?? null : null}
        shares={
          drawerTicker
            ? holdings
                .filter((h) => h.ticker === drawerTicker)
                .reduce((s, h) => s + h.shares, 0)
            : null
        }
        buyPrice={
          drawerTicker
            ? (() => {
                const rows = holdings.filter((h) => h.ticker === drawerTicker);
                const sh = rows.reduce((s, h) => s + h.shares, 0);
                const cost = rows.reduce(
                  (s, h) => s + h.shares * h.buy_price,
                  0
                );
                const avg = sh > 0 ? cost / sh : NaN;
                return Number.isFinite(avg) && avg > 0 ? avg : null;
              })()
            : null
        }
        sparkline={
          drawerTicker ? quotes[drawerTicker]?.sparkline : undefined
        }
        todayChangePct={
          drawerTicker ? quotes[drawerTicker]?.changePercent ?? null : null
        }
        conviction={
          drawerTicker
            ? convictionMap[drawerTicker.toUpperCase()] ?? null
            : null
        }
        overrides={eoyOverrides}
        coveredCallRow={drawerCoveredCallRow}
        onSetEoyPrice={commitEoyPrice}
        onConviction={(level, thesis) => {
          if (!drawerTicker) return;
          patchLab({
            conviction: setConviction(convictionMap, drawerTicker, {
              level,
              thesis,
            }),
          });
        }}
        onClose={() => setDrawerTicker(null)}
        onAskMargus={() => {
          setMargusExpandSignal((n) => n + 1);
        }}
      />
      </WidgetErrorBoundary>

      <WidgetErrorBoundary name="Margus">
      <CcAdvisorChat
        key={margusPortfolio?.id ?? OVERVIEW_TAB_ID}
        portfolioId={margusPortfolio?.id ?? OVERVIEW_TAB_ID}
        expandSignal={margusExpandSignal}
        screenshotImport={silentScreenshot}
        screenshotPending={screenshotPending}
        onScreenshotImportConsumed={(id) => {
          setSilentScreenshot((cur) => (cur?.id === id ? null : cur));
          setScreenshotPending(false);
        }}
        onSuggestCsv={() => setCsvImportOpen(true)}
        onApplyActions={applyAdvisorActions}
        context={margusContext}
      />
      </WidgetErrorBoundary>
    </div>
    </>
  );
}
