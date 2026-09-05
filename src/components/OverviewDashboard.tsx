"use client";

import { BelowFold } from "@/components/BelowFold";
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
  Scoreboard,
  Segmented,
  MicroLabel,
  InfoTip,
  SCORE_CELL,
} from "@/components/ui/Panel";
import { KIND_GLYPH, TONE_GLYPH, TONE_RING } from "@/components/AlertCards";
import type { MarginToneName } from "@/lib/margin-health";
import { NO_VALUE, cashtag, cn, currency, percent, plural, signedCurrency, signedPercent, signedTone } from "@/lib/format";
import {
  portfolioDayLine,
  typicalMoveForPortfolio,
} from "@/lib/typical-move";
import { RecallCardPanel } from "@/components/RecallCardPanel";
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
  Landmark,
  Camera,
  FileUp,
  PencilLine,
  Plus,
  Search,
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

export type LabDeepLink = "seasonality" | "lookup";

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
  /*
   * Three equal ways in, each with its hint on the screen.
   *
   * The paste box used to be the primary path, five lines of prose then a
   * monospace textarea whose example was two tickers nobody outside this
   * family has heard of, with the three routes a beginner can actually use
   * demoted to small outline buttons under a micro-label and their
   * explanations hidden in `title` attributes, which a phone never shows.
   * Typing a company name comes first now, and the paste box is a quiet
   * fourth row for somebody who already has a list.
   */
  const routes = (
    homework
      ? [
          {
            key: "manual",
            label: "Buy a company with paper money",
            hint: "Same starting cash as the rest of the class.",
            onClick: onAddHolding,
            icon: <Plus />,
          },
        ]
      : [
          {
            key: "manual",
            label: "Type a company name",
            hint: "Search for it, then say how many shares and what you paid.",
            onClick: onAddHolding,
            icon: <Search />,
          },
          {
            key: "screenshot",
            label: "Photo of your broker screen",
            hint: "The holdings page, showing shares and cost. Not a watchlist.",
            onClick: onImportScreenshot ? screenshot.open : undefined,
            icon: <Camera />,
          },
          {
            key: "csv",
            label: "Upload a CSV",
            hint: "Ticker, shares, buy price. Most brokers export one.",
            onClick: onImportCsv,
            icon: <FileUp />,
          },
        ]
  ).filter((r) => r.onClick);

  function submitPaste() {
    const parsed = parseHoldingsPaste(paste);
    if (parsed.rows.length === 0) {
      setPasteErr(
        parsed.skipped[0]?.reason ??
          "Each line needs to look like AAPL 10 150.00"
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
    : "Add what you own and Upside Lab tells you, in plain words, what it did each day and whether anything actually changed at those companies. Nobody else sees this unless you invite them.";

  return (
    <Panel className="overview-fade">
      <PanelHeader hero title={emptyTitle} subtitle={emptySubtitle} />

      {homework && routes[0] ? (
        <Button type="button" onClick={routes[0].onClick}>
          {routes[0].label}
        </Button>
      ) : null}

      {!homework && routes.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {routes.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={r.onClick}
              className={cn(
                "veil-hover card-sheen glass-well flex min-w-0 flex-col gap-2 rounded-lg p-4 text-left ring-1 ring-foreground/12 transition hover:scale-[1.01] hover:ring-primary/25"
              )}
            >
              <span
                className="flex size-5 text-primary [&>svg]:size-5"
                aria-hidden
              >
                {r.icon}
              </span>
              <span className="font-heading text-base font-semibold text-foreground">
                {r.label}
              </span>
              <span className="text-sm leading-relaxed text-muted-foreground">
                {r.hint}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {!homework && onPasteHoldings && (
        <details className="group border-t border-border pt-4">
          <summary className="cursor-pointer list-none text-sm text-muted-foreground hover:text-foreground">
            Or paste a list you already have
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <Textarea
              aria-label="Paste what you own, one holding per line"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={4}
              placeholder={"AAPL 10 150.00\nVOO 5 400.00"}
              className="min-h-24 font-mono"
            />
            {pasteErr && <p className="text-sm text-loss">{pasteErr}</p>}
            <Button
              type="button"
              variant="outline"
              onClick={submitPaste}
              disabled={!paste.trim()}
            >
              Add these holdings
            </Button>
          </div>
        </details>
      )}
      {onImportScreenshot && !homework ? (
        <input {...screenshotPickerInputProps(screenshot)} />
      ) : null}
    </Panel>
  );
}

/**
 * A move too small to print as a whole dollar, said in words.
 *
 * `signedCurrency` answers "$0" for anything that rounds away, which is
 * true and reads on a tile as a figure that failed to arrive. "Under $1"
 * says the same thing in the app's own voice, and the percentage on the
 * line above already carries the direction.
 */
function tileMoney(dollars: number): string {
  if (Math.abs(dollars) < 0.5) return "Under $1";
  return signedCurrency(dollars, 0);
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

/**
 * The row under the hero, spent on what needs doing rather than on
 * restating the portfolio.
 *
 * It used to hold two tiles, All time and Cash, then All time and This
 * year: figures the hero card already sets the reader up to read and
 * which never ask anything of them. The same list that fills the "Worth
 * a look" room and lights the news dot on the dock was reaching Home
 * only through a toast and, on a phone, the borrowed-money card. So a
 * results day this week, one company grown into most of the portfolio
 * and a call strike within reach now stand where those tiles were, each
 * with the one line that says why and a way into Pulse on that name.
 *
 * Borrowed money is deliberately not in it: the hero says so in its own
 * cash line, the phone has `CashAlertCard` with the margin arithmetic,
 * and the same fact three times on one screen is what taught readers to
 * swipe past the red one. Three at most, because a row is a glance and
 * the room further along holds the rest. The cushion line is preferred
 * over the detail because it was written to fit under a title; the
 * detail's first sentence stands in when there is none.
 */
const HOME_ALERTS_SHOWN = 3;

/**
 * One standing figure in the hero strip.
 *
 * On a phone it is a row: the label in a fixed column on the left and the
 * figure starting at one shared edge beside it, so three rows read as a
 * small table and everything in the card stays left-aligned with the
 * sentence above. Two earlier shapes were measured at 390px and taken
 * out: two stacked columns broke "+$26,454 · 93.5%" over two lines, and a
 * spread row (label left, figure right) left the card ragged, half of it
 * on one edge and half on the other. The label column is 5.5rem because
 * "THIS YEAR" in the 11px mono label face is about 62px and "ALL TIME"
 * with its info dot about 76px; at 4.5rem both broke onto two lines.
 * From `sm` the three stand side by side as label over figure.
 */
const FACT_ROW =
  "grid min-w-0 grid-cols-[5.5rem_1fr] items-baseline gap-x-3 sm:block";
const FACT_VALUE =
  "min-w-0 font-mono text-sm font-semibold tabular-nums sm:mt-1 sm:text-base";

function firstSentence(text: string): string {
  const m = /^(.*?[.!?])(\s|$)/.exec(text);
  return m ? m[1] : text;
}

function HomeAlertRow({
  alerts,
  onOpenPulse,
  onOpenAlerts,
  className,
}: {
  alerts: UpsideAlert[];
  onOpenPulse?: (ticker: string) => void;
  onOpenAlerts?: () => void;
  className?: string;
}) {
  const shown = alerts
    .filter((a) => a.kind !== "margin")
    .slice(0, HOME_ALERTS_SHOWN);
  if (shown.length === 0) return null;
  const more = alerts.filter((a) => a.kind !== "margin").length - shown.length;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Scoreboard cols={3} mobileCols={1}>
        {shown.map((alert) => {
          const tone: MarginToneName = alert.tone ?? "neutral";
          const Glyph =
            tone === "neutral"
              ? (KIND_GLYPH[alert.kind] ?? Landmark)
              : AlertTriangle;
          const line = alert.cushion ?? firstSentence(alert.detail);
          const open = alert.ticker
            ? () => onOpenPulse?.(alert.ticker as string)
            : onOpenAlerts;
          return (
            <article
              key={alert.id}
              className={cn(SCORE_CELL, "ring-1", TONE_RING[tone])}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg",
                    TONE_GLYPH[tone]
                  )}
                >
                  <Glyph className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug text-foreground">
                    {alert.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {line}
                  </p>
                </div>
              </div>
              {open ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-ml-2 mt-auto self-start pt-3 text-muted-foreground hover:text-foreground"
                  onClick={open}
                >
                  {alert.ticker
                    ? `Open Pulse on ${cashtag(alert.ticker)}`
                    : "Open Worth a look"}
                  <ArrowRight data-icon="inline-end" />
                </Button>
              ) : null}
            </article>
          );
        })}
      </Scoreboard>
      {more > 0 && onOpenAlerts ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start text-muted-foreground hover:text-foreground"
          onClick={onOpenAlerts}
        >
          {more === 1 ? "One more worth a look" : `${more} more worth a look`}
          <ArrowRight data-icon="inline-end" />
        </Button>
      ) : null}
    </div>
  );
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
  /*
   * Friday's numbers are captioned as Friday's.
   *
   * On a Saturday the headline already reads "Friday" and the sentence says
   * "These are Friday's numbers", while every driver tile under it still
   * said "of today's move" about a market that has been shut for a day.
   */
  const moveWord = morning.moveLabel === "Friday" ? "Friday's move" : "today's move";
  /*
   * "Biggest rise this week" only when the week's own marks supplied the
   * figure. On a new device there are no marks, the recap falls back to the
   * live day, and that day is Friday: one Friday's move labelled as the
   * week's result is a figure this app states as fact and never measured.
   */
  const weekWord = sunday?.fromWeek ? "this week" : "on Friday";
  const noticeList =
    morning.notices.length === 0 ? null : (
      <ul className="flex flex-col gap-4">
        {morning.notices.map((notice) => (
          <li
            key={notice.id}
            className="flex gap-3 border-t border-border pt-4"
          >
            {/*
              * The glyph names what the note is. `Sparkles` used to
              * sit here and was the wrong mark by a long way: it is
              * the universal "a model wrote this" badge, and these
              * are arithmetic on the reader's own holdings. A Pulse
              * note takes Pulse's own icon so the glyph and the eye
              * point at the same room, and a note the reader has not
              * written yet takes a pencil: it is a to-do, not a
              * hazard, and the warning triangle is kept for money at
              * risk.
              */}
            <span
              className="mt-0.5 flex size-4 shrink-0 text-muted-foreground [&>svg]:size-4"
              aria-hidden
            >
              {notice.ask === "write-thesis" ? (
                <PencilLine />
              ) : notice.kind === "gap" ? (
                <AlertTriangle />
              ) : notice.source === "pulse" ? (
                <Activity />
              ) : (
                <Calculator />
              )}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex items-center gap-2">
                <MicroLabel>{notice.label}</MicroLabel>
                {notice.source === "pulse" && notice.ticker ? (
                  <WhyThis
                    provenance={pulseProvenance({
                      ticker: notice.ticker,
                      hasOwnReason: Boolean(
                        convictions[
                          notice.ticker.toUpperCase()
                        ]?.thesis?.trim()
                      ),
                    })}
                  />
                ) : null}
              </div>
              <p className="text-sm leading-relaxed">
                <InsightText text={notice.text} />
              </p>
              {notice.ticker && onOpenPulse ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2 mt-1 self-start text-muted-foreground hover:text-foreground"
                  onClick={() => onOpenPulse(notice.ticker)}
                >
                  {notice.ask === "write-thesis"
                    ? `Write why you own ${cashtag(notice.ticker)}`
                    : `Open Pulse on ${cashtag(notice.ticker)}`}
                  <ArrowRight data-icon="inline-end" />
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    );
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
                  secondary={`Biggest rise ${weekWord}`}
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
                  secondary={`Biggest drop ${weekWord}`}
                  isUp={sunday.worst.pct >= 0}
                  onOpen={
                    onOpenPulse ? () => onOpenPulse(sunday.worst!.ticker) : undefined
                  }
                />
              )}
            </div>
          )}
          {noticeList}
        </Reading>
      ) : (
        /*
         * One Reading, not three.
         *
         * The briefing used to be a card holding the day's sentence and,
         * under it, a two-column grid of two more cards, each with its own
         * ring, glyph and label. On a laptop the first was 1,150px wide
         * with nine words in it; on a phone the three cost about 600px for
         * forty words. It read as three widgets rather than as one person
         * talking, so it is one card now: the day's sentence leads, and the
         * notes are a short list under it with an inline link each.
         */
        <Reading className="flex flex-col gap-4">
          <p className="text-base font-medium leading-relaxed text-foreground">
            {morning.sentence}
          </p>
          {!morning.quiet && morning.drivers.length > 0 && (
            <div
              className={cn(
                "grid grid-cols-1 gap-3",
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
                      ? `${Math.round(d.share * 100)}% of ${moveWord}`
                      : undefined
                  }
                  isUp={d.dollar >= 0}
                  onOpen={onOpenPulse ? () => onOpenPulse(d.ticker) : undefined}
                />
              ))}
            </div>
          )}
          {noticeList}
        </Reading>
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
        <span className={cn(tone(dollars))}>{tileMoney(dollars)}</span>
      </span>
    </button>
  );
}

function PortfolioLane({
  sheet,
  maxValue,
  allValue,
  onOpen,
}: {
  sheet: SheetScore;
  maxValue: number;
  /** Everything the reader owns, so the bar can say what share this is. */
  allValue: number;
  onOpen: () => void;
}) {
  const width =
    maxValue > 0 ? Math.max(10, (sheet.totalValue / maxValue) * 100) : 10;
  const share = allValue > 0 ? sheet.totalValue / allValue : null;
  const shareOfAll =
    share == null
      ? null
      : share < 0.005
        ? "Less than 1%"
        : percent(share, 0);
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

      {/*
        * The bar is size, and it says so.
        *
        * It used to be green or red by gain, sitting directly above a pill
        * reading "70.8% all time", so the smallest portfolio in the
        * household wore the shortest bar over the biggest percentage and
        * the two contradicted each other. The length is a share of the
        * largest portfolio, the fill is neutral, and the caption under it
        * says which. Gain and loss colour belongs to the pills.
        */}
      <div className="flex flex-col gap-1.5">
        <Progress
          value={width}
          className={cn(
            // bg-secondary matches this card's own bg-muted exactly, so the
            // track would be invisible against its own container — use the
            // darker bg-card token instead so the fill reads as "X% of a
            // whole," not a floating bar.
            "h-2 bg-card [&_[data-slot=progress-indicator]]:bg-foreground/40"
          )}
        />
        <p className="text-sm text-muted-foreground">
          {shareOfAll != null
            ? `${shareOfAll} of everything you own`
            : "Size against your largest portfolio"}
        </p>
      </div>

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

  /*
   * The briefing's own tiles are not repeated here.
   *
   * On a day with a real move the briefing draws up to three tiles naming
   * the companies that did it, and Movers 200px below drew the same
   * companies again in the same order. So the day list drops whatever the
   * briefing already showed. All time is a different question and keeps
   * every holding.
   */
  const driverTickers = useMemo(
    () =>
      new Set(
        // Only the tiles the briefing actually drew. On a quiet day it
        // renders none, and hiding them here would take companies off the
        // page that nothing else had named.
        morning.quiet ? [] : morning.drivers.map((d) => d.ticker)
      ),
    [morning.drivers, morning.quiet]
  );

  const movers = useMemo(() => {
    if (moverHorizon === "today") {
      return [
        ...todayWinners.map((t) => ({ t, mode: "today-win" as const })),
        ...todayLosers.map((t) => ({ t, mode: "today-loss" as const })),
      ]
        .filter((x) => !driverTickers.has(x.t.ticker))
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
  }, [moverHorizon, todayWinners, todayLosers, winners, losers, driverTickers]);

  /*
   * A heading that promises a selection has to be one. Six tiles for a
   * six-company portfolio is every holding, sorted, and calling that
   * "Movers" is the panel overstating what it did.
   */
  const moversTitle =
    movers.length > 0 && movers.length >= tickers.length
      ? moverHorizon === "today"
        ? `Every holding ${morning.moveLabel === "Friday" ? "on Friday" : "today"}`
        : "Every holding, all time"
      : "Movers";

  const multiSheet = sheets.length > 1;

  function openFirstPortfolio(t: TickerScore) {
    const id = t.portfolioIds[0];
    if (id) onOpenSheet(id);
  }

  const bookIsEmpty = model.tickers.length === 0;

  /*
   * An ordinary day for this reader, from the price history each quote
   * already carries. `typicalMoveForPortfolio` rebuilds the portfolio's own
   * value day by day from the shares held today, so the answer describes
   * this portfolio through the past rather than the portfolio as it was;
   * that is the same assumption the year chart states out loud. It returns
   * null when the history is too short, and a null says nothing at all
   * rather than something vague.
   *
   * The dollars come off the stocks, never the total: cash does not move,
   * and `todayPct` is already the value-weighted move of the holdings, so
   * pairing it with the total would print a bigger ordinary day than any
   * that ever happened.
   */
  const typical = useMemo(
    () =>
      typicalMoveForPortfolio(
        tickers.map((t) => ({
          shares: t.shares,
          // `dailyCloses`, never `sparkline`. The sparkline is a drawing:
          // downsampled, so two neighbours are not two consecutive days,
          // and a sine wave outright when a provider had no history. A
          // median off it is a fact about the drawing, printed here as
          // "your portfolio moves about $229 on an ordinary day".
          closes: t.dailyCloses ?? [],
        }))
      ),
    [tickers]
  );
  const ordinaryDayLine = portfolioDayLine(
    totals.todayDollar,
    totals.todayPct,
    totals.equityValue,
    typical,
    (n) => currency(n, 0)
  );

  /*
   * Cash says what share of everything it is, because a cash figure with
   * nothing beside it teaches nobody whether it is a lot. Borrowed money
   * says so in the label: the size of it, and what it means, is the Cash
   * card's own job further down the page.
   */
  const cashShare =
    totals.totalValue > 0 ? Math.abs(totals.cash) / totals.totalValue : null;
  const cashShareWords =
    cashShare == null
      ? null
      : cashShare < 0.005
        ? "less than 1% of everything"
        : `${percent(cashShare, 0)} of everything`;

  /** Friday's prices are captioned as Friday's, on a Saturday. */
  const priceWord = morning.moveLabel === "Friday" ? "Friday's" : "today's";

  const marketHoldings = useMemo(
    () =>
      tickers.map((t) => ({ ticker: cashtag(t.ticker), todayPct: t.todayPct })),
    [tickers]
  );

  /*
   * One question a day, built from what this reader actually holds. It only
   * appears once there is enough to ask an honest question about.
   */
  const recallInput = useMemo(() => {
    if (tickers.length < 2 || totals.totalValue <= 0) return null;
    /*
     * Everything in the deck is measured against everything you own, so a
     * figure in an answer can be checked against the hero above it. That
     * takes one adjustment: the day's move and an ordinary day are both
     * worked out from the stocks, and cash does not move, so both are
     * scaled onto the same total. Scaling both by the same factor leaves
     * the "was today ordinary" ratio exactly as it was, and makes the
     * dollars come out at the figure the hero already printed.
     */
    const stocksShare =
      totals.totalValue > 0 ? totals.equityValue / totals.totalValue : 1;
    return {
      holdings: tickers.map((t) => ({
        ticker: t.ticker,
        label: cashtag(t.ticker),
        shares: t.shares,
        buyPrice: t.shares > 0 ? t.buyValue / t.shares : 0,
        price: t.price,
        value: t.currentValue,
        todayPct: t.todayPct,
      })),
      totalValue: totals.totalValue,
      cash: totals.cash,
      todayPct:
        totals.todayPct != null ? totals.todayPct * stocksShare : null,
      typical: typical
        ? { ...typical, typicalPct: typical.typicalPct * stocksShare }
        : null,
      money: (n: number) => currency(n, 0),
      /*
       * A whole percent for a share of the portfolio, one decimal for a
       * day's move. "37% of your portfolio" is how a person says it, and
       * "0%" for a day that moved three tenths would be a figure rounded
       * away rather than stated.
       */
      percent: (n: number) => percent(n, Math.abs(n) < 0.05 ? 1 : 0),
    };
  }, [
    tickers,
    totals.totalValue,
    totals.equityValue,
    totals.cash,
    totals.todayPct,
    typical,
  ]);
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
   * Home leads with your own numbers and then says what the market they
   * sit in is doing.
   *
   * This panel used to be here, then moved to Lab's Trends tab on the
   * argument that every panel on Home should be about the names you typed
   * in, and the market reading is the same three gauges for everybody who
   * signs in. That is true and it is not the whole of it. The first
   * question a reader has after "my portfolio is down $2,000" is whether
   * that is their names or the whole market, and Home had no answer to it
   * anywhere on the page. So it sits directly under the scoreboard, where
   * it reads as context for the figure above it rather than as a widget
   * that happened to be available, and above the briefing, which is about
   * the names.
   *
   * It is drawn once, not twice: Lab's Trends tab keeps the trend lines
   * for the names in the portfolio and no longer repeats this card.
   *
   * An empty portfolio keeps it for the older reason. There are no names
   * to be about, so it is the only thing on the screen with a number in
   * it, and it gives somebody who has not typed anything in yet a reason
   * to look at the page at all.
   */
  const marketReading = (
    <WidgetErrorBoundary name="Market reading">
      <MarketSentimentWidget
        yoursPct={totals.todayPct}
        holdings={marketHoldings}
      />
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
              ? `One holding, at ${priceWord} prices.`
              : `${totals.positionCount} holdings, at ${priceWord} prices.`}
          </p>
          <OvernightNote />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/*
            * No badge until the market has answered.
            *
            * `sessionLabel` falls back to a word for an unknown state, and
            * a dotted chip reading "Session unknown" beside a reader's own
            * money reads as an error about their account rather than as
            * "the exchange has not said yet". Nothing is the honest shape
            * for a fact we do not have.
            */}
          {kind !== "unknown" && (
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
          )}
          {/*
            * One spelling of this button, everywhere, and it is `outline`
            * on Home.
            *
            * A reader with eight holdings adds one a few times a year; what
            * they do every day is read what happened and open Pulse. The
            * page's one accent colour was being spent on the rarest task on
            * the screen.
            */}
          {onAddHolding && (
            <Button type="button" variant="outline" onClick={onAddHolding}>
              <Plus data-icon="inline-start" />
              Add holding
            </Button>
          )}
        </div>
      </div>

      {/*
        * The value is the hero, and the two cells under it are not its
        * equals.
        *
        * This was four identical tiles, which gave the cash figure exactly
        * the same weight as what everything is worth and put the label
        * "Portfolio" over the sub-line "2 portfolios", a contradiction on
        * the first thing a returning reader looks at. The one number they
        * came for now spans the row with the day's move on the same line.
        *
        * What sat under it went through two shapes before this one: All
        * time and Cash as two tiles, then All time and This year. Each
        * was a row of the first screen spent restating the portfolio at
        * the hero's own weight. The standing figures are a strip at the
        * foot of the hero card now, and the row is the reader's own
        * alerts (see `HomeAlertRow`).
        */}
      <div className="overview-fade flex flex-col gap-4">
        <div className="card-sheen glass flex min-w-0 flex-col rounded-xl p-4 ring-1 ring-foreground/20 sm:p-6">
          <MicroLabel>Everything you own</MicroLabel>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-2">
            {/*
              * `text-2xl` is the top of the ladder and the hero stays on
              * it. What gives this figure its weight is that it is alone on
              * a full-width card in the accent colour with the day's move
              * beside it, rather than one of four identical tiles; the size
              * step above the two cells under it is on the phone, where the
              * cells drop to `text-xl`.
              */}
            <p className="min-w-0 break-words font-mono text-2xl font-bold leading-tight tracking-tight tabular-nums text-primary">
              {currency(totals.totalValue, 0)}
            </p>
            <DeltaBadge value={totals.todayDollar}>
              {signedCurrency(totals.todayDollar, 0)}
              {totals.todayPct != null ? ` · ${percent(totals.todayPct)}` : ""}
            </DeltaBadge>
            <span className="text-sm text-muted-foreground">
              {morning.moveLabel === "Friday" ? "on Friday" : "today"}
            </span>
          </div>
          {/*
            * What an ordinary day is for this reader, in their own money.
            * A red number means nothing on its own: somebody whose
            * portfolio swings two hundred dollars most days learns nothing
            * from "down $180", and somebody whose barely moves should sit
            * up at the same figure.
            */}
          {ordinaryDayLine ? (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {ordinaryDayLine}
            </p>
          ) : null}
          {/*
            * The three standing figures, in one strip at the foot of the
            * card rather than as tiles of their own.
            *
            * All time and Cash used to be two cells under the hero, then
            * All time and This year. Both readings were right about the
            * ranking and wrong about the size: a figure that never asks
            * anything of the reader was taking a row of the first screen
            * at the hero's own weight. In a strip they are still the
            * first thing after the day's move, still tabular, and they
            * cost the page one line. The row they left is spent on what
            * needs doing (`HomeAlertRow`).
            *
            * This year reads the same `yearPct` / `yearDollar` the chart
            * panel captions, off the one painted path, so the two cannot
            * disagree; until it has painted the figure is `NO_VALUE`.
            * Borrowed money is the one thing here that changes colour;
            * the size of it, and what it means, is the Cash card's own
            * job further down the page.
            */}
          {/*
            * Rows on a phone, a strip of three from `sm` up; see
            * `FACT_ROW`. `FACT_ROW` and `FACT_VALUE` are the same rule
            * applied three times.
            *
            * Borrowed money changes the label rather than the sentence:
            * "Borrowed" over "-$9,000 · 20% of everything" says in two
            * words what "Cash / -$9,000 · Borrowed, 20% of everything"
            * took a line and a half to say on a phone.
            */}
          <dl className="mt-4 flex flex-col gap-y-2 border-t border-border pt-4 sm:flex-row sm:flex-wrap sm:gap-x-8 sm:gap-y-3">
            <div className={FACT_ROW}>
              <dt>
                <MicroLabel>
                  All time
                  <InfoTip text="Your value today against what you paid for these shares on average. There is no date in it: Upside Lab does not keep the day you bought, so nothing here can draw a line starting from that day." />
                </MicroLabel>
              </dt>
              <dd
                className={cn(
                  FACT_VALUE,
                  tone(totals.roiDollar)
                )}
              >
                {signedCurrency(totals.roiDollar, 0)}
                <span className="font-medium text-muted-foreground">
                  {" "}
                  · {percent(totals.roiPct)}
                </span>
              </dd>
            </div>
            <div className={FACT_ROW}>
              <dt>
                <MicroLabel>This year</MicroLabel>
              </dt>
              <dd
                className={cn(
                  FACT_VALUE,
                  yearDollar != null ? tone(yearDollar) : "text-muted-foreground"
                )}
              >
                {yearDollar != null ? signedCurrency(yearDollar, 0) : NO_VALUE}
                {yearPct != null ? (
                  <span className="font-medium text-muted-foreground">
                    {" "}
                    · {signedPercent(yearPct)}
                  </span>
                ) : null}
              </dd>
            </div>
            <div className={FACT_ROW}>
              <dt>
                <MicroLabel>{totals.cash < 0 ? "Borrowed" : "Cash"}</MicroLabel>
              </dt>
              <dd
                className={cn(
                  FACT_VALUE,
                  totals.cash < 0 ? "text-loss" : "text-foreground"
                )}
              >
                {currency(totals.cash, 0)}
                {cashShareWords ? (
                  <span
                    className={cn(
                      "font-sans font-medium",
                      totals.cash < 0 ? "text-loss/80" : "text-muted-foreground"
                    )}
                  >
                    {" "}
                    · {cashShareWords}
                  </span>
                ) : null}
              </dd>
            </div>
          </dl>
        </div>
        <HomeAlertRow
          alerts={activeAlerts}
          onOpenPulse={onOpenPulse}
          onOpenAlerts={onOpenAlerts}
        />
      </div>

      <MorningStack
        className="overview-fade"
        morning={morning}
        onOpenPulse={onOpenPulse}
      />

      {marketReading}

      {recallInput ? <RecallCardPanel input={recallInput} /> : null}

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
          title={moversTitle}
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
            {moverHorizon === "today" && driverTickers.size > 0
              ? "Everything that moved is named above."
              : "Waiting on prices."}
          </p>
        ) : (
          /*
           * Three across from `lg`. At 1280 two columns made each tile
           * 570px wide holding four short tokens with 400px of glass
           * between them; six still divides evenly across three.
           */
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            {movers.map(({ t, mode }) => (
              <MoverTile
                key={`${mode}-${t.ticker}`}
                ticker={t}
                mode={mode}
                /*
                 * Pulse, the same room the briefing's own chips open.
                 * The same chip on the same screen used to land in two
                 * different places, and the plain-words room is the one a
                 * beginner wants after "who moved".
                 */
                onOpen={() =>
                  onOpenPulse
                    ? onOpenPulse(t.ticker)
                    : openFirstPortfolio(t)
                }
              />
            ))}
          </div>
        )}
      </Panel>

      {/*
        The last two panels on Home. Measured at 390x800 with everything
        above them already in place, "Your portfolios" starts at 2,141px
        and the watchlist at 2,949px, against a fold at about 917 -- both
        well past the one screen of lead time `BelowFold` gives, which is
        the test for whether it can help at all (see the note in that
        file, and Growth, where it could not). Together they are about 75
        of Home's 485 elements, and Home is the room a reader lands in.
      */}
      {multiSheet && (
        <BelowFold reserve={380}>
        <Panel className="overview-fade">
          <PanelHeader title="Your portfolios" />
          <div className="flex flex-col gap-6">
            {sheets.map((sheet) => (
              <PortfolioLane
                key={sheet.portfolio.id}
                sheet={sheet}
                maxValue={maxSheet}
                allValue={totals.totalValue}
                onOpen={() => onOpenSheet(sheet.portfolio.id)}
              />
            ))}
          </div>
        </Panel>
        </BelowFold>
      )}

      <BelowFold reserve={280}>
      <WidgetErrorBoundary name="Watchlist">
      <Panel className="overview-fade">
        <WatchlistStrip
          heldTickers={heldTickers}
          onOpenPulse={onOpenPulse}
        />
      </Panel>
      </WidgetErrorBoundary>
      </BelowFold>

      {showCommunities ? (
        <WidgetErrorBoundary name="Around Upside Lab">
          <HomeWorld />
        </WidgetErrorBoundary>
      ) : null}
    </div>
  );
});
