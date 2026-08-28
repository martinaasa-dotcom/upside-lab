"use client";

import { HomeWorld } from "@/components/HomeWorld";
import { CashAlertCard } from "@/components/mobile/CashAlertCard";
import { WatchlistStrip } from "@/components/WatchlistStrip";
import {
  BookNavChart,
  useBookNavHistory,
} from "@/components/mobile/BookNavChart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { MarketSentimentWidget } from "@/components/MarketSentimentWidget";
import { OvernightNote } from "@/components/OvernightNote";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import {
  InsightText,
  NESTED_PAD,
  Panel,
  PanelHeader,
  Pill,
  Reading,
  Score,
  Scoreboard,
  Segmented,
  MicroLabel,
} from "@/components/ui/Panel";
import { NO_VALUE, cashtag, cn, currency, percent, plural, signedCurrency, signedPercent, signedTone } from "@/lib/format";
import { parseHoldingsPaste, type CsvHoldingRow } from "@/lib/csv-import";
import {
  screenshotPickerInputProps,
  useScreenshotPicker,
} from "@/lib/use-screenshot-picker";
import {
  buildMorningRead,
  loadHomePulseNotes,
  type HomePulseNote,
} from "@/lib/morning-read";
import { WhyThis } from "@/components/ui/WhyThis";
import { pulseProvenance } from "@/lib/provenance";
import { loadConvictionMap } from "@/lib/conviction";
import {
  bumpInsightLook,
  loadShownInsights,
  lockInsightLook,
  rememberShownInsights,
} from "@/lib/insight-look";
import type { UpsideAlert } from "@/lib/alerts";
import { sessionLabel, sessionKind } from "@/lib/market-session";
import { sheetCashBalance } from "@/lib/cash-balance";
import type { OverviewModel, SheetScore, TickerScore } from "@/lib/overview";
import { recordWeekMark } from "@/lib/week-marks";
import type { CoveredCallRow } from "@/lib/types";
import {
  captureVisitSnapshot,
  diffSinceLastVisit,
  loadVisitSnapshot,
  saveVisitSnapshot,
  type VisitDiff,
} from "@/lib/visit-diff";
import { finiteNumber } from "@/lib/money";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Calculator,
  Plus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type LabDeepLink = "seasonality";

/** Signed numbers use gain/loss. Neutral figures stay on the cream. */
const tone = (value: number | null | undefined) =>
  signedTone(value, "text-muted-foreground");

/** Tinted pill for a signed delta, instead of plain colored text. Same
 * Pill every other delta in the app uses — this one sits in the hero
 * Scoreboard, so it's the last place that should look like a smaller,
 * different kind of chip. */
function DeltaBadge({
  value,
  children,
}: {
  value: number | null | undefined;
  children: ReactNode;
}) {
  const up = value != null && value > 0;
  const down = value != null && value < 0;
  return (
    <Pill tone={up ? "good" : down ? "bad" : "neutral"} className="font-mono">
      {children}
    </Pill>
  );
}

/** Enough to see the shape of the day. Eight was a wall of cards. */
/*
 * Even, because Movers is a two-column grid and five left the last row with
 * a single card floating beside a gap. Six fills three complete rows, and
 * an even number is also the right shape for what this block is: the names
 * that moved most, up and down.
 */
const MOVERS_SHOWN = 6;
const EMPTY_ALERTS: UpsideAlert[] = [];

type Props = {
  model: OverviewModel;
  onOpenSheet: (portfolioId: string, focus?: "covered-calls") => void;
  coveredCallRows?: CoveredCallRow[];
  /** Book-wide, not-yet-dismissed alerts (earnings/strike/margin/concentration). */
  activeAlerts?: UpsideAlert[];
  onOpenLab?: (tab?: LabDeepLink) => void;
  onOpenPulse?: (ticker?: string) => void;
  onOpenCompound?: () => void;
  marketState?: string | null;
  guest?: boolean;
  /** Show Fund + Communities on home (signed-in My book). */
  showCommunities?: boolean;
  /** Viewer has not opted into options. Hide every covered-call mention. */
  hideOptions?: boolean;
  /** Add a holding. Shown on the empty first-run card and on Home. */
  onAddHolding?: () => void;
  onImportScreenshot?: (files: File[]) => void;
  onImportCsv?: () => void;
  onPasteHoldings?: (input: {
    rows: CsvHoldingRow[];
    cash: number | null;
    replace: boolean;
  }) => void;
  onOpenCash?: () => void;
  onOpenAlerts?: () => void;
  /** Empty classroom homework sheet, not a personal book. */
  homework?: boolean;
  homeworkCash?: number;
  inviteNudge?: boolean;
  onInvitePartner?: () => void;
  onDismissInvite?: () => void;
};

/**
 * What a brand-new account sees instead of a hero reading $0 followed by a
 * column of "No green names yet" placeholders. Every route into the app
 * starts here, so it has to answer "what do I do now" rather than render
 * an analytics page with nothing in it.
 */
function EmptyBook({
  onAddHolding,
  onImportScreenshot,
  onImportCsv,
  onPasteHoldings,
  homework = false,
  homeworkCash,
}: {
  onAddHolding?: () => void;
  onImportScreenshot?: (files: File[]) => void;
  onImportCsv?: () => void;
  onPasteHoldings?: (input: {
    rows: CsvHoldingRow[];
    cash: number | null;
    replace: boolean;
  }) => void;
  homework?: boolean;
  homeworkCash?: number;
}) {
  const [paste, setPaste] = useState("");
  const [pasteErr, setPasteErr] = useState<string | null>(null);
  const screenshot = useScreenshotPicker({
    onPick: (files) => onImportScreenshot?.(files),
    disabled: !onImportScreenshot,
  });
  const routes = (
    homework
      ? [
          {
            key: "manual",
            label: "Buy a company with paper money",
            hint: "Same starting cash as the rest of the class.",
            onClick: onAddHolding,
            primary: true,
          },
        ]
      : [
          {
            key: "csv",
            label: "Upload a CSV",
            hint: "Ticker, shares, buy price. Most brokers export one.",
            onClick: onImportCsv,
            primary: false,
          },
          {
            key: "screenshot",
            label: "Import a screenshot",
            hint: "Your broker holdings page, with shares and cost. Not Apple Stocks or a watchlist.",
            onClick: onImportScreenshot ? screenshot.open : undefined,
            primary: false,
          },
          {
            key: "manual",
            label: "Add one by hand",
            hint: "Ticker, shares, and what you paid.",
            onClick: onAddHolding,
            primary: false,
          },
        ]
  ).filter((r) => r.onClick);

  function submitPaste() {
    const parsed = parseHoldingsPaste(paste);
    if (parsed.rows.length === 0) {
      setPasteErr(
        parsed.skipped[0]?.reason ??
          "Each line needs to look like NBIS 500 85.10"
      );
      return;
    }
    setPasteErr(null);
    onPasteHoldings?.({
      rows: parsed.rows,
      cash: parsed.cash,
      replace: true,
    });
  }

  const emptyTitle = homework
    ? "Your homework portfolio is empty."
    : "Your portfolio is empty.";
  const emptySubtitle = homework
    ? homeworkCash != null && homeworkCash > 0
      ? `This is paper class. Everyone started with the same cash. Buy companies with that paper money. Do not paste a real portfolio in here. You have ${currency(homeworkCash, 0)} sitting ready.`
      : "This is paper class. Everyone started with the same cash. Buy companies with that paper money. Do not paste a real portfolio in here."
    : "Paste what you own, one holding per line: ticker, shares, cost. From then on you get it back in plain sentences, and on the days it falls you find out whether anything actually changed at those companies. This portfolio is only yours until you invite someone.";

  return (
    <Panel className="overview-fade">
      <PanelHeader hero title={emptyTitle} subtitle={emptySubtitle} />

      {!homework && onPasteHoldings && (
        <div className="flex flex-col gap-3">
          <Textarea
            aria-label="Paste what you own, one holding per line"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={5}
            placeholder={"NBIS 500 85.10\nCRWV 1100 64.45"}
            className="min-h-28 font-mono"
          />
          {pasteErr && <p className="text-sm text-loss">{pasteErr}</p>}
          <Button
            type="button"
            onClick={submitPaste}
            disabled={!paste.trim()}
          >
            Add these holdings
          </Button>
        </div>
      )}

      {homework && routes[0] ? (
        <Button type="button" onClick={routes[0].onClick}>
          {routes[0].label}
        </Button>
      ) : null}

      {!homework && routes.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <MicroLabel>Or add another way</MicroLabel>
          <div className="flex flex-wrap gap-2">
            {routes.map((r) => (
              <Button
                key={r.key}
                type="button"
                variant="outline"
                size="sm"
                title={"hint" in r ? r.hint : undefined}
                onClick={r.onClick}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {onImportScreenshot && !homework ? (
        <input {...screenshotPickerInputProps(screenshot)} />
      ) : null}
    </Panel>
  );
}

function signedMovePct(pct: number): string {
  const n = percent(Math.abs(pct));
  if (pct > 0) return `+${n}`;
  if (pct < 0) return `-${n}`;
  return n;
}

/**
 * One visual language for "a ticker moved the number" — used for the
 * Sunday best/worst pair, the weekday drivers list, and (separately) the
 * Movers panel below. Same colored accent bar, ticker badge, and
 * icon-on-figure treatment everywhere a card exists to say "here's who
 * did it," instead of three different card styles for the same idea.
 */
function DriverTile({
  ticker,
  primary,
  secondary,
  isUp,
  onOpen,
  nested = false,
}: {
  ticker: string;
  primary: string;
  secondary?: string;
  isUp: boolean;
  onOpen?: () => void;
  /** Sits inside a Reading shell (the sentence above it) instead of
   * floating as its own top-level card. Muted well, no second ring. */
  nested?: boolean;
}) {
  const toneCls = isUp ? "text-gain" : "text-loss";
  const body = (
    <>
      <span
        className={cn("absolute inset-y-0 left-0 w-1", isUp ? "bg-gain" : "bg-loss")}
        aria-hidden
      />
      <Badge
        variant="secondary"
        className="chip-hang w-fit font-heading text-sm font-semibold [--chip-radius:0.625rem]"
      >
        {cashtag(ticker)}
      </Badge>
      <span
        className={cn(
          "flex items-center gap-1.5 font-mono text-2xl font-bold tabular-nums",
          toneCls
        )}
      >
        {isUp ? (
          <TrendingUp className="size-4 shrink-0" />
        ) : (
          <TrendingDown className="size-4 shrink-0" />
        )}
        {primary}
      </span>
      {secondary ? (
        <span className={cn("text-sm", toneCls)}>{secondary}</span>
      ) : null}
    </>
  );
  const shellClass = cn(
    "group relative flex h-full min-w-0 flex-col justify-center gap-1.5 overflow-hidden rounded-lg p-6 text-left ring-1 transition",
    nested
      ? "glass-well ring-foreground/12"
      : cn("card-sheen glass", isUp ? "ring-gain/20" : "ring-loss/20"),
    onOpen &&
      (nested
        ? "veil-hover hover:scale-[1.01] active:scale-[0.995]"
        : cn(
            "veil-hover hover:scale-[1.01] active:scale-[0.995]",
            isUp ? "hover:ring-gain/40" : "hover:ring-loss/40"
          ))
  );
  if (onOpen) {
    return (
      <button type="button" onClick={onOpen} className={shellClass}>
        {body}
      </button>
    );
  }
  return <div className={shellClass}>{body}</div>;
}

function MorningStack({
  morning,
  onOpenPulse,
  className,
}: {
  morning: ReturnType<typeof buildMorningRead>;
  onOpenPulse?: (ticker?: string) => void;
  className?: string;
}) {
  const sunday = morning.sunday;
  const convictions = loadConvictionMap();
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {sunday ? (
        <Reading label="Sunday">
          {morning.sentence}
          {(sunday.best || sunday.worst) && (
            <div
              className={cn(
                "mt-4 grid grid-cols-1 gap-3",
                sunday.best && sunday.worst && "sm:grid-cols-2"
              )}
            >
              {sunday.best && (
                <DriverTile
                  nested
                  ticker={sunday.best.ticker}
                  primary={signedMovePct(sunday.best.pct)}
                  secondary="Biggest week move"
                  isUp={sunday.best.pct >= 0}
                  onOpen={
                    onOpenPulse ? () => onOpenPulse(sunday.best!.ticker) : undefined
                  }
                />
              )}
              {sunday.worst && (
                <DriverTile
                  nested
                  ticker={sunday.worst.ticker}
                  primary={signedMovePct(sunday.worst.pct)}
                  secondary="Biggest drop"
                  isUp={sunday.worst.pct >= 0}
                  onOpen={
                    onOpenPulse ? () => onOpenPulse(sunday.worst!.ticker) : undefined
                  }
                />
              )}
            </div>
          )}
        </Reading>
      ) : (
        <Reading>
          <p className="text-base font-medium leading-relaxed text-foreground">
            {morning.sentence}
          </p>
          {!morning.quiet && morning.drivers.length > 0 && (
            <div
              className={cn(
                "mt-4 grid grid-cols-1 gap-3",
                morning.drivers.length > 1 && "sm:grid-cols-2",
                morning.drivers.length > 2 && "lg:grid-cols-3"
              )}
            >
              {morning.drivers.map((d) => (
                <DriverTile
                  nested
                  key={d.ticker}
                  ticker={d.ticker}
                  primary={signedCurrency(d.dollar, 0)}
                  secondary={
                    d.share != null
                      ? `${Math.round(d.share * 100)}% of today's move`
                      : undefined
                  }
                  isUp={d.dollar >= 0}
                  onOpen={onOpenPulse ? () => onOpenPulse(d.ticker) : undefined}
                />
              ))}
            </div>
          )}
        </Reading>
      )}
      {morning.notices.length > 0 && (
        <div
          className={cn(
            "grid gap-4",
            morning.notices.length > 1 && "sm:grid-cols-2"
          )}
        >
          {morning.notices.map((notice) => (
            <Reading
              key={notice.id}
              label={notice.label}
              tone={notice.kind === "gap" ? "warn" : "neutral"}
              /*
               * The glyph names what the card is. `Sparkles` used to sit
               * here and was the wrong mark by a long way: it is the
               * universal "a model wrote this" badge, and these cards are
               * arithmetic on the reader's own holdings. A Pulse card is
               * the exception, and it takes Pulse's own icon so the glyph
               * and the eye both point at the same room.
               */
              icon={
                notice.kind === "gap" ? (
                  <AlertTriangle />
                ) : notice.source === "pulse" ? (
                  <Activity />
                ) : (
                  <Calculator />
                )
              }
              note={
                notice.source === "pulse" && notice.ticker ? (
                  <WhyThis
                    provenance={pulseProvenance({
                      ticker: notice.ticker,
                      hasOwnReason: Boolean(
                        convictions[notice.ticker.toUpperCase()]?.thesis?.trim()
                      ),
                    })}
                  />
                ) : null
              }
            >
              <p>
                <InsightText text={notice.text} />
              </p>
              {notice.ticker && onOpenPulse ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2 mt-3 text-muted-foreground hover:text-foreground"
                  onClick={() => onOpenPulse(notice.ticker)}
                >
                  Open Pulse on {cashtag(notice.ticker)}
                  <ArrowRight data-icon="inline-end" />
                </Button>
              ) : null}
            </Reading>
          ))}
        </div>
      )}
    </div>
  );
}

function MoverTile({
  ticker,
  mode,
  onOpen,
}: {
  ticker: TickerScore;
  mode: "win" | "loss" | "today-win" | "today-loss";
  onOpen: () => void;
}) {
  const lifetime = mode === "win" || mode === "loss";
  const isUp = mode === "win" || mode === "today-win";
  const pct = lifetime ? ticker.roiPct : ticker.todayPct;
  const dollars = lifetime ? ticker.roiDollar : ticker.todayDollar;
  const sheets = ticker.portfolios.filter(Boolean).join(", ");

  return (
    <button
      type="button"
      onClick={onOpen}
      title={sheets || undefined}
      className={cn(
        "veil-hover card-sheen glass group relative flex h-full w-full min-w-0 flex-col justify-center gap-1.5 overflow-hidden rounded-lg p-3 text-left ring-1 transition hover:scale-[1.01] sm:p-6",
        isUp ? "ring-gain/20 hover:ring-gain/40" : "ring-loss/20 hover:ring-loss/40"
      )}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          isUp ? "bg-gain" : "bg-loss"
        )}
        aria-hidden
      />
      {/*
        * Two spread rows, not two stacked columns — see AGENTS.md.
        *
        * As columns (ticker over price, percent over dollars) the two share
        * one width; the right was `shrink-0` and the left `flex-1 min-w-0`,
        * so the left always gave and the price was cut mid-number with
        * nothing to show for it. As rows each line spreads its own two
        * items and each sizes to its own content.
        *
        * The row is also sized to fit rather than relying on the wrap: on a
        * phone `p-3`, a `text-xs` chip and a `text-base` percent buy the
        * ~133px it needs. A minus sign is one more character, so `-2.32%`
        * costs 7px more than `9.23%` — at `text-lg` that one glyph was the
        * difference between a tidy grid and every red tile wrapping.
        *
        * The trend arrow is desktop-only: 20px on the tightest line for
        * information the tile already carries in the sign and the edge bar.
        */}
      <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
        <Badge
          variant="secondary"
          className="chip-hang h-6 font-heading text-xs font-semibold sm:text-sm"
        >
          {cashtag(ticker.ticker)}
        </Badge>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 font-mono text-base font-semibold tabular-nums sm:text-lg",
            tone(pct)
          )}
        >
          {isUp ? (
            <TrendingUp className="hidden size-4 shrink-0 sm:block" />
          ) : (
            <TrendingDown className="hidden size-4 shrink-0 sm:block" />
          )}
          {pct != null ? percent(pct, lifetime ? 1 : 2) : NO_VALUE}
        </span>
      </span>
      <span className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 font-mono text-sm tabular-nums">
        <span className="text-muted-foreground">{currency(ticker.price)}</span>
        <span className={cn(tone(dollars))}>{signedCurrency(dollars, 0)}</span>
      </span>
    </button>
  );
}

function PortfolioLane({
  sheet,
  maxValue,
  onOpen,
}: {
  sheet: SheetScore;
  maxValue: number;
  onOpen: () => void;
}) {
  const width =
    maxValue > 0 ? Math.max(10, (sheet.totalValue / maxValue) * 100) : 10;
  const hot = sheet.roiPct >= 0;
  const initial = sheet.portfolio.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "card-sheen glass-well group flex w-full flex-col gap-4 rounded-lg text-left ring-1 ring-foreground/20 transition hover:scale-[1.01] hover:bg-hover hover:ring-primary/25",
        NESTED_PAD
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted font-heading text-base font-semibold text-foreground"
            aria-hidden
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate font-heading text-base font-semibold text-foreground">
              {sheet.portfolio.name}
            </p>
            {/*
              * A `min-w-0` name column against a `shrink-0` total — the same
              * shape that was cutting Movers prices in half. At 320px the
              * column was down to 44px and `$14,500` is a single unbreakable
              * 55px token, so it hard-clipped with no ellipsis. The name
              * above truncates; this line only needed permission to break
              * inside that token as a last resort.
              */}
            <p className="mt-1 break-words text-sm text-muted-foreground">
              {plural(sheet.holdingCount, "holding")}
              {sheetCashBalance(sheet.portfolio) !== 0
                ? ` · ${currency(sheetCashBalance(sheet.portfolio), 0)} cash`
                : ""}
            </p>
          </div>
        </div>
        <p className="shrink-0 text-right font-mono text-lg font-bold tabular-nums text-foreground sm:text-xl">
          {currency(sheet.totalValue, 0)}
        </p>
      </div>

      <Progress
        value={width}
        className={cn(
          // bg-secondary matches this card's own bg-muted exactly, so the
          // track would be invisible against its own container — use the
          // darker bg-card token instead so the fill reads as "X% of a
          // whole," not a floating bar.
          "h-2 bg-card [&_[data-slot=progress-indicator]]:bg-primary",
          hot
            ? "[&_[data-slot=progress-indicator]]:bg-gain"
            : "[&_[data-slot=progress-indicator]]:bg-loss"
        )}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={sheet.roiPct >= 0 ? "good" : "bad"} className="font-mono">
          {percent(sheet.roiPct)} all time
        </Pill>
        {sheet.todayDollar !== 0 ? (
          <Pill
            tone={sheet.todayDollar >= 0 ? "good" : "bad"}
            className="font-mono"
          >
            {signedCurrency(sheet.todayDollar, 0)} today
          </Pill>
        ) : null}
      </div>
    </button>
  );
}

function OverviewYearChart({
  nav,
  liveNav,
  className,
}: {
  nav: ReturnType<typeof useBookNavHistory>;
  liveNav: number;
  className?: string;
}) {
  return (
    <WidgetErrorBoundary name="Year chart">
      <BookNavChart
        points={nav.points}
        assumed={nav.assumed}
        anchored={nav.anchored}
        anchor={nav.anchor}
        liveNav={liveNav}
        loading={nav.loading}
        firstRealDate={nav.firstRealDate}
        onDiscardAssumed={nav.discardAssumed}
        onRestoreAssumed={nav.restoreAssumed}
        onApplyAnchor={nav.applyAnchor}
        onClearAnchor={nav.clearAnchor}
        className={className}
      />
    </WidgetErrorBoundary>
  );
}

export const OverviewDashboard = memo(function OverviewDashboard({
  model,
  onOpenSheet,
  activeAlerts = EMPTY_ALERTS,
  onOpenPulse,
  marketState = null,
  onAddHolding,
  onImportScreenshot,
  onImportCsv,
  onPasteHoldings,
  onOpenCash,
  onOpenAlerts,
  showCommunities = false,
  homework = false,
  homeworkCash,
  inviteNudge = false,
  onInvitePartner,
  onDismissInvite,
}: Props) {
  const {
    totals,
    sheets,
    winners,
    losers,
    todayWinners,
    todayLosers,
    tickers,
  } = model;
  const maxSheet = Math.max(
    1,
    ...sheets.map((s) => finiteNumber(s.totalValue))
  );
  const [visitDiff, setVisitDiff] = useState<VisitDiff | null>(null);
  const [lookIndex, setLookIndex] = useState(0);
  const [notes, setNotes] = useState<HomePulseNote[]>([]);
  const [shown, setShown] = useState<Set<string>>(() => new Set());
  const [sittingLock, setSittingLock] = useState<{
    noticeId: string | null;
    gapId: string | null;
  }>({ noticeId: null, gapId: null });
  const [moverHorizon, setMoverHorizon] = useState<"today" | "lifetime">(
    "today"
  );
  const kind = sessionKind(marketState);

  const tickerKey = tickers.map((t) => t.ticker).join(",");
  const heldTickers = useMemo(
    () => tickers.map((t) => t.ticker),
    [tickers]
  );
  const navPositions = useMemo(
    () => tickers.map((t) => ({ ticker: t.ticker, shares: t.shares })),
    [tickers]
  );

  useEffect(() => {
    if (!model.tickers.length || model.totals.todayPct == null) return;
    const best = [...model.tickers].sort(
      (a, b) => (b.todayPct ?? -99) - (a.todayPct ?? -99)
    )[0];
    const worst = [...model.tickers].sort(
      (a, b) => (a.todayPct ?? 99) - (b.todayPct ?? 99)
    )[0];
    recordWeekMark({
      totalValue: model.totals.totalValue,
      todayDollar: model.totals.todayDollar,
      bestTicker: best?.ticker ?? null,
      bestPct: best?.todayPct ?? null,
      worstTicker: worst?.ticker ?? null,
      worstPct: worst?.todayPct ?? null,
    });
  }, [tickerKey, model.totals.totalValue, model.totals.todayDollar, model.totals.todayPct, model.tickers]);

  useLayoutEffect(() => {
    if (!model.tickers.length) return;
    const prev = loadVisitSnapshot();
    setVisitDiff(prev ? diffSinceLastVisit(prev, model) : null);
    // Snapshot is written when you leave, not on every Overview paint
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerKey]);

  useEffect(() => {
    function persist() {
      if (!model.tickers.length) return;
      saveVisitSnapshot(captureVisitSnapshot(model));
    }
    function onVis() {
      if (document.visibilityState === "hidden") persist();
    }
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      persist();
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerKey, model.totals.totalValue, model.totals.cash]);

  useLayoutEffect(() => {
    const look = bumpInsightLook();
    setLookIndex(look.n);
    setSittingLock({ noticeId: look.noticeId, gapId: look.gapId });
    setShown(loadShownInsights());
  }, []);

  useLayoutEffect(() => {
    setNotes(loadHomePulseNotes(tickers.map((t) => t.ticker)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerKey]);

  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible") {
        const look = bumpInsightLook();
        setLookIndex(look.n);
        setSittingLock({ noticeId: look.noticeId, gapId: look.gapId });
        setShown(loadShownInsights());
      }
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const morning = useMemo(
    () =>
      buildMorningRead(model, visitDiff, kind, {
        lookIndex,
        notes,
        shown,
        sittingLock,
      }),
    [model, visitDiff, kind, lookIndex, notes, shown, sittingLock]
  );

  const noticeIds = morning.notices.map((n) => n.id).join(",");
  useEffect(() => {
    const noticeId =
      morning.notices.find((n) => n.kind === "notice")?.id ?? null;
    const gapId = morning.notices.find((n) => n.kind === "gap")?.id ?? null;
    lockInsightLook(noticeId, gapId);
    setSittingLock({ noticeId, gapId });
    rememberShownInsights(morning.notices.map((n) => n.fingerprint));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookIndex, noticeIds]);

  const nav = useBookNavHistory({
    liveNav: totals.totalValue,
    cash: totals.cash,
    positions: navPositions,
  });

  const movers = useMemo(() => {
    if (moverHorizon === "today") {
      return [
        ...todayWinners.map((t) => ({ t, mode: "today-win" as const })),
        ...todayLosers.map((t) => ({ t, mode: "today-loss" as const })),
      ]
        .sort(
          (a, b) => Math.abs(b.t.todayPct ?? 0) - Math.abs(a.t.todayPct ?? 0)
        )
        .slice(0, MOVERS_SHOWN);
    }
    return [
      ...winners.map((t) => ({ t, mode: "win" as const })),
      ...losers.map((t) => ({ t, mode: "loss" as const })),
    ]
      .sort((a, b) => Math.abs(b.t.roiPct) - Math.abs(a.t.roiPct))
      .slice(0, MOVERS_SHOWN);
  }, [moverHorizon, todayWinners, todayLosers, winners, losers]);

  const multiSheet = sheets.length > 1;

  function openFirstPortfolio(t: TickerScore) {
    const id = t.portfolioIds[0];
    if (id) onOpenSheet(id);
  }

  const bookIsEmpty = model.tickers.length === 0;
  const painted = nav.points.filter((p) => Number.isFinite(p.nav));
  const startNav = painted[0]?.nav;
  const endNav = painted[painted.length - 1]?.nav;
  const yearPct =
    startNav != null && startNav > 0 && endNav != null
      ? (endNav - startNav) / startNav
      : null;
  const yearDollar =
    startNav != null && endNav != null ? endNav - startNav : null;

  /*
   * On an empty portfolio only. It moved to Lab's Trends tab for a
   * populated one.
   *
   * Home answers one question, which is how the names you typed in are
   * doing, and every panel on it earns its place by being about those
   * names. The market reading is not: it is the same three gauges for
   * everybody who signs in, so on a page about your portfolio it reads as
   * a widget that happened to be available. A reader with holdings met a
   * scoreboard, a briefing, a market reading, a year chart and a movers
   * grid, and said they could not tell what the page wanted from them.
   * Removing the one panel that is not about their money did more for that
   * than any label would have.
   *
   * An empty portfolio is the opposite case. There are no names to be
   * about, so it is the only thing on the screen with a number in it, and
   * it gives somebody who has not typed anything in yet a reason to look
   * at the page at all.
   */
  const marketReading = (
    <WidgetErrorBoundary name="Market reading">
      <MarketSentimentWidget />
    </WidgetErrorBoundary>
  );

  if (bookIsEmpty) {
    return (
      <div className="flex flex-col gap-6">
        <EmptyBook
          onAddHolding={onAddHolding}
          onImportScreenshot={onImportScreenshot}
          onImportCsv={onImportCsv}
          onPasteHoldings={onPasteHoldings}
          homework={homework}
          homeworkCash={homeworkCash}
        />
        {marketReading}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {inviteNudge && onInvitePartner && (
        <Panel className="overview-fade">
          <PanelHeader
            title="Invite someone who shares this portfolio"
            subtitle="You will be asked once. Invite is always there, next to Add holding."
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={onInvitePartner}>
              Invite
            </Button>
            {onDismissInvite && (
              <Button type="button" variant="outline" onClick={onDismissInvite}>
                Not now
              </Button>
            )}
          </div>
        </Panel>
      )}
      <div className="overview-fade flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground">
            {morning.moveLabel}
          </h1>
          {/*
            * One line, and it is a reading rather than a pitch. It used to
            * carry a second sentence about what the app gives you over your
            * broker, which is a thing to say once on the way in, not on
            * every visit forever.
            */}
          <p className="text-sm text-muted-foreground">
            {totals.positionCount === 1
              ? "One holding, at today's prices."
              : `${totals.positionCount} holdings, at today's prices.`}
          </p>
          <OvernightNote />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            title={sessionLabel(marketState)}
            className="h-8 gap-1.5 px-2.5"
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                kind === "open"
                  ? "bg-gain"
                  : kind === "pre" || kind === "ah"
                    ? "bg-primary"
                    : "bg-muted-foreground"
              )}
              aria-hidden
            />
            {sessionLabel(marketState)}
          </Badge>
          {onAddHolding && (
            <Button
              type="button"
              onClick={onAddHolding}
            >
              <Plus data-icon="inline-start" />
              Add a holding
            </Button>
          )}
        </div>
      </div>

      <Scoreboard className="overview-fade">
        <Score
          label="Portfolio"
          value={currency(totals.totalValue, 0)}
          sub={plural(totals.sheetCount, "portfolio")}
          valueClassName="text-primary"
        />
        <Score
          label={morning.moveLabel}
          value={signedCurrency(totals.todayDollar, 0)}
          sub={
            totals.todayPct != null ? (
              <DeltaBadge value={totals.todayDollar}>
                {percent(totals.todayPct)}
              </DeltaBadge>
            ) : (
              NO_VALUE
            )
          }
          valueClassName={tone(totals.todayDollar)}
        />
        {/*
          * The explainer is on this cell because this is the cell people go
          * looking for when they want "since I bought", and it is already
          * the answer: it is measured against the average price you paid,
          * which is your own buy price blended. What it is not is a period
          * starting on a date, and a reader spent a whole session hunting
          * for a period picker that is never going to exist. Saying so here
          * costs one info dot on the figure they were already reading.
          */}
        <Score
          label="All time"
          explain="Your value today against what you paid for these shares on average. There is no date in it: Upside Lab does not keep the day you bought, so nothing here can draw a line starting from that day."
          value={signedCurrency(totals.roiDollar, 0)}
          sub={
            <DeltaBadge value={totals.roiDollar}>
              {percent(totals.roiPct)}
            </DeltaBadge>
          }
          valueClassName={tone(totals.roiDollar)}
        />
        <Score
          label="Cash"
          value={currency(totals.cash, 0)}
          sub={totals.cash < 0 ? "Borrowed" : undefined}
          valueClassName={totals.cash < 0 ? "text-loss" : undefined}
          subClassName={totals.cash < 0 ? "text-loss" : undefined}
        />
      </Scoreboard>

      <MorningStack
        className="overview-fade"
        morning={morning}
        onOpenPulse={onOpenPulse}
      />

      <Panel className="overview-fade">
        <PanelHeader
          title="This year"
          actions={
            yearPct != null && yearDollar != null ? (
              <p
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  tone(yearPct)
                )}
              >
                {signedPercent(yearPct)}
                <span className="font-medium text-muted-foreground">
                  {" "}
                  · {signedCurrency(yearDollar, 0)}
                </span>
              </p>
            ) : null
          }
        />
        <OverviewYearChart
          nav={nav}
          liveNav={totals.totalValue}
        />
      </Panel>

      <CashAlertCard
        className="md:hidden"
        cash={totals.cash}
        alerts={activeAlerts}
        onOpenCash={onOpenCash}
        onOpenAlerts={onOpenAlerts}
      />

      <Panel className="overview-fade">
        <PanelHeader
          title="Movers"
          actions={
            <Segmented
              options={[
                { id: "today", label: morning.moveLabel },
                { id: "lifetime", label: "All time" },
              ]}
              value={moverHorizon}
              onChange={setMoverHorizon}
              ariaLabel="Mover time range"
            />
          }
        />
        {/*
          * Two columns on a phone as well, not a six-tall stack.
          *
          * Movers exists to be compared -- what went up against what went
          * down -- and a single column turns that into a scroll where only
          * two are ever on screen. The suggested fix was a horizontal snap
          * rail, which trades a scrolling problem for a discoverability
          * one: it hides half your movers behind a gesture with no
          * affordance.
          *
          * Verified rather than assumed: rendered at 360, 390 and 430 px,
          * the tile lands at 142/157/177 px wide and six fit in three tidy
          * rows.
          *
          * "With nothing clipped" is what this used to claim, and it was
          * measured — but on the tile's old two-column layout and against
          * whatever prices were on screen that day. It stopped being true
          * as soon as a four-figure price met a five-character percent, and
          * nothing re-checked it. The tile is two rows now precisely so the
          * claim cannot rot again; the note lives on `MoverTile`.
          */}
        {movers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Waiting on prices.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {movers.map(({ t, mode }) => (
              <MoverTile
                key={`${mode}-${t.ticker}`}
                ticker={t}
                mode={mode}
                onOpen={() => openFirstPortfolio(t)}
              />
            ))}
          </div>
        )}
      </Panel>

      {multiSheet && (
        <Panel className="overview-fade">
          <PanelHeader title="Your portfolios" />
          <div className="flex flex-col gap-6">
            {sheets.map((sheet) => (
              <PortfolioLane
                key={sheet.portfolio.id}
                sheet={sheet}
                maxValue={maxSheet}
                onOpen={() => onOpenSheet(sheet.portfolio.id)}
              />
            ))}
          </div>
        </Panel>
      )}

      <WidgetErrorBoundary name="Watchlist">
      <Panel className="overview-fade">
        <WatchlistStrip
          heldTickers={heldTickers}
          onOpenPulse={onOpenPulse}
        />
      </Panel>
      </WidgetErrorBoundary>

      {showCommunities ? (
        <WidgetErrorBoundary name="Around Upside Lab">
          <HomeWorld />
        </WidgetErrorBoundary>
      ) : null}
    </div>
  );
});
