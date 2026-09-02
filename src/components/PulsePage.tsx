"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { track } from "@vercel/analytics";
import { cashtag, cn, currency, percent, plural, signedCurrency, signedTone } from "@/lib/format";
import {
  EmptyState,
  Metric,
  MicroLabel,
  NoteRows,
  Panel,
  PanelHeader,
  Pill,
  ScanList,
  SUGGEST_MENU,
} from "@/components/ui/Panel";
import type { ConvictionMap } from "@/lib/conviction";
import type { FearGreedSnapshot } from "@/lib/market/fear-greed";
import { humanizeMargusText } from "@/lib/ai/humanize-copy";
import { WhyThis } from "@/components/ui/WhyThis";
import {
  pulseProvenance,
  pulseRoomProvenance,
  type Provenance,
} from "@/lib/provenance";
import type { ModelRun } from "@/lib/ai/model-label";
import { isAbortError } from "@/lib/abort";
import { safeHttpUrl } from "@/lib/safe-url";
import { readJsonOrThrow } from "@/lib/http";
import type { OverviewModel } from "@/lib/overview";
import { formatRelativeTime } from "@/lib/timezone";
import {
  localTickerSuggestions,
  looksLikeTickerQuery,
  mergeAndRankTickerSuggestions,
  pickTickerSuggestion,
  resolveTypedTicker,
  type TickerSuggestion,
} from "@/lib/market/ticker-search";
import { sanitizeTickerQuery } from "@/lib/input-guard";
import { useTickerSearch } from "@/lib/use-ticker-search";
import { normalizeYahooTicker, tickerStem } from "@/lib/ticker";
import type { Quote } from "@/lib/types";
import {
  buildPulseCandidate,
  buildPulseCandidates,
  candidateRange,
  formatMovePct,
  pulseLead,
  pulseLeftHold,
  rangeSentence,
  rangeStanding,
  sectorForTicker,
  shouldAutoPulseTicker,
  sortPulseCandidates,
  buildPulseScan,
  scanLineBody,
  loadPulseSummary,
  loadPulseTickerCache,
  reconcilePulseCheck,
  savePulseSummary,
  savePulseTickerCache,
  statusLabel,
  actionLabel,
  isEmptyPulseCheck,
  isMoveRestatement,
  isPulseCacheFresh,
  normalizePulseSituation,
  verdictRepeatsSuggestion,
  type PulseAction,
  type PulseCheck,
  type PulseHeadline,
  type PulseRange,
  type PulseReport,
  type PulseCandidate,
  type ThesisStatus,
} from "@/lib/thesis-pulse";
import { indexProxyName } from "@/lib/market/index-proxy";
import { coinFromSymbol } from "@/lib/coins";
import { ratingForScore } from "@/lib/market/fear-greed";
import {
  daySize,
  typicalMoveFromCloses,
  type TypicalMove,
} from "@/lib/typical-move";
import {
  marketOrYou,
  marketOrYouLine,
  standoutLine,
} from "@/lib/market-or-you";
import { fundCopyBullets } from "@/lib/fund-copy";
import { loadFearGreedPaint, loadMacroPaint, saveMacroPaint } from "@/lib/paint-cache";
import {
  loadPulseHistory,
  recordPulseHistory,
} from "@/lib/pulse-history";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  PenLine,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from "react";

type Props = {
  model: OverviewModel;
  quotes: Record<string, Quote>;
  convictions: ConvictionMap;
  intentTicker?: string | null;
  onIntentConsumed?: () => void;
  onWriteThesis?: (ticker: string) => void;
  onStamp?: (
    ticker: string,
    stamp: {
      at: string;
      verdict: string;
      line: string;
      action?: string;
      thesisStatus?: string;
    }
  ) => void;
};

function thesisDisplayBullets(text: string | undefined): string[] {
  const sentences = normalizePulseSituation(text ?? "");
  if (sentences.length > 0) return sentences.slice(0, 6);
  return fundCopyBullets(text);
}

/*
 * `watch` used to draw an eye, which is the glyph `WhyThis` uses for the
 * provenance mark eight pixels away in the same header row. Two meanings
 * for one mark is exactly what that component's own note forbids, so the
 * eye stays with provenance and watch takes a dashed ring: something is
 * unsettled rather than something is wrong.
 */
function StatusIcon({ status }: { status: ThesisStatus }) {
  if (status === "watch") {
    return <CircleDashed data-icon="inline-start" />;
  }
  if (status === "broken") {
    return <XCircle data-icon="inline-start" />;
  }
  return <CheckCircle2 data-icon="inline-start" />;
}

/*
 * Colour on this screen belongs to the thesis status and nothing else.
 * A range tag says where the price sits between a measured low and a
 * measured high, which is a fact rather than a verdict, and painting
 * "Below recent range" green read as a nudge to buy the dip.
 */
function ActionBadge({ action }: { action: PulseAction }) {
  return <Pill tone="neutral">{actionLabel(action)}</Pill>;
}

/**
 * The rim follows the reason, never the sign of the day.
 *
 * It used to go red on any card that was down, so a company at minus one
 * per cent with an intact thesis and a price above its own range wore the
 * same alarm as one whose reason had actually broken. That repeats the
 * minus sign printed an inch away and says nothing. Red here means the
 * reason changed.
 */
function pulseCardChrome({
  pinned,
  status,
}: {
  pinned: boolean;
  status: ThesisStatus | null;
}): string {
  if (pinned) return "border-l-4 border-l-primary";
  if (status === "broken") return "border-l-4 border-l-destructive";
  if (status === "watch") return "border-l-4 border-l-warning";
  return "";
}

/**
 * What the company does, in the words a beginner needs.
 *
 * The prompt has always told the model that "a reader should know which
 * company you mean without seeing the ticker", and the card itself then
 * printed $VOO and nothing else. What the app already knows is used and
 * nothing is guessed: the coin list names a coin, `indexProxyName` names
 * the index a fund tracks, and `sectorForTicker` says in a few plain
 * words what a company sells. A name the app cannot describe gets no
 * line, because a wrong description is worse than a bare cashtag.
 */
function companyLabel(ticker: string): string {
  // Both spellings, because a holding is stored as "BTC" and the coin list
  // is keyed on the symbol the provider uses. Missing that put "Coins" on
  // the card, which is the bucket rather than the thing.
  const coin = coinFromSymbol(ticker) ?? coinFromSymbol(normalizeYahooTicker(ticker));
  if (coin) return coin.name;
  const index = indexProxyName(ticker);
  if (index) return `A fund that tracks the ${index}`;
  const sector = sectorForTicker(ticker);
  return sector && sector !== "Coins" ? sector : "";
}

/**
 * Where today's price sits between the measured low and high.
 *
 * A number and a sentence say it, and this says it again in a shape,
 * because "between $190 and $240" takes a moment to place and a dot on a
 * line takes none. The dot is offset by half its own width rather than
 * translated, so at either end it stops flush instead of hanging over.
 */
function RangeBar({ price, range }: { price: number; range: PulseRange }) {
  const at = rangeStanding(price, range);
  if (at == null) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-2.5">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
        <span
          className="absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-foreground"
          style={{ left: `calc(${(at * 100).toFixed(1)}% - 0.3125rem)` }}
          aria-hidden
        />
      </div>
      <div className="flex items-baseline justify-between font-mono text-xs tabular-nums text-muted-foreground">
        <span>{currency(range.low)}</span>
        <span>{currency(range.high)}</span>
      </div>
    </div>
  );
}

/**
 * The eye behind a card nobody modelled.
 *
 * `pulseProvenance` opens "A language model read your own reason for
 * owning $X", names a model and lists headlines among its inputs. On a row
 * the server filled from a fixed rule about today's move, every one of
 * those sentences is false, and this is the surface whose whole purpose is
 * that a skeptic can check it. So a rule-written card gets its own
 * account, which credits arithmetic and says exactly which arithmetic.
 *
 * Written here rather than in `provenance.ts` because that file belongs to
 * every surface in the app and this shape is Pulse's alone.
 */
function ruleProvenance(ticker: string, at?: string): Provenance {
  const tag = cashtag(ticker);
  return {
    maker: "arithmetic",
    title: "Where this came from",
    headline: `No model looked at ${tag} in the last run. This badge is a fixed rule about how far the price moved today, and nothing else.`,
    inputs: [
      { what: "Today's move", detail: "the percentage printed on this card" },
      {
        what: "How much of your portfolio this is",
        detail: "which only decides the size of the take-off figure",
      },
    ],
    sources: [
      {
        name: "Yahoo Finance",
        what: "today's price and yesterday's close",
        href: "https://finance.yahoo.com",
      },
      { name: "Your holdings", what: "the share counts you typed in" },
    ],
    steps: [
      "Up 12% or more in a day, or up 8% on a holding that has already doubled, reads as above its recent range.",
      "Down 5% or more reads as below it. Anything else reads as inside it.",
      "Nothing here read a headline, your reason for owning it, or anything the company did.",
    ],
    blindSpots: [
      "Anything about the company. No article, filing or note was fetched or read for this card.",
      "Your own reason for owning it, which nothing here compared the price against.",
      "It is not a price target, and it is nobody telling you to buy or sell.",
    ],
    at,
    yours:
      "Press the re-check on this card and it goes back to the model. A card written this way is asked again on your next visit.",
  };
}

function PulseCard({
  candidate: c,
  check,
  headlines,
  loading,
  convictionThesis,
  checkedAt,
  writtenBy,
  onRefresh,
  onWriteThesis,
  pinned = false,
  leftHold = false,
}: {
  candidate: PulseCandidate;
  check?: PulseCheck;
  headlines: PulseHeadline[];
  loading: boolean;
  convictionThesis?: string;
  checkedAt?: string;
  /** The model that answered the last live run, when one has run here. */
  writtenBy?: ModelRun | null;
  onRefresh?: () => void;
  onWriteThesis?: () => void;
  pinned?: boolean;
  leftHold?: boolean;
}) {
  const pct = c.effectivePct;
  const hasPct = pct != null && Number.isFinite(pct);
  const up = (pct ?? 0) >= 0;
  const range = candidateRange(c);
  const label = companyLabel(c.ticker);
  // Re-applied at render time (not just when the check is first cached) so
  // an already-cached "broken" + "hold" contradiction from before this
  // guardrail existed, or from a stale server/localStorage entry, clears
  // immediately instead of waiting out the cache window.
  const shown =
    check && !isEmptyPulseCheck(check) ? reconcilePulseCheck(check) : null;
  const status = shown?.thesisStatus ?? "intact";
  const action = shown?.action ?? "hold";
  const writtenThesis = thesisDisplayBullets(convictionThesis);
  // A row nobody modelled wore the model's badge, the model's eye and the
  // model's name, and the page stamped its action into lab state, which
  // is where the Sunday letter's suggestions come from. It says so now.
  const fromRule = Boolean(shown?.fallback);
  /*
   * A rule-written row with no measured range has no range tag to show. It
   * would say "Inside recent range" from the enum's default, over a card
   * with no low and no high anywhere on it, which is the exact claim this
   * whole pass exists to stop the app making.
   */
  const ruleWithoutRange = fromRule && !range;
  const suggestion = shown && !ruleWithoutRange ? pulseLead(shown) : "";
  const situation = shown && !fromRule ? normalizePulseSituation(shown.situation) : [];
  const cleanedVerdict = shown?.verdict
    ? humanizeMargusText(shown.verdict)
    : "";
  const extraVerdict =
    cleanedVerdict &&
    !verdictRepeatsSuggestion(cleanedVerdict, shown) &&
    !isMoveRestatement(cleanedVerdict)
      ? cleanedVerdict
      : "";
  const hasBody =
    Boolean(shown) ||
    writtenThesis.length > 0 ||
    Boolean(onWriteThesis);
  const needsMargusRun = !loading && !shown;

  /*
   * One row of pills under the price line at every width, and the re-check
   * alone in the header's action column at every width.
   *
   * It used to be the whole row in both places, one of them hidden per
   * breakpoint, and on a phone the two pills filled the row and dropped
   * the re-check glyph onto a third line of its own: a 36px band for one
   * icon. Drawing each thing once, in the place it belongs, is shorter
   * here and fixes that.
   *
   * A broken thesis shows the status pill alone. `reconcilePulseCheck`
   * guarantees broken pairs with sell, so "Reason no longer matches" and
   * "Thesis broken" beside each other were one fact printed twice.
   */
  const pillRow = (
    <>
      {shown ? (
        <>
          {status === "broken" || ruleWithoutRange ? null : (
            <ActionBadge action={action} />
          )}
          <Pill
            tone={
              status === "broken"
                ? "bad"
                : status === "watch"
                  ? "warn"
                  : "good"
            }
          >
            <StatusIcon status={status} />
            {statusLabel(status)}
          </Pill>
          {leftHold ? <Pill tone="neutral">Reading changed today</Pill> : null}
          {(check?.checkedAt ?? checkedAt) ? (
            <span className="text-sm text-muted-foreground">
              Checked {formatRelativeTime(check?.checkedAt ?? checkedAt!)}
            </span>
          ) : null}
        </>
      ) : loading ? (
        <span className="text-sm text-muted-foreground">Reading the news …</span>
      ) : null}
    </>
  );

  return (
    /*
      `defer-paint`: Pulse is a single block of 498 elements 5,812px tall,
      which is seven screens of cards a reader sees one of. The browser
      skips style, layout and paint for the ones off screen and picks each
      up as it comes near, remembering its real height once measured. The
      card carries no sticky child, which is the one thing that rule
      forbids -- see the note in globals.css.
    */
    <li
      id={`pulse-card-${c.ticker}`}
      className="defer-paint scroll-mt-28"
    >
      <Card
        className={pulseCardChrome({
          pinned,
          status: shown ? status : null,
        })}
      >
      {/*
        * The pills sit under the price line, and the re-check keeps the
        * header's action column to itself at every width. See the note on
        * `pillRow`.
        */}
      <CardHeader>
        <CardTitle className="col-start-1 row-start-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {onWriteThesis ? (
            <Button
              type="button"
              variant="link"
              onClick={onWriteThesis}
              className="h-auto p-0 text-base font-semibold text-foreground"
            >
              {cashtag(c.ticker)}
            </Button>
          ) : (
            cashtag(c.ticker)
          )}
          {label ? (
            <span className="text-sm font-normal text-muted-foreground">
              {label}
            </span>
          ) : null}
          {shown ? (
            fromRule ? (
              <WhyThis provenance={ruleProvenance(c.ticker, check?.checkedAt ?? checkedAt)} />
            ) : (
              <WhyThis
                provenance={pulseProvenance({
                  ticker: c.ticker,
                  hasOwnReason: Boolean(convictionThesis?.trim()),
                  headlineCount: headlines.length,
                  publishers: headlines.map((h) => h.publisher),
                  /*
                    The row's own answer where it has one, and only the
                    run's as a fallback. Most of a Pulse screen is cache
                    hits, several of them written for a different reader
                    hours earlier, and stamping the current run's model and
                    "just now" across all of them made the one panel whose
                    job is to say where a sentence came from the least
                    reliable thing on the card.
                  */
                  at: check?.checkedAt ?? checkedAt,
                  model: check?.writtenBy ?? writtenBy,
                })}
              />
            )
          ) : null}
        </CardTitle>
        {/*
          * The move and the session it belongs to are two readings, not
          * one string. At `gap-1` in a single inline row they sat 4px
          * apart in the same rhythm as the arrow glyph, so "+1.1%" and
          * "After-hours" ran together as one crowded token. The figure
          * keeps its arrow tight; the label gets a clear step and its own
          * line when there is no room beside it.
          *
          * A lookup whose price never arrived has no move to draw, and it
          * used to render "n/a" with a green up-arrow beside $0.00.
          */}
        <CardDescription className="col-start-1 row-start-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-medium tabular-nums">
          {hasPct ? (
            <>
              <span
                className={cn(
                  "inline-flex items-center gap-1",
                  up ? "text-gain" : "text-loss"
                )}
              >
                {up ? (
                  <TrendingUp className="size-3.5" />
                ) : (
                  <TrendingDown className="size-3.5" />
                )}
                {formatMovePct(pct)}
              </span>
              <span className="font-normal text-muted-foreground">
                {c.moveLabel}
              </span>
            </>
          ) : (
            <span className="font-normal text-muted-foreground">
              No price yet
            </span>
          )}
        </CardDescription>
        {onRefresh ? (
          <CardAction>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onRefresh}
              disabled={loading}
              aria-label={`Read ${c.ticker} again`}
              className="relative text-muted-foreground after:absolute after:-inset-2 after:content-['']"
            >
              <RefreshCw className={cn(loading && "animate-spin")} />
            </Button>
          </CardAction>
        ) : null}
        <div className="col-start-1 row-start-3 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {pillRow}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
      {c.inBook ? (
        <div className="glass-well grid grid-cols-2 gap-x-4 gap-y-5 rounded-lg p-4 sm:grid-cols-4 sm:gap-6 sm:p-6">
          {/* "worth", not "you hold": the hint truncates, and at 124px on
              a phone "you hold $4,566.38" loses its last two digits. */}
          <Metric label="Price" hint={`worth ${currency(c.currentValue)}`}>
            {currency(c.price)}
          </Metric>
          <Metric
            label="Today"
            valueClassName={signedTone(c.todayDollar, "text-foreground")}
          >
            {signedCurrency(c.todayDollar)}
          </Metric>
          <Metric
            label="All time"
            valueClassName={signedTone(c.roiPct, "text-foreground")}
          >
            {percent(c.roiPct)}
          </Metric>
          {/*
            * "Portfolio" alone did not say what the figure was a share
            * of, and "Share of portfolio" does not fit. Measured on a 390px
            * phone the column is 124px and the label tier is 12px mono at
            * 1.2px tracking, so a label has about fourteen characters
            * before it wraps to two lines and drops its figure below the
            * three beside it.
            */}
          <Metric
            label="Of your total"
            hint={c.portfolios.length > 0 ? c.portfolios.join(", ") : undefined}
          >
            {percent(c.bookPct)}
          </Metric>
        </div>
      ) : (
        <div className="glass-well rounded-lg px-4 py-3">
          <p className="text-sm tabular-nums text-muted-foreground">
            {hasPct ? `${currency(c.price)}. ` : ""}Not in your portfolio.
          </p>
        </div>
      )}

      {/*
        * The lead sentence is unlabelled: it is the answer, and a label
        * over it would only say "answer". Under it, the measured range as
        * a sentence and as a shape, then what the model actually saw, then
        * the reader's own reason. `NoteRows` puts the kind of each in the
        * gutter, because as four identical grey paragraphs a reader could
        * not tell the model's reasoning from their own note.
        */}
      {hasBody ? (
        <div className="flex flex-col gap-4 glass-well rounded-lg p-4 sm:p-5">
          {suggestion ? (
            <p className="text-base font-medium leading-relaxed text-foreground">
              {suggestion}
            </p>
          ) : null}
          {fromRule ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {ruleWithoutRange
                ? "Nobody has read this one yet, and there is not enough price history to say where it sits."
                : "Nobody has read this one yet. The badge above is where the price sits between the two figures below, and nothing else."}
            </p>
          ) : null}
          {range ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {rangeSentence(c.price, range)}
              </p>
              <RangeBar price={c.price} range={range} />
            </div>
          ) : null}
          {situation.length > 0 ? (
            <div className="flex flex-col gap-2">
              <MicroLabel>What happened</MicroLabel>
              <ul className="flex list-disc flex-col gap-1.5 pl-5">
                {situation.map((line) => (
                  <li
                    key={line}
                    className="text-sm leading-relaxed text-muted-foreground"
                  >
                    {humanizeMargusText(line)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <NoteRows
            rows={[
              { label: "Why", body: extraVerdict },
              {
                label: "Why you own it",
                body:
                  writtenThesis.length > 0 ? (
                    writtenThesis.join(" ")
                  ) : onWriteThesis ? (
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span>You have not written down why you own this one.</span>
                      <Button
                        type="button"
                        variant="link"
                        onClick={onWriteThesis}
                        className="h-auto p-0 text-sm"
                      >
                        <PenLine data-icon="inline-start" />
                        Write it in one sentence
                      </Button>
                    </span>
                  ) : (
                    ""
                  ),
              },
              { label: "Earnings", body: shown?.earningsNote ?? "" },
              { label: "Breaks if", body: shown?.thesisBreak ?? "" },
            ]}
          />
        </div>
      ) : null}

      {needsMargusRun ? (
        <p className="text-sm text-muted-foreground">
          No reading for this one yet.
        </p>
      ) : null}

      {headlines.length > 0 && (
        <div className="border-t border-border pt-4">
          <MicroLabel>In the news</MicroLabel>
          <ul className="mt-2 flex flex-col gap-2">
            {headlines.slice(0, 2).map((h) => {
              const href = safeHttpUrl(h.link);
              return (
                <li key={h.link || h.title} className="flex flex-col gap-0.5">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm leading-snug text-muted-foreground hover:text-foreground"
                    >
                      {h.title}
                    </a>
                  ) : (
                    <span className="text-sm leading-snug text-muted-foreground">
                      {h.title}
                    </span>
                  )}
                  {/* Who wrote it and when, so a reader can weigh a wire
                      report from this morning against a blog from last
                      month. Both were already on every headline. */}
                  {h.publisher || h.publishedAt ? (
                    <span className="text-sm text-muted-foreground/70">
                      {[
                        h.publisher,
                        h.publishedAt ? formatRelativeTime(h.publishedAt) : "",
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      </CardContent>
      </Card>
    </li>
  );
}

function quoteForTicker(
  quotes: Record<string, Quote>,
  ticker: string
): Quote | null {
  const resolved = normalizeYahooTicker(ticker);
  return quotes[resolved] ?? quotes[ticker] ?? quotes[ticker.toUpperCase()] ?? null;
}

async function fetchQuote(
  ticker: string,
  signal?: AbortSignal
): Promise<Quote | null> {
  const resolved = normalizeYahooTicker(ticker);
  try {
    const res = await fetch(
      `/api/quotes?tickers=${encodeURIComponent(resolved)}`,
      { signal }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return quoteForTicker((data.quotes ?? {}) as Record<string, Quote>, resolved);
  } catch (err) {
    if (isAbortError(err)) return null;
    return null;
  }
}

/**
 * The day, said once, at the top.
 *
 * The model has always written a one-sentence read on the whole portfolio
 * and this page has always thrown it away (`const [, setSummary]`), so on
 * a red day the room opened with a search box, a table and a list before
 * a single sentence said what had happened. It leads now, and when no
 * model has answered the arithmetic below says the same kind of thing
 * from the reader's own price history instead.
 */

/**
 * Consecutive daily closes for a name, newest last.
 *
 * Dated bars and nothing else. A `sparkline` looks like the same series and
 * is not: it is downsampled to 32 points over about ninety days, so the gap
 * between two of them is roughly three days. `typicalMoveFromCloses` would
 * take the median of those gaps and call it an ordinary day, which is about
 * three times too large, and the story above would then report a genuinely
 * unusual day as an ordinary one. A name with no dated history is simply
 * left out of the count.
 */
function closesFor(quote: Quote | null | undefined): number[] {
  return (quote?.dailyCloses ?? [])
    .map((row) => row.close)
    .filter((c) => Number.isFinite(c) && c > 0);
}

/**
 * How many holdings had a bigger day than usual, in a sentence.
 *
 * Every figure here is counted rather than estimated, and a name whose
 * history is too short to have a usual day is left out of both halves of
 * the count rather than guessed at, which is why the two numbers are
 * printed rather than one being subtracted from the total.
 */
export function unusualDayLine(
  rows: { todayPct: number | null; typical: TypicalMove | null }[]
): string {
  let bigger = 0;
  let ordinary = 0;
  for (const row of rows) {
    if (row.typical == null || row.todayPct == null) continue;
    if (daySize(row.todayPct, row.typical) === "ordinary") ordinary += 1;
    else bigger += 1;
  }
  const measured = bigger + ordinary;
  if (measured === 0) return "";
  if (bigger === 0) {
    return `All ${plural(measured, "holding")} stayed inside the range they usually move in today.`;
  }
  if (ordinary === 0) {
    return `${plural(bigger, "holding")} moved more than usual today.`;
  }
  return `${bigger} of your ${plural(measured, "holding")} moved more than usual today, and the other ${ordinary} stayed in their normal range.`;
}

/**
 * The market's mood as a word and a number.
 *
 * The score has been fetched on every visit to this room since it was
 * written, sent to the model, and shown to the reader nowhere. It is a
 * reading of everybody else rather than of anything the reader owns, so
 * it is said plainly and last.
 */
export function marketMoodLine(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "";
  const rounded = Math.round(score);
  return `Other people are feeling ${ratingForScore(rounded)} about the market today, ${rounded} out of 100.`;
}

/**
 * The index the reader's own day is set beside.
 *
 * `^GSPC` is the S&P 500 itself rather than a fund tracking it, because
 * the sentence says "The S&P 500 is down 1.8% today" and it should be
 * that index's own figure.
 */
const MARKET_INDEX = "^GSPC";
const MARKET_INDEX_NAME = "The S&P 500";

async function resolveListedTicker(
  raw: string,
  signal?: AbortSignal
): Promise<string> {
  const query = raw.trim();
  const resolved = looksLikeTickerQuery(query)
    ? normalizeYahooTicker(query)
    : "";
  try {
    const res = await fetch(
      `/api/market/search?q=${encodeURIComponent(query)}`,
      { signal, cache: "no-store" }
    );
    if (!res.ok) return resolved || query.toUpperCase();
    const data = (await res.json()) as { results?: TickerSuggestion[] };
    const hit = pickTickerSuggestion(query, data.results ?? []);
    return hit?.symbol ? normalizeYahooTicker(hit.symbol) : resolved || query.toUpperCase();
  } catch (err) {
    if (isAbortError(err)) return resolved || query.toUpperCase();
    return resolved || query.toUpperCase();
  }
}

export const PulsePage = memo(function PulsePage({
  model,
  quotes,
  convictions,
  intentTicker,
  onIntentConsumed,
  onWriteThesis,
  onStamp,
}: Props) {
  const [searchInput, setSearchInput] = useState("");
  const [pinnedTicker, setPinnedTicker] = useState<string | null>(null);
  const [lookupQuotes, setLookupQuotes] = useState<Record<string, Quote>>({});
  const searchRef = useRef<HTMLDivElement>(null);
  const remoteSuggestions = useTickerSearch(searchInput);

  // Dashboard passes onStamp as an inline arrow and re-renders on a 1s timer,
  // so its identity changes constantly. Depending on it directly would rebuild
  // the check callback (and re-fire the effect keyed off it) every second;
  // leaving it out of the deps would pin the very first closure and stamp
  // stale state. A ref refreshed every render gives a stable dependency and a
  // current callback at the same time.
  const onStampRef = useRef(onStamp);
  useEffect(() => {
    onStampRef.current = onStamp;
  }, [onStamp]);

  const mergedQuotes = useMemo(
    () => ({ ...quotes, ...lookupQuotes }),
    [quotes, lookupQuotes]
  );

  const bookTickers = useMemo(
    () => model.tickers.map((t) => t.ticker.toUpperCase()),
    [model.tickers]
  );

  const suggestions = useMemo(() => {
    const q = searchInput.trim();
    if (!q) return [];
    const stem = tickerStem(q.toUpperCase());
    const local = bookTickers
      .filter(
        (t) =>
          t.includes(q.toUpperCase()) ||
          tickerStem(t) === stem ||
          tickerStem(t).startsWith(stem)
      )
      .map((t) => ({ symbol: t, name: "in your portfolio" }));
    const coins = localTickerSuggestions(q, [], new Set());
    return mergeAndRankTickerSuggestions(q, [...coins, ...local], remoteSuggestions, new Set());
  }, [bookTickers, remoteSuggestions, searchInput]);

  const candidates = useMemo(
    () => buildPulseCandidates(model, mergedQuotes),
    [model, mergedQuotes]
  );

  // Every check + its headlines, retained per ticker for good — never
  // cleared just because a background refresh is running or a new
  // calendar day started. Hydrated SYNCHRONOUSLY from localStorage in the
  // lazy initializer (not a useEffect) so the very first render already
  // has it: runPulse's mount effect fires in the same commit as
  // hydrateTicker's effect, so if hydration happened one tick later via
  // useEffect, runPulse would see these maps still empty, treat every
  // ticker as "never checked", and hit the network on every single mount
  // regardless of how fresh the cache actually was.
  const [checksByTicker, setChecksByTicker] = useState<
    Record<string, PulseCheck>
  >(() => {
    const out: Record<string, PulseCheck> = {};
    for (const c of candidates) {
      const cached = loadPulseTickerCache(c.ticker);
      if (cached && !isEmptyPulseCheck(cached.check)) {
        out[c.ticker.toUpperCase()] = cached.check;
      }
    }
    return out;
  });
  const [headlinesByTicker, setHeadlinesByTicker] = useState<
    Record<string, PulseHeadline[]>
  >(() => {
    const out: Record<string, PulseHeadline[]> = {};
    for (const c of candidates) {
      const cached = loadPulseTickerCache(c.ticker);
      if (cached && !isEmptyPulseCheck(cached.check)) {
        out[c.ticker.toUpperCase()] = cached.headlines;
      }
    }
    return out;
  });
  /*
   * Which model answered the most recent live run, straight from the route
   * that made the call. Not stored per ticker and not persisted: a reading
   * that came back from cache was written by whichever model ran then, and
   * this app did not record that, so the eye says nothing rather than
   * naming the model that happens to be answering today.
   */
  const [writtenBy, setWrittenBy] = useState<ModelRun | null>(null);

  const [checkedAtByTicker, setCheckedAtByTicker] = useState<
    Record<string, string>
  >(() => {
    const out: Record<string, string> = {};
    for (const c of candidates) {
      const cached = loadPulseTickerCache(c.ticker);
      if (cached && !isEmptyPulseCheck(cached.check)) {
        out[c.ticker.toUpperCase()] = cached.cachedAt;
      }
    }
    return out;
  });
  const [checkingTickers, setCheckingTickers] = useState<Set<string>>(
    new Set()
  );
  const [summary, setSummary] = useState("");
  /**
   * The S&P 500's own move, fetched beside the Pulse quotes.
   *
   * On a red day the one thing a beginner cannot work out from this room
   * is whether everything fell or only their own companies did, and that
   * difference is the whole of what a thesis check is for. `marketOrYou`
   * states the two figures side by side and never models a split between
   * them.
   */
  const [indexQuote, setIndexQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fearGreed, setFearGreed] = useState<FearGreedSnapshot | null>(null);

  // Belt-and-suspenders against the same stale-closure class of bug the
  // lazy initializers above just fixed: if candidates ever go from empty
  // to populated across a render (data arriving after mount), the
  // hydrate-cache effect and the runPulse-trigger effect below both fire
  // in the same commit, in declaration order — a ref always reflects the
  // latest value regardless of that ordering, a plain state closure
  // wouldn't.
  const checkedAtByTickerRef = useRef(checkedAtByTicker);
  checkedAtByTickerRef.current = checkedAtByTicker;
  const checksByTickerRef = useRef(checksByTicker);
  checksByTickerRef.current = checksByTicker;

  const hydrateTicker = useCallback((ticker: string) => {
    const key = ticker.trim().toUpperCase();
    const cached = loadPulseTickerCache(key);
    if (!cached || isEmptyPulseCheck(cached.check)) return;
    setChecksByTicker((prev) =>
      prev[key] ? prev : { ...prev, [key]: reconcilePulseCheck(cached.check) }
    );
    setHeadlinesByTicker((prev) =>
      prev[key] ? prev : { ...prev, [key]: cached.headlines }
    );
    setCheckedAtByTicker((prev) =>
      prev[key] ? prev : { ...prev, [key]: cached.cachedAt }
    );
  }, []);

  const pinnedCandidate = useMemo(() => {
    if (!pinnedTicker) return null;
    return buildPulseCandidate(pinnedTicker, model, mergedQuotes);
  }, [pinnedTicker, model, mergedQuotes]);

  const leftHoldTickers = useMemo(() => {
    const left = new Set<string>();
    for (const c of candidates) {
      const key = c.ticker.toUpperCase();
      if (pulseLeftHold(checksByTicker[key]?.action, loadPulseHistory(key))) {
        left.add(key);
      }
    }
    if (pinnedTicker) {
      const key = pinnedTicker.toUpperCase();
      if (pulseLeftHold(checksByTicker[key]?.action, loadPulseHistory(key))) {
        left.add(key);
      }
    }
    return left;
  }, [candidates, checksByTicker, pinnedTicker]);

  const actionByTicker = useMemo(() => {
    const out: Record<string, PulseCheck["action"] | undefined> = {};
    for (const key of Object.keys(checksByTicker)) {
      out[key] = checksByTicker[key]?.action;
    }
    return out;
  }, [checksByTicker]);

  const ranked = useMemo(
    () => sortPulseCandidates(candidates, { leftHoldTickers, actionByTicker }),
    [candidates, leftHoldTickers, actionByTicker]
  );

  const attention = useMemo(
    () =>
      ranked.filter((c) => {
        const key = c.ticker.toUpperCase();
        return (
          key !== pinnedTicker &&
          (c.isBigMove || leftHoldTickers.has(key))
        );
      }),
    [ranked, pinnedTicker, leftHoldTickers]
  );
  const rest = useMemo(
    () =>
      ranked.filter((c) => {
        const key = c.ticker.toUpperCase();
        return (
          key !== pinnedTicker &&
          !c.isBigMove &&
          !leftHoldTickers.has(key)
        );
      }),
    [ranked, pinnedTicker, leftHoldTickers]
  );

  const scanRows = useMemo(
    () =>
      buildPulseScan(
        ranked.map((c) => {
          const key = c.ticker.toUpperCase();
          return {
            ticker: key,
            isBigMove: c.isBigMove,
            leftHold: leftHoldTickers.has(key),
            effectivePct: c.effectivePct,
            moveLabel: c.moveLabel,
            check: checksByTicker[key],
            headline: headlinesByTicker[key]?.[0]?.title ?? null,
            bookPct: c.bookPct,
            price: c.price,
          };
        })
      ),
    [ranked, leftHoldTickers, checksByTicker, headlinesByTicker]
  );

  /**
   * Where today sits against an ordinary day, per holding.
   *
   * Read straight off the closes each quote already carries, so it costs
   * no request. A name whose provider gave a short series answers null and
   * is left out of the count rather than guessed at.
   */
  const typicalByTicker = useMemo(() => {
    const out: Record<string, TypicalMove | null> = {};
    for (const c of candidates) {
      const key = c.ticker.toUpperCase();
      out[key] = typicalMoveFromCloses(closesFor(quoteForTicker(mergedQuotes, key)));
    }
    return out;
  }, [candidates, mergedQuotes]);

  const marketSplit = useMemo(
    () =>
      marketOrYou({
        marketPct: indexQuote ? (indexQuote.changePercent ?? null) : null,
        yoursPct: model.totals.todayPct,
        holdings: candidates
          .filter((c) => c.inBook)
          .map((c) => ({
            ticker: c.ticker,
            label: cashtag(c.ticker),
            todayPct: c.effectivePct,
          })),
      }),
    [indexQuote, model.totals.todayPct, candidates]
  );

  /**
   * The day in one sentence, the model's if it wrote one.
   *
   * The arithmetic line is not a lesser version of the model's: it answers
   * a different question, in numbers, and it is the honest thing to say
   * when nobody has read the news.
   */
  const dayStory = useMemo(() => {
    const written = summary.trim();
    if (written) return written;
    return unusualDayLine(
      candidates
        .filter((c) => c.inBook)
        .map((c) => ({
          todayPct: c.effectivePct,
          typical: typicalByTicker[c.ticker.toUpperCase()] ?? null,
        }))
    );
  }, [summary, candidates, typicalByTicker]);

  const marketLine = marketOrYouLine(marketSplit, MARKET_INDEX_NAME, (n) =>
    percent(n)
  );
  const standouts = standoutLine(marketSplit, (n) => percent(n));
  const mood = marketMoodLine(fearGreed?.score ?? null);

  /**
   * Names the model has not read: never checked, or filled by the fixed
   * rule because every provider was busy. One notice for all of them, at
   * the top, with one button. Six cards each claiming Margus "has not
   * finished looking" while nothing was running was six wrong sentences.
   */
  const lastCheckedAt = useMemo(
    () => Object.values(checkedAtByTicker).sort().at(-1) ?? null,
    [checkedAtByTicker]
  );
  const anyChecking = checkingTickers.size > 0;

  const unread = useMemo(
    () =>
      ranked.filter((c) => {
        const key = c.ticker.toUpperCase();
        const check = checksByTicker[key];
        return !check || isEmptyPulseCheck(check) || check.fallback === true;
      }),
    [ranked, checksByTicker]
  );

  const scrollToPulseCard = useCallback((ticker: string) => {
    document
      .getElementById(`pulse-card-${ticker}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);


  useEffect(() => {
    for (const c of candidates) hydrateTicker(c.ticker);
  }, [candidates, hydrateTicker]);

  useLayoutEffect(() => {
    const cached = loadPulseSummary();
    if (cached) setSummary(humanizeMargusText(cached.summary));
    const fg = loadFearGreedPaint();
    if (fg) setFearGreed(fg);
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void fetch("/api/market/fear-greed", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!ctrl.signal.aborted && data?.score != null) {
          const fg = data as FearGreedSnapshot;
          setFearGreed(fg);
          saveMacroPaint({
            macro: loadMacroPaint()?.macro ?? {
              vix: null,
              eurusd: null,
              btc: null,
              tenYear: null,
            },
            fearGreed: fg,
          });
        }
      })
      .catch((err) => {
        if (isAbortError(err)) return;
      });
    return () => {
      ctrl.abort();
    };
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void fetchQuote(MARKET_INDEX, ctrl.signal).then((q) => {
      if (!ctrl.signal.aborted && q) setIndexQuote(q);
    });
    return () => {
      ctrl.abort();
    };
  }, []);

  useEffect(() => {
    if (!pinnedTicker) return;
    const t = window.setTimeout(() => {
      document
        .getElementById(`pulse-card-${pinnedTicker}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(t);
  }, [pinnedTicker, checkingTickers]);

  // Synchronous in-flight guard — a Pulse LLM call can take 40+ seconds,
  // and `candidates` gets a new array reference every time quotes refresh
  // (~45s) or fear-greed loads, which was re-firing the mount effect mid-
  // request and launching duplicate overlapping batch calls for the same
  // tickers (visible server-side as concurrent 40–46s POSTs, one of which
  // then gets its response aborted). `checkingTickers` state is async/
  // batched and not safe to read-then-write inside the same tick for this;
  // a ref updates immediately so a near-simultaneous second call always
  // sees the first call's claim.
  const inFlightRef = useRef<Set<string>>(new Set());
  const pageAbortRef = useRef(new AbortController());
  useEffect(() => {
    const ctrl = pageAbortRef.current;
    return () => ctrl.abort();
  }, []);

  /**
   * Checks a set of tickers in one request. Auto only covers a name that
   * was never checked, a 5% mover whose last read is stale, or a name
   * whose cached Why is a leftover "Today move is -5.8%" restatement.
   * Tickers being refreshed keep showing their old result until the new
   * read lands.
   */
  const runPulse = useCallback(
    async (targets: PulseCandidate[], opts?: { force?: boolean; signal?: AbortSignal }) => {
      if (targets.length === 0) return;
      const force = opts?.force ?? false;
      const notInFlight = targets.filter(
        (c) => !inFlightRef.current.has(c.ticker.toUpperCase())
      );
      const stale = force
        ? notInFlight
        : notInFlight.filter((c) => {
            const key = c.ticker.toUpperCase();
            return shouldAutoPulseTicker({
              needsAttention: c.isBigMove,
              cachedAt: checkedAtByTickerRef.current[key] ?? "",
              check: checksByTickerRef.current[key] ?? loadPulseTickerCache(key)?.check,
            });
          });
      if (stale.length === 0) return;
      if (force) track("thesis_pulse_refresh", { tickers: stale.length });

      const staleKeys = stale.map((c) => c.ticker.toUpperCase());
      for (const key of staleKeys) inFlightRef.current.add(key);
      setCheckingTickers((prev) => new Set([...prev, ...staleKeys]));
      setError(null);
      try {
        const convictionPayload: Record<
          string,
          { thesis?: string; level?: number }
        > = {};
        for (const c of stale) {
          const entry = convictions[c.ticker.toUpperCase()];
          if (entry) {
            convictionPayload[c.ticker.toUpperCase()] = {
              thesis: entry.thesis,
              level: entry.level,
            };
          }
        }

        const res = await fetch("/api/thesis/pulse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidates: stale,
            convictions: convictionPayload,
            fearGreed,
            force,
          }),
          signal: opts?.signal,
        });
        if (opts?.signal?.aborted) return;
        const data = await readJsonOrThrow<{
          report: PulseReport;
          headlines?: Record<string, PulseHeadline[]>;
          reused?: boolean;
        }>(res, "Pulse check failed");
        if (data.report?.writtenBy?.model) {
          setWrittenBy(data.report.writtenBy);
        }
        if (opts?.signal?.aborted) return;
        const newReport = data.report as PulseReport;
        const newHeadlines =
          (data.headlines as Record<string, PulseHeadline[]>) ?? {};
        const reused = Boolean(data.reused);
        const now = new Date().toISOString();

        setChecksByTicker((prev) => {
          const next = { ...prev };
          for (const check of newReport.checks ?? []) {
            const reconciled = reconcilePulseCheck(check);
            if (isEmptyPulseCheck(reconciled)) continue;
            next[reconciled.ticker] = reconciled;
          }
          return next;
        });
        setHeadlinesByTicker((prev) => ({ ...prev, ...newHeadlines }));
        if (reused) {
          setCheckedAtByTicker((prev) => {
            const next = { ...prev };
            for (const check of newReport.checks ?? []) {
              const reconciled = reconcilePulseCheck(check);
              if (isEmptyPulseCheck(reconciled)) continue;
              const key = reconciled.ticker;
              if (!next[key]) next[key] = now;
            }
            return next;
          });
          for (const check of newReport.checks ?? []) {
            const reconciled = reconcilePulseCheck(check);
            if (isEmptyPulseCheck(reconciled)) continue;
            const key = reconciled.ticker;
            const cachedAt =
              checkedAtByTickerRef.current[key] ?? now;
            savePulseTickerCache(key, {
              check: reconciled,
              headlines: newHeadlines[key] ?? [],
              cachedAt,
            });
          }
          if (newReport.summary?.trim()) {
            setSummary((prev) => prev || newReport.summary);
          }
          return;
        }
        setCheckedAtByTicker((prev) => {
          const next = { ...prev };
          for (const check of newReport.checks ?? []) {
            const reconciled = reconcilePulseCheck(check);
            if (isEmptyPulseCheck(reconciled)) continue;
            next[reconciled.ticker] = now;
          }
          return next;
        });
        for (const check of newReport.checks ?? []) {
          const reconciled = reconcilePulseCheck(check);
          if (isEmptyPulseCheck(reconciled)) continue;
          const key = reconciled.ticker;
          savePulseTickerCache(key, {
            check: reconciled,
            headlines: newHeadlines[key] ?? [],
            cachedAt: now,
          });
          recordPulseHistory(reconciled, now);
          // A row nobody modelled must not reach lab state. That is where
          // the Sunday letter's add and trim suggestions come from, and a
          // fixed rule about today's move is not a suggestion anybody made.
          if (reconciled.fallback) continue;
          onStampRef.current?.(key, {
            at: now,
            verdict: statusLabel(reconciled.thesisStatus),
            line:
              reconciled.verdict?.trim() ||
              reconciled.thesisBreak?.trim() ||
              actionLabel(reconciled.action),
            action: reconciled.action,
            thesisStatus: reconciled.thesisStatus,
          });
        }
        if (newReport.summary?.trim()) {
          setSummary(newReport.summary);
          savePulseSummary(newReport.summary);
        }
      } catch (err) {
        if (isAbortError(err)) return;
        setError(
          err instanceof Error && err.message.trim()
            ? err.message
            : "Pulse check failed"
        );
      } finally {
        for (const key of staleKeys) inFlightRef.current.delete(key);
        setCheckingTickers((prev) => {
          const next = new Set(prev);
          for (const key of staleKeys) next.delete(key);
          return next;
        });
      }
    },
    [convictions, fearGreed]
  );

  // Keyed off the ticker SET, not the `candidates` array's object identity
  // — quotes refresh every ~45s and rebuild `candidates` fresh each time,
  // which would otherwise re-fire this effect constantly even though the
  // underlying tickers never changed.
  const candidateSetKey = candidates
    .map((c) => c.ticker.toUpperCase())
    .sort()
    .join(",");

  // First paint + whenever the candidate SET actually changes: fill in
  // names that were never checked, or a 5% mover whose last read
  // is stale. Quiet names keep the last read. Check again is the override.
  useEffect(() => {
    if (candidates.length === 0) return;
    const ctrl = new AbortController();
    void runPulse(candidates, { signal: ctrl.signal });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed off the stable ticker-set signature, not candidates/runPulse identity churn
  }, [candidateSetKey]);

  async function checkTicker(
    tickerRaw: string,
    opts?: { force?: boolean }
  ) {
    const typed = sanitizeTickerQuery(tickerRaw).trim();
    if (!typed) return;
    setSearchInput("");
    setError(null);

    let ticker = resolveTypedTicker(typed, suggestions);
    if (ticker) hydrateTicker(ticker);

    let quoteMap = mergedQuotes;
    let q = ticker ? quoteForTicker(quoteMap, ticker) : null;
    if (ticker && !q) {
      q = await fetchQuote(ticker, pageAbortRef.current.signal);
    }
    if (!q) {
      ticker = await resolveListedTicker(typed, pageAbortRef.current.signal);
      hydrateTicker(ticker);
      q = quoteForTicker(quoteMap, ticker) ??
        (await fetchQuote(ticker, pageAbortRef.current.signal));
    }
    if (!q) {
      const label = looksLikeTickerQuery(typed) ? cashtag(typed) : typed;
      setError(`Couldn't get a price for ${label}. Try the ticker, the company, or a coin.`);
      return;
    }

    // Pinned only now. It used to be pinned before the price was asked
    // for, so a lookup that failed left an error banner above a card
    // reading $0.00 with a green up-arrow beside it.
    setPinnedTicker(ticker);
    setLookupQuotes((prev) => ({ ...prev, [ticker]: q, [typed]: q }));
    quoteMap = { ...quoteMap, [ticker]: q, [typed]: q };

    const candidate = buildPulseCandidate(ticker, model, quoteMap);
    await runPulse([candidate], {
      // A reader who typed a name is asking for this one to be looked at
      // again. An intent handed over by Home is not: see the effect below.
      force: opts?.force ?? true,
      signal: pageAbortRef.current.signal,
    });
  }

  /*
   * "Open Pulse on $X" from Home used to run `checkTicker`, which forces a
   * fresh model call: one of twelve per ten minutes spent re-reasoning a
   * name whose reading was already on screen, and the summary panel and
   * the scan list hidden behind the pinned card while it ran. A fresh
   * reading is simply shown.
   */
  useEffect(() => {
    if (!intentTicker) return;
    const ticker = intentTicker;
    onIntentConsumed?.();
    const key = ticker.trim().toUpperCase();
    const cached = checksByTickerRef.current[key];
    const at = checkedAtByTickerRef.current[key];
    if (cached && !isEmptyPulseCheck(cached) && at && isPulseCacheFresh({ cachedAt: at })) {
      setPinnedTicker(key);
      hydrateTicker(key);
      return;
    }
    void checkTicker(ticker, { force: false });
    // Consume once when Home hands us a name. checkTicker is recreated
    // every render, so it stays out of the deps on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentTicker]);

  async function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    await checkTicker(searchInput);
  }

  const pinnedLoading = Boolean(
    pinnedTicker && checkingTickers.has(pinnedTicker)
  );

  return (
    <div className="flex flex-col gap-6">
      <Panel className="gap-3">
        <PanelHeader
          icon={<Activity className="h-4 w-4" />}
          title={
            <span className="inline-flex items-center gap-2">
              Today&apos;s moves
              <WhyThis
                provenance={pulseRoomProvenance({
                  model: writtenBy,
                  checkedCount: Object.keys(checksByTicker).length,
                  at: lastCheckedAt,
                })}
                align="start"
              />
            </span>
          }
          /*
           * The word this whole room is built on, glossed once, where a
           * beginner meets it. "Thesis intact" was the first thing on the
           * page and nothing anywhere said what a thesis is.
           */
          subtitle={
            <>
              Your thesis is the reason you own something. Each day this page
              checks whether the price and the news still fit it.
              {lastCheckedAt ? (
                <span className="text-muted-foreground">
                  {" "}
                  Last read {formatRelativeTime(lastCheckedAt)}.
                </span>
              ) : null}
            </>
          }
          actions={
            <form
              onSubmit={(e) => void submitSearch(e)}
              className="flex w-full items-center gap-1.5 sm:w-[22rem]"
            >
              <div ref={searchRef} className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(sanitizeTickerQuery(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && suggestions[0]) {
                      e.preventDefault();
                      void checkTicker(suggestions[0]!.symbol);
                    }
                  }}
                  placeholder="NVDA, Apple, or Bitcoin"
                  aria-label="Ticker, company, or coin to check"
                  className="pl-8"
                  autoComplete="off"
                />
                {suggestions.length > 0 && searchInput.trim().length > 0 && (
                  <ul className={SUGGEST_MENU}>
                    {suggestions.map((row) => (
                      <li key={row.symbol}>
                        <button
                          type="button"
                          className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm text-foreground hover:bg-hover hover:text-accent-foreground"
                          onClick={() => void checkTicker(row.symbol)}
                        >
                          <span className="font-medium">{cashtag(row.symbol)}</span>
                          {row.name && (
                            <span className="truncate text-muted-foreground">{row.name}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Button
                type="submit"
                disabled={!searchInput.trim() || pinnedLoading}
                className="shrink-0"
              >
                {pinnedLoading ? "Checking …" : "Check"}
              </Button>
            </form>
          }
        />

        {dayStory || marketLine || standouts || mood ? (
          <div className="flex flex-col gap-3 glass-well rounded-lg p-4 sm:p-5">
            {dayStory ? (
              <p className="text-base font-medium leading-relaxed text-foreground">
                {humanizeMargusText(dayStory)}
              </p>
            ) : null}
            {marketLine ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {marketLine}
              </p>
            ) : null}
            {standouts ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {standouts}
              </p>
            ) : null}
            {mood ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {mood}
              </p>
            ) : null}
          </div>
        ) : null}

        {pinnedTicker && (
          <Badge variant="secondary" className="h-8 w-fit gap-1.5 pr-1">
            {cashtag(pinnedTicker)}
            <button
              type="button"
              onClick={() => setPinnedTicker(null)}
              className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
              aria-label="Clear pinned ticker"
            >
              <X className="size-3" />
            </button>
          </Badge>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </Panel>

      {/*
        * One page-level notice, not one per card.
        *
        * The block used to sit inside every card and say Margus "has not
        * finished looking", which was six wrong sentences at once: nothing
        * was running, the request had failed or been refused, and each
        * card also carried two buttons offering to try again.
        */}
      {!anyChecking && unread.length > 0 && candidates.length > 0 ? (
        <Alert>
          <AlertTriangle />
          <AlertDescription className="flex flex-col items-start gap-3">
            <span>
              {unread.length === ranked.length
                ? "Nobody has read the news on these yet. The prices above are live."
                : unread.length === 1
                  ? "One company here has no reading yet. The prices above are live."
                  : `${unread.length} companies here have no reading yet. The prices above are live.`}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void runPulse(unread, { force: true })}
              className="touch-target lg:min-h-0"
            >
              <RefreshCw data-icon="inline-start" />
              Read them now
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

        {scanRows.length > 0 && !pinnedTicker && (
        <ScanList
          label="What moved, and why"
          rows={scanRows.map((row) => {
            const key = row.ticker.toUpperCase();
            const candidate = ranked.find(
              (c) => c.ticker.toUpperCase() === key
            );
            return {
              ticker: row.ticker,
              text: scanLineBody(row.ticker, humanizeMargusText(row.line)),
              movePct: candidate?.effectivePct,
            };
          })}
          onOpen={scrollToPulseCard}
        />
      )}

      {pinnedCandidate && (
        <section>
          <h3 className="mb-3 text-muted-foreground">
            The one you asked about
          </h3>
          <ul className="flex flex-col gap-6">
            <PulseCard
              candidate={pinnedCandidate}
              check={checksByTicker[pinnedCandidate.ticker.toUpperCase()]}
              headlines={
                headlinesByTicker[pinnedCandidate.ticker.toUpperCase()] ?? []
              }
              loading={pinnedLoading}
              convictionThesis={
                convictions[pinnedCandidate.ticker.toUpperCase()]?.thesis
              }
              checkedAt={checkedAtByTicker[pinnedCandidate.ticker.toUpperCase()]}
              writtenBy={writtenBy}
              onRefresh={() => void runPulse([pinnedCandidate], { force: true })}
              onWriteThesis={
                onWriteThesis
                  ? () => onWriteThesis(pinnedCandidate.ticker)
                  : undefined
              }
              pinned
              leftHold={leftHoldTickers.has(
                pinnedCandidate.ticker.toUpperCase()
              )}
            />
          </ul>
        </section>
      )}

      {candidates.length === 0 && !pinnedCandidate ? (
        <EmptyState
          title="Nothing on this list yet"
          detail="Add a holding and this page starts watching it on its own. You can also try it on a company you know."
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => void checkTicker("AAPL")}
            >
              Try it on Apple
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {attention.length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-caution"
                  aria-hidden
                />
                Needs a look
              </h3>
              <ul className="flex flex-col gap-6">
                {attention.map((c) => (
                  <PulseCard
                    key={c.ticker}
                    candidate={c}
                    check={checksByTicker[c.ticker.toUpperCase()]}
                    headlines={headlinesByTicker[c.ticker.toUpperCase()] ?? []}
                    loading={checkingTickers.has(c.ticker.toUpperCase())}
                    convictionThesis={
                      convictions[c.ticker.toUpperCase()]?.thesis
                    }
                    checkedAt={checkedAtByTicker[c.ticker.toUpperCase()]}
                    writtenBy={writtenBy}
                    onRefresh={() => void runPulse([c], { force: true })}
                    onWriteThesis={
                      onWriteThesis ? () => onWriteThesis(c.ticker) : undefined
                    }
                    leftHold={leftHoldTickers.has(c.ticker.toUpperCase())}
                  />
                ))}
              </ul>
            </section>
          )}

          {rest.length > 0 && (
            <section>
              <h3 className="mb-3 text-muted-foreground">
                {attention.length > 0
                  ? "Everything else"
                  : `Your ${plural(rest.length, "biggest holding")}`}
              </h3>
              <ul className="flex flex-col gap-6">
                {rest.map((c) => (
                  <PulseCard
                    key={c.ticker}
                    candidate={c}
                    check={checksByTicker[c.ticker.toUpperCase()]}
                    headlines={headlinesByTicker[c.ticker.toUpperCase()] ?? []}
                    loading={checkingTickers.has(c.ticker.toUpperCase())}
                    convictionThesis={
                      convictions[c.ticker.toUpperCase()]?.thesis
                    }
                    checkedAt={checkedAtByTicker[c.ticker.toUpperCase()]}
                    writtenBy={writtenBy}
                    onRefresh={() => void runPulse([c], { force: true })}
                    onWriteThesis={
                      onWriteThesis ? () => onWriteThesis(c.ticker) : undefined
                    }
                    leftHold={leftHoldTickers.has(c.ticker.toUpperCase())}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

    </div>
  );
});
