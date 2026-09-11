"use client";

import { BestDays } from "@/components/playbook/BestDays";
import { BestDaysSection } from "@/components/playbook/BestDaysSection";
import { IdeaDeck } from "@/components/playbook/IdeaDeck";
import { RecoveryGap } from "@/components/playbook/RecoveryGap";
import { TemperatureLadder } from "@/components/playbook/TemperatureLadder";
import { BelowFold } from "@/components/BelowFold";
import { PANEL_STACK, Panel, PanelHeader } from "@/components/ui/Panel";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import { isAbortError } from "@/lib/abort";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import {
  isSentimentMetrics,
  preferSentimentSnapshot,
  type SentimentMetrics,
} from "@/lib/market-sentiment";
import { loadSentimentPaint, saveSentimentPaint } from "@/lib/paint-cache";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import { onWorkspaceRefresh } from "@/lib/workspace-rooms";
import { Compass, Gauge, Scale, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

/*
  The score is a daily index, so this does not poll. It re-reads when the
  reader comes back to the tab, behind a floor, which is the only case that
  actually goes stale: this panel lives in the book room, which the shell
  keeps mounted, so a reader who opened it last night and returns in the
  morning would otherwise be shown yesterday's band under a sentence saying
  "today" with a stamp that has quietly aged to "14h ago".
*/
const MIN_REFETCH_MS = 600_000;

/*
  THE ONE ROOM IN THIS APP THAT IS NOT ABOUT THE READER'S OWN ROWS.

  Everything else here starts from what somebody already holds: Pulse
  explains a move in one of their companies, Growth compounds their own
  figure, the Research room answers a question about a name they are
  weighing. All of that assumes the harder half is already settled, which
  for most people it is not. Somebody who can read every screen in this
  product and still cannot say whether a 20% fall is a catastrophe or a
  Tuesday has not been given the thing that decides what they do, and the
  thing that decides what they do is general knowledge about how this works,
  which fits in no feature and sells nothing.

  So this room holds it, and it works on an empty account, which is the
  reader who needs it most. Nothing on this page reads a portfolio, calls a
  model, or costs a provider anything beyond the market reading the app
  already fetches for Home.

  WHY IT IS SAFE FOR AN APP THAT MAY NOT GIVE ADVICE.

  Three things, all structural rather than a matter of care. Every
  principle carries the condition it applies in and the market's own
  published figure for whether that condition holds, so a reader can check
  rather than believe. Every principle carries the way it goes wrong, so
  the page never leaves somebody with a single reason to do the thing they
  already wanted to do. And the sentences that are grammatically orders are
  all quotations with a named author on them, which is the app reporting
  what somebody said; the app's own prose never instructs. `playbook.test.ts`
  holds the last of those.

  The one legal line sits at the foot, once, per the disclaimer rule.
*/

const EMPTY: SentimentMetrics = {
  vix: null,
  rsi: null,
  fearGreed: null,
  cryptoFearGreed: null,
  spyPrice: null,
  sma200: null,
  smaRatio: null,
  streakDays: null,
  typicalMoreDays: null,
  alreadyLong: false,
  spark: null,
  asOf: null,
};

function Section({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  /*
    No wrapper: a `Panel` already gaps its own children at 24/32, and this
    div restated those two numbers as `gap-6 sm:gap-8` -- the responsive
    pair the spacing pass removed from `Panel` itself, because a pair can
    only ever be half overridden. With the wrapper in place the panel had
    exactly one child, so its own rhythm never applied and a second copy
    of the numbers did the work. Dropping it leaves the geometry identical
    and deletes the copy.
  */
  return (
    <Panel>
      <PanelHeader title={title} subtitle={subtitle} icon={icon} />
      {children}
    </Panel>
  );
}

export function PlaybookPanel() {
  const [metrics, setMetrics] = useHydratedCache<SentimentMetrics>(
    () => loadSentimentPaint() ?? EMPTY,
    EMPTY
  );
  const metricsRef = useRef(metrics);
  metricsRef.current = metrics;
  const fetchedAtRef = useRef(0);

  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        const res = await fetch("/api/market/sentiment", { signal });
        if (!res.ok) return;
        const data: unknown = await res.json();
        if (signal.aborted || !isSentimentMetrics(data)) return;
        const chosen = preferSentimentSnapshot(metricsRef.current, data);
        setMetrics(chosen);
        saveSentimentPaint(chosen);
        fetchedAtRef.current = Date.now();
      } catch (err) {
        if (isAbortError(err)) return;
      }
    },
    [setMetrics]
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    const again = () => {
      if (document.hidden) return;
      if (Date.now() - fetchedAtRef.current < MIN_REFETCH_MS) return;
      void load(ctrl.signal);
    };
    document.addEventListener("visibilitychange", again);
    return () => {
      document.removeEventListener("visibilitychange", again);
      ctrl.abort();
    };
  }, [load]);

  /*
    A pull refetches the reading, which is the only thing on this page that
    can be out of date. The ideas cannot go stale, and a room that answers
    a pull by doing nothing is worse than one that does not answer it, so
    this subscribes and the ring waits on the real request.
  */
  useEffect(
    () =>
      onWorkspaceRefresh("book", () => {
        const ctrl = new AbortController();
        return load(ctrl.signal);
      }),
    [load]
  );

  const score = metrics.fearGreed;

  return (
    /*
      NO HERO PANEL. LAB'S OWN HEADER IS THE ONE THIS ROOM GETS.

      This opened with a panel carrying a hero title and a subtitle, and
      directly above it Lab prints its own heading, its tab row and a
      sentence introducing whichever tab is open. So a reader met two
      headings and two subtitles saying much the same thing before reaching
      anything, which is exactly the fault this repo already records
      against the valuation panel when it was two stacked cards for one
      question. The tab's own intro sentence carries what the hero said.
    */
    <div className={PANEL_STACK}>
      <WidgetErrorBoundary name="Market temperature">
        <Section
          title="Fear and greed"
          subtitle="The oldest idea in investing is that prices and mood move together and the mood is the easier of the two to read. Somebody publishes a number for it every day, so the idea that belongs to today is the one this reading picks out."
          icon={<Gauge aria-hidden className="size-4" />}
        >
          <TemperatureLadder score={score} asOf={metrics.asOf} />
        </Section>
      </WidgetErrorBoundary>

      <BelowFold reserve={320}>
        <WidgetErrorBoundary name="Recovery gap">
          <Section
            title="What a fall costs to undo"
            subtitle="A fall and the rise that undoes it are never the same size, and the gap between them widens fast."
            icon={<Scale aria-hidden className="size-4" />}
          >
            <RecoveryGap />
          </Section>
        </WidgetErrorBoundary>
      </BelowFold>

      {/*
        The fetch lives inside the fold, so a reader who never scrolls this
        far never asks for it. See `BestDaysSection`.
      */}
      <BelowFold reserve={320}>
        <WidgetErrorBoundary name="Best days">
          <BestDaysSection>
            {(read) => (
              <Section
                title="Where the returns actually come from"
                subtitle="The most quoted statistic in investing, worked out here from the index itself rather than repeated from somewhere, with the half that is usually left off."
                icon={<Sparkles aria-hidden className="size-4" />}
              >
                <BestDays read={read} />
              </Section>
            )}
          </BestDaysSection>
        </WidgetErrorBoundary>
      </BelowFold>

      <BelowFold reserve={380}>
        <WidgetErrorBoundary name="Ideas">
          <Section
            title="Ideas worth keeping"
            subtitle="The ideas that keep turning up in the writing of people who did this well for a long time, each in plain words with the sentence it is usually remembered by."
            icon={<Compass aria-hidden className="size-4" />}
          >
            <IdeaDeck />
          </Section>
        </WidgetErrorBoundary>
      </BelowFold>

      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        {ADVICE_DISCLAIMER_SHORT}
      </p>
    </div>
  );
}
