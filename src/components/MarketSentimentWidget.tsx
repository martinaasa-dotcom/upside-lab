"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAbortError } from "@/lib/abort";
import { Button } from "@/components/ui/button";
import {
  CARD,
  Panel,
  PanelHeader,
  Pill,
} from "@/components/ui/Panel";
import { cn, percent } from "@/lib/format";
import {
  marketOrYou,
  marketOrYouLine,
  standoutLine,
  type MarketOrYouInput,
} from "@/lib/market-or-you";
import { quotesUrl } from "@/lib/market/session";
import { ChevronDown } from "lucide-react";
import {
  isSentimentMetrics,
  preferSentimentSnapshot,
  type SentimentMetrics,
} from "@/lib/market-sentiment";
import { buildSentimentCard } from "@/lib/market-sentiment-story";
import {
  SentimentGaugeRow,
  SentimentSparkPlot,
  SentimentStretchTrack,
} from "@/components/MarketSentimentViz";
import { quotePollMs } from "@/lib/market/session";
import {
  loadSentimentPaint,
  saveSentimentPaint,
} from "@/lib/paint-cache";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import { onWorkspaceRefresh } from "@/lib/workspace-rooms";

const EMPTY: SentimentMetrics = {
  vix: null,
  rsi: null,
  fearGreed: null,
  cryptoFearGreed: null,
  spyPrice: null,
  sma200: null,
  smaRatio: null,
  streakDays: null,
  typicalMoreDays: null,
  alreadyLong: false,
  spark: null,
  asOf: null,
};

/** RSI and the 200-day move once a day. Do not chase the quote cadence. */
const MIN_POLL_MS = 60_000;

/**
 * The index itself, because the card exists to answer one question.
 *
 * "Was that my companies or the whole market" cannot be answered without
 * the market's own move, and `/api/market/sentiment` carries none: it has
 * the 200-day picture, the VIX, RSI and Fear & Greed, and no figure for
 * what the S&P 500 did today. One more ticker on the quotes route the app
 * already calls is the cheapest way to have it.
 */
const INDEX_TICKER = "^GSPC";
const INDEX_NAME = "The S&P 500";
const INDEX_QUOTES_URL = quotesUrl([INDEX_TICKER]);

/** Said once, then never again on this device. */
const DRAG_HINT_KEY = "upside-gauge-drag-hint-v1";

type QuotesPayload = {
  quotes?: Record<string, { changePercent?: number | null } | undefined>;
};

function sentimentPollMs(): number {
  return Math.max(quotePollMs(), MIN_POLL_MS);
}

function ringFor(regime: string): string {
  if (regime === "low-zone") return "ring-gain/30";
  return "";
}

export function MarketSentimentWidget({
  className,
  yoursPct = null,
  holdings,
}: {
  className?: string;
  /** The reader's own move today, as a fraction. */
  yoursPct?: number | null;
  /** What they hold, so the card can name what plainly went its own way. */
  holdings?: MarketOrYouInput["holdings"];
}) {
  const [metrics, setMetrics] = useHydratedCache<SentimentMetrics>(
    () => loadSentimentPaint() ?? EMPTY,
    EMPTY
  );
  const [indexPct, setIndexPct] = useState<number | null>(null);
  const [showScales, setShowScales] = useState(false);
  const [dragHintDone, setDragHintDone] = useState(true);

  useEffect(() => {
    try {
      setDragHintDone(
        window.localStorage.getItem(DRAG_HINT_KEY) === "1"
      );
    } catch {
      setDragHintDone(true);
    }
  }, []);

  const learnedDrag = useCallback(() => {
    setDragHintDone(true);
    try {
      window.localStorage.setItem(DRAG_HINT_KEY, "1");
    } catch {
      // A reader with storage off is told once per visit, which is fine.
    }
  }, []);
  const rootRef = useRef<HTMLDivElement>(null);
  const metricsRef = useRef(metrics);
  metricsRef.current = metrics;
  const visibleRef = useRef(true);
  const fetchedAtRef = useRef(0);
  const refreshCtrl = useRef<AbortController | null>(null);

  const loadIndex = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch(INDEX_QUOTES_URL, { signal });
      if (!res.ok) return;
      const data = (await res.json()) as QuotesPayload;
      if (signal.aborted) return;
      const pct = data.quotes?.[INDEX_TICKER]?.changePercent;
      if (typeof pct === "number" && Number.isFinite(pct)) setIndexPct(pct);
    } catch (err) {
      if (isAbortError(err)) return;
    }
  }, []);

  const load = useCallback(async (signal: AbortSignal) => {
    void loadIndex(signal);
    try {
      const res = await fetch("/api/market/sentiment", { signal });
      if (!res.ok) return;
      const data: unknown = await res.json();
      if (signal.aborted || !isSentimentMetrics(data)) return;
      const chosen = preferSentimentSnapshot(metricsRef.current, data);
      setMetrics(chosen);
      saveSentimentPaint(chosen);
      fetchedAtRef.current = Date.now();
    } catch (err) {
      if (isAbortError(err)) return;
    }
  }, [loadIndex, setMetrics]);

  useEffect(() => {
    const ctrl = new AbortController();
    const onScreen = () => {
      if (document.hidden) return false;
      const el = rootRef.current;
      if (el?.closest("[hidden]")) return false;
      return visibleRef.current;
    };
    const maybeLoad = (force = false) => {
      if (ctrl.signal.aborted || !onScreen()) return;
      if (
        !force &&
        fetchedAtRef.current > 0 &&
        Date.now() - fetchedAtRef.current < MIN_POLL_MS
      ) {
        return;
      }
      void load(ctrl.signal);
    };

    maybeLoad(true);

    const el = rootRef.current;
    const io =
      el && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              const on = entries.some((entry) => entry.isIntersecting);
              visibleRef.current = on;
              if (on) maybeLoad();
            },
            { threshold: 0.01 }
          )
        : null;
    if (el && io) io.observe(el);

    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          maybeLoad();
          if (!ctrl.signal.aborted) schedule();
        },
        sentimentPollMs()
      );
    };
    schedule();

    const onVisible = () => {
      if (document.hidden || ctrl.signal.aborted) return;
      maybeLoad();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      ctrl.abort();
      io?.disconnect();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(() => () => refreshCtrl.current?.abort(), []);

  useEffect(
    () =>
      onWorkspaceRefresh("book", async () => {
        const el = rootRef.current;
        if (document.hidden) return;
        if (el?.closest("[hidden]")) return;
        refreshCtrl.current?.abort();
        const ctrl = new AbortController();
        refreshCtrl.current = ctrl;
        await load(ctrl.signal);
      }),
    [load]
  );

  const card = buildSentimentCard(metrics);
  const hasPicture = Boolean(card.spark || card.stretch);

  /*
   * The answer, before any gauge.
   *
   * `marketOrYou` is a comparison and never a model: it puts the index's
   * move beside the reader's own and names which is larger, rather than
   * claiming that so many dollars of the fall "were the market", which
   * would need an assumption about how a portfolio tracks an index that is
   * wrong for every portfolio that is not an index fund.
   */
  const split = useMemo(
    () =>
      marketOrYou({
        marketPct: indexPct,
        yoursPct,
        holdings: holdings ?? [],
      }),
    [indexPct, yoursPct, holdings]
  );
  const answer = marketOrYouLine(split, INDEX_NAME, (n) => percent(n));
  // The tracks are always drawn from `md` up, so the hint is too; on a
  // phone it waits for the reader to open the scales.
  const showDragHint = !dragHintDone;
  const standouts = standoutLine(split, (n) => percent(n));

  return (
    <div ref={rootRef}>
      <Panel
        tone={card.reading.panel}
        className={cn(
          "overview-fade gap-5",
          ringFor(card.reading.regime),
          className
        )}
      >
        <PanelHeader
          title="Market reading"
          actions={<Pill tone={card.reading.pill}>{card.reading.label}</Pill>}
        />
        {answer ? (
          <div className="flex flex-col gap-2" aria-live="polite">
            <p className="text-base font-medium leading-relaxed text-foreground">
              {answer}
            </p>
            {standouts ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {standouts}
              </p>
            ) : null}
          </div>
        ) : null}
        {/*
          * The gauges' own sentence, in plain words.
          *
          * The header used to carry "S&P 500 · 25% match this reading",
          * which is an agreement score the type comment itself says is not
          * a chance of anything, next to a two-word pill and with the
          * sentence that explains the reading rendered `sr-only`. The
          * sentence is the part a person can use.
          */}
        <p
          className={cn(
            "text-sm leading-relaxed",
            answer ? "text-muted-foreground" : "text-foreground"
          )}
          aria-live="polite"
        >
          {card.lead}
        </p>
        <div
          className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-x-6 md:gap-y-5"
          role="group"
          aria-label="Market gauges"
          onPointerDown={learnedDrag}
        >
          {card.gauges.map((gauge) => (
            <SentimentGaugeRow
              key={gauge.label}
              gauge={gauge}
              showTrack={showScales}
            />
          ))}
        </div>
        {/*
          * The best teaching interaction on this page had no affordance.
          * Every bar is draggable and prints what another reading would
          * mean under the finger, and the only mention of it was the last
          * sentence of an info dot. One muted line says so, once, and never
          * again after the reader has used it.
          */}
        {showDragHint ? (
          <p
            className={cn(
              "text-sm text-muted-foreground",
              showScales ? undefined : "hidden md:block"
            )}
          >
            Drag along a bar to see what another reading would mean.
          </p>
        ) : null}
        {/*
          * The scales, and the 200-day picture with them, wait for a tap on
          * a phone. Measured at 390 the three tracks, their ticks, their
          * captions and the picture ran this card from 547px to about
          * 1,500px, so the sentence about the reader's own day did not
          * start until 1.7 screens down. From `md` up there is room and
          * everything simply draws.
          */}
        <div className={cn("md:hidden", showScales && "hidden")}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 text-muted-foreground hover:text-foreground"
            onClick={() => setShowScales(true)}
          >
            See the scales
            <ChevronDown data-icon="inline-end" />
          </Button>
        </div>
        {hasPicture ? (
          <div
            className={cn(
              CARD,
              "p-4",
              showScales ? undefined : "hidden md:block"
            )}
          >
            {card.spark ? (
              <SentimentSparkPlot spark={card.spark} stretch={card.stretch} />
            ) : card.stretch ? (
              <SentimentStretchTrack stretch={card.stretch} />
            ) : null}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
