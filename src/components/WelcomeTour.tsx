"use client";

import { Button } from "@/components/ui/button";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { PulseFilm } from "@/components/landing/PulseFilm";
import { AddHoldingsScreen } from "@/components/tour/AddHoldingsScreen";
import {
  AboutYouScreen,
  blendTier,
  TIER_Q1,
  type Q1Answer,
  type Q2Answer,
} from "@/components/tour/AboutYouScreen";
import { FirstWeekScreen } from "@/components/tour/FirstWeekScreen";
import { PromisesScreen } from "@/components/tour/PromisesScreen";
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
import { ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

/*
  The walkthrough somebody gets on their way in.

  ## One picture, one title, one line

  The version before this one was seven screens that each wanted a tap,
  which was right, and a paragraph or three on every one of them, which was
  not: Martin's word for it was walls of text. What a person is willing to
  read on the way into an app is close to nothing, so every screen is now
  a picture or a control that carries the screen, a title, and one line
  saying what to do with it.

    Welcome plays the same made-up week the landing page plays: five
    companies, the market as a line through them, and a caption for
    whatever stood out. It replaced a red day to solve, which taught the
    idea by opening on a loss.

    Three promises, at a glance, in place of a four-step true-or-not quiz.

    The two questions, three taps each.

    Then their holdings (only when they have none), something to watch,
    and a short finish with the Sunday email switch.

  The bar along the bottom is no longer taught here. It teaches itself:
  every room says its own name the moment it is pressed.

  ## What the shell guarantees, and must keep guaranteeing

    One heading with one id, hoisted out of the screens, so every screen is
    a labelled dialog rather than only the first.

    One `.scroll-host`, with the progress pinned above and the footer
    pinned below, so no screen can push the way forward off a short phone.

    Skip means one thing: leaving the walkthrough. Never a step, never a
    field. The forward button is always Next, then Finish, and it is the
    only forward button on any screen.

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

  function onBack() {
    go(-1);
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
      className="z-[200] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-4"
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
      {/*
        On the shared pad (`.modal-pad`, 16px sides on a phone and 24 from
        `sm`), which `.modal-bleed` below assumes. `max-w-lg` on every
        width: one column of short screens reads better narrow, and the
        film on the first screen is drawn for a column. One fixed height
        rather than a cap, so stepping from a long screen to a short one
        does not make the frame jump under the reader's thumb.
      */}
      <div className="glass-overlay modal-pad flex h-[min(100%,44rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl ring-1 ring-foreground/20">
        {/*
          Progress, and the way out, on one line. Segments rather than
          labels: six labels do not fit a phone. The step's own name sits
          under them for a screen reader and a curious eye.
        */}
        <div className="mb-4 flex shrink-0 items-center gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex gap-1.5" aria-hidden>
              {stages.map((s, i) => (
                <span
                  key={s}
                  className="relative h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/15"
                >
                  <span
                    className={cn(
                      "absolute inset-0 origin-left rounded-full bg-primary transition-transform duration-500 ease-out motion-reduce:transition-none",
                      i <= index ? "scale-x-100" : "scale-x-0"
                    )}
                  />
                </span>
              ))}
            </div>
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground tabular-nums">
              {index + 1} of {stages.length} · {STAGE_LABEL[stage]}
            </p>
          </div>
          {/*
            A `Button`, not a bare `<button>` with link styling. The touch
            target rule in globals.css keys off `data-slot="button"`, so a
            hand-rolled one is a 20px tap target on the phone where it
            matters most, and this is the only way out of the walkthrough.
            On every screen but the last, where Finish does the same thing.
          */}
          {!last ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void leave(true)}
              disabled={saving}
              className="shrink-0 font-normal text-muted-foreground"
            >
              Skip
            </Button>
          ) : null}
        </div>

        {/*
          The one scroller, with the progress pinned above it and the footer
          pinned below. Keyed on the step so each screen arrives with a short
          rise, and the scroll position starts at the top.
        */}
        <div
          ref={scrollRef}
          className="scroll-host modal-bleed flex min-h-0 flex-1 flex-col overflow-y-auto"
        >
          <div key={stage} className="tour-step flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              {/*
                One step up the scale from a modal's own title, on a child,
                which is the sanctioned way to ask the heading scale for a
                size it does not have (heading-scale.test.ts).
              */}
              <h2 id={HEADING_ID} className="text-foreground">
                <span className="block text-balance text-2xl tracking-[-0.03em]">
                  {copy.title}
                </span>
              </h2>
              <p className="text-base leading-snug text-muted-foreground">
                {copy.lede}
              </p>
            </div>

            {stage === "welcome" && <PulseFilm compact />}

            {stage === "promises" && <PromisesScreen />}

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
        </div>

        {/*
          One footer, the same on every screen: Back small on the left where
          it is ignorable, and the way forward large on the right where the
          thumb is. Nothing here moves between steps except the word.
        */}
        <div className="mt-4 flex shrink-0 items-center gap-3 border-t border-border pt-3">
          {index > 0 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
              disabled={saving}
              className="gap-1 px-3 text-muted-foreground"
            >
              <ChevronLeft data-icon="inline-start" />
              Back
            </Button>
          ) : null}

          {last ? (
            <Button
              type="button"
              className="ms-auto h-11 min-w-36 rounded-full px-6 text-base"
              disabled={saving}
              onClick={() => void leave(false)}
            >
              {saving ? "Saving …" : "Finish"}
            </Button>
          ) : (
            <Button
              type="button"
              className="ms-auto h-11 min-w-36 rounded-full px-6 text-base"
              onClick={onNext}
              disabled={saving}
            >
              {nextLabel}
            </Button>
          )}
        </div>
      </div>
    </ViewportOverlay>
  );
}
