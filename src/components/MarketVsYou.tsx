"use client";

import { cn, signedPercent } from "@/lib/format";
import { swarmLayout, type MarketOrYou } from "@/lib/market-or-you";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";

/**
 * The question Pulse exists to answer, as one picture: where did each of
 * your companies land today, against where the whole market landed?
 *
 * The sentences under it say the same thing and stay, because a picture
 * is not read by a screen reader and a number in a sentence can be
 * quoted. What the picture adds is the one thing prose cannot do at a
 * glance: seven tickers clustered around the market's line and one off on
 * its own is the whole day, understood before a word is read.
 *
 * The market is a line, the reader is a gold mark on the rail under it,
 * and each holding is a chip at its own move. A chip that did something
 * the market did not (the same `standouts` the sentence names) carries
 * its figure and its colour; the rest stay quiet, because a picture where
 * everything is loud has nothing to say. Pressing a chip goes to that
 * company's card. On arrival the chips travel out from zero, which is the
 * picture explaining itself once; after that they only move when a price
 * does.
 */
export function MarketVsYou({
  split,
  holdings,
  marketName,
}: {
  split: MarketOrYou;
  holdings: { ticker: string; label: string; todayPct: number | null }[];
  marketName: string;
}) {
  /*
    The track's real width, because lanes are decided in pixels (a chip is
    the same size on every screen and the track is not). Read before paint
    so the first frame is already laid out for this device.
  */
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackPx, setTrackPx] = useState(800);
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const read = () => {
      const w = el.clientWidth;
      if (w > 0) setTrackPx((prev) => (Math.abs(prev - w) < 1 ? prev : w));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const layout = useMemo(
    () => swarmLayout(split, holdings, { trackPx, pctText: signedPercent }),
    [split, holdings, trackPx]
  );
  const LANE = 34;
  const trackH = layout.lanes * LANE;
  const marketX = layout.xOf(split.marketPct);
  const youX = layout.xOf(split.yoursPct);
  const zeroX = layout.xOf(0);

  const anchor = (x: number): CSSProperties =>
    x < 0.14
      ? { left: `${x * 100}%`, transform: "translateX(-12px)" }
      : x > 0.86
        ? { left: `${x * 100}%`, transform: "translateX(calc(-100% + 12px))" }
        : { left: `${x * 100}%`, transform: "translateX(-50%)" };

  const describe = `${marketName} ${signedPercent(split.marketPct)}, your portfolio ${signedPercent(split.yoursPct)}. ${layout.marks
    .map((m) => `${m.label} ${signedPercent(m.pct)}`)
    .join(", ")}.`;

  return (
    <figure className="flex flex-col gap-2" aria-label={describe}>
      {/* The market's name and figure, over its line. */}
      <div className="relative h-5" aria-hidden>
        <span
          className="absolute top-0 whitespace-nowrap font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground"
          style={anchor(marketX)}
        >
          {marketName.replace(/^The /, "")}{" "}
          <span className="text-foreground">{signedPercent(split.marketPct)}</span>
        </span>
      </div>

      <div ref={trackRef} className="relative" style={{ height: trackH }} aria-hidden>
        {/* Zero: where "no move at all" is. */}
        <div
          className="absolute inset-y-0 w-px border-l border-dashed border-foreground/15"
          style={{ left: `${zeroX * 100}%` }}
        />
        {/* The market's own move, the line everything is read against. */}
        <div
          className="swarm-line absolute -top-1 -bottom-3 w-0.5 -translate-x-1/2 rounded-full bg-foreground/45"
          style={{ left: `${marketX * 100}%` }}
        />
        {layout.marks.map((m, i) => (
          <a
            key={m.ticker}
            href={`#pulse-card-${m.ticker}`}
            tabIndex={-1}
            onClick={(e) => {
              const el = document.getElementById(`pulse-card-${m.ticker}`);
              if (!el) return;
              e.preventDefault();
              el.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={cn(
              "swarm-chip pointer-events-auto absolute inline-flex h-7 -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 font-mono text-xs tabular-nums transition-[left,background-color,border-color] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
              m.standout
                ? m.pct >= 0
                  ? "border border-gain/60 bg-background text-foreground hover:bg-gain/10"
                  : "border border-loss/60 bg-background text-foreground hover:bg-loss/10"
                : "border border-border bg-background text-muted-foreground hover:text-foreground"
            )}
            style={
              {
                left: `${m.x * 100}%`,
                top: m.lane * LANE + 2,
                animationDelay: `${Math.min(i, 12) * 35}ms`,
              } as CSSProperties
            }
            title={`${m.label} ${signedPercent(m.pct)} today`}
          >
            <span className={m.standout ? "font-semibold text-foreground" : undefined}>
              {m.label}
            </span>
            {m.standout ? (
              <span className={m.pct >= 0 ? "text-gain" : "text-loss"}>
                {signedPercent(m.pct)}
              </span>
            ) : null}
          </a>
        ))}
      </div>

      {/* The rail: the reader's own portfolio as the gold mark on it. */}
      <div className="relative mt-2 h-10" aria-hidden>
        <div className="absolute inset-x-0 top-2 h-px bg-foreground/15" />
        <div
          className="swarm-chip absolute top-0.5 size-3.5 -translate-x-1/2 rounded-full bg-primary ring-4 ring-primary/20 transition-[left] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{ left: `${youX * 100}%` }}
        />
        <span
          className="absolute top-5 whitespace-nowrap font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground"
          style={anchor(youX)}
        >
          You <span className="text-primary">{signedPercent(split.yoursPct)}</span>
        </span>
      </div>
    </figure>
  );
}
