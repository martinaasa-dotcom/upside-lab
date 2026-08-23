"use client";

import { useId } from "react";
import { cn } from "@/lib/format";
import { PRODUCT_NAME } from "@/lib/product";
import {
  CROSSBAR,
  MARK_GRADIENT,
  MARK_VIEWBOX,
  letterPath,
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
 * The gold "A", inline vector.
 *
 * One solid letter on one warm ramp. It was ten bevelled facets until
 * 2026-08-23, which had two problems: the mosaic was a decade-old idiom
 * nobody ships any more, and at 32px the hairlines between the facets were a
 * pixel of mud, so the favicon read as a smudge rather than as a letter. The
 * account of what replaced it, and why, is in docs/BRAND_MARK.md.
 *
 * Inline SVG rather than `next/image` on purpose, and that part has not
 * changed: this was a 260 KB, 878x713 PNG rendered at roughly 14 px in the
 * app bar of every page, which took 4.3 s to arrive on a throttled cold load
 * and was the single biggest contributor to a 4.75 s LCP against a 2.5 s
 * budget. Inline, it is flat geometry, needs no network request at all (which
 * is what actually removes it from the LCP path), stays sharp at any size,
 * and cannot pop in after the text around it.
 *
 * The geometry lives in `src/lib/brand/mark.ts`, because the favicon, the
 * BIMI mark, the app icons and the email lockup all draw the same letter
 * through different renderers, and a second copy would drift.
 */
function UpsideMark({ className }: { className?: string }) {
  /*
   * Unique gradient id per instance, and this is load-bearing rather than
   * tidiness.
   *
   * The lockup renders more than once per page -- the mobile top bar and the
   * desktop header both mount, with one hidden by a breakpoint. Both used to
   * emit `upside-mark-g0..9`, so `url(#upside-mark-g0)` resolved to the FIRST
   * match in document order, which is the copy inside the hidden header. A
   * paint server in a `display:none` subtree does not paint, so the visible
   * mark filled with nothing: it held its box and drew absolutely nothing,
   * which is exactly what "the logo is missing" looks like.
   *
   * `useId` is stable across server and client render, so this does not cause
   * a hydration mismatch. The punctuation React puts in the value is legal in
   * an id but awkward in a URL fragment, so it is stripped.
   *
   * `scripts/test-invariants.ts` fails if any paint server in `src/` takes a
   * literal id.
   */
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const fill = `upside-mark-${uid}-${MARK_GRADIENT.id}`;
  return (
    <svg
      /*
       * Tight to the letter, so the mark fills whatever box it is given.
       * The predecessor was `0 0 128 128` with the drawing pushed into it by
       * a transform, which left roughly a third of the box as empty padding:
       * harmless at splash size and ruinous in the app bar, where inside a
       * 1.4em square the mark drew about 12px and read as missing.
       */
      viewBox={MARK_VIEWBOX}
      aria-hidden
      focusable="false"
      className={cn("block shrink-0", className)}
    >
      <defs>
        <linearGradient
          id={`upside-mark-${uid}-${MARK_GRADIENT.id}`}
          x1={MARK_GRADIENT.x1}
          y1={MARK_GRADIENT.y1}
          x2={MARK_GRADIENT.x2}
          y2={MARK_GRADIENT.y2}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor={MARK_GRADIENT.from} />
          <stop offset="1" stopColor={MARK_GRADIENT.to} />
        </linearGradient>
      </defs>
      <path d={letterPath()} fill={`url(#${fill})`} />
      <rect
        x={CROSSBAR.x}
        y={CROSSBAR.y}
        width={CROSSBAR.width}
        height={CROSSBAR.height}
        fill={`url(#${fill})`}
      />
    </svg>
  );
}

/*
  Every place the mark is drawn, as a height and the width its own geometry
  asks for. The letter is 48 by 54.5, so width is height x 0.881.

  Spelled out rather than computed because Tailwind only sees literal class
  strings, and an arbitrary value it cannot read at build time is a class it
  never emits. `src/lib/brand/mark-lockup.test.ts` fails if one of these
  drifts from the geometry, which is the guard the literal gives up.
*/
const MARK_SIZE = {
  /** Splash. */
  stack: "h-[10.5rem] w-[9.25rem]",
  /** Large inline lockup. */
  icon: "h-[1.35em] w-[1.19em]",
  /** App bar and everywhere else. */
  wordmark: "h-[1.4em] w-[1.23em]",
} as const;

/*
  Side-by-side lockup: the letter's box is now tight to the drawing, so
  centring the two boxes lands the apex and the cap line together and no nudge
  is needed. The old mark needed one because it sat in a square viewBox with a
  third of the box as padding below it.
*/

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
        <UpsideMark className="h-full w-full" />
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
        <UpsideMark className={MARK_SIZE.stack} />
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
        <UpsideMark className={MARK_SIZE.icon} />
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
      <UpsideMark className={MARK_SIZE.wordmark} />
      <LogoType
        className={alwaysType ? "max-[22.5rem]:hidden" : "hidden xs:inline"}
      />
    </span>
  );
}

export { MARK_SIZE };
