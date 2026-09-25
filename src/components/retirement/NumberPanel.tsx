"use client";

/**
 * The answer, and the two ways of getting it.
 *
 * Every other calculator prints one number here. This prints two, and the
 * gap between them is the most useful thing on the page.
 *
 * The smaller one is exact: the present value of every year's shortfall at
 * the return the reader chose, ending at precisely zero on the last day.
 * It is right if returns arrive at the assumed rate, which they will not.
 *
 * The larger one funds the spending that never goes away at a rate built to
 * survive the worst run in the historical record, and funds everything with
 * an end date out of capital on top. It is what the plan is judged against.
 *
 * A reader who sees only the first will save too little and will never know
 * why it went wrong. A reader who sees only the second is being asked for a
 * large number with no explanation of where the conservatism came from. Both,
 * with the difference named, is the only honest version.
 *
 * AT `simple` BOTH FIGURES ARE STILL STATED AND THE GAP IS STILL NAMED, in
 * one sentence rather than in two cards and a paragraph. That is the line
 * the detail levels may not cross: what may be folded away is the working,
 * never a number the headline is being chosen over. A page that showed one
 * pot and mentioned no other would be picking the flattering arithmetic and
 * hiding that it had picked.
 */

import { CARD, MicroLabel, Panel, PanelHeader, Pill } from "@/components/ui/Panel";
import { Switch } from "@/components/ui/switch";
import { WhyThis } from "@/components/ui/WhyThis";
import { PercentField } from "@/components/retirement/fields";
import { Button } from "@/components/ui/button";
import { barFillPct, cn, currency } from "@/lib/format";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { GLOBAL_HAIRCUT_SOURCE, SWR_SOURCE } from "@/lib/retirement/swr";
import type { PlanResult, PotCurvePoint, RetirementInputs } from "@/lib/retirement/plan";
import { PotChart } from "@/components/retirement/PotChart";
import type { Provenance } from "@/lib/provenance";
import { RETIREMENT_RESULTS_ID } from "@/lib/retirement/dom-ids";
import { ArrowDown, Target } from "lucide-react";

function Method({
  name,
  amount,
  code,
  lead,
  assumes,
  widthPct,
  color,
}: {
  name: string;
  amount: number;
  code: string;
  lead: string;
  assumes: string;
  widthPct: number;
  color: string;
}) {
  return (
    <div className={cn(CARD, "flex min-w-0 flex-col gap-2 p-4")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold text-foreground">{name}</span>
        <span className="font-mono text-xl tabular-nums text-foreground">
          {currency(amount, 0, code)}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        aria-hidden
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${barFillPct(widthPct, 2)}%`, background: color }}
        />
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{lead}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        <span className="font-mono uppercase tracking-[0.1em]">Assumes </span>
        {assumes}
      </p>
    </div>
  );
}

export function NumberPanel({
  inputs,
  patch,
  plan,
  provenance,
  showWorking,
  curve,
  earliestAge,
  onRetirementAge,
}: {
  inputs: RetirementInputs;
  patch: (next: Partial<RetirementInputs>) => void;
  plan: PlanResult;
  provenance: Provenance;
  /** The "How it is worked out" chip is ticked: show the arithmetic here. */
  showWorking: boolean;
  /** Have against need at every age, from `potCurve`. */
  curve: PotCurvePoint[];
  earliestAge: number | null;
  onRetirementAge: (age: number) => void;
}) {
  const code = plan.currency;
  const { swr } = plan.required;
  const biggest = Math.max(plan.required.safeRate, plan.required.spendDown, 1);
  const sequenceCost = plan.required.safeRate - plan.required.spendDown;
  /*
    A reader holding nothing but cash is answered on the spend-down figure,
    because a safe withdrawal rate is a statement about the order returns
    arrive in and cash has no order to get wrong. `buildPlan` makes that
    choice; this panel only has to stop telling them about a rate that is
    not being used on their plan, which would be the page contradicting
    its own headline.
  */
  const onCash = plan.required.basis === "spendDown";
  const showRateBuild = showWorking;

  return (
    <Panel>
      {/*
        EVERY INPUT PANEL NOW SITS ABOVE THE RESULTS TABLE, ON PURPOSE, WHICH
        MEANS OPENING A DEEPER LEVEL PUSHES IT FURTHER DOWN THE PAGE. The
        panels that ask ("Your home", "What the money earns", the survival
        curve's own dials, "A pot meant to run out") used to be split either
        side of the table: some above it, some below, so a level change
        sometimes moved the table and sometimes did not, and a control this
        app was still asking about sat under the numbers it feeds. Every one
        of them moved above the table instead. The honest cost is a table
        that can sit several screens down at the deepest level, so this
        button is the answer: always visible, because it lives on the one
        panel that never moves.
      */}
      <PanelHeader
        icon={<Target className="h-4 w-4" />}
        title={
          <span className="inline-flex items-center gap-2">
            What you need
            <WhyThis provenance={provenance} />
          </span>
        }
        subtitle={`To stop at ${Math.round(inputs.retirementAge)} and last to ${plan.planningAge}, in today's money.`}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              document
                .getElementById(RETIREMENT_RESULTS_ID)
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            See the results table
            <ArrowDown className="h-3.5 w-3.5" aria-hidden />
          </Button>
        }
      />

      <div className={cn(CARD, "flex flex-col gap-2 p-5")}>
        <MicroLabel>Your number</MicroLabel>
        {/*
          `text-2xl` is the top of this app's type ladder and the headline
          figure sits on it like every other figure in the product. The
          instinct on a page whose whole point is one number is to reach
          past it; the company room already recorded that the answer is to
          shrink what is around it rather than to grow this, and the
          invariant refuses anything larger.
        */}
        <p className="figure-hero text-foreground">
          {currency(plan.required.target, 0, code)}
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The pot to have on the day you stop. Year one takes{" "}
          <span className="font-mono tabular-nums text-foreground">
            {currency(plan.firstYearFromPot, 0, code)}
          </span>{" "}
          out of it
          {plan.lifelongFromPot < plan.firstYearFromPot * 0.95 ? (
            <>
              , falling to{" "}
              <span className="font-mono tabular-nums text-foreground">
                {currency(plan.lifelongFromPot, 0, code)}
              </span>{" "}
              once pensions start
            </>
          ) : null}
          .
        </p>
      </div>

      {curve.length > 1 ? (
        <PotChart
          curve={curve}
          retirementAge={Math.round(inputs.retirementAge)}
          earliestAge={earliestAge}
          onRetirementAge={onRetirementAge}
          code={code}
        />
      ) : null}

      {!showWorking ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {onCash ? (
            <>
              Cash held in a savings account, spent to nothing by{" "}
              {plan.planningAge}.
            </>
          ) : (
            <>
              Built to survive a bad run of markets. A plan that assumes
              returns arrive on schedule only needs{" "}
              <span className="font-mono tabular-nums text-foreground">
                {currency(plan.required.spendDown, 0, code)}
              </span>
              . The gap is the price of not knowing what order returns will
              come in.
            </>
          )}
        </p>
      ) : onCash ? (
        <Method
          name="Spent down to nothing"
          amount={plan.required.spendDown}
          code={code}
          widthPct={100}
          color="var(--primary)"
          lead="Held in cash, so there is no order of returns to get wrong and no rate to apply."
          assumes={`cash returns ${plan.realReturnPct.toFixed(2)}% a year after inflation, spent to nothing by ${plan.planningAge}.`}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Method
            name="Runs out on the last day"
            amount={plan.required.spendDown}
            code={code}
            widthPct={(plan.required.spendDown / biggest) * 100}
            color="var(--muted-foreground)"
            lead="Exact arithmetic, ending at precisely zero."
            assumes={`returns arrive at ${plan.realReturnPct.toFixed(1)}% a year, every year, in that order. Nobody's do.`}
          />
          <Method
            name="Survives a bad run"
            amount={plan.required.safeRate}
            code={code}
            widthPct={(plan.required.safeRate / biggest) * 100}
            color="var(--primary)"
            lead="Funded at a rate built to survive the worst stretch in the record."
            assumes={`drawing ${swr.ratePct.toFixed(2)}% a year.`}
          />
        </div>
      )}

      {showWorking && sequenceCost > 0 && !onCash ? (
        <div className={cn(CARD, "p-4")}>
          <MicroLabel>The gap, and what it buys</MicroLabel>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The extra{" "}
            <span className="font-mono tabular-nums text-foreground">
              {currency(sequenceCost, 0, code)}
            </span>{" "}
            is not a margin somebody added. Two retirements with the same
            average return end up in different places if one starts into a
            fall, because what is sold at the bottom never gets a recovery.
            The spending layers below close most of that gap for free.
          </p>
        </div>
      ) : null}

      {onCash || !showRateBuild ? null : (
      <div className={cn(CARD, "flex flex-col gap-4 p-4")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <MicroLabel>How the withdrawal rate was built</MicroLabel>
          <Pill tone="neutral">
            <span className="font-mono tabular-nums">{swr.ratePct.toFixed(2)}%</span>
          </Pill>
        </div>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="min-w-0 text-muted-foreground">
              Published rate for {swr.years} years of drawing
            </dt>
            <dd className="shrink-0 font-mono tabular-nums text-foreground">
              {swr.historicalPct.toFixed(2)}%
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="min-w-0 text-muted-foreground">
              For using the world&apos;s markets, not America&apos;s
            </dt>
            <dd className="shrink-0 font-mono tabular-nums text-loss">
              {swr.haircutPct > 0 ? `-${swr.haircutPct.toFixed(2)}%` : "off"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="min-w-0 text-muted-foreground">
              For what your platform and funds charge
            </dt>
            <dd className="shrink-0 font-mono tabular-nums text-loss">
              -{swr.feePct.toFixed(2)}%
            </dd>
          </div>
        </dl>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {SWR_SOURCE} {GLOBAL_HAIRCUT_SOURCE}
        </p>
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="min-w-0 text-sm text-muted-foreground">
            Take the half point off for investing globally
          </span>
          <Switch
            checked={inputs.globalHaircut}
            onCheckedChange={(globalHaircut) => patch({ globalHaircut })}
          />
        </label>
        {swr.isOverride ? (
          <div className="flex flex-wrap items-end gap-3">
            <PercentField
              label="Your own rate"
              value={inputs.swrOverridePct ?? swr.ratePct}
              onChange={(swrOverridePct) => patch({ swrOverridePct })}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => patch({ swrOverridePct: null })}
            >
              Put it back
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => patch({ swrOverridePct: Number(swr.ratePct.toFixed(2)) })}
          >
            Set the rate yourself
          </Button>
        )}
      </div>
      )}

      <p className="text-xs text-muted-foreground">{ADVICE_DISCLAIMER_SHORT}</p>
    </Panel>
  );
}
