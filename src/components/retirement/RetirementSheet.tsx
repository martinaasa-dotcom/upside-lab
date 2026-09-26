"use client";

/**
 * THE RETIREMENT ROOM.
 *
 * It holds the plan, runs the arithmetic, and hands each panel the slice it
 * draws. Nothing in here calculates anything: every figure comes out of
 * `src/lib/retirement/`, which is pure and tested, so a panel cannot quietly
 * disagree with the panel above it.
 *
 * ONE ANSWER, ONE PLACE TO FINE-TUNE, ONE LESSON, AND THE WORKING FOLDED.
 *
 * `AnswerPanel` is the question as one sentence with every figure a word
 * the reader can tap, and under it the verdict: yes or not yet, a bar of
 * saved against needed, the one or two presses that turn a not yet into a
 * yes, the same plan at the world's long-run return when the reader's own
 * rate is far from it, and the draggable chart. `QuickStart` is the chips
 * for everything else the plan counts plus the example lives behind one
 * button. The ticked editors open under it. Then the spending layers,
 * which are the one lesson worth meeting unasked, and then the working
 * (survival odds, every age side by side, the milestones) behind a single
 * press, which opens on its own when "How long it lasts" is ticked.
 *
 * Nothing that writes to the plan sits after the results table: inside the
 * fold the survival curve, whose dials can patch the plan, comes before the
 * grid. Before the saved plan is in place the answer card is a placeholder
 * rather than a verdict drawn on bare defaults, because the server renders
 * this room and a first frame reading "Yes, you could stop" over a plan of
 * zeroes is a sentence the page would have to take back.
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
import { AnswerPanel } from "@/components/retirement/AnswerPanel";
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
import { cn } from "@/lib/format";
import { ChevronDown } from "lucide-react";
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
  const [showWorking, setShowWorking] = useState(false);
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

  /*
    The same plan at the world's long-run return, only when the reader's
    own rate is at least half a point away from it. It is the one check on
    the verdict a reader cannot do for themselves: the answer is worked at
    whatever growth figure the plan carries, and "what you hold" can be an
    outlook far above anything a whole market has held for a lifetime. A
    second whole curve is fifty more plans, so it runs on the deferred
    inputs like the first one.
  */
  const worldCheck = useMemo(() => {
    const world = REAL_RETURN_ASSUMPTIONS.equityPct;
    if (Math.abs(settled.returns.equityPct - world) < 0.5) return null;
    const alt = potCurve(
      { ...settled, returns: { ...settled.returns, equityPct: world } },
      longevity.suggestedPlanningAge
    );
    const hit = alt.find((p) => p.need > 0 && p.have >= p.need);
    return { pct: world, earliestAge: hit ? hit.age : null };
  }, [settled, longevity.suggestedPlanningAge]);

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

  /*
    The working (survival odds, every age side by side, the milestones)
    stays one press away rather than on the page by default. It opens on
    its own when a reader ticks a topic whose editor lives inside it.
  */
  const workingOpen = showWorking || isOpen("lifespan");

  return (
    <div className={PANEL_STACK}>
      {/*
        THE ROOM IS ONE ANSWER, ONE PLACE TO FINE-TUNE, ONE LESSON, AND THE
        WORKING BEHIND A SINGLE PRESS.

        The feedback was that even after the chips the room was too busy to
        understand, and the count agreed: seven panels, five charts and two
        tables stood between a reader and the end of the page, and the one
        thing they came for (can I stop when I want to) was a figure they
        had to compare against another figure themselves. `AnswerPanel`
        says it as a sentence and a yes or not yet, with the fixes as
        presses. Under it, the chips; then the spending layers, which are
        the one lesson worth meeting unasked because they are what makes a
        bad year stop being frightening; then the working, folded.

        That fold is not the withholding this repository argues against:
        every figure the answer rests on is in the answer, and the fold is
        a press away on the same page, never a room somebody has to find.
        Nothing that writes to the plan sits after the results table inside
        it, the rule the order test holds.
      */}
      <AnswerPanel
        inputs={inputs}
        patch={patch}
        replace={setInputs}
        plan={plan}
        provenance={provenance}
        curve={curve}
        earliestAge={earliest ? earliest.age : null}
        onRetirementAge={(age) =>
          setInputs((prev) => retargetRetirementAge(prev, age))
        }
        planningAge={planningAge}
        suggestedPlanningAge={longevity.suggestedPlanningAge}
        portfolioValue={portfolioValue}
        sheets={sheets}
        potSource={potSource}
        onPotSourceChange={changePotSource}
        holdingsView={holdingsView}
        ready={restored}
        worldCheck={worldCheck}
      />

      <QuickStart
        inputs={inputs}
        open={open}
        onToggle={toggle}
        planningAge={planningAge}
        swrPct={plan.required.swr.ratePct}
        templateId={templateId}
        onTemplate={applyTemplate}
      />

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
        <>
          <NumberPanel
            inputs={inputs}
            patch={patch}
            plan={plan}
            provenance={provenance}
            showWorking
          />
          <AssumptionsPanel inputs={inputs} onClose={close("working")} />
        </>
      ) : null}

      <BelowFold reserve={480}>
        <FlexiblePanel plan={plan} />
      </BelowFold>

      <button
        type="button"
        aria-expanded={workingOpen}
        onClick={() => setShowWorking((v) => !v)}
        className="card-sheen glass flex items-center justify-between gap-3 rounded-xl px-4 py-4 text-left ring-1 ring-foreground/15 transition-colors hover:ring-foreground/30 sm:px-6"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-heading text-base font-semibold text-foreground">
            {workingOpen ? "Hide the working" : "Show the working"}
          </span>
          <span className="text-sm text-muted-foreground">
            How long people live, what stopping at every age costs, and the
            milestones on the way.
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
            workingOpen && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {workingOpen ? (
        <>
          <LongevityPanel
            inputs={inputs}
            patch={patch}
            result={longevity}
            planningAge={planningAge}
            showControls={isOpen("lifespan")}
            onClose={isOpen("lifespan") ? close("lifespan") : undefined}
          />
          <GridPanel
            inputs={inputs}
            plan={plan}
            rows={rows}
            mode={mode}
            onModeChange={setMode}
          />
          <StandingPanel inputs={inputs} plan={plan} milestones={milestones} />
        </>
      ) : null}
    </div>
  );
}
