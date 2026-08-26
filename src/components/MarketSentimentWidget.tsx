"use client";

import { useCallback, useEffect, useRef } from "react";
import { isAbortError } from "@/lib/abort";
import {
  MicroLabel,
  Panel,
  PanelHeader,
  Pill,
  Score,
  Scoreboard,
} from "@/components/ui/Panel";
import { cn } from "@/lib/format";
import {
  isSentimentMetrics,
  preferSentimentSnapshot,
  type SentimentMetrics,
} from "@/lib/market-sentiment";
import { buildSentimentCard } from "@/lib/market-sentiment-story";
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

  return (
    <div ref={rootRef}>
      <Panel
        tone={card.reading.panel}
        className={cn("overview-fade", ringFor(card.reading.regime), className)}
      >
        <PanelHeader
          title="Market reading"
          subtitle={card.fitLine ?? undefined}
          actions={<Pill tone={card.reading.pill}>{card.reading.label}</Pill>}
        />
        <p className="text-sm leading-relaxed text-foreground" aria-live="polite">
          {card.lead}
        </p>
        {card.history && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {card.history}
          </p>
        )}
        <div role="group" aria-label="Market gauges">
          <Scoreboard cols={2} mobileCols={1}>
            {card.gauges.map((gauge) => (
              <Score
                key={gauge.label}
                label={gauge.label}
                value={gauge.value}
                sub={gauge.sub}
                tone={gauge.tone}
              />
            ))}
          </Scoreboard>
        </div>
        {card.fact && (
          <div>
            <MicroLabel>From the numbers</MicroLabel>
            <p className="mt-1 text-sm leading-relaxed text-foreground">
              {card.fact}
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}
