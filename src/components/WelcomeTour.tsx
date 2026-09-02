"use client";

import { Button } from "@/components/ui/button";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { AddHoldingsScreen } from "@/components/tour/AddHoldingsScreen";
import {
  AboutYouScreen,
  blendTier,
  TIER_Q1,
  type Q1Answer,
  type Q2Answer,
} from "@/components/tour/AboutYouScreen";
import { FirstWeekScreen } from "@/components/tour/FirstWeekScreen";
import { GroundRulesScreen } from "@/components/tour/GroundRulesScreen";
import { RedDayScreen } from "@/components/tour/RedDayScreen";
import { RoomsScreen } from "@/components/tour/RoomsScreen";
import { WatchScreen } from "@/components/tour/WatchScreen";
import {
  EXPERIENCE_TIERS,
  saveStoredKnowsOptions,
  saveStoredTier,
  type ExperienceTier,
} from "@/lib/experience-tier";
import { requestBookRefresh } from "@/lib/book-cache";
import { cn } from "@/lib/format";
import { postJsonOrQueue } from "@/lib/offline/queued-fetch";
import {
  handOverTourScreenshot,
  HEADING_ID,
  screenCopy,
  STAGE_LABEL,
  tourStages,
  WELCOME_TOUR_VERSION,
  type Stage,
} from "@/lib/welcome-tour";
import { loadWatchlist, saveWatchlist } from "@/lib/watchlist";
import { useEffect, useMemo, useRef, useState } from "react";

/*
  The walkthrough somebody gets on their way in.

  ## Every screen wants a tap before it wants a read

  The version this replaces explained the app in eleven screens of prose,
  and it was honest, careful prose that people scrolled past. The trouble
  with explaining a product on the way in is that nobody has any reason to
  care yet: they have not seen the thing the explanation is about. So every
  screen here is something to do, and the explaining happens underneath the
  doing, in one line at a time.

    Screen one is the whole product as a question. Eight red rows, one of
    which had news, and which one? Answering that by hand is what makes
    Pulse mean something afterwards, and nothing said in a sentence ever
    did.

    The ground rules are sorted rather than listed, because the two that
    matter are the two people arrive believing the opposite of.

    The bar along the bottom is a working miniature you press, not six
    cards about rooms.

    The two questions about the reader sit beside a small Home that loses
    the Lab glyph and the covered calls row as they answer, so the promise
    is shown rather than made.

    Then their own holdings, with a live price said back to them; one
    company to watch, with a live price said back to them; and a short list
    of what to do this week with the first line already ticked.

  ## What the shell guarantees, and must keep guaranteeing

    One heading with one id, hoisted out of the screens, so every screen is
    a labelled dialog rather than only the first.

    One `.scroll-host`, with the progress pinned above and the footer
    pinned below, so no screen can push the way forward off a short phone.

    Skip means one thing: leaving the walkthrough. Never a step, never a
    field. The forward button is always Next, then Finish.

    Nothing is required. Every screen can be passed with Next, and leaving
    keeps whatever was answered before it was left.

    It is a portfolio. Never a sheet, never a book, and a company is never
    a name.
*/

type Props = {
  /** Called once the tour is finished or skipped; both write the version. */
  onDone: (input: {
    tier: ExperienceTier | null;
    knowsOptions: boolean | null;
    skipped: boolean;
  }) => void;
  /** They already own things: no reason to ask them to type it in again. */
  hasHoldings: boolean;
  /**
   * A paper-class account. Their holdings come from a homework portfolio the
   * teacher provisioned, so "add what you own" is the wrong question.
   */
  classroomOnly: boolean;
  /** What we already know, so the two questions arrive pre-answered. */
  initialTier: ExperienceTier | null;
  initialKnowsOptions: boolean | null;
};

type AddedHolding = { ticker: string; shares: number; buyPrice: number };

export function WelcomeTour({
  onDone,
  hasHoldings,
  classroomOnly,
  initialTier,
  initialKnowsOptions,
}: Props) {
  const stages = useMemo<Stage[]>(
    () => tourStages({ hasHoldings, classroomOnly }),
    [hasHoldings, classroomOnly]
  );

  const [index, setIndex] = useState(0);
  const stage = stages[Math.min(index, stages.length - 1)]!;
  const scrollRef = useRef<HTMLDivElement>(null);

  const [q1, setQ1] = useState<Q1Answer | null>(
    initialTier ? TIER_Q1[initialTier] : null
  );
  /*
    Only the answer we can actually reconstruct.

    Q2 has three options and `knows_options` is a boolean, so "no, not
    familiar" and "I understand them but rarely use them" both store `false`
    and are indistinguishable coming back. Guessing between them would show
    somebody a wrong statement about themselves on a screen whose whole
    subject is them, which is worse than one extra tap. `true` is
    unambiguous, so that one is pre-filled.
  */
  const [q2, setQ2] = useState<Q2Answer | null>(
    initialKnowsOptions === true ? "regularly" : null
  );
  const [noteSunday, setNoteSunday] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState<{
    tier: ExperienceTier;
    knowsOptions: boolean;
  } | null>(null);

  const [added, setAdded] = useState<AddedHolding[]>([]);
  /*
    Lifted out of the holdings screen for one reason: Escape. Somebody half
    way through typing "Apple" who wants the suggestion list gone should not
    lose the walkthrough for it, and the overlay is what owns Escape.
  */
  const [listOpen, setListOpen] = useState(false);

  const [watching, setWatching] = useState<string[]>([]);
  useEffect(() => {
    setWatching(loadWatchlist());
  }, []);

  /*
    Back to the top on every step. The panel is its own scroller, so a long
    screen followed by a short one would otherwise open halfway down.
  */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [index]);

  function go(delta: number) {
    setIndex((i) => Math.min(Math.max(i + delta, 0), stages.length - 1));
  }

  /**
   * Everything the reader told us, written down in one place.
   *
   * Called on the way out, however they leave, so an abandoned walkthrough
   * still keeps whatever was answered before it was abandoned. localStorage
   * first: it is what every gate in the app reads, and it is the copy that
   * survives the request failing.
   */
  async function persist(): Promise<{
    tier: ExperienceTier | null;
    knowsOptions: boolean | null;
  }> {
    const tier = q1 && q2 ? blendTier(q1, q2) : initialTier;
    const knowsOptions = q2 ? q2 === "regularly" : initialKnowsOptions;

    if (tier) saveStoredTier(tier);
    if (knowsOptions !== null && knowsOptions !== undefined) {
      saveStoredKnowsOptions(knowsOptions);
    }
    saveWatchlist(watching);

    try {
      await postJsonOrQueue("/api/account/experience-tier", {
        ...(tier ? { tier } : {}),
        ...(knowsOptions === null || knowsOptions === undefined
          ? {}
          : { knowsOptions }),
        tourVersion: WELCOME_TOUR_VERSION,
      });
      await postJsonOrQueue("/api/account/weekly-note", { sunday: noteSunday });
    } catch {
      /* localStorage has the answers; the email switch lives in Account too */
    }
    return { tier: tier ?? null, knowsOptions: knowsOptions ?? null };
  }

  /** The last screen wants the tier's own label in its heading. */
  async function settleAnswers() {
    if (saving) return;
    setSaving(true);
    const saved = await persist();
    setSaving(false);
    if (saved.tier) {
      setFinished({
        tier: saved.tier,
        knowsOptions: saved.knowsOptions ?? true,
      });
    }
  }

  async function leave(skipped: boolean) {
    if (saving) return;
    setSaving(true);
    const saved = await persist();
    setSaving(false);
    /* The picture, if they gave one, goes to the app underneath. */
    handOverTourScreenshot();
    requestBookRefresh();
    onDone({ ...saved, skipped });
  }

  const tierLabel = finished
    ? (EXPERIENCE_TIERS.find((t) => t.id === finished.tier)?.label ?? null)
    : null;
  const copy = screenCopy(stage, tierLabel);

  const last = stage === "week";
  const nextLabel = saving ? "Saving …" : "Next";

  function onNext() {
    if (stage === "watchlist") saveWatchlist(watching);
    /*
      Settled here rather than on the last screen's own render, so the
      heading arrives already carrying the tier's name rather than changing
      under the reader a moment after it appears.
    */
    if (stages[index + 1] === "week") void settleAnswers();
    go(1);
  }

  return (
    <ViewportOverlay
      className="z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      ariaLabelledBy={HEADING_ID}
      /*
        Escape leaves, and leaving is the same as finishing: whatever was
        answered is kept and the walkthrough does not come back. The overlay
        is also what traps Tab, so the ring cannot wander onto the page
        underneath while this is open.

        Unless a ticker suggestion list is open, in which case Escape means
        the list.
      */
      onClose={() => {
        if (listOpen) {
          setListOpen(false);
          return;
        }
        void leave(true);
      }}
    >
      <div className="glass-overlay flex max-h-[min(100%,44rem)] w-full max-w-md flex-col overflow-hidden rounded-xl p-4 ring-1 ring-foreground/20 sm:max-w-2xl sm:p-6">
        {/* Progress. Segments rather than labels: seven labels do not fit a phone. */}
        <div className="mb-5 shrink-0">
          <div className="flex gap-1" aria-hidden>
            {stages.map((s, i) => (
              <span
                key={s}
                className={cn(
                  "h-1 min-w-0 flex-1 rounded-full transition-colors",
                  i <= index ? "bg-primary" : "bg-muted"
                )}
              />
            ))}
          </div>
          <p className="mt-2 text-sm tabular-nums text-muted-foreground">
            Step {index + 1} of {stages.length} · {STAGE_LABEL[stage]}
          </p>
        </div>

        {/*
          The one scroller, with the progress pinned above it and the footer
          pinned below. A screen can be long, and the way forward is still on
          screen at every width, which on a short phone is the whole
          difference between a walkthrough and a trap.
        */}
        <div
          ref={scrollRef}
          className="scroll-host -mx-4 px-4 sm:-mx-6 sm:px-6 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
        >
          <div className="flex flex-col gap-2">
            <h2
              id={HEADING_ID}
              className="text-lg font-semibold text-foreground"
            >
              {copy.title}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {copy.lede}
            </p>
          </div>

          {stage === "day" && <RedDayScreen />}

          {stage === "rules" && <GroundRulesScreen />}

          {stage === "rooms" && <RoomsScreen />}

          {stage === "you" && (
            <AboutYouScreen q1={q1} q2={q2} onQ1={setQ1} onQ2={setQ2} />
          )}

          {stage === "holdings" && (
            <AddHoldingsScreen
              added={added}
              onAdded={setAdded}
              listOpen={listOpen}
              onListOpen={setListOpen}
            />
          )}

          {stage === "watchlist" && (
            <WatchScreen watching={watching} onWatching={setWatching} />
          )}

          {stage === "week" && (
            <FirstWeekScreen
              noteSunday={noteSunday}
              onNoteSunday={setNoteSunday}
            />
          )}
        </div>

        {/*
          One footer, the same on every screen.

          Back on the left where it is ignorable, the way forward on the right
          where the thumb is, and the way out in between as the quietest thing
          on the row. Nothing here moves between steps except the words.

          The way out is on every screen rather than only the first. It used
          to be the left-hand button, which Back replaced from step two
          onwards, so from the second screen on the only exits were Escape
          and finishing, and a phone has no Escape. A walkthrough with no
          door after the first room is a wall.

          `flex-wrap` with `ms-auto` on the link so a 320px phone drops it to
          its own line rather than squeezing the two buttons.
        */}
        <div className="mt-5 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-4">
          {index > 0 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => go(-1)}
              disabled={saving}
            >
              Back
            </Button>
          ) : null}

          {/*
            A `Button`, not a bare `<button>` with link styling. The touch
            target rule in globals.css keys off `data-slot="button"`, so a
            hand-rolled one is a 20px tap target on the phone where it
            matters most, and this is the only way out of the walkthrough.
          */}
          <Button
            type="button"
            variant="ghost"
            onClick={() => void leave(true)}
            disabled={saving}
            className="ms-auto font-normal text-muted-foreground"
          >
            Skip the tour
          </Button>

          {last ? (
            <Button
              type="button"
              disabled={saving}
              onClick={() => void leave(false)}
            >
              {saving ? "Saving …" : "Finish"}
            </Button>
          ) : (
            <Button type="button" onClick={onNext} disabled={saving}>
              {nextLabel}
            </Button>
          )}
        </div>
      </div>
    </ViewportOverlay>
  );
}
