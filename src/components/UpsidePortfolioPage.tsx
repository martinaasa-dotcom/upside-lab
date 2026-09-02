"use client";

import { AppHeader } from "@/components/AppHeader";
import { MobileDock } from "@/components/mobile/MobileDock";
import { ComparisonChart, type ComparisonSeries } from "@/components/ComparisonChart";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import {
  BOX,
  LoadError,
  MicroLabel,
  Panel,
  PanelHeader,
  Pill,
  Reading,
  Score,
  Scoreboard,
  SwatchLegend,
} from "@/components/ui/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { plainError } from "@/lib/plain-error";
import { isAbortError, isNetworkError } from "@/lib/abort";
import { useNetworkResume } from "@/lib/use-network-resume";
import {
  NO_VALUE,
  cashtag,
  cn,
  currency,
  percent,
  signedCurrency,
  signedPercent,
  signedTone,
} from "@/lib/format";
import { formatDateTime } from "@/lib/timezone";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { Explain } from "@/components/ui/Explain";
import { PALETTE } from "@/lib/palette";
import { PAGE_FRAME_CLASS, PAGE_MAIN_CLASS } from "@/lib/page-shell";
import { isWorkspaceRoomActive, onWorkspaceRefresh } from "@/lib/workspace-rooms";
import { WhyThis } from "@/components/ui/WhyThis";
import { upsideFundProvenance } from "@/lib/provenance";
import { FUND_X_URL } from "@/lib/product";
import { useLoadingMessage } from "@/lib/use-loading-message";
import {
  quotePollMs,
  quotesUrl,
  isQuotePollFresh,
  isQuoteFreshForView,
} from "@/lib/market/session";
import { concentrationRead, themeBreakdown } from "@/lib/allocation";
import {
  buildPortfolioPersonality,
  THEME_COLOR,
} from "@/lib/portfolio-personality";
import {
  fundQuoteCoverage,
  fundTotalReturn,
  liveFundTodayMove,
  liveFundTotalValue,
  spyReturnSince,
} from "@/lib/margus-fund-mark";
import {
  fundCopyBullets,
  keepingRealBooks,
  numberedReportHeadline,
  recapBullets,
  serialFromNewest,
} from "@/lib/fund-copy";
import {
  sanitizeFundWatchlist,
  type FundWatchItem,
} from "@/lib/fund-watchlist";
import {
  loadUpsidePortfolioCache,
  saveUpsidePortfolioCache,
} from "@/lib/upside-portfolio-cache";
import {
  loadFundComparePaint,
  patchFundComparePaint,
} from "@/lib/paint-cache";
import type { Quote } from "@/lib/types";
import {
  portfolioLiveValue,
  sheetReturnPathSince,
} from "@/lib/sheet-mark";
import {
  ChevronRight,
  Minus,
  Plus,
} from "lucide-react";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useAuth } from "@/components/AuthProvider";
import { isSuperadminEmail } from "@/lib/auth/superadmin";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/**
 * The line the fund is measured against is a fund, and it says so.
 *
 * The room drew it as "SPY" and called the panel "Margus vs SPY", which
 * asks a beginner to already know that SPY is a company-shaped thing you
 * can buy that holds the five hundred largest American companies, and
 * quietly invites the reading that this is the S&P 500 itself. It is not:
 * it is one fund that follows that list, its own price, without the
 * dividends those companies pay. The short form is for a table cell where
 * the long one will not fit; nothing prints the bare three letters alone.
 */
const BENCHMARK_TICKER = "SPY";
const BENCHMARK_SHORT = "The S&P 500 tracker";
/** Mid-sentence form. `toLowerCase()` on the short one turned S&P into s&p. */
const BENCHMARK_MID = "the S&P 500 tracker";
const BENCHMARK_NOTE =
  "SPY is one fund that holds the five hundred largest American companies, in the same proportions as the published list. The line is its own share price, without the dividends those companies pay, so it is a little under what somebody holding it would really have made.";

const BENCHMARK_STORAGE_KEY = "portfell-upside-portfolio-benchmark";
const FEED_CHUNK = 7;
const SERIES_COLOR = {
  margus: PALETTE.brand,
  spy: PALETTE.steel,
  you: PALETTE.gain,
} as const;

type MyPortfolioBenchmark = {
  portfolioId: string;
  portfolioName: string;
  baselineDate: string;
  userBaselineValue: number;
  margusBaselineValue: number;
  /** Recorded nights. Older pins may still say ytd. */
  range?: "ytd" | "recorded";
};

type YtdNavPoint = { date: string; nav: number };

function returnPctFromNav(
  points: YtdNavPoint[],
  live?: number | null
): { labels: string[]; pcts: number[] } {
  if (points.length < 2) return { labels: [], pcts: [] };
  const start = points[0]!.nav;
  if (!(start > 0)) return { labels: [], pcts: [] };
  const labels = points.map((p) => p.date);
  const pcts = points.map((p) => (p.nav - start) / start);
  if (live != null && Number.isFinite(live)) {
    labels.push("Live");
    pcts.push((live - start) / start);
  }
  return { labels, pcts };
}

function pctOnOrBefore(
  points: YtdNavPoint[],
  date: string,
  startNav: number
): number {
  if (!(startNav > 0)) return 0;
  let last = 0;
  for (const p of points) {
    if (p.date <= date) last = (p.nav - startNav) / startNav;
  }
  return last;
}

/*
 * A day with no recorded return carries the last one forward.
 *
 * Both of these read `?? 0`, which drew a day whose figure never made it
 * into the row as the fund having given back everything it was up. On a
 * chart that is not a missing point, it is a crash that did not happen.
 */
function margusOnLabels(
  labels: string[],
  reports: ReportRow[],
  live: number
): number[] {
  const chrono = [...reports].reverse();
  return labels.map((d) => {
    if (d === "Live") return live;
    let last = 0;
    for (const r of chrono) {
      if (r.report_date <= d && r.total_return_pct != null) {
        last = r.total_return_pct;
      }
    }
    return last;
  });
}

function carriedReturns(reports: ReportRow[]): number[] {
  let last = 0;
  return [...reports].reverse().map((r) => {
    if (r.total_return_pct != null) last = r.total_return_pct;
    return last;
  });
}

async function fetchRecordedPath(
  portfolioId: string
): Promise<{ sheet: YtdNavPoint[]; spy: YtdNavPoint[] }> {
  const res = await fetch("/api/book/nav-history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      assumed: false,
      portfolioIds: [portfolioId],
      includeSpy: true,
    }),
  });
  if (!res.ok) return { sheet: [], spy: [] };
  const data = (await res.json()) as {
    points?: YtdNavPoint[];
    spyPoints?: YtdNavPoint[];
  };
  return { sheet: data.points ?? [], spy: data.spyPoints ?? [] };
}

function loadStoredBenchmark(): MyPortfolioBenchmark | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BENCHMARK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MyPortfolioBenchmark;
    if (!parsed?.portfolioId || !Number.isFinite(parsed.userBaselineValue)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveStoredBenchmark(b: MyPortfolioBenchmark | null) {
  if (typeof window === "undefined") return;
  if (!b) {
    window.localStorage.removeItem(BENCHMARK_STORAGE_KEY);
  } else {
    window.localStorage.setItem(BENCHMARK_STORAGE_KEY, JSON.stringify(b));
  }
}

type MyPortfolioMeta = {
  id: string;
  name: string;
  cash_balance: number;
};

type MyHolding = {
  portfolio_id: string;
  ticker: string;
  shares: number;
  buy_price: number;
};

type FundRow = {
  cash: number;
  starting_capital: number;
  inception_date: string;
  watchlist?: FundWatchItem[] | null;
  cash_purpose?: string | null;
};

type HoldingRow = {
  id: string;
  ticker: string;
  shares: number;
  cost_basis: number;
  entry_date: string;
  thesis: string;
  target_timeframe: string | null;
  exit_plan: string | null;
  status: "open" | "closed";
  closed_at: string | null;
  exit_reasoning: string | null;
  realized_pnl: number | null;
};

type FundActionRow = {
  type: "hold" | "trim" | "add" | "exit" | "buy";
  ticker: string;
  reasoning: string;
  shares?: number;
  price?: number;
  dollarAmount?: number;
};

type WeeklyRecapRow = {
  id: string;
  week_ending: string;
  headline: string;
  body: string;
  week_return_pct: number | null;
  spy_week_return_pct: number | null;
  portfolio_value_start: number;
  portfolio_value_end: number;
};

type ReportRow = {
  id: string;
  report_date: string;
  headline: string;
  body: string;
  actions: FundActionRow[];
  portfolio_value: number;
  cash: number;
  day_change_dollar: number | null;
  day_change_pct: number | null;
  total_return_pct: number | null;
  spy_price: number | null;
  /** Composed X post for this day. Saved whether or not it was sent, so
   * the update can be posted by hand while auto-posting is off. */
  x_post: string | null;
};

/** Exactly what /api/upside-portfolio returns, and what gets cached. */
type FundPayload = {
  fund: FundRow | null;
  holdings: HoldingRow[];
  reports: ReportRow[];
  weeklyRecaps: WeeklyRecapRow[];
  quotes: Record<string, Quote>;
};

function fmtDate(iso: string): string {
  const shown = formatDateTime(`${iso}T12:00:00Z`, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return shown || iso;
}

/**
 * Bought and Sold, never Opened and Exited.
 *
 * "Opened a position" and "exited" are how a trading desk writes, and this
 * room is read by somebody who has owned nothing yet. Every one of these is
 * the everyday word for the same act, and "Sold some" says what a trim
 * actually is without anybody having to already know.
 */
const ACTION_STYLE: Record<
  FundActionRow["type"],
  { label: string; cls: string }
> = {
  buy: { label: "Bought", cls: "bg-gain/15 text-gain" },
  add: { label: "Bought more", cls: "bg-gain/15 text-gain" },
  trim: { label: "Sold some", cls: "bg-caution/15 text-caution" },
  exit: { label: "Sold all of", cls: "bg-loss/15 text-loss" },
  hold: { label: "Kept", cls: "bg-accent text-muted-foreground" },
};

function ActionBadge({ action }: { action: FundActionRow }) {
  const meta = ACTION_STYLE[action.type];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-sm font-semibold",
        meta.cls
      )}
    >
      {meta.label} {cashtag(action.ticker)}
    </span>
  );
}

/** Date + closing value + day move. Shared by the open latest report and
 * the collapsed summary row of every older one, so the two can't drift. */
function ReportMeta({ r }: { r: ReportRow }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {fmtDate(r.report_date)}
      </p>
      {/*
        * The closing value is a size, not a result, so it is not coloured.
        *
        * It used to take the day's tone with it, which painted a perfectly
        * ordinary $70,900 in green or rose depending on the last few hours
        * and read, at a glance down the list, as the whole portfolio having
        * been that colour. Only the move is up or down.
        */}
      <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
        {currency(r.portfolio_value, 0)}
        {r.day_change_dollar != null && (
          <>
            {" "}
            <span className={signedTone(r.day_change_dollar, "text-muted-foreground")}>
              {signedCurrency(r.day_change_dollar, 0)}
            </span>
          </>
        )}
      </p>
    </>
  );
}

/** The actual content: what he did, and why. */
function ReportDetail({ r }: { r: ReportRow }) {
  const moves = (r.actions ?? []).filter((a) => a.type !== "hold");
  return (
    <>
      {moves.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {moves.map((a, i) => (
            <ActionBadge key={`${a.ticker}-${i}`} action={a} />
          ))}
        </div>
      )}
      <RecapBody text={r.body} muted />
      <ManualPostBlock text={r.x_post} />
    </>
  );
}

/**
 * The day's ready-to-send X post, for whoever runs the account.
 *
 * Only rendered for a superadmin: it is an operating tool, not something
 * a reader of the fund needs to see. It exists because auto-posting is
 * off by default now (`X_POSTING_ENABLED`), and an update you cannot
 * copy is an update you cannot post.
 */
function ManualPostBlock({ text }: { text: string | null }) {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  if (!text || !isSuperadminEmail(user?.email)) return null;
  return (
    <div className="glass-well mt-3 rounded-lg p-3">
      <div className="flex items-center justify-between gap-3">
        <MicroLabel>Post for X</MicroLabel>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(text)
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              })
              .catch(() => {
                /* clipboard blocked — the text is selectable below */
              });
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm text-muted-foreground">
        {text}
      </pre>
    </div>
  );
}

function RecapMeta({ r }: { r: WeeklyRecapRow }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">{fmtDate(r.week_ending)}</p>
      {r.week_return_pct != null && (
        <p className="font-mono text-sm font-semibold tabular-nums">
          <span className={signedTone(r.week_return_pct, "text-muted-foreground")}>
            {signedPercent(r.week_return_pct)}
          </span>
          {r.spy_week_return_pct != null && (
            <span className="ml-2 font-sans text-muted-foreground">
              {BENCHMARK_SHORT}{" "}
              <span className="font-mono tabular-nums">
                {signedPercent(r.spy_week_return_pct)}
              </span>
            </span>
          )}
        </p>
      )}
    </>
  );
}

function RecapBody({
  text,
  muted = false,
}: {
  text: string;
  muted?: boolean;
}) {
  const bullets = recapBullets(text);
  if (bullets.length === 0) return null;
  return (
    <ul
      className={cn(
        "flex flex-col gap-1.5 text-sm leading-relaxed",
        muted ? "text-muted-foreground" : "text-muted-foreground"
      )}
    >
      {bullets.map((b) => (
        <li key={b} className="flex gap-2">
          <span
            aria-hidden
            className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
          />
          <span>{b}</span>
        </li>
      ))}
    </ul>
  );
}

function ViewMoreButton({
  remaining,
  onClick,
}: {
  remaining: number;
  onClick: () => void;
}) {
  if (remaining <= 0) return null;
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={onClick}
    >
      View more
      {remaining > 7 ? ` · ${remaining}` : ""}
    </Button>
  );
}

/**
 * `stalled` is the load having given up, not merely being slow.
 *
 * Without it the header said "Loading prices …" for as long as the tab
 * stayed open: the label keyed off `quotesAt == null`, which is equally
 * true a tick after mount and forever after a failed fetch. A page that
 * claims to be loading something it has stopped trying to load is worse
 * than one that admits it has no prices, because the reader waits.
 */
function freshnessLabel(
  quotesAt: number | null,
  nowMs: number,
  stalled: boolean
): string {
  if (quotesAt == null) return stalled ? "No prices yet" : "Loading prices …";
  const secs = Math.max(0, Math.round((nowMs - quotesAt) / 1000));
  if (secs < 10) return "Live, just now";
  if (secs < 90) return `Live, ${secs}s ago`;
  const mins = Math.round(secs / 60);
  return `Prices ${mins} minutes old`;
}

function FundFreshness({
  quotesAt,
  stalled = false,
}: {
  quotesAt: number | null;
  stalled?: boolean;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  const label = freshnessLabel(quotesAt, nowMs, stalled);
  return (
    <span
      className="inline-flex items-center gap-1.5 text-sm tabular-nums text-muted-foreground"
      title="Prices include pre-market and after hours, not just the regular close"
      aria-label={label}
    >
      {quotesAt != null && (
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-gain"
        />
      )}
      <span className="hidden tabular-nums xs:inline">{label}</span>
    </span>
  );
}

function FundMetric({
  label,
  value,
  hint,
  valueClassName,
  explain,
}: {
  label: React.ReactNode;
  value: string;
  hint?: string;
  valueClassName?: string;
  /*
    A glossary term, where this label is one. The Fund is the page a reader
    who owns nothing yet is most likely to be looking at, so it is the worst
    place in the product to print a word and leave them to guess it.
  */
  explain?: string;
}) {
  return (
    <div className="min-w-0">
      <MicroLabel>
        {label}
        {explain ? <Explain term={explain} className="ml-1.5" /> : null}
      </MicroLabel>
      <p
        className={cn(
          "mt-1.5 truncate font-mono text-base font-semibold tabular-nums text-foreground",
          valueClassName
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="truncate text-sm tabular-nums text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Thesis / Sell-if pair. Same nested Reading tile used everywhere else a
 * card explains itself in a sentence (Worth noticing, What's missing) —
 * one label style, so this doesn't drift into its own smaller heading. */
function FundNote({
  label,
  items,
}: {
  label: React.ReactNode;
  items: string[];
}) {
  return (
    <Reading nested label={label}>
      {items.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item} className="text-sm leading-relaxed text-foreground">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-muted-foreground">Not written yet.</span>
      )}
    </Reading>
  );
}

/**
 * One company he owns, with every figure named for what it actually is.
 *
 * Three of the four labels used to be wrong, and one of them in the way
 * that costs a beginner the most. `cost_basis` on a fund holding is the
 * price of **one share**, not the money put in, so the cell reading "Cost
 * $168.40" over a hundred and twenty shares said the position had cost a
 * hundred and sixty eight dollars. Beside it, "Portfolio" was that
 * holding's own worth today, which is the one word in this app that means
 * everything you own rather than one line of it. Both now say what they
 * are, and both carry the glossary entry for the word.
 *
 * `price` is null when no quote arrived. It used to fall back to what he
 * paid, so a company nobody could price showed today's price as the buy
 * price and a gain of exactly nothing, which is a claim about the market
 * this page had no basis for.
 */
function FundPosition({
  holding,
  price,
}: {
  holding: HoldingRow;
  price: number | null;
}) {
  const priced = price != null && Number.isFinite(price) && price > 0;
  const pnlPct =
    priced && holding.cost_basis > 0
      ? (price - holding.cost_basis) / holding.cost_basis
      : null;
  const worthNow = priced ? price * holding.shares : null;
  const pnlDollar = priced ? (price - holding.cost_basis) * holding.shares : null;
  const thesis = fundCopyBullets(holding.thesis).slice(0, 2);
  const exit = fundCopyBullets(holding.exit_plan).slice(0, 2);
  const shares = holding.shares.toLocaleString("en-US");
  const holdFor = holding.target_timeframe?.trim();
  const tag = cashtag(holding.ticker);
  return (
    <div className={cn(BOX, "flex flex-col gap-4 p-4 sm:p-6")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Badge variant="secondary" className="chip-hang h-6 font-heading text-sm font-semibold">
            {tag}
          </Badge>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {shares} shares, bought {fmtDate(holding.entry_date)}
            {holdFor ? `, meant to be held for ${holdFor}` : ""}
          </p>
        </div>
        <Pill
          tone={
            pnlPct == null ? "neutral" : pnlPct > 0 ? "good" : pnlPct < 0 ? "bad" : "neutral"
          }
          className="shrink-0"
        >
          {pnlPct == null ? NO_VALUE : signedPercent(pnlPct)}
        </Pill>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <FundMetric
          label={
            <Explain
              term="paid-each"
              ticker={tag}
              amount={currency(holding.cost_basis)}
            >
              Paid each
            </Explain>
          }
          value={currency(holding.cost_basis)}
        />
        <FundMetric label="Price now" value={priced ? currency(price) : NO_VALUE} />
        <FundMetric
          label={
            <Explain
              term="value"
              ticker={tag}
              amount={worthNow != null ? currency(worthNow, 0) : undefined}
            >
              Worth now
            </Explain>
          }
          value={worthNow != null ? currency(worthNow, 0) : NO_VALUE}
        />
        <FundMetric
          label={
            <Explain
              term="gain"
              ticker={tag}
              amount={pnlDollar != null ? signedCurrency(pnlDollar, 0) : undefined}
              second={pnlPct != null ? signedPercent(pnlPct) : undefined}
            >
              Up or down
            </Explain>
          }
          value={pnlDollar != null ? signedCurrency(pnlDollar, 0) : NO_VALUE}
          valueClassName={signedTone(pnlDollar)}
        />
      </div>
      {!priced && (
        <p className="text-sm leading-relaxed text-muted-foreground">
          No price came back for {tag} just now, so the three figures that need
          one say {NO_VALUE} rather than guessing.
        </p>
      )}
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <FundNote
          label={
            <Explain term="thesis" ticker={tag}>
              Why he owns it
            </Explain>
          }
          items={thesis}
        />
        <FundNote
          label={
            <Explain term="sell-if" ticker={tag}>
              What would make him sell
            </Explain>
          }
          items={exit}
        />
      </div>
    </div>
  );
}

/**
 * A section heading, and the eye on the ones a model wrote.
 *
 * The room carried exactly one provenance eye, on the panel with the chart,
 * while three whole sections underneath it are sentences a language model
 * wrote: the daily reasons, the weekly summaries, and the reason for owning
 * each company. Those are the ones a reader is most likely to take
 * seriously and the ones where knowing what wrote them changes how they
 * read. The eye goes where the words are.
 */
function SectionHeading({ title, eye = false }: { title: string; eye?: boolean }) {
  return (
    <h2 className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
      {title}
      {eye ? <WhyThis provenance={upsideFundProvenance()} /> : null}
    </h2>
  );
}

/**
 * A slice of the bar, never rounded up into existence.
 *
 * `Math.round(pct * 100)` printed a real 0.4% slice as "0%", which is a
 * coloured band on the bar beside a legend saying there is nothing there,
 * and rounded 0.6% up to a whole per cent it had not reached.
 */
function sliceLabel(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0) return percent(0, 0);
  if (pct < 0.01) return "less than 1%";
  return percent(pct, 0);
}

/**
 * What this room actually is, on the room, in the first thing read.
 *
 * The provenance eye has said all of this since it was written, and the eye
 * is opened by a reader who has already decided to be suspicious. This page
 * is the most copyable thing in the product: a confident daily write-up,
 * with a portfolio value and a return beside it, by something with a name.
 * Somebody who reads it as a tip sheet and never presses anything is
 * exactly the reader who most needs the first paragraph, so the first
 * paragraph is now the answer rather than a link to it.
 *
 * `landing-claims.test.ts` is the pattern for the sentences here: each one
 * is checked against the code that makes it true, in `fund-room-claims.test.ts`.
 */
function WhatThisIs({
  decisions,
  startedOn,
}: {
  decisions: number;
  startedOn?: string | null;
}) {
  return (
    <Panel>
      <PanelHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            What Upside Fund is
            <WhyThis provenance={upsideFundProvenance()} />
          </span>
        }
      />
      <div className="flex flex-col gap-3 text-base leading-relaxed text-muted-foreground">
        <p>
          Margus is a computer program that writes language, not a person. Once
          on each day the market is open it is shown this portfolio, asked for
          one decision, and whatever it answers is written down here with its
          reason, whether it turns out well or badly. Nothing is edited
          afterwards.
        </p>
        <p>
          The money is <Explain term="paper-money">pretend</Explain>. No shares
          are ever really bought, nobody&apos;s savings are in it, and every
          figure on this page is what would have happened. It is one experiment
          run in the open so you can watch a reason being written down before
          the answer is known, which is the part that is worth learning.
        </p>
        <p>
          {decisions > 0
            ? `${decisions} ${decisions === 1 ? "decision has" : "decisions have"} been written down so far`
            : "No decision has been written down yet"}
          {startedOn ? `, starting ${fmtDate(startedOn)}` : ""}. {ADVICE_DISCLAIMER_SHORT}{" "}
          It is a diary, not a list to copy.
        </p>
      </div>
    </Panel>
  );
}

export function UpsidePortfolioPage() {
  // Paint the last known fund immediately; the fetch below still runs and
  // corrects it. Only a genuinely cold visit shows a loading line.
  const cachedRef = useRef<FundPayload | null>(null);
  const cacheHydratedRef = useRef(false);
  const loadCallIdRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);

  const [fund, setFund] = useState<FundRow | null>(null);
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [weeklyRecaps, setWeeklyRecaps] = useState<WeeklyRecapRow[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** When the currently displayed quotes landed. Null until the first
   * successful fetch: a cached first paint is real data but not fresh
   * data, and claiming otherwise would be a lie. */
  const [quotesAt, setQuotesAt] = useState<number | null>(null);

  // "Compare your own portfolio" opt-in benchmark — entirely client-side
  // (localStorage), since it's a personal viewing preference, not shared
  // fund state everyone else on this page should see.
  const [benchmark, setBenchmark] = useState<MyPortfolioBenchmark | null>(null);
  const [benchmarkLiveValue, setBenchmarkLiveValue] = useState<number | null>(null);
  const [benchmarkQuotes, setBenchmarkQuotes] = useState<Record<string, Quote>>(
    {}
  );
  const [myPortfolios, setMyPortfolios] = useState<MyPortfolioMeta[] | null>(null);
  const [myHoldings, setMyHoldings] = useState<MyHolding[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSelection, setPickerSelection] = useState("");
  const [benchmarkBusy, setBenchmarkBusy] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);
  const [sheetYtd, setSheetYtd] = useState<YtdNavPoint[] | null>(null);
  const [spyYtd, setSpyYtd] = useState<YtdNavPoint[] | null>(null);
  const loadingMessage = useLoadingMessage();
  const [dailyVisible, setDailyVisible] = useState(1);
  const [weeklyVisible, setWeeklyVisible] = useState(1);

  useLayoutEffect(() => {
    if (cacheHydratedRef.current) return;
    cacheHydratedRef.current = true;
    const cached =
      (loadUpsidePortfolioCache()?.payload as FundPayload | undefined) ?? null;
    cachedRef.current = cached;
    if (!cached) return;
    setFund(cached.fund ?? null);
    setHoldings(cached.holdings ?? []);
    setReports(cached.reports ?? []);
    setWeeklyRecaps(cached.weeklyRecaps ?? []);
    setQuotes(cached.quotes ?? {});
    setLoading(false);
  }, []);

  const load = useCallback(async (mode: "initial" | "manual" | "background") => {
    // Three sources can be in flight at once here (first load, the 60s
    // poll, and manual refresh), so a slow one resolving last would
    // otherwise overwrite fresher numbers with stale ones. Only the most
    // recently started call is allowed to commit.
    loadAbortRef.current?.abort();
    const ctrl = new AbortController();
    loadAbortRef.current = ctrl;
    const callId = ++loadCallIdRef.current;
    // A cached paint means the first fetch is really a background refresh:
    // never swap a populated page back to a loading line.
    if (mode === "initial" && !cachedRef.current) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/upside-portfolio", {
        cache: "no-store",
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(plainError(data.error, "Couldn't load the Fund."));
      if (callId !== loadCallIdRef.current || ctrl.signal.aborted) return;
      setFund(data.fund);
      setHoldings(data.holdings ?? []);
      setReports(data.reports ?? []);
      setWeeklyRecaps(data.weeklyRecaps ?? []);
      setQuotes(data.quotes ?? {});
      setQuotesAt(Date.now());
      saveUpsidePortfolioCache({
        fund: data.fund,
        holdings: data.holdings ?? [],
        reports: data.reports ?? [],
        weeklyRecaps: data.weeklyRecaps ?? [],
        quotes: data.quotes ?? {},
      });
    } catch (e) {
      // Background polls fail silently rather than blanking an
      // already-loaded page over one flaky tick. A cache-backed first load
      // counts as already-loaded for the same reason: showing an error
      // over a perfectly readable page helps nobody.
      if (isAbortError(e) || callId !== loadCallIdRef.current) return;
      if (mode !== "background" && !cachedRef.current) {
        setError(
          isNetworkError(e)
            ? "You appear to be offline. The Fund will load as soon as the connection is back."
            : e instanceof Error
              ? e.message
              : "Couldn't load the Fund."
        );
      }
    } finally {
      // A superseded call must not clear the spinner belonging to the
      // newer one that's still running.
      if (callId === loadCallIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load("initial");
    return () => {
      loadAbortRef.current?.abort();
      loadCallIdRef.current += 1;
    };
  }, [load]);

  useNetworkResume(() => {
    void load("background");
  });

  useLayoutEffect(() => {
    const stored = loadStoredBenchmark();
    setBenchmark(stored);
    const cmp = loadFundComparePaint();
    if (!cmp) return;
    setMyPortfolios(cmp.portfolios);
    setMyHoldings(cmp.holdings);
    if (!stored) return;
    const path = cmp.paths[stored.portfolioId];
    if (path?.sheet?.length) {
      setSheetYtd(path.sheet);
      setSpyYtd(path.spy?.length ? path.spy : null);
    }
    const live = cmp.live[stored.portfolioId];
    if (live) {
      setBenchmarkLiveValue(live.value);
      setBenchmarkQuotes(live.quotes ?? {});
    }
  }, []);

  const openHoldings = useMemo(
    () => holdings.filter((h) => h.status === "open"),
    [holdings]
  );
  const closedHoldings = useMemo(
    () => holdings.filter((h) => h.status === "closed"),
    [holdings]
  );

  const latestReport = reports[0] ?? null;
  const fundRef = useRef(fund);
  fundRef.current = fund;
  const oldestReport = reports[reports.length - 1] ?? null;
  /*
   * Cash the room actually knows about, and whether it knows at all.
   *
   * The arithmetic still treats an unknown balance as nothing, because a
   * total is better slightly low than absent, but the cell that prints it
   * says n/a rather than stating a balance of zero nobody recorded.
   */
  const knownCash = latestReport?.cash ?? fund?.cash ?? null;
  const cash = knownCash ?? 0;
  // Live, not frozen at the last daily snapshot — same formula as the
  // Overview teaser so the two surfaces never disagree.
  const totalValue = liveFundTotalValue({
    cash,
    holdings: openHoldings,
    quotes,
  });

  // Same engine Lab uses on your own book, so "what is Margus actually
  // betting on" reads in the same units as your own concentration page
  // rather than being a bespoke one-off chart.
  const fundValued = useMemo(
    () =>
      openHoldings.map((h) => ({
        ticker: h.ticker,
        currentValue: h.shares * (quotes[h.ticker]?.price ?? h.cost_basis),
      })),
    [openHoldings, quotes]
  );
  const fundThemes = useMemo(() => themeBreakdown(fundValued), [fundValued]);
  const fundWatchlist = useMemo(
    () =>
      sanitizeFundWatchlist(
        fund?.watchlist,
        openHoldings.map((h) => h.ticker)
      ),
    [fund?.watchlist, openHoldings]
  );
  const watchingNote = useMemo(() => {
    const body = latestReport?.body;
    if (!body) return null;
    const parts = body
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const last = parts.at(-1);
    // Model prose, so it goes through the same pass everything else does.
    return last && last.length >= 12 ? keepingRealBooks(last) : null;
  }, [latestReport?.body]);
  const bettingSlices = useMemo(() => {
    const slices: {
      key: string;
      label: string;
      pct: number;
      color: string;
    }[] = fundThemes.map((t) => ({
      key: t.theme,
      label: t.label,
      pct: totalValue > 0 ? t.value / totalValue : t.pct,
      color: THEME_COLOR[t.theme],
    }));
    if (cash > 0 && totalValue > 0) {
      slices.push({
        key: "cash",
        label: "Cash",
        pct: cash / totalValue,
        color: PALETTE.muted,
      });
    }
    return slices;
  }, [fundThemes, cash, totalValue]);
  const fundConcentration = useMemo(
    () => concentrationRead(fundValued),
    [fundValued]
  );
  /*
   * The biggest company as a share of the whole portfolio, cash included.
   *
   * `concentrationRead` measures against the money that is invested, which
   * is the right question for how concentrated the picking is and the wrong
   * one for a cell sitting next to "Share left in cash". Those two read as
   * two slices of one pie, so with 17% in cash they have to be measured
   * against the same whole or they do not add up: NVDA was 37% of the
   * invested money and 31% of the portfolio, and the row printed the first
   * under a label that promised the second.
   */
  const biggestHolding = useMemo(() => {
    let top: { ticker: string; currentValue: number } | null = null;
    for (const h of fundValued) {
      if (!top || h.currentValue > top.currentValue) top = h;
    }
    if (!top || !(totalValue > 0)) return null;
    return { ticker: top.ticker, pct: top.currentValue / totalValue, value: top.currentValue };
  }, [fundValued, totalValue]);
  const fundPersonality = useMemo(
    () =>
      buildPortfolioPersonality(
        fundValued.map((h) => ({ ticker: h.ticker, value: h.currentValue })),
        cash
      ),
    [fundValued, cash]
  );
  const { dollar: totalReturnDollar, pct: totalReturnPct } = fundTotalReturn({
    liveTotal: totalValue,
    startingCapital: fund?.starting_capital,
  });
  const { todayDollar, todayPct } = liveFundTodayMove({
    liveTotal: totalValue,
    lastReportValue: latestReport?.portfolio_value,
  });
  const hasYesterday =
    latestReport?.portfolio_value != null &&
    Number.isFinite(latestReport.portfolio_value);
  /*
   * How much of "Total value" is a live price and how much is what he
   * paid. See `fundQuoteCoverage`: the fallback is right and saying
   * nothing about it was not.
   */
  const coverage = useMemo(
    () => fundQuoteCoverage({ holdings: openHoldings, quotes }),
    [openHoldings, quotes]
  );

  /*
   * The number of decisions written down, which is what the reader can
   * count in the list below.
   *
   * The header used to print `fundDayNumber`, which is calendar days since
   * the fund started: on a fund three weeks old with five reports it said
   * "Day 24" directly above a report headed "Day 5". Both numbers were
   * right and the pair was not, so the one on screen is now the one the
   * page can be checked against, and how long ago it started is said in
   * words beside it rather than counted into the same figure.
   */
  const decisionCount = reports.length;

  // The benchmark's inception price comes from the oldest stored report
  // once one exists; before day one runs, today's live price doubles as
  // inception (so it fairly starts at 0%, not a stale number).
  const spyLivePrice = quotes[BENCHMARK_TICKER]?.price ?? null;
  const spyInceptionPrice = oldestReport?.spy_price ?? spyLivePrice;
  const spyReturnPct = spyReturnSince({
    inceptionPrice: spyInceptionPrice,
    livePrice: spyLivePrice,
  });

  // Both series end with a live point, not the last daily snapshot — the
  // chart's rightmost edge moves with the market intraday, then "locks
  // in" once tomorrow's cron writes the next real report.
  const margusReturnSeries = useMemo(() => {
    const historical = carriedReturns(reports);
    return [...historical, totalReturnPct ?? historical.at(-1) ?? 0];
  }, [reports, totalReturnPct]);
  const spyReturnSeries = useMemo(() => {
    const chronological = [...reports].reverse();
    const firstPrice =
      chronological.find((r) => r.spy_price != null)?.spy_price ?? null;
    let last = 0;
    const historical = !firstPrice
      ? []
      : chronological.map((r) => {
          if (r.spy_price != null) last = (r.spy_price - firstPrice) / firstPrice;
          return last;
        });
    return [...historical, spyReturnPct ?? last];
  }, [reports, spyReturnPct]);

  const ytdSheetPath = useMemo(
    () =>
      sheetYtd && sheetYtd.length >= 2
        ? returnPctFromNav(sheetYtd, benchmarkLiveValue)
        : null,
    [sheetYtd, benchmarkLiveValue]
  );

  const comparisonLabels = useMemo(() => {
    if (benchmark && ytdSheetPath && ytdSheetPath.labels.length >= 2) {
      return ytdSheetPath.labels;
    }
    const dates = [...reports].reverse().map((r) => r.report_date);
    return [...dates, "Live"];
  }, [benchmark, ytdSheetPath, reports]);

  const youReturnSeries = useMemo(() => {
    if (!benchmark) return null;
    if (ytdSheetPath && ytdSheetPath.pcts.length >= 2) return ytdSheetPath.pcts;
    const meta = myPortfolios?.find((p) => p.id === benchmark.portfolioId) ?? {
      id: benchmark.portfolioId,
      cash_balance: 0,
    };
    if (benchmarkLiveValue == null) return null;
    const points = sheetReturnPathSince({
      labels: comparisonLabels,
      baselineDate: benchmark.baselineDate,
      baselineValue: benchmark.userBaselineValue,
      liveValue: benchmarkLiveValue,
      meta,
      holdings: myHoldings,
      quotes: benchmarkQuotes,
    });
    return points.length >= 2 ? points : null;
  }, [
    benchmark,
    benchmarkLiveValue,
    benchmarkQuotes,
    comparisonLabels,
    myHoldings,
    myPortfolios,
    ytdSheetPath,
  ]);

  const spyYtdSeries = useMemo(() => {
    if (!benchmark || !spyYtd || spyYtd.length < 2) return null;
    const start = spyYtd[0]!.nav;
    if (!(start > 0)) return null;
    return comparisonLabels.map((d) => {
      if (d === "Live") {
        return spyLivePrice != null ? (spyLivePrice - start) / start : pctOnOrBefore(spyYtd, "9999-12-31", start);
      }
      return pctOnOrBefore(spyYtd, d, start);
    });
  }, [benchmark, spyYtd, comparisonLabels, spyLivePrice]);

  const margusYtdSeries = useMemo(() => {
    if (!benchmark || !ytdSheetPath) return null;
    return margusOnLabels(comparisonLabels, reports, totalReturnPct ?? 0);
  }, [benchmark, ytdSheetPath, comparisonLabels, reports, totalReturnPct]);

  const comparisonSeries: ComparisonSeries[] = useMemo(() => {
    const margusPts = margusYtdSeries ?? margusReturnSeries;
    const spyPts = spyYtdSeries ?? spyReturnSeries;
    const rows: ComparisonSeries[] = [
      { label: "Margus", color: SERIES_COLOR.margus, points: margusPts },
      { label: BENCHMARK_SHORT, color: SERIES_COLOR.spy, points: spyPts },
    ];
    if (benchmark && youReturnSeries) {
      const youDollar =
        benchmarkLiveValue != null
          ? benchmarkLiveValue - benchmark.userBaselineValue
          : null;
      rows.splice(1, 0, {
        label: benchmark.portfolioName,
        color: SERIES_COLOR.you,
        points: youReturnSeries,
        hint: youDollar != null ? signedCurrency(youDollar, 0) : undefined,
      });
    }
    return rows;
  }, [
    benchmark,
    benchmarkLiveValue,
    margusReturnSeries,
    margusYtdSeries,
    spyReturnSeries,
    spyYtdSeries,
    youReturnSeries,
  ]);

  const fetchMyPortfolios = useCallback(async (): Promise<{
    portfolios: MyPortfolioMeta[];
    holdingsList: MyHolding[];
  }> => {
    const res = await fetch("/api/portfolios", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(plainError(data.error, "Couldn't load your portfolio."));
    const portfolios: MyPortfolioMeta[] = (data.portfolios ?? []).map(
      (p: { id: string; name: string; cash_balance?: number }) => ({
        id: p.id,
        name: p.name,
        cash_balance: Number(p.cash_balance ?? 0),
      })
    );
    const holdingsList: MyHolding[] = (data.holdings ?? []).map(
      (h: {
        portfolio_id: string;
        ticker: string;
        shares?: number;
        buy_price?: number;
      }) => ({
        portfolio_id: h.portfolio_id,
        ticker: String(h.ticker ?? "").toUpperCase(),
        shares: Number(h.shares ?? 0),
        buy_price: Number(h.buy_price ?? 0),
      })
    );
    setMyPortfolios(portfolios);
    setMyHoldings(holdingsList);
    if (portfolios.length === 1) setPickerSelection(portfolios[0]!.id);
    patchFundComparePaint({ portfolios, holdings: holdingsList });
    return { portfolios, holdingsList };
  }, []);

  const valueForPortfolio = useCallback(
    async (
      portfolioId: string,
      portfolios: MyPortfolioMeta[],
      holdingsList: MyHolding[]
    ): Promise<{
      meta: MyPortfolioMeta;
      live: number;
      quotes: Record<string, Quote>;
    }> => {
      const meta = portfolios.find((p) => p.id === portfolioId);
      if (!meta) throw new Error("Portfolio not found");
      const tickers = [
        ...new Set(
          holdingsList
            .filter((h) => h.portfolio_id === portfolioId)
            .map((h) => h.ticker)
        ),
      ];
      let liveQuotes: Record<string, Quote> = {};
      if (tickers.length > 0) {
        const res = await fetch(quotesUrl(tickers));
        if (!res.ok) throw new Error(`Quotes fetch failed (${res.status})`);
        const data = await res.json();
        liveQuotes = data.quotes ?? {};
      }
      return {
        meta,
        live: portfolioLiveValue(meta, holdingsList, liveQuotes),
        quotes: liveQuotes,
      };
    },
    []
  );

  const refreshBenchmarkValue = useCallback(async () => {
    if (!benchmark) return;
    try {
      const { portfolios, holdingsList } = await fetchMyPortfolios();
      if (!portfolios.some((p) => p.id === benchmark.portfolioId)) {
        setBenchmark(null);
        setBenchmarkLiveValue(null);
        setBenchmarkQuotes({});
        saveStoredBenchmark(null);
        return;
      }
      const { live, quotes: liveQuotes } = await valueForPortfolio(
        benchmark.portfolioId,
        portfolios,
        holdingsList
      );
      setBenchmarkLiveValue(live);
      setBenchmarkQuotes(liveQuotes);

      const { sheet, spy } = await fetchRecordedPath(benchmark.portfolioId);
      if (sheet.length >= 2) {
        setSheetYtd(sheet);
        setSpyYtd(spy);
        patchFundComparePaint({
          paths: { [benchmark.portfolioId]: { sheet, spy } },
          live: {
            [benchmark.portfolioId]: { value: live, quotes: liveQuotes },
          },
        });
        const first = sheet[0]!;
        const needsHeal =
          benchmark.range !== "recorded" ||
          benchmark.baselineDate !== first.date ||
          (first.nav > 0 &&
            Math.abs(first.nav - benchmark.userBaselineValue) > 1);
        if (needsHeal) {
          const healed: MyPortfolioBenchmark = {
            ...benchmark,
            baselineDate: first.date,
            userBaselineValue:
              first.nav > 0 ? first.nav : benchmark.userBaselineValue,
            margusBaselineValue:
              fundRef.current?.starting_capital ??
              benchmark.margusBaselineValue,
            range: "recorded",
          };
          saveStoredBenchmark(healed);
          setBenchmark(healed);
        }
      }
    } catch {
      /* keep last-known value on transient failure, non-critical */
    }
  }, [benchmark, valueForPortfolio, fetchMyPortfolios]);

  // Refresh the live value of an already-set benchmark whenever it loads.
  useEffect(() => {
    void refreshBenchmarkValue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [benchmark?.portfolioId]);

  /**
   * Live quotes move all day, so re-poll rather than freezing at whatever
   * the last daily report captured.
   *
   * The callbacks go through a ref on purpose. refreshBenchmarkValue is
   * keyed to `benchmark` and re-heals that object, so listing it as a
   * dependency tore down and re-armed this interval every time the
   * benchmark identity changed, restarting the countdown from zero. With a
   * long interval that is a good way to never fire at all.
   */
  const pollRef = useRef({ load, refreshBenchmarkValue });
  pollRef.current = { load, refreshBenchmarkValue };

  const quotesAtRef = useRef(quotesAt);
  quotesAtRef.current = quotesAt;

  useEffect(() => {
    function tick(reason: "background" | "view" = "background") {
      if (document.hidden || !isWorkspaceRoomActive("fund")) return;
      const alreadyFresh =
        reason === "view"
          ? isQuoteFreshForView(quotesAtRef.current)
          : isQuotePollFresh(quotesAtRef.current);
      if (alreadyFresh) return;
      void pollRef.current.load("background");
      void pollRef.current.refreshBenchmarkValue();
    }
    // Re-armed each cycle rather than a fixed interval, so the cadence drops
    // to a trickle once New York closes and picks back up at the open.
    let timer = 0;
    function schedule() {
      timer = window.setTimeout(
        () => {
          tick();
          schedule();
        },
        quotePollMs()
      );
    };
    schedule();
    function onVisible() {
      if (!document.hidden) tick("view");
    }
    document.addEventListener("visibilitychange", onVisible);
    /*
      A pull asks for the same two things this cycle asks for, minus the
      freshness check: somebody who has just pulled the page down is asking
      for the number now, whatever the cadence thinks.
    */
    const offPull = onWorkspaceRefresh("fund", () =>
      Promise.all([
        pollRef.current.load("background"),
        pollRef.current.refreshBenchmarkValue(),
      ])
    );
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      offPull();
    };
  }, []);

  const handleOpenPicker = useCallback(async () => {
    setBenchmarkError(null);
    setPickerOpen(true);
    if (!myPortfolios) {
      try {
        await fetchMyPortfolios();
      } catch (e) {
        setBenchmarkError(e instanceof Error ? e.message : "Couldn't load your portfolio.");
      }
    }
  }, [myPortfolios, fetchMyPortfolios]);

  const handleSetBenchmark = useCallback(async () => {
    if (!myPortfolios) return;
    const selectedId =
      myPortfolios.length === 1 ? myPortfolios[0]!.id : pickerSelection;
    if (!selectedId) return;
    setBenchmarkBusy(true);
    setBenchmarkError(null);
    try {
      const { meta, live, quotes: liveQuotes } = await valueForPortfolio(
        selectedId,
        myPortfolios,
        myHoldings
      );
      const { sheet, spy } = await fetchRecordedPath(selectedId);
      if (sheet.length < 2) {
        setBenchmarkError(
          "This portfolio needs a few days of saved history before it can be compared."
        );
        return;
      }
      setSheetYtd(sheet);
      setSpyYtd(spy.length >= 2 ? spy : null);
      patchFundComparePaint({
        paths: { [selectedId]: { sheet, spy } },
        live: { [selectedId]: { value: live, quotes: liveQuotes } },
      });
      const first = sheet[0]!;
      const next: MyPortfolioBenchmark = {
        portfolioId: selectedId,
        portfolioName: meta.name,
        baselineDate: first.date,
        userBaselineValue: first.nav > 0 ? first.nav : live,
        margusBaselineValue: fund?.starting_capital ?? totalValue,
        range: "recorded",
      };
      saveStoredBenchmark(next);
      setBenchmark(next);
      setBenchmarkLiveValue(live);
      setBenchmarkQuotes(liveQuotes);
      setPickerOpen(false);
    } catch (e) {
      setBenchmarkError(e instanceof Error ? e.message : "Couldn't set that comparison.");
    } finally {
      setBenchmarkBusy(false);
    }
  }, [
    pickerSelection,
    myPortfolios,
    myHoldings,
    valueForPortfolio,
    totalValue,
    fund?.starting_capital,
  ]);

  const handleClearBenchmark = useCallback(() => {
    saveStoredBenchmark(null);
    setBenchmark(null);
    setBenchmarkLiveValue(null);
    setBenchmarkQuotes({});
    setSheetYtd(null);
    setSpyYtd(null);
    setPickerSelection("");
  }, []);

  return (
    <div className={PAGE_FRAME_CLASS}>
      <MobileDock active={null} />
      <AppHeader title="Upside Fund" mobileTitle="Fund">
        <FundFreshness quotesAt={quotesAt} stalled={error != null} />
      </AppHeader>

      <main id="main" className={PAGE_MAIN_CLASS}>
        <h1 className="sr-only">Upside Fund</h1>

        {loading ? (
          <p className="text-sm text-muted-foreground">{loadingMessage}</p>
        ) : error ? (
          <LoadError message={error} onRetry={() => void load("manual")} />
        ) : (
          <>
            <WhatThisIs decisions={decisionCount} startedOn={fund?.inception_date} />

            <Panel>
              <PanelHeader
                title={
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {benchmark
                      ? `${benchmark.portfolioName}, Margus and ${BENCHMARK_MID}`
                      : `Margus against ${BENCHMARK_MID}`}
                    <WhyThis provenance={upsideFundProvenance()} />
                  </span>
                }
                subtitle={BENCHMARK_NOTE}
                actions={
                  benchmark ? (
                    <button
                      type="button"
                      onClick={handleClearBenchmark}
                      className="shrink-0 text-sm text-muted-foreground hover:text-foreground"
                    >
                      Remove
                    </button>
                  ) : !pickerOpen ? (
                    <button
                      type="button"
                      onClick={() => void handleOpenPicker()}
                      className="shrink-0 text-sm font-medium text-primary hover:text-primary"
                    >
                      Compare my portfolio
                    </button>
                  ) : null
                }
              />
              <Scoreboard>
                <Score
                  label={
                    <Explain term="value" amount={currency(totalValue, 0)}>
                      Worth today
                    </Explain>
                  }
                  value={currency(totalValue, 0)}
                />
                {/*
                  * Today's move needs a yesterday, and before the first
                  * report there is not one. `liveFundTodayMove` answers zero
                  * dollars in that case, which the cell printed as "$0": a
                  * flat day, stated, on a fund that has not had a day yet.
                  */}
                <Score
                  label={
                    <Explain term="today" amount={signedCurrency(todayDollar, 0)}>
                      Today
                    </Explain>
                  }
                  value={hasYesterday ? signedCurrency(todayDollar, 0) : NO_VALUE}
                  sub={
                    hasYesterday
                      ? todayPct != null
                        ? signedPercent(todayPct)
                        : undefined
                      : "There is no closing figure yet to measure today against."
                  }
                  valueClassName={
                    hasYesterday ? signedTone(todayDollar, "text-foreground") : undefined
                  }
                  subClassName={
                    hasYesterday
                      ? signedTone(todayDollar, "text-muted-foreground")
                      : undefined
                  }
                />
                <Score
                  label={
                    <Explain
                      term="total-return"
                      amount={
                        totalReturnDollar != null
                          ? signedCurrency(totalReturnDollar, 0)
                          : undefined
                      }
                      second={
                        fund?.starting_capital
                          ? currency(fund.starting_capital, 0)
                          : undefined
                      }
                    >
                      Since it started
                    </Explain>
                  }
                  value={totalReturnPct != null ? signedPercent(totalReturnPct) : NO_VALUE}
                  sub={
                    totalReturnDollar != null
                      ? signedCurrency(totalReturnDollar, 0)
                      : "No starting figure recorded, so there is nothing to measure against."
                  }
                  valueClassName={signedTone(totalReturnDollar, "text-foreground")}
                  subClassName={
                    totalReturnDollar != null
                      ? signedTone(totalReturnDollar, "text-muted-foreground")
                      : undefined
                  }
                />
                <Score
                  label={
                    <Explain
                      term="cash"
                      amount={knownCash != null ? currency(knownCash, 0) : undefined}
                    >
                      Cash not invested
                    </Explain>
                  }
                  value={knownCash != null ? currency(knownCash, 0) : NO_VALUE}
                  sub={
                    fund?.starting_capital
                      ? `It started with ${currency(fund.starting_capital, 0)}`
                      : undefined
                  }
                />
              </Scoreboard>

              {coverage.unpriced.length > 0 && (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {coverage.unpriced.length === 1
                    ? `No price came back for ${cashtag(coverage.unpriced[0]!)} just now, so it is counted at what he paid for it rather than left out.`
                    : `No price came back for ${coverage.unpriced.length} of these companies just now, so each is counted at what he paid for it rather than left out.`}{" "}
                  Everything above leans on that until the prices return.
                </p>
              )}

              {!benchmark && pickerOpen && (
                <div className="flex flex-col gap-2">
                  {myPortfolios === null ? (
                    <p className="text-sm text-muted-foreground">Loading your portfolio …</p>
                  ) : myPortfolios.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      You don&apos;t have a portfolio to compare yet.
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {myPortfolios.length === 1 ? (
                        <p className="text-sm text-foreground">{myPortfolios[0]!.name}</p>
                      ) : (
                      <NativeSelect
                        value={pickerSelection}
                        onChange={(e) => setPickerSelection(e.target.value)}
                        className="touch-target min-w-0 max-w-full"
                      >
                        <NativeSelectOption value="">
                          Choose a portfolio …
                        </NativeSelectOption>
                        {myPortfolios.map((p) => (
                          <NativeSelectOption key={p.id} value={p.id}>
                            {p.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleSetBenchmark()}
                        disabled={
                          !(
                            myPortfolios.length === 1 || pickerSelection
                          ) || benchmarkBusy
                        }
                      >
                        {benchmarkBusy ? "Adding …" : "Add"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPickerOpen(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                  {benchmarkError && (
                    <p className="text-sm text-loss">{benchmarkError}</p>
                  )}
                </div>
              )}

              <WidgetErrorBoundary name="Fund chart">
              <ComparisonChart
                series={comparisonSeries}
                labels={comparisonLabels}
              />
              </WidgetErrorBoundary>
              <p className="text-sm leading-relaxed text-muted-foreground">
                He also posts the same note every day on{" "}
                <a
                  href={FUND_X_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  X
                </a>
                , so the record is in two places rather than only this one.
              </p>
            </Panel>

            {bettingSlices.length > 0 && (
              <Panel>
                <PanelHeader
                  title="Where the money sits"
                  subtitle="Grouped by the kind of business, with the cash he has not spent."
                />
                <div>
                  <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                    {bettingSlices.map((t) => (
                      <div
                        key={t.key}
                        style={{
                          width: `${Math.max(1.5, t.pct * 100)}%`,
                          backgroundColor: t.color,
                        }}
                        title={`${t.label}: ${sliceLabel(t.pct)}`}
                      />
                    ))}
                  </div>
                  <SwatchLegend
                    className="mt-4"
                    items={bettingSlices.map((t) => ({
                      key: t.key,
                      label: t.label,
                      color: t.color,
                      value: sliceLabel(t.pct),
                    }))}
                  />
                  {/*
                    * One cell to a row on a phone. Every one of these carries a
                    * sentence under the figure, and two 123px columns turned
                    * "Concentrated" into "Concentrat" over "ed".
                    */}
                  <Scoreboard className="mt-4" cols={4} mobileCols={1}>
                    <Score
                      label={
                        <Explain
                          term="spread-out"
                          count={fundConcentration.effectivePositions}
                        >
                          How spread out
                        </Explain>
                      }
                      value={fundPersonality.diversificationBand.label}
                      sub={`Behaves like ${fundConcentration.effectivePositions.toFixed(1)} holdings of equal size`}
                    />
                    <Score
                      label={
                        <Explain
                          term="share-of-portfolio"
                          ticker={
                            biggestHolding ? cashtag(biggestHolding.ticker) : undefined
                          }
                          second={
                            biggestHolding ? sliceLabel(biggestHolding.pct) : undefined
                          }
                        >
                          Biggest single company
                        </Explain>
                      }
                      value={biggestHolding ? sliceLabel(biggestHolding.pct) : NO_VALUE}
                      sub={
                        biggestHolding
                          ? `${cashtag(biggestHolding.ticker)}, ${currency(biggestHolding.value, 0)} of ${currency(totalValue, 0)}`
                          : undefined
                      }
                    />
                    <Score
                      label="How bumpy"
                      /*
                       * `maxDrawdownPct` is a blended assumption this app keeps
                       * for each kind of business, not something measured on
                       * these four companies. It used to print as "Could fall
                       * 48% in a bad stretch", which reads as a finding. The
                       * word "assumes" is the whole difference.
                       */
                      explain="This is not a measurement of these companies. It is the fall this app assumes for a mix of these kinds of business in a bad stretch, from one figure kept per kind. Nobody knows what the real one would be."
                      value={fundPersonality.riskBand.label}
                      sub={`Assumes about a ${fundPersonality.maxDrawdownPct}% fall in a bad stretch`}
                    />
                    <Score
                      label="Share left in cash"
                      value={
                        totalValue > 0 ? percent(cash / totalValue, 0) : NO_VALUE
                      }
                      sub={
                        totalValue > 0
                          ? `${currency(cash, 0)} of ${currency(totalValue, 0)}`
                          : undefined
                      }
                    />
                  </Scoreboard>
                  {fund?.cash_purpose?.trim() ? (
                    <div className="mt-4 border-t border-border pt-4">
                      <MicroLabel>Cash is sitting for</MicroLabel>
                      <p className="mt-1.5 text-base leading-relaxed text-muted-foreground">
                        {fund.cash_purpose.trim()}
                      </p>
                    </div>
                  ) : null}
                  <div className="mt-4 border-t border-border pt-4">
                    <MicroLabel>Watching</MicroLabel>
                    {fundWatchlist.length > 0 ? (
                      <ItemGroup className="mt-2 gap-0 has-data-[size=sm]:gap-0">
                        {fundWatchlist.map((w, i) => (
                          <Fragment key={w.ticker}>
                            {i > 0 ? (
                              <ItemSeparator className="my-0" />
                            ) : null}
                            <Item size="sm" className="items-start px-0">
                              <ItemContent>
                                <ItemTitle>{cashtag(w.ticker)}</ItemTitle>
                                <ItemDescription className="line-clamp-none">
                                  {w.waitFor}
                                </ItemDescription>
                              </ItemContent>
                            </Item>
                          </Fragment>
                        ))}
                      </ItemGroup>
                    ) : (
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        {watchingNote ??
                          "He names the companies he is watching in the next daily report."}
                      </p>
                    )}
                  </div>
                </div>
              </Panel>
            )}

            {openHoldings.length > 0 && (
              <WidgetErrorBoundary name="Fund positions">
              <section className="flex flex-col gap-4">
                <SectionHeading
                  title={
                    openHoldings.length === 1
                      ? "The one company he owns now"
                      : `The ${openHoldings.length} companies he owns now`
                  }
                  eye
                />
                <div className="flex flex-col gap-3">
                  {openHoldings.map((h) => (
                    <FundPosition
                      key={h.id}
                      holding={h}
                      price={quotes[h.ticker]?.price ?? null}
                    />
                  ))}
                </div>
              </section>
              </WidgetErrorBoundary>
            )}

            {weeklyRecaps.length > 0 && (
              <section className="flex flex-col gap-4">
                <SectionHeading title="How each week went" eye />
                <div className="flex flex-col gap-3">
                  {weeklyRecaps.slice(0, weeklyVisible).map((r, i) => {
                    const title = numberedReportHeadline(
                      r.headline,
                      "Week",
                      serialFromNewest(weeklyRecaps.length, i)
                    );
                    return i === 0 ? (
                      <article
                        key={r.id}
                        className="flex flex-col gap-2 rounded-xl glass ring-1 ring-foreground/20 p-6"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <RecapMeta r={r} />
                        </div>
                        <h3 className="text-base font-semibold text-foreground">
                          {title}
                        </h3>
                        <RecapBody text={r.body} />
                      </article>
                    ) : (
                      <details
                        key={r.id}
                        className="group overflow-hidden rounded-xl glass ring-1 ring-foreground/20"
                      >
                        <summary className="flex list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
                          <ChevronRight
                            aria-hidden
                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                          />
                          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                            {title}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <RecapMeta r={r} />
                          </span>
                        </summary>
                        <div className="flex flex-col gap-2 border-t border-border px-4 py-3">
                          <RecapBody text={r.body} />
                        </div>
                      </details>
                    );
                  })}
                  <ViewMoreButton
                    remaining={weeklyRecaps.length - weeklyVisible}
                    onClick={() => setWeeklyVisible((n) => n + FEED_CHUNK)}
                  />
                </div>
              </section>
            )}

            <section className="flex flex-col gap-4">
              <SectionHeading title="Every decision, in order" eye />
              {reports.length === 0 ? (
                <p className="rounded-xl glass ring-1 ring-foreground/20 px-4 py-6 text-center text-sm leading-relaxed text-muted-foreground">
                  Nothing written down yet. The first decision is made after
                  today&apos;s market close, and it will appear here with the
                  reason behind it.
                </p>
              ) : (
                /* Latest report in full. Older ones stay collapsed, and
                 * View more only reveals the next seven so the page does
                 * not grow a wall of history. */
                <div className="flex flex-col gap-3">
                  {reports.slice(0, dailyVisible).map((r, i) => {
                    const title = numberedReportHeadline(
                      r.headline,
                      "Day",
                      serialFromNewest(reports.length, i)
                    );
                    return i === 0 ? (
                      <article
                        key={r.id}
                        className="flex flex-col gap-2 rounded-xl glass ring-1 ring-foreground/20 p-6"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <ReportMeta r={r} />
                        </div>
                        <h3 className="font-semibold text-foreground">
                          {title}
                        </h3>
                        <ReportDetail r={r} />
                      </article>
                    ) : (
                      <details
                        key={r.id}
                        className="group overflow-hidden rounded-xl glass ring-1 ring-foreground/20"
                      >
                        <summary className="flex list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
                          <ChevronRight
                            aria-hidden
                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                          />
                          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                            {title}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <ReportMeta r={r} />
                          </span>
                        </summary>
                        <div className="flex flex-col gap-2 border-t border-border px-4 py-3">
                          <ReportDetail r={r} />
                        </div>
                      </details>
                    );
                  })}
                  <ViewMoreButton
                    remaining={reports.length - dailyVisible}
                    onClick={() => setDailyVisible((n) => n + FEED_CHUNK)}
                  />
                </div>
              )}
            </section>

            {closedHoldings.length > 0 && (
              <section className="flex flex-col gap-4">
                <SectionHeading
                  title={
                    closedHoldings.length === 1
                      ? "The one company he has sold"
                      : `The ${closedHoldings.length} companies he has sold`
                  }
                />
                <ul className="divide-y divide-border overflow-hidden rounded-xl glass ring-1 ring-foreground/20">
                  {closedHoldings.map((h) => {
                    const made = h.realized_pnl;
                    return (
                      <li key={h.id} className="px-4 py-3 text-sm">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-medium text-foreground">
                            {cashtag(h.ticker)}
                          </span>
                          {/*
                            * A sale with no recorded result says so, rather
                            * than drawing a green plus over a made-up nothing:
                            * `realized_pnl ?? 0` put "+ $0" beside a company
                            * whose figure never arrived.
                            */}
                          {made == null ? (
                            <span className="font-mono text-sm tabular-nums text-muted-foreground">
                              {NO_VALUE}
                            </span>
                          ) : (
                            <span
                              className={cn(
                                "flex items-center gap-1 font-mono text-sm font-semibold tabular-nums",
                                signedTone(made, "text-muted-foreground")
                              )}
                            >
                              {made >= 0 ? (
                                <Plus className="h-3 w-3" aria-hidden />
                              ) : (
                                <Minus className="h-3 w-3" aria-hidden />
                              )}
                              {currency(Math.abs(made), 0)}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          Bought {fmtDate(h.entry_date)}, sold{" "}
                          {h.closed_at ? fmtDate(h.closed_at) : NO_VALUE}.
                          {h.exit_reasoning ? ` ${h.exit_reasoning}` : ""}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
