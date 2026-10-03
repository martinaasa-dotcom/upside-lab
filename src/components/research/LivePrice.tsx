"use client";

import { quotePollMs, quotesUrl } from "@/lib/market/session";
import { sameMoney } from "@/lib/market/same-money";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * The one figure on a hard-cached page that goes stale in a minute, shared
 * by every part of the page that places it.
 *
 * The rest of a research page is a company's accounts and an argument
 * about them, and neither changes between lunch and dinner, which is what
 * makes the page cacheable for hours and its written half for weeks. The
 * share price is not like that. So the price is the one thing the browser
 * goes and gets, and it is fetched ONCE here and handed to the hero, the
 * fair value zones and the valuation picture alike: three separate polls
 * would be three requests for one number and, worse, three numbers that
 * could disagree for a few seconds on the same screen.
 *
 * The server's figure is what a reader with no scripts and a crawler get,
 * with the moment it was taken printed beside it. The live one replaces it
 * when it lands.
 *
 * The quotes route is public and cached at the edge for between fifteen
 * and sixty seconds depending on the session, so a page being read by a
 * thousand people is not a thousand calls to a provider. On top of that
 * this only polls while the tab is actually being looked at: a page left
 * open in a background tab for a week is one of the cheapest ways there is
 * to spend somebody else's rate limit.
 */
export type LivePrice = {
  /** The live price where one has landed, else the page's own figure. */
  price: number | null;
  /** True once a live figure has replaced the page's. */
  live: boolean;
};

const LivePriceContext = createContext<LivePrice | null>(null);

export function LivePriceProvider({
  ticker,
  price,
  code = "USD",
  children,
}: {
  ticker: string;
  /** The page's own figure, from when the server built it. */
  price: number | null;
  /** The listing's money, which every figure on the page is kept in. */
  code?: string;
  children: ReactNode;
}) {
  const [live, setLive] = useState<number | null>(null);

  const priceRef = useRef(price);
  priceRef.current = price;

  useEffect(() => {
    setLive(null);
    if (!ticker) return;
    let stop = false;
    let timer: number | undefined;
    const schedule = () => {
      if (!stop) timer = window.setTimeout(() => void tick(), quotePollMs());
    };

    const tick = async () => {
      if (typeof document !== "undefined" && document.hidden) {
        schedule();
        return;
      }
      try {
        const res = await fetch(quotesUrl([ticker]), { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as {
            quotes?: Record<string, { nativePrice?: number; price?: number }>;
          };
          const quotes = data.quotes ?? {};
          const found = sameMoney(
            quotes[ticker] ?? Object.values(quotes)[0],
            code,
            priceRef.current
          );
          if (!stop && found !== null) setLive(found);
        }
      } catch {
        /* a missed poll is the next poll's problem */
      } finally {
        schedule();
      }
    };

    void tick();
    /*
      A tab coming back into view asks at once rather than waiting out the
      rest of a cycle it slept through, which overnight is ten minutes.
    */
    const onVisible = () => {
      if (document.hidden || stop) return;
      if (timer) window.clearTimeout(timer);
      void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ticker, code]);

  const value = useMemo<LivePrice>(
    () => ({ price: live ?? price, live: live !== null }),
    [live, price]
  );

  return <LivePriceContext.Provider value={value}>{children}</LivePriceContext.Provider>;
}

/**
 * The shared price. Outside a provider it answers with the figure it was
 * handed, so a component that reads it still renders on a page with no
 * live layer, which is how the static render and a test both see it.
 */
export function useLivePrice(fallback: number | null): LivePrice {
  return useContext(LivePriceContext) ?? { price: fallback, live: false };
}
