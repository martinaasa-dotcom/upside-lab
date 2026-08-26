"use client";

import { HouseholdCoinChips } from "@/components/CoinChips";
import {
  cashtag,
  cn,
  currency,
  signedCurrency,
  signedPercent,
  signedTone,
} from "@/lib/format";
import { sanitizeTickerQuery } from "@/lib/input-guard";
import { quotesUrl, isQuoteFreshForView } from "@/lib/market/session";
import { quoteAsOfTitle } from "@/lib/market/quote-freshness";
import {
  localTickerSuggestions,
  looksLikeTickerQuery,
  mergeAndRankTickerSuggestions,
  pickTickerSuggestion,
  resolveTypedTicker,
} from "@/lib/market/ticker-search";
import { isCoinSymbol } from "@/lib/coins";
import { normalizeYahooTicker } from "@/lib/ticker";
import { useTickerSearch } from "@/lib/use-ticker-search";
import { FALLBACK_POPULAR_TICKERS } from "@/lib/popular-tickers";
import type { Quote } from "@/lib/types";
import { watchLook, type WatchLook } from "@/lib/watch-look";
import {
  addWatchlistTicker,
  loadWatchlist,
  removeWatchlistTicker,
} from "@/lib/watchlist";
import { loadCachedQuotes, mergeQuotes, saveCachedQuotes } from "@/lib/quote-cache";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import {
  EmptyState,
  MicroLabel,
  PanelHeader,
  Pill,
} from "@/components/ui/Panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { ChevronRight, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

/** Stable server-side value; a fresh [] each render would churn the memo. */
const EMPTY_LIST: string[] = [];
const EMPTY_QUOTES: Record<string, Quote> = {};
const POPULAR_SEED = [...FALLBACK_POPULAR_TICKERS];

function RangeMeter({
  low,
  high,
  price,
}: {
  low: number;
  high: number;
  price: number;
}) {
  const span = high - low;
  const pos = span > 0 ? Math.min(1, Math.max(0, (price - low) / span)) : 0.5;
  return (
    <div>
      <MicroLabel>Recent range</MicroLabel>
      <div className="mt-2 flex items-center justify-between gap-3 text-sm tabular-nums text-muted-foreground">
        <span className="font-mono">{currency(low)}</span>
        <span className="font-mono">{currency(high)}</span>
      </div>
      <div className="mt-2 px-1">
        <div
          className="relative h-2.5 rounded-full bg-secondary"
          role="meter"
          aria-valuemin={low}
          aria-valuemax={high}
          aria-valuenow={price}
          aria-label="Where today's price sits in the recent range, from the low (rose) to the high (green)"
        >
          <span
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background"
            style={{
              left: `${pos * 100}%`,
              backgroundColor: `color-mix(in oklch, var(--gain) ${pos * 100}%, var(--loss) ${(1 - pos) * 100}%)`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function WatchCard({
  ticker,
  quote,
  look,
  onRemove,
  onOpenPulse,
  onRetryQuote,
  quoteRetrying,
}: {
  ticker: string;
  quote: Quote | undefined;
  look: WatchLook | null;
  onRemove: () => void;
  onOpenPulse?: (ticker: string) => void;
  onRetryQuote?: () => void;
  quoteRetrying?: boolean;
}) {
  const pct = quote?.changePercent ?? null;
  const waiting = !quote || pct == null;
  const rangeLow = look?.low ?? null;
  const rangeHigh = look?.high ?? null;

  if (waiting) {
    return (
      <div className="glass-well flex h-12 items-center justify-between gap-3 rounded-md border border-border px-4">
        <Badge variant="secondary" className="h-6">{cashtag(ticker)}</Badge>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Waiting on today&apos;s price</span>
          {onRetryQuote ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onRetryQuote}
              disabled={quoteRetrying}
              aria-label={`Fetch price for ${ticker}`}
              title="Fetch price"
            >
              <RefreshCw className={quoteRetrying ? "animate-spin" : undefined} />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            aria-label={`Remove ${ticker}`}
          >
            <X />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="card-sheen glass-well flex h-full flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <Badge variant="secondary" className="chip-hang h-6 font-heading text-sm font-semibold">
          {cashtag(ticker)}
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          className="touch-target -mr-1.5 -mt-1.5 shrink-0 text-muted-foreground lg:min-h-0 lg:min-w-0"
          aria-label={`Remove ${ticker}`}
        >
          <X />
        </Button>
      </div>

      <div>
        <p
          className="font-mono text-2xl font-bold leading-none tracking-tight tabular-nums text-foreground"
          title={quoteAsOfTitle(quote)}
        >
          {currency(quote.price)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Pill tone={pct > 0 ? "good" : pct < 0 ? "bad" : "neutral"}>
            {signedPercent(pct)}
          </Pill>
          <span className={cn("font-mono text-sm tabular-nums", signedTone(pct))}>
            {signedCurrency(quote.change)} today
          </span>
        </div>
      </div>

      {look && rangeLow != null && rangeHigh != null && quote && (
        <RangeMeter
          low={rangeLow}
          high={rangeHigh}
          price={quote.price}
        />
      )}

      {look && (
        <>
          <Separator />
          <div>
            <p className="font-heading text-lg font-semibold tracking-tight text-foreground">
              {look.headline}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {look.detail}
            </p>
          </div>
        </>
      )}

      {onOpenPulse && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onOpenPulse(ticker)}
          className="mt-auto w-full touch-target justify-between lg:min-h-0"
        >
          Check in Pulse
          <ChevronRight />
        </Button>
      )}
    </div>
  );
}

export function WatchlistStrip({
  heldTickers,
  onOpenPulse,
}: {
  heldTickers: string[];
  onOpenPulse?: (ticker?: string) => void;
}) {
  // Watchlist lives in localStorage, so it can't be read during render
  // without the server and client trees disagreeing.
  const [list, setList] = useHydratedCache<string[]>(loadWatchlist, EMPTY_LIST);
  const [draft, setDraft] = useState("");
  /**
   * What just happened to the thing you typed.
   *
   * Every path out of `add()` used to be a bare `return`: a name it could
   * not resolve, a ticker you already hold, a search that failed. You
   * pressed Enter and the app did nothing at all -- no message, no spinner,
   * your text still sitting in the box. The onboarding modal ten files away
   * gets this right for the same interaction, which is the standard here.
   */
  const [note, setNote] = useState<string | null>(null);
  /** True while the company-name lookup is in flight. */
  const [adding, setAdding] = useState(false);
  const [quotes, setQuotes] = useHydratedCache<Record<string, Quote>>(
    () => loadCachedQuotes().quotes,
    EMPTY_QUOTES
  );
  const [popular, setPopular] = useState<string[]>(POPULAR_SEED);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [reportDays, setReportDays] = useState<Record<string, number>>({});
  const [quoteRetrying, setQuoteRetrying] = useState<Record<string, boolean>>(
    {}
  );
  const remote = useTickerSearch(draft);

  const heldKey = heldTickers.join("|");
  const names = useMemo(() => {
    const held = new Set(heldTickers.map((t) => t.toUpperCase()));
    return list.filter((t) => !held.has(t)).slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- heldKey stands in for the array's contents
  }, [list, heldKey]);
  const namesKey = useMemo(() => names.join("|"), [names]);

  const exclude = useMemo(() => {
    const next = new Set(heldTickers.map((t) => t.toUpperCase()));
    for (const t of list) next.add(t.toUpperCase());
    return next;
  }, [heldTickers, list]);

  const suggestions = useMemo(
    () =>
      mergeAndRankTickerSuggestions(
        draft,
        localTickerSuggestions(draft, popular, exclude),
        remote,
        exclude
      ),
    [draft, popular, remote, exclude]
  );

  const suggestOpen = open && suggestions.length > 0;

  const fetchQuotes = useCallback(
    (tickers: string[], opts?: { force?: boolean }) => {
      if (tickers.length === 0) return;
      if (!opts?.force && isQuoteFreshForView(loadCachedQuotes().savedAt)) return;
      for (const t of tickers) {
        setQuoteRetrying((prev) => ({ ...prev, [t.toUpperCase()]: true }));
      }
      void fetch(quotesUrl(tickers), { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { quotes?: Record<string, Quote> } | null) => {
          if (data?.quotes) {
            setQuotes((prev) => {
              const merged = mergeQuotes(
                { ...loadCachedQuotes().quotes, ...prev },
                data.quotes ?? {}
              );
              saveCachedQuotes(merged);
              return merged;
            });
          }
        })
        .catch(() => {
          /* keep last */
        })
        .finally(() => {
          for (const t of tickers) {
            setQuoteRetrying((prev) => {
              const next = { ...prev };
              delete next[t.toUpperCase()];
              return next;
            });
          }
        });
    },
    [setQuotes]
  );

  useEffect(() => {
    if (names.length === 0) return;
    fetchQuotes(names);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- namesKey stands in for the array's contents
  }, [namesKey, fetchQuotes]);

  useEffect(() => {
    const eventNames = names.filter((t) => !isCoinSymbol(t));
    if (eventNames.length === 0) {
      setReportDays({});
      return;
    }
    const ctrl = new AbortController();
    void fetch(`/api/market/events?tickers=${encodeURIComponent(eventNames.join(","))}`, {
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (data: { earnings?: Array<{ ticker?: string; days?: number }> } | null) => {
          if (ctrl.signal.aborted) return;
          const next: Record<string, number> = {};
          for (const row of data?.earnings ?? []) {
            const t = String(row.ticker ?? "").toUpperCase();
            if (!t || row.days == null || !Number.isFinite(row.days)) continue;
            next[t] = row.days;
          }
          setReportDays(next);
        }
      )
      .catch(() => {
        /* cards still work without a results date */
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- namesKey stands in for the array's contents
  }, [namesKey]);

  useEffect(() => {
    const ctrl = new AbortController();
    void fetch("/api/popular-tickers", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { tickers?: string[] } | null) => {
        if (ctrl.signal.aborted) return;
        if (data?.tickers?.length) setPopular(data.tickers);
      })
      .catch(() => {
        /* keep the fallback list */
      });
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    setActive(0);
  }, [draft, suggestions.length]);

  async function add(symbol?: string) {
    if (adding) return;
    setNote(null);
    let t = (symbol ?? "").trim();
    if (t && !looksLikeTickerQuery(t)) t = "";
    if (!t) t = resolveTypedTicker(draft, suggestions);
    let lookupFailed = false;
    if (!t && draft.trim()) {
      // The only slow step: turning a typed company name into a symbol.
      setAdding(true);
      try {
        const res = await fetch(
          `/api/market/search?q=${encodeURIComponent(draft.trim())}`,
          { cache: "no-store" }
        );
        const data = (await res.json()) as {
          results?: { symbol: string; name: string | null }[];
        };
        t = pickTickerSuggestion(draft, data.results ?? [])?.symbol ?? "";
      } catch {
        t = "";
        lookupFailed = true;
      } finally {
        setAdding(false);
      }
    }
    if (!t && looksLikeTickerQuery(draft)) t = normalizeYahooTicker(draft);
    t = normalizeYahooTicker(t);
    if (!/^[A-Z0-9.=^-]{1,12}$/.test(t)) {
      // Tell apart "we could not reach the search" from "that is not a
      // company we can find", because the first one is worth retrying.
      setNote(
        lookupFailed
          ? "Couldn't look that up just now. Try again in a second."
          : `Nothing found for "${draft.trim()}". Try Apple, NVDA, or Bitcoin.`
      );
      return;
    }
    if (heldTickers.some((h) => h.toUpperCase() === t)) {
      // Not a failure. You already own it, which is why it is not here.
      setNote(`You already own ${cashtag(t)}, so it's in your portfolio, not your watchlist.`);
      setDraft("");
      setOpen(false);
      return;
    }
    if (list.some((w) => w.toUpperCase() === t)) {
      setNote(`${t} is already on your watchlist.`);
      setDraft("");
      setOpen(false);
      return;
    }
    const next = addWatchlistTicker(list, t);
    setList(next);
    setDraft("");
    setOpen(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <PanelHeader
        title="Watching"
        subtitle={
          names.length === 0
            ? undefined
            : "Today's price and a plain read of the last few weeks. Not a buy order."
        }
        actions={
          <Popover
            open={suggestOpen}
            onOpenChange={(next) => {
              if (!next) setOpen(false);
            }}
          >
            <PopoverAnchor asChild>
              <form
                className="relative"
                onSubmit={(e) => {
                  e.preventDefault();
                  void add(suggestions[active]?.symbol);
                }}
              >
                <InputGroup className="w-44 sm:w-56">
                  <InputGroupInput
                    value={draft}
                    onChange={(e) => {
                      setDraft(sanitizeTickerQuery(e.target.value));
                      setNote(null);
                      setOpen(true);
                    }}
                    onFocus={() => {
                      if (draft.trim()) setOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (!suggestOpen) return;
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setActive((i) => (i + 1) % suggestions.length);
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setActive(
                          (i) => (i - 1 + suggestions.length) % suggestions.length
                        );
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setOpen(false);
                      }
                    }}
                    placeholder="Apple or Bitcoin"
                    maxLength={48}
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={suggestOpen}
                    aria-controls="watchlist-suggest"
                    aria-autocomplete="list"
                    aria-activedescendant={
                      suggestOpen && suggestions[active]
                        ? `watchlist-suggest-${suggestions[active]!.symbol}`
                        : undefined
                    }
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      type="submit"
                      size="icon-xs"
                      disabled={!draft.trim() || adding}
                      aria-label="Add to watchlist"
                      className="touch-target lg:min-h-0 lg:min-w-0"
                    >
                      {adding ? <Loader2 className="animate-spin" /> : <Plus />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                {note ? (
                  /*
                   * `role="status"` so a screen reader announces it without
                   * stealing focus from the box the person is still typing in.
                   */
                  <p
                    role="status"
                    className="absolute top-full right-0 mt-1 max-w-56 text-right text-xs text-muted-foreground"
                  >
                    {note}
                  </p>
                ) : null}
              </form>
            </PopoverAnchor>
            <PopoverContent
              align="end"
              className="w-64 border-border p-1 shadow-md ring-foreground/20"
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <ul id="watchlist-suggest" role="listbox">
                {suggestions.map((row, i) => (
                  <li key={row.symbol} role="presentation">
                    <button
                      id={`watchlist-suggest-${row.symbol}`}
                      type="button"
                      role="option"
                      aria-selected={i === active}
                      className={cn(
                        "flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-2.5 text-left lg:min-h-8",
                        i === active
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-hover hover:text-accent-foreground"
                      )}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => add(row.symbol)}
                    >
                      <span className="text-sm font-medium text-foreground">
                        {cashtag(row.symbol)}
                      </span>
                      {row.name && (
                        <span className="truncate text-sm text-muted-foreground">
                          {row.name}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        }
      />
      <HouseholdCoinChips
        hidden={exclude}
        onPick={(symbol) => void add(symbol)}
        disabled={adding}
      />
      {names.length === 0 ? (
        <EmptyState
          title="Nothing on the list yet"
          detail="Add a company or a coin you don't own. You'll see today's price and where it sits in its recent range."
        />
      ) : (
        <>
          <ul className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2">
            {names.map((ticker) => {
              const q = quotes[ticker];
              const look = q
                ? watchLook(
                    q,
                    isCoinSymbol(ticker) ? null : reportDays[ticker] ?? null
                  )
                : null;
              return (
                <li key={ticker}>
                  <WatchCard
                    ticker={ticker}
                    quote={q}
                    look={look}
                    onRemove={() => setList(removeWatchlistTicker(list, ticker))}
                    onOpenPulse={onOpenPulse}
                    onRetryQuote={() => fetchQuotes([ticker], { force: true })}
                    quoteRetrying={Boolean(quoteRetrying[ticker.toUpperCase()])}
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
