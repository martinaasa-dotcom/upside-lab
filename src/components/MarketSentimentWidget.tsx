"use client";

import { useCallback, useEffect, useRef } from "react";
import { isAbortError } from "@/lib/abort";
import {
  CARD,
  MicroLabel,
  Panel,
  PanelHeader,
  Pill,
} from "@/components/ui/Panel";
import { NO_VALUE, cn, number, signedPercent } from "@/lib/format";
import {
  SENTIMENT_DISCLAIMER,
  classifyMarketSentiment,
  fearGreedCaption,
  isSentimentMetrics,
  preferSentimentSnapshot,
  type SentimentMetrics,
  type SentimentReading,
} from "@/lib/market-sentiment";
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
  asOf: null,
};

/** RSI and the 200-day move once a day. Do not chase the quote cadence. */
const MIN_POLL_MS = 60_000;

function sentimentPollMs(): number {
  return Math.max(quotePollMs(), MIN_POLL_MS);
}

function fmtScore(n: number | null, digits: number) {
  return n == null ? NO_VALUE : number(n, digits);
}

function ringFor(reading: SentimentReading): string {
  if (reading.regime === "low-zone") return "ring-gain/30";
  return "";
}

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className={cn(CARD, "flex h-full min-w-0 flex-col gap-1 p-3 sm:p-4")}>
      <MicroLabel>{label}</MicroLabel>
      <p className="min-w-0 break-words font-mono text-lg font-semibold tabular-nums text-foreground sm:text-xl">
        {value}
      </p>
      <p className="mt-auto pt-1 text-sm text-muted-foreground">{sub}</p>
    </div>
  );
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

  const reading = classifyMarketSentiment(metrics);

  return (
    <div ref={rootRef}>
      <Panel
        tone={reading.panel}
        className={cn("overview-fade", ringFor(reading), className)}
      >
        <PanelHeader
          title="Market reading"
          actions={<Pill tone={reading.pill}>{reading.label}</Pill>}
        />
        <p className="text-sm leading-relaxed text-foreground" aria-live="polite">
          {reading.copy}
        </p>
        <div
          className="grid grid-cols-2 gap-4 sm:grid-cols-4"
          role="group"
          aria-label="Market gauges"
        >
          <Metric
            label="VIX"
            value={fmtScore(metrics.vix, 2)}
            sub="Cboe volatility"
          />
          <Metric
            label="RSI"
            value={fmtScore(metrics.rsi, 1)}
            sub="14-day SPY"
          />
          <Metric
            label="Fear & Greed"
            value={fmtScore(metrics.fearGreed, 0)}
            sub={fearGreedCaption(metrics.fearGreed, metrics.cryptoFearGreed)}
          />
          <Metric
            label="vs 200-day"
            value={signedPercent(metrics.smaRatio)}
            sub="SPY vs average"
          />
        </div>
        <p className="text-sm text-muted-foreground">{SENTIMENT_DISCLAIMER}</p>
      </Panel>
    </div>
  );
}
