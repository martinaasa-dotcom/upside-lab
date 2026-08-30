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
import { DockMarker } from "@/components/DockMarker";
import { CircleNavIcon } from "@/components/CircleIcons";
import {
  Activity,
  FlaskConical,
  House,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ComponentType } from "react";

export type { MobileTabId } from "@/lib/mobile-tab";
export { activeMobileTab, mobileTabFromActiveId } from "@/lib/mobile-tab";

/*
  The phone's dock.

  A capsule of equal cells across the width of the screen, each an icon over
  its own name, ending on Circle rather than on a glyph of a compass.
  Upside Arena's `BottomDock` is the same design below `md`, and the two apps
  are meant to stay one.

  THE NAMES ARE PAINTED NOW, AND THAT REPLACED SAYING THEM.

  This bar used to be glyphs and no words, with the pressed cell's name
  rising above it for 900ms on `pointerdown` -- a real answer to a real
  problem (a wordless bar cannot be read by somebody who has not learnt it)
  and the wrong shape of answer, because it only ever named the room you had
  already chosen. What somebody new needs named is the room they have NOT
  been to, which is the one a transient label can never reach.

  So the label is under the glyph, always, the way the reference bar this
  design is judged against does it, and the bar widened to pay for it: it
  stretches the page rather than hugging its contents, and the cells are
  equal fractions of that. Two things fell out of the change and both are
  worth keeping. The bar no longer re-renders on `pointerdown` -- the spoken
  name was React state set from the press handler, so every tap did a render
  before the browser could even dispatch the click that navigates. And the
  press no longer has to say anything at all, which leaves the marker as the
  only thing that answers it.

  WHICH ROOM YOU ARE IN IS A WEIGHT, NOT A COLOUR. The active glyph is drawn
  at a heavier stroke in full `--foreground` and its name goes with it; every
  other cell is a light stroke in muted. That is the reference's filled-
  against-outline read, in the one form that survives our icon set: half of
  these glyphs are open paths (a line chart, a trend arrow) and filling one
  is a blot rather than a solid icon. Weight reads the same and reads on all
  six. The accent is still spent only on news.

  The desktop dock is `BookModeDock`. It carries one cell per portfolio, and
  a portfolio's name is somebody's own word and can never be a glyph.
*/

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

  const marker = useDockMarker("phone");
  const rowRef = marker.ref;

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
        /*
         * `px-2`, not `px-4`. The bar carries six names now, and every
         * pixel of gutter is a pixel off the widest of them: at 390 the
         * old gutter left 59px a cell and "Holdings" needs 53 of it, with
         * nothing left at 360. This is still a centring container with
         * `pointer-events-none`, and the bar itself takes the taps, or a
         * full-width element eats every one along the bottom of the page.
         */
        "keyboard-chrome pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden",
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
           * `w-full` and a grid of equal fractions, where this used to be
           * `w-fit` and a flex row. A bar that hugs six glyphs is 316px of
           * a 390px screen; a bar that carries six names needs all of it,
           * and equal tracks are what keep the marker the same shape
           * whichever cell it is on. `minmax(0, 1fr)` rather than `1fr`, or
           * a long name sets the track width and the six stop being equal.
           *
           * `glass-dock` after `card-sheen glass`: the same pane with the
           * chrome fill and a harder blur instead of the card veil. It is
           * the one surface in the app sitting over the hottest part of
           * the cool lobe, and at the card's 2% veil it was reading
           * bluer than the field beside it rather than quieter. The rim,
           * the ring and the lift shadow are untouched. Numbers in
           * globals.css and DESIGN_TOKENS.md.
           */
          "card-sheen glass glass-dock pointer-events-auto relative grid w-full max-w-lg items-center gap-1 rounded-full p-1 ring-1 ring-foreground/20"
        )}
        style={{
          gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
        }}
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
              data-dock-cell
              data-dock-goes
              data-on={on ? "" : undefined}
              aria-current={on ? "page" : undefined}
              className={cn(
                /*
                 * `min-w-0` is load-bearing: a grid item's default minimum
                 * is its content, so without it the longest name sets the
                 * track and the six cells stop being equal fractions.
                 * `rounded-full` on a cell wider than it is tall is a
                 * stadium, and stays concentric with the shell's own
                 * `rounded-full` at `p-1` -- the one radius pair that does.
                 */
                "dock-cell relative z-[1] flex min-w-0 flex-col items-center justify-center gap-1 rounded-full py-2",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                on ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <span className="dock-glyph relative flex">
                {/*
                  The weight is what says which room you are in. Filled
                  against outline is the read the reference uses and it does
                  not survive this icon set -- a line chart and a trend
                  arrow are open paths, and filling one is a blot. A heavier
                  stroke in full foreground reads the same and reads on all
                  six.
                */}
                <Icon
                  className="h-5 w-5"
                  strokeWidth={on ? 2.5 : 1.75}
                  aria-hidden
                />
                {/*
                  The one saturated pixel left on the bar. The accent is not
                  spent on which room you are in, because that is the least
                  surprising fact on the screen; it is spent on news.
                */}
                {id === "home" && alertCount > 0 && !on && (
                  <span className="absolute -top-0.5 -right-1 h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </span>
              {/*
                `text-xs` is the floor for anything a person reads, so the
                cell width is sized to this rather than the other way round.
                `truncate` is the backstop for a narrow phone, and the full
                name is still on the link for a screen reader.
              */}
              <span className="max-w-full truncate text-xs leading-none font-medium">
                {shortLabel}
              </span>
              <span className="sr-only">{label}</span>
            </Link>
          );
        })}

        {/*
          The marker, and the pointer's own pane behind it. Both are
          `DockMarker`, which the laptop dock draws too: the two bars are
          one design and the marker is the part of it a reader watches
          most, so it is one component rather than two that agree today.
        */}
        <DockMarker state={marker} shape="top-1 bottom-1" />

      </div>
    </nav>
  );
}
