"use client";

import { useId } from "react";
import { cn } from "@/lib/format";
import { PRODUCT_NAME } from "@/lib/product";
import {
  LIGHT,
  MARK_FACETS,
  MARK_VIEWBOX,
  TONES,
  TONE_KEYS,
  facetPoints,
  facetScale,
  facetTransform,
} from "@/lib/brand/mark";

type Props = {
  className?: string;
  /** `mark` = A only; `wordmark` = inline lockup; `icon` = large inline; `stack` = splash */
  variant?: "mark" | "wordmark" | "icon" | "stack";
  title?: string;
  /** Keep UPSIDE LAB visible on narrow screens (mobile app bar). */
  alwaysType?: boolean;
};

/** Canonical header chrome size — keep every app bar on the same lockup. */
export const UPSIDE_HEADER_WORDMARK_CLASS =
  "text-[14px] leading-none text-foreground";

/**
 * Ten-facet gold A, inline vector.
 *
 * This was a 260 KB, 878x713 PNG rendered at roughly 14 px in the app bar
 * of every page. On a throttled cold load it took 4.3 s to arrive and was
 * the single biggest contributor to a 4.75 s LCP against a 2.5 s budget —
 * a quarter-megabyte download to draw ten triangles a centimetre wide.
 *
 * Inline SVG rather than `next/image` on purpose: the mark is flat
 * geometry, so this is about 2 KB, needs no network request at all (which
 * is what actually removes it from the LCP path), stays sharp at any size,
 * and cannot pop in after the text around it.
 *
 * The geometry lives in `src/lib/brand/mark.ts`, because the favicon, the
 * BIMI mark, the app icons, the email lockup and the OG card draw the same
 * ten facets through different renderers and a second copy would drift.
 */
function UpsideMark({
  className,
  drawnAt,
}: {
  className?: string;
  /*
    Roughly how many pixels wide this instance lands at. It decides how hard
    the hairlines between the facets are cut: they are about two and a half
    percent of the drawing's width, which is a crisp cut at splash size and
    three quarters of a pixel in the app bar. See `facetScale`.
  */
  drawnAt: number;
}) {
  /*
   * Unique gradient ids per instance, and this is load-bearing rather than
   * tidiness.
   *
   * The lockup renders more than once per page -- the mobile top bar and
   * the desktop header both mount, with one hidden by a breakpoint. Both
   * emitted `upside-mark-g0..9`, so `url(#upside-mark-g0)` resolved to the
   * FIRST match in document order, which is the copy inside the hidden
   * header. A paint server in a `display:none` subtree does not paint, so
   * the visible mark filled with nothing: it held its 24x20 box and drew
   * absolutely nothing, which is exactly what "the logo is missing" looks
   * like.
   *
   * `useId` is stable across server and client render, so this does not
   * cause a hydration mismatch. The punctuation React puts in the value is
   * legal in an id but awkward in a URL fragment, so it is stripped.
   *
   * `scripts/test-invariants.ts` fails if any paint server in `src/` takes
   * a literal id.
   */
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const scale = facetScale(drawnAt);
  return (
    <svg
      /*
       * Tight to the artwork, which spans x 11.63..116.38 and
       * y 20.27..104.64 -- 104.75 x 84.37, an aspect of 1.2416.
       *
       * This was `0 0 128 128` with the polygons pushed into it by a
       * `translate(14 18) scale(0.78)`, which left roughly a third of the
       * box as empty padding. Harmless at splash size and ruinous in the
       * app bar: inside a 1.4em square the mark drew about 12 px and read
       * as missing.
       */
      viewBox={MARK_VIEWBOX}
      aria-hidden
      focusable="false"
      className={cn("block shrink-0", className)}
    >
      <defs>
        {TONE_KEYS.map((key) => (
          <linearGradient
            key={key}
            id={`upside-mark-${uid}-${key}`}
            x1={LIGHT.x1}
            y1={LIGHT.y1}
            x2={LIGHT.x2}
            y2={LIGHT.y2}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor={TONES[key].from} />
            <stop offset="1" stopColor={TONES[key].to} />
          </linearGradient>
        ))}
      </defs>
      {/*
        No wrapping transform: the polygon coordinates and the gradients'
        userSpaceOnUse coordinates are in the same space, so the viewBox
        keeps describing the artwork. The only transform is per facet, and
        it swells each one about its own centroid so the hairlines close as
        the drawing shrinks.
      */}
      {MARK_FACETS.map((facet, i) => (
        <polygon
          key={i}
          points={facetPoints(facet)}
          fill={`url(#upside-mark-${uid}-${facet.tone})`}
          transform={scale === 1 ? undefined : facetTransform(facet, scale)}
        />
      ))}
    </svg>
  );
}

/*
  Every place the mark is drawn: the box it gets, and roughly how wide that
  lands in pixels.

  The classes are literal because Tailwind only emits arbitrary values it can
  read as literal strings at build time, and the pair has to hold the mark's
  own 1.2416 aspect or the browser letterboxes it inside its box and the mark
  silently loses height it could have had.
  `src/lib/brand/mark-lockup.test.ts` fails if one drifts.
*/
const MARK_SIZE = {
  /** Splash. */
  stack: { classes: "h-[10.5rem] w-[13rem]", drawnAt: 208 },
  /** Large inline lockup, at the 1.75rem the `icon` variant sets. */
  icon: { classes: "h-[1.35em] w-[1.68em]", drawnAt: 47 },
  /** App bar, at the canonical 14px chrome size. */
  wordmark: { classes: "h-[1.4em] w-[1.74em]", drawnAt: 24 },
} as const;

/**
 * Side-by-side lockup: the A is a triangle in a square viewBox, so its
 * mass sits low. A small lift lines it up with the caps. Too much and
 * the peak sits above UPSIDE.
 */
const LOCKUP_MARK_NUDGE = "-translate-y-[0.1em]";

/** Lockup type: UPSIDE bold, LAB regular. Same Geist as the rest of the UI. */
function LogoType({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-logo uppercase leading-none tracking-wide text-foreground",
        className
      )}
    >
      <span className="font-bold">Upside</span>
      <span className="font-normal"> Lab</span>
    </span>
  );
}

export function UpsideLogo({
  className,
  variant = "wordmark",
  title = PRODUCT_NAME,
  alwaysType = false,
}: Props) {
  if (variant === "mark") {
    return (
      <span className={cn("inline-flex", className)} role="img" aria-label={title}>
        {/* The caller sizes this one, so take the app bar's cut as the floor. */}
        <UpsideMark className="h-full w-full" drawnAt={40} />
      </span>
    );
  }

  if (variant === "stack") {
    return (
      <span
        className={cn("inline-flex flex-col items-center", className)}
        role="img"
        aria-label={title}
      >
        <UpsideMark
          className={MARK_SIZE.stack.classes}
          drawnAt={MARK_SIZE.stack.drawnAt}
        />
        <span className="mt-10 font-logo text-[2.75rem] font-bold uppercase leading-none tracking-wide text-foreground">
          Upside
        </span>
        <span className="mt-4 font-logo text-[2.05rem] font-normal uppercase leading-none tracking-wide text-foreground">
          Lab
        </span>
      </span>
    );
  }

  if (variant === "icon") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-3.5 text-[1.75rem] leading-none",
          className
        )}
        role="img"
        aria-label={title}
      >
        <UpsideMark
          className={cn(MARK_SIZE.icon.classes, LOCKUP_MARK_NUDGE)}
          drawnAt={MARK_SIZE.icon.drawnAt}
        />
        <LogoType />
      </span>
    );
  }

  return (
    <span
      className={cn("inline-flex items-center gap-2.5 leading-none", className)}
      role="img"
      aria-label={title}
    >
      <UpsideMark
        className={cn(MARK_SIZE.wordmark.classes, LOCKUP_MARK_NUDGE)}
        drawnAt={MARK_SIZE.wordmark.drawnAt}
      />
      <LogoType
        className={alwaysType ? "max-[22.5rem]:hidden" : "hidden xs:inline"}
      />
    </span>
  );
}

export { MARK_SIZE };
