"use client";

import {
  ANALYTICS_CONSENT_EVENT,
  loadAnalyticsConsent,
} from "@/lib/analytics-consent";
import { cn } from "@/lib/format";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Says, at the fold, that the page continues.
 *
 * The landing page was built on the idea that a card visibly severed by the
 * bottom of the window is its own scroll affordance, which is true and is
 * the strongest one there is -- right up until the window is taller than
 * the hero. On a large desktop display the whole opening screen, sample
 * card included, lands inside the fold with room to spare, nothing is cut,
 * and the page reads as one screen that has finished. There was nothing
 * else on it saying otherwise.
 *
 * So this is the backstop, and where it sits is the whole point. A chevron
 * used to live *under* the sample card, which is to say below the fold: at
 * the one moment the hint is needed it was off screen, and by the time
 * anybody saw it they had already scrolled and answered the question
 * themselves. This is pinned to the bottom of the window instead, so it is
 * in view exactly when the reader is deciding whether there is anything
 * more, and it is gone the moment they act on it.
 *
 * It is a button rather than an arrow drawn on the page, because a hint
 * that does the thing it hints at costs nothing extra and saves a reach for
 * the wheel. Clicking moves one screenful, or jumps outright when the
 * reader has asked for less motion.
 */

/**
 * How much has to be below the fold before this is worth drawing.
 *
 * A quarter of a small laptop screen. Under that there is nothing down
 * there but the tail of the last thing, and pointing at it is a promise the
 * page does not keep. It also keeps the cookie question's own reserved
 * space from being mistaken for content: in both apps an unanswered consent
 * question pads the bottom of the frame, which is real scroll height with
 * nothing in it.
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
  const [show, setShow] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    const doc = document.scrollingElement ?? document.documentElement;
    const read = () => {
      setShow(
        doc.scrollHeight - doc.clientHeight > RUNWAY &&
          doc.scrollTop <= ANSWERED,
      );
    };

    read();
    window.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read);
    /*
     * The page grows after mount: fonts land, the sign-in card fills in,
     * sections arrive. A measurement taken once would be of a shorter page
     * than the one the reader ends up looking at.
     */
    const ro =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(read);
    ro?.observe(document.body);

    return () => {
      window.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
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
    <>
      {/*
       * A short fade into the field along the bottom edge.
       *
       * On a window shorter than the hero the page already cuts a card in
       * half at the fold, which is the strongest continuation cue there is,
       * and this keeps the pill from reading as a chip dropped on top of a
       * row of figures: content passes *under* the bottom edge rather than
       * stopping at it. `pointer-events-none` is not optional on anything
       * full-width and transparent over content, or it eats every click
       * along the bottom of the page.
       *
       * 5rem, and the landing hero leaves 9rem of the next section showing
       * on a tall window, so the fade never reaches the thing it is
       * pointing at.
       */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-0 z-20 h-20 bg-gradient-to-t from-background via-background/80 to-transparent transition-opacity duration-300",
          show ? "opacity-100" : "opacity-0",
          asking && "max-sm:hidden",
        )}
      />
      <button
        type="button"
        onClick={jump}
        aria-hidden={!show}
        tabIndex={show ? 0 : -1}
        /*
         * Height off the bottom is `.bottom-notice`, the same rule the cookie
         * question and the offline chip take, so on any page that has a dock
         * this clears it instead of guessing at a number.
         *
         * Below `sm` the cookie question is a full-width strip on this exact
         * line, and two things cannot have it. It is the louder of the two
         * and it is asking a question, so this stands down until it has been
         * answered. On `sm` and up that question is a card in the right-hand
         * corner and this is centred, so they never meet.
         */
        className={cn(
          "bottom-notice card-sheen glass-overlay fixed left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full py-2 pr-3 pl-4 text-sm text-muted-foreground ring-1 ring-foreground/20 transition-opacity duration-300 hover:text-foreground",
          show ? "opacity-100" : "pointer-events-none opacity-0",
          asking && "max-sm:hidden",
          className,
        )}
      >
        {label}
        <ChevronDown className="scroll-cue-nudge size-4" aria-hidden />
      </button>
    </>
  );
}
