"use client";

/**
 * A POT THAT IS MEANT TO RUN OUT, WHICH IS A PLAN NOTHING ELSE HERE MODELS.
 *
 * Not every stretch of money has to last forever, and treating every one as
 * if it does makes people save for a problem they do not have. Three real
 * cases and they are all the same arithmetic. Somebody stopping at 50 whose
 * pension unlocks at 57 needs seven years and then has a different problem.
 * Somebody taking two years out. Somebody who wants to know what a known
 * number of years of a known income actually costs.
 *
 * The thing worth printing here is the implied first year rate, because it
 * is what stops the reader thinking the page contradicts itself. A seven
 * year bridge takes about fifteen per cent of its pot in year one. Next to
 * a safe withdrawal rate of three that looks reckless and is simply correct:
 * one number is for a pot that must survive forever and the other is for a
 * pot with a known end date. Naming the difference is the whole panel.
 */

import { CARD, MicroLabel, Panel, PanelHeader, Score, Scoreboard } from "@/components/ui/Panel";
import { ChoiceField, CountField, MonthlyMoneyField, PercentField, currencyCodeFor } from "@/components/retirement/fields";
import { cn, currency } from "@/lib/format";
import {
  fixedHorizonPot,
  impliedFirstYearRate,
  type DrawTiming,
} from "@/lib/retirement/swr";
import type { PlanResult, RetirementInputs } from "@/lib/retirement/plan";
import { Route } from "lucide-react";
import { useMemo, useState } from "react";

export function BridgePanel({
  inputs,
  plan,
}: {
  inputs: RetirementInputs;
  plan: PlanResult;
}) {
  const code = currencyCodeFor(plan.currency);
  /*
    The gap between stopping and the pension starting, where there is one.
    `Math.max(1, ...)` here was a bug worth remembering: it turned a reader
    who stops exactly at pension age, which is the default, into a one year
    bridge rather than falling through to the seven year example. The clamp
    belongs after the fallback, not before it.
  */
  const bridgeYears = Math.round(inputs.statePensionAge - inputs.retirementAge);
  const defaultYears = bridgeYears > 0 ? bridgeYears : 7;
  const defaultDraw = Math.round(
    plan.firstYearFromPot > 0 ? plan.firstYearFromPot : 30_000
  );
  const [years, setYears] = useState(defaultYears);
  const [draw, setDraw] = useState(defaultDraw);

  /*
    These open on the plan above and then belong to the reader, which
    means they go stale the moment the plan moves.

    This panel sits behind a fold, so it mounts with whatever the plan said
    when it was first scrolled to and never hears about a change after
    that. Somebody who then brings their retirement age forward from 67 to
    52 has just created a fifteen year bridge and is looking at a panel
    still answering the old question, with nothing on screen saying so.

    Re-syncing on every change is the wrong fix: it would throw away what
    the reader typed here every time they touched a field elsewhere. So the
    panel says the two disagree and offers one press to catch up, which is
    the same shape as the planning age control further up.
  */
  const stale = years !== defaultYears || draw !== defaultDraw;
  const [ratePct, setRatePct] = useState(2);
  const [timing, setTiming] = useState<DrawTiming>("start");

  const pot = useMemo(
    () => fixedHorizonPot({ annualDraw: draw, years, realReturnPct: ratePct, timing }),
    [draw, years, ratePct, timing]
  );
  const implied = impliedFirstYearRate(draw, pot);

  return (
    <Panel>
      <PanelHeader
        icon={<Route className="h-4 w-4" />}
        title="A pot meant to run out"
        subtitle="For a stretch with an end date: the years before a pension starts, a career break, anything with a fixed length."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <MonthlyMoneyField
          label="You take out, a month"
          value={draw}
          currency={code}
          onChange={setDraw}
          note="In today's money."
        />
        <CountField
          label="For how many years"
          value={years}
          min={1}
          max={60}
          suffix="years"
          onChange={setYears}
          note={
            bridgeYears > 0
              ? `Opened on the ${bridgeYears} years between stopping at ${Math.round(inputs.retirementAge)} and your pension at ${Math.round(inputs.statePensionAge)}.`
              : "Your pension starts the year you stop, so there is no gap unless you retire earlier."
          }
        />
        <PercentField
          label="It earns, a year"
          value={ratePct}
          digits={2}
          onChange={setRatePct}
          note="After inflation. Money needed inside a decade is usually held cautiously, so this opens low."
        />
        <ChoiceField<DrawTiming>
          label="Taken at the"
          value={timing}
          options={[
            { id: "start", label: "Start of the year" },
            { id: "end", label: "End of the year" },
          ]}
          onChange={setTiming}
          note="Taking it at the start costs more, because that money never earns anything."
        />
      </div>

      {stale ? (
        <button
          type="button"
          onClick={() => {
            setYears(defaultYears);
            setDraw(defaultDraw);
          }}
          className="self-start text-left text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Your plan above now says{" "}
          {bridgeYears > 0
            ? `${bridgeYears} years at ${currency(defaultDraw / 12, 0, plan.currency)} a month`
            : `${currency(defaultDraw / 12, 0, plan.currency)} a month`}
          . Press to use that instead.
        </button>
      ) : null}

      <Scoreboard cols={2} mobileCols={1}>
        <Score
          label="The pot it needs"
          value={
            <span className="font-mono tabular-nums">{currency(pot, 0, plan.currency)}</span>
          }
          sub={`${currency(draw / 12, 0, plan.currency)} a month for ${years} years, ending at nothing.`}
        />
        <Score
          label="Which is a first year rate of"
          value={<span className="font-mono tabular-nums">{implied.toFixed(2)}%</span>}
          sub={`Against ${plan.required.swr.ratePct.toFixed(2)}% for the lifetime plan above.`}
        />
      </Scoreboard>

      <div className={cn(CARD, "p-4")}>
        <MicroLabel>Why that rate is not reckless</MicroLabel>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          A safe withdrawal rate is for a pot that must survive forever. This
          one has a known end date and is meant to reach it empty, so the two
          figures are not comparable.
        </p>
      </div>
    </Panel>
  );
}
