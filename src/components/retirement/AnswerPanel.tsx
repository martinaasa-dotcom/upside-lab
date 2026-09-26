"use client";

/**
 * THE WHOLE ROOM IN ONE CARD: YOUR LIFE IN ONE SENTENCE, AND THE ANSWER.
 *
 * The feedback that produced this was that the room was still too busy to
 * understand, after two rounds of making it simpler, and it was right for a
 * reason the earlier rounds did not reach. They withheld panels; they kept
 * the shape of a FORM, a card of labelled fields a reader has to fill in
 * before the page means anything. Nobody's grandmother thinks of her
 * retirement as a form. She thinks of it as a sentence: I am 62, I have
 * this much put away, I would like to stop at 66.
 *
 * So the question IS a sentence, and every figure in it is a word you can
 * tap to change. The sentence is already true when it first appears (it opens
 * on a plausible life, and on the reader's own savings where they have
 * any), so the reader starts by reading, not by typing, and corrects only
 * what is wrong. That is the "less busy work" half.
 *
 * The other half is the verdict. Every figure this room computes was on
 * screen and none of them said the one thing a person came for, which is
 * yes or not yet. It says that first, in the largest type in the room,
 * then how far along they are as a bar, then the one or two changes that
 * would turn a not yet into a yes, each a single press so the reader
 * learns what a lever is worth by pulling it. `verdict.ts` holds the
 * wording and has no instruction in it: a fix is a fact about this plan,
 * never a recommendation.
 *
 * WHAT IS STILL SAID, BECAUSE THE HONESTY RULES DID NOT GET SIMPLER. Both
 * pots are named (the plan is judged on the one that survives a bad run,
 * and the smaller one it would be if returns arrived on schedule is printed
 * beside it), the return is named with what kind of figure it is, and the
 * provenance mark sits by the title.
 */

import { PotChart } from "@/components/retirement/PotChart";
import { PotField } from "@/components/retirement/PotField";
import {
  currencyCodeFor,
  MonthlyMoneyField,
  PercentField,
} from "@/components/retirement/fields";
import { Button } from "@/components/ui/button";
import { MicroLabel, Panel, PanelHeader } from "@/components/ui/Panel";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { WhyThis } from "@/components/ui/WhyThis";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { barFillPct, cn, currency } from "@/lib/format";
import type { Provenance } from "@/lib/provenance";
import {
  retargetHousehold,
  retargetRegion,
  retargetRetirementAge,
  retargetStandard,
  type PlanResult,
  type PotCurvePoint,
  type RetirementInputs,
} from "@/lib/retirement/plan";
import {
  POT_SOURCE_BOOK,
  type PortfolioPotOption,
} from "@/lib/retirement/pot-source";
import {
  LIVING_STANDARDS,
  REGIONS,
  STANDARD_LABEL,
  livingStandardsFor,
  regionById,
  type Household,
  type LivingStandard,
} from "@/lib/retirement/regions";
import {
  CAUTIOUS_REAL_EQUITY_PCT,
  PORTFOLIO_RATE_CEILING_PCT,
  REAL_RETURN_ASSUMPTIONS,
  US_REAL_EQUITY_PCT,
  type HoldingsReturnView,
} from "@/lib/retirement/returns";
import { buildVerdict } from "@/lib/retirement/verdict";
import { Minus, Plus, Sunrise } from "lucide-react";
import { useNarrow } from "@/lib/use-narrow";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useId, useState, type ReactNode } from "react";

type Patch = (next: Partial<RetirementInputs>) => void;
type RatePreset = "cautious" | "world" | "us" | "holdings" | "custom";

const EMPTY_SHEETS: PortfolioPotOption[] = [];

/**
 * One tappable word in the sentence. It reads as part of the prose (same
 * size, same line) and is marked as changeable the way a form field in
 * this app is, with a dashed underline in the accent, plus a faint well so
 * a finger has something to aim at. Tapping opens a small card with the
 * one control that word needs.
 */
function Blank({
  value,
  label,
  title,
  children,
  wide = false,
  tail,
}: {
  value: ReactNode;
  /** What a screen reader hears: "Change your age, now 40". */
  label: string;
  title: string;
  children: ReactNode;
  wide?: boolean;
  /**
   * The punctuation that follows the word. It is kept on the same line as
   * the pill, so a full stop can never wrap onto a line of its own, and it
   * is pulled in against the pill's own padding.
   */
  tail?: string;
}) {
  const narrow = useNarrow();
  const trigger = (
    <button
      type="button"
      aria-label={label}
      className="inline rounded-md bg-foreground/[0.07] px-1.5 py-0.5 font-semibold text-foreground underline decoration-primary decoration-dashed decoration-2 underline-offset-[6px] transition-colors hover:bg-foreground/[0.12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [box-decoration-break:clone]"
    >
      {value}
    </button>
  );
  /*
    On a phone a popover anchored to a word near the foot of the sentence
    has a sliver of screen to open into, so it is a bottom sheet there,
    the same switch `WhyThis` makes at the same width: a thumb reaches the
    bottom of the screen, and the whole control is on screen at once.
  */
  const control = narrow ? (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[80svh] gap-0 rounded-t-2xl p-0"
      >
        <SheetHeader className="px-5 pb-1 pt-5">
          <SheetTitle className="text-base">{title}</SheetTitle>
        </SheetHeader>
        <div className="scroll-host flex min-h-0 flex-1 flex-col gap-3 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 text-sm">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  ) : (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("gap-3 p-4", wide ? "w-80" : "w-72")}
      >
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {children}
      </PopoverContent>
    </Popover>
  );
  if (!tail) return control;
  return (
    <span className="whitespace-nowrap">
      {control}
      <span className="-ml-0.5">{tail}</span>
    </span>
  );
}

/**
 * An age, with two big buttons either side. Typing a two-digit number on a
 * phone keypad is the fiddliest thing this room ever asked of anybody, and
 * an age almost always moves by a year or two.
 */
function Stepper({
  value,
  onChange,
  min,
  max,
  unit = "years old",
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  unit?: string;
}) {
  const v = Math.round(value);
  const set = (n: number) => onChange(Math.min(max, Math.max(min, n)));
  return (
    <div className="flex items-center justify-between gap-3">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11 rounded-full"
        onClick={() => set(v - 1)}
        disabled={v <= min}
        aria-label="One year less"
      >
        <Minus className="size-4" />
      </Button>
      <div className="flex flex-col items-center">
        <span className="font-mono text-2xl tabular-nums text-foreground">{v}</span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11 rounded-full"
        onClick={() => set(v + 1)}
        disabled={v >= max}
        aria-label="One year more"
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}

/** A short list of choices, each a full-width row. */
function Choices<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string; note?: string }[];
  value: T | null;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5" role="radiogroup">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={cn(
              "flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
              on
                ? "border-primary bg-foreground/[0.06]"
                : "border-border hover:bg-foreground/[0.05]"
            )}
          >
            <span className="text-sm font-medium text-foreground">{o.label}</span>
            {o.note ? (
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {o.note}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function rateCaveat(
  preset: RatePreset,
  equity: number,
  view: HoldingsReturnView | null
): string {
  const pct = `${equity.toFixed(1)}%`;
  if (preset === "world")
    return `What the world's shares have earned since 1900 after inflation, ${pct} a year, counting the markets that went to zero.`;
  if (preset === "us")
    return `The United States alone since 1900, ${pct} a year after inflation. The best record of any big market, which is why it is a risky one to plan on.`;
  if (preset === "cautious")
    return `${pct} a year after inflation, a little over half the world's long run figure. For a plan that still works if the next forty years are poor ones.`;
  if (preset === "holdings" && view)
    return `This app's outlook for what you hold: ${view.nominalPct.toFixed(1)}% a year, ${view.realPct.toFixed(1)}% after inflation. A view of the next few years, not a record.${
      view.realPct > PORTFOLIO_RATE_CEILING_PCT
        ? " No whole market has held that for a century."
        : ""
    }`;
  return `Your own figure, ${pct} a year after inflation.`;
}

/**
 * What the first card is before the plan is in place: the heading and a
 * quiet shape of the sentence and the answer, never a figure. The server
 * renders this, so the first painted frame says nothing it would have to
 * take back a moment later.
 */
function AnswerPlaceholder() {
  return (
    <Panel aria-busy="true">
      <PanelHeader
        icon={<Sunrise className="h-4 w-4" />}
        title="When could you stop working?"
        subtitle="Your life in one sentence. Tap any underlined word to change it."
      />
      <div className="flex flex-col gap-3" aria-hidden>
        <div className="h-5 w-11/12 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
        <div className="h-5 w-10/12 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
        <div className="h-5 w-8/12 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      </div>
      <div className="h-40 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" aria-hidden />
      <p className="sr-only">Working out your plan.</p>
    </Panel>
  );
}

export function AnswerPanel({
  inputs,
  patch,
  replace,
  plan,
  provenance,
  curve,
  earliestAge,
  onRetirementAge,
  planningAge,
  suggestedPlanningAge,
  portfolioValue,
  sheets = EMPTY_SHEETS,
  potSource = POT_SOURCE_BOOK,
  onPotSourceChange = () => {},
  holdingsView = null,
  ready = true,
  worldCheck = null,
}: {
  inputs: RetirementInputs;
  patch: Patch;
  replace: (next: RetirementInputs) => void;
  plan: PlanResult;
  provenance: Provenance;
  curve: PotCurvePoint[];
  earliestAge: number | null;
  onRetirementAge: (age: number) => void;
  planningAge: number;
  suggestedPlanningAge: number;
  portfolioValue: number | null;
  sheets?: PortfolioPotOption[];
  potSource?: string;
  onPotSourceChange?: (source: string) => void;
  holdingsView?: HoldingsReturnView | null;
  /**
   * False until the saved plan (or the opening example life) has been put
   * in place. Before that the inputs are the bare defaults, and a verdict
   * drawn on them is a confident sentence about nobody: on the server it
   * read "Yes. The pensions already pay for the life you picked" over a
   * plan of zeroes, for as long as it took the page to hydrate.
   */
  ready?: boolean;
  /**
   * The same plan at the world's long-run return, when the reader's own
   * rate is meaningfully different from it. The verdict above is only as
   * good as the growth figure it was worked at, and a reader who never
   * opens the rate cannot see how much the answer leans on it.
   */
  worldCheck?: { pct: number; earliestAge: number | null } | null;
}) {
  const region = regionById(inputs.regionId);
  const code = currencyCodeFor(region.currency);
  const money = (n: number) => currency(n, 0, code);
  const regionId = useId();
  const [customRate, setCustomRate] = useState(false);

  if (!ready) return <AnswerPlaceholder />;

  const age = Math.round(inputs.retirementAge);
  const stop = curve.find((p) => p.age === age);
  const have = stop?.have ?? plan.projectedPot;
  const need = stop?.need ?? plan.required.target;
  const verdict = buildVerdict({
    retirementAge: age,
    have,
    need,
    earliestAge,
    monthlyToClose: plan.monthlyToClose,
    money,
  });

  const standards = livingStandardsFor(region, inputs.household);
  const standardNow = inputs.spendingMode === "standard" ? inputs.standard : null;
  const monthlyLife =
    standardNow != null
      ? standards[standardNow] / 12
      : inputs.customAnnualSpend / 12;

  const equity = inputs.returns.equityPct;
  const near = (v: number) => Math.abs(equity - v) < 0.05;
  const ratePreset: RatePreset =
    holdingsView != null && near(holdingsView.realPct)
      ? "holdings"
      : near(REAL_RETURN_ASSUMPTIONS.equityPct)
        ? "world"
        : near(US_REAL_EQUITY_PCT)
          ? "us"
          : near(CAUTIOUS_REAL_EQUITY_PCT)
            ? "cautious"
            : "custom";
  const rateWords: Record<RatePreset, string> = {
    holdings: "like the shares I own",
    world: "like the world's shares",
    us: "like American shares",
    cautious: "a cautious figure",
    custom: "my own figure",
  };
  const rateOptions: { id: Exclude<RatePreset, "custom">; label: string; note: string; value: number }[] = [
    ...(holdingsView != null
      ? [{ id: "holdings" as const, label: "The shares I own", note: `${holdingsView.realPct.toFixed(1)}%`, value: holdingsView.realPct }]
      : []),
    { id: "cautious", label: "A cautious figure", note: `${CAUTIOUS_REAL_EQUITY_PCT}%`, value: CAUTIOUS_REAL_EQUITY_PCT },
    { id: "world", label: "The world's shares", note: `${REAL_RETURN_ASSUMPTIONS.equityPct}%`, value: REAL_RETURN_ASSUMPTIONS.equityPct },
    { id: "us", label: "American shares", note: `${US_REAL_EQUITY_PCT}%`, value: US_REAL_EQUITY_PCT },
  ];
  const oneIn = Math.round(1 / Math.max(0.01, inputs.planningSurvival));
  const yes = verdict.status === "ready" || verdict.status === "covered";
  const onCash = plan.required.basis === "spendDown";

  return (
    <Panel>
      <PanelHeader
        icon={<Sunrise className="h-4 w-4" />}
        title={
          <span className="inline-flex items-center gap-2">
            When could you stop working?
            <WhyThis provenance={provenance} />
          </span>
        }
        subtitle="Your life in one sentence. Tap any underlined word to change it."
      />

      {/*
        THE SENTENCE. `leading-loose` rather than the prose rhythm, because
        every blank carries padding and a 6px underline offset, and at the
        ordinary 1.625 two blanks on consecutive lines touch.
      */}
      <p className="font-heading text-lg leading-[2.1] text-muted-foreground sm:text-xl">
        I am{" "}
        <Blank value={Math.round(inputs.currentAge)} label={`Change your age, now ${Math.round(inputs.currentAge)}`} title="Your age now">
          <Stepper
            value={inputs.currentAge}
            min={16}
            max={90}
            onChange={(currentAge) => patch({ currentAge })}
          />
        </Blank>{" "}
        and would like to stop working at{" "}
        <Blank value={age} label={`Change the age you stop, now ${age}`} title="The age you stop working" tail=".">
          <Stepper
            value={inputs.retirementAge}
            min={Math.max(16, Math.round(inputs.currentAge))}
            max={90}
            onChange={(a) => replace(retargetRetirementAge(inputs, a))}
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            The biggest lever there is. You can also drag the chart below.
          </p>
        </Blank>{" "}
        I have{" "}
        <Blank value={money(inputs.currentPot)} label={`Change what you have saved, now ${money(inputs.currentPot)}`} title="What you have put away for this" wide>
          <PotField
            label="Saved and invested now"
            value={inputs.currentPot}
            currency={code}
            onChange={(currentPot) => patch({ currentPot })}
            portfolioValue={portfolioValue}
            sheets={sheets}
            potSource={potSource}
            onPotSourceChange={onPotSourceChange}
          />
        </Blank>{" "}
        put away and add{" "}
        <Blank value={money(inputs.annualContribution / 12)} label={`Change what you add a month, now ${money(inputs.annualContribution / 12)}`} title="What you add each month">
          <MonthlyMoneyField
            label="A month"
            value={inputs.annualContribution}
            currency={code}
            onChange={(annualContribution) => patch({ annualContribution })}
            note="Yours and your employer's together."
          />
        </Blank>{" "}
        a month. I want a{" "}
        <Blank
          value={standardNow ? STANDARD_LABEL[standardNow].toLowerCase() : `${money(monthlyLife)} a month`}
          label="Change the life you want"
          title="The life you want, after tax"
          wide
        >
          <Choices<LivingStandard>
            options={LIVING_STANDARDS.map((id) => ({
              id,
              label: STANDARD_LABEL[id],
              note: `${money(standards[id] / 12)} a month`,
            }))}
            value={standardNow}
            onChange={(standard) => patch(retargetStandard(inputs, standard))}
          />
          <MonthlyMoneyField
            label="Or your own figure, a month"
            value={standardNow ? standards[standardNow] : inputs.customAnnualSpend}
            currency={code}
            onChange={(customAnnualSpend) =>
              patch({ spendingMode: "custom", customAnnualSpend })
            }
            note="Food, bills, holidays, going out. Housing and a car are counted separately."
          />
        </Blank>{" "}
        retirement{" "}
        <Blank
          value={inputs.household === "couple" ? "for the two of us" : "on my own"}
          label="Change who the plan is for"
          title="Who the plan is for"
        >
          <Choices<Household>
            options={[
              { id: "single", label: "Just me" },
              { id: "couple", label: "The two of us" },
            ]}
            value={inputs.household}
            onChange={(household) => replace(retargetHousehold(inputs, household))}
          />
        </Blank>{" "}
        in{" "}
        {/^(United|Netherlands)/.test(region.name) ? "the " : ""}
        <Blank value={region.name} label={`Change the country, now ${region.name}`} title="Where you will live" tail=",">
          <NativeSelect
            id={regionId}
            aria-label="Country"
            value={inputs.regionId}
            onChange={(e) => replace(retargetRegion(inputs, e.target.value))}
            className="w-full"
          >
            {REGIONS.map((r) => (
              <NativeSelectOption key={r.id} value={r.id}>
                {r.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Sets the prices and the state pension.
          </p>
        </Blank>{" "}
        and it has to last until{" "}
        <Blank value={planningAge} label={`Change how long it lasts, now to age ${planningAge}`} title="How long the money has to last" tail=".">
          <Stepper
            value={planningAge}
            min={Math.max(age + 1, 60)}
            max={115}
            unit="years old"
            onChange={(a) => patch({ planningAge: a })}
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {inputs.planningAge == null
              ? `About one in ${oneIn} people your age live to ${planningAge}. Planning for the average would leave half of them short.`
              : `You set this yourself. This app would plan to ${suggestedPlanningAge}, the age about one in ${oneIn} people your age reach.`}
          </p>
          {inputs.planningAge != null ? (
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => patch({ planningAge: null })}>
              Use {suggestedPlanningAge}
            </Button>
          ) : null}
        </Blank>{" "}
        My money grows by{" "}
        <Blank
          value={`${equity.toFixed(1)}% a year, ${rateWords[ratePreset]}`}
          tail="."
          label={`Change what your money earns, now ${equity.toFixed(1)}% a year after inflation`}
          title="What your money earns, after inflation"
          wide
        >
          <Choices<Exclude<RatePreset, "custom">>
            options={rateOptions}
            value={ratePreset === "custom" ? null : ratePreset}
            onChange={(id) => {
              const pick = rateOptions.find((o) => o.id === id);
              if (pick) patch({ returns: { ...inputs.returns, equityPct: pick.value } });
              setCustomRate(false);
            }}
          />
          {customRate || ratePreset === "custom" ? (
            <PercentField
              label="Your own figure"
              value={equity}
              digits={1}
              onChange={(n) =>
                patch({
                  returns: { ...inputs.returns, equityPct: Math.min(40, Math.max(-5, n)) },
                })
              }
            />
          ) : (
            <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setCustomRate(true)}>
              Type my own figure
            </Button>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            {rateCaveat(ratePreset, equity, holdingsView)}
          </p>
        </Blank>
      </p>

      {/* THE ANSWER. */}
      <div
        className={cn(
          "card-sheen glass-well flex flex-col gap-5 rounded-xl border-l-4 px-4 py-5 sm:px-6 sm:py-6",
          yes ? "border-l-primary" : "border-l-foreground/25"
        )}
        aria-live="polite"
      >
        <p className="figure-hero text-foreground">{verdict.headline}</p>
        <p className="text-base leading-relaxed text-muted-foreground">
          {verdict.detail}
        </p>


        {verdict.status !== "covered" ? (
          <div className="flex flex-col gap-2">
            <div
              className="relative h-4 w-full overflow-hidden rounded-full bg-foreground/10"
              role="meter"
              aria-label="Saved against what it needs"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(verdict.progress * 100)}
            >
              <div
                className="h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-500"
                style={{ width: `${barFillPct(verdict.progress * 100, 2)}%` }}
              />
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-sm text-muted-foreground">
                You would have{" "}
                <span className="font-mono tabular-nums text-foreground">{money(have)}</span>
              </span>
              <span className="text-sm text-muted-foreground">
                Your number{" "}
                <span className="font-mono tabular-nums text-foreground">{money(need)}</span>
              </span>
            </div>
          </div>
        ) : null}

        {verdict.fixes.length > 0 ? (
          <div className="flex flex-col gap-2">
            <MicroLabel>What would get you there</MicroLabel>
            <ul className="flex flex-col gap-2">
              {verdict.fixes.map((fix) => (
                <li
                  key={fix.kind}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-border px-3 py-2.5"
                >
                  <span className="text-sm text-foreground">{fix.text}</span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      fix.kind === "later"
                        ? onRetirementAge(fix.age)
                        : patch({
                            annualContribution:
                              inputs.annualContribution + fix.monthly * 12,
                          })
                    }
                  >
                    {fix.press}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : verdict.status === "never" ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            On this saving the pot does not catch up before 80. Adding more
            each month, or a lower target, is what moves it.
          </p>
        ) : null}

        {verdict.sooner ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {verdict.sooner}{" "}
            {earliestAge != null ? (
              <button
                type="button"
                onClick={() => onRetirementAge(earliestAge)}
                className="font-medium text-foreground underline decoration-primary decoration-dashed underline-offset-4"
              >
                Show me {Math.round(earliestAge)}
              </button>
            ) : null}
          </p>
        ) : null}
        {worldCheck ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {worldCheck.earliestAge == null
              ? `At the world's long-run ${worldCheck.pct.toFixed(1)}% a year instead, this saving would not get there before 80.`
              : `At the world's long-run ${worldCheck.pct.toFixed(1)}% a year instead, the earliest you could stop would be ${Math.round(worldCheck.earliestAge)}.`}
          </p>
        ) : null}
      </div>

      {curve.length > 1 ? (
        <div className="flex flex-col gap-2">
          <PotChart
            curve={curve}
            retirementAge={age}
            earliestAge={earliestAge}
            onRetirementAge={onRetirementAge}
            code={code}
          />
        </div>
      ) : null}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {onCash
          ? `Held as cash and spent to nothing by ${plan.planningAge}. `
          : `Your number is built to survive a bad run of markets. If returns arrived exactly on schedule, ${money(plan.required.spendDown)} would do. `}
        All in today&apos;s money. {ADVICE_DISCLAIMER_SHORT}
      </p>
    </Panel>
  );
}
