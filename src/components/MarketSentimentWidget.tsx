"use client";

import { useCallback, useEffect } from "react";
import { isAbortError } from "@/lib/abort";
import {
  CARD,
  MicroLabel,
  NESTED_PAD,
  Panel,
  PanelHeader,
  Pill,
} from "@/components/ui/Panel";
import { NO_VALUE, cn, number, signedPercent } from "@/lib/format";
import {
  SENTIMENT_DISCLAIMER,
  classifyMarketSentiment,
  isSentimentMetrics,
  type SentimentMetrics,
  type SentimentReading,
} from "@/lib/market-sentiment";
import { quotePollMs } from "@/lib/market/session";
import {
  loadSentimentPaint,
  saveSentimentPaint,
} from "@/lib/paint-cache";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import {
  isWorkspaceRoomActive,
  onWorkspaceRefresh,
} from "@/lib/workspace-rooms";

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
  hint,
  sub,
}: {
  label: string;
  value: string;
  hint: string;
  sub?: string;
}) {
  return (
    <div
      className={cn(CARD, NESTED_PAD, "flex min-w-0 flex-col gap-1")}
      title={hint}
    >
      <MicroLabel>{label}</MicroLabel>
      <p className="min-w-0 break-words font-mono text-lg font-semibold tabular-nums text-foreground sm:text-xl">
        {value}
      </p>
      {sub ? (
        <p className="text-sm text-muted-foreground">{sub}</p>
      ) : null}
    </div>
  );
}

export function MarketSentimentWidget({ className }: { className?: string }) {
  const [metrics, setMetrics] = useHydratedCache<SentimentMetrics>(
    () => loadSentimentPaint() ?? EMPTY,
    EMPTY
  );

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch("/api/market/sentiment", { signal });
      if (!res.ok) return;
      const data: unknown = await res.json();
      if (signal.aborted || !isSentimentMetrics(data)) return;
      setMetrics(data);
      saveSentimentPaint(data);
    } catch (err) {
      if (isAbortError(err)) return;
    }
  }, [setMetrics]);

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);

    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          if (
            !document.hidden &&
            !ctrl.signal.aborted &&
            isWorkspaceRoomActive("book")
          ) {
            void load(ctrl.signal);
          }
          if (!ctrl.signal.aborted) schedule();
        },
        quotePollMs()
      );
    };
    schedule();

    const onVisible = () => {
      if (document.hidden || ctrl.signal.aborted) return;
      if (!isWorkspaceRoomActive("book")) return;
      void load(ctrl.signal);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(
    () =>
      onWorkspaceRefresh("book", () => {
        const ctrl = new AbortController();
        return load(ctrl.signal);
      }),
    [load]
  );

  const reading = classifyMarketSentiment(metrics);
  const fgSub =
    metrics.cryptoFearGreed != null
      ? `Crypto ${fmtScore(metrics.cryptoFearGreed, 0)}`
      : undefined;

  return (
    <Panel
      tone={reading.panel}
      className={cn("overview-fade", ringFor(reading), className)}
    >
      <PanelHeader
        title="Market reading"
        actions={<Pill tone={reading.pill}>{reading.label}</Pill>}
      />
      <p className="text-sm leading-relaxed text-foreground">{reading.copy}</p>
      <div
        className="grid grid-cols-2 gap-4 sm:grid-cols-4"
        role="group"
        aria-label="Market gauges"
      >
        <Metric
          label="VIX"
          value={fmtScore(metrics.vix, 2)}
          hint="Cboe Volatility Index"
        />
        <Metric
          label="RSI"
          value={fmtScore(metrics.rsi, 1)}
          hint="14-day RSI of the S&P 500 (SPY)"
        />
        <Metric
          label="F&G"
          value={fmtScore(metrics.fearGreed, 0)}
          hint="CNN Fear & Greed for US stocks, 0 (fear) to 100 (greed)"
          sub={fgSub}
        />
        <Metric
          label="vs 200-day"
          value={signedPercent(metrics.smaRatio)}
          hint="S&P 500 (SPY) versus its 200-day average"
        />
      </div>
      <p className="text-sm text-muted-foreground">{SENTIMENT_DISCLAIMER}</p>
    </Panel>
  );
}
