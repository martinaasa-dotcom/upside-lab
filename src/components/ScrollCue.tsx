"use client";

import {
  ANALYTICS_CONSENT_EVENT,
  loadAnalyticsConsent,
} from "@/lib/analytics-consent";
import { cn } from "@/lib/format";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/*
 * Says the page continues, and only when the page is not already saying it.
 *
 * This used to be a glass pill fixed to the bottom of the window, drawn
 * whenever the document was taller than the screen. Two things were wrong
 * with it, and they turn out to be the same thing.
 *
 * IT WAS CHROME LAID OVER THE PAGE RATHER THAN PART OF IT. A chip pinned to
 * the window is the one element on a landing page that does not belong to
 * the composition it is sitting on, and it reads that way: it hovers over
 * the sample card, it is the only thing on the screen with a rim around it,
 * and it stays exactly where it is while everything it points at moves.
 *
 * AND IT WAS THE REASON THE PAGE FILLED IN AS YOU SCROLLED IT. The pill was
 * `glass-overlay`, which is a `backdrop-filter`, and a backdrop-filter fixed
 * over content that is moving has to re-filter what is behind it every
 * single frame. Measured on Upside Arena's copy of this page, which is the
 * same page with the same pill, on a 412x915 screen at ten times CPU
 * throttling: scrolling presented 42 frames the compositor had to repaint,
 * and in the worst of them 38% of the bottom eighth of the screen had not
 * caught up with where the page actually was. Hiding this one element and
 * changing nothing else took that to 9 frames, every one pixel-identical to
 * the settled page. The bottom band of the window is exactly where new
 * content arrives while you scroll, which is why what a reader saw was the
 * lower half of the sample card appearing late.
 *
 * So the cue is in the page now. It is laid out inside the hero, pinned to
 * the bottom of the FIRST screen in the page's own coordinates, and it
 * scrolls away with everything around it. It is a line of the page's own
 * type: no fill, no rim, no glass, and above all NO `backdrop-filter` and NO
 * `position: fixed`, because that pair over a scrolling page is the whole of
 * the fault above. `src/lib/scroll-cue.test.ts` holds it to that.
 *
 * It is still a button rather than an arrow drawn on the page, because a
 * hint that does the thing it hints at costs nothing extra.
 *
 * Same component, same words and same rules as Upside Arena's. The two apps
 * are one design, so fix both or neither.
 */

/*
 * WHEN IT IS DRAWN AT ALL, WHICH IS THE POINT OF IT.
 *
 * The page has three ways of ending a first screen and only one of them
 * needs words. Measured on the real page rather than assumed, every time the
 * window changes size:
 *
 * 1. THE SAMPLE CARD IS CUT BY THE FOLD. Content visibly severed by the
 *    bottom of the window is the strongest continuation cue there is, and on
 *    every phone and most laptops that is what happens: measured on Arena's
 *    copy of this page at 412x915 the card runs 136px past the bottom edge,
 *    and at 390x844 it runs 237px past. Nothing is drawn. This is the case
 *    the old pill got wrong on every phone anybody owns, where it sat over a
 *    card that was already shouting.
 *
 * 2. THE NEXT SECTION HAS REACHED THE SCREEN. On a tall display the hero's
 *    own height floor leaves 96px of the following section's heading
 *    showing, so the reader is already looking at the page continuing.
 *    Nothing is drawn, and any amount of it counts: a heading the fold cuts
 *    says the same thing the sample card does, and a line of type laid over
 *    a heading arriving at the bottom of the screen would be worse than no
 *    line at all.
 *
 * 3. THE FIRST SCREEN ENDS CLEAN. The card clears the fold whole and nothing
 *    after it has started. There is no cut, no peek, and nothing on the
 *    screen saying the page goes on. That is the one case worth a word, and
 *    it is roughly a maximised browser window on a 1080p display.
 *
 * There is a band either side of that, where the card ends within a cue's
 * height of the fold, in which neither the cut nor the words are available:
 * there is genuinely nowhere to put a line of type that is not on top of the
 * card. A card whose bottom edge lands that close to the bottom of the
 * screen is doing most of the work on its own, and the honest answer is to
 * say nothing rather than to crowd it.
 */

/** The card the fold is meant to cut. Marked on the landing page itself. */
const STILL = "[data-scroll-cue-still]";

/**
 * How much has to be below the fold before this is worth drawing.
 *
 * A quarter of a small laptop screen. Under that there is nothing down
 * there but the tail of the last thing, and pointing at it is a promise the
 * page does not keep. It also keeps the cookie question's own reserved space
 * from being mistaken for content: an unanswered one pads the bottom of the
 * frame, which is real scroll height with nothing in it.
 */
const RUNWAY = 240;

/** Scrolled at all, so they have found out for themselves. */
const ANSWERED = 24;

export function ScrollCue({
  label = "More below",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const band = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    const slot = band.current;
    if (!slot) return;

    const read = () => {
      const doc = document.scrollingElement ?? document.documentElement;
      const vh = window.innerHeight;

      // Nowhere to go, or they have already gone.
      if (doc.scrollHeight - doc.clientHeight <= RUNWAY) return setShow(false);
      if (doc.scrollTop > ANSWERED) return setShow(false);

      /*
       * Where this actually landed. The slot is positioned in CSS against
       * the top of the document, which is where the hero starts, so reading
       * its own rect back is what makes the whole thing fail safe: if it
       * ever ends up somewhere other than the bottom of the first screen,
       * nothing is drawn rather than something being drawn in the wrong
       * place.
       */
      const rect = slot.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > vh + 1) return setShow(false);

      // Case 1: the fold is already cutting the card, or is about to.
      const still = document.querySelector(STILL);
      if (still && still.getBoundingClientRect().bottom > rect.top) {
        return setShow(false);
      }

      /*
       * Case 2: the section after the hero has reached the screen. Measured
       * from the section's content rather than from its box, because the
       * first 48px of a section is its own top padding and an empty band is
       * not a beginning. Any of that content on screen and the page is
       * already saying it: a heading in full says the page continues, and a
       * heading the fold cuts says it the way the sample card does.
       *
       * It is also what keeps this band empty. The cue draws in the last
       * 3.5rem of the first screen, so a heading arriving anywhere in that
       * strip would have words laid over it.
       */
      const next =
        slot.closest("section")?.nextElementSibling?.firstElementChild;
      if (next && next.getBoundingClientRect().top < vh) return setShow(false);

      setShow(true);
    };

    /*
     * Read now, and again every time the page could have moved under it.
     *
     * This decides on a few pixels of clearance, so a single measurement
     * taken at hydration is a measurement of a page that is not finished:
     * fonts land afterwards and shift every line on the screen, the sign-in
     * button fills in where a space was, and any of that can move the sample
     * card across the line this is testing. Measured here at 1440x960 the
     * card sat 11px clear of the band, which is well inside what a font swap
     * moves, and the cue stayed hidden on a window that wanted it.
     *
     * So: the resize the reader causes, the scroll that answers the
     * question, the body growing for any reason at all, the fonts arriving,
     * and load. Reading is a handful of rects and no writes, so re-running
     * it costs nothing worth counting.
     */
    read();
    window.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read);
    window.addEventListener("load", read);
    document.fonts?.ready.then(read).catch(() => {});

    const ro =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(read);
    ro?.observe(document.body);

    return () => {
      window.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
      window.removeEventListener("load", read);
      ro?.disconnect();
    };
  }, []);

  useEffect(() => {
    const sync = () => setAsking(loadAnalyticsConsent() == null);
    sync();
    window.addEventListener(ANALYTICS_CONSENT_EVENT, sync);
    return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, sync);
  }, []);

  function jump() {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollBy({
      top: Math.round(window.innerHeight * 0.86),
      behavior: still ? "auto" : "smooth",
    });
  }

  return (
    <div
      ref={band}
      className={cn(
        /*
         * The bottom of the first screen, in the page's coordinates.
         *
         * The hero is the first thing in the document and starts at y=0, so
         * `100svh` from the top of it is the fold. `svh` rather than `dvh`,
         * so a phone that later retracts its address bar does not find this
         * somewhere else. Absolute, so it costs no layout and cannot change
         * any of the measurements above by appearing.
         *
         * `pointer-events-none` is not optional on anything full-width and
         * transparent over content, or it eats every click along that line.
         */
        "pointer-events-none absolute inset-x-0 top-[calc(100svh-3.5rem)] flex h-14 items-center justify-center px-6",
        className,
      )}
    >
      <button
        type="button"
        onClick={jump}
        aria-hidden={!show}
        tabIndex={show ? 0 : -1}
        className={cn(
          "pointer-events-auto flex items-center gap-2 rounded-md text-sm text-muted-foreground transition-opacity duration-300 hover:text-foreground focus-visible:text-foreground",
          show ? "opacity-100" : "invisible opacity-0",
          /*
           * Below `sm` the cookie question is a full-width strip across the
           * bottom of the window, on top of this line. It is the louder of
           * the two and it is asking something, so this stands down until it
           * has been answered. From `sm` up that question is a card in the
           * right-hand corner and this is centred, so they never meet.
           */
          asking && "max-sm:hidden",
        )}
      >
        {label}
        <ChevronDown className="scroll-cue-nudge size-4" aria-hidden />
      </button>
    </div>
  );
}
