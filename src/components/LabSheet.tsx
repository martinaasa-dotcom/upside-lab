"use client";

import {
  allocationBySector,
  allocationByTicker,
  concentrationRead,
  themeBreakdown,
} from "@/lib/allocation";
import {
  buildPortfolioPersonality,
  THEME_COLOR,
} from "@/lib/portfolio-personality";
import { EmptyState, Panel, Score, Scoreboard, SPLIT_COPY, SPLIT_ROW, SwatchLegend } from "@/components/ui/Panel";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LabDeepLink } from "@/components/OverviewDashboard";
import {
  correlationGrid,
  correlationMatrix,
} from "@/lib/correlation";
import { NO_VALUE, cashtag, cn, currency } from "@/lib/format";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import type { OverviewModel } from "@/lib/overview";
import type { Holding, Portfolio, Quote } from "@/lib/types";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import { loadWatchlist } from "@/lib/watchlist";

type Props = {
  overview: OverviewModel;
  portfolios: Portfolio[];
  /** Needed to re-scope the book down to a single sheet. */
  holdings: Holding[];
  quotes: Record<string, Quote>;
  /** Deep-link from Overview (pulse / seasonality). */
  intentTab?: LabDeepLink | null;
  onIntentConsumed?: () => void;
  /** Specific tab ids to hide, driven by the viewer's experience tier. */
  hiddenTabs?: string[];
};

/**
 * Lab's sub-tabs, one chunk each. Only one is on screen at a time, but
 * before this the whole Lab chunk carried all three — a visitor looking at
 * Allocation still downloaded Seasonality, Trends, and the scenario
 * simulator. Same split `Dashboard` already does for its meta-tabs.
 */
const ScenarioSimulator = dynamic(
  () =>
    import("@/components/ScenarioSimulator").then((m) => m.ScenarioSimulator),
  { ssr: true }
);
const SeasonalityPage = dynamic(
  () => import("@/components/SeasonalityPage").then((m) => m.SeasonalityPage),
  { ssr: true }
);
const TrendsPanel = dynamic(
  () => import("@/components/TrendsPanel").then((m) => m.TrendsPanel),
  { ssr: true }
);
const CompanyLookupPanel = dynamic(
  () =>
    import("@/components/company/CompanyLookupPanel").then(
      (m) => m.CompanyLookupPanel
    ),
  { ssr: true }
);

const EMPTY_HIDDEN_TABS: string[] = [];
const EMPTY_WATCHLIST: string[] = [];

type LabTab = "alloc" | "risk" | "trends" | "seasonality" | "lookup";

/** One flat row: what you hold, how risky it is, and when it tends to move. */
const TABS: { id: LabTab; label: string }[] = [
  { id: "lookup", label: "Look up a company" },
  { id: "alloc", label: "The mix" },
  { id: "risk", label: "Risk" },
  { id: "trends", label: "Trends" },
  { id: "seasonality", label: "Seasonality" },
];

const INTENT_TO_TAB: Record<LabDeepLink, LabTab> = {
  seasonality: "seasonality",
  lookup: "lookup",
};

/** Reads `?labtab=` so a hard refresh (or revisiting Lab after switching
 * away) lands back on the sub-tab you were on, not always Allocation.
 * Also honours the legacy `?sheet=stats` links from when Seasonality was
 * a top-level tab, so old bookmarks still land in the right place rather
 * than dumping you on Allocation. */
function initialLabTab(): LabTab {
  if (typeof window === "undefined") return "alloc";
  const params = new URLSearchParams(window.location.search);
  const param = params.get("labtab");
  if (TABS.some((t) => t.id === param)) return param as LabTab;

  const sheetParam = params.get("sheet")?.trim().toLowerCase();
  if (
    sheetParam === "stats" ||
    sheetParam === "statistics" ||
    sheetParam === "seasonality" ||
    sheetParam === "__seasonality__"
  ) {
    return "seasonality";
  }
  return "alloc";
}

export const LabSheet = memo(function LabSheet({
  overview,
  portfolios,
  holdings,
  quotes,
  intentTab,
  onIntentConsumed,
  hiddenTabs = EMPTY_HIDDEN_TABS,
}: Props) {
  const visibleTabs = TABS.filter((t) => !hiddenTabs.includes(t.id));
  const fallbackTab = visibleTabs[0]?.id ?? "alloc";
  const [tab, setTab] = useHydratedCache<LabTab>(() => {
    const fromUrl = initialLabTab();
    return visibleTabs.some((t) => t.id === fromUrl) ? fromUrl : fallbackTab;
  }, fallbackTab);
  const tabScrollRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Partial<Record<LabTab, HTMLButtonElement | null>>>({});
  const [tabOverflow, setTabOverflow] = useState({ left: false, right: false });
  /** What-if scope: full book or a single sheet */
  const [scopeId, setScopeId] = useState<string>("book");
  /*
    Read once on mount rather than through the sync hook, because this tab
    only needs the names to draw chips with and re-rendering the whole Lab
    every time the watchlist syncs would be a lot of work for a row of
    links. `useHydratedCache` keeps the first server render empty, so the
    markup matches.
  */
  const [watchlist] = useHydratedCache<string[]>(() => loadWatchlist(), EMPTY_WATCHLIST);

  function selectTab(id: LabTab) {
    setTab(id);
  }

  // The tab row can still scroll on a narrow phone, so keep the active tab
  // on screen. Arriving from a deep link or the command palette otherwise
  // left the highlight scrolled out of view.
  useEffect(() => {
    const el = tabRefs.current[tab];
    if (!el) return;
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);

  // Edge fades, but only on the side that actually has more tabs, so the
  // row reads as scrollable instead of looking arbitrarily clipped.
  const syncTabOverflow = useCallback(() => {
    const el = tabScrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setTabOverflow({
      left: el.scrollLeft > 4,
      right: maxScroll > 4 && el.scrollLeft < maxScroll - 4,
    });
  }, []);

  useEffect(() => {
    syncTabOverflow();
    const el = tabScrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(syncTabOverflow);
    observer.observe(el);
    return () => observer.disconnect();
  }, [syncTabOverflow, visibleTabs.length]);

  // Mirror the sub-tab into the URL (replaceState only — sub-tab clicks
  // shouldn't pile onto the back-button stack the way top-level tab
  // switches do). Left in place when navigating away from Lab on purpose:
  // harmless when ignored elsewhere, and means coming back to Lab (even a
  // tab switch away and back, not just a refresh) restores the same
  // sub-tab instead of always resetting to Allocation.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("labtab", tab);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}`
    );
  }, [tab]);

  useEffect(() => {
    if (!intentTab) return;
    const id = INTENT_TO_TAB[intentTab];
    if (!hiddenTabs.includes(id)) selectTab(id);
    onIntentConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentTab]);

  // Tier can load after the first paint and hide the tab we landed on
  // (investor hides Risk). Snap back so the panel is not a blank hole.
  const hiddenKey = hiddenTabs.join("|");
  useEffect(() => {
    if (hiddenTabs.includes(tab)) setTab(fallbackTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hiddenKey stands in for the list
  }, [hiddenKey, tab, fallbackTab]);

  useEffect(() => {
    if (scopeId === "book") return;
    if (!portfolios.some((p) => p.id === scopeId)) setScopeId("book");
  }, [scopeId, portfolios]);

  const scopedTickers = useMemo(() => {
    if (scopeId === "book") return overview.tickers;
    const rows = holdings.filter((h) => h.portfolio_id === scopeId);
    const byTicker = new Map<
      string,
      { ticker: string; shares: number; buyValue: number; sparkline: number[] }
    >();
    for (const h of rows) {
      const prev = byTicker.get(h.ticker) ?? {
        ticker: h.ticker,
        shares: 0,
        buyValue: 0,
        sparkline: [],
      };
      prev.shares += h.shares;
      prev.buyValue += h.shares * h.buy_price;
      const spark = quotes[h.ticker]?.sparkline ?? [];
      if (spark.length > prev.sparkline.length) prev.sparkline = spark;
      byTicker.set(h.ticker, prev);
    }
    return [...byTicker.values()].map((t) => {
      const price = quotes[t.ticker]?.price ?? t.buyValue / Math.max(t.shares, 1);
      const currentValue = t.shares * price;
      return {
        ticker: t.ticker,
        shares: t.shares,
        price,
        currentValue,
        buyValue: t.buyValue,
        sparkline: t.sparkline,
        portfolios: [],
        portfolioIds: [scopeId],
        roiDollar: currentValue - t.buyValue,
        roiPct: t.buyValue > 0 ? (currentValue - t.buyValue) / t.buyValue : 0,
        todayDollar: 0,
        todayPct: quotes[t.ticker]?.changePercent ?? null,
      };
    });
  }, [scopeId, overview.tickers, holdings, quotes]);

  const scopedCash = useMemo(() => {
    if (scopeId === "book") return overview.totals.cash;
    return (
      portfolios.find((p) => p.id === scopeId)?.cash_balance ?? 0
    );
  }, [scopeId, overview.totals.cash, portfolios]);

  const scopeLabel =
    scopeId === "book"
      ? "Entire portfolio"
      : (portfolios.find((p) => p.id === scopeId)?.name ?? "Portfolio");

  const scopeApplies = tab === "alloc" || tab === "risk";

  const sheetHoldings = useMemo(
    () =>
      scopedTickers.map((t) => ({
        ticker: t.ticker,
        currentValue: t.currentValue,
      })),
    [scopedTickers]
  );

  const sectors = useMemo(
    () => allocationBySector(sheetHoldings),
    [sheetHoldings]
  );
  const byTicker = useMemo(
    () => allocationByTicker(sheetHoldings),
    [sheetHoldings]
  );
  const themes = useMemo(() => themeBreakdown(sheetHoldings), [sheetHoldings]);
  const concentration = useMemo(
    () => concentrationRead(sheetHoldings),
    [sheetHoldings]
  );
  const personality = useMemo(
    () =>
      buildPortfolioPersonality(
        sheetHoldings.map((h) => ({ ticker: h.ticker, value: h.currentValue })),
        scopedCash
      ),
    [sheetHoldings, scopedCash]
  );

  const corrSeries = useMemo(
    () =>
      scopedTickers
        .filter((t) => (t.sparkline?.length ?? 0) > 5)
        .slice(0, 8)
        .map((t) => ({ ticker: t.ticker, sparkline: t.sparkline ?? [] })),
    [scopedTickers]
  );
  const corrPairs = useMemo(
    () => correlationMatrix(corrSeries).slice(0, 10),
    [corrSeries]
  );
  const corrHeat = useMemo(() => correlationGrid(corrSeries), [corrSeries]);

  /*
   * One sentence per tab: what the view is for, then one thing to notice in
   * this reader's own figures. Worked out from what is on screen rather than
   * written once for everybody, because a general sentence about
   * diversification teaches nobody anything about their own portfolio.
   */
  const risingCount = useMemo(
    () =>
      scopedTickers.filter((t) => {
        const spark = t.sparkline ?? [];
        const first = spark[0];
        const last = spark[spark.length - 1];
        return first != null && last != null && first > 0 && last > first;
      }).length,
    [scopedTickers]
  );

  const holdingCount = concentration.positionCount;
  const topThree = Math.round(concentration.topThreePct * 100);
  const topWeight = Math.round(concentration.topWeightPct * 100);
  const topName = concentration.topWeightTicker
    ? cashtag(concentration.topWeightTicker)
    : null;

  const tabIntro: Record<LabTab, string> = {
    alloc:
      holdingCount === 0
        ? "Where your money actually sits, grouped by company and by kind of business."
        : holdingCount > 3
          ? `Where your money actually sits, grouped by company and by kind of business. Your three biggest holdings are ${topThree}% of your stocks.`
          : `Where your money actually sits, grouped by company and by kind of business. You hold ${holdingCount} ${holdingCount === 1 ? "company" : "companies"}, so almost all of this rides on ${topName ?? "them"}.`,
    risk:
      topName && holdingCount > 0
        ? `What a rough day would do to what you hold, and which of your companies move together. ${topName} is ${topWeight}% of your stocks, so a bad day for it is a bad day for the whole portfolio.`
        : "What a rough day would do to what you hold, and which of your companies tend to move together.",
    trends:
      holdingCount === 0
        ? "Whether each company is still moving the way it was, read from four years of weekly closing prices."
        : `Whether each company is still moving the way it was, read from four years of weekly closing prices. ${risingCount} of your ${holdingCount} ${holdingCount === 1 ? "holding is" : "holdings are"} higher now than three months ago.`,
    seasonality:
      "Which months the market has been kind in before, and which it has not. This one never looks at what you own, and your own holdings are in the list so you can look one up.",
    lookup:
      holdingCount === 0
        ? "Any company, explained in plain words: what it does, what its finances look like, what it might be worth and both sides of the argument. Nothing here is advice and nothing you look at is bought."
        : `Any company, explained in plain words, whether you own it or not. The same treatment your ${holdingCount === 1 ? "own holding gets" : `${holdingCount} holdings get`}, applied to something you are only thinking about.`,
  };

  return (
    <div className="flex flex-col gap-6">
      <Panel padded={false} className="px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <h2 className="shrink-0 text-foreground">Lab</h2>
            <div
              role="tablist"
              aria-label="Lab sections"
              className="scrollbar-none flex min-h-[2rem] gap-1 overflow-x-auto sm:hidden"
            >
              {visibleTabs.map((t) => (
                <button
                  key={`m-${t.id}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => selectTab(t.id)}
                  className={cn(
                    "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition touch-target",
                    tab === t.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-primary"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="relative hidden min-w-0 flex-1 sm:block">
              <div
                ref={tabScrollRef}
                onScroll={syncTabOverflow}
                role="tablist"
                aria-label="Lab sections"
                /*
                  The scroll edges fade the CONTENT with a mask, they do not
                  paint a ramp over it. Two absolutely-positioned
                  `bg-gradient-to-r from-card/85` strips used to sit on top
                  of this row, which put a card-coloured smear on a glass
                  surface and only matched while the surface behind it was
                  exactly `--card`. A mask takes the tab labels to
                  transparent instead, so the glass underneath is untouched
                  and there is no gradient anywhere in the material.
                */
                className={cn(
                  "scrollbar-none flex min-h-[2rem] gap-1 overflow-x-auto",
                  tabOverflow.left && tabOverflow.right
                    ? "[mask-image:linear-gradient(to_right,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)]"
                    : tabOverflow.left
                      ? "[mask-image:linear-gradient(to_right,transparent,black_1.5rem)]"
                      : tabOverflow.right
                        ? "[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)]"
                        : undefined
                )}
              >
                {visibleTabs.map((t) => (
                  <button
                    key={t.id}
                    ref={(el) => {
                      tabRefs.current[t.id] = el;
                    }}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    onClick={() => selectTab(t.id)}
                    className={cn(
                      "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition touch-target",
                      tab === t.id
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-primary"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {/*
            * A real Select, not a native `<select>`. iOS zooms the page when
            * a form control under 16px takes focus, so the app forces
            * `input, select, textarea` to 16px below `md` — and a `<select>`
            * picks that up along with the text fields it was written for,
            * leaving this the one control two steps larger than the label
            * beside it. A Radix trigger is a `<button>`, so the rule does not
            * reach it and it stays `text-sm`.
            */}
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <span
              className="shrink-0 text-sm font-medium text-muted-foreground"
              id="lab-scope-label"
            >
              Looking at
            </span>
            <Select
              value={scopeId}
              onValueChange={setScopeId}
              disabled={!scopeApplies}
            >
              <SelectTrigger
                aria-labelledby="lab-scope-label"
                className={cn(
                  "min-w-0 max-w-[min(100%,16rem)]",
                  !scopeApplies && "cursor-not-allowed opacity-40"
                )}
                title={
                  scopeApplies
                    ? "Narrow these tools down to one portfolio"
                    : "This tool always uses your whole portfolio"
                }
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="book">Everything</SelectItem>
                {portfolios.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {tabIntro[tab]}
        </p>
        </div>
      </Panel>

      {tab === "lookup" && !hiddenTabs.includes("lookup") && (
        <WidgetErrorBoundary name="Look up a company">
          <CompanyLookupPanel
            watchlist={watchlist}
            owned={overview.tickers.map((t) => t.ticker)}
          />
        </WidgetErrorBoundary>
      )}

      {tab === "alloc" && !hiddenTabs.includes("alloc") && (
        <WidgetErrorBoundary name="Allocation">
        <div className="flex flex-col gap-4">
          {concentration.positionCount === 0 ? (
            <EmptyState
              title="Nothing to look at yet"
              detail={`Add a holding to ${scopeLabel} and this fills in with how spread out you are.`}
            />
          ) : (
            <>
              <Panel tone="plain">
                <div className={SPLIT_ROW}>
                  <div className={SPLIT_COPY}>
                    <h3 className="text-foreground">
                      How spread out you are
                    </h3>
                    {/*
                      The scope is its own line, and only when it is one
                      portfolio: the band description ends in a full stop,
                      and "dominate. · Entire portfolio" put a separator
                      after a sentence. When the whole portfolio is in
                      view the picker above already says so.
                    */}
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      {personality.diversificationBand.description}
                    </p>
                    {scopeId !== "book" ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        In {scopeLabel}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xl font-bold tabular-nums text-foreground">
                      {personality.diversificationScore}
                      <span className="text-sm font-medium text-muted-foreground">/100</span>
                    </p>
                    <p className="text-sm font-medium text-muted-foreground">
                      Diversified
                    </p>
                  </div>
                </div>

                <div>
                  <Progress
                    value={Math.max(2, Math.min(100, personality.diversificationScore))}
                    className="h-3 bg-secondary"
                  />
                  <div className="mt-2 flex justify-between gap-4 text-xs text-muted-foreground">
                    <span>0 is everything in one holding</span>
                    <span className="text-right">100 is as spread out as an index fund</span>
                  </div>
                </div>

                <Scoreboard cols={concentration.positionCount > 3 ? 3 : 2}>
                  <Score
                    label="Behaves like"
                    value={`${concentration.effectivePositions.toFixed(1)} holdings`}
                    sub={
                      concentration.positionCount === 1
                        ? "Your only holding."
                        : `You hold ${concentration.positionCount}. Uneven weights make it act like fewer.`
                    }
                  />
                  <Score
                    label="Largest holding"
                    value={`${(concentration.topWeightPct * 100).toFixed(1)}%`}
                    sub={concentration.topWeightTicker ?? undefined}
                    /* --warning, not --loss. A concentrated position is a
                     * caution, not a loss: nothing here has lost money, and
                     * spending the P&L colour on a non-P&L number weakens
                     * both. DESIGN_TOKENS.md assigns orange to exactly this. */
                    valueClassName={
                      concentration.topWeightPct >= 0.25
                        ? "text-warning"
                        : undefined
                    }
                  />
                  {/* "Top 5" is tautologically 100% for a book of five or
                   * fewer, which reads as broken. Fall back to top 3, and
                   * drop the cell entirely when even that says nothing. */}
                  {concentration.positionCount > 3 && (
                    <Score
                      label={
                        concentration.positionCount > 5
                          ? "Top 5 combined"
                          : "Top 3 combined"
                      }
                      value={`${((concentration.positionCount > 5 ? concentration.topFivePct : concentration.topThreePct) * 100).toFixed(1)}%`}
                      sub={
                        (concentration.positionCount > 5
                          ? concentration.topFivePct
                          : concentration.topThreePct) >= 0.8
                          ? "The rest of your portfolio barely changes the total."
                          : "The rest of your portfolio carries real weight."
                      }
                      /* --warning, not --loss — see the note above. */
                      valueClassName={
                        (concentration.positionCount > 5
                          ? concentration.topFivePct
                          : concentration.topThreePct) >= 0.8
                          ? "text-warning"
                          : undefined
                      }
                    />
                  )}
                </Scoreboard>
              </Panel>

              {themes.length > 0 && (
                <Panel tone="plain">
                  {/*
                   * Title and subtitle are one child of the panel, not two.
                   * `Panel` is a `gap-5 sm:gap-6` column, so as siblings the
                   * subtitle sat a full panel gap under its own title —
                   * plus whatever margin the call site added on top of it.
                   * Grouped, the panel gap separates the header from the
                   * bar and `mt-1.5` does the hugging inside.
                   */}
                  <div>
                    <h3 className="text-foreground">
                      What you&apos;re actually betting on
                    </h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      Your holdings grouped by kind of business, which usually
                      tells you more than the list of tickers does.
                    </p>
                  </div>
                  <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                    {themes.map((t) => (
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
                    items={themes.map((t) => ({
                      key: t.theme,
                      label: t.label,
                      color: THEME_COLOR[t.theme],
                      value: `${Math.round(t.pct * 100)}%`,
                    }))}
                  />
                </Panel>
              )}

              {/*
                `items-start`: the two cards hold different counts (a few
                kinds of business against every holding), and stretched
                to one height the shorter card was mostly empty glass.
              */}
              <div className="grid gap-4 md:grid-cols-2 md:items-start">
                <AllocCard title="By kind of business" slices={sectors} />
                <AllocCard title="By holding" slices={byTicker} />
              </div>
            </>
          )}
        </div>
        </WidgetErrorBoundary>
      )}

      {tab === "trends" && !hiddenTabs.includes("trends") && (
        /*
         * Trends is the names in this portfolio and nothing else. The
         * market reading lives on Home, directly under the scoreboard,
         * where it answers "is that my names or the whole market" for the
         * figure a reader has just read. Drawing it here as well would be
         * the same card twice, in two rooms the shell keeps mounted at
         * once.
         */
        <WidgetErrorBoundary name="Trends">
          <TrendsPanel tickers={scopedTickers.map((t) => t.ticker)} />
        </WidgetErrorBoundary>
      )}

      {tab === "seasonality" && !hiddenTabs.includes("seasonality") && (
        <WidgetErrorBoundary name="Seasonality">
          <SeasonalityPage bookTickers={overview.tickers.map((t) => t.ticker)} />
        </WidgetErrorBoundary>
      )}

      {tab === "risk" && !hiddenTabs.includes("risk") && (
        <WidgetErrorBoundary name="Risk">
        <>
        <ScenarioSimulator
          holdings={scopedTickers}
          cash={scopedCash}
          scopeLabel={scopeLabel}
        />
        <Panel tone="plain" className="flex flex-col gap-4">
          <div>
            <h3 className="text-foreground">
              Do these move together?
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              How closely each pair has tracked each other over the last 90
              days, up to 8 companies. Near <span className="tabular-nums">+1</span> means they
              rise and fall as one, so holding both spreads your money without
              spreading your risk. Near{" "}
              <span className="tabular-nums">0</span> means they drift
              independently, which is what real diversification looks like.
            </p>
          </div>
          {corrHeat.tickers.length < 2 ? (
            <p className="text-sm text-muted-foreground">
              You need at least two holdings with enough price history to
              compare.
            </p>
          ) : (
            /* Header row is one shared 2rem band: column labels sit on the
             * same tracks as the cells, Tightest pairs sits on that same
             * band. Pair list then fills the body height. */
            <div>
              <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-stretch">
                <div className="hidden min-w-0 overflow-x-auto lg:block">
                  <div
                    className="grid w-max gap-1"
                    style={{
                      gridTemplateColumns: `auto repeat(${corrHeat.tickers.length}, minmax(2.5rem, max-content))`,
                    }}
                  >
                    <div className="h-8" />
                    {corrHeat.tickers.map((t) => (
                      <div
                        key={`h-${t}`}
                        title={cashtag(t)}
                        className="flex h-8 items-end justify-center px-0.5 pb-0.5 text-sm font-medium leading-none text-muted-foreground"
                      >
                        <span className="whitespace-nowrap">{cashtag(t)}</span>
                      </div>
                    ))}
                    {corrHeat.tickers.map((row, i) => (
                      <div key={row} className="contents">
                        <div className="flex h-10 items-center pr-2 text-sm font-medium text-muted-foreground">
                          {cashtag(row)}
                        </div>
                        {corrHeat.grid[i]!.map((c, j) => (
                          <div
                            key={`${row}-${j}`}
                            title={
                              c == null
                                ? NO_VALUE
                                : `${row} ↔ ${corrHeat.tickers[j]}: ${c.toFixed(2)}`
                            }
                            className={cn(
                              "flex h-10 min-w-10 w-full items-center justify-center rounded-md tabular-nums text-sm font-medium text-foreground",
                              c == null && "bg-muted"
                            )}
                            style={
                              c == null
                                ? undefined
                                : {
                                    background: `color-mix(in oklch, var(--${c >= 0 ? "gain" : "loss"}) ${Math.round((0.18 + Math.abs(c) * 0.72) * 100)}%, transparent)`,
                                  }
                            }
                          >
                            {c == null ? NO_VALUE : c.toFixed(1)}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex min-w-0 flex-col">
                  <p className="flex h-8 items-end pb-0.5 text-sm text-muted-foreground">
                    Tightest pairs
                  </p>
                  <ul className="flex min-h-0 flex-1 flex-col gap-1">
                    {corrPairs.map((c) => (
                      <li
                        key={`${c.a}-${c.b}`}
                        className="flex flex-1 items-center justify-between gap-3 rounded-md border border-border px-2.5 text-sm"
                      >
                        <span className="truncate text-muted-foreground">
                          {cashtag(c.a)} ↔ {cashtag(c.b)}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 tabular-nums font-medium",
                            c.corr >= 0.7
                              ? "text-loss"
                              : c.corr <= -0.3
                                ? "text-gain"
                                : "text-muted-foreground"
                          )}
                        >
                          {Number.isFinite(c.corr) ? c.corr.toFixed(2) : NO_VALUE}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-sm bg-gain"
                  />
                  Move together
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-sm bg-loss"
                  />
                  Move opposite
                </span>
                <span>The stronger the colour, the closer the link</span>
              </div>
            </div>
          )}
        </Panel>
        </>
        </WidgetErrorBoundary>
      )}
    </div>
  );
});

function AllocCard({
  title,
  slices,
}: {
  title: string;
  slices: { label: string; pct: number; value: number }[];
}) {
  return (
    /*
      `md:h-auto`: a Panel fills its grid cell by default, and beside the
      taller "By holding" card that left this one mostly empty glass. The
      grid it sits in is `md:items-start`, so the cell hugs the card too.
    */
    <Panel tone="plain" className="md:h-auto">
      <h3 className="text-foreground">{title}</h3>
      <div className="flex flex-col gap-2">
        {slices.map((s) => (
          <div key={s.label}>
            <div className="mb-1 flex items-baseline justify-between gap-4 text-sm">
              <span className="min-w-0 truncate text-muted-foreground">{s.label}</span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-foreground">
                {Number.isFinite(s.pct)
                  ? `${(s.pct * 100).toFixed(1)}% · ${currency(s.value, 0)}`
                  : currency(s.value, 0)}
              </span>
            </div>
            <Progress
              value={Math.min(100, s.pct * 100)}
              className="h-2 bg-secondary"
            />
          </div>
        ))}
        {slices.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing held here yet.</p>
        )}
      </div>
    </Panel>
  );
}
