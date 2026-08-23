"use client";

import { track } from "@vercel/analytics";
import { useAuth } from "@/components/AuthProvider";
import { WelcomeTour } from "@/components/WelcomeTour";
import { isAbortError } from "@/lib/abort";
import { isPaperClassOnly } from "@/lib/classroom";
import {
  loadCommunityListCache,
  saveCommunityListCache,
  type CommunityListRow,
} from "@/lib/community-cache";
import {
  loadStoredKnowsOptions,
  loadStoredTier,
  saveStoredKnowsOptions,
  saveStoredTier,
  type ExperienceTier,
} from "@/lib/experience-tier";
import {
  loadSeenTourVersion,
  saveSeenTourVersion,
  tourIsDue,
  WELCOME_TOUR_EVENT,
  WELCOME_TOUR_VERSION,
} from "@/lib/welcome-tour";
import { supabaseIsConfigured } from "@/lib/supabase/env";
import { useCallback, useEffect, useState } from "react";

type BookRow = {
  slug?: string | null;
  classroom_community_id?: string | null;
};

type Plan = {
  hasHoldings: boolean;
  classroomOnly: boolean;
  tier: ExperienceTier | null;
  knowsOptions: boolean | null;
};

/**
 * Who is owed the walkthrough, and what shape theirs should be.
 *
 * ## Why this is a version and not a "have they onboarded" flag
 *
 * The old gate asked two questions, and it asked them of almost nobody:
 * `shouldSkipExperienceOnboarding` returns true the moment `holdingsCount >
 * 0`, so every reader who already owned anything was skipped, permanently.
 * On top of that the whole thing was switched off behind a constant on
 * 2026-08-18. The result is an app whose only explanation of itself reached
 * roughly the people who had nothing in it.
 *
 * So the question this gate asks is no longer "have they been onboarded"
 * but "have they seen *this* walkthrough" — `welcome_tour_version` on the
 * profile against `WELCOME_TOUR_VERSION`. Everybody starts at zero, so
 * everybody sees the new one once, holdings or not, and raising the constant
 * later does the same thing again without a migration or a reset script.
 *
 * Holdings still matter, just not for whether to show it. They decide which
 * screens are in it: somebody who already owns things is not asked to type
 * them in, and a paper-class account is not asked either.
 *
 * ## Why it waits for the server
 *
 * The old gate opened the moment it saw no tier in localStorage, on the
 * argument that waiting left an empty Home. That argument does not survive
 * the switch to a version: a browser with an empty localStorage is also
 * every second device, and every cleared cache, of somebody who finished
 * this last week. Opening on a guess would show them the walkthrough again
 * and take it away mid-sentence when the profile arrived.
 *
 * So it waits for one fetch, and a failed fetch shows nothing. That costs a
 * few hundred milliseconds on a first visit and it costs nothing at all
 * afterwards, because a finished tour is written to localStorage too and
 * short-circuits before the fetch is even issued. A network blip means the
 * walkthrough waits for the next visit, which is the right way round: the
 * failure mode of guessing is interrupting somebody who has already read it.
 */
export function WelcomeTourGate() {
  const { ready, user } = useAuth();
  const [plan, setPlan] = useState<Plan | null>(null);
  /** Bumped by Account's replay button so this re-runs without a reload. */
  const [asked, setAsked] = useState(0);

  useEffect(() => {
    const replay = () => setAsked((n) => n + 1);
    window.addEventListener(WELCOME_TOUR_EVENT, replay);
    return () => window.removeEventListener(WELCOME_TOUR_EVENT, replay);
  }, []);

  useEffect(() => {
    if (!supabaseIsConfigured() || !ready || !user) {
      setPlan(null);
      return;
    }

    /*
      Asked for by hand, from Account.

      Both short-circuits below exist to stop the walkthrough reappearing for
      somebody who has already read it — which is exactly what this person is
      asking for. So a replay skips them, and only them: it still reads the
      profile, because the shape of the tour (holdings, paper class, the two
      answers already given) is decided by the same fetch.
    */
    const replaying = asked > 0;

    // Already seen, on this browser. No fetch, no flicker, no work.
    if (!replaying && !tourIsDue(loadSeenTourVersion())) {
      setPlan(null);
      return;
    }

    const ctrl = new AbortController();

    void (async () => {
      try {
        const [tierRes, bookRes, commRes] = await Promise.all([
          fetch("/api/account/experience-tier", { signal: ctrl.signal }),
          fetch("/api/portfolios", { cache: "no-store", signal: ctrl.signal }),
          fetch("/api/communities", { cache: "no-store", signal: ctrl.signal }),
        ]);
        if (ctrl.signal.aborted) return;

        const tierData = tierRes.ok
          ? ((await tierRes.json()) as {
              tier?: string | null;
              knowsOptions?: boolean | null;
              tourVersion?: number | null;
            })
          : null;

        /*
          A profile we could not read is not a profile that has seen nothing.
          Showing the walkthrough on a failed fetch is the one behaviour that
          can interrupt the same person every single visit.
        */
        if (!tierData) return;

        /*
          The server's copy of the two answers, mirrored into localStorage on
          the way past. Every tier gate in the app reads localStorage, and
          this is the one request that is guaranteed to have the truth in
          hand — a reader on a new device otherwise runs at the default until
          they next open Account.
        */
        const tier =
          tierData.tier === "novice" ||
          tierData.tier === "investor" ||
          tierData.tier === "advanced"
            ? tierData.tier
            : loadStoredTier();
        const knowsOptions =
          typeof tierData.knowsOptions === "boolean"
            ? tierData.knowsOptions
            : loadStoredKnowsOptions();
        if (tier) saveStoredTier(tier);
        if (typeof knowsOptions === "boolean") saveStoredKnowsOptions(knowsOptions);

        if (!replaying && !tourIsDue(tierData.tourVersion)) {
          saveSeenTourVersion(WELCOME_TOUR_VERSION);
          return;
        }

        const bookData = bookRes.ok ? await bookRes.json() : null;
        const commData = commRes.ok ? await commRes.json() : null;

        const portfolios = (bookData?.portfolios ?? []) as BookRow[];
        const holdings = (bookData?.holdings ?? []) as unknown[];
        const communities = (commData?.communities ??
          loadCommunityListCache() ??
          []) as CommunityListRow[];
        if (Array.isArray(commData?.communities)) {
          saveCommunityListCache(communities);
        }

        setPlan({
          hasHoldings: holdings.length > 0,
          classroomOnly: isPaperClassOnly(portfolios, communities),
          tier,
          knowsOptions,
        });
        track("welcome_tour_opened", {
          version: WELCOME_TOUR_VERSION,
          replay: replaying,
        });
      } catch (err) {
        if (isAbortError(err) || ctrl.signal.aborted) return;
        /* No walkthrough this visit. It is still due on the next one. */
      }
    })();

    return () => ctrl.abort();
  }, [ready, user, asked]);

  const done = useCallback(
    (input: {
      tier: ExperienceTier | null;
      knowsOptions: boolean | null;
      skipped: boolean;
    }) => {
      /*
        The tour has already POSTed the version; this is the browser's copy,
        written here rather than in the tour so the one component that knows
        the tour is over is the one that records it.
      */
      saveSeenTourVersion(WELCOME_TOUR_VERSION);
      setPlan(null);
      track("welcome_tour_done", {
        version: WELCOME_TOUR_VERSION,
        skipped: input.skipped,
        tier: input.tier ?? "unset",
        knowsOptions: input.knowsOptions ?? "unset",
      });
    },
    []
  );

  if (!plan || !user) return null;

  return (
    <WelcomeTour
      onDone={done}
      hasHoldings={plan.hasHoldings}
      classroomOnly={plan.classroomOnly}
      initialTier={plan.tier}
      initialKnowsOptions={plan.knowsOptions}
    />
  );
}
