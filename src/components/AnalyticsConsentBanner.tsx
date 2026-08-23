"use client";

import { Button } from "@/components/ui/button";
import {
  ANALYTICS_CONSENT_EVENT,
  loadAnalyticsConsent,
  saveAnalyticsConsent,
} from "@/lib/analytics-consent";
import { useEffect, useState } from "react";

/**
 * Essential sign-in cookies always run. This only asks about Vercel
 * page-view and load-time measurement.
 */
export function AnalyticsConsentBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () => setOpen(loadAnalyticsConsent() == null);
    sync();
    window.addEventListener(ANALYTICS_CONSENT_EVENT, sync);
    return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, sync);
  }, []);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Performance measurement"
      /*
       * Bottom offset clears the dock *and* the Margus button above it.
       * Both this and the button anchor to `--dock-pad`, so with the same
       * offset they land on the same spot in the bottom-right corner and
       * this one — being `z-50` — sits on the button and blurs it into a
       * smear. `5rem` is the button (4rem at `lg`) plus a gap.
       */
      className="fixed z-50 left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] bottom-[max(5.75rem,calc(var(--dock-pad,5.5rem)+5.5rem))] md:left-auto md:w-[22rem]"
    >
      {/*
        * `glass-overlay`, not `glass`.
        *
        * This is pinned over the page rather than laid out in it, and on a
        * phone it lands squarely on top of a content card. `glass` is a 2%
        * white veil built to sit over the ambient field, so the card
        * underneath read straight through the panel and the two sets of
        * words interleaved — which looks like a rendering fault, on the
        * first screen a new person sees. DESIGN_TOKENS.md already draws
        * this line: anything over real content is an overlay and takes the
        * heavy fill, because hiding what is beneath it is the job.
        */}
      <div className="flex flex-col gap-3 rounded-xl glass-overlay ring-1 ring-foreground/20 p-4">
        <p className="text-sm leading-relaxed text-foreground">
          Page views and load times help keep the app fast. Sign-in cookies
          always run. Performance measurement is optional.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => saveAnalyticsConsent("allow")}
          >
            Allow
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => saveAnalyticsConsent("deny")}
          >
            No thanks
          </Button>
        </div>
      </div>
    </div>
  );
}
