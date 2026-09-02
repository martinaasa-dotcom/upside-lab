"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HouseholdCoinChips } from "@/components/CoinChips";
import { TourAsk } from "@/components/tour/TourRow";
import { cashtag, currency, signedPercent } from "@/lib/format";
import { sanitizeTickerQuery } from "@/lib/input-guard";
import {
  pickTickerSuggestion,
  resolveTypedTicker,
} from "@/lib/market/ticker-search";
import { sanitizePopularTickers } from "@/lib/popular-tickers";
import { normalizeYahooTicker } from "@/lib/ticker";
import type { Quote } from "@/lib/types";
import {
  addWatchlistTicker,
  removeWatchlistTicker,
} from "@/lib/watchlist";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

/*
  Pick one to watch, and hear back about it straight away.

  A row of thirty grey chips is a form nobody finishes, because nothing
  happens when you press one. Pressing one here goes and gets that
  company's price and says it in a line, so the first thing a reader does
  on this screen produces a real answer about a real company, which is the
  whole promise of the app in one tap.

  The offer is `sanitizePopularTickers`, never a slice of it: that function
  is what decides the offer everywhere else in the app, seven everybody can
  name first and the month's movers after. Cutting it to twelve is how a
  reader ended up being offered RIG and PLUG and no Apple.
*/

const POPULAR_PICKS = sanitizePopularTickers(null);

export function WatchScreen({
  watching,
  onWatching,
}: {
  watching: string[];
  onWatching: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [popular, setPopular] = useState<string[]>([...POPULAR_PICKS]);
  /** The one a reader last pressed, which is the one to say something about. */
  const [asked, setAsked] = useState<string | null>(null);
  /*
    Asking, an answer, or no price at all. Three states rather than two,
    because a price that never arrives must not leave "Getting today's
    price …" on screen for ever: the reader pressed a chip and is owed an
    outcome either way, and the honest outcome is sometimes that the free
    providers had nothing this minute.
  */
  const [quote, setQuote] = useState<Quote | "none" | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    void fetch("/api/popular-tickers", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { tickers?: string[] } | null) => {
        if (ctrl.signal.aborted) return;
        if (data?.tickers?.length) {
          setPopular(sanitizePopularTickers(data.tickers));
        }
      })
      .catch(() => {
        /* The seeded list already stands. */
      });
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    if (!asked) {
      setQuote(null);
      return;
    }
    setQuote(null);
    const ctrl = new AbortController();
    void fetch(`/api/quotes?tickers=${encodeURIComponent(asked)}`, {
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { quotes?: Record<string, Quote> } | null) => {
        if (ctrl.signal.aborted) return;
        setQuote(data?.quotes?.[asked] ?? "none");
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setQuote("none");
      });
    return () => ctrl.abort();
  }, [asked]);

  function toggle(symbol: string) {
    const t = symbol.trim().toUpperCase();
    if (!t) return;
    if (watching.includes(t)) {
      onWatching(removeWatchlistTicker(watching, t));
      if (asked === t) setAsked(null);
      return;
    }
    onWatching(addWatchlistTicker(watching, t));
    setAsked(t);
  }

  async function addDraft() {
    const raw = draft.trim();
    if (!raw) return;
    let t = resolveTypedTicker(raw, []);
    if (!t) {
      try {
        const res = await fetch(
          `/api/market/search?q=${encodeURIComponent(raw)}`,
          { cache: "no-store" }
        );
        const data = (await res.json()) as {
          results?: { symbol: string; name: string | null }[];
        };
        t = pickTickerSuggestion(raw, data.results ?? [])?.symbol ?? "";
        if (t) t = normalizeYahooTicker(t);
      } catch {
        t = "";
      }
    }
    if (!/^[A-Z0-9.=^-]{1,12}$/.test(t)) return;
    onWatching(addWatchlistTicker(watching, t));
    setAsked(t);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-4">
      <TourAsk>Press one you are curious about.</TourAsk>

      {/*
        Above the chips, not below them. Thirty chips is about three hundred
        pixels, so a line underneath them is off the screen at the moment
        somebody presses one, and a tap that appears to do nothing is worse
        than no answer at all.
      */}
      {asked && (
        <p
          className="text-sm leading-relaxed text-muted-foreground"
          aria-live="polite"
        >
          {quote === null && <>Getting today&apos;s price for {cashtag(asked)} …</>}
          {quote === "none" && (
            <>
              No price for {cashtag(asked)} this minute. It is on your list
              either way, and Pulse picks it up the next time the market
              prints.
            </>
          )}
          {quote !== null && quote !== "none" && (
            <>
              {cashtag(asked)} is {currency(quote.price, 2)} right now,{" "}
              {signedPercent(quote.changePercent, 1)} today. You hear about it
              in Pulse and in the Sunday email without owning any of it.
            </>
          )}
        </p>
      )}

      <HouseholdCoinChips active={watching} onPick={toggle} />

      <div className="flex flex-wrap gap-2">
        {popular.map((t) => {
          const on = watching.includes(t);
          return (
            <Button
              key={t}
              type="button"
              size="sm"
              variant={on ? "default" : "outline"}
              aria-pressed={on}
              onClick={() => toggle(t)}
            >
              {t}
            </Button>
          );
        })}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void addDraft();
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(sanitizeTickerQuery(e.target.value))}
          placeholder="Apple or Bitcoin"
          autoComplete="off"
          aria-label="Another company to watch"
        />
        <Button type="submit" variant="outline">
          Add
        </Button>
      </form>

      {watching.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {watching.map((t) => (
            <li key={t}>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => toggle(t)}
                aria-label={`Stop watching ${t}`}
              >
                {t}
                <X data-icon="inline-end" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
