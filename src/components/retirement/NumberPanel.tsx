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
 */

import { CARD, MicroLabel, Panel, PanelHeader, Pill } from "@/components/ui/Panel";
import { Switch } from "@/components/ui/switch";
import { WhyThis } from "@/components/ui/WhyThis";
import { PercentField } from "@/components/retirement/fields";
import { Button } from "@/components/ui/button";
import { cn, currency } from "@/lib/format";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { GLOBAL_HAIRCUT_SOURCE, SWR_SOURCE } from "@/lib/retirement/swr";
import type { PlanResult, RetirementInputs } from "@/lib/retirement/plan";
import type { Provenance } from "@/lib/provenance";
import { Target } from "lucide-react";

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
          style={{ width: `${Math.max(2, Math.min(100, widthPct))}%`, background: color }}
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
}: {
  inputs: RetirementInputs;
  patch: (next: Partial<RetirementInputs>) => void;
  plan: PlanResult;
  provenance: Provenance;
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

  return (
    <Panel>
      <PanelHeader
        icon={<Target className="h-4 w-4" />}
        title={
          <span className="inline-flex items-center gap-2">
            What you need
            <WhyThis provenance={provenance} />
          </span>
        }
        subtitle={`In today's money, to stop at ${Math.round(inputs.retirementAge)} and have the money last to ${plan.planningAge}. That is ${plan.retirementYears} years of drawing.`}
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
        <p className="font-mono text-2xl tabular-nums leading-tight text-foreground">
          {currency(plan.required.target, 0, code)}
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The pot to have on the day you stop. Your first year of retirement
          takes{" "}
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
              once your pensions have started and anything temporary has ended
            </>
          ) : null}
          .
        </p>
      </div>

      {onCash ? (
        <Method
          name="Spent down to nothing"
          amount={plan.required.spendDown}
          code={code}
          widthPct={100}
          color="var(--primary)"
          lead="You are holding this in cash, so there is no order of returns to get wrong and no safe withdrawal rate to apply. This is simply every year of your plan added up."
          assumes={`cash keeps pace with inflation and earns nothing beyond it, and you spend the last of it in ${plan.planningAge}.`}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Method
            name="Runs out on the last day"
            amount={plan.required.spendDown}
            code={code}
            widthPct={(plan.required.spendDown / biggest) * 100}
            color="var(--muted-foreground)"
            lead="Exact arithmetic. Every year of your plan, discounted back at the return you chose, ending at precisely zero."
            assumes={`returns arrive at ${plan.realReturnPct.toFixed(1)}% a year after inflation, every year, in that order. Nobody's do.`}
          />
          <Method
            name="Survives a bad run"
            amount={plan.required.safeRate}
            code={code}
            widthPct={(plan.required.safeRate / biggest) * 100}
            color="var(--primary)"
            lead="What you will always spend, funded at a rate that would have survived the worst stretch in the record. Everything temporary funded out of capital on top."
            assumes={`drawing ${swr.ratePct.toFixed(2)}% a year, and that your spending never falls when markets do.`}
          />
        </div>
      )}

      {sequenceCost > 0 && !onCash ? (
        <div className={cn(CARD, "p-4")}>
          <MicroLabel>The gap, and what it buys</MicroLabel>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The difference of{" "}
            <span className="font-mono tabular-nums text-foreground">
              {currency(sequenceCost, 0, code)}
            </span>{" "}
            is not a safety margin somebody added. It is the price of not
            knowing what order your returns will arrive in. Two retirements
            with exactly the same average return, one starting into a fall and
            one into a rise, do not end in the same place once money is being
            taken out, because what is sold at the bottom is never there for
            the recovery. The spending layers further down are the cheap way
            to close most of that gap without saving another penny.
          </p>
        </div>
      ) : null}

      {onCash ? null : (
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
