"use client";

import { useCircleHref } from "@/lib/use-circle-href";
import { cn } from "@/lib/format";
import {
  COMPOUND_TAB_ID,
  LAB_TAB_ID,
  OVERVIEW_TAB_ID,
  PULSE_TAB_ID,
} from "@/lib/overview";
import {
  GROWTH_PATH,
  LAB_PATH,
  PORTFOLIO_PATH,
  PULSE_PATH,
} from "@/lib/book-routes";
import { type MobileTabId } from "@/lib/mobile-tab";
import { useDockPad } from "@/lib/use-dock-pad";
import { useDockMarker } from "@/lib/use-dock-marker";
import { CircleNavIcon } from "@/components/CircleIcons";
import {
  Activity,
  FlaskConical,
  House,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";

export type { MobileTabId } from "@/lib/mobile-tab";
export { activeMobileTab, mobileTabFromActiveId } from "@/lib/mobile-tab";

/*
  The phone's dock.

  A capsule that hugs its own contents, carrying glyphs and no words, and
  ending on Circle rather than on a glyph of a compass.
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
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  metaId: string | null;
}[] = [
  {
    id: "home",
    href: "/",
    label: "Overview",
    shortLabel: "Home",
    Icon: House,
    metaId: OVERVIEW_TAB_ID,
  },
  /*
    The one cell that is not a section of the app but a place in your own
    data, and the reason it exists: on a phone the holdings table had no
    route at all. Home is the combined view of every portfolio, and the only
    ways down to a real table were the picker in the header title, which
    reads as a heading rather than a control, or a scroll to the bottom of
    Today. The laptop never had that problem, because `BookModeDock` carries
    one cell per portfolio.

    It is one cell rather than one per portfolio because a phone bar has no
    room for a name, and a portfolio's name is somebody's own word and can
    never be a glyph. So it opens the portfolio you were last in, and the
    header picker stays the way you move between them.

    Its href carries no token on purpose. `/portfolio` is read against the
    portfolios that account really has, which is the only place that can
    tell a remembered id from a deleted one, so the dock does not have to
    know. See `tabIdFromPath`.
  */
  {
    id: "holdings",
    href: PORTFOLIO_PATH,
    label: "Holdings",
    shortLabel: "Holdings",
    Icon: Wallet,
    metaId: null,
  },
  {
    id: "pulse",
    href: PULSE_PATH,
    label: "Pulse",
    shortLabel: "Pulse",
    Icon: Activity,
    metaId: PULSE_TAB_ID,
  },
  {
    id: "lab",
    href: LAB_PATH,
    label: "Lab",
    shortLabel: "Lab",
    Icon: FlaskConical,
    metaId: LAB_TAB_ID,
  },
  {
    id: "compound",
    href: GROWTH_PATH,
    label: "Compound",
    shortLabel: "Growth",
    Icon: TrendingUp,
    metaId: COMPOUND_TAB_ID,
  },
  /*
    Arena's last cell is your own face. This is the same cell doing the same
    job: the one destination that is people rather than a room. A compass
    said "explore", which is not what a circle is. Three overlapping discs
    said people, but they were a different material from every other glyph.
    The dotted member ring is the same 24px stroke as the rest of the bar.
  */
  {
    id: "circle",
    href: "/communities",
    label: "Circle",
    shortLabel: "Circle",
    Icon: CircleNavIcon,
    metaId: null,
  },
];

type Said = { label: string; left: number };

export function MobileTabBar({
  active,
  alertCount = 0,
  className,
  hiddenModeIds = [],
}: {
  active: MobileTabId | null;
  alertCount?: number;
  className?: string;
  hiddenModeIds?: string[];
}) {
  /* A callback ref: see `use-dock-pad.ts` for why the hook takes the node. */
  const [dockEl, setDockEl] = useState<HTMLElement | null>(null);
  const circleHref = useCircleHref();
  useDockPad(dockEl);

  const tabs = TABS.filter(
    (t) => !t.metaId || !hiddenModeIds.includes(t.metaId)
  );

  const { ref: rowRef, mark, travels } = useDockMarker();
  const [said, setSaid] = useState<Said | null>(null);

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
        /*
         * Not a tablist, and it never was one. `role="tablist"` promises
         * children that are all `role="tab"`, and a tab switches panels
         * inside one view; every cell here is a link to a destination, so a
         * screen reader handed a tablist full of links may expose none of
         * them. It already sits inside a `<nav aria-label="App">`, which is
         * where the landmark belongs, and `aria-current="page"` is what says
         * where you are. `BookModeDock` had the same lie and lost it for the
         * same reason, so the two docks agree.
         */
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
            id === "circle" ? circleHref : href;
          return (
            <Link
              key={id}
              href={to}
              prefetch
              data-tab={id}
              data-on={on ? "" : undefined}
              aria-label={label}
              aria-current={on ? "page" : undefined}
              onPointerDown={(e) => say(shortLabel, e.currentTarget)}
              /*
               * A keyboard never presses anything, so the name would never be
               * spoken to somebody tabbing along the bar. Focus is that
               * person's press.
               */
              onFocus={(e) => say(shortLabel, e.currentTarget)}
              className={cn(
                "relative z-[1] flex size-12 shrink-0 appearance-none items-center justify-center rounded-full transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                on ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="relative flex">
                <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
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
            "glass glass-dock pointer-events-none absolute bottom-full mb-2 max-w-[60vw] -translate-x-1/2 truncate rounded-full px-3 py-1 text-xs font-medium text-foreground ring-1 ring-foreground/20",
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
