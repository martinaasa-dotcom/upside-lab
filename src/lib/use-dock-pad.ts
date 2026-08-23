"use client";

import { useLayoutEffect } from "react";

/*
 * What is really at the bottom of the window, published on <html> so
 * anything that has to sit clear of it can ask.
 *
 * A registry rather than a `:has([data-dock])` selector, because "mounted"
 * and "on the screen" are different questions here and only the second one
 * matters:
 *
 *  - `WorkspaceShell` keeps every room you have visited mounted and hides
 *    it with the `hidden` attribute, so a room's dock never leaves the DOM
 *    once you have been there.
 *  - The phone dock is `md:hidden` and the wide dock `hidden md:block`, so
 *    on any given screen one of the two is in the DOM and drawing nothing.
 *
 * A selector says yes to all of those. Measuring says no, and says it again
 * the moment the answer changes.
 *
 * Both hooks take the element, not a ref, and every call site hands them a
 * callback ref. A `RefObject` cannot carry this: the wide dock renders into
 * `WORKSPACE_DOCK_SLOT_ID` through a portal, and moving into the portal
 * gives React a fresh DOM node, so a layout effect that ran once against
 * `ref.current` is left measuring a node that has been detached. It read as
 * "there is no dock" on every wide screen, which is the state that put the
 * measurement question over Margus's button.
 */

/** Height of each dock that is actually drawn. Absent means not drawn. */
const docks = new Map<HTMLElement, number>();
/** Elements holding the bottom-right corner: Margus's button. */
const corners = new Set<HTMLElement>();

/** Drawn, not merely mounted: no client rects inside a hidden ancestor. */
function drawn(el: HTMLElement) {
  if (el.getClientRects().length === 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== "hidden";
}

function publish() {
  const root = document.documentElement;

  let tallest = 0;
  docks.forEach((height) => {
    if (height > tallest) tallest = height;
  });
  if (tallest > 0) {
    root.setAttribute("data-dock", "");
    root.style.setProperty("--dock-clearance", `${Math.ceil(tallest + 32)}px`);
  } else {
    root.removeAttribute("data-dock");
    root.style.removeProperty("--dock-clearance");
  }

  if (corners.size > 0) root.setAttribute("data-bottom-corner", "");
  else root.removeAttribute("data-bottom-corner");
}

/**
 * Write the visible dock's real height into --dock-pad so page padding
 * always clears it. Guessing in rem broke every time the dock grew.
 *
 * Also publishes `data-dock` and `--dock-clearance` on <html> for the
 * bottom notices. `--dock-pad` cannot serve them: it is set on every
 * `.page-frame` as well, with a static class fallback, so a notice reading
 * it gets a dock's worth of clearance on a page that has no dock. The
 * clearance variable is written in one place and removed when the last
 * dock stops being drawn.
 */
export function useDockPad(el: HTMLElement | null) {
  useLayoutEffect(() => {
    if (!el) return;

    const apply = () => {
      const height = drawn(el) ? el.getBoundingClientRect().height : 0;
      if (height < 16) {
        docks.delete(el);
        publish();
        return;
      }
      const pad = `${Math.ceil(height + 32)}px`;
      document.documentElement.style.setProperty("--dock-pad", pad);
      document.querySelectorAll(".page-frame").forEach((frame) => {
        if (frame instanceof HTMLElement) {
          frame.style.setProperty("--dock-pad", pad);
        }
      });
      docks.set(el, height);
      publish();
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      docks.delete(el);
      publish();
    };
  }, [el]);
}

/**
 * Say that this element is holding the bottom-right corner, so a notice
 * anchored there clears it instead of landing on top of it. Margus's
 * round button is the only thing that does.
 */
export function useBottomCorner(el: HTMLElement | null) {
  useLayoutEffect(() => {
    if (!el) return;

    const apply = () => {
      if (drawn(el)) corners.add(el);
      else corners.delete(el);
      publish();
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
      corners.delete(el);
      publish();
    };
  }, [el]);
}
