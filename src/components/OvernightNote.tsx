"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn, signedPercent } from "@/lib/format";
import { formatDateTime } from "@/lib/timezone";
import type { OvernightIndication } from "@/lib/market/overnight";
import { isQuoteFreshForView, quotePollMs } from "@/lib/market/session";

/**
 * One line under the headline, for the eight hours a night when no US
 * venue prices a single stock.
 *
 * It sits *beside* the portfolio value and never inside it. The value on
 * the screen is the last real print and stays that way; this says which
 * way the market has moved since, using the index futures that do trade
 * through the gap. Read from Tallinn the gap is 03:00 to 11:00, so without
 * this the app spends most of a working morning looking frozen with no
 * explanation, which reads as broken rather than as shut.
 *
 * Renders nothing at all outside the window, or when the fetch came back
 * with nothing usable. A blank slot where a figure belongs reads as a
 * figure that failed to load.
 *
 * Whether it is the window at all is the server's call, not this
 * component's: the route answers null outside it. Deciding here would put
 * the reader's device clock in charge of whether the app claims the market
 * is shut, and it would be a second opinion competing with the session
 * badge beside it, which reads Yahoo's own `marketState`. One clock.
 */
export function OvernightNote({ className }: { className?: string }) {
  const [indication, setIndication] = useState<OvernightIndication | null>(null);
  // A ref, not state. Read only inside the effect, and as state it would
  // be a dependency of the effect that writes it, so every successful load
  // would tear the effect down and start another one.
  const fetchedAtRef = useRef(0);
  // Whether the last answer had anything in it, read by the timer below.
  const liveRef = useRef(false);
  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch("/api/market/overnight", { signal });
      if (!res.ok) return;
      const data = (await res.json()) as {
        indication?: OvernightIndication | null;
      };
      if (signal.aborted) return;
      setIndication(data.indication ?? null);
      liveRef.current = Boolean(data.indication?.legs?.length);
      fetchedAtRef.current = Date.now();
    } catch {
      /* keep whatever is on screen */
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);

    let timer = 0;
    // Inside the window the futures move, so this follows the quote
    // cadence. Outside it the answer is null and stays null for hours, so
    // asking every 30 seconds all day is a request per tab per half minute
    // for a word we already know. Five minutes is late enough to be cheap
    // and early enough that the line appears a few minutes into a gap that
    // lasts eight hours.
    const IDLE_MS = 5 * 60_000;
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          if (!document.hidden && !ctrl.signal.aborted) void load(ctrl.signal);
          if (!ctrl.signal.aborted) schedule();
        },
        liveRef.current ? quotePollMs() : IDLE_MS
      );
    };
    schedule();

    // Coming back to the tab is a reader action, so it is judged against
    // what is fresh enough to show, not against the background cadence.
    const onVisible = () => {
      if (document.hidden || ctrl.signal.aborted) return;
      if (isQuoteFreshForView(fetchedAtRef.current)) return;
      void load(ctrl.signal);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  if (!indication?.legs.length) return null;

  // Formatted here rather than on the server: the instant is the server's,
  // the clock it is shown on is the reader's.
  const resumes = formatDateTime(indication.resumesAt, { timeStyle: "short" });

  return (
    <p
      className={cn("text-sm text-muted-foreground", className)}
      title="US stocks do not trade between 20:00 and 04:00 in New York. Index futures do, so this is where the market is heading, not a price for anything you own."
    >
      Overnight futures:{" "}
      {indication.legs.map((leg, i) => (
        <span key={leg.symbol}>
          {i > 0 ? ", " : ""}
          {/*
            The name and its figure are one atom, so a wrap can never leave
            "Nasdaq futures" on one line and "-0.6%" alone on the next,
            which is what it did at 390px. Short enough that it cannot
            overflow the narrowest phone: the line as a whole still wraps,
            which is the rule this has to respect.
          */}
          <span className="whitespace-nowrap">
            {leg.name}{" "}
            <span
              className={cn(
                "font-mono tabular-nums",
                leg.changePercent > 0
                  ? "text-gain"
                  : leg.changePercent < 0
                    ? "text-loss"
                    : "text-muted-foreground"
              )}
            >
              {signedPercent(leg.changePercent)}
            </span>
          </span>
        </span>
      ))}
      .{resumes ? ` Your own prices resume at ${resumes}.` : ""}
    </p>
  );
}
