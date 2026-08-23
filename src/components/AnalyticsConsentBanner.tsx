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
       * Height off the bottom is `.bottom-notice` plus `.bottom-notice-corner`
       * in globals.css: the dock and Margus's button each say whether they
       * are on the page, and this clears whichever of them is. Nothing about
       * that lives here, because a number typed here is a guess about a
       * different component, and it was wrong on every page a stranger sees
       * first -- it sat 176px up an empty sign-in page clearing two things
       * that were not there.
       *
       * A full-width strip on a phone, a card in the bottom-right corner
       * from `sm` up, on the same inset as the height so the corner is
       * square.
       */
      className="bottom-notice bottom-notice-corner fixed z-50 left-[max(1rem,env(safe-area-inset-left))] right-[max(1rem,env(safe-area-inset-right))] sm:left-auto sm:right-[max(1.5rem,env(safe-area-inset-right))] sm:w-[22rem]"
    >
      {/*
       * `glass-overlay`, not `glass`.
       *
       * This is pinned over the page rather than laid out in it, and on a
       * phone it lands squarely on top of a content card. `glass` is a 2%
       * white veil built to sit over the ambient field, so the card
       * underneath read straight through the panel and the two sets of
       * words interleaved, which looks like a rendering fault on the first
       * screen a new person sees. DESIGN_TOKENS.md already draws this line:
       * anything over real content is an overlay and takes the heavy fill,
       * because hiding what is beneath it is the job.
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
