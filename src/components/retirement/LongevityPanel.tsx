"use client";

/**
 * The survival curve, drawn, because the argument cannot be made in a
 * sentence and can be made in a picture.
 *
 * What a reader has to be talked out of here is the belief that life
 * expectancy is when you die. Telling them it is an average does not work,
 * because everybody already knows that and nobody acts on it. What works is
 * seeing the curve: a line that is still well above zero at the age they
 * had in mind, and the shaded stretch past it that they have a real chance
 * of living through with no money in it. The three marks are the whole
 * lesson. Half of people are still here at the first one. One in ten reach
 * the second. The plan runs to the third.
 *
 * The chart is deliberately the only chart in this module with no money on
 * it. It answers one question, and putting a pot on the same axes would
 * turn the one panel whose subject is mortality into another panel about
 * saving.
 */

import { CARD, MicroLabel, Panel, PanelHeader, Score, Scoreboard } from "@/components/ui/Panel";
import { ChartYAxis } from "@/components/ui/ChartAxis";
import { Button } from "@/components/ui/button";
import { SliderField, CountField } from "@/components/retirement/fields";
import { cn } from "@/lib/format";
import { PALETTE } from "@/lib/palette";
import {
  DEFAULT_IMPROVEMENT_PCT,
  IMPROVEMENT_ENDS_AT_AGE,
  IMPROVEMENT_FULL_TO_AGE,
  IMPROVEMENT_REFERENCE_AGE,
  type LongevityResult,
} from "@/lib/retirement/longevity";
import type { RetirementInputs } from "@/lib/retirement/plan";
import { HeartPulse } from "lucide-react";
import { useMemo } from "react";

const W = 720;
const H = 190;

/**
 * Push labels apart so two marks close together do not print through each
 * other, moving them symmetrically and never moving the marks themselves.
 *
 * This is the fault the valuation panel already recorded and it turned up
 * here on the first real render: with the plan at 105 and the one in ten
 * age at 102, the two captions overlapped into "1 in 10 1P2an 105". It
 * fires exactly when the two ages agree, which is not a rare case, it is
 * what happens when the reader sets a planning age near a percentile.
 *
 * The labels are bare ages rather than a name and an age for the same
 * reason: a caption's width is what decides whether two marks can stand
 * near each other, and "1 in 10 102" is three times the width of "102".
 * The names moved into the legend underneath, which cannot collide.
 */
function spreadLabels(positions: number[], minGap: number): number[] {
  const out = positions.map((p) => Math.min(0.97, Math.max(0.03, p)));
  for (let i = 1; i < out.length; i++) {
    if (out[i] - out[i - 1] < minGap) {
      const push = (minGap - (out[i] - out[i - 1])) / 2;
      out[i - 1] = Math.max(0.03, out[i - 1] - push);
      out[i] = Math.min(0.97, out[i] + push);
    }
  }
  return out;
}

/** The gap two bare ages need, as a share of the plot. Set for a phone. */
const LABEL_GAP = 0.1;

/*
  Labels are HTML laid over the picture, never SVG `<text>`.

  An SVG text node scales with the viewBox, so a label sized to read well
  on a laptop is tiny on a phone and vice versa, and there is no size that
  is right at both ends. Every other chart in this app puts its ticks in
  absolutely positioned HTML at `text-xs` for that reason, which also keeps
  them on the app's own type ladder rather than on a pixel value invented
  for one chart.
*/
function SurvivalChart({
  result,
  planningAge,
  currentAge,
}: {
  result: LongevityResult;
  planningAge: number;
  currentAge: number;
}) {
  const shape = useMemo(() => {
    const points = result.curve.filter((p) => p.age >= currentAge);
    const last = points[points.length - 1]?.age ?? 120;
    const endAge = Math.min(last, Math.max(planningAge + 8, 108));
    const shown = points.filter((p) => p.age <= endAge);
    /** 0 to 1 across the plot, so the HTML labels share the same maths. */
    const fx = (age: number) =>
      (age - currentAge) / Math.max(1, endAge - currentAge);
    const fy = (s: number) => 1 - s;
    const d = shown
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${(fx(p.age) * W).toFixed(1)},${(fy(p.survival) * H).toFixed(1)}`
      )
      .join(" ");
    /*
      The shaded part is the stretch the plan does not reach. It is the
      only thing in this picture a reader has to feel, so it is the only
      thing filled in.
    */
    const past = shown.filter((p) => p.age >= planningAge);
    const area =
      past.length > 1
        ? `M${(fx(past[0].age) * W).toFixed(1)},${H} ` +
          past
            .map(
              (p) => `L${(fx(p.age) * W).toFixed(1)},${(fy(p.survival) * H).toFixed(1)}`
            )
            .join(" ") +
          ` L${(fx(past[past.length - 1].age) * W).toFixed(1)},${H} Z`
        : "";
    const raw = [
      { key: "half", name: "Half reach", age: result.p50, color: PALETTE.muted },
      { key: "ten", name: "One in ten reach", age: result.p10, color: PALETTE.steel },
      { key: "plan", name: "Your plan runs to", age: planningAge, color: PALETTE.brand },
    ];
    const label = spreadLabels(raw.map((m) => fx(m.age)), LABEL_GAP);
    return {
      d,
      area,
      endAge,
      /** How likely the reader is to outlive their own plan. */
      beyondPlan:
        result.curve.find((p) => p.age >= planningAge)?.survival ?? 0,
      marks: raw.map((m, i) => ({
        ...m,
        at: Math.min(1, Math.max(0, fx(m.age))),
        label: label[i],
      })),
    };
  }, [result, planningAge, currentAge]);

  return (
    <div className={cn(CARD, "p-4")}>
      <div className="relative w-full pb-6">
        <ChartYAxis
          ticks={[0, 25, 50, 75, 100]}
          yAt={(v) => (1 - v / 100) * H}
          height={H}
          format={(v) => `${v}%`}
          overlay
          className="bottom-6"
        />
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-40 w-full sm:h-48"
          role="img"
          aria-label={`Your chance of still being alive at each age from ${currentAge} to ${Math.round(shape.endAge)}. Half reach ${Math.round(result.p50)}, one in ten reach ${Math.round(result.p10)}, and the plan runs to ${planningAge}.`}
        >
          {[0, 25, 50, 75, 100].map((s) => (
            <line
              key={s}
              x1={0}
              x2={W}
              y1={(1 - s / 100) * H}
              y2={(1 - s / 100) * H}
              stroke="currentColor"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              className="text-border"
            />
          ))}
          {shape.area ? (
            <path d={shape.area} fill={PALETTE.loss} opacity={0.25} />
          ) : null}
          <path
            d={shape.d}
            fill="none"
            stroke={PALETTE.gain}
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
          />
          {shape.marks.map((m) => (
            <line
              key={m.key}
              x1={m.at * W}
              x2={m.at * W}
              y1={0}
              y2={H}
              stroke={m.color}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {shape.marks.map((m) => (
          <span
            key={m.key}
            className="absolute bottom-0 -translate-x-1/2 text-xs tabular-nums"
            style={{ left: `${m.label * 100}%`, color: m.color }}
          >
            {Math.round(m.age)}
          </span>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {shape.marks.map((m) => (
          <li
            key={m.key}
            className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: m.color }}
            />
            <span className="min-w-0">
              {m.name}{" "}
              <span className="font-mono tabular-nums text-foreground">
                {Math.round(m.age)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        The line is your chance of still being here at each age.{" "}
        {shape.beyondPlan > 0.02
          ? `The shaded part is the stretch your plan does not reach, and you have about a ${Math.round(shape.beyondPlan * 100)}% chance of living into it.`
          : "Your plan runs so far out that almost nothing is left unshaded, which is the point of planning into the tail rather than to an average."}
      </p>
    </div>
  );
}

export function LongevityPanel({
  inputs,
  patch,
  result,
  planningAge,
  showControls,
}: {
  inputs: RetirementInputs;
  patch: (next: Partial<RetirementInputs>) => void;
  result: LongevityResult;
  planningAge: number;
  /*
    The curve and the four ages are the lesson and cost the reader nothing
    to read, so they are on the page at every detail level. The two
    controls under them are the only part anybody has to have an opinion
    about, and a reader who has not asked for dials does not need to be
    handed a mortality improvement rate to set.
  */
  showControls: boolean;
}) {
  const usingSuggestion = inputs.planningAge == null;
  return (
    <Panel>
      <PanelHeader
        icon={<HeartPulse className="h-4 w-4" />}
        title="How long the money has to last"
        subtitle="Not your life expectancy. Half of people outlive theirs, and a plan built on an average is a coin flip on whether the money outlasts you. Running out at 92 costs far more than dying with a surplus, so this plans out in the tail and shows you the whole curve."
      />

      <SurvivalChart
        result={result}
        planningAge={planningAge}
        currentAge={Math.round(inputs.currentAge)}
      />

      <Scoreboard cols={4} mobileCols={2}>
        <Score
          label="Average"
          value={<span className="font-mono tabular-nums">{Math.round(inputs.currentAge + result.lifeExpectancy)}</span>}
          sub="The number in the news. Half of people beat it."
        />
        <Score
          label="Half reach"
          value={<span className="font-mono tabular-nums">{Math.round(result.p50)}</span>}
          sub="A coin flip. Not a plan."
        />
        <Score
          label="One in ten reach"
          value={<span className="font-mono tabular-nums">{Math.round(result.p10)}</span>}
          sub="Already a real chance, not a freak case."
        />
        <Score
          label="One in twenty reach"
          value={<span className="font-mono tabular-nums">{Math.round(result.p5)}</span>}
          sub="Where this plan runs to unless you move it."
        />
      </Scoreboard>

      {showControls ? (
      <div className="grid gap-4 sm:grid-cols-2">
        <SliderField
          label="Medicine improves by"
          value={inputs.improvementPct}
          min={0}
          max={2.5}
          step={0.1}
          onChange={(improvementPct) => patch({ improvementPct })}
          format={(n) => `${n.toFixed(1)}% a year`}
          note={`How fast death rates at each age keep falling. Zero says medicine stops today, which is what every published life table quietly assumes. ${DEFAULT_IMPROVEMENT_PCT}% is the cautious end of the last century's record. The improvement is faded out between ${IMPROVEMENT_FULL_TO_AGE} and ${IMPROVEMENT_ENDS_AT_AGE}, because the gains of the last hundred years came from not dying young rather than from moving the ceiling.`}
        />
        <div className="flex min-w-0 flex-col gap-2">
          <CountField
            label="Plan runs to age"
            value={planningAge}
            min={Math.round(inputs.retirementAge) + 1}
            max={125}
            suffix="years old"
            onChange={(age) => patch({ planningAge: age })}
            note={
              usingSuggestion
                ? "Taken from the curve above, at the age one in twenty reach. Type over it if you would rather plan to a different one."
                : "Your own figure."
            }
          />
          {!usingSuggestion ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => patch({ planningAge: null })}
            >
              Put it back to {result.suggestedPlanningAge}
            </Button>
          ) : null}
        </div>
      </div>
      ) : null}

      <div className={cn(CARD, "p-4")}>
        <MicroLabel>How this is worked out</MicroLabel>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The chance of dying in the next year is a small constant, which is
          accidents, plus a term that roughly doubles every eight years, which
          is ageing. That shape has fitted adult death rates in every
          population anybody has measured since 1825. Its level is solved from
          one published figure for your country: that a 65 year old there has{" "}
          <span className="font-mono tabular-nums text-foreground">
            {result.e65Used.toFixed(1)}
          </span>{" "}
          years left on average. Everything else on this panel follows from
          that one number and the improvement rate beside it.
        </p>
        {result.yearsOfImprovementToReference > 0 && result.hazardCutAtReference > 0.005 ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            That improvement rate is applied to calendar time, not to age, so
            it treats a younger reader differently without anybody choosing
            that: it compounds for as long as there are years between now and
            the age in question. You have{" "}
            <span className="font-mono tabular-nums text-foreground">
              {Math.round(result.yearsOfImprovementToReference)}
            </span>{" "}
            years between now and {IMPROVEMENT_REFERENCE_AGE}, which cuts the
            death rate this model uses for a {IMPROVEMENT_REFERENCE_AGE} year
            old by about{" "}
            <span className="font-mono tabular-nums text-foreground">
              {Math.round(result.hazardCutAtReference * 100)}%
            </span>{" "}
            against today&apos;s published rate for that age. Somebody older
            than you gets fewer of those years and a smaller cut, which is
            why this curve moves with your age rather than sitting on one
            fixed table. It is still the rate you set above, not a bolder one
            assumed on your behalf: move the slider if you think medicine
            will do better than that.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
