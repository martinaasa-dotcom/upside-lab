"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { barFillPct } from "@/lib/format";

/*
 * Pointing at a slice lights that group everywhere it is drawn nearby:
 * the slice, the same group in a second bar beside it (the circle draws
 * the room's and yours), and its chip in the legend, while the rest
 * steps back. The group is the nearest ancestor holding a legend, a few
 * levels up at most, so a bar never reaches into a panel it is not part
 * of. Mouse and pen only: a finger has no hover and would latch the dim
 * on the last thing tapped. The styling is `[data-mix-hot]` in
 * globals.css; nothing here changes a width or a figure.
 */
function mixGroup(el: Element): Element | null {
  let node = el.parentElement;
  for (let i = 0; i < 4 && node; i++) {
    if (node.querySelector("[data-mix-legend]")) return node;
    node = node.parentElement;
  }
  return el.closest("[data-mix-bar]");
}

export function pointMix(el: Element, key: string | null) {
  const group = mixGroup(el);
  if (!group) return;
  if (key == null) group.removeAttribute("data-mix-hot");
  else group.setAttribute("data-mix-hot", "");
  group.querySelectorAll<HTMLElement>("[data-mix]").forEach((node) => {
    if (key != null && node.dataset.mix === key) node.setAttribute("data-mix-on", "");
    else node.removeAttribute("data-mix-on");
  });
}

/** Props that make an element a pointable member of a mix group. */
export function mixProps(key: string) {
  return {
    "data-mix": key,
    onPointerEnter: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType !== "touch") pointMix(e.currentTarget, key);
    },
    onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType !== "touch") pointMix(e.currentTarget, null);
    },
  };
}

/**
 * One proportional bar, `Segmented`'s well made presentational.
 *
 * Three screens drew this exact bar by hand (the circle's "What the
 * circle owns", Lab's "What you're actually betting on", the Fund's
 * "Where the money sits") with three copies of the same markup, so a fix
 * to one had to be remembered in the other two. One component now, so
 * the three cannot drift apart again.
 *
 * Adjacent slices used to sit flush against each other with no edge
 * between them, which is fine when two neighbouring colors are far apart
 * on the wheel and reads as one blended block when they are not — this
 * app's own ten-hue ramp (`--cat-*` in globals.css) puts a couple of
 * near-identical blues a few slices apart, and on a book weighted toward
 * one or two themes those are exactly the two likely to land side by
 * side. A `gap` between slices was tried first and reverted: flexbox
 * treats each slice's `width` as its flex-basis, so a gap large enough to
 * read forces every slice to shrink to make room for it, which is a
 * second, silent distortion of the one thing a bar like this promises —
 * that a slice's width is its share. An inset `box-shadow` costs nothing
 * from the layout instead: it paints a hairline just inside each slice's
 * trailing edge, over its own fill, so widths stay exactly what the data
 * said.
 *
 * The line is `--muted`, the track's own color (the bar sits on
 * `bg-muted`), not `--background`. `--muted` is `oklch(0.269 0 0)` against
 * a true-black `--background` of `oklch(0 0 0)` — close enough that the
 * difference is invisible on its own, but a seam drawn in pure black reads
 * as a foreign line cut into the bar, where the track's own color reads as
 * the track showing through a seam, which is what a gap would have shown
 * had it not cost the bar its own widths.
 */
export type AllocationBarSlice = {
  key: string;
  /** 0-1. Clamped through `barFillPct`, so a real but tiny slice still
   * shows a 1.5% sliver rather than vanishing, and a bad number (a
   * division by a zero total, say) cannot run the fill past its track. */
  pct: number;
  color: string;
  /** Read on hover/focus; callers already have their own "12%" vs "less
   * than 1%" rounding rule, so this is the finished string, not a number. */
  title: string;
};

export function AllocationBar({
  slices,
  size = "sm",
}: {
  slices: AllocationBarSlice[];
  /**
   * "lg" is the room's centrepiece: a tall bar of separate blocks with a
   * gap between them, grown in from the left once on arrival. "sm" is the
   * thin inline meter every other surface uses.
   */
  size?: "sm" | "lg";
}) {
  if (size === "lg") {
    return (
      <div data-mix-bar className="overview-bar flex h-11 gap-[3px] sm:h-14" role="img" aria-label={slices.map((s) => s.title).join(", ")}>
        {slices.map((s) => (
          <div
            key={s.key}
            {...mixProps(s.key)}
            className="min-w-[6px] rounded-md transition-[filter] duration-200 first:rounded-l-xl last:rounded-r-xl hover:brightness-125"
            style={{
              width: `${barFillPct(s.pct * 100, 1.5)}%`,
              backgroundColor: s.color,
            }}
            title={s.title}
          />
        ))}
      </div>
    );
  }
  return (
    <div data-mix-bar className="flex h-3 overflow-hidden rounded-full bg-muted">
      {slices.map((s, i) => (
        <div
          key={s.key}
          {...mixProps(s.key)}
          style={{
            width: `${barFillPct(s.pct * 100, 1.5)}%`,
            backgroundColor: s.color,
            boxShadow:
              i < slices.length - 1
                ? "inset -1.5px 0 0 0 var(--muted)"
                : undefined,
          }}
          title={s.title}
        />
      ))}
    </div>
  );
}
