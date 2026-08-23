"use client";

import { useOnlineStatus } from "@/lib/use-online-status";

/**
 * Overlay chip when the device has no network. Does not sit in the header
 * or push the page down; the last cached book stays on screen.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      /*
       * `.bottom-notice` sets the height off the bottom from whether a dock
       * is on the page. This used to fall back to 5.5rem of clearance for a
       * dock that is not on the sign-in page, and floated the chip most of
       * the way up an empty corner. No corner class: it sits on the left,
       * where Margus's button is not.
       */
      className="bottom-notice pointer-events-none fixed z-50 left-[max(1rem,env(safe-area-inset-left))]"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full border border-caution/40 bg-background/90 px-2.5 py-1 text-sm font-medium text-caution shadow-lg backdrop-blur">
        <span className="h-1.5 w-1.5 rounded-full bg-caution" aria-hidden />
        Offline Mode
      </span>
    </div>
  );
}
