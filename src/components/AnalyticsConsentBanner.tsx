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
       * Phone keeps the tall bottom offset, because a 390px screen has no
       * free corner: the offset clears the dock *and* the Margus button
       * above it. Both this and the button anchor to `--dock-pad`, so with
       * the same offset they land on the same spot and this one, being
       * `z-50`, sits on the button and blurs it into a smear. `5rem` is the
       * button (4rem at `lg`) plus a gap.
       *
       * From `md` it moves to the bottom **left** and drops to the floor,
       * and that is the whole fix. Riding the same `--dock-pad` on a wide
       * screen lifted it about 272px, which put it squarely on the hero:
       * the signed-out page's product sample is the right-hand column, and
       * the banner landed on the "Worth noticing" card inside it. The most
       * persuasive thing on the first screen a stranger sees was covered by
       * a cookie notice.
       *
       * Bottom-left is empty on every screen in the app, which is why it is
       * the right corner rather than merely a free one: the dock is centred
       * and content-sized, and the Margus button is bottom-right. Nothing
       * competes for it, so the banner no longer needs to be lifted clear
       * of anything and can sit where a consent notice belongs.
       */
      className="fixed z-50 left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] bottom-[max(5.75rem,calc(var(--dock-pad,5.5rem)+5.5rem))] md:bottom-6 md:left-6 md:right-auto md:w-[22rem]"
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
