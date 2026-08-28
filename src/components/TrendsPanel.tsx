"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { EmptyState, InfoTip, Panel, PanelHeader, Reading } from "@/components/ui/Panel";
import { NO_VALUE, cashtag, cn } from "@/lib/format";
import { readJsonOrThrow } from "@/lib/http";
import { buildTrendStory, type Signal, type Tone, type TrendRowLike } from "@/lib/market/trend-story";
import {
  indexProxyName,
  indexProxyNote,
  isIndexProxy,
} from "@/lib/market/index-proxy";
import {
  addWatchlistTicker,
  loadWatchlist,
  removeWatchlistTicker,
  saveWatchlist,
} from "@/lib/watchlist";
import {
  AlertTriangle,
  Info,
  Minus,
  Plus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { isAbortError } from "@/lib/abort";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import { loadTrendsPaint, saveTrendsPaint } from "@/lib/paint-cache";

// Mirrors MAX_TICKERS in src/lib/market/trends-cache.ts; kept as a plain
// constant here so this client component never imports the yahoo-finance2
// dependency chain.
const MAX_TICKERS = 14;
const LEGACY_WATCHLIST_KEY = "portfell-trends-watchlist";

function loadTrendsWatchlist(): string[] {
  const shared = loadWatchlist();
  if (shared.length > 0 || typeof window === "undefined") return shared;
  try {
    const raw = window.localStorage.getItem(LEGACY_WATCHLIST_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const legacy = Array.isArray(parsed)
      ? parsed.filter((t): t is string => typeof t === "string")
      : [];
    if (legacy.length > 0) {
      saveWatchlist(legacy);
      window.localStorage.removeItem(LEGACY_WATCHLIST_KEY);
      return loadWatchlist();
    }
  } catch {
    /* ignore */
  }
  return shared;
}

type TrendRow = TrendRowLike;

const TONE_TEXT: Record<Tone, string> = {
  gain: "text-gain",
  loss: "text-loss",
  warn: "text-caution",
  neutral: "text-muted-foreground",
};

const TONE_BADGE: Record<Tone, string> = {
  gain: "border-gain/40 text-gain",
  loss: "border-loss/40 text-loss",
  warn: "border-caution/50 text-caution",
  neutral: "",
};

function ToneIcon({ tone, className }: { tone: Tone; className?: string }) {
  if (tone === "gain") return <TrendingUp className={className} />;
  if (tone === "loss") return <TrendingDown className={className} />;
  if (tone === "warn") return <AlertTriangle className={className} />;
  return <Minus className={className} />;
}

function SignalCell({
  signal,
  className,
}: {
  signal: Signal;
  className?: string;
}) {
  return (
    <div className={cn("px-(--card-spacing) py-(--card-spacing)", className)}>
      <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <span>{signal.label}</span>
        <InfoTip text={signal.help} />
      </p>
      <p
        className={cn(
          "mt-1.5 inline-flex items-center gap-1.5 font-heading text-lg font-semibold tracking-tight",
          TONE_TEXT[signal.tone]
        )}
      >
        <ToneIcon tone={signal.tone} className="h-4 w-4" />
        {signal.value}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums text-muted-foreground">
        {signal.detail.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>
    </div>
  );
}

/** One holding's whole trend story: verdict on top, then the slow 40-week
 * read full-width and the four faster signals in a 2×2. */
function TickerStoryCard({
  row,
  isHolding,
}: {
  row: TrendRow;
  isHolding: boolean;
}) {
  const story = useMemo(() => buildTrendStory(row), [row]);
  const trend = story.signals.find((s) => s.key === "trend");
  const rest = story.signals.filter((s) => s.key !== "trend");
  const proxyName = indexProxyName(row.ticker);

  return (
    <Card className="gap-0 border border-border shadow-lg shadow-black/40">
      <CardHeader className="border-b">
        <CardTitle className="flex flex-wrap items-center gap-2">
          {cashtag(row.ticker)}
          {!isHolding ? <Badge variant="secondary">watching</Badge> : null}
          {/*
            * Says it on the card too, because this card carries a "vs S&P"
            * cell that reads 0.0% and will keep reading 0.0% forever. With
            * the badge that is an obvious tautology; without it, it looks
            * like a number that failed to load.
            */}
          {proxyName ? (
            <Badge variant="outline">this is the {proxyName}</Badge>
          ) : null}
        </CardTitle>
        <CardDescription>{story.sentence}</CardDescription>
        <CardAction>
          <Badge variant="outline" className={TONE_BADGE[story.tone]}>
            <ToneIcon tone={story.tone} data-icon="inline-start" />
            {story.headline}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        {trend ? <SignalCell signal={trend} /> : null}
        <div className="grid sm:grid-cols-2">
          {rest.map((s, i) => (
            <SignalCell
              key={s.key}
              signal={s}
              className={cn("border-t", i % 2 === 0 && "sm:border-r")}
            />
          ))}
        </div>
      </CardContent>
      {row.divergence ? (
        <CardFooter className="items-start text-sm leading-relaxed text-muted-foreground">
          Price made a {row.divergence.kind === "bearish" ? "higher high" : "lower low"} (
          {row.divergence.priceFrom.toFixed(0)} → {row.divergence.priceTo.toFixed(0)}) while RSI went the
          other way ({row.divergence.rsiFrom.toFixed(0)} → {row.divergence.rsiTo.toFixed(0)}). Confirmed{" "}
          {row.divergence.weeksAgo === 0 ? "this week" : `${row.divergence.weeksAgo}w ago`}.
        </CardFooter>
      ) : null}
    </Card>
  );
}

function rsText(v: number | null): string {
  if (v == null) return NO_VALUE;
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

export function TrendsPanel({ tickers }: { tickers: string[] }) {
  const [watchlist, setWatchlist] = useHydratedCache<string[]>(
    loadTrendsWatchlist,
    []
  );
  const holdingSet = useMemo(
    () => new Set(tickers.map((t) => t.toUpperCase())),
    [tickers]
  );
  const combined = useMemo(
    () => [...tickers, ...watchlist.filter((t) => !holdingSet.has(t))],
    [tickers, watchlist, holdingSet]
  );
  const key = combined.join(",");

  const [rows, setRows] = useHydratedCache<TrendRow[] | null>(
    () => (key ? loadTrendsPaint(key) : []),
    null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!key) {
      setRows([]);
      return;
    }
    const cached = loadTrendsPaint(key);
    if (cached) setRows(cached);
  }, [key, setRows]);

  const load = useCallback(async (force = false, signal?: AbortSignal) => {
    if (!key) {
      setRows([]);
      return;
    }
    const cached = loadTrendsPaint(key);
    if (cached && !force) setRows(cached);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/trends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: key.split(","), force }),
        signal,
      });
      const data = await readJsonOrThrow<{ rows: TrendRow[] }>(
        res,
        "Couldn't load trends. Try again."
      );
      const next = data.rows ?? [];
      setRows(next);
      saveTrendsPaint(key, next);
    } catch (e) {
      if (isAbortError(e)) return;
      if (loadTrendsPaint(key) != null) return;
      setError(e instanceof Error ? e.message : "Couldn't load trends. Try again.");
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }, [key, setRows]);

  // Weekly indicators barely move intraday, so fetch once per ticker set
  // rather than polling. The button is there for a manual recheck.
  useEffect(() => {
    if (!key) {
      setRows([]);
      setBusy(false);
      return;
    }
    const ctrl = new AbortController();
    void load(false, ctrl.signal);
    return () => ctrl.abort();
  }, [key, load, setRows]);

  const addToWatchlist = useCallback(() => {
    const symbol = draft.trim().toUpperCase().replace(/\s+/g, "");
    if (!symbol) return;
    if (holdingSet.has(symbol) || watchlist.includes(symbol)) {
      setAddError(`${symbol} is already on the list.`);
      return;
    }
    if (combined.length >= MAX_TICKERS) {
      setAddError(`That's the limit, ${MAX_TICKERS} companies at once.`);
      return;
    }
    const next = addWatchlistTicker(watchlist, symbol);
    setWatchlist(next);
    setDraft("");
    setAddError(null);
  }, [draft, holdingSet, watchlist, combined.length, setWatchlist]);

  const removeFromWatchlist = useCallback((symbol: string) => {
    setWatchlist((prev) => removeWatchlistTicker(prev, symbol));
  }, [setWatchlist]);

  // Stories with the loudest news (a divergence, a regime actually
  // changing) float to the top; everything else falls back to who's
  // leading or lagging the index, so the order itself is part of the read.
  const stories = useMemo(() => {
    if (!rows) return [];
    return rows
      .map((r) => ({ row: r, story: buildTrendStory(r) }))
      .sort((a, b) => b.story.priority - a.story.priority);
  }, [rows]);

  const attentionCount = stories.filter((s) => s.story.attention).length;

  /*
   * The ranking is against the S&P 500, so a holding that *is* the S&P 500
   * cannot be in it. See `index-proxy.ts`: a reader watched their S&P
   * tracker ranked against the S&P and printed at 0.0%, and asked why the
   * index was being compared with itself. It is the baseline, and it is
   * named as the baseline under the chart instead.
   */
  const leaders = [...(rows ?? [])]
    .filter((r) => r.rs13 != null && !isIndexProxy(r.ticker))
    .sort((a, b) => (b.rs13 ?? 0) - (a.rs13 ?? 0));
  const proxyNote = indexProxyNote((rows ?? []).map((r) => r.ticker));

  return (
    <div className="flex flex-col gap-6">
      <Panel className="gap-3">
        <PanelHeader
          title="Is the trend changing?"
          actions={
            <>
              <form
                className="w-full sm:w-56"
                onSubmit={(e) => {
                  e.preventDefault();
                  addToWatchlist();
                }}
              >
                <InputGroup>
                  <InputGroupInput
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      setAddError(null);
                    }}
                    placeholder="Bitcoin, XLK, SPY"
                    aria-label="Ticker to watch"
                    autoComplete="off"
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      type="submit"
                      size="icon-xs"
                      disabled={!draft.trim()}
                      aria-label="Add to watchlist"
                    >
                      <Plus />
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </form>
              <Button
                type="button"
                variant="outline"
                onClick={() => void load(true)}
                disabled={busy}
              >
                <RefreshCw
                  data-icon="inline-start"
                  className={cn(busy && "animate-spin")}
                />
                {busy ? "Reading …" : "Recheck"}
              </Button>
            </>
          }
        />
        {watchlist.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {watchlist.map((t) => (
              <Badge key={t} variant="secondary" className="h-8 gap-1.5 pr-1">
                {cashtag(t)}
                <button
                  type="button"
                  onClick={() => removeFromWatchlist(t)}
                  aria-label={`Remove ${t} from watchlist`}
                  className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : null}
        {addError ? (
          <p className="text-sm text-loss">{addError}</p>
        ) : null}
      </Panel>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {rows == null && !error && (
        <EmptyState title="Reading four years of weekly bars …" />
      )}

      {rows != null && rows.length === 0 && !error && (
        <EmptyState
          title="Nothing to read yet"
          detail="Add a holding, or watch a ticker above, and its trend read shows up here."
        />
      )}

      {rows != null && rows.length > 0 && (
        <>
          <Reading>
            <span className="flex items-start gap-2.5">
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                {attentionCount === 0
                  ? "Nothing below is diverging or rolling over right now. Sorted by who is beating the S&P."
                  : `${attentionCount} name${attentionCount === 1 ? "" : "s"} below ${attentionCount === 1 ? "has" : "have"} something actually changing. Those come first.`}
              </span>
            </span>
          </Reading>

          <div className="flex flex-col gap-8">
            {stories.map(({ row }) => (
              <TickerStoryCard
                key={row.ticker}
                row={row}
                isHolding={holdingSet.has(row.ticker)}
              />
            ))}
          </div>

          {leaders.length > 1 && (
            <Panel>
              <PanelHeader
                title="Who's leading, who's fading"
                subtitle="The last 13 weeks, about three months. The same window for every name."
              />
              {/*
                * The window is named in the heading now, not only in a
                * footnote on the right. A reader who had owned their names
                * for six months read "13 weeks" as a measurement of their
                * own holding and asked what the 13 weeks were, which is
                * fair: nothing said the window was the app's and not
                * theirs. So it says both, and points at the figure that
                * really is theirs.
                */}
              <p className="mt-3 mb-4 text-sm leading-relaxed text-muted-foreground">
                Ranked by how each name did against the S&amp;P 500 over those
                13 weeks. This is money moving from one group to another, not
                just prices going up with everything else. It is not measured
                from the day you bought; that figure is All time on Home.
                {proxyNote ? ` ${proxyNote}` : ""}
              </p>
              <div className="flex flex-col gap-1.5">
                {leaders.map((r) => {
                  const v = r.rs13 ?? 0;
                  const width = Math.min(100, Math.abs(v) * 100 * 1.6);
                  return (
                    <div key={r.ticker} className="flex items-center gap-3">
                      <span className="w-16 shrink-0 truncate text-sm font-medium text-foreground">
                        {cashtag(r.ticker)}
                      </span>
                      <div className="relative h-2 min-w-0 flex-1 rounded-full bg-muted">
                        <div
                          className={cn(
                            "absolute top-0 h-full rounded-full",
                            v >= 0 ? "bg-gain/70 left-1/2" : "bg-loss/70 right-1/2"
                          )}
                          style={{ width: `${width / 2}%` }}
                        />
                        <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                      </div>
                      <span
                        className={cn(
                          "w-16 shrink-0 text-right text-sm tabular-nums",
                          v >= 0 ? "text-gain" : "text-loss"
                        )}
                      >
                        {rsText(r.rs13)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-right text-sm text-muted-foreground">
                The middle line is the S&amp;P 500
              </p>
            </Panel>
          )}

          <p className="text-sm text-muted-foreground">
            Technical readings on past prices, not a forecast and not advice.
            Divergences can persist for months before anything happens, or
            resolve with no break at all.
          </p>
        </>
      )}
    </div>
  );
}
