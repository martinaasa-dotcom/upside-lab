"use client";

import { useEffect, useState } from "react";
import {
  dockCueDue,
  loadDockCueLastSeen,
  recordDockCueSeen,
} from "@/lib/dock-attention";

/** Matches the two `dock-attention-pulse` cycles in `dock.css`. */
const CUE_DURATION_MS = 2_400;

/**
 * True for one short window on mount, if and only if the reader has been
 * away long enough that the dock is worth pointing at again. See
 * `dock-attention.ts` for the reasoning and the idle window.
 *
 * A hook rather than reading storage straight in JSX so it only ever runs
 * once per mount (a dock is remounted per room, never per render) and so
 * the state clears itself without a caller having to remember to.
 *
 * `enabled` defaults to true and exists for exactly one caller: the book
 * room mounts both docks together (`hidden md:block` / `md:hidden`, both
 * always in the DOM), and if each ran this independently, whichever
 * mounts first in the tree -- the wide dock, which is hidden on a phone
 * -- would win the check and consume it, so the visible phone bar would
 * never show the cue at all. `Dashboard.tsx` calls this once and passes
 * the result to both, and passes `enabled: false` into `MobileTabBar`'s
 * own internal call so it does not also read and re-record the same
 * clock. Every other room mounts one dock and calls this with no
 * argument.
 */
export function useDockAttentionCue(enabled = true): boolean {
  const [cue, setCue] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    if (dockCueDue(loadDockCueLastSeen())) {
      setCue(true);
      const id = window.setTimeout(() => setCue(false), CUE_DURATION_MS);
      recordDockCueSeen();
      return () => window.clearTimeout(id);
    }
    recordDockCueSeen();
    return undefined;
  }, [enabled]);

  return cue;
}
