"use client";

import { quotePollMs, quotesUrl } from "@/lib/market/session";
import { cn, currency, signedPercent, signedTone } from "@/lib/format";
import { formatDateTime } from "@/lib/timezone";
import { useEffect, useState } from "react";

/**
 * The one figure on a hard-cached page that goes stale in a minute.
 *
 * The rest of a research page is a company's accounts and an argument
 * about them, and neither of those changes between lunch and dinner, which
 * is what makes the page cacheable for hours at a time. The share price is
 * not like that, and a page that prints a six hour old price with nothing
 * saying so is exactly the quietly wrong sentence this product exists to
 * not print.
 *
 * So the price is the one thing the browser is allowed to go and get.
 * The server's figure is rendered first, with the moment it was taken
 * printed underneath it, so a reader with no scripts, and a crawler, still
 * get a real number and the honest age of it. The live one replaces it
 * when it lands and the stamp changes to say the price is live.
 *
 * The quotes route is public and cached at the edge for between fifteen
 * and sixty seconds depending on the session, so a page being read by a
 * thousand people is not a thousand calls to a provider. On top of that
 * this only polls while the tab is actually being looked at: a page left
 * open in a background tab for a week is one of the cheapest ways there
 * is to spend somebody else's rate limit.
 */
export function ResearchPrice({
  ticker,
  price,
  changePercent,
  code,
  at,
}: {
  ticker: string;
  price: number | null;
  changePercent: number | null;
  code: string;
  /** When the server took the figure above. */
  at: string | null;
}) {
  const [live, setLive] = useState<number | null>(null);

  useEffect(() => {
    if (!ticker) return;
    let stop = false;
    let timer: number | undefined;

    const tick = async () => {
      if (typeof document !== "undefined" && document.hidden) {
        if (!stop) timer = window.setTimeout(() => void tick(), quotePollMs());
        return;
      }
      try {
        const res = await fetch(quotesUrl([ticker]), { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          quotes?: Record<string, { price?: number }>;
        };
        const quotes = data.quotes ?? {};
        const found =
          quotes[ticker]?.price ?? Object.values(quotes)[0]?.price ?? null;
        if (!stop && typeof found === "number" && found > 0) setLive(found);
      } catch {
        /* a missed poll is the next poll's problem */
      } finally {
        if (!stop) timer = window.setTimeout(() => void tick(), quotePollMs());
      }
    };

    void tick();
    return () => {
      stop = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [ticker]);

  const shown = live ?? price;
  const stamp = live
    ? "Live price"
    : at
      ? `Price taken ${formatDateTime(at, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}`
      : null;

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <span className="font-mono text-2xl font-bold tabular-nums text-foreground">
        {currency(shown, 2, code)}
      </span>
      {changePercent !== null && !live && (
        <span
          className={cn(
            "font-mono text-sm tabular-nums",
            signedTone(changePercent)
          )}
        >
          {signedPercent(changePercent)} on the day it was taken
        </span>
      )}
      {stamp && (
        <span className="text-xs text-muted-foreground">{stamp}</span>
      )}
    </div>
  );
}
