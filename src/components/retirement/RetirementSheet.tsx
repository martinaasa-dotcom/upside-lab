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
 * not been asked anything yet. And the zero pot never reaches `Standing`,
 * both because the card that asks comes before it and because the room
 * opens on a template rather than on zeroes at all.
 *
 * AND EVERY PANEL THAT ASKS SITS ABOVE THE RESULTS TABLE, NEVER BELOW IT,
 * WHICH IS A DIFFERENT RULE FROM THE ONE ABOVE AND HAD BEEN QUIETLY BROKEN.
 * "Answer, question, then lessons" said nothing about where a panel that
 * both asks and teaches belongs, so `LongevityPanel` (a chart plus, at a
 * deeper level, three dials), `BridgePanel` and the old `AssumptionsPanel`
 * had all drifted to the foot of the page, under the grid, under the
 * ladder, under the spending layers. A reader who opened "Everything" to
 * correct their own mix or their own bridge years was editing a figure the
 * table above it had already been drawn from, with no way to see the table
 * react without scrolling back up. Nothing that can `patch()` the plan may
 * sit after `GridPanel` now: `PlanInputs`, `ReturnsPanel`, `LongevityPanel`
 * and `BridgePanel` all moved above it, in that order, so the table, the
 * ladder and the spending layers are the last three things on the page
 * whatever the detail level. `StandingPanel` and `FlexiblePanel` read the
 * plan and answer; neither writes to it, so both stay put. `AssumptionsPanel`
 * is documentation rather than a lever now (its levers moved into
 * `ReturnsPanel`; see that file), so it stays folded near the foot of this
 * group, at "Everything" only.
 *
 * THE HONEST COST OF THAT IS A TABLE THAT CAN SIT SEVERAL SCREENS DOWN AT
 * THE DEEPEST LEVEL, since opening "More" or "Everything" now pushes every
 * result down rather than only some of them. `NumberPanel`'s own header
 * carries a "See the results table" button for exactly that reason: it is
 * the one panel that never moves, so the way back to the numbers is always
 * on screen. The table's own `id` (`RETIREMENT_RESULTS_ID`, in
 * `dom-ids.ts`) is why `GridPanel` can no longer be wrapped in `BelowFold`
 * — an anchor landing on an unmounted placeholder is a button that looks
 * like it works and does not, which `BelowFold`'s own doc already forbids.
 *
 * THE POT IS PRE-FILLED FROM WHAT THEY ACTUALLY HOLD, and that is the one
 * thing this module can do that a spreadsheet cannot. Offered rather than
 * written in, because a portfolio is not necessarily retirement money and
 * silently treating it as such would be this app deciding something about
 * somebody's money on their behalf.
 *
 * AND THAT REAL FIGURE NOW SURVIVES A TEMPLATE PRESS, WHICH IT USED NOT TO.
 * `templates.ts` used to insist a press was a deliberate request for a
 * template's own fictional pot; in practice it meant every card handed a
 * reader somebody else's savings. `potSource` is which real portfolio (or
 * their combined total, or a figure they typed themselves) that pre-fill
 * tracks, and `applyTemplate` reads it on every press through
 * `resolvedPotOverride` (`pot-source.ts`), so no life on this page ever
 * opens on a made-up number while a real one is sitting there. A reader
 * with more than one portfolio can name which one this plan is for; the
 * picker lives beside the field in `QuickStart`.
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
import {
  AssumptionsPanel,
  ReturnsPanel,
} from "@/components/retirement/AssumptionsPanel";
import { BridgePanel } from "@/components/retirement/BridgePanel";
import { FlexiblePanel } from "@/components/retirement/FlexiblePanel";
import { GridPanel } from "@/components/retirement/GridPanel";
import { LongevityPanel } from "@/components/retirement/LongevityPanel";
import { NumberPanel } from "@/components/retirement/NumberPanel";
import {
  CarTopic,
  ChildrenTopic,
  HomeTopic,
  IncomeTopic,
  SavingsTopic,
} from "@/components/retirement/PlanInputs";
import { StandingPanel } from "@/components/retirement/StandingPanel";
import { PANEL_STACK } from "@/components/ui/Panel";
import { retirementProvenance } from "@/lib/provenance";
import { assessLongevity, e65For } from "@/lib/retirement/longevity";
import { buildMilestones } from "@/lib/retirement/milestones";
import {
  buildPlan,
  defaultInputs,
  planningAgeFor,
  potCurve,
  retargetRetirementAge,
  type RetirementInputs,
} from "@/lib/retirement/plan";
import {
  regionById,
  UK_STANDARDS_SOURCE,
} from "@/lib/retirement/regions";
import {
  holdingsReturnView,
  PORTFOLIO_RATE_CEILING_PCT,
  REAL_RETURN_ASSUMPTIONS,
  RETURNS_SOURCE,
} from "@/lib/retirement/returns";
import { GLOBAL_HAIRCUT_SOURCE, SWR_SOURCE } from "@/lib/retirement/swr";
import {
  loadOpenTopics,
  saveOpenTopics,
  toggleTopic,
  type AdjustTopic,
} from "@/lib/retirement/adjust";
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
import {
  POT_SOURCE_BOOK,
  potSourceValue,
  resolvedPotOverride,
  type PortfolioPotOption,
} from "@/lib/retirement/pot-source";
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
const EMPTY_SHEETS: PortfolioPotOption[] = [];

export function RetirementSheet({
  portfolioValue,
  sheets = EMPTY_SHEETS,
  tickerValues = EMPTY_TICKER_VALUES,
  bookCash = 0,
}: {
  /** What the reader's portfolios are worth, for the pre-fill offer. */
  portfolioValue: number | null;
  /** One portfolio each, for a reader who wants to pick rather than combine. */
  sheets?: PortfolioPotOption[];
  /** Per-ticker value, for the same blended growth rate Compound offers. */
  tickerValues?: Array<{ ticker: string; value: number }>;
  bookCash?: number;
}) {
  const [inputs, setInputs] = useState<RetirementInputs>(() => defaultInputs());
  const [mode, setMode] = useState<TableMode>("invested");
  const [restored, setRestored] = useState(false);
  const [open, setOpen] = useState<AdjustTopic[]>([]);
  /*
    Which life is lit up, for this visit only. It is not stored with the
    plan and must not be: a template is a starting point somebody pressed
    once, and every field it filled in is theirs to change from the moment
    it lands, so a plan restored from an earlier session has no template
    any more, only the figures that came out of one.
  */
  const [templateId, setTemplateId] = useState<RetirementTemplateId | null>(null);
  /*
    Which real portfolio the pot tracks: the combined total, one portfolio
    by id, or `custom` once the reader has typed a figure of their own. Also
    not stored with the plan, for the same reason `templateId` is not: it
    is a choice about how THIS visit's figure was arrived at, not a fact
    about the reader's life.
  */
  const [potSource, setPotSource] = useState<string>(POT_SOURCE_BOOK);
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
    setOpen(loadOpenTopics());
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

  const toggle = useCallback((topic: AdjustTopic) => {
    setOpen((prev) => {
      const next = toggleTopic(prev, topic);
      saveOpenTopics(next);
      return next;
    });
  }, []);

  /*
    A press names a whole new life, and the one figure that life must never
    carry is a made-up pot when a real one is sitting right there. The
    selected source wins when it names a real portfolio; anything else
    still falls back to the reader's combined total, which is what
    `resolvedPotOverride` is for. `templateInputs` itself never changes,
    so the template's own tuned arithmetic is intact for the one case that
    still needs it, an account with nothing real to hold at all.
  */
  const applyTemplate = useCallback(
    (id: RetirementTemplateId) => {
      const template = templateById(id);
      if (!template) return;
      const life = templateInputs(template, inputs.regionId);
      const override = resolvedPotOverride(potSource, portfolioValue, sheets);
      setInputs({ ...life, currentPot: openingPot(life.currentPot, override) });
      setTemplateId(id);
      /*
        The picker has to keep telling the truth. `potSource` only falls
        back to the combined total when it was pointed at `custom` or at a
        portfolio that no longer names anything real; left alone, the
        select would still read "Type your own figure" over a field that
        now shows the reader's real total, which is a control lying about
        what it is showing.
      */
      if (potSourceValue(potSource, portfolioValue, sheets) == null && override != null) {
        setPotSource(POT_SOURCE_BOOK);
      }
    },
    [inputs.regionId, potSource, portfolioValue, sheets]
  );

  /*
    Switching which portfolio the pot tracks writes the figure straight
    into the plan, the same way pressing "book" in Compound's own principal
    picker does. `custom` is never applied here: it means the reader is
    about to type, or already has, and this function is never the one that
    should be moving that field.
  */
  const changePotSource = useCallback(
    (source: string) => {
      setPotSource(source);
      const value = potSourceValue(source, portfolioValue, sheets);
      if (value != null) {
        setInputs((prev) => ({ ...prev, currentPot: Math.round(value) }));
      }
    },
    [portfolioValue, sheets]
  );

  /*
    The same growth outlook Growth's "Yours" shows for these holdings,
    before and after inflation. Offered in the picker and never applied on
    its own: see `holdingsReturnView` for why the plan opens on the world
    index and why this figure is no longer capped.
  */
  const holdingsView = useMemo(() => {
    if (tickerValues.length === 0 && bookCash === 0) return null;
    return holdingsReturnView(tickerValues, bookCash);
  }, [tickerValues, bookCash]);

  /*
    THE PLAN OPENS ON THE READER'S OWN HOLDINGS, ONCE THERE ARE ANY
    (Martin's call, 2026-09-25, matching Growth's "Yours").

    Runs once, the same shape as the pot pre-fill above: only while the
    plan still sits on the untouched world-index default, and only once the
    outlook has actually arrived, which can be a tick after the stored plan
    resolves. A reader who typed a figure or pressed a preset keeps it. The
    figure is uncapped because it is the same one Growth prints; the line
    under the picker says what it is and, past what any market has held for
    a lifetime, says that too.
  */
  const appliedDefaultRateRef = useRef(false);
  useEffect(() => {
    if (!restored || appliedDefaultRateRef.current) return;
    if (holdingsView == null) return;
    appliedDefaultRateRef.current = true;
    setInputs((prev) =>
      Math.abs(prev.returns.equityPct - REAL_RETURN_ASSUMPTIONS.equityPct) < 0.05 ||
      Math.abs(prev.returns.equityPct - PORTFOLIO_RATE_CEILING_PCT) < 0.05
        ? { ...prev, returns: { ...prev.returns, equityPct: holdingsView.realPct } }
        : prev
    );
  }, [restored, holdingsView]);

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
  /*
    The chart's two lines and the earliest age come from one loop, so the
    crossing drawn and the age named cannot disagree.
  */
  const curve = useMemo(
    () => potCurve(settled, longevity.suggestedPlanningAge),
    [settled, longevity.suggestedPlanningAge]
  );
  const earliest = useMemo(() => {
    const hit = curve.find((p) => p.need > 0 && p.have >= p.need);
    return hit ? { age: hit.age, pot: hit.have, required: hit.need } : null;
  }, [curve]);

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

  const isOpen = (topic: AdjustTopic) => open.includes(topic);
  const close = (topic: AdjustTopic) => () => toggle(topic);

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
        showWorking={isOpen("working")}
        curve={curve}
        earliestAge={earliest ? earliest.age : null}
        onRetirementAge={(age) =>
          setInputs((prev) => retargetRetirementAge(prev, age))
        }
      />

      <QuickStart
        inputs={inputs}
        patch={patch}
        replace={setInputs}
        portfolioValue={portfolioValue}
        sheets={sheets}
        potSource={potSource}
        onPotSourceChange={changePotSource}
        open={open}
        onToggle={toggle}
        planningAge={planningAge}
        swrPct={plan.required.swr.ratePct}
        templateId={templateId}
        onTemplate={applyTemplate}
        holdingsView={holdingsView}
        result={{
          target: plan.required.target,
          earliestAge: earliest ? earliest.age : null,
        }}
      />

      {/*
        EVERY PANEL BELOW THIS POINT AND ABOVE THE RESULTS TABLE CAN CHANGE
        THE PLAN. `PlanInputs`, the return assumptions, the survival curve's
        own dials and the bridge pot used to be split either side of
        `GridPanel`, so correcting one of them sometimes moved the table
        and sometimes moved nothing you could see without scrolling back
        down past it. None of them may sit after the table now, whatever
        the detail level, so a reader who opens a deeper level always
        finds the thing they are about to change directly above the
        numbers it feeds, never buried under them.

        `ReturnsPanel` sits right after `PlanInputs` for the reason it used
        to sit right before the grid when the grid still had a fold of its
        own: `QuickStart`'s own toggle above already answers the common
        case for every reader, simple or not, so this is only reached by
        somebody who opened "More" to correct the exact figures or a mix
        that shifts more than twice over a life.
      */}
      {/*
        WHAT WAS TICKED, AND NOTHING ELSE, DIRECTLY UNDER THE CARD THAT
        TICKED IT, in the chips' own order. Every one of these can change
        the plan, so none may sit after the results table: a reader who
        corrects their rent sees the table it feeds straight below.
      */}
      {isOpen("home") ? <HomeTopic inputs={inputs} patch={patch} onClose={close("home")} /> : null}
      {isOpen("children") ? (
        <ChildrenTopic inputs={inputs} patch={patch} onClose={close("children")} />
      ) : null}
      {isOpen("car") ? <CarTopic inputs={inputs} patch={patch} onClose={close("car")} /> : null}
      {isOpen("income") ? (
        <IncomeTopic inputs={inputs} patch={patch} onClose={close("income")} />
      ) : null}
      {isOpen("savings") ? (
        <SavingsTopic inputs={inputs} patch={patch} onClose={close("savings")} />
      ) : null}
      {isOpen("returns") ? (
        <ReturnsPanel inputs={inputs} patch={patch} onClose={close("returns")} />
      ) : null}
      {isOpen("bridge") ? (
        <BridgePanel inputs={inputs} plan={plan} onClose={close("bridge")} />
      ) : null}
      {isOpen("working") ? (
        <AssumptionsPanel inputs={inputs} onClose={close("working")} />
      ) : null}

      {/*
        The survival curve is a result and a place to adjust at once. It
        sits straight after the editors either way, so when "How long it
        lasts" is ticked its dials open directly under the other editors,
        and when it is not it is simply the first of the results.
      */}
      <LongevityPanel
        inputs={inputs}
        patch={patch}
        result={longevity}
        planningAge={planningAge}
        showControls={isOpen("lifespan")}
        onClose={isOpen("lifespan") ? close("lifespan") : undefined}
      />

      {/*
        THE RESULTS, LAST, AND NONE OF THEM WRAPPED IN `BelowFold` BUT
        `FlexiblePanel`. The grid carries `RETIREMENT_RESULTS_ID`, which
        `NumberPanel`'s skip button scrolls to, and `BelowFold`'s own doc
        says an anchor target must never be wrapped in one: a button that
        lands on an unmounted placeholder looks like it works and does not.
        `StandingPanel` sits right under it for the same reason it always
        has (#250: it must never be shown a zero pot before the card that
        asks has had a turn, which is guaranteed here since both trail
        every panel that writes to the plan). `FlexiblePanel` is the one
        exception still worth folding: it is a local, illustrative slider
        over the plan already built above, never a plan input itself, and
        it is reliably the furthest thing down the page, so the reserve
        still buys something.
      */}
      <GridPanel
        inputs={inputs}
        plan={plan}
        rows={rows}
        mode={mode}
        onModeChange={setMode}
      />

      <StandingPanel
        inputs={inputs}
        plan={plan}
        milestones={milestones}
        earliest={earliest}
      />

      <BelowFold reserve={480}>
        <FlexiblePanel plan={plan} />
      </BelowFold>
    </div>
  );
}
