"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { cashtag, cn, signedPercent } from "@/lib/format";
import {
  DOT_PX,
  stripLayout,
  stripX,
  timesTheMarket,
} from "@/lib/red-day-strip";
import {
  SAMPLE_HOLDINGS,
  SAMPLE_MARKET_TICKER,
  SAMPLE_NEWS_TICKER,
  sampleCompany,
  sampleDayFraction,
} from "@/lib/sample-portfolio";
import { MARKET_SPREAD } from "@/lib/tour-sample-day";

const ROWS = SAMPLE_HOLDINGS.map((h) => ({
  ticker: h.ticker,
  move: sampleDayFraction(h),
}));
const MARKET = ROWS.find((r) => r.ticker === SAMPLE_MARKET_TICKER)!.move;
const NEWS = ROWS.find((r) => r.ticker === SAMPLE_NEWS_TICKER)!.move;
const TIMES = timesTheMarket(NEWS, MARKET);
/** One row of dots, plus the gap between rows. */
const LANE_PX = DOT_PX + 4;
/** What the server draws at before the strip has measured itself. */
const FIRST_WIDTH = 300;

/**
 * The red day board's answer, drawn. Every company is a dot at its own move
 * on one line, with the market's own move as a band; a dot fills in once
 * its tile has been turned over, and the one with news stands on its own.
 * See `red-day-strip.ts` for why it is laid out by measured width.
 */
export function RedDayStrip({
  open,
  focus,
}: {
  /** Tiles turned over so far. */
  open: readonly string[];
  /** The tile being pointed at, or the one turned last. */
  focus: string | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FIRST_WIDTH);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => {
      if (el.offsetWidth > 0) setWidth(el.offsetWidth);
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(read);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  const { dots, lanes, low, high } = useMemo(
    () => stripLayout(ROWS, width),
    [width]
  );
  const found = open.includes(SAMPLE_NEWS_TICKER);
  const bandFrom = stripX(MARKET - MARKET_SPREAD, width, low, high);
  const bandTo = stripX(Math.min(high, MARKET + MARKET_SPREAD), width, low, high);
  const newsDot = dots.find((d) => d.ticker === SAMPLE_NEWS_TICKER)!;
  const shown = focus ? dots.find((d) => d.ticker === focus) ?? null : null;
  const pct = (x: number) => `${(x / width) * 100}%`;
  const dotsHeight = lanes * LANE_PX;

  const quiet = ROWS.filter((r) => r.ticker !== SAMPLE_NEWS_TICKER).length;
  const said = `${quiet} companies fell about as far as the market, ${signedPercent(
    MARKET,
    1
  )}. ${sampleCompany(SAMPLE_NEWS_TICKER)} fell ${signedPercent(NEWS, 1)}.`;

  /* The caption above the line: whatever is being pointed at, else the
     finding once it has been made. Never both, so they cannot collide. */
  const caption = shown
    ? {
        x: shown.x,
        text:
          shown.ticker === SAMPLE_NEWS_TICKER && found && TIMES
            ? `${cashtag(shown.ticker)} ${signedPercent(shown.move, 1)}, about ${TIMES} times the market`
            : `${cashtag(shown.ticker)} ${signedPercent(shown.move, 1)}`,
        news: shown.ticker === SAMPLE_NEWS_TICKER,
      }
    : null;

  return (
    <div
      ref={box}
      role="img"
      aria-label={said}
      className="red-day-strip relative w-full select-none"
    >
      {/* Caption row. */}
      <div className="relative h-6" aria-hidden>
        {caption ? (
          <span
            key={caption.text}
            className={cn(
              "strip-caption absolute top-0 font-mono text-xs whitespace-nowrap tabular-nums",
              caption.news ? "text-warning" : "text-foreground"
            )}
            style={
              caption.x < width / 2
                ? { left: pct(Math.max(0, caption.x - DOT_PX / 2)) }
                : { right: pct(Math.max(0, width - caption.x - DOT_PX / 2)) }
            }
          >
            {caption.text}
          </span>
        ) : found && TIMES ? (
          <span
            className="strip-caption absolute top-0 font-mono text-xs whitespace-nowrap text-warning tabular-nums"
            style={{ left: pct(Math.max(0, newsDot.x - DOT_PX / 2)) }}
          >
            About {TIMES} times the market&rsquo;s fall
          </span>
        ) : null}
      </div>

      {/* The line itself. */}
      <div className="relative" style={{ height: dotsHeight + 6 }} aria-hidden>
        <span
          className="absolute inset-y-0 rounded-md bg-foreground/[0.07]"
          style={{ left: pct(bandFrom), width: pct(bandTo - bandFrom) }}
        />
        {found ? (
          <span
            className="strip-reach absolute h-px border-t border-dashed border-warning/70"
            style={{
              left: pct(newsDot.x + DOT_PX / 2 + 2),
              width: pct(Math.max(0, bandFrom - newsDot.x - DOT_PX / 2 - 4)),
              top: newsDot.lane * LANE_PX + DOT_PX / 2 + 3,
            }}
          />
        ) : null}
        {dots.map((d) => {
          const turned = open.includes(d.ticker);
          const news = d.ticker === SAMPLE_NEWS_TICKER;
          const lit = focus === d.ticker;
          return (
            <span
              key={d.ticker}
              className={cn(
                "strip-dot absolute rounded-full border",
                turned
                  ? news
                    ? "border-warning bg-warning"
                    : "border-loss bg-loss"
                  : "border-foreground/45 bg-transparent",
                lit && "strip-dot-lit",
                turned && news && "live-ping"
              )}
              style={{
                width: DOT_PX,
                height: DOT_PX,
                left: `calc(${pct(d.x)} - ${DOT_PX / 2}px)`,
                top: d.lane * LANE_PX + 3,
              }}
            />
          );
        })}
        <span className="absolute inset-x-0 bottom-0 h-px bg-border" />
      </div>

      {/* Scale. */}
      <div
        className="relative mt-1.5 flex h-5 items-start justify-between font-mono text-xs text-muted-foreground tabular-nums"
        aria-hidden
      >
        <span>{signedPercent(low, 0)}</span>
        <span className="text-right">The market, {signedPercent(MARKET, 1)}</span>
      </div>
    </div>
  );
}
