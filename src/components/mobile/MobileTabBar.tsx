"use client";

import { useCircleHref } from "@/lib/use-circle-href";
import { stashOpenTab } from "@/lib/active-sheet";
import { cn } from "@/lib/format";
import {
  COMPOUND_TAB_ID,
  LAB_TAB_ID,
  OVERVIEW_TAB_ID,
  PULSE_TAB_ID,
} from "@/lib/overview";
import { useDockPad } from "@/lib/use-dock-pad";
import { People } from "@/components/People";
import {
  Activity,
  Calculator,
  FlaskConical,
  LayoutDashboard,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type MobileTabId = "home" | "pulse" | "lab" | "compound" | "circle";

/*
  The phone's dock.

  A capsule that hugs its own contents, carrying glyphs and no words, and
  ending on the people in your circle rather than on a glyph of a compass.
  Upside Arena's `BottomDock` is the same design below `md`, and the two apps
  are meant to stay one; the full account of why is in that file and in both
  AGENTS.md.

  The short version, because it is the thing that makes a wordless bar safe:
  IT SAYS THE NAME OF EVERY ROOM YOU TOUCH, AT THE MOMENT YOU TOUCH IT. On
  `pointerdown`, before the tap has finished and before the room answers, the
  pressed cell's name rises above the bar in the same glass and is gone inside
  a second. At rest there is not a word on screen. In use there is never a tap
  that does not name itself.

  That is deliberately spent on a wait we already had. Every one of these goes
  to the server for its data, and the gap used to be covered by a fill behind
  the cell that said "heard you" and nothing else. Saying which room is the
  same reassurance plus the one thing somebody new is missing, so the fill is
  gone and this replaced it.

  The desktop dock is `BookModeDock`, and it keeps its labels. That is the
  input device rather than an inconsistency: it also carries one cell per
  portfolio, and a portfolio's name is somebody's own word and can never be a
  glyph.
*/

/** How long the name stays up after a press. */
const SAY_MS = 900;

/** The marker's travel. Overshoots slightly and settles, the way a marker does. */
const SLIDE = "cubic-bezier(0.34,1.28,0.52,1)";

const TABS: {
  id: MobileTabId;
  href: string;
  label: string;
  shortLabel: string;
  Icon: typeof LayoutDashboard | null;
  metaId: string | null;
}[] = [
  {
    id: "home",
    href: "/?tab=overview",
    label: "Overview",
    shortLabel: "Home",
    Icon: LayoutDashboard,
    metaId: OVERVIEW_TAB_ID,
  },
  {
    id: "pulse",
    href: "/?tab=pulse",
    label: "Pulse",
    shortLabel: "Pulse",
    Icon: Activity,
    metaId: PULSE_TAB_ID,
  },
  {
    id: "lab",
    href: "/?tab=lab",
    label: "Lab",
    shortLabel: "Lab",
    Icon: FlaskConical,
    metaId: LAB_TAB_ID,
  },
  {
    id: "compound",
    href: "/?tab=compound",
    label: "Compound",
    shortLabel: "Growth",
    Icon: Calculator,
    metaId: COMPOUND_TAB_ID,
  },
  /*
    Circle has no glyph. Arena's last cell is your own face and this is the
    same cell doing the same job: the one destination that is people rather
    than a room. A compass said "explore", which is not what a circle is.
  */
  {
    id: "circle",
    href: "/communities",
    label: "Circle",
    shortLabel: "Circle",
    Icon: null,
    metaId: null,
  },
];

export function activeMobileTab(
  pathname: string,
  tabParam?: string | null
): MobileTabId | null {
  if (pathname.startsWith("/account") || pathname.startsWith("/admin")) {
    return null;
  }
  if (pathname.startsWith("/upside-portfolio")) {
    return null;
  }
  if (pathname.startsWith("/communities")) {
    return "circle";
  }
  const tab = (tabParam ?? "").toLowerCase();
  if (tab === "pulse") return "pulse";
  if (tab === "lab") return "lab";
  if (tab === "compound") return "compound";
  return "home";
}

type Mark = { left: number; width: number };
type Said = { label: string; left: number };

export function MobileTabBar({
  active,
  alertCount = 0,
  className,
  pulseHref,
  hiddenModeIds = [],
  onSelect,
}: {
  active: MobileTabId | null;
  alertCount?: number;
  className?: string;
  pulseHref?: string;
  hiddenModeIds?: string[];
  /** Return true to stay on this page (Dashboard SPA tabs). */
  onSelect?: (id: MobileTabId) => boolean | void;
}) {
  /* A callback ref: see `use-dock-pad.ts` for why the hook takes the node. */
  const [dockEl, setDockEl] = useState<HTMLElement | null>(null);
  const circleHref = useCircleHref();
  useDockPad(dockEl);

  const tabs = TABS.filter(
    (t) => !t.metaId || !hiddenModeIds.includes(t.metaId)
  );

  const rowRef = useRef<HTMLDivElement>(null);
  const [mark, setMark] = useState<Mark | null>(null);
  const [said, setSaid] = useState<Said | null>(null);

  /*
    Placed before it is allowed to move. The marker's first position is
    wherever the room you arrived on happens to be, and animating to it from
    the left edge would draw a marker sliding across a bar nobody has touched.
  */
  const [travels, setTravels] = useState(false);

  const measure = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const on = row.querySelector<HTMLElement>('[data-tab][aria-selected="true"]');
    /*
     * Same object, same state. `setMark` with a freshly built object on
     * every measurement makes every measurement a re-render, and a layout
     * effect that measures after every render then never settles: React
     * error #185, "maximum update depth exceeded", which is exactly what
     * this did the first time it was written. Returning the previous value
     * when the numbers have not moved makes measuring idempotent, so it is
     * safe to measure as often as it takes to be right.
     */
    setMark((was) => {
      if (!on) return null;
      const next = { left: on.offsetLeft, width: on.offsetWidth };
      return was && was.left === next.left && was.width === next.width
        ? was
        : next;
    });
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, active, tabs.length]);

  /*
    A viewer's tier can drop a cell, which moves every cell after it, and the
    bar is re-centred by the change. A marker measured once is a marker beside
    the wrong cell after either.
  */
  useEffect(() => {
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(() => measure());
    watch.observe(row);
    for (const cell of Array.from(row.children)) watch.observe(cell);
    return () => watch.disconnect();
  }, [measure]);

  useEffect(() => {
    if (!mark || travels) return;
    const frame = requestAnimationFrame(() => setTravels(true));
    return () => cancelAnimationFrame(frame);
  }, [mark, travels]);

  const hush = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((label: string, cell: HTMLElement) => {
    setSaid({ label, left: cell.offsetLeft + cell.offsetWidth / 2 });
    if (hush.current) clearTimeout(hush.current);
    hush.current = setTimeout(() => setSaid(null), SAY_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (hush.current) clearTimeout(hush.current);
    };
  }, []);

  return (
    <nav
      ref={setDockEl}
      aria-label="App"
      className={cn(
        /*
         * Same as the desktop dock: no band, just a centring container.
         * `pointer-events-none` here and `pointer-events-auto` on the bar
         * itself, or this full-width element eats every tap along the
         * bottom of the page even though nothing is drawn there.
         */
        "keyboard-chrome pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden",
        className
      )}
    >
      <div
        ref={rowRef}
        role="tablist"
        className={cn(
          /*
           * `glass-dock` after `card-sheen glass`: the same pane with the
           * chrome fill and a harder blur instead of the card veil. It is
           * the one surface in the app sitting over the hottest part of
           * the cool lobe, and at the card's 2% veil it was reading
           * bluer than the field beside it rather than quieter. The rim,
           * the ring and the lift shadow are untouched. Numbers in
           * globals.css and DESIGN_TOKENS.md.
           */
          "card-sheen glass glass-dock pointer-events-auto relative flex w-fit items-center gap-1 rounded-full p-1 ring-1 ring-foreground/20"
        )}
      >
        {tabs.map(({ id, href, label, shortLabel, Icon }) => {
          const on = active === id;
          const to =
            id === "circle"
              ? circleHref
              : id === "pulse" && pulseHref
                ? pulseHref
                : href;
          return (
            <Link
              key={id}
              href={to}
              prefetch
              role="tab"
              data-tab={id}
              aria-label={label}
              aria-current={on ? "page" : undefined}
              aria-selected={on}
              onPointerDown={(e) => say(shortLabel, e.currentTarget)}
              /*
               * A keyboard never presses anything, so the name would never be
               * spoken to somebody tabbing along the bar. Focus is that
               * person's press.
               */
              onFocus={(e) => say(shortLabel, e.currentTarget)}
              onClick={(e) => {
                if (id === "home") stashOpenTab("overview");
                if (id === "pulse") stashOpenTab("pulse");
                if (id === "lab") stashOpenTab("lab");
                if (id === "compound") stashOpenTab("compound");
                if (!onSelect) return;
                if (onSelect(id)) e.preventDefault();
              }}
              className={cn(
                "relative z-[1] flex size-12 shrink-0 appearance-none items-center justify-center rounded-full transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                on ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="relative flex">
                {Icon ? (
                  <Icon
                    className={cn("h-5 w-5", id === "compound" && "scale-110")}
                    strokeWidth={2}
                    aria-hidden
                  />
                ) : (
                  <People />
                )}
                {/*
                  The one saturated pixel left on the bar. The accent is not
                  spent on which room you are in, because that is the least
                  surprising fact on the screen; it is spent on news.
                */}
                {id === "home" && alertCount > 0 && !on && (
                  <span className="absolute -top-0.5 -right-1 h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </span>
            </Link>
          );
        })}

        {/*
          The marker. One element, behind the cells, measured off the live cell
          and moved with a transform so it costs no layout and cannot shift the
          row under a thumb.
        */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1 left-0 h-12 rounded-full bg-foreground/10",
            mark ? "opacity-100" : "opacity-0",
            travels ? "transition-[transform,width,opacity] duration-300" : "transition-none",
            "motion-reduce:transition-none"
          )}
          style={
            mark
              ? {
                  width: `${mark.width}px`,
                  transform: `translateX(${mark.left}px)`,
                  transitionTimingFunction: SLIDE,
                }
              : undefined
          }
        />

        {/* The name, spoken on the press. */}
        <span
          aria-hidden
          className={cn(
            "glass glass-dock pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap text-foreground ring-1 ring-foreground/20",
            "transition-opacity duration-150 motion-reduce:transition-none",
            said ? "opacity-100" : "opacity-0"
          )}
          style={{ left: `${said?.left ?? 0}px` }}
        >
          {said?.label ?? " "}
        </span>
      </div>
    </nav>
  );
}
