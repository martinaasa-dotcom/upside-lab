"use client";

/**
 * THE FIRST CARD, AND FOR MOST READERS THE ONLY ONE THEY WILL EVER TYPE IN.
 *
 * Everything below this on the page is an answer. This is the whole of the
 * question, and it is deliberately one screen: press a life, correct the
 * half-dozen figures that are actually yours, and read the rest.
 *
 * WHY A TEMPLATE ROW AND NOT A BETTER FORM. The forty inputs under
 * `PlanInputs` are not padding, they are the reason this module gets the
 * shape of a retirement right where a single average gets it wrong. They
 * are also unanswerable cold. Nobody knows what a child costs a year, and
 * being asked is what makes a page feel like work. A template answers all
 * of them at once with a life the reader can see the shape of, which is a
 * far better starting point than a blank field and an honest one, because
 * every figure it filled in is visible and editable one level down.
 *
 * WHAT IS AN ESSENTIAL AND WHAT IS NOT. Eight controls survive here, and
 * the test each one passed is whether a wrong answer would move the number
 * by a lot AND only the reader can supply it. The age you stop is the
 * biggest lever on the page. What you already have and what you add each
 * year are the two figures nothing can guess. The country decides the
 * prices, the pension and its age. Everything else has a defensible
 * published default, so it is filled in rather than asked for.
 *
 * THE DETAIL CONTROL LEADS THE CARD, BEFORE THE TEMPLATES AND BEFORE THE
 * ESSENTIALS. It used to sit at the foot, under everything else this card
 * asks, which put "how much do you want to see" last, as if it were a
 * footnote instead of the thing that decides what the rest of the page
 * looks like. It is also why `PlanInputs` no longer asks anything this card
 * already asks: with the level chosen first, opening a deeper level was
 * pulling in a second, near-identical copy of the country, the ages and the
 * pot, a screen below the first, with nothing on the page saying the two
 * were the same question. Now a level change only ever adds panels this
 * card has not touched.
 */

import {
  CARD,
  MicroLabel,
  Panel,
  PanelHeader,
  Segmented,
} from "@/components/ui/Panel";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { cn, currency } from "@/lib/format";
import {
  CountField,
  Field,
  FIELD_GRID,
  MonthlyMoneyField,
  currencyCodeFor,
} from "@/components/retirement/fields";
import { PotField } from "@/components/retirement/PotField";
import {
  POT_SOURCE_BOOK,
  type PortfolioPotOption,
} from "@/lib/retirement/pot-source";
import {
  LIVING_STANDARDS,
  REGIONS,
  STANDARD_BLURB,
  STANDARD_LABEL,
  livingStandardsFor,
  regionById,
  type Household,
  type LivingStandard,
} from "@/lib/retirement/regions";
import {
  retargetHousehold,
  retargetRegion,
  retargetRetirementAge,
  retargetStandard,
  type RetirementInputs,
} from "@/lib/retirement/plan";
import { REAL_RETURN_ASSUMPTIONS } from "@/lib/retirement/returns";
import { AdjustChips } from "@/components/retirement/AdjustChips";
import type { AdjustTopic } from "@/lib/retirement/adjust";
import {
  RETIREMENT_TEMPLATES,
  templateById,
  templateFacts,
  type RetirementTemplateId,
} from "@/lib/retirement/templates";
import { quickResultLine } from "@/lib/retirement/summary";
import { Rocket, TrendingUp } from "lucide-react";
import { useId } from "react";

type Patch = (next: Partial<RetirementInputs>) => void;

const EMPTY_SHEETS: PortfolioPotOption[] = [];

export function QuickStart({
  inputs,
  patch,
  replace,
  portfolioValue,
  sheets = EMPTY_SHEETS,
  potSource = POT_SOURCE_BOOK,
  onPotSourceChange = () => {},
  open,
  onToggle,
  planningAge,
  swrPct,
  templateId,
  onTemplate,
  portfolioRatePct = null,
  result,
}: {
  inputs: RetirementInputs;
  patch: Patch;
  /** The region and household controls replace the whole plan too. */
  replace: (next: RetirementInputs) => void;
  portfolioValue: number | null;
  /** One portfolio each, for a reader who wants to pick rather than combine. */
  sheets?: PortfolioPotOption[];
  /** Which real portfolio, or `custom`, the pot field currently tracks. */
  potSource?: string;
  onPotSourceChange?: (source: string) => void;
  /** Which editors are open under the card. */
  open: readonly AdjustTopic[];
  onToggle: (topic: AdjustTopic) => void;
  planningAge: number;
  swrPct: number;
  templateId: RetirementTemplateId | null;
  /**
   * A press names a whole new life. It is handed the id rather than a
   * built plan because applying it also has to decide the pot, and that
   * decision needs `potSource` and the reader's real portfolios, neither
   * of which this card owns.
   */
  onTemplate: (id: RetirementTemplateId) => void;
  /**
   * The same blended growth rate Compound's "Your rate" preset shows for
   * these holdings, turned real. Null when there is nothing to blend, in
   * which case the world index is the only figure on offer and the toggle
   * below does not draw at all.
   */
  portfolioRatePct?: number | null;
  /** What this plan currently needs, so a press changes something here. */
  result: { target: number; earliestAge: number | null };
}) {
  const region = regionById(inputs.regionId);
  const code = currencyCodeFor(region.currency);
  const regionSelectId = useId();
  const amounts = livingStandardsFor(region, inputs.household);
  const standardNow =
    inputs.spendingMode === "standard" ? inputs.standard : null;
  const chosen = templateById(templateId);
  /*
    Everything in the plan that costs or pays money and is not one of the
    eight figures on this card. At the deeper levels the panels below say
    all of it in full, so printing it twice would be scaffolding; at
    `simple` those panels are not on the page and the reader would
    otherwise be arguing with a figure whose inputs they cannot see.
  */

  /*
    The world index wins a tie, the same way Compound's own rate preset
    breaks one: a portfolio whose blend happens to land on the world figure
    should not light "Your blend" and print a caveat over a number that is
    simply the market average. `custom` covers both a figure typed in here
    and the exact bond/cash/fee editing `ReturnsPanel` offers under its own chip,
    which is the only way the equity figure moves without matching either
    preset.
  */
  const ratePreset: "world" | "blend" | "custom" =
    Math.abs(inputs.returns.equityPct - REAL_RETURN_ASSUMPTIONS.equityPct) < 0.05
      ? "world"
      : portfolioRatePct != null &&
          Math.abs(inputs.returns.equityPct - portfolioRatePct) < 0.05
        ? "blend"
        : "custom";

  return (
    <Panel>
      <PanelHeader
        icon={<Rocket className="h-4 w-4" />}
        title="Start here"
        subtitle="Pick the life closest to yours, fix the figures only you know, and tick anything else you want to change."
      />

      <div className="flex flex-col gap-3">
        <MicroLabel>Pick a starting point</MicroLabel>
        {/*
            Two up on a phone, not one. Measured at 390: eight cards in a
            single column is 840px of templates on its own, which put the
            headline figure three screens down on the one device most
            readers arrive on. Two columns halve it and the blurb still
            reads, which is what makes a card pressable without trying it.

            This is the one press that matters most on the whole page, so
            the cards carry more than a label and a sentence now: a facts
            row (`templateFacts`) states the age, the household and the one
            circumstance that actually shapes that life's numbers, in
            plain figures a reader can check against themselves without
            reading the blurb first. The card grew to carry it, at `p-4`
            rather than `p-3` and a bigger label, because a press this
            important should not be the smallest text on the card.
          */}
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {RETIREMENT_TEMPLATES.map((template) => {
            const on = template.id === templateId;
            return (
              <button
                key={template.id}
                type="button"
                aria-pressed={on}
                onClick={() => onTemplate(template.id)}
                className={cn(
                  CARD,
                  "veil-hover flex min-w-0 flex-col gap-1 border-2 px-3.5 py-3 text-left transition-colors",
                  /*
                    A real `border`, not a ring and not an outline. `ring-*`
                    is a box-shadow utility and `.glass-well` sets
                    `box-shadow` directly from the same cascade layer, later
                    in the file, so the ring loses and the chosen card looked
                    exactly like the other seven. `outline` avoided that, but
                    an outline is not clipped to the element's own
                    border-radius the way a border is: at a -1px offset on a
                    rounded corner it draws its own approximation of the
                    curve, which is a different curve, so the two disagreed
                    right where they were closest and the mismatch read as a
                    bulge past the card's own edge on hover. A border is
                    part of the box itself, so it is always exactly the same
                    radius as the card, and it is a different property from
                    `box-shadow`, so `.glass-well` cannot swallow it. The
                    border is reserved at 2px even when transparent, so
                    gaining a colour on hover recolours a line that was
                    already there rather than growing one from nothing.

                    `veil-hover` is the same convention every other
                    pressable card in the app uses: without it the only
                    hover feedback here was the border, where elsewhere a
                    card also catches the light across its whole face.
                  */
                  on
                    ? "border-primary"
                    : "border-transparent hover:border-border"
                )}
              >
                <span className="text-sm font-semibold text-foreground">
                  {template.label}
                </span>
                {/*
                  The facts only. Each card used to carry its own paragraph
                  as well, eight of them side by side, which made the one
                  choice on this card read as an essay; the paragraph for
                  the life that is chosen is printed once, under the grid.
                */}
                <span className="truncate font-mono text-xs tabular-nums text-muted-foreground/80">
                  {templateFacts(template).join(" · ")}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-sm leading-relaxed text-foreground">
          {quickResultLine({
            target: result.target,
            retirementAge: inputs.retirementAge,
            earliestAge: result.earliestAge,
            money: (n) => currency(n, 0, region.currency),
          })}
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {chosen ? (
            <>
              <span className="text-foreground">{chosen.label}</span>:{" "}
              {chosen.blurb} Every figure below starts from this life until
              you change it.
            </>
          ) : (
            "A template is a starting point, not a guess about you. Every figure it fills in is visible and changeable."
          )}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <MicroLabel>The figures only you know</MicroLabel>
        <div className={FIELD_GRID}>
          <Field
            label="Country"
            htmlFor={regionSelectId}
            note="Sets prices and the state pension."
          >
            <NativeSelect
              id={regionSelectId}
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
          </Field>
          <Field label="Planning for">
            <Segmented<Household>
              options={[
                { id: "single", label: "One person" },
                { id: "couple", label: "A couple" },
              ]}
              value={inputs.household}
              columns={2}
              ariaLabel="Planning for"
              onChange={(household) =>
                replace(retargetHousehold(inputs, household))
              }
            />
          </Field>
          <CountField
            label="Your age now"
            value={inputs.currentAge}
            onChange={(currentAge) => patch({ currentAge })}
            min={16}
            max={90}
            suffix="years"
          />
          <CountField
            label="The age you want to stop"
            value={inputs.retirementAge}
            onChange={(retirementAge) =>
              replace(retargetRetirementAge(inputs, retirementAge))
            }
            min={Math.max(16, inputs.currentAge)}
            max={90}
            suffix="years"
            note="The biggest lever on this page."
          />
          {/*
            THE DEFAULT IS ALWAYS A REAL PORTFOLIO, NEVER A TEMPLATE'S
            GUESS. `potSource` (owned by `RetirementSheet`) stays pointed
            at the reader's combined total until they say otherwise, so
            pressing a different life never swaps in that life's own
            made-up savings while a real figure is sitting right here. The
            picker inside `PotField` is what lets a reader with more than
            one portfolio say which one this plan is for, rather than
            always being handed everything they own; `PlanInputs` draws
            the same field lower down the page and reads the same source,
            so the two copies of this figure cannot disagree.
          */}
          <PotField
            value={inputs.currentPot}
            currency={code}
            onChange={(currentPot) => patch({ currentPot })}
            portfolioValue={portfolioValue}
            sheets={sheets}
            potSource={potSource}
            onPotSourceChange={onPotSourceChange}
          />
          <MonthlyMoneyField
            label="You add, a month"
            value={inputs.annualContribution}
            currency={code}
            onChange={(annualContribution) => patch({ annualContribution })}
            note="Yours and your employer's, combined."
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Field
          label="The life you want"
          note={
            standardNow
              ? STANDARD_BLURB[standardNow]
              : "You typed your own figure. Press one of these to use a basket instead."
          }
        >
          <Segmented<LivingStandard>
            options={LIVING_STANDARDS.map((id) => ({
              id,
              label: STANDARD_LABEL[id],
            }))}
            value={standardNow}
            /*
              No `columns`, so the cells hug their own labels rather than
              taking an equal third of the row. Measured at 360 in the app's
              own face, three equal thirds give "Comfortable" 78px for 82px
              of word and it breaks mid-word, which reads as a broken
              control rather than as a wrapped one.
            */
            ariaLabel="The life you want"
            onChange={(standard) => patch(retargetStandard(inputs, standard))}
          />
        </Field>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {standardNow ? (
            <>
              <span className="font-mono tabular-nums text-foreground">
                {currency(Math.round(amounts[standardNow] / 12), 0, region.currency)}
              </span>{" "}
              a month, after tax. Housing is counted separately.
            </>
          ) : (
            <>
              <span className="font-mono tabular-nums text-foreground">
                {currency(Math.round(inputs.customAnnualSpend / 12), 0, region.currency)}
              </span>{" "}
              a month, your own figure, after tax. Housing is counted
              separately.
            </>
          )}
        </p>
        {/*
          A reader whose plan already carries their own spending figure gets
          the field here rather than a sentence pointing at a panel that may
          not be on the page. The note used to say "further down", which at
          the simplest level named nothing: the figure was in the headline,
          unreadable and uneditable, and the three baskets beside it all
          looked switched off for no visible reason.
        */}
        {standardNow ? null : (
          <MonthlyMoneyField
            label="Your own figure, a month"
            value={inputs.customAnnualSpend}
            currency={code}
            onChange={(customAnnualSpend) =>
              patch({ spendingMode: "custom", customAnnualSpend })
            }
            note="After tax. Housing is counted separately."
          />
        )}
      </div>

      {/*
        WHAT THE MONEY EARNS, AS A QUICK TOGGLE, EVEN AT THE SIMPLEST LEVEL.
        This used to be buried in a panel at the foot of the page, behind
        the deepest detail level, so almost nobody who was not already
        looking for it ever saw what the whole plan assumed shares earn.
        It is one of the two biggest levers here (the retirement age is the
        other), so it gets the same weight as the templates: a toggle
        rather than a field, defaulting to the reader's own blend the
        moment one is available (`RetirementSheet`'s one-shot pre-fill).
        Typing an exact figure, splitting bonds and cash out on their own,
        or a mix that shifts more than twice over a life is still one
        press away on the "Returns and mix" chip.
      */}
      <div className="flex flex-col gap-3">
        <MicroLabel>
          <span className="inline-flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            What your money earns
          </span>
        </MicroLabel>
        {portfolioRatePct != null ? (
          <Segmented<"world" | "blend">
            options={[
              {
                id: "world",
                label: `World index, ${REAL_RETURN_ASSUMPTIONS.equityPct}%`,
              },
              {
                id: "blend",
                label: `Your blend, ${portfolioRatePct.toFixed(1)}%`,
              },
            ]}
            value={ratePreset === "custom" ? null : ratePreset}
            columns={2}
            ariaLabel="What your money earns"
            onChange={(id) =>
              patch({
                returns: {
                  ...inputs.returns,
                  equityPct:
                    id === "blend" ? portfolioRatePct : REAL_RETURN_ASSUMPTIONS.equityPct,
                },
              })
            }
          />
        ) : null}
        <p className="text-sm leading-relaxed text-muted-foreground">
          {ratePreset === "blend" ? (
            <>
              What your own holdings have usually returned, real: about{" "}
              <span className="font-mono tabular-nums text-foreground">
                {inputs.returns.equityPct.toFixed(1)}%
              </span>{" "}
              a year. Treat it as optimistic rather than a safe planning
              assumption.
            </>
          ) : ratePreset === "world" ? (
            <>
              The world stock index&apos;s long run real return,{" "}
              <span className="font-mono tabular-nums text-foreground">
                {REAL_RETURN_ASSUMPTIONS.equityPct}%
              </span>{" "}
              a year. What the plan assumes shares earn, after inflation.
            </>
          ) : (
            <>
              Your own figure,{" "}
              <span className="font-mono tabular-nums text-foreground">
                {inputs.returns.equityPct.toFixed(1)}%
              </span>{" "}
              a year. Bonds, cash, fees, and how the mix shifts as you age
              are under &quot;Returns and mix&quot;, at the foot of this card.
            </>
          )}
        </p>
      </div>

      <AdjustChips
        inputs={inputs}
        open={open}
        onToggle={onToggle}
        money={(n) => currency(n, 0, region.currency)}
        planningAge={planningAge}
        swrPct={swrPct}
      />
    </Panel>
  );
}
