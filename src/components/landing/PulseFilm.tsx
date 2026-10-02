"use client";

import { CountUp } from "@/components/ui/CountUp";
import { cashtag, cn, currency, signedCurrency, signedPercent } from "@/lib/format";
import {
  FILM_DAYS,
  FILM_MARKET_NAME,
  FILM_TICKS,
  filmLanes,
  filmX,
  type FilmDay,
  type FilmMove,
} from "@/lib/landing-film";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/*
  A made-up week, played. The first thing a stranger sees, and the first
  screen of the walkthrough.

  What it shows is the one question this app answers every day, as a
  picture rather than a sentence: five companies as chips at their own
  move, the whole market as a line through them, and your portfolio as the
  gold mark underneath. On a normal day the chips sit in a knot around the
  line. On a day one company had news of its own, that chip is off on its
  own and the caption says why. Three days play in turn, and the same five
  chips glide from one day to the next, so the eye follows a company rather
  than re-reading a list.

  ## The motion, and what each piece of it is for

    The chips glide on a slight spring when the day changes. Five objects
    rearranging is the lesson: the knot, and the one that leaves it.

    A gold line sweeps the track a moment later and each chip flashes as
    it passes. That is the app reading the day, once per company.

    The caption says it is reading the day while the sweep runs, and the
    sentence lands after it, so the words arrive after the picture they
    explain. It carries the chip it is about, ringed the same way.

    The figures roll between days rather than swapping.

  All of it is transform and opacity, so none of it lays the page out
  again. Under reduced motion nothing moves and nothing plays by itself:
  the days are three buttons, and the picture simply changes.

  ## What it never does

  The first paint is the finished Monday. Nothing here starts hidden and
  arrives, because a picture that is still assembling on the first frame
  is the "page still loading" fault `landing-paint.test.ts` exists to stop.
  The sweep that plays once after it mounts is light passing over a
  finished picture, not the picture being built.

  It plays by itself only after hydration, so the timer and the handler
  that answers it exist together, and it stops while a pointer rests on it,
  while anything inside it has focus, and once somebody has picked a chip
  to read about.
*/

/** How long each day holds before the next, while it is playing. */
const DAY_MS = 6500;
/** One row of chips, chip plus breathing room. */
const LANE_PX = 34;
/** Room above the rows for the market's label. */
const TOP_PX = 26;
/** Room under the track for the portfolio's mark and the scale. */
const BOTTOM_PX = 46;

/*
  A first guess at each chip's width, so the server lays the chips out
  without overlapping before the browser has measured anything. The real
  widths replace it after the first paint; the guess is close enough that
  nothing visibly moves when they do.
*/
function guessWidth(m: FilmMove): number {
  return 22 + cashtag(m.ticker).length * 8.6 + 6 + signedPercent(m.pct).length * 7.3;
}

function useTrackWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(480);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = el.clientWidth;
      if (w > 0) setWidth((prev) => (Math.abs(prev - w) < 1 ? prev : w));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A label that rides on a mark. The outer span travels to the mark in
 * pixels, so a day change is one transform; the inner span decides which
 * edge of the label sits on the mark, and keeps it inside the track at
 * either end rather than hanging off the card.
 */
function Riding({
  x,
  trackPx,
  className,
  style,
  children,
}: {
  x: number;
  trackPx: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const inner =
    x < 0.12
      ? "translateX(-10px)"
      : x > 0.88
        ? "translateX(calc(-100% + 10px))"
        : "translateX(-50%)";
  return (
    <span
      className={cn("film-glide absolute left-0", className)}
      style={{ ...style, transform: `translateX(${x * trackPx}px)` }}
    >
      <span
        className="film-glide-anchor block whitespace-nowrap"
        style={{ transform: inner }}
      >
        {children}
      </span>
    </span>
  );
}

/** A static label at a fixed place on the scale. */
function anchorAt(x: number): CSSProperties {
  if (x < 0.12) return { left: `${x * 100}%`, transform: "translateX(-10px)" };
  if (x > 0.88)
    return { left: `${x * 100}%`, transform: "translateX(calc(-100% + 10px))" };
  return { left: `${x * 100}%`, transform: "translateX(-50%)" };
}

export function PulseFilm({
  compact = false,
  footer,
  figureClassName,
  className,
}: {
  /** The walkthrough and the sign-in column: tighter, smaller figure. */
  compact?: boolean;
  /** A row under the caption, for the page's own note and button. */
  footer?: ReactNode;
  /**
   * The portfolio figure's size. The landing sets its own display size
   * here, off the app's type ladder on purpose (it is the marketing page);
   * everywhere else the figure stays on the ladder.
   */
  figureClassName?: string;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  /** A company somebody pressed, to read about rather than the day. */
  const [picked, setPicked] = useState<string | null>(null);
  /** How many times the day has changed. The first paint is change zero. */
  const [changes, setChanges] = useState(0);
  /**
   * The change on which somebody last pressed a chip. The caption's reading
   * beat belongs to a new day arriving, and must not replay because a reader
   * opened a company and closed it again.
   */
  const [pickedOn, setPickedOn] = useState(-1);
  const [mounted, setMounted] = useState(false);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [still, setStill] = useState(true);
  const [trackRef, trackPx] = useTrackWidth();
  const chipRefs = useRef(new Map<string, HTMLButtonElement>());
  const [widths, setWidths] = useState<Record<string, number>>({});

  const day: FilmDay = FILM_DAYS[index]!;

  useEffect(() => {
    setMounted(true);
    setStill(prefersReducedMotion());
  }, []);

  /* The real chip widths, once they exist, and again if the text changes. */
  useLayoutEffect(() => {
    const next: Record<string, number> = {};
    let changed = false;
    for (const [t, el] of chipRefs.current) {
      const w = Math.ceil(el.offsetWidth);
      next[t] = w;
      if (widths[t] !== w) changed = true;
    }
    if (changed) setWidths(next);
  }, [index, trackPx, widths]);

  const layouts = useMemo(
    () =>
      FILM_DAYS.map((d) =>
        filmLanes(
          d.moves.map((m) => ({
            ticker: m.ticker,
            pct: m.pct,
            width: widths[m.ticker] ?? guessWidth(m),
          })),
          trackPx,
          d.marketPct
        )
      ),
    [trackPx, widths]
  );
  /* As tall as the busiest day, so the card never changes height mid-play. */
  const lanes = Math.max(
    1,
    ...layouts.flatMap((l) => l.map((c) => c.lane + 1))
  );
  const place = new Map(layouts[index]!.map((c) => [c.ticker, c]));

  const playing = mounted && !still && !hover && !focus && picked === null;

  function go(next: number) {
    setIndex(((next % FILM_DAYS.length) + FILM_DAYS.length) % FILM_DAYS.length);
    setPicked(null);
    setChanges((c) => c + 1);
  }

  const standout = day.news;
  const chosen = picked ? day.moves.find((m) => m.ticker === picked) ?? null : null;
  const about = chosen ?? standout;
  const marketX = filmX(day.marketPct);
  const youX = filmX(day.pct);

  /* What the caption is about, said once, and re-said when it changes. */
  const caption = chosen
    ? {
        tag: chosen.news ? "Its own news" : "With the market",
        title: `${chosen.company}, ${signedPercent(chosen.pct)}`,
        line: chosen.verdict,
        news: chosen.news,
      }
    : {
        tag: standout ? "Its own news" : "With the market",
        title: day.title,
        line: day.line,
        news: Boolean(standout),
      };
  const captionKey = `${day.id}:${picked ?? ""}:${changes}`;
  /* A new day arriving, rather than a reader opening a chip. */
  const arriving = changes > 0 && pickedOn !== changes;

  /* The days, which are also the clock. */
  const tabs = (
    <div className="flex shrink-0 gap-1.5" role="group" aria-label="Which day">
      {FILM_DAYS.map((d, i) => {
        const on = i === index;
        return (
          <button
            key={d.id}
            type="button"
            aria-pressed={on}
            aria-label={d.day}
            onClick={() => go(i)}
            className={cn(
              "group flex w-11 flex-col items-stretch gap-1.5 rounded-md pt-1 pb-1.5 text-center font-mono text-xs uppercase tracking-[0.08em] transition-colors",
              on ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {d.short}
            <span className="relative block h-0.5 overflow-hidden rounded-full bg-foreground/15">
              <span
                key={on ? `${d.id}:${changes}` : d.id}
                className={cn(
                  "absolute inset-0 origin-left rounded-full bg-primary",
                  on && mounted && !still && "film-progress",
                  on && mounted && !still && !playing && "film-progress-paused"
                )}
                style={{
                  ["--film-day" as string]: `${DAY_MS}ms`,
                  ...(on && mounted && !still
                    ? {}
                    : { transform: `scaleX(${on || i < index ? 1 : 0})` }),
                }}
                onAnimationEnd={() => {
                  if (on) go(index + 1);
                }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );

  const figure = (
    <CountUp
      value={day.close}
      format={(n) => currency(n, 0)}
      className={cn(
        "font-heading font-semibold tracking-[-0.03em] tabular-nums text-foreground",
        "text-2xl",
        figureClassName
      )}
    />
  );

  /* The day's move: money, then the percent, rolling between days. */
  const change = (
    <>
      <CountUp
        value={day.dollars}
        format={(n) => signedCurrency(n, 0)}
        className={cn(
          "font-mono font-medium tabular-nums transition-colors duration-500",
          compact ? "text-sm" : "text-lg",
          day.dollars >= 0 ? "text-gain" : "text-loss"
        )}
      />
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {compact ? " " : null}
        <CountUp value={day.pct} format={(n) => signedPercent(n)} /> today
      </span>
    </>
  );

  const lanePx = compact ? LANE_PX - 6 : LANE_PX;
  const height = TOP_PX + lanes * lanePx + BOTTOM_PX;
  const scanKey = `${changes}`;

  return (
    <figure
      className={cn(
        /*
          Clipped sideways, never down. The chips are placed by transform,
          and under reduced motion their first layout left overflow behind
          that let a 360px page scroll 183px sideways until anything forced
          them to lay out again. `clip` rather than `hidden`, so the card
          does not become a scroller.
        */
        "film card-sheen glass relative flex min-w-0 flex-col overflow-x-clip rounded-2xl ring-1 ring-foreground/20",
        compact ? "gap-3.5 p-4" : "gap-5 p-5 sm:p-6",
        className
      )}
      aria-label={`A made-up portfolio on a made-up ${day.day}. ${FILM_MARKET_NAME} ${signedPercent(day.marketPct)}, the portfolio ${signedPercent(day.pct)}. ${day.title}. ${day.line}`}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setHover(true);
      }}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocus(false);
        }
      }}
    >
      {compact ? (
        /*
          One row rather than two in a column: the walkthrough's first
          screen has to fit a phone without scrolling, and the day's name
          already sits over the figure.
        */
        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm text-muted-foreground">
              A made-up {day.day}
            </span>
            {figure}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {tabs}
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {change}
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              A made-up week
            </p>
            {tabs}
          </div>
          <div className="flex items-end justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-sm text-muted-foreground">{day.day}</span>
              {figure}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 pb-0.5">
              {change}
            </div>
          </div>
        </>
      )}

      {/* The picture. */}
      <div
        ref={trackRef}
        className="relative select-none"
        style={{ height }}
        aria-hidden
      >
        {/* The scale: faint gridlines, so the picture has units. */}
        {FILM_TICKS.map((v) => (
          <span
            key={v}
            className={cn(
              "absolute w-px",
              v === 0 ? "bg-foreground/15" : "bg-foreground/[0.06]"
            )}
            style={{
              left: `${filmX(v) * 100}%`,
              top: TOP_PX - 4,
              bottom: BOTTOM_PX - 2,
            }}
          />
        ))}
        {FILM_TICKS.map((v) => (
          <span
            key={`t${v}`}
            className="absolute bottom-0 font-mono text-xs tabular-nums text-muted-foreground/70"
            style={anchorAt(filmX(v))}
          >
            {signedPercent(v, 0)}
          </span>
        ))}

        {/* The track itself. */}
        <span
          className="absolute inset-x-0 h-px bg-foreground/25"
          style={{ bottom: BOTTOM_PX - 1 }}
        />

        {/* The market: a line through the knot, with its name over it. */}
        <span
          className="film-glide absolute w-px bg-foreground/55"
          style={{
            left: 0,
            top: TOP_PX - 6,
            bottom: BOTTOM_PX - 1,
            transform: `translateX(${marketX * trackPx}px)`,
          }}
        >
          <span
            className={cn(
              "absolute -inset-x-1 inset-y-0 rounded-full",
              !standout && "film-market-glow"
            )}
          />
        </span>
        <Riding
          x={marketX}
          trackPx={trackPx}
          className="top-0 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground"
        >
          {FILM_MARKET_NAME}{" "}
          <span className="text-foreground">{signedPercent(day.marketPct)}</span>
        </Riding>

        {/* The portfolio: a gold mark on the track, with its figure under it. */}
        <span
          className="film-glide absolute left-0 size-2.5"
          style={{
            bottom: BOTTOM_PX - 6,
            transform: `translateX(${youX * trackPx - 5}px)`,
          }}
        >
          <span
            className="block size-2.5 rotate-45 rounded-[2px] bg-primary"
            style={{ boxShadow: "0 0 0 3px var(--background)" }}
          />
        </span>
        <Riding
          x={youX}
          trackPx={trackPx}
          className="font-mono text-xs tabular-nums text-primary"
          style={{ bottom: 18 }}
        >
          You {signedPercent(day.pct)}
        </Riding>

        {/* The chips. */}
        {day.moves.map((m, i) => {
          const at = place.get(m.ticker);
          const left = at?.left ?? 0;
          const lane = at?.lane ?? 0;
          const isStandout = standout?.ticker === m.ticker;
          const isPicked = picked === m.ticker;
          const flashAt = 380 + ((left + (widths[m.ticker] ?? 80) / 2) / trackPx) * 900;
          return (
            <button
              key={m.ticker}
              ref={(el) => {
                if (el) chipRefs.current.set(m.ticker, el);
                else chipRefs.current.delete(m.ticker);
              }}
              type="button"
              tabIndex={-1}
              onClick={() => {
                setPicked((p) => (p === m.ticker ? null : m.ticker));
                setPickedOn(changes);
              }}
              className={cn(
                "film-chip absolute left-0 flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-sm ring-1",
                compact ? "h-6" : "h-7",
                /*
                  Opaque, so a chip passing another mid-glide covers it
                  rather than printing two tickers through each other.
                */
                "film-chip-fill",
                isStandout
                  ? "film-chip-standout text-foreground ring-primary/80"
                  : "text-foreground/90 ring-foreground/20 hover:ring-foreground/45",
                isPicked && "ring-2 ring-foreground/80"
              )}
              style={{
                bottom: BOTTOM_PX + 4,
                transform: `translate3d(${left}px, ${-lane * lanePx}px, 0)`,
                transitionDelay: changes > 0 ? `${i * 45}ms` : "0ms",
              }}
            >
              {mounted && !still ? (
                <span
                  key={scanKey}
                  className="film-chip-flash pointer-events-none absolute inset-0 rounded-full"
                  style={{ animationDelay: `${changes > 0 ? flashAt : flashAt + 400}ms` }}
                />
              ) : null}
              <span className="font-heading text-sm font-semibold tracking-tight">
                {cashtag(m.ticker)}
              </span>
              <span
                className={cn(
                  "font-mono text-xs tabular-nums transition-colors duration-500",
                  m.pct >= 0 ? "text-gain" : "text-loss"
                )}
              >
                {signedPercent(m.pct)}
              </span>
            </button>
          );
        })}

        {/* The sweep: the app reading the day, once per change. */}
        {mounted && !still ? (
          <span
            key={`scan${scanKey}`}
            className="film-scan pointer-events-none absolute w-12"
            style={{
              top: TOP_PX - 6,
              bottom: BOTTOM_PX - 1,
              left: -48,
              /*
                Ends with its bright edge on the end of the track, not past
                it: parked any further, the faded box poked out of a 390px
                screen and made the page scroll sideways by 4px.
              */
              ["--film-scan-to" as string]: `${trackPx}px`,
              animationDelay: changes > 0 ? "380ms" : "780ms",
            }}
          />
        ) : null}
      </div>

      {/*
        The caption. On a change it first says it is reading the day, while
        the sweep crosses the picture, and the sentence lands after it: the
        order the app itself works in.
      */}
      <div
        key={captionKey}
        className={cn(
          "card-sheen glass-well relative rounded-xl px-4 py-3",
          compact ? "min-h-[6.5rem]" : "min-h-[7.25rem]"
        )}
        aria-live="polite"
      >
        {arriving ? (
          <span
            className="film-reading pointer-events-none absolute inset-0 flex items-center gap-2 px-4 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground"
            aria-hidden
          >
            Reading {day.day}
            <span className="film-dots" />
          </span>
        ) : null}
        <div
          className={cn(
            "flex flex-col gap-1.5",
            arriving && "film-caption-in"
          )}
        >
          <span className="flex items-center gap-2">
            {about ? (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-heading text-xs font-semibold ring-1",
                  about.news ? "text-foreground ring-primary/80" : "text-foreground/90 ring-foreground/25"
                )}
              >
                {cashtag(about.ticker)}{" "}
                <span
                  className={cn(
                    "font-mono font-normal tabular-nums",
                    about.pct >= 0 ? "text-gain" : "text-loss"
                  )}
                >
                  {signedPercent(about.pct)}
                </span>
              </span>
            ) : null}
            <span
              className={cn(
                "font-mono text-xs uppercase tracking-[0.1em]",
                caption.news ? "text-primary" : "text-muted-foreground"
              )}
            >
              {caption.tag}
            </span>
          </span>
          <span className="font-heading text-base font-semibold tracking-tight text-foreground">
            {caption.title}
          </span>
          <span className="text-sm leading-snug text-muted-foreground">
            {caption.line}
          </span>
        </div>
      </div>

      {footer}
    </figure>
  );
}
