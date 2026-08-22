"use client";

import {
  EXPERIENCE_TIER_EVENT,
  loadStoredTier,
  TIER_HIDDEN_META_TABS,
} from "@/lib/experience-tier";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import { useEffect } from "react";

/** No tier answered yet hides nothing. Module-level so the identity is stable. */
const NONE: string[] = [];

function hiddenForStoredTier(): string[] {
  const tier = loadStoredTier();
  return tier ? TIER_HIDDEN_META_TABS[tier] : NONE;
}

/**
 * Which app sections this viewer's experience tier hides.
 *
 * The bottom bar draws one cell per section, so this number decides how wide
 * every cell is. That makes it something every page has to agree on: if the
 * book says four and Circle says five, the cells resize and every label moves
 * the moment you switch pages — the same failure the desktop dock had with
 * its add cell.
 *
 * `MobileDock` (then `MobileChrome`) took `hiddenModeIds` as an optional
 * prop and not one of its four call sites passed it, so Account, Circle, Fund and Admin all defaulted
 * to hiding nothing while the Dashboard hid whatever the tier said. That was
 * invisible only because `TIER_HIDDEN_META_TABS` is currently empty for every
 * tier; filling one entry back in would have made every one of those pages
 * disagree with the book. Deriving it here instead of passing it means a new
 * page cannot forget.
 *
 * Reads the same stored tier the Dashboard mirrors on every load, and follows
 * `EXPERIENCE_TIER_EVENT` so answering the question in Account updates the bar
 * without a reload.
 */
export function useHiddenMetaTabIds(): string[] {
  const [hidden, setHidden] = useHydratedCache(hiddenForStoredTier, NONE);
  useEffect(() => {
    const sync = () => setHidden(hiddenForStoredTier());
    window.addEventListener(EXPERIENCE_TIER_EVENT, sync);
    return () => window.removeEventListener(EXPERIENCE_TIER_EVENT, sync);
  }, [setHidden]);
  return hidden;
}
