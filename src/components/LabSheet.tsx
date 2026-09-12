"use client";

import { useTickerSectors } from "@/lib/use-ticker-sectors";

import { TermTip } from "@/components/ui/TermTip";
import { mixSlices } from "@/lib/mix-slices";
import {
  allocationBySector,
  allocationByTicker,
  concentrationRead,
} from "@/lib/allocation";
import {
  buildPortfolioPersonality,
} from "@/lib/portfolio-personality";
import {
  EmptyState,
  PANEL_STACK,
  Panel,
  PanelHeader,
  Score,
  Scoreboard,
  SwatchLegend,
} from "@/components/ui/Panel";
import { AllocationBar } from "@/components/ui/AllocationBar";
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
import { NO_VALUE, barFillPct, cashtag, cn, currency, percent } from "@/lib/format";
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

const PlaybookPanel = dynamic(
  () =>
    import("@/components/playbook/PlaybookPanel").then((m) => m.PlaybookPanel),
  { ssr: true }
);

const EMPTY_HIDDEN_TABS: string[] = [];
const EMPTY_WATCHLIST: string[] = [];

type LabTab =
  | "alloc"
  | "risk"
  | "trends"
  | "seasonality"
  | "lookup"
  | "playbook";

/** One flat row: what you hold, how risky it is, and when it tends to move. */
/*
  The mix stays first, and the company lookup goes last.

  Lab's other four tabs are all whole-portfolio tools and one of them has
  to be what Lab opens on. Putting the lookup first made it look like the
  default and then visibly not be it: a reader lands on Lab, sees "Look up
  a company" at the left of the row, and the highlight is two tabs along.
  Last is where a tool that is about something other than your own
  portfolio belongs anyway.
*/
const TABS: { id: LabTab; label: string }[] = [
  { id: "alloc", label: "The mix" },
  { id: "risk", label: "Risk" },
  { id: "trends", label: "Trends" },
  { id: "seasonality", label: "Seasonality" },
  { id: "lookup", label: "Research" },
  /*
    Playbook is last because it is the only tab that is not about a
    holding at all, not even one the reader is weighing up. The other five
    all start from a company: four from the ones already owned and Research
    from one being considered. This one starts from nothing, which makes it
    the furthest thing in Lab from "the mix" and therefore the end of the
    row. It is also the one tab that has something to say to an account
    with no holdings in it yet, which is why it never hides.
  */
  { id: "playbook", label: "Playbook" },
];

/**
 * Lab's tab row, at one breakpoint.
 *
 * There used to be two of these written out by hand, a `sm:hidden` one for
 * the phone and a `hidden sm:block` one for everything else, and they had
 * drifted in exactly the direction that hurts most. The edge fade that
 * says a row keeps going, the scroll listener behind it, and the ref that
 * keeps the chosen tab on screen were all on the desktop row -- the one
 * with several hundred spare pixels that rarely overflows at all. The
 * phone row, which is the one that always overflows, had none of them.
 *
 * Measured at 390px: the row is 488px of tabs in a 311px window, so 177px
 * sits off the right, and "Seasonality" ends flush with the card's edge
 * with no fade, no arrow and no part-shown tab behind it. The row reads as
 * a complete set of four. The two tabs a beginner has most use for,
 * Research and the Playbook, are the two that are invisible, and nothing
 * on the screen suggests scrolling sideways would find them.
 *
 * One component used twice fixes that by construction. Each instance owns
 * its own ref, its own overflow state and its own observer, which is not
 * tidiness: both rows are in the document at every width and the hidden
 * one measures `scrollWidth` and `clientWidth` as zero, so a single shared
 * ref would have one breakpoint deciding the other's fade. That is the
 * trap this repo already records against a dock measuring itself in a
 * hidden room.
 */
function LabTabRow({
  tabs,
  active,
  onSelect,
  className,
}: {
  tabs: { id: LabTab; label: string }[];
  active: LabTab;
  onSelect: (id: LabTab) => void;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Partial<Record<LabTab, HTMLButtonElement | null>>>(
    {}
  );
  const [overflow, setOverflow] = useState({ left: false, right: false });

  // Edge fades, but only on the side that actually has more tabs, so the
  // row reads as scrollable instead of looking arbitrarily clipped.
  const sync = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setOverflow({
      left: el.scrollLeft > 4,
      right: maxScroll > 4 && el.scrollLeft < maxScroll - 4,
    });
  }, []);

  useEffect(() => {
    sync();
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sync, tabs.length]);

  /*
   * Keep the chosen tab on screen. Arriving from a deep link or the
   * command palette otherwise left the highlight scrolled out of view,
   * which on the phone row meant landing on Research and seeing a row
   * whose four visible tabs were all unselected.
   *
   * `inline: "nearest"` rather than "center", and `block: "nearest"`, so
   * this never scrolls the page itself to bring a row into view.
   */
  useEffect(() => {
    buttonRefs.current[active]?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [active]);

  return (
    <div
      ref={scrollRef}
      onScroll={sync}
      role="tablist"
      aria-label="Lab sections"
      /*
        The scroll edges fade the CONTENT with a mask, they do not paint a
        ramp over it. Two absolutely-positioned `bg-gradient-to-r
        from-card/85` strips used to sit on top of this row, which put a
        card-coloured smear on a glass surface and only matched while the
        surface behind it was exactly `--card`. A mask takes the tab labels
        to transparent instead, so the glass underneath is untouched and
        there is no gradient anywhere in the material.
      */
      className={cn(
        "scrollbar-none flex min-h-[2rem] gap-1 overflow-x-auto",
        overflow.left && overflow.right
          ? "[mask-image:linear-gradient(to_right,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)]"
          : overflow.left
            ? "[mask-image:linear-gradient(to_right,transparent,black_1.5rem)]"
            : overflow.right
              ? "[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)]"
              : undefined,
        className
      )}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          ref={(el) => {
            buttonRefs.current[t.id] = el;
          }}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onSelect(t.id)}
          className={cn(
            "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition touch-target",
            active === t.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-primary"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

const INTENT_TO_TAB: Record<LabDeepLink, LabTab> = {
  seasonality: "seasonality",
  lookup: "lookup",
  playbook: "playbook",
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

  /*
    The press writes the address; nothing derives it from the state.

    This used to be a `setTab` here and a `useEffect` below that mirrored
    the tab into `?labtab=`, and that pair silently broke every deep link
    into Lab. The read happens in a layout effect (`useHydratedCache`) and
    the mirror in a passive one, and nothing orders the re-render from the
    first ahead of the second, so the mirror fired while the tab was still
    the fallback and wrote `labtab=alloc` over whatever the reader had
    arrived on. Measured against the running app: `?labtab=risk`,
    `?labtab=trends` and `?labtab=seasonality` all landed on The mix with
    the address rewritten to `alloc`, which is the exact opposite of what
    the parameter is for.

    Writing from the press removes the race instead of trying to sequence
    it: a deep link is read once and left alone, and the address only ever
    changes because somebody chose a tab. `replaceState` keeps sub-tab
    presses off the back stack, and `window.history.state` is passed
    through because the App Router keeps its own routing state in there.
    Growth's sub-tabs are the same shape for the same reason.
  */
  function selectTab(id: LabTab) {
    setTab(id);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("labtab", id);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}`
    );
  }

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

  /*
    Asked once per set of holdings and then remembered for the session, so
    walking between Lab's tabs and Pulse costs nothing. See
    `use-ticker-sectors.ts` for why this is not on the quote cycle.
  */
  const sectorWordsByTicker = useTickerSectors(
    useMemo(() => sheetHoldings.map((h) => h.ticker), [sheetHoldings])
  );

  const mix = useMemo(
    () =>
      mixSlices(
        sheetHoldings.map((h) => ({
          ...h,
          sector: sectorWordsByTicker[h.ticker.toUpperCase()] ?? null,
        }))
      ),
    [sheetHoldings, sectorWordsByTicker]
  );
  /*
   * How many kinds of business the money is actually in, counted off the
   * unfolded allocation rather than off the chart.
   *
   * `mix` folds everything past `MAX_MIX_SLICES` into one "everything else"
   * slice so the chart stays readable, and this repo's own rule is that a
   * fold has no business deciding what a sentence says: counting the drawn
   * slices would report a reader in nine kinds of business as being in six.
   * `allocationBySector` is the same grouping with nothing folded away.
   */
  const sectorCount = useMemo(
    () =>
      allocationBySector(
        sheetHoldings.map((h) => ({
          ...h,
          sector: sectorWordsByTicker[h.ticker.toUpperCase()] ?? null,
        }))
      ).length,
    [sheetHoldings, sectorWordsByTicker]
  );

  /*
    The same answer threaded into the Risk room, so a bad day is modelled
    from the profile for that kind of business rather than from the
    plain-large-company catch-all every unlisted name used to get.
  */
  const scopedWithSectors = useMemo(
    () =>
      scopedTickers.map((t) => ({
        ...t,
        sector: sectorWordsByTicker[t.ticker.toUpperCase()] ?? null,
      })),
    [scopedTickers, sectorWordsByTicker]
  );

  const byTicker = useMemo(
    () => allocationByTicker(sheetHoldings),
    [sheetHoldings]
  );
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
  const topWeight = Math.round(concentration.topWeightPct * 100);
  const topName = concentration.topWeightTicker
    ? cashtag(concentration.topWeightTicker)
    : null;

  const tabIntro: Record<LabTab, string> = {
    alloc:
      holdingCount === 0
        ? "Where your money actually sits, grouped by company and by kind of business."
        : holdingCount > 3
          ? /*
             * The noticing figure is the count of business kinds, not a
             * concentration percentage.
             *
             * It used to read "Your three biggest holdings are N% of your
             * stocks", and the panel three inches below opens on a
             * concentration score, an effective holding count, the largest
             * holding and a top-five share. So the intro spent its one
             * sentence on a fifth telling of the same measure, and on a
             * different cut of it than the panel used, which left two
             * concentration percentages with different denominators inside
             * one screen for a reader to reconcile. The sector count is the
             * one summary of the grouping this tab promises that appears
             * nowhere else: the chart below draws the kinds of business and
             * never totals them.
             */
            `Where your money actually sits, grouped by company and by kind of business. Your ${holdingCount} holdings fall into ${sectorCount} ${sectorCount === 1 ? "kind" : "kinds"} of business.`
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
    playbook:
      "How to think about all of this, which is the half nobody hands you: what the market's mood says about which idea applies today, what a fall actually costs to undo, and the ideas that keep turning up in the writing of people who did this well. It never looks at what you own.",
    lookup:
      holdingCount === 0
        ? "Any company, explained in plain words: what it does, what its finances look like, what it might be worth and both sides of the argument. Nothing here is advice and nothing you look at is bought."
        : `Any company, explained in plain words, whether you own it or not. The same treatment your ${holdingCount === 1 ? "own holding gets" : `${holdingCount} holdings get`}, applied to something you are only thinking about.`,
  };

  return (
    <div className={PANEL_STACK}>
      <Panel padded={false} className="px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <h2 className="shrink-0 text-foreground">Lab</h2>
            {/*
              * The phone row wraps rather than scrolling.
              *
              * The fade below says "there is more this way" and it was
              * measured doing almost nothing here: at 390px the row is 488px
              * of tabs in a 311px window, and it happens to break within two
              * pixels of a tab boundary, so what a reader sees is four
              * complete tabs and a slightly dim final letter. Research and
              * the Playbook are entirely off-screen with nothing suggesting
              * they exist, and those are the two tabs a beginner has most use
              * for: the one that explains a company they are thinking about,
              * and the one that teaches the ideas. Withholding a room from
              * the reader who most needs it, by accident, is the worst
              * version of the thing this product says it does not do.
              *
              * Wrapping costs one row of height and shows all six. Kept off
              * the wider row, which has the space to lay them out in one line
              * and where the scroller and its fade are the right answer.
              */}
            <LabTabRow
              tabs={visibleTabs}
              active={tab}
              onSelect={selectTab}
              className="flex-wrap sm:hidden"
            />
            <div className="relative hidden min-w-0 flex-1 sm:block">
              <LabTabRow
                tabs={visibleTabs}
                active={tab}
                onSelect={selectTab}
              />
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

      {tab === "playbook" && !hiddenTabs.includes("playbook") && (
        <WidgetErrorBoundary name="Playbook">
          <PlaybookPanel />
        </WidgetErrorBoundary>
      )}

      {tab === "lookup" && !hiddenTabs.includes("lookup") && (
        <WidgetErrorBoundary name="Research">
          <CompanyLookupPanel
            watchlist={watchlist}
            owned={overview.tickers.map((t) => t.ticker)}
          />
        </WidgetErrorBoundary>
      )}

      {tab === "alloc" && !hiddenTabs.includes("alloc") && (
        <WidgetErrorBoundary name="Allocation">
        {/*
          * `PANEL_STACK`, so the mix tab is spaced like every other tab.
          *
          * Lab's outer column is already `PANEL_STACK`, and every other tab
          * returns a fragment, so its panels are direct children of that
          * column and get the product's own 32px stepping to 40px. This tab
          * is the one that wraps its panels in a column of its own, which
          * made the wrapper a single child of the outer stack and set its
          * three panels 16px apart inside it. Half the standard, decided by
          * nothing but the fact that this tab needed a wrapper for its empty
          * state, which is exactly the drift AGENTS.md records against rooms
          * that build their own column.
          */}
        <div className={PANEL_STACK}>
          {concentration.positionCount === 0 ? (
            <EmptyState
              title="Nothing to look at yet"
              detail={`Add a holding to ${scopeLabel} and this fills in with how spread out you are.`}
            />
          ) : (
            <>
              <Panel tone="plain">
                {/*
                  The scope is its own line, and only when it is one
                  portfolio: the band description ends in a full stop, and
                  "dominate. · Entire portfolio" put a separator after a
                  sentence. When the whole portfolio is in view the picker
                  above already says so. It is a `span` rather than a `p`
                  because it rides inside the subtitle, which is one.
                */}
                <PanelHeader
                  title="How spread out you are"
                  subtitle={
                    <>
                      {personality.diversificationBand.description}
                      {scopeId !== "book" ? (
                        <span className="mt-1 block text-xs">
                          In {scopeLabel}
                        </span>
                      ) : null}
                    </>
                  }
                  actions={
                    <div className="text-right">
                      <p className="font-mono text-xl font-bold tabular-nums text-foreground">
                        {personality.diversificationScore}
                        <span className="text-sm font-medium text-muted-foreground">
                          /100
                        </span>
                      </p>
                      {/*
                        * The band's own label, not a constant.
                        *
                        * This read "Diversified" whatever the score was.
                        * `diversificationBandFor` already computes a word for
                        * each quarter of the scale, "Concentrated",
                        * "Moderate", "Spread out", "Broad", and the constant
                        * was wrong for three of the four: a reader at 48
                        * saw a big figure captioned "Diversified" sitting
                        * directly beside the sentence "Somewhat spread out,
                        * but a few holdings still dominate", so the panel
                        * contradicted itself in the space of one line, and
                        * the half a beginner is most likely to take away is
                        * the one word under the number.
                        */}
                      <p className="text-sm font-medium text-muted-foreground">
                        {personality.diversificationBand.label}
                      </p>
                    </div>
                  }
                />

                <div>
                  <Progress
                    value={barFillPct(personality.diversificationScore, 2)}
                    className="h-3 bg-secondary"
                  />
                  <div className="mt-2 flex justify-between gap-4 text-xs text-muted-foreground">
                    <span>0 is everything in one holding</span>
                    <span className="text-right">100 is as spread out as an index fund</span>
                  </div>
                </div>

                <Scoreboard cols={concentration.positionCount > 3 ? 3 : 2}>
                  <Score
                    label={
                      <TermTip
                        term="spread-out"
                        example={{ count: Math.round(concentration.effectivePositions) }}
                      >
                        Behaves like
                      </TermTip>
                    }
                    value={`${concentration.effectivePositions.toFixed(1)} holdings`}
                    sub={
                      concentration.positionCount === 1
                        ? "Your only holding."
                        : `You hold ${concentration.positionCount}. Uneven weights make it act like fewer.`
                    }
                  />
                  <Score
                    label={
                      <TermTip term="share-of-portfolio">
                        Largest holding
                      </TermTip>
                    }
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

              {mix.length > 0 && (
                <Panel tone="plain">
                  {/*
                    `PanelHeader`, not a hand-rolled title and subtitle.

                    The note that used to stand here had worked out for
                    itself that a title and its subtitle are one child of
                    the panel rather than two, and then implemented that
                    by hand -- which is what `PanelHeader` is, so Lab's
                    panels titled at `h3` (16px) where the other 66 call
                    sites in the app title at 18, and hugged at `mt-1.5`
                    where the component hugs at `mt-2`. Two answers to one
                    question, decided by whether a panel happened to reach
                    for the component.
                  */}
                  <PanelHeader
                    title="What you're actually betting on"
                    subtitle="Your holdings grouped by kind of business, which usually tells you more than the list of tickers does."
                  />
                  <AllocationBar
                    slices={mix.map((m) => ({
                      key: m.key,
                      pct: m.pct,
                      color: m.color,
                      title: `${m.label}: ${percent(m.pct)}`,
                    }))}
                  />
                  {/*
                    The legend carries the money as well as the share,
                    which is what the separate bar card below used to be
                    for. With one grouping there is nothing left for a
                    second panel to say, and two panels answering one
                    question is how this room came to contradict itself.
                  */}
                  <SwatchLegend
                    items={mix.map((m) => ({
                      key: m.key,
                      label: m.label,
                      color: m.color,
                      value: `${percent(m.pct)} · ${currency(m.value, 0)}`,
                    }))}
                  />
                </Panel>
              )}

              {/*
                `items-start`: the two cards hold different counts (a few
                kinds of business against every holding), and stretched
                to one height the shorter card was mostly empty glass.
              */}
              {/*
                "By sector" stood here and is gone. It was the same
                grouping as the panel above with the money attached, so
                the money moved into that panel's legend and the duplicate
                went: a reader asking what kind of business their money is
                in should meet one answer, not two panels of it.
              */}
              <AllocCard title="By holding" slices={byTicker} />
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
          holdings={scopedWithSectors}
          cash={scopedCash}
          scopeLabel={scopeLabel}
        />
        <Panel tone="plain" className="flex flex-col gap-4">
          <PanelHeader
            title="Do these move together?"
            subtitle={
              <>
                How closely each pair has tracked each other over the last 90
                days, up to 8 companies. Near{" "}
                <span className="tabular-nums">+1</span> means they rise and
                fall as one, so holding both spreads your money without
                spreading your risk. Near{" "}
                <span className="tabular-nums">0</span> means they drift
                independently, which is what real diversification looks like.
              </>
            }
          />
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
      <PanelHeader title={title} />
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
              value={barFillPct(s.pct * 100)}
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
