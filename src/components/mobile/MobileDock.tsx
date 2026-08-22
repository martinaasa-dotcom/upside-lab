"use client";

import { MobileTabBar, type MobileTabId } from "@/components/mobile/MobileTabBar";
import { useHiddenMetaTabIds } from "@/lib/use-hidden-meta-tabs";

/**
 * The phone's dock, with this viewer's tier resolved for it.
 *
 * This was `MobileChrome` and drew the top bar as well. The top bar moved
 * into `AppHeader`, because the chrome has to be a single element to blur
 * as one pane — see the note there. What is left is the dock and the one
 * thing a page must not be trusted to remember: which meta-tabs this
 * viewer's experience tier hides. Derived here so a new page cannot forget
 * it and hand the dock a different cell count from every other page.
 */
export function MobileDock({
  active,
  alertCount,
  hiddenModeIds,
}: {
  active: MobileTabId | null;
  alertCount?: number;
  /** Omit it. Defaults to this viewer's tier, which every page must agree on. */
  hiddenModeIds?: string[];
}) {
  const tierHidden = useHiddenMetaTabIds();
  return (
    <MobileTabBar
      active={active}
      alertCount={alertCount}
      hiddenModeIds={hiddenModeIds ?? tierHidden}
    />
  );
}
