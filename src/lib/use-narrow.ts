"use client";

import { useSyncExternalStore } from "react";

/**
 * Below `md`, the width at which a floating panel stops being the right
 * container and a bottom sheet takes over. Shared so every surface that
 * makes that switch makes it at the same width.
 */
export const NARROW_QUERY = "(max-width: 47.999rem)";

export function useNarrow(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(NARROW_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(NARROW_QUERY).matches,
    // The server has no width. It renders the popover, and the sheet takes
    // over on hydration, which is before anybody can have pressed anything.
    () => false
  );
}
