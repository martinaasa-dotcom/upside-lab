"use client";

import { DockMarker } from "@/components/DockMarker";
import { type DockTab } from "@/components/mobile/MobileTabBar";
import {
  DOCK_MOTION,
  markGeometry,
  restingStyle,
  sameMark,
  travelDirection,
  travelKeyframes,
  type DockDir,
  type DockMark,
} from "@/lib/dock-motion";
import type { DockMarkerState } from "@/lib/use-dock-marker";
import { cn } from "@/lib/format";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/*
  The phone's bar, in miniature, inside the walkthrough.

  It is the real thing rather than a picture of it: the cells come from
  `DOCK_TABS`, which is the table the real bar draws itself from, and the
  marker is `DockMarker`, which both real docks draw. So a room that is
  added, renamed or given a different glyph cannot be right in the app and
  wrong on the screen that teaches the app.

  What it does not carry is the router. The real bar's marker is a bet on a
  press that the address settles; here there is no address to settle
  anything, so the press is the whole truth and the marker follows it
  directly. That is why this is its own small hook rather than
  `useDockMarker`, which is four hundred lines of standing a bet down.
*/

/** How long the room's name stays up after a press. The real bar's number. */
const SAY_MS = 900;

function stillMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * The marker, following a press instead of a route.
 *
 * The geometry is written straight onto the pane, exactly as the real hook
 * does it, so the pill's resting `scaleX` is 1 and its round ends stay
 * round while it is still. The travel is played over the top from wherever
 * the pane actually was.
 */
function useMiniMarker(activeId: string): DockMarkerState {
  const ref = useRef<HTMLDivElement>(null);
  const [mark, setMark] = useState<DockMark | null>(null);
  const [dir, setDir] = useState<DockDir>(null);
  const [travels, setTravels] = useState(false);
  const last = useRef<DockMark | null>(null);
  const running = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    const cell = host.querySelector<HTMLElement>("[data-on]");
    const pane = host.querySelector<HTMLElement>(".dock-marker");
    /*
      No layout box, no measuring. A walkthrough screen that is not the one
      on show has cells whose `offsetLeft` and `offsetWidth` are both zero,
      and recording that as the marker's last known place is what makes the
      pill fly in from the far left the next time the screen is shown.
    */
    if (!cell || !pane || cell.getClientRects().length === 0) return;
    const next = markGeometry(cell.offsetLeft, cell.offsetWidth);
    if (sameMark(last.current, next)) return;
    const was = last.current;
    last.current = next;
    setMark(next);
    if (was) setDir(travelDirection(was, next));
    setTravels(Boolean(was));

    Object.assign(pane.style, restingStyle(next));
    if (!was || typeof pane.animate !== "function" || stillMotion()) return;
    running.current?.cancel();
    running.current = pane.animate(
      travelKeyframes(was, next, {
        durationMs: DOCK_MOTION.phone.travelMs,
        lagMs: DOCK_MOTION.phone.lagMs,
      }),
      { duration: DOCK_MOTION.phone.travelMs }
    );
  }, [activeId]);

  return { ref, mark, dir, hover: null, hoverDir: null, hovering: false, travels };
}

export function MiniDock({
  tabs,
  activeId,
  onPress,
  say = true,
  className,
}: {
  tabs: DockTab[];
  activeId: string;
  onPress?: (id: string) => void;
  /** Whether a press raises the room's name above the bar, as the app does. */
  say?: boolean;
  className?: string;
}) {
  const marker = useMiniMarker(activeId);
  const [said, setSaid] = useState<{ label: string; left: number } | null>(null);
  const hush = useRef<ReturnType<typeof setTimeout> | null>(null);

  const speak = useCallback(
    (label: string, cell: HTMLElement) => {
      if (!say) return;
      setSaid({ label, left: cell.offsetLeft + cell.offsetWidth / 2 });
      if (hush.current) clearTimeout(hush.current);
      hush.current = setTimeout(() => setSaid(null), SAY_MS);
    },
    [say]
  );

  useEffect(
    () => () => {
      if (hush.current) clearTimeout(hush.current);
    },
    []
  );

  return (
    <div className={cn("flex justify-center", className)}>
      <div
        ref={marker.ref}
        className="card-sheen glass glass-dock relative flex w-fit items-center gap-1 rounded-full p-1 ring-1 ring-foreground/20"
      >
        {tabs.map(({ id, shortLabel, Icon }) => {
          const on = activeId === id;
          return (
            <button
              key={id}
              type="button"
              data-on={on ? "" : undefined}
              aria-pressed={on}
              aria-label={shortLabel}
              /*
                The real bar speaks on `pointerdown`, before the tap has
                finished, because a name that arrives after the tap it was
                meant to answer is a name nobody needed. Focus is the
                keyboard's press, so it speaks there too.
              */
              onPointerDown={(e) => speak(shortLabel, e.currentTarget)}
              onFocus={(e) => speak(shortLabel, e.currentTarget)}
              onClick={(e) => {
                speak(shortLabel, e.currentTarget);
                onPress?.(id);
              }}
              className={cn(
                "dock-cell relative z-[1] flex size-11 shrink-0 appearance-none items-center justify-center rounded-full",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                on
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="dock-glyph relative flex">
                {/* Which room you are in is a weight, on this bar too. */}
                <Icon className="h-5 w-5" strokeWidth={on ? 2.5 : 1.75} />
              </span>
            </button>
          );
        })}

        <DockMarker state={marker} shape="top-1 h-11" />

        {say && (
          <span
            aria-hidden
            data-said={said ? "" : undefined}
            className="dock-say glass glass-dock pointer-events-none absolute bottom-full mb-2 max-w-[60vw] truncate rounded-full px-3 py-1 text-xs font-medium text-foreground ring-1 ring-foreground/20"
            style={{ left: `${said?.left ?? 0}px` }}
          >
            {said?.label ?? " "}
          </span>
        )}
      </div>
    </div>
  );
}
