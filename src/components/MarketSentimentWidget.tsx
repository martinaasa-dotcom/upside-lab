"use client";

import { useCallback, useEffect, useRef } from "react";
import { isAbortError } from "@/lib/abort";
import {
  CARD,
  Panel,
  PanelHeader,
  Pill,
} from "@/components/ui/Panel";
import { cn } from "@/lib/format";
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

function sentimentPollMs(): number {
  return Math.max(quotePollMs(), MIN_POLL_MS);
}

function ringFor(regime: string): string {
  if (regime === "low-zone") return "ring-gain/30";
  return "";
}

export function MarketSentimentWidget({ className }: { className?: string }) {
  const [metrics, setMetrics] = useHydratedCache<SentimentMetrics>(
    () => loadSentimentPaint() ?? EMPTY,
    EMPTY
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const metricsRef = useRef(metrics);
  metricsRef.current = metrics;
  const visibleRef = useRef(true);
  const fetchedAtRef = useRef(0);
  const refreshCtrl = useRef<AbortController | null>(null);

  const load = useCallback(async (signal: AbortSignal) => {
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
  }, [setMetrics]);

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
        {hasPicture ? (
          <p className="sr-only" aria-live="polite">
            {card.lead}
          </p>
        ) : null}
        <PanelHeader
          title="Market reading"
          subtitle={card.fitLine ?? undefined}
          actions={<Pill tone={card.reading.pill}>{card.reading.label}</Pill>}
        />
        {hasPicture ? (
          <div className={cn(CARD, "p-4")}>
            {card.spark ? (
              <SentimentSparkPlot spark={card.spark} stretch={card.stretch} />
            ) : card.stretch ? (
              <SentimentStretchTrack stretch={card.stretch} />
            ) : null}
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-foreground" aria-live="polite">
            {card.lead}
          </p>
        )}
        <div
          className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-x-8 md:gap-y-5"
          role="group"
          aria-label="Market gauges"
        >
          {card.gauges.map((gauge) => (
            <SentimentGaugeRow key={gauge.label} gauge={gauge} />
          ))}
        </div>
      </Panel>
    </div>
  );
}
