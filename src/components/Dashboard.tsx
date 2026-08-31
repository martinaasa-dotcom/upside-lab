"use client";

import { AppHeader } from "@/components/AppHeader";
import type { SilentScreenshotImport } from "@/components/CcAdvisorChat";
import { type CommandItem } from "@/components/CommandPalette";
import { type CostBasisRow } from "@/components/CostBasisModal";
import { BelowFold } from "@/components/BelowFold";
import { ForecastOffStub } from "@/components/ForecastPanel";
import { useFeedback } from "@/components/FeedbackHost";
import { HeaderOverflowMenu, type HeaderMenuItem } from "@/components/HeaderOverflowMenu";
import { OverviewDashboard, type LabDeepLink } from "@/components/OverviewDashboard";
import { PortfolioTable } from "@/components/PortfolioTable";
import { PortfolioTabs } from "@/components/PortfolioTabs";
import { ClassTradeBanner } from "@/components/ClassTradeBanner";
import { isPaperClassOnly, ownedBookPortfolios } from "@/lib/classroom";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import { useAuth } from "@/components/AuthProvider";
import {
  Alert,
  AlertAction,
  AlertDescription,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { AIM_GIVES_UP_MS, onRouteAim } from "@/lib/route-aim";
import { usePathname, useRouter } from "next/navigation";
import {
  buildDecisionAlerts,
  buildEarningsAlerts,
  buildStrikeAlerts,
  type UpsideAlert,
} from "@/lib/alerts";
import { type BookUndoSnapshot } from "@/lib/book-undo";
import { buildSnapshot } from "@/lib/calculations";
import type { CsvHoldingRow } from "@/lib/csv-import";
import { PAGE_FRAME_CLASS, PAGE_MAIN_CLASS } from "@/lib/page-shell";
import {
  loadDismissedAlertIds,
  saveDismissedAlertIds,
} from "@/lib/alert-dismiss";
import { PULSE_REFRESH_MS, effectiveMove, isEmptyPulseCheck, loadPulseTickerCache, type PulseCheck } from "@/lib/thesis-pulse";
import { loadForecastPlan } from "@/lib/forecast-plan";
import {
  milestoneToast,
  recordVisitToday,
} from "@/lib/visit-streak";
import { saveActiveSheetId, saveLastPortfolioId, pickChatPortfolio } from "@/lib/active-sheet";
import { bookFingerprint, margusChatContext } from "@/lib/dashboard-chat";
import { DashboardModals } from "@/components/DashboardModals";
import { useDashboardBookWrites } from "@/lib/use-dashboard-book-writes";
import {
  PORTFOLIO_PATH,
  hrefForTabId,
  tabIdFromPath,
} from "@/lib/book-routes";
import { loadLastUser } from "@/lib/last-session";
import { isAbortError, retryOnNetwork } from "@/lib/abort";
import { buildForecast, type ForecastYear } from "@/lib/forecast";
import {
  loadEoyOverrides,
  mergeEoyTargetPaths,
  saveEoyOverrides,
  setEoyOverride,
  type PortfolioEoyOverrides,
} from "@/lib/forecast-overrides";
import { parseHoldingList, parsePortfolioList } from "@/lib/parse-book";
import { readJsonOrThrow } from "@/lib/http";
import { isRecord } from "@/lib/unknown";
import { hasLockedSave, loadDemoStore } from "@/lib/demo-store";
import {
  getDisplayCurrency,
  loadDisplayCurrencyMap,
  saveDisplayCurrencyMap,
  type DisplayCurrency,
} from "@/lib/display-currency";
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
  WORKSPACE_SHOW_EVENT,
  isWorkspaceRoomActive,
  onWorkspaceRefresh,
  workspaceRoomId,
} from "@/lib/workspace-rooms";
import {
  COMPOUND_TAB_ID,
  LAB_TAB_ID,
  OVERVIEW_TAB_ID,
  PULSE_TAB_ID,
  ALERTS_TAB_ID,
  buildOverview,
  todayDollarFor,
} from "@/lib/overview";
import type {
  Holding,
  OptionCandidate,
  Portfolio,
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
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react";
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
import { DashboardLoading } from "@/components/DashboardLoading";
import { MobileTabBar } from "@/components/mobile/MobileTabBar";
import { mobileTabFromActiveId, PORTFOLIO_TAB_PENDING } from "@/lib/mobile-tab";
import { SheetPicker } from "@/components/SheetPicker";
import { useLabSync } from "@/components/use-lab-sync";
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
 * These are per-tab panels: only one is on screen at a time (Overview is
 * the default), but before this they were all imported eagerly, so every
 * visit to the book shipped Pulse, Lab (which itself pulls in Seasonality,
 * Trends, and the scenario simulator), Compound, Forecast, and Covered
 * Calls whether or not the tab was ever opened. Split like BookRoom/
 * FundRoom/AccountPage etc. in WorkspaceShell — ssr: true keeps a direct
 * link or refresh on a non-Overview tab (e.g. "/?tab=pulse") server-
 * rendered instead of flashing a loading state.
 */
/*
 * THE LOADER IS NAMED SO THAT WARMING IT AND RENDERING IT ARE THE SAME
 * IMPORT SITE, AND THAT IS NOT a tidiness point.
 *
 * Warming these on idle only works if the module the warm asks for is the
 * module `dynamic` will ask for. Written as two separate `import()`
 * expressions the bundler is free to give them different chunk groups, and
 * measured on the real build it did exactly that: the idle warm ran (a
 * marker proved it), 44 chunks came down in the first 400ms, and the first
 * tap on Pulse STILL fetched a 22KB chunk that mentions `PulsePage`. One
 * named loader per panel, referenced from both places, removes the
 * question.
 */
const loadPulsePage = () =>
  import("@/components/PulsePage").then((m) => m.PulsePage);
const loadLabSheet = () =>
  import("@/components/LabSheet").then((m) => m.LabSheet);
const loadCompoundInterestSheet = () =>
  import("@/components/CompoundInterestSheet").then(
    (m) => m.CompoundInterestSheet
  );
const loadForecastPanel = () =>
  import("@/components/ForecastPanel").then((m) => m.ForecastPanel);
const loadCoveredCallPanel = () =>
  import("@/components/CoveredCallPanel").then((m) => m.CoveredCallPanel);

const PulsePage = dynamic(loadPulsePage, { ssr: true });
const LabSheet = dynamic(loadLabSheet, { ssr: true });
const CompoundInterestSheet = dynamic(loadCompoundInterestSheet, { ssr: true });
const ForecastPanel = dynamic(loadForecastPanel, { ssr: true });
const CoveredCallPanel = dynamic(loadCoveredCallPanel, { ssr: true });

type DataSource = "demo" | "supabase";

const EMPTY_HIDDEN_TABS: string[] = [];

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
  /*
    WHICH ROOM YOU ARE IN IS THE PATH, AND NOTHING ELSE REMEMBERS IT.

    This was `useState` with `?tab=` written after it by `history.pushState`,
    which meant the address bar reported on the app rather than driving it,
    and Back had to be reconstructed from a private history stack. Now the
    link is the navigation and this is a reading of `usePathname`.

    Two things fall out of that and are worth naming, because each replaced
    a ref that existed to paper over the old direction. A path that names a
    portfolio the book has not loaded yet resolves to the token itself and
    then to the real id the moment the list lands, so a deep link no longer
    needs `wantsHoldingsRef` to survive a cold cache. And `/portfolio` with
    no name answers from `resolveLastPortfolioId` on every render, so it
    stops being the pending sentinel by itself.

    `lastBookTabRef` is only for the hidden copy of this room. Walk to
    Circle and `pathname` is no longer a book path, but this Dashboard
    stays mounted behind `hidden`; without the memory it would fall back to
    Overview and quietly unmount whatever panel was open, to rebuild it on
    the way back.
  */
  const lastBookTabRef = useRef<string>(OVERVIEW_TAB_ID);

  /*
   * THE TAB CHANGES ON THE PRESS, NOT WHEN THE ROUTER FINISHES.
   *
   * `<Link>` navigates inside `startTransition`, and a transition keeps the
   * old screen up until the new one is completely built. Screencast frame
   * by frame at 4x CPU, tapping Growth: for 600ms only about 2% of the
   * pixels moved -- the dock marker alone -- and then 21% of the screen
   * swapped in one frame. That gap, not the total, is what a slow tap is.
   *
   * So a dock press publishes where it is going (`route-aim.ts`), and the
   * book shows that tab now, with an ordinary state update rather than a
   * transition, so it renders on the next frame. `pathname` is still the
   * source of truth and still settles it -- this only fills the gap.
   *
   * The bet is refused for anything that is not a book path, because those
   * are other rooms and this component cannot show them; and it is dropped
   * the moment the path answers, or after `AIM_GIVES_UP_MS` if nothing
   * does.
   */
  const [aimedPath, setAimedPath] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = onRouteAim((path) => {
      if (timer) clearTimeout(timer);
      if (path === null) {
        setAimedPath(null);
        return;
      }
      if (workspaceRoomId(path) !== "book") return;
      setAimedPath(path);
      timer = setTimeout(() => setAimedPath(null), AIM_GIVES_UP_MS);
    });
    return () => {
      stop();
      if (timer) clearTimeout(timer);
    };
  }, []);
  /* The room answered. Whatever it answered with is the truth from here. */
  useEffect(() => {
    setAimedPath(null);
  }, [pathname]);

  const shownPath = aimedPath ?? pathname;
  const routeTab = tabIdFromPath(shownPath, portfolios);
  if ((onBook || aimedPath !== null) && typeof routeTab === "string") {
    lastBookTabRef.current = routeTab;
  }
  const activeId =
    (onBook || aimedPath !== null) && typeof routeTab === "string"
      ? routeTab
      : lastBookTabRef.current;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  /*
    Every "open this tab" in the app, as one navigation.

    Kept to the `Dispatch<SetStateAction<string>>` shape the state setter
    had, so the callers that reach for the previous value ("close this
    sheet if it is the one open") read exactly as they did. The guard is
    the point: pushing the path already showing would put a duplicate on
    the history stack and cost the reader two Backs to leave one room.
  */
  const goToTab = useCallback(
    (next: SetStateAction<string>) => {
      const target =
        typeof next === "function" ? next(activeIdRef.current) : next;
      if (target === activeIdRef.current) return;
      router.push(hrefForTabId(target, portfolios));
    },
    [router, portfolios]
  );
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
    A path naming a portfolio this account does not have.

    Not a 404: the dynamic segment always matches and the book room always
    paints, so what a stale bookmark or a deleted portfolio deserves is the
    holdings table it asked for, on a portfolio that exists. Held until the
    book has actually loaded, because "no such portfolio" and "no book yet"
    look identical from here and only one of them is worth redirecting.
  */
  useEffect(() => {
    if (!onBook) return;
    if (routeTab !== undefined) return;
    router.replace(PORTFOLIO_PATH);
  }, [onBook, routeTab, router]);

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
    } else {
      if (signedIn) {
        setSource("supabase");
        setPortfolios([]);
        setHoldings([]);
        setLocked(false);
        bookFetchedAtRef.current = 0;
        setLoading(true);
      }
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
  }, [user?.id]);

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
      // Replace, not push: a tab this reader cannot reach is not somewhere
      // Back should return them to.
      router.replace("/");
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
    goToTab(id);
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
        "Could not load your portfolios. Try again."
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
            ? "Loading your portfolio took too long. Check your connection and try again."
            : err instanceof Error
              ? err.message
              : userId
                ? "Could not load your portfolio. Try again whenever you are ready."
                : "Could not load the shared portfolio, so this is the sample one instead. Try again whenever you are ready."
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
            setLocked(hasLockedSave());
          }
        }
      }
    } finally {
      window.clearTimeout(timeout);
      if (bookAbortRef.current === ctrl) setLoading(false);
    }
  }, [refresh, user?.id]);


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

  /*
    A new tab starting at the top, and Back landing where you left, are the
    router's now. This used to be a hand-rolled pair: scroll to the top on
    every `activeId` change unless a private ref said the change came from
    a `popstate`, because the tab was state and the browser had no idea a
    room had changed. Each of these is a real navigation, so App Router
    scrolls a push to the top and restores the offset on back and forward,
    and doing it again here would fight it on every Back.
  */
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

  /*
    What is remembered, now that the URL is no longer written from here.

    The tab is telemetry's, and the portfolio is the phone dock's: its
    Holdings cell asks "which portfolio was I in" from rooms that never
    load a book, and `/portfolio` with no name is answered from this note.
    Written only for a portfolio the account really has, since a token that
    resolves to nothing is worse than no memory at all.
  */
  useEffect(() => {
    if (!authReady) return;
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
  }, [activeId, activePortfolio, authReady]);

  /*
    Being shown again is only about the numbers now.

    It used to re-read the URL and pick a tab as well, because the room had
    been hidden while the address bar moved underneath it. The path is the
    tab, so there is nothing left to reconcile: what is worth doing on the
    way back in is asking whether the book went stale while nobody was
    looking. The shell fires this on a room change, never on a walk between
    book pages, so a tap on the dock does not cost a fetch.
  */
  /*
   * THE PANELS THE DOCK CAN REACH ARE WARMED WHILE NOBODY IS WAITING.
   *
   * Every tab above is `next/dynamic`, which is right -- a reader who never
   * opens Lab should not download Seasonality, Trends and the scenario
   * simulator. What it also means is that the FIRST tap on a tab pays a
   * chunk fetch and a parse before anything can render, on the tap, which
   * is the whole of why a room does not arrive instantly.
   *
   * Measured on the real app with the network recorded per hop: the first
   * Pulse tap fetched one chunk, the first Lab tap two, the first Circle
   * tap one; the SECOND visit to the same room fetched nothing at all and
   * arrived immediately. `WorkspaceShell` already warms the rooms this way
   * and simply never covered the book's own tabs.
   *
   * On idle, so it never competes with the first paint, and `void` because
   * a failed warm is a slower tap and nothing worse. Cheap to repeat: the
   * module cache makes every call after the first a no-op.
   */
  useEffect(() => {
    const warm = () => {
      void loadPulsePage();
      void loadCompoundInterestSheet();
      void loadForecastPanel();
      /*
       * Lab is the heaviest of them and the one a novice cannot reach, so
       * it waits for a reader who has it. Covered calls go with the same
       * question, since `hideOptionsUI` is what draws that panel at all.
       */
      if (!hiddenMetaTabIds.includes(LAB_TAB_ID)) void loadLabSheet();
      if (!hideOptionsUI) void loadCoveredCallPanel();
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(warm, { timeout: 3000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(warm, 1200);
    return () => window.clearTimeout(id);
  }, [hiddenMetaTabIds, hideOptionsUI]);

  useEffect(() => {
    const onShow = () => {
      if (!isWorkspaceRoomActive("book")) return;
      if (!isBookFetchFresh(bookFetchedAtRef.current)) {
        void loadPortfolios({ silent: true });
      }
    };
    const onBookRefresh = () => {
      void loadPortfolios({ silent: true });
    };
    window.addEventListener(WORKSPACE_SHOW_EVENT, onShow);
    window.addEventListener(BOOK_REFRESH_EVENT, onBookRefresh);
    return () => {
      window.removeEventListener(WORKSPACE_SHOW_EVENT, onShow);
      window.removeEventListener(BOOK_REFRESH_EVENT, onBookRefresh);
    };
  }, [loadPortfolios]);

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
        toast("This portfolio was changed on another device, so the newest version is showing here now.", "info");
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


  const {
    handleSave,
    handlePatch,
    applyAdvisorActions,
    startFirstRunAction,
    handleCsvImport,
    undoLastMargusWrite,
    requestDeleteHolding,
    deleteHoldingById,
    handleAddSheet,
    ensureFirstSheet,
    beginSilentScreenshotImport,
    handleRenameSheet,
    deleteSheetById,
    handleSaveCash,
    resetDemo,
    saveLock,
  } = useDashboardBookWrites({
    source,
    setSource,
    user,
    toast,
    later,
    portfolios,
    holdings,
    setPortfolios,
    setHoldings,
    setOptions,
    quotes,
    activePortfolio,
    margusPortfolio,
    inviteSheet,
    activeId,
    goToTab,
    eoyOverrides,
    setEoyOverrides,
    undoStack,
    setUndoStack,
    setModalOpen,
    setCsvImportOpen,
    setCashModalOpen,
    setScreenshotPending,
    setSilentScreenshot,
    setLocked,
    setSaveFlash,
    setConfirmDelete,
    setRenameTarget,
    setCostBasisOpen,
    setCostBasisRows,
    bookRef,
    holdingPatchSeqRef,
    cashWriteSeqRef,
    pendingBookWritesRef,
    reloadAfterWritesRef,
    bookWriteChainRef,
    addingSheetRef,
    creatingFirstSheetRef,
    silentScreenshotSeq,
    loadPortfolios,
    refreshMarkets,
    seedNewSheetPanelDefaults,
  });


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
        run: () => goToTab(OVERVIEW_TAB_ID),
      },
      {
        id: "compound",
        label: "Compound",
        group: "Go",
        run: () => goToTab(COMPOUND_TAB_ID),
      },
      {
        id: "pulse",
        label: "Pulse: check why you own it",
        group: "Go",
        hint: "Big movers",
        run: () => goToTab(PULSE_TAB_ID),
      },
    ];
    if (!labHiddenForTier) {
      items.push({
        id: "statistics",
        label: "Seasonality",
        group: "Go",
        hint: "In Lab: patterns by year and by calendar month",
        run: () => {
          setLabIntent("seasonality");
          goToTab(LAB_TAB_ID);
        },
      });
      items.push({
        id: "lab",
        label: "Lab",
        group: "Go",
        hint: "Analysis tools",
        run: () => goToTab(LAB_TAB_ID),
      });
    }
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
        run: () => goToTab(p.id),
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
          if (sheet) goToTab(sheet.id);
          setDrawerTicker(t.ticker);
        },
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [portfolios, overview.tickers, undoStack.length, labHiddenForTier]);

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
  const onOpenCompound = useStableCallback(() => goToTab(COMPOUND_TAB_ID));
  const onOpenAlerts = useStableCallback(() => goToTab(ALERTS_TAB_ID));
  const onOpenCash = useStableCallback(() => {
    const target = [...portfolios].sort(
      (a, b) => a.cash_balance - b.cash_balance
    )[0];
    if (!target) return;
    goToTab(target.id);
    setCashModalOpen(true);
  });
  const onOpenLab = useStableCallback((tab?: LabDeepLink) => {
    if (tab) setLabIntent(tab);
    goToTab(LAB_TAB_ID);
  });
  const onOpenPulse = useStableCallback((ticker?: string) => {
    if (ticker) setPulseIntent(ticker);
    goToTab(PULSE_TAB_ID);
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
              "Could not import those holdings. Try again."
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

  const dock = (
    <PortfolioTabs
      key="wide-dock"
      className="hidden md:block"
      portfolios={portfolios}
      activeId={onBook ? activeId : null}
      onAdd={() => setCreatingSheet(true)}
      sheetTodayTone={sheetTodayTone}
      alertCount={activeAlerts.length}
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
        {dock}
        {/*
          THE DOCK IS KEYED, AND IT IS IN THE SAME PARENT AS THE ONE BELOW,
          BECAUSE A BAR THAT IS REBUILT LOSES THE PRESS IT IS IN THE MIDDLE
          OF.

          React matches children by position unless they carry a key, and
          this branch and the full one below put the bar at different
          positions inside the frame, so entering or leaving this branch
          destroyed the element under the reader's finger and with it the
          whole of `useDockMarker`'s memory of the press. Measured on the
          real build at 390x844: pressing Holdings, which is exactly the
          press that lands here, destroyed the anchor two frames after
          `pointerdown` and the tap went nowhere. A key on both, in one
          parent, is what makes it the same bar.

          The marker follows the cell that asked for the portfolio, rather
          than Overview: hardcoding `home` lit the wrong cell while a
          holdings table was on its way, which is the moment a reader is
          most likely to think the tap missed.
        */}
        <MobileTabBar
          key="phone-dock"
          active={mobileTab}
          hiddenModeIds={hiddenMetaTabIds}
        />
      </div>
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
              goToTab(id === "all" ? OVERVIEW_TAB_ID : id)
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
                Nothing needs your attention right now.
              </p>
            ) : (
              activeAlerts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => goToTab(OVERVIEW_TAB_ID)}
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

            {/*
              Both of these are entirely below the fold on a phone --
              measured, covered calls starts at 2,277px and the forecast at
              4,081px of an 8.1-screen page -- and together they are 532 of
              the room's 957 elements. See `BelowFold`.
            */}
            {ccVisible && (
              <BelowFold reserve={420}>
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
              </BelowFold>
            )}

            {forecastVisible ? (
              forecast &&
              activePortfolio && (
                <BelowFold reserve={420}>
                <WidgetErrorBoundary name="Forecast">
                <ForecastPanel
                  model={forecast}
                  portfolioId={activePortfolio.id}
                  portfolioName={activePortfolio.name}
                  cashBalance={activePortfolio.cash_balance}
                  overrides={eoyOverrides}
                  onSetEoyPrice={onSetEoyPrice}
                  onApplyMargusPaths={onApplyMargusPaths}
                  convictions={convictionMap}
                  labReady={labReady}
                />
                </WidgetErrorBoundary>
                </BelowFold>
              )
            ) : (
              <ForecastOffStub onShow={onShowForecast} />
            )}
          </>
        )}
      </main>

      {dock}
      {/*
        No onSelect. Every cell is the link it always drew: the bar used to
        cancel its own navigation with preventDefault and set state instead,
        which is how the address bar ended up reporting on the app a beat
        after the fact. `/portfolio` answers the Holdings cell against the
        list this room already has, so the table is on screen without a
        round trip, and keeps that cell lit when there is no list to answer
        with. See `hrefForTabId`.
      */}
      <MobileTabBar
        key="phone-dock"
        active={mobileTab}
        alertCount={activeAlerts.length}
        hiddenModeIds={hiddenMetaTabIds}
      />

      <DashboardModals
        modalOpen={modalOpen}
        setModalOpen={setModalOpen}
        csvImportOpen={csvImportOpen}
        setCsvImportOpen={setCsvImportOpen}
        inviteOpen={inviteOpen}
        setInviteOpen={setInviteOpen}
        cashModalOpen={cashModalOpen}
        setCashModalOpen={setCashModalOpen}
        creatingSheet={creatingSheet}
        setCreatingSheet={setCreatingSheet}
        renameTarget={renameTarget}
        setRenameTarget={setRenameTarget}
        confirmDelete={confirmDelete}
        setConfirmDelete={setConfirmDelete}
        snapshotsOpen={snapshotsOpen}
        setSnapshotsOpen={setSnapshotsOpen}
        cmdOpen={cmdOpen}
        setCmdOpen={setCmdOpen}
        costBasisOpen={costBasisOpen}
        setCostBasisOpen={setCostBasisOpen}
        costBasisRows={costBasisRows}
        setCostBasisRows={setCostBasisRows}
        drawerTicker={drawerTicker}
        setDrawerTicker={setDrawerTicker}
        inviteSheet={inviteSheet}
        activePortfolio={activePortfolio}
        margusPortfolio={margusPortfolio}
        holdings={holdings}
        quotes={quotes}
        hideOptionsUI={hideOptionsUI}
        isMetaTab={isMetaTab}
        eoyOverrides={eoyOverrides}
        convictionMap={convictionMap}
        drawerCoveredCallRow={drawerCoveredCallRow}
        commandItems={commandItems}
        silentScreenshot={silentScreenshot}
        screenshotPending={screenshotPending}
        setSilentScreenshot={setSilentScreenshot}
        setScreenshotPending={setScreenshotPending}
        margusExpandSignal={margusExpandSignal}
        setMargusExpandSignal={setMargusExpandSignal}
        margusContext={margusContext}
        toast={toast}
        handleSave={handleSave}
        handleCsvImport={handleCsvImport}
        handleSaveCash={handleSaveCash}
        handleAddSheet={handleAddSheet}
        handleRenameSheet={handleRenameSheet}
        deleteSheetById={deleteSheetById}
        deleteHoldingById={deleteHoldingById}
        handlePatch={handlePatch}
        applyAdvisorActions={applyAdvisorActions}
        commitEoyPrice={commitEoyPrice}
        patchLab={patchLab}
        loadPortfolios={loadPortfolios}
        onCreatedAwayFromBook={
          onBook
            ? undefined
            : (created) => {
                router.push(hrefForTabId(created.id, [created]));
              }
        }
      />
    </div>
    </>
  );
}
