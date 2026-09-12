"use client";

/**
 * THE RETIREMENT ROOM.
 *
 * It holds the plan, runs the arithmetic, and hands each panel the slice it
 * draws. Nothing in here calculates anything: every figure comes out of
 * `src/lib/retirement/`, which is pure and tested, so a panel cannot quietly
 * disagree with the panel above it.
 *
 * ORDERED ANSWER FIRST. A reader who arrives at a wall of forty inputs and
 * has to fill them in before seeing anything closes the tab. So the number
 * is at the top, computed from their country's published figures on the
 * first paint, and everything below it is the argument and the controls.
 * They can change one input and watch the top move, which is also the only
 * way anybody learns what an assumption is worth.
 *
 * THE POT IS PRE-FILLED FROM WHAT THEY ACTUALLY HOLD, and that is the one
 * thing this module can do that a spreadsheet cannot. Offered rather than
 * written in, because a portfolio is not necessarily retirement money and
 * silently treating it as such would be this app deciding something about
 * somebody's money on their behalf.
 *
 * EVERY EXPENSIVE THING IS MEMOISED ON WHAT IT ACTUALLY READS. The survival
 * curve is a thousand steps of numerical integration and does not care what
 * the reader typed in the rent field; recomputing it on every keystroke of
 * every money input would make the page stutter for an answer that has not
 * changed. `earliestRetirement` runs a whole plan per candidate year and is
 * deferred for the same reason.
 */

import { BelowFold } from "@/components/BelowFold";
import { AssumptionsPanel } from "@/components/retirement/AssumptionsPanel";
import { BridgePanel } from "@/components/retirement/BridgePanel";
import { FlexiblePanel } from "@/components/retirement/FlexiblePanel";
import { GridPanel } from "@/components/retirement/GridPanel";
import { LongevityPanel } from "@/components/retirement/LongevityPanel";
import { NumberPanel } from "@/components/retirement/NumberPanel";
import { PlanInputs } from "@/components/retirement/PlanInputs";
import { StandingPanel } from "@/components/retirement/StandingPanel";
import { PANEL_STACK } from "@/components/ui/Panel";
import { retirementProvenance } from "@/lib/provenance";
import { assessLongevity, e65For } from "@/lib/retirement/longevity";
import { buildMilestones } from "@/lib/retirement/milestones";
import {
  buildPlan,
  defaultInputs,
  earliestRetirement,
  planningAgeFor,
  type RetirementInputs,
} from "@/lib/retirement/plan";
import {
  regionById,
  UK_STANDARDS_SOURCE,
} from "@/lib/retirement/regions";
import { RETURNS_SOURCE } from "@/lib/retirement/returns";
import { GLOBAL_HAIRCUT_SOURCE, SWR_SOURCE } from "@/lib/retirement/swr";
import {
  loadRetirementInputs,
  saveRetirementInputs,
} from "@/lib/retirement/state";
import { buildTable, type TableMode } from "@/lib/retirement/table";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";

export function RetirementSheet({
  portfolioValue,
}: {
  /** What the reader's portfolios are worth, for the pre-fill offer. */
  portfolioValue: number | null;
}) {
  const [inputs, setInputs] = useState<RetirementInputs>(() => defaultInputs());
  const [mode, setMode] = useState<TableMode>("invested");
  const [restored, setRestored] = useState(false);

  /*
    The stored plan arrives after the first paint rather than during it.
    Reading `localStorage` while rendering would make the server's markup
    and the browser's first pass disagree, which React treats as a
    hydration fault and which shows up as the whole room flashing.
  */
  useEffect(() => {
    const saved = loadRetirementInputs();
    if (saved) setInputs(saved);
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    saveRetirementInputs(inputs);
  }, [inputs, restored]);

  const patch = useCallback(
    (next: Partial<RetirementInputs>) =>
      setInputs((prev) => ({ ...prev, ...next })),
    []
  );

  const region = regionById(inputs.regionId);

  /*
    Keyed on exactly the four things the curve reads. The rent, the
    children and every money field are deliberately not in this list.
  */
  const longevity = useMemo(
    () =>
      assessLongevity({
        currentAge: inputs.currentAge,
        e65Male: region.e65Male,
        e65Female: region.e65Female,
        sex: inputs.sex,
        improvementPct: inputs.improvementPct,
      }),
    [inputs.currentAge, inputs.sex, inputs.improvementPct, region.e65Male, region.e65Female]
  );

  const plan = useMemo(
    () => buildPlan(inputs, longevity.suggestedPlanningAge),
    [inputs, longevity.suggestedPlanningAge]
  );

  const planningAge = planningAgeFor(inputs, longevity.suggestedPlanningAge);

  const milestones = useMemo(
    () =>
      buildMilestones({
        inputs,
        suggestedPlanningAge: longevity.suggestedPlanningAge,
        target: plan.required.target,
        currentPot: inputs.currentPot + inputs.otherSavings,
        ledger: plan.ledger,
        retirementAge: Math.round(inputs.retirementAge),
      }),
    [inputs, longevity.suggestedPlanningAge, plan.required.target, plan.ledger]
  );

  /*
    Deferred, not memoised away: it runs a whole plan for every candidate
    year, so on a slow phone it is the one thing here that could be felt
    while somebody is dragging a slider. The rest of the page stays live
    and this catches up a frame later.
  */
  const settled = useDeferredValue(inputs);
  const earliest = useMemo(
    () => earliestRetirement(settled, longevity.suggestedPlanningAge),
    [settled, longevity.suggestedPlanningAge]
  );

  const rows = useMemo(
    () =>
      buildTable({
        inputs: settled,
        suggestedPlanningAge: longevity.suggestedPlanningAge,
        mode,
      }),
    [settled, longevity.suggestedPlanningAge, mode]
  );

  const provenance = useMemo(
    () =>
      retirementProvenance({
        regionName: region.name,
        standardsSource: UK_STANDARDS_SOURCE,
        returnsSource: RETURNS_SOURCE,
        swrSource: SWR_SOURCE,
        haircutSource: GLOBAL_HAIRCUT_SOURCE,
        statePensionSource: region.statePensionSource,
        e65: e65For({
          e65Male: region.e65Male,
          e65Female: region.e65Female,
          sex: inputs.sex,
        }),
        planningAge,
        improvementPct: inputs.improvementPct,
        swrPct: plan.required.swr.ratePct,
        realReturnPct: plan.realReturnPct,
        basis: plan.required.basis,
      }),
    [
      region,
      inputs.sex,
      inputs.improvementPct,
      planningAge,
      plan.required.swr.ratePct,
      plan.realReturnPct,
      plan.required.basis,
    ]
  );

  return (
    <div className={PANEL_STACK}>
      <NumberPanel
        inputs={inputs}
        patch={patch}
        plan={plan}
        provenance={provenance}
      />

      <PlanInputs inputs={inputs} patch={patch} portfolioValue={portfolioValue} />

      <StandingPanel
        inputs={inputs}
        plan={plan}
        milestones={milestones}
        earliest={earliest}
      />

      <LongevityPanel
        inputs={inputs}
        patch={patch}
        result={longevity}
        planningAge={planningAge}
      />

      <BelowFold reserve={520}>
        <GridPanel
          inputs={inputs}
          plan={plan}
          rows={rows}
          mode={mode}
          onModeChange={setMode}
        />
      </BelowFold>

      <BelowFold reserve={480}>
        <FlexiblePanel plan={plan} />
      </BelowFold>

      <BelowFold reserve={420}>
        <BridgePanel inputs={inputs} plan={plan} />
      </BelowFold>

      <BelowFold reserve={560}>
        <AssumptionsPanel inputs={inputs} patch={patch} />
      </BelowFold>
    </div>
  );
}
