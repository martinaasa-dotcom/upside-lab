"use client";

import { DashboardLoading } from "@/components/DashboardLoading";
import { DEFAULT_LOADING_MESSAGE } from "@/lib/loading-messages";

/**
 * What a returning reader is shown while the bundle hydrates.
 *
 * It is server-rendered beside the signed-out view and hidden by default;
 * only `html[data-session="in"]`, set by the blocking script in the root
 * layout (see `src/lib/session-hint.ts`), reveals it. So a browser that
 * has never signed in still gets the landing in its first painted frame,
 * with no script and no swap.
 *
 * Deliberately the *same* markup `Dashboard` shows while it loads: the
 * logo and the line under it are in the same place before hydration and
 * after it, so the app arrives underneath something that never moved. A
 * different placeholder would trade one visible swap for another.
 *
 * The message is the stable first line rather than a random one, because
 * this renders on the server and a random pick would not survive
 * hydration.
 */
export function SessionResumeShell() {
  return (
    <div data-session-resume>
      <DashboardLoading message={DEFAULT_LOADING_MESSAGE} />
    </div>
  );
}
