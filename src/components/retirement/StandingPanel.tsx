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

import { CARD, MicroLabel, Panel, PANEL_STACK, PanelHeader, Pill, Score, Scoreboard } from "@/components/ui/Panel";
import { barFillPct, cn, currency, percent } from "@/lib/format";
import { PALETTE } from "@/lib/palette";
import type { Milestone } from "@/lib/retirement/milestones";
import type { PlanResult, RetirementInputs } from "@/lib/retirement/plan";
import { Check, Flag, TrendingUp } from "lucide-react";
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
    return {
      line,
      firstAge,
      lastAge,
      retire: Math.min(1, Math.max(0, fx(retireAge))),
      targetTop: Math.min(1, Math.max(0, fy(target))),
      midAge: Math.round((firstAge + lastAge) / 2),
      fx,
    };
  }, [plan, target]);

  if (!shape) return null;

  return (
    <div className={cn(CARD, "p-4")}>
      <div className="relative w-full pb-6">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-40 w-full sm:h-48"
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
          against. When the line is in the top eighth the caption sits
          below it instead. The line itself never moves.
        */}
        <span
          className={cn(
            "chart-label-halo pointer-events-none absolute left-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground",
            shape.targetTop < 0.12 ? "translate-y-0.5" : "-translate-y-full"
          )}
          style={{ top: `${shape.targetTop * 100}%` }}
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
        {[shape.firstAge, shape.midAge, shape.lastAge].map((age, i) => (
          <span
            key={age}
            className="chart-label-halo absolute bottom-0 text-xs tabular-nums text-muted-foreground"
            style={{
              left: i === 0 ? 0 : undefined,
              right: i === 2 ? 0 : undefined,
              transform: i === 1 ? "translateX(-50%)" : undefined,
              ...(i === 1 ? { left: "50%" } : {}),
            }}
          >
            {age}
          </span>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Your pot in today&apos;s money, climbing while you save and falling
        once you draw on it.{" "}
        {plan.lasts
          ? "On these numbers it is still there at the end of the plan."
          : `On these numbers it runs out at ${plan.emptyAtAge}.`}
      </p>
    </div>
  );
}

function Rung({
  milestone,
  code,
  currentAge,
}: {
  milestone: Milestone;
  code: string;
  currentAge: number;
}) {
  return (
    <div
      className={cn(
        CARD,
        "flex min-w-0 flex-col gap-2 p-4",
        milestone.reached && "ring-1 ring-gain/40"
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-foreground">
          {milestone.reached ? (
            <Check className="h-4 w-4 shrink-0 text-gain" aria-hidden />
          ) : null}
          <span className="min-w-0">{milestone.label}</span>
        </span>
        <span className="shrink-0 font-mono tabular-nums text-foreground">
          {currency(milestone.target, 0, code)}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className="h-full rounded-full"
          style={{
            width: `${barFillPct(milestone.progress * 100, 1)}%`,
            background: milestone.reached ? PALETTE.gain : PALETTE.brand,
          }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {percent(milestone.progress, 0)} of the way
        </span>
        {milestone.reached ? (
          <Pill tone="good">Reached</Pill>
        ) : milestone.ageReached != null ? (
          <span className="text-xs text-muted-foreground">
            at {milestone.ageReached}, in{" "}
            {Math.max(0, milestone.ageReached - currentAge)} years
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            not on this path yet
          </span>
        )}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {milestone.blurb}
      </p>
    </div>
  );
}

export function StandingPanel({
  inputs,
  plan,
  milestones,
  earliest,
}: {
  inputs: RetirementInputs;
  plan: PlanResult;
  milestones: Milestone[];
  earliest: { age: number; pot: number; required: number } | null;
}) {
  const code = plan.currency;
  const target = plan.required.target;
  const currentAge = Math.round(inputs.currentAge);
  const have = inputs.currentPot + inputs.otherSavings;
  const shortBy = plan.gap;

  return (
    <div className={PANEL_STACK}>
      <Panel>
        <PanelHeader
          icon={<TrendingUp className="h-4 w-4" />}
          title="Where you stand"
          subtitle="Your own holdings, projected forward at the mix this plan is using, against the number it needs."
        />

        <Scoreboard cols={4} mobileCols={2}>
          <Score
            label="You have"
            value={
              <span className="font-mono tabular-nums">{currency(have, 0, code)}</span>
            }
            sub={`${percent(target > 0 ? Math.min(1, have / target) : 0, 0)} of the target, today`}
          />
          <Score
            label={`Projected at ${Math.round(inputs.retirementAge)}`}
            value={
              <span className="font-mono tabular-nums">
                {currency(plan.projectedPot, 0, code)}
              </span>
            }
            sub={`${currency(plan.projectedFromTodayOnly, 0, code)} of that is what you already hold, just growing`}
          />
          <Score
            label={shortBy > 0 ? "Short by" : "Over by"}
            value={
              <span className="font-mono tabular-nums">
                {currency(Math.abs(shortBy), 0, code)}
              </span>
            }
            tone={shortBy > 0 ? "down" : "up"}
            sub={
              shortBy > 0
                ? `Closed by adding ${currency(plan.monthlyToClose, 0, code)} a month`
                : "On these numbers you are already ahead of the plan"
            }
          />
          <Score
            label="Earliest you could stop"
            value={
              <span className="font-mono tabular-nums">
                {earliest ? earliest.age : "n/a"}
              </span>
            }
            sub={
              earliest
                ? `With ${currency(earliest.pot, 0, code)} against a target of ${currency(earliest.required, 0, code)} for stopping that year`
                : "Not reachable on what you are saving now"
            }
          />
        </Scoreboard>

        <PathChart plan={plan} target={target} code={code} />
      </Panel>

      <Panel>
        <PanelHeader
          icon={<Flag className="h-4 w-4" />}
          title="The ladder"
          subtitle="One number decades away tells you nothing about whether you are doing well. These are the thresholds on the way to it, each with the year you cross it on what you are saving now."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {milestones.map((m) => (
            <Rung key={m.id} milestone={m} code={code} currentAge={currentAge} />
          ))}
        </div>
        <div className={cn(CARD, "p-4")}>
          <MicroLabel>Why the earliest age is not where the line crosses</MicroLabel>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Stopping five years earlier is not the same target five years
            sooner. It adds five years of spending, takes five years of saving
            away, and lengthens the horizon, which pulls the safe withdrawal
            rate down and raises the pot needed. The target climbs to meet the
            pot. The age above is the first year where the pot wins against the
            target for stopping in exactly that year.
          </p>
        </div>
      </Panel>
    </div>
  );
}
