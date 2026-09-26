"use client";

/**
 * WHERE THE READER ACTUALLY IS, WHICH IS THE ONLY PART OF THIS MODULE THEY
 * WILL COME BACK FOR.
 *
 * The number panel above answers the question and is, on its own, slightly
 * demoralising: one large figure, decades away, that the reader does not
 * have. Nothing about it says whether they are doing well or what changes
 * this month.
 *
 * The ladder does. Every rung is a real threshold with a date on it, worked
 * from the reader's own holdings and their own saving, and the ones near the
 * bottom are close enough to be crossed. Two of them are worth the whole
 * panel. The bridge is the pot that covers the years between stopping work
 * and a state pension starting, and it is a fraction of the headline figure
 * because those years are meant to be spent down. Coasting is the day the
 * pot gets to the target on its own growth with nothing ever added again,
 * and it arrives years before the headline one.
 *
 * THE EARLIEST AGE IS SOLVED, NOT READ OFF A LINE. Retiring earlier raises
 * the target as the pot climbs towards it: more years of spending, fewer of
 * saving, a longer horizon and so a lower safe rate. `earliestRetirement`
 * moves both sides together. Watching the pot cross a fixed line instead
 * reads several years early, which is the flattering direction and the one
 * direction a number about somebody's money must never be wrong in.
 */

import { CARD, InfoTip, MicroLabel, Panel, PANEL_STACK, PanelHeader } from "@/components/ui/Panel";
import { barFillPct, cn, currency, percent } from "@/lib/format";
import { PALETTE } from "@/lib/palette";
import type { Milestone } from "@/lib/retirement/milestones";
import type { PlanResult, RetirementInputs } from "@/lib/retirement/plan";
import { Check, TrendingUp } from "lucide-react";
import { useMemo } from "react";

const W = 720;
const H = 180;

/*
  The pot over the whole plan: climbing while working, falling after.

  Labels are HTML over the picture rather than SVG text, for the reason
  `ChartAxis` gives and every other chart in this app follows: SVG text
  scales with the viewBox, so no size reads correctly on both a phone and
  a laptop.
*/
function PathChart({
  plan,
  target,
  code,
}: {
  plan: PlanResult;
  target: number;
  code: string;
}) {
  const shape = useMemo(() => {
    const rows = plan.ledger;
    if (rows.length < 2) return null;
    const firstAge = rows[0].age;
    const lastAge = rows[rows.length - 1].age + 1;
    const peak = Math.max(target, ...rows.map((r) => r.endPot), 1);
    const fx = (age: number) =>
      (age - firstAge) / Math.max(1, lastAge - firstAge);
    const fy = (v: number) => 1 - v / peak;
    const line = rows
      .map(
        (r, i) =>
          `${i === 0 ? "M" : "L"}${(fx(r.age + 1) * W).toFixed(1)},${(fy(r.endPot) * H).toFixed(1)}`
      )
      .join(" ");
    const retireAge = rows.find((r) => r.retired)?.age ?? lastAge;
    const retire = Math.min(1, Math.max(0, fx(retireAge)));
    const targetTop = Math.min(1, Math.max(0, fy(target)));
    /*
      Both captions live in the top-left corner in the same case: the
      target line is close enough to the top that its own caption's
      height reaches the "you stop" row, and "you stop" is close enough
      to the left that its own caption has not moved off the corner
      either. When both are true the target caption is pushed to a fixed
      second row under "you stop" instead of computing its position off
      the line.

      A LABEL DRAWN ABOVE ITS OWN LINE COLLIDES WELL BEFORE THE LINE
      ITSELF READS AS "NEAR THE TOP". The caption's height, not just the
      line's position, decides whether it reaches row zero: at a chart
      height of 160px (the phone breakpoint, the shorter of the two this
      panel renders at) a 16px caption pushed up by its own height clears
      row zero only once the line sits below about a fifth of the chart,
      not the eighth this cutoff first shipped at. Found by rendering
      the real component at a target sitting at 16% (an over-funded
      reader retiring today, so the pot's own peak sets a target well
      below it): the caption still read as "above the line" at that
      distance and printed on top of "you stop" anyway. Doubling the
      caption's own height as the margin covers both branches at once,
      the one drawn below the line and the one drawn above it.
    */
    const nearTop = targetTop < 0.25;
    const overlapsStopCaption = nearTop && retire < 0.4;
    return {
      line,
      firstAge,
      lastAge,
      retire,
      targetTop,
      nearTop,
      overlapsStopCaption,
      /* The middle tick is the age you stop, drawn on its own line. A
       * midpoint tick printed 68 beside a line at 67. Left out when it
       * would crowd an end label. */
      stopAge: retire > 0.12 && retire < 0.88 ? retireAge : null,
      fx,
    };
  }, [plan, target]);

  if (!shape) return null;

  return (
    <div className={cn(CARD, "p-4")}>
      <div className="relative w-full pb-6">
        {/*
          The chart and its axis row are two different heights: the svg is
          H pixels tall and the axis labels live in the pb-6 gutter below
          it. A `top` percentage on an absolutely positioned element
          resolves against the WHOLE containing block, so a label
          positioned by a fraction of H must live in a wrapper sized to
          exactly the svg, or a target line low in the chart drags its
          label down into the axis row below the chart's real bottom edge.

          Both captions carry `chart-label-halo`: they are drawn directly
          over the plotted line and the shaded plot area, which can sit on
          any panel background and over any part of the line they name, so
          a flat fill behind the text can never match what is actually
          behind the chart. The halo is the shared background-colored
          `text-shadow` `ChartAxis` already uses for its own overlay ticks.
        */}
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="block h-40 w-full sm:h-48"
            role="img"
            aria-label={`Your pot from age ${shape.firstAge} to ${shape.lastAge}, rising while you save and falling once you draw on it, against a target of ${currency(target, 0, code)}.`}
          >
            <line
              x1={0}
              x2={W}
              y1={shape.targetTop * H}
              y2={shape.targetTop * H}
              stroke={PALETTE.brand}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={shape.retire * W}
              x2={shape.retire * W}
              y1={0}
              y2={H}
              stroke="currentColor"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              className="text-border"
            />
            <path
              d={shape.line}
              fill="none"
              stroke={PALETTE.gain}
              strokeWidth={2.5}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {/*
            The caption hangs above its line, so a target at or near the top
            of the plot would put it outside the card with nothing to clip
            against. When the line is in the top fifth the caption sits
            below it instead. The line itself never moves. And when that
            near-top caption would print under "you stop"'s own corner
            (a target barely below the pot's peak and a retirement date
            close to today share the same top-left cell) it drops to a
            fixed second row instead of computing off the line, which
            would only put it back in the same corner.
          */}
          <span
            className={cn(
              "chart-label-halo pointer-events-none absolute left-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground",
              !shape.overlapsStopCaption &&
                (shape.nearTop ? "translate-y-0.5" : "-translate-y-full")
            )}
            style={{
              top: shape.overlapsStopCaption
                ? "1.375rem"
                : `${shape.targetTop * 100}%`,
            }}
          >
            target {currency(target, 0, code)}
          </span>
          <span
            className="chart-label-halo pointer-events-none absolute top-0 whitespace-nowrap text-xs text-muted-foreground"
            style={{
              left: `${Math.min(80, shape.retire * 100)}%`,
              paddingLeft: "0.25rem",
            }}
          >
            you stop
          </span>
        </div>
        {[shape.firstAge, shape.stopAge, shape.lastAge].map((age, i) =>
          age == null ? null : (
            <span
              key={i}
              className="chart-label-halo absolute bottom-0 text-xs tabular-nums text-muted-foreground"
              style={{
                left: i === 0 ? 0 : i === 1 ? `${shape.retire * 100}%` : undefined,
                right: i === 2 ? 0 : undefined,
                transform: i === 1 ? "translateX(-50%)" : undefined,
              }}
            >
              {age}
            </span>
          )
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Your pot, in today&apos;s money.{" "}
        {plan.lasts
          ? "It lasts the whole plan."
          : `It runs out at ${plan.emptyAtAge}.`}
      </p>
    </div>
  );
}

/**
 * One rung as a row, not a card. The rungs were five tall cards, each a
 * bar, a percentage, an age and a paragraph, which made the ladder the
 * longest panel on the page for five facts that are each a figure and a
 * date. The bars became one shared track above the list (`LadderTrack`),
 * where the reader can see all the rungs against their pot at once, and
 * what crossing a rung means sits behind the mark beside its name.
 */
function Rung({
  milestone,
  code,
  currentAge,
}: {
  milestone: Milestone;
  code: string;
  currentAge: number;
}) {
  const when = milestone.reached
    ? "Reached"
    : milestone.ageReached != null
      ? `at ${milestone.ageReached}, in ${Math.max(0, milestone.ageReached - currentAge)}y`
      : "not on this path";
  return (
    <li className="flex min-w-0 items-center gap-3 py-3">
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full border",
          milestone.reached
            ? "border-gain bg-gain/15 text-gain"
            : "border-foreground/25 text-transparent"
        )}
        aria-hidden
      >
        <Check className="size-3" />
      </span>
      {/*
        On a phone the age goes under the name: three columns in 330px
        truncated "The comfortable standard" to "The comf...".
      */}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
          <span className="min-w-0">{milestone.label}</span>
          <InfoTip text={milestone.blurb} label={`What ${milestone.label} means`} />
        </span>
        <span className="text-xs text-muted-foreground sm:hidden">{when}</span>
      </span>
      <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
        {currency(milestone.target, 0, code)}
      </span>
      <span className="hidden w-32 shrink-0 text-right text-xs text-muted-foreground sm:block">
        {when}
      </span>
    </li>
  );
}

/**
 * Every rung on one track, with the reader's pot as the fill. Positions
 * are shares of the biggest rung, so the picture is the whole ladder and
 * where the reader stands on it, at once.
 */
function LadderTrack({
  milestones,
  pot,
  code,
}: {
  milestones: Milestone[];
  pot: number;
  code: string;
}) {
  const top = Math.max(1, pot, ...milestones.map((m) => m.target));
  const at = (v: number) => Math.min(100, Math.max(0, (v / top) * 100));
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      <div className="relative h-3 rounded-full bg-muted">
        <div
          className="overview-bar absolute inset-y-0 left-0 rounded-full bg-primary"
          style={{ width: `${barFillPct(at(pot), 1)}%` }}
        />
        {milestones.map((m) => (
          <span
            key={m.id}
            className={cn(
              "absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background",
              m.reached ? "bg-gain" : "bg-foreground/60"
            )}
            style={{ left: `${at(m.target)}%` }}
            title={`${m.label}: ${currency(m.target, 0, code)}`}
          />
        ))}
      </div>
      <div className="flex justify-between font-mono text-xs tabular-nums text-muted-foreground">
        <span>
          You <span className="text-primary">{currency(pot, 0, code)}</span>
        </span>
        <span>{currency(top, 0, code)}</span>
      </div>
    </div>
  );
}

export function StandingPanel({
  inputs,
  plan,
  milestones,
}: {
  inputs: RetirementInputs;
  plan: PlanResult;
  milestones: Milestone[];
}) {
  const code = plan.currency;
  const target = plan.required.target;
  const currentAge = Math.round(inputs.currentAge);
  const have = inputs.currentPot + inputs.otherSavings;

  return (
    <div className={PANEL_STACK}>
      <Panel>
        <PanelHeader
          icon={<TrendingUp className="h-4 w-4" />}
          title="Where you stand"
          subtitle="The pot from today to the end of the plan, and the milestones on the way."
        />

        {/*
          One sentence, not a strip of three figures. The figure at the day
          you stop, the shortfall and the monthly amount that closes it are
          the verdict at the top of the room now, word for word, so this
          panel carries only what that card does not: where the pot stands
          today, and what it grows to on its own with nothing more added.
        */}
        <p className="text-sm leading-relaxed text-muted-foreground">
          Today you hold{" "}
          <span className="font-mono tabular-nums text-foreground">
            {currency(have, 0, code)}
          </span>
          {target > 0 ? (
            <>
              , {percent(Math.min(1, have / target), 0)} of your number
            </>
          ) : null}
          . Left alone with nothing more added, that grows to{" "}
          <span className="font-mono tabular-nums text-foreground">
            {currency(plan.projectedFromTodayOnly, 0, code)}
          </span>{" "}
          by {Math.round(inputs.retirementAge)}.
        </p>

        <PathChart plan={plan} target={target} code={code} />

        {/*
          The ladder was a panel of its own asking the same question as
          this one, where you stand, one step finer. It is this panel's
          second half now: the thresholds on the way, and when each falls.
        */}
        <div className="flex flex-col gap-3">
          <MicroLabel>On the way to your number</MicroLabel>
          <LadderTrack milestones={milestones} pot={have} code={code} />
        </div>
        <ul className="divide-y divide-border">
          {milestones.map((m) => (
            <Rung key={m.id} milestone={m} code={code} currentAge={currentAge} />
          ))}
        </ul>
      </Panel>
    </div>
  );
}
