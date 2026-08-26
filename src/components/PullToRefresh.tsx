"use client";

import { useCallback, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestWorkspaceRefresh } from "@/lib/workspace-rooms";
import {
  PULL_ARC_MS,
  PULL_MAX_WAIT_MS,
  PULL_MIN_VISIBLE_MS,
  PULL_RING_CIRCUMFERENCE,
  PULL_RING_PX,
  PULL_RING_RADIUS,
  PULL_SETTLE_MS,
  PULL_SLOP,
  PULL_SPIN_ARC,
  PULL_TRIGGER,
  pullArmed,
  pullDashOffset,
  pullIntent,
  pullOpacity,
  pullProgress,
  pullScale,
  pullTravel,
} from "@/lib/pull-to-refresh";

/*
  Pull the page down to ask for new numbers.

  WHY THIS IS WRITTEN BY HAND RATHER THAN LEFT TO THE BROWSER. The browser has
  a pull to refresh of its own and this app switched it off, in globals.css,
  on purpose: `overscroll-behavior-y: none` is what stops a rubber band
  dragging the sticky header away from the top of the window and slicing the
  dock in half at the other end. That property is the same switch for both
  things, so there is no setting that returns the gesture and keeps the
  header still. The bounce had to go, and this is the bounce put back under
  our own control, moving the one element that should move.

  AND WHY THE GESTURE IS WORTH HAVING HERE, WHERE THE PRICES ALREADY MOVE ON
  THEIR OWN. They do: quotes poll every 45 seconds while the market is open,
  every two minutes when it is shut, and immediately whenever the app comes
  back to the front, so this is almost never about numbers a reader does not
  already have. What they did not have was any way to ask. The app runs
  standalone, so there is no address bar and therefore no reload button
  anywhere in it, and the status strip says "Prices, 12s ago" to somebody who
  could do nothing whatever about it if the answer had been an hour. A
  reading you can ask to be re-taken is a reading you can trust; one that
  only ever tells you is a reading you have to take on faith. The pull is
  what turns the strip from a notice into an answer.

  IT COSTS NOTHING WHEN NOBODY IS PULLING. There is one passive `touchstart`
  listener on the document, and it is only attached on a device that has a
  coarse pointer at all. `touchmove` is attached when a touch begins in a
  place a pull could start from and removed when it ends, so most of the time
  the document has no move listener on it whatsoever. Nothing here ever calls
  `preventDefault`, which is what lets every listener be passive: at the top
  of a page whose overscroll is already `none`, a downward drag scrolls
  nothing, so there is nothing to prevent.

  AND IT COSTS ALMOST NOTHING WHILE SOMEBODY IS. Moves are coalesced into one
  `requestAnimationFrame` write per frame. That write sets a `transform` and
  an `opacity`, which the compositor handles without laying anything out or
  painting it, plus one dash offset on a 22px circle. There is not a single
  React render between the finger going down and the work starting.

  Upside Arena has the same component, the same curve and the same ring. The
  two apps are one design, so fix both or neither.
*/

const PASSIVE = { passive: true } as const;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function reducedMotion(): boolean {
  return Boolean(
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/*
  Something else owns the scroll, so this must not.

  A dialog, a sheet or the walkthrough locks the body while it is open, and
  the two libraries that do it here leave a mark: `react-remove-scroll` sets
  `data-scroll-locked` and counts, and a drawer pins the body in place. Read
  the marks rather than the computed style, because this runs on the first
  frame of every touch and `getComputedStyle` is a layout read.
*/
function someoneElseOwnsTheScroll(): boolean {
  const body = document.body;
  return (
    body.hasAttribute("data-scroll-locked") ||
    body.style.overflow === "hidden" ||
    body.style.position === "fixed"
  );
}

type Mode = "idle" | "wait" | "pull" | "busy" | "settle";

type Gesture = {
  mode: Mode;
  page: HTMLElement | null;
  startX: number;
  startY: number;
  raw: number;
  armed: boolean;
  frame: number;
  timer: number;
  /* The component has gone. Nothing may schedule anything after this. */
  gone: boolean;
};

function PullSurface({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const arcRef = useRef<SVGCircleElement | null>(null);
  const ringRef = useRef<SVGSVGElement | null>(null);
  const liveRef = useRef<HTMLSpanElement | null>(null);
  const refreshRef = useRef(onRefresh);

  /*
    Held in a ref so the gesture effect never has to be torn down and rebuilt
    when the callback identity changes. Re-running it would drop the document
    listener for a frame, which is the one frame somebody's thumb is in.
  */
  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!window.matchMedia?.("(any-pointer: coarse)").matches) return;

    const g: Gesture = {
      mode: "idle",
      page: null,
      startX: 0,
      startY: 0,
      raw: 0,
      armed: false,
      frame: 0,
      timer: 0,
      gone: false,
    };

    const say = (text: string) => {
      const live = liveRef.current;
      if (live) live.textContent = text;
    };

    /* One write per frame, all of it transform and opacity. */
    const draw = (travel: number) => {
      const progress = pullProgress(travel);
      if (g.page) {
        g.page.style.transform = `translate3d(0,${travel.toFixed(2)}px,0)`;
      }
      const wrap = wrapRef.current;
      if (wrap) {
        wrap.style.transform =
          `translate3d(0,${(travel / 2).toFixed(2)}px,0)` +
          ` scale(${pullScale(progress).toFixed(3)})`;
        wrap.style.opacity = pullOpacity(progress).toFixed(3);
      }
      const arc = arcRef.current;
      if (arc) {
        arc.style.strokeDashoffset = pullDashOffset(progress).toFixed(2);
      }
    };

    const paint = () => {
      g.frame = 0;
      const travel = pullTravel(g.raw);
      draw(travel);
      const armed = pullArmed(travel);
      if (armed === g.armed) return;
      g.armed = armed;
      /*
        The tick at the threshold, where a phone has one to give. Android
        does; iOS has no vibration API at all and simply gets nothing, which
        is what it gets today.
      */
      if (armed) {
        try {
          navigator.vibrate?.(8);
        } catch {
          /* a phone that would rather not */
        }
      }
    };

    /*
      Hand the page and the ring to the compositor for a settle, then take the
      transform back off so neither is left promoted to a layer of its own for
      the rest of the session.
    */
    const glide = (travel: number, fade: boolean, then?: () => void) => {
      const ms = reducedMotion() ? 0 : PULL_SETTLE_MS;
      const ease = `${ms}ms cubic-bezier(0.22,0.9,0.24,1)`;
      if (g.page) {
        g.page.style.transition = `transform ${ease}`;
        g.page.style.transform = `translate3d(0,${travel}px,0)`;
      }
      const wrap = wrapRef.current;
      if (wrap) {
        wrap.style.transition = `transform ${ease}, opacity ${ease}`;
        const progress = pullProgress(travel);
        wrap.style.transform =
          `translate3d(0,${travel / 2}px,0)` +
          ` scale(${fade ? 0.86 : pullScale(progress).toFixed(3)})`;
        wrap.style.opacity = fade ? "0" : pullOpacity(progress).toFixed(3);
      }
      window.clearTimeout(g.timer);
      if (g.gone) return;
      g.timer = window.setTimeout(() => then?.(), ms);
    };

    /* Everything back to how it was found. */
    const rest = () => {
      if (g.page) {
        g.page.style.transition = "";
        g.page.style.transform = "";
        g.page.style.willChange = "";
        g.page = null;
      }
      const wrap = wrapRef.current;
      if (wrap) {
        wrap.style.transition = "";
        wrap.style.willChange = "";
        wrap.removeAttribute("data-pulling");
      }
      const ring = ringRef.current;
      if (ring) ring.removeAttribute("data-working");
      const arc = arcRef.current;
      if (arc) {
        arc.style.transition = "";
        arc.style.strokeDashoffset = String(PULL_RING_CIRCUMFERENCE);
      }
      g.mode = "idle";
      g.armed = false;
      say("");
    };

    /*
      The retract owns the page until it is finished. A touch landing inside
      it is ignored rather than allowed to start a second pull, because the
      alternative is a drag that begins with a 420ms transition still running
      on the element it is dragging, which reads as the page having gone
      heavy.
    */
    const retract = () => {
      /*
        A pull that never really moved does not get a settle. Otherwise a 7px
        drag that came straight back would hold the gesture shut for 420ms and
        the next real pull would be the one that appears to do nothing.
      */
      if (g.mode !== "busy" && pullTravel(g.raw) < 0.5) {
        rest();
        return;
      }
      g.mode = "settle";
      glide(0, true, rest);
    };

    const run = async () => {
      g.mode = "busy";
      const ring = ringRef.current;
      const arc = arcRef.current;
      /*
        The ring stops being a measure of the pull and becomes a measure of
        the wait: a quarter of a circle, turning. Somebody who has asked for
        less motion gets the whole circle instead, held still, because the
        turn is the one part of this that is animation rather than an answer
        to their own finger.
      */
      if (arc) {
        /*
          The one place a dash offset is animated rather than written per
          frame. Snapping a full circle to a quarter of one on the frame the
          finger lifts is the only hard cut this gesture would have in it, and
          a ring unwinding into a spinner is what the change actually is.
        */
        arc.style.transition = `stroke-dashoffset ${PULL_ARC_MS}ms cubic-bezier(0.4,0,0.2,1)`;
        arc.style.strokeDashoffset = reducedMotion()
          ? "0"
          : String(PULL_RING_CIRCUMFERENCE * (1 - PULL_SPIN_ARC));
      }
      if (ring && !reducedMotion()) ring.setAttribute("data-working", "");
      glide(PULL_TRIGGER, false);
      say("Refreshing");

      const started = performance.now();
      try {
        /*
          The ceiling can win the race, and the work it beat carries on with
          nobody watching it, so the rejection is taken here rather than left
          to surface as an unhandled one long after the ring has gone.
        */
        const work = refreshRef.current().catch(() => undefined);
        await Promise.race([work, wait(PULL_MAX_WAIT_MS)]);
      } catch {
        /*
          A failed refresh is the room's news to break, not the ring's. It
          retracts either way, and whatever the room already says about not
          being able to reach anything is still what it says.
        */
      }
      const seen = performance.now() - started;
      if (seen < PULL_MIN_VISIBLE_MS) await wait(PULL_MIN_VISIBLE_MS - seen);
      /*
        It closes before it goes. The ring completing is the only moment in
        this gesture that says the answer arrived rather than that it was
        asked for, and it costs one transition already on the element.
      */
      if (ring) ring.removeAttribute("data-working");
      if (arc) arc.style.strokeDashoffset = "0";
      say("Up to date");
      retract();
    };

    const detach = () => {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onCancel);
    };

    function onMove(e: TouchEvent) {
      if (g.mode !== "wait" && g.mode !== "pull") return;
      /* A second finger means a pinch, and a pinch is not a pull. */
      if (e.touches.length !== 1) {
        onCancel();
        return;
      }
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - g.startX;
      const dy = touch.clientY - g.startY;

      if (g.mode === "wait") {
        const intent = pullIntent(dx, dy);
        if (intent === "wait") return;
        if (intent === "scroll") {
          detach();
          g.mode = "idle";
          g.page = null;
          return;
        }
        g.mode = "pull";
        if (g.page) {
          /* Never drag an element that still has a transition on it. */
          g.page.style.transition = "";
          g.page.style.willChange = "transform";
        }
        const wrap = wrapRef.current;
        if (wrap) {
          wrap.style.transition = "";
          wrap.style.willChange = "transform, opacity";
          wrap.setAttribute("data-pulling", "");
        }
      }

      /* Less the slop, so the page does not jump on the frame it commits. */
      g.raw = dy - PULL_SLOP;
      if (!g.frame) g.frame = requestAnimationFrame(paint);
    }

    function onEnd() {
      detach();
      if (g.mode !== "pull") {
        g.mode = "idle";
        g.page = null;
        return;
      }
      if (g.frame) {
        cancelAnimationFrame(g.frame);
        g.frame = 0;
      }
      if (g.armed) void run();
      else retract();
    }

    function onCancel() {
      detach();
      if (g.frame) {
        cancelAnimationFrame(g.frame);
        g.frame = 0;
      }
      if (g.mode === "pull") retract();
      else {
        g.mode = "idle";
        g.page = null;
      }
    }

    const onStart = (e: TouchEvent) => {
      if (g.mode === "busy" || g.mode === "settle") return;
      if (e.touches.length !== 1) return;
      if (window.scrollY > 0.5) return;
      if (someoneElseOwnsTheScroll()) return;

      const touch = e.touches[0];
      const target = touch?.target;
      if (!(target instanceof Element)) return;

      /*
        The page is the room's own `<main>`, found from the touch rather than
        from the route, and here that is not a nicety. `WorkspaceShell` keeps
        every room this session has visited mounted and hidden, so there is
        more than one `<main>` in this document at almost any moment and the
        route would not tell you which of them the finger is in. The touch
        does, by definition.

        It also settles what happens on the chrome: a pull that starts on the
        top bar or the status strip is not a pull, which is the same answer a
        native list gives.
      */
      const page = target.closest("main");
      if (!(page instanceof HTMLElement)) return;

      /*
        A scroller inside the page that is part way down owns this drag. One
        already at its own top does not, because a downward drag there moves
        nothing, so the pull is free to have it.
      */
      for (let el: Element | null = target; el && el !== page; el = el.parentElement) {
        if (el.scrollTop > 0) return;
      }

      window.clearTimeout(g.timer);
      g.mode = "wait";
      g.page = page;
      g.startX = touch.clientX;
      g.startY = touch.clientY;
      g.raw = 0;
      g.armed = false;

      window.addEventListener("touchmove", onMove, PASSIVE);
      window.addEventListener("touchend", onEnd, PASSIVE);
      window.addEventListener("touchcancel", onCancel, PASSIVE);
    };

    document.addEventListener("touchstart", onStart, PASSIVE);
    return () => {
      document.removeEventListener("touchstart", onStart);
      g.gone = true;
      detach();
      window.clearTimeout(g.timer);
      if (g.frame) cancelAnimationFrame(g.frame);
      rest();
    };
  }, []);

  return (
    <div className="ptr" ref={wrapRef}>
      <svg
        ref={ringRef}
        className="ptr-ring"
        aria-hidden="true"
        width={PULL_RING_PX}
        height={PULL_RING_PX}
        viewBox={`0 0 ${PULL_RING_PX} ${PULL_RING_PX}`}
        fill="none"
      >
        <circle
          cx={PULL_RING_PX / 2}
          cy={PULL_RING_PX / 2}
          r={PULL_RING_RADIUS}
          stroke="var(--border)"
          strokeWidth="2"
        />
        <circle
          ref={arcRef}
          className="ptr-arc"
          cx={PULL_RING_PX / 2}
          cy={PULL_RING_PX / 2}
          r={PULL_RING_RADIUS}
          stroke="var(--primary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={PULL_RING_CIRCUMFERENCE}
          strokeDashoffset={PULL_RING_CIRCUMFERENCE}
        />
      </svg>
      <span ref={liveRef} className="sr-only" role="status" aria-live="polite" />
    </div>
  );
}

/*
  What a pull actually asks for here: the room the finger is in, and nothing
  else.

  Every room this shell has visited is still mounted behind a `hidden`
  attribute, so asking all of them would put four or five rooms' worth of
  fetches on the wire at once against providers this app is deliberately on
  the free tier of. `requestWorkspaceRefresh` asks only the room on screen and
  hands back what it is doing, so the ring stops when the work does.

  A room with nothing to refetch, Account and Admin, answers `handled: false`
  and the router is asked for the page again instead. That matters more than
  it sounds: a gesture that draws a ring and quietly does nothing is worse
  than one that is not there, because the reader now believes they have
  checked.
*/
export function PullToRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const settleRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (pending) return;
    const settle = settleRef.current;
    settleRef.current = null;
    settle?.();
  }, [pending]);

  const refresh = useCallback(async () => {
    const { handled } = await requestWorkspaceRefresh();
    if (handled) return;
    await new Promise<void>((resolve) => {
      settleRef.current = resolve;
      startTransition(() => router.refresh());
    });
  }, [router]);

  return <PullSurface onRefresh={refresh} />;
}
