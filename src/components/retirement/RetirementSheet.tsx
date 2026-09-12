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
 * AND THEN THE INPUTS THEMSELVES WERE THE WALL ANYWAY. Answering first is
 * not enough when the second thing on the page is seven panels of fields:
 * the room still READ as work, and what a reader does with a page that
 * reads as work is close it. So the default is `simple` (`detail.ts`),
 * which keeps every panel that ANSWERS something and withholds every panel
 * that ASKS something, and `QuickStart` fills the whole plan from one press
 * on a life plus the six figures nothing can guess. Nothing is unreachable:
 * the control that brings the rest back is on that same first card, and the
 * level is remembered. See `detail.ts` for why that is not the withholding
 * this repository argues against.
 *
 * THE ORDER IS ANSWER, QUESTION, THEN LESSONS, AND #250's ARGUMENT FOR IT
 * IS FOLDED IN HERE. Two sessions reached this room at once with the same
 * complaint and different halves of the answer, which this repository
 * already warns is the dangerous shape: two sound changes that merge
 * cleanly and disagree. #250's reasoning was that the grid ("what stopping
 * at each age costs") is the one table that turns a single answer into a
 * lesson about the shape of the problem, and that it and the number are the
 * only two panels honest on defaults nobody has touched, because neither
 * compares the target against what the reader actually holds. `Standing`
 * cannot: on a pot of zero it says "you have nothing, short by £697,067",
 * which is not a lesson but an alarming statement about somebody who has
 * not been asked anything yet.
 *
 * BOTH HALVES SURVIVE AND THE SECOND FAULT IS FIXED TWICE OVER. The grid,
 * the spending layers and the survival curve sit high, in that ranking,
 * because they answer without asking. And the zero pot never reaches
 * `Standing`, both because the card that asks comes before it and because
 * the room opens on a template rather than on zeroes at all.
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
import { QuickStart } from "@/components/retirement/QuickStart";
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
import { portfolioRealReturnPct, RETURNS_SOURCE } from "@/lib/retirement/returns";
import { GLOBAL_HAIRCUT_SOURCE, SWR_SOURCE } from "@/lib/retirement/swr";
import {
  atLeast,
  loadRetirementDetail,
  saveRetirementDetail,
  type RetirementDetail,
} from "@/lib/retirement/detail";
import {
  loadRetirementInputs,
  saveRetirementInputs,
} from "@/lib/retirement/state";
import {
  DEFAULT_TEMPLATE_ID,
  openingPot,
  templateById,
  templateInputs,
  type RetirementTemplateId,
} from "@/lib/retirement/templates";
import { buildTable, type TableMode } from "@/lib/retirement/table";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const EMPTY_TICKER_VALUES: Array<{ ticker: string; value: number }> = [];

export function RetirementSheet({
  portfolioValue,
  tickerValues = EMPTY_TICKER_VALUES,
  bookCash = 0,
}: {
  /** What the reader's portfolios are worth, for the pre-fill offer. */
  portfolioValue: number | null;
  /** Per-ticker value, for the same blended growth rate Compound offers. */
  tickerValues?: Array<{ ticker: string; value: number }>;
  bookCash?: number;
}) {
  const [inputs, setInputs] = useState<RetirementInputs>(() => defaultInputs());
  const [mode, setMode] = useState<TableMode>("invested");
  const [restored, setRestored] = useState(false);
  const [detail, setDetail] = useState<RetirementDetail>("simple");
  /*
    Which life is lit up, for this visit only. It is not stored with the
    plan and must not be: a template is a starting point somebody pressed
    once, and every field it filled in is theirs to change from the moment
    it lands, so a plan restored from an earlier session has no template
    any more, only the figures that came out of one.
  */
  const [templateId, setTemplateId] = useState<RetirementTemplateId | null>(null);
  const appliedDefaultPotRef = useRef(false);
  /*
    What the opening template put in the pot, or null when the reader came
    back to a plan of their own. Only ever read to tell an untouched opening
    figure from one somebody typed.
  */
  const openerPotRef = useRef<number | null>(null);
  /*
    Read inside the restore effect, which must run exactly once and so
    cannot take this as a dependency. Same reason `TrendsPanel` reads its
    own gate through a ref: widening the dependency list would re-run the
    thing the list exists to run once.
  */
  const portfolioValueRef = useRef(portfolioValue);
  portfolioValueRef.current = portfolioValue;

  /*
    The stored plan arrives after the first paint rather than during it.
    Reading `localStorage` while rendering would make the server's markup
    and the browser's first pass disagree, which React treats as a
    hydration fault and which shows up as the whole room flashing.
  */
  useEffect(() => {
    const saved = loadRetirementInputs();
    if (saved) {
      setInputs(saved);
    } else {
      /*
        Nobody has been here before, so open on a life rather than on
        zeroes. `templates.ts` says why at length; the short of it is that
        a page whose every figure is zero and whose earliest retirement age
        is "n/a" reads as a verdict on a reader who has not typed anything.
        The card it came from is lit and the panel says the figures are a
        template's until they are changed.
      */
      const opener = templateById(DEFAULT_TEMPLATE_ID);
      if (opener) {
        setInputs((prev) => {
          const life = templateInputs(opener, prev.regionId);
          /*
            The opener's pot defers to what the reader actually holds.
            `openingPot` carries the argument: this template is a guess
            nobody asked for, their holdings are a fact, and the pre-fill
            below only ever writes into an untouched zero, so without this
            the better of the two features was dead for exactly the reader
            it was written for. The pot the opener would have used is kept
            so that pre-fill can still recognise an untouched one when the
            portfolio value arrives a tick later than this effect.
          */
          openerPotRef.current = life.currentPot;
          return {
            ...life,
            currentPot: openingPot(life.currentPot, portfolioValueRef.current),
          };
        });
        setTemplateId(opener.id);
      }
    }
    setDetail(loadRetirementDetail());
    setRestored(true);
  }, []);

  /*
    A FIRST VISIT STARTS THE POT ON WHAT IS ACTUALLY HELD.

    The field's own note already offered this as a press; almost nobody
    presses a note under a field they have not decided matters yet, and the
    type comment on `currentPot` has said "pre-filled from the reader's own
    holdings" for longer than that was true. This is Compound's own pattern
    (`CompoundInterestSheet`'s `principal` effect): apply it once, only to
    the untouched default, and never overwrite a figure the reader already
    saved, because a pot already typed in is theirs, not ours to replace.
  */
  useEffect(() => {
    if (!restored || appliedDefaultPotRef.current) return;
    /*
      The one-shot mark is set only once a real figure has arrived. Setting
      it first spends the single attempt on whatever `portfolioValue` was at
      the moment the stored plan resolved, which is null on any account
      whose holdings land a tick later, and the pre-fill then never runs at
      all for them.
    */
    if (!(portfolioValue != null && portfolioValue > 0)) return;
    appliedDefaultPotRef.current = true;
    setInputs((prev) =>
      /*
        An untouched pot is a zero nobody has filled in, or the figure the
        opening template put there before this value arrived. Anything else
        is the reader's and is never overwritten.
      */
      prev.currentPot === 0 || prev.currentPot === openerPotRef.current
        ? { ...prev, currentPot: Math.round(portfolioValue) }
        : prev
    );
  }, [restored, portfolioValue]);

  useEffect(() => {
    if (!restored) return;
    saveRetirementInputs(inputs);
  }, [inputs, restored]);

  const changeDetail = useCallback((next: RetirementDetail) => {
    setDetail(next);
    saveRetirementDetail(next);
  }, []);

  /*
    The same blended growth rate Compound's "Your rate" preset uses, turned
    real. See `portfolioRealReturnPct` for why it is a preset offered beside
    the world index rather than what the page opens on.
  */
  const portfolioRatePct = useMemo(() => {
    if (tickerValues.length === 0 && bookCash === 0) return null;
    return portfolioRealReturnPct(tickerValues, bookCash);
  }, [tickerValues, bookCash]);

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
        currentAge: inputs.currentAge,
        swrPct: plan.required.swr.ratePct,
        realReturnPct: plan.realReturnPct,
        basis: plan.required.basis,
      }),
    [
      region,
      inputs.sex,
      inputs.improvementPct,
      inputs.currentAge,
      planningAge,
      plan.required.swr.ratePct,
      plan.realReturnPct,
      plan.required.basis,
    ]
  );

  const deep = atLeast(detail, "more");
  const everything = atLeast(detail, "everything");

  return (
    <div className={PANEL_STACK}>
      {/*
        THE ANSWER IS STILL FIRST, which is this room's own oldest rule and
        the one the first draft of the quick-start card broke: measured at
        390, eight template cards and six fields put the headline figure
        2,103px down, which is three screens on the device most readers
        arrive on. The card that asks comes second, and carries its own
        one-line result so a press still changes something on the screen
        the press happened on.
      */}
      <NumberPanel
        inputs={inputs}
        patch={patch}
        plan={plan}
        provenance={provenance}
        detail={detail}
      />

      <QuickStart
        inputs={inputs}
        patch={patch}
        replace={setInputs}
        portfolioValue={portfolioValue}
        detail={detail}
        onDetailChange={changeDetail}
        templateId={templateId}
        onTemplate={setTemplateId}
        result={{
          target: plan.required.target,
          earliestAge: earliest ? earliest.age : null,
        }}
      />

      {deep ? <PlanInputs inputs={inputs} patch={patch} /> : null}

      {/*
        The grid asks nothing and teaches the one thing a single answer
        cannot, so it leads the panels that follow the question.

        IT KEEPS ITS FOLD, AND THAT IS WHERE THIS ORDER PARTS FROM #250.
        That change put the grid second, right under the number, and took
        the wrapper off on the sound argument that a section starting at
        the fold gets nothing from a wrapper whose lead is a whole screen.
        The card that asks now sits between them, so the offset is not the
        same offset: measured at 390 in the app's own CSS, the grid begins
        at 2,747px and the spending layers at 6,010, against a fold at 800,
        and rendering both eagerly took the room from 360 elements to 532.
        The rule for a fold is the offset, and on this order both are three
        screens and seven screens down. The reserves stay deliberately
        short of the measured 1,001px and 1,142px, because a short reserve
        only settles the scrollbar where a long one is the empty block the
        deferral rule forbids.
      */}
      <BelowFold reserve={520}>
        <GridPanel
          inputs={inputs}
          plan={plan}
          rows={rows}
          mode={mode}
          onModeChange={setMode}
        />
      </BelowFold>

      <StandingPanel
        inputs={inputs}
        plan={plan}
        milestones={milestones}
        earliest={earliest}
      />

      <BelowFold reserve={480}>
        <FlexiblePanel plan={plan} />
      </BelowFold>

      <LongevityPanel
        inputs={inputs}
        patch={patch}
        result={longevity}
        planningAge={planningAge}
        showControls={deep}
      />

      {deep ? (
        <BelowFold reserve={420}>
          <BridgePanel inputs={inputs} plan={plan} />
        </BelowFold>
      ) : null}

      {everything ? (
        <BelowFold reserve={560}>
          <AssumptionsPanel
            inputs={inputs}
            patch={patch}
            portfolioRatePct={portfolioRatePct}
          />
        </BelowFold>
      ) : null}
    </div>
  );
}
