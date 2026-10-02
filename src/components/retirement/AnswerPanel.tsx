"use client";

/**
 * THE WHOLE ROOM IN ONE CARD: YOUR LIFE IN FOUR SHORT SENTENCES, AND THE
 * ANSWER AS A PICTURE.
 *
 * The round before this made the question a single sentence with every
 * figure a word to tap, and the verdict a yes or a not yet. The sentence
 * was right and the delivery was wrong: one paragraph at heading size,
 * every blank a bold pill, eleven of them in a row, then a verdict in the
 * largest type in the product over a flat gold bar. Measured against what
 * a reader said about it, it was loud everywhere at once, so nothing was
 * loud. Three things changed and each is a rule.
 *
 * THE STORY IS GROUPED. You, your money, your home life, your retirement:
 * four cards, one or two short sentences each, at body size. A person
 * reads a small card whole and skims a paragraph, and grouping is what
 * lets a reader find the one figure that is wrong in their plan. The home
 * card always says something about a home, a car and children, because
 * almost everybody has at least one of the three and a plan that silently
 * owns its home outright with no car is a plan about somebody else.
 *
 * THE ANSWER IS A PICTURE BEFORE IT IS A FIGURE. One headline, one line
 * under it, then the mountain of the reader's money across their life
 * (`LifeChart`), which they can drag. Two labelled bars replace "Your
 * number", a phrase with no referent: what you will have, and what it
 * takes to last, each saying at which age and until which age.
 *
 * "AT THE WORLD'S LONG-RUN RETURN" IS GONE, and so is every sentence of
 * that shape. What it was trying to do is right (the verdict leans on a
 * growth figure the reader probably never chose) and what it said was
 * unreadable. It is a row of three or four presses now, slow, typical,
 * strong and yours, each saying at what age that growth would let you
 * stop, and a press switches the plan to it.
 *
 * WHAT IS STILL SAID, BECAUSE THE HONESTY RULES DID NOT GET SIMPLER. The
 * plan is judged on a pot that survives a bad run of markets; the
 * mountain is drawn at the average return; where those disagree the line
 * under the headline says so in plain words. The provenance mark sits by
 * the title and the legal line is at the foot, once.
 */

import { CountUp } from "@/components/ui/CountUp";
import { LifeChart } from "@/components/retirement/LifeChart";
import { PotField } from "@/components/retirement/PotField";
import {
  currencyCodeFor,
  MoneyField,
  MonthlyMoneyField,
  PercentField,
} from "@/components/retirement/fields";
import { Button } from "@/components/ui/button";
import { CARD, MicroLabel, Panel, PanelHeader } from "@/components/ui/Panel";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { WhyThis } from "@/components/ui/WhyThis";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { barFillPct, cn, currency } from "@/lib/format";
import type { Provenance } from "@/lib/provenance";
import {
  lifePath,
  retirementMonth,
  type MonthPart,
} from "@/lib/retirement/life-path";
import {
  retargetHousehold,
  retargetRegion,
  retargetRetirementAge,
  retargetStandard,
  type Housing,
  type PlanResult,
  type RetirementInputs,
} from "@/lib/retirement/plan";
import {
  POT_SOURCE_BOOK,
  type PortfolioPotOption,
} from "@/lib/retirement/pot-source";
import {
  costAnchorsForStandard,
  LIVING_STANDARDS,
  localiseFromGbp,
  REGIONS,
  STANDARD_LABEL,
  UK_COST_ANCHORS,
  livingStandardsFor,
  regionById,
  type Household,
  type LivingStandard,
} from "@/lib/retirement/regions";
import {
  PORTFOLIO_RATE_CEILING_PCT,
  type HoldingsReturnView,
} from "@/lib/retirement/returns";
import { buildVerdict } from "@/lib/retirement/verdict";
import {
  Home,
  Minus,
  PiggyBank,
  Plus,
  Sunrise,
  UserRound,
} from "lucide-react";
import { useNarrow } from "@/lib/use-narrow";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { focusWithoutScroll, pinScroll } from "@/lib/pinned-scroll";

type Patch = (next: Partial<RetirementInputs>) => void;

const EMPTY_SHEETS: PortfolioPotOption[] = [];

/** A growth rate the reader can compare the plan against, with its answer. */
export type GrowthScenario = {
  id: string;
  /** One word: Slow, Typical, Strong, Yours. */
  label: string;
  /** What that word means, in a few words. */
  note: string;
  /** After inflation, a year. */
  pct: number;
  /** The first age that growth lets this plan stop at, or null before 80. */
  earliestAge: number | null;
};

/**
 * One tappable word in a sentence. Body size and medium weight, so it reads
 * as part of the prose; the dashed accent underline is the whole signal
 * that it changes, which is how an editable figure is marked everywhere
 * else in this app. Tapping opens the one control that word needs.
 */
/*
  The answer as it stands, read by every open picker. A change made in a
  sheet used to be invisible until the sheet was closed, because the sheet
  covers the page: somebody pressing plus on their age could not see what
  it did. The headline is short and is exactly the one on the page.
*/
const LiveAnswer = createContext<string | null>(null);

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
  /** Punctuation kept on the word's line so it never wraps alone. */
  tail?: string;
}) {
  const narrow = useNarrow();
  const answer = useContext(LiveAnswer);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  /*
    Where the page was when the picker opened. A change in here must never
    move the page: `pinned-scroll.ts` has the three ways it used to, and
    this is where each is answered.
  */
  const restoreRef = useRef<(() => void) | null>(null);
  const setOpenPinned = (next: boolean) => {
    /* Only the sheet locks the page; a popover leaves the reader free to scroll. */
    if (next && narrow && typeof window !== "undefined") restoreRef.current = pinScroll(window);
    if (!next) restoreRef.current?.();
    setOpen(next);
  };
  /* Focus the sheet itself rather than its first field, so no keyboard rises on its own. */
  const onOpenAutoFocus = (e: Event) => {
    e.preventDefault();
    focusWithoutScroll(contentRef.current);
  };
  /* Hand focus back to the word without the scroll a plain focus() makes. */
  const onCloseAutoFocus = (e: Event) => {
    e.preventDefault();
    focusWithoutScroll(triggerRef.current);
    restoreRef.current?.();
    restoreRef.current = null;
  };
  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      aria-label={label}
      className="inline rounded-sm px-0.5 font-medium text-foreground underline decoration-primary/60 decoration-dashed decoration-[1.5px] underline-offset-[5px] transition-colors hover:bg-foreground/[0.06] hover:decoration-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [box-decoration-break:clone]"
    >
      {value}
    </button>
  );
  /*
    Every picker ends on the same two things: the answer as it now stands,
    and a Done button. Without them the only way out of a sheet was the
    small cross in its corner or a tap on the dimmed page, and after
    pressing plus a few times nothing said the change had taken or what to
    do next.
  */
  const footer = (
    <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
      <p className="min-w-0 text-sm text-muted-foreground" aria-live="polite">
        {answer ? <span className="font-medium text-foreground">{answer}</span> : null}
      </p>
      <Button type="button" className="shrink-0 px-5" onClick={() => setOpenPinned(false)}>
        Done
      </Button>
    </div>
  );
  /*
    On a phone a popover anchored to a word near the foot of a card has a
    sliver of screen to open into, so it is a bottom sheet there, the same
    switch `WhyThis` makes at the same width.
  */
  const control = narrow ? (
    <Sheet open={open} onOpenChange={setOpenPinned}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        ref={contentRef}
        tabIndex={-1}
        side="bottom"
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
        className="max-h-[80svh] gap-0 rounded-t-2xl p-0 outline-none"
      >
        <SheetHeader className="px-5 pb-1 pt-5">
          <SheetTitle className="text-base">{title}</SheetTitle>
        </SheetHeader>
        <div className="scroll-host flex min-h-0 flex-1 flex-col gap-3 px-5 pt-2 text-sm">
          {children}
        </div>
        <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">{footer}</div>
      </SheetContent>
    </Sheet>
  ) : (
    <Popover open={open} onOpenChange={setOpenPinned}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        tabIndex={-1}
        align="start"
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
        className={cn("gap-3 p-4 outline-none", wide ? "w-80" : "w-72")}
      >
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {children}
        {footer}
      </PopoverContent>
    </Popover>
  );
  if (!tail) return control;
  return (
    <span className="whitespace-nowrap">
      {control}
      {tail}
    </span>
  );
}

/**
 * A count, with two big buttons either side. Typing two digits on a phone
 * keypad is the fiddliest thing this room ever asked of anybody, and an age
 * almost always moves by a year or two.
 *
 * HOLD TO KEEP COUNTING. Going from 32 to 55 was twenty-three separate
 * taps, which is the moment a stepper stops being easier than typing. A
 * press steps once at once, and held past `HOLD_DELAY_MS` it repeats,
 * speeding up the longer it is held, the way a clock's buttons do.
 */
const HOLD_DELAY_MS = 380;
const HOLD_FIRST_MS = 140;
const HOLD_FASTEST_MS = 70;

function useHoldRepeat(step: (delta: number) => boolean) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const byPointer = useRef(false);
  const stepRef = useRef(step);
  stepRef.current = step;
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  return (delta: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      byPointer.current = true;
      stepRef.current(delta);
      let wait = HOLD_FIRST_MS;
      const tick = () => {
        /* At the end of the range the button disables and may never hear the release. */
        if (!stepRef.current(delta)) return stop();
        wait = Math.max(HOLD_FASTEST_MS, wait * 0.85);
        timer.current = setTimeout(tick, wait);
      };
      stop();
      timer.current = setTimeout(tick, HOLD_DELAY_MS);
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    /* A long press must not open the text callout or a context menu. */
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    /* The pointer already stepped; a keyboard press arrives here alone. */
    onClick: () => {
      if (byPointer.current) {
        byPointer.current = false;
        return;
      }
      stepRef.current(delta);
    },
  });
}

function Stepper({
  value,
  onChange,
  min,
  max,
  unit = "years old",
  less = "One year less",
  more = "One year more",
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  unit?: string;
  less?: string;
  more?: string;
}) {
  const v = Math.round(value);
  /*
    The latest value, moved on the spot rather than on the next render, so
    a held button counts from where it has got to and not from where the
    last render left it.
  */
  const latest = useRef(v);
  latest.current = v;
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const hold = useHoldRepeat((delta) => {
    const next = clamp(latest.current + delta);
    if (next === latest.current) return false;
    latest.current = next;
    onChange(next);
    return true;
  });
  return (
    <div className="flex select-none items-center justify-between gap-3">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-12 rounded-full [-webkit-touch-callout:none]"
        disabled={v <= min}
        aria-label={less}
        {...hold(-1)}
      >
        <Minus className="size-5" />
      </Button>
      <div className="flex flex-col items-center" aria-live="polite">
        <span className="font-mono text-2xl tabular-nums text-foreground">{v}</span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-12 rounded-full [-webkit-touch-callout:none]"
        disabled={v >= max}
        aria-label={more}
        {...hold(1)}
      >
        <Plus className="size-5" />
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
              on ? "border-primary bg-foreground/[0.06]" : "border-border hover:bg-foreground/[0.05]"
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

/** One of the four cards the story is told in. */
function StoryCard({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={cn(CARD, "flex flex-col gap-1.5 px-4 py-3.5 sm:gap-2 sm:py-4")}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="flex size-6 items-center justify-center rounded-md bg-foreground/[0.06] text-foreground">
          {icon}
        </span>
        <MicroLabel>{label}</MicroLabel>
      </div>
      <p className="text-base leading-7 text-muted-foreground sm:leading-8">{children}</p>
    </div>
  );
}

/**
 * What the first card is before the plan is in place: the heading and a
 * quiet shape of the story and the answer, never a figure. The server
 * renders this, so the first painted frame says nothing it would have to
 * take back a moment later.
 */
function AnswerPlaceholder() {
  return (
    <Panel aria-busy="true">
      <PanelHeader
        icon={<Sunrise className="h-4 w-4" />}
        title="When could you stop working?"
        subtitle="Your plan in four short parts. Tap anything underlined to change it."
      />
      <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton-shine h-28 rounded-lg bg-muted" />
        ))}
      </div>
      <div className="skeleton-shine h-64 rounded-xl bg-muted" aria-hidden />
      <p className="sr-only">Working out your plan.</p>
    </Panel>
  );
}

/** The four living costs in a month, in the room's four bright hues. */
const PART_TONE: Record<MonthPart["id"], string> = {
  living: "bg-[var(--layer-essentials)]",
  home: "bg-[var(--layer-regular)]",
  car: "bg-[var(--layer-discretionary)]",
  children: "bg-[var(--layer-luxuries)]",
};

export function AnswerPanel({
  inputs,
  patch,
  replace,
  plan,
  provenance,
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
  scenarios = [],
}: {
  inputs: RetirementInputs;
  patch: Patch;
  replace: (next: RetirementInputs) => void;
  plan: PlanResult;
  provenance: Provenance;
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
   * drawn on them is a confident sentence about nobody.
   */
  ready?: boolean;
  /**
   * The same plan at a few other growth rates, each with the age it could
   * stop at. The verdict is only as good as the growth figure it was
   * worked at, and a reader who never opens the rate cannot otherwise see
   * how much the answer leans on it.
   */
  scenarios?: GrowthScenario[];
}) {
  const region = regionById(inputs.regionId);
  const code = currencyCodeFor(region.currency);
  const money = (n: number) => currency(n, 0, code);
  const symbol = money(0).replace(/[\d.,\s]/g, "") || "";
  const regionId = useId();
  const [customRate, setCustomRate] = useState(false);

  const path = useMemo(() => lifePath(plan), [plan]);
  const month = useMemo(() => retirementMonth(plan), [plan]);

  if (!ready) return <AnswerPlaceholder />;

  const age = Math.round(inputs.retirementAge);
  const have = plan.projectedPot;
  const need = plan.required.target;
  const verdict = buildVerdict({
    retirementAge: age,
    have,
    need,
    earliestAge,
    monthlyToClose: plan.monthlyToClose,
    money,
    planningAge: plan.planningAge,
    emptyAt: plan.emptyAtAge,
  });

  const standards = livingStandardsFor(region, inputs.household);
  const standardNow = inputs.spendingMode === "standard" ? inputs.standard : null;
  const monthlyLife =
    standardNow != null ? standards[standardNow] / 12 : inputs.customAnnualSpend / 12;

  const equity = inputs.returns.equityPct;
  const oneIn = Math.round(1 / Math.max(0.01, inputs.planningSurvival));
  const yes = verdict.status === "ready" || verdict.status === "covered";
  const onCash = plan.required.basis === "spendDown";
  const anchors = costAnchorsForStandard(inputs.standard);
  const kids = inputs.children.length;
  const pensionAge =
    inputs.includeStatePension && inputs.statePensionAnnual > 0 ? Math.round(inputs.statePensionAge) : null;

  const homeWords =
    inputs.housing === "renting"
      ? `rent for ${money(inputs.rentAnnual / 12)} a month`
      : inputs.housing === "mortgage"
        ? `pay ${money(inputs.mortgageAnnual / 12)} a month on a mortgage, ${Math.round(inputs.mortgageYearsLeft)} years left`
        : "own my home outright";
  const carWords =
    inputs.carMonthly > 0
      ? inputs.carForever
        ? `a car at ${money(inputs.carMonthly)} a month`
        : `a car at ${money(inputs.carMonthly)} a month for ${Math.round(inputs.carYearsLeft)} more years`
      : "no car to pay for";
  const kidWords = kids === 0 ? "no children" : kids === 1 ? "one child" : `${kids} children`;

  const setKids = (n: number) => {
    const next = [...inputs.children];
    while (next.length < n) next.push({ id: `child-${Date.now()}-${next.length}`, age: 3 });
    next.length = n;
    patch({
      children: next,
      childAnnualCost:
        inputs.childAnnualCost > 0 ? inputs.childAnnualCost : localiseFromGbp(region, anchors.childAnnual),
    });
  };

  const barMax = Math.max(have, need, 1);

  return (
    <LiveAnswer.Provider value={verdict.headline}>
    <Panel>
      <PanelHeader
        icon={<Sunrise className="h-4 w-4" />}
        title={
          <span className="inline-flex items-center gap-2">
            When could you stop working?
            <WhyThis provenance={provenance} />
          </span>
        }
        subtitle="Your plan in four short parts. Tap anything underlined to change it."
      />

      {/* THE STORY, IN FOUR CARDS. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <StoryCard icon={<UserRound className="size-3.5" />} label="You">
          I&apos;m{" "}
          <Blank value={Math.round(inputs.currentAge)} label={`Change your age, now ${Math.round(inputs.currentAge)}`} title="Your age now">
            <Stepper value={inputs.currentAge} min={16} max={90} onChange={(currentAge) => patch({ currentAge })} />
          </Blank>{" "}
          and live in {/^(United|Netherlands)/.test(region.name) ? "the " : ""}
          <Blank value={region.name} label={`Change the country, now ${region.name}`} title="Where you will live">
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
            <p className="text-xs leading-relaxed text-muted-foreground">Sets the prices and the state pension.</p>
          </Blank>{" "}
          <Blank
            value={inputs.household === "couple" ? "with a partner" : "on my own"}
            label="Change who the plan is for"
            title="Who the plan is for"
            tail="."
          >
            <Choices<Household>
              options={[
                { id: "single", label: "Just me" },
                { id: "couple", label: "Me and a partner" },
              ]}
              value={inputs.household}
              onChange={(household) => replace(retargetHousehold(inputs, household))}
            />
          </Blank>{" "}
          I&apos;d like to stop working at{" "}
          <Blank value={age} label={`Change the age you stop, now ${age}`} title="The age you stop working" tail=".">
            <Stepper
              value={inputs.retirementAge}
              min={Math.max(16, Math.round(inputs.currentAge))}
              max={90}
              onChange={(a) => replace(retargetRetirementAge(inputs, a))}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              You can also drag the dot on the picture below.
            </p>
          </Blank>
        </StoryCard>

        <StoryCard icon={<PiggyBank className="size-3.5" />} label="Your money">
          I&apos;ve saved{" "}
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
          and put in{" "}
          <Blank value={money(inputs.annualContribution / 12)} label={`Change what you add a month, now ${money(inputs.annualContribution / 12)}`} title="What you add each month">
            <MonthlyMoneyField
              label="A month"
              value={inputs.annualContribution}
              currency={code}
              onChange={(annualContribution) => patch({ annualContribution })}
              note="Yours and your employer's together."
            />
          </Blank>{" "}
          a month. It grows about{" "}
          <Blank
            value={`${equity.toFixed(1)}% a year`}
            tail="."
            label={`Change how fast your money grows, now ${equity.toFixed(1)}% a year after inflation`}
            title="How fast your money grows, after inflation"
            wide
          >
            {customRate ? (
              <PercentField
                label="Your own figure"
                value={equity}
                digits={1}
                onChange={(n) => patch({ returns: { ...inputs.returns, equityPct: Math.min(40, Math.max(-5, n)) } })}
              />
            ) : (
              <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setCustomRate(true)}>
                Type my own figure
              </Button>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">
              Or pick one of the growth rates under the answer. After inflation, so every figure is in today&apos;s money.
            </p>
          </Blank>
        </StoryCard>

        <StoryCard icon={<Home className="size-3.5" />} label="Your home life">
          I{" "}
          <Blank value={homeWords} label="Change your home" title="Your home" tail="." wide>
            <Choices<Housing>
              options={[
                { id: "renting", label: "I rent" },
                { id: "mortgage", label: "I pay a mortgage" },
                { id: "owned", label: "I own it outright" },
              ]}
              value={inputs.housing}
              onChange={(housing) =>
                patch({
                  housing,
                  rentAnnual:
                    housing === "renting" && inputs.rentAnnual <= 0
                      ? localiseFromGbp(region, UK_COST_ANCHORS.rentMonthly * 12)
                      : inputs.rentAnnual,
                  mortgageAnnual:
                    housing === "mortgage" && inputs.mortgageAnnual <= 0
                      ? localiseFromGbp(region, anchors.mortgageAnnual)
                      : inputs.mortgageAnnual,
                })
              }
            />
            {inputs.housing === "renting" ? (
              <MonthlyMoneyField
                label="Rent a month"
                value={inputs.rentAnnual}
                currency={code}
                onChange={(rentAnnual) => patch({ rentAnnual })}
                note="Rent never ends, so it is counted for your whole retirement."
              />
            ) : inputs.housing === "mortgage" ? (
              <>
                <MonthlyMoneyField
                  label="Mortgage a month"
                  value={inputs.mortgageAnnual}
                  currency={code}
                  onChange={(mortgageAnnual) => patch({ mortgageAnnual })}
                />
                <Stepper
                  value={inputs.mortgageYearsLeft}
                  min={0}
                  max={40}
                  unit="years left"
                  onChange={(mortgageYearsLeft) => patch({ mortgageYearsLeft })}
                />
              </>
            ) : null}
          </Blank>{" "}
          I have{" "}
          <Blank value={carWords} label="Change your car" title="A car" tail="." wide>
            <Choices<"none" | "car">
              options={[
                { id: "car", label: "I pay for a car" },
                { id: "none", label: "No car payment" },
              ]}
              value={inputs.carMonthly > 0 ? "car" : "none"}
              onChange={(id) =>
                patch({
                  carMonthly:
                    id === "none"
                      ? 0
                      : inputs.carMonthly > 0
                        ? inputs.carMonthly
                        : localiseFromGbp(region, anchors.carMonthly > 0 ? anchors.carMonthly : 250),
                  carForever: id === "car" ? true : inputs.carForever,
                })
              }
            />
            {inputs.carMonthly > 0 ? (
              <>
                <MoneyField
                  label="A month"
                  value={inputs.carMonthly}
                  currency={code}
                  onChange={(carMonthly) => patch({ carMonthly })}
                  note="Lease, finance, insurance and running it."
                />
                <label className="flex cursor-pointer items-center justify-between gap-3">
                  <span className="min-w-0 text-sm text-muted-foreground">I will always have a car</span>
                  <Switch checked={inputs.carForever} onCheckedChange={(carForever) => patch({ carForever })} />
                </label>
                {inputs.carForever ? null : (
                  <Stepper
                    value={inputs.carYearsLeft}
                    min={0}
                    max={40}
                    unit="years left"
                    onChange={(carYearsLeft) => patch({ carYearsLeft })}
                  />
                )}
              </>
            ) : null}
          </Blank>{" "}
          And{" "}
          <Blank value={kidWords} label="Change your children" title="Children at home" wide>
            <Stepper
              value={kids}
              min={0}
              max={8}
              unit={kids === 1 ? "child" : "children"}
              less="One child fewer"
              more="One more child"
              onChange={setKids}
            />
            {inputs.children.map((child, i) => (
              <div key={child.id} className="flex flex-col gap-1">
                <MicroLabel>{`Child ${i + 1}, age now`}</MicroLabel>
                <Stepper
                  value={child.age}
                  min={0}
                  max={30}
                  onChange={(a) =>
                    patch({
                      children: inputs.children.map((c) => (c.id === child.id ? { ...c, age: a } : c)),
                    })
                  }
                />
              </div>
            ))}
            {kids > 0 ? (
              <MonthlyMoneyField
                label="Each child, a month"
                value={inputs.childAnnualCost}
                currency={code}
                onChange={(childAnnualCost) => patch({ childAnnualCost })}
                note={`Counted until they turn ${Math.round(inputs.childUntilAge)}.`}
              />
            ) : null}
          </Blank>{" "}
          at home.
        </StoryCard>

        <StoryCard icon={<Sunrise className="size-3.5" />} label="Your retirement">
          I&apos;d like a{" "}
          <Blank
            value={standardNow ? `${STANDARD_LABEL[standardNow].toLowerCase()} life` : "life of my own making"}
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
              onChange={(customAnnualSpend) => patch({ spendingMode: "custom", customAnnualSpend })}
              note="Food, bills, holidays, going out. Your home, car and children are counted on their own."
            />
          </Blank>
          , about <span className="tabular-nums text-foreground">{money(monthlyLife)}</span> a month for everyday
          things. It has to last until{" "}
          <Blank value={planningAge} label={`Change how long it lasts, now to age ${planningAge}`} title="How long the money has to last" tail=".">
            <Stepper value={planningAge} min={Math.max(age + 1, 60)} max={115} onChange={(a) => patch({ planningAge: a })} />
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
          </Blank>
        </StoryCard>
      </div>

      {/* THE ANSWER. */}
      <div className={cn(CARD, "flex flex-col gap-6 px-4 py-5 sm:px-6 sm:py-6")} aria-live="polite">
        <div className="flex flex-col gap-2">
          <p className="verdict-hero text-foreground">
            {yes ? (
              <>
                <span className="text-primary">Yes.</span>{" "}
                {verdict.headline.replace(/^Yes\.\s*/, "")}
              </>
            ) : (
              verdict.headline
            )}
          </p>
          <p className="text-base leading-relaxed text-muted-foreground">{verdict.detail}</p>
        </div>

        {path.points.length > 1 ? (
          <LifeChart
            path={path}
            currentAge={inputs.currentAge}
            retirementAge={age}
            pensionAge={pensionAge}
            earliestAge={earliestAge}
            onRetirementAge={onRetirementAge}
            symbol={symbol}
            format={money}
          />
        ) : null}

        <div className="grid gap-6 sm:grid-cols-2 sm:gap-8">
          {/* Have against need, each labelled with its own ages. */}
          {verdict.status !== "covered" ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-muted-foreground">You&apos;ll have at {age}</span>
                  <CountUp value={have} format={money} className="font-mono text-sm tabular-nums text-foreground" />
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-foreground/[0.07]">
                  <div
                    className="overview-bar h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out"
                    style={{ width: `${barFillPct((have / barMax) * 100, 2)}%` }}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-muted-foreground">Needed to last until {plan.planningAge}</span>
                  <CountUp value={need} format={money} className="font-mono text-sm tabular-nums text-foreground" />
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-foreground/[0.07]">
                  <div
                    className="overview-bar h-full rounded-full bg-foreground/40 motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out"
                    style={{ width: `${barFillPct((need / barMax) * 100, 2)}%` }}
                  />
                </div>
              </div>
              {verdict.fixes.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <MicroLabel>What would get you there</MicroLabel>
                  {verdict.fixes.map((fix) => (
                    <div key={fix.kind} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                      <span className="text-sm text-foreground">{fix.text}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          fix.kind === "later"
                            ? onRetirementAge(fix.age)
                            : patch({ annualContribution: inputs.annualContribution + fix.monthly * 12 })
                        }
                      >
                        {fix.press}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : verdict.status === "never" ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  On this saving the money does not catch up before 80. Putting in more each month, or a simpler
                  life, is what moves it.
                </p>
              ) : null}
              {verdict.sooner && earliestAge != null ? (
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <span className="text-sm text-foreground">{verdict.sooner}</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => onRetirementAge(earliestAge)}>
                    Show me {Math.round(earliestAge)}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div />
          )}

          {/* One month of retirement, as the things a person already pays for. */}
          {month && month.total > 0.5 ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted-foreground">A month of retirement at {month.age}</span>
                <span className="font-mono text-sm tabular-nums text-foreground">{money(month.total)}</span>
              </div>
              <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
                {month.parts.map((p) => (
                  <span
                    key={p.id}
                    className={cn("h-full first:rounded-l-full last:rounded-r-full", PART_TONE[p.id])}
                    style={{ flexGrow: p.monthly, flexBasis: 0 }}
                  />
                ))}
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
                {month.parts.map((p) => (
                  <li key={p.id} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn("size-2 rounded-full", PART_TONE[p.id])} aria-hidden />
                    {p.label}
                    <span className="font-mono tabular-nums text-foreground">{money(p.monthly)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {month.pensionFrom == null
                  ? "No pension in this plan, so your savings pay all of it."
                  : month.pensionFrom <= month.age
                    ? `Pensions pay ${money(month.pension)} of it. Your savings pay the rest.`
                    : `Your savings pay all of it until ${month.pensionFrom}. From then, pensions pay ${money(month.pensionMonthly)} a month.`}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* HOW MUCH THE ANSWER LEANS ON GROWTH. */}
      {scenarios.length > 1 ? (
        <div className="flex flex-col gap-3">
          <MicroLabel>If your money grows slower, or faster</MicroLabel>
          <div
            className={cn("grid gap-2", scenarios.length > 3 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}
            role="radiogroup"
            aria-label="Growth rate"
          >
            {scenarios.map((s) => {
              const on = Math.abs(s.pct - equity) < 0.05;
              const works = s.earliestAge != null && s.earliestAge <= age;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => patch({ returns: { ...inputs.returns, equityPct: s.pct } })}
                  className={cn(
                    CARD,
                    "lift flex flex-col gap-1 px-3 py-3 text-left transition-colors",
                    on ? "outline-2 -outline-offset-2 outline-primary" : "hover:bg-foreground/[0.04]"
                  )}
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="text-sm font-medium text-foreground">{s.label}</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">{s.pct.toFixed(1)}%</span>
                  </span>
                  <span className="hidden text-xs text-muted-foreground sm:block">{s.note}</span>
                  <span className={cn("mt-1 text-sm", works ? "text-foreground" : "text-muted-foreground")}>
                    {s.earliestAge == null ? "Not before 80" : `Stop at ${s.earliestAge}`}
                  </span>
                </button>
              );
            })}
          </div>
          {equity > PORTFOLIO_RATE_CEILING_PCT && holdingsView != null ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              &ldquo;Yours&rdquo; is this app&apos;s view of the next few years for what you own, not a record. No whole market
              has grown that fast for a lifetime.
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {onCash
          ? `Held as cash and spent to nothing by ${plan.planningAge}. `
          : `The picture grows at the same rate every year. The answer allows for a bad run of markets, which is why it asks for more than the picture spends. `}
        All in today&apos;s money. {ADVICE_DISCLAIMER_SHORT}
      </p>
    </Panel>
    </LiveAnswer.Provider>
  );
}
