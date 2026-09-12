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
 * THE DETAIL CONTROL IS HERE RATHER THAN AT THE FOOT. It is the answer to
 * "where are the other dials", and a reader asks that at the top, next to
 * the thing that looks too simple, not after scrolling past six panels.
 */

import { Button } from "@/components/ui/button";
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
  MoneyField,
  currencyCodeFor,
} from "@/components/retirement/fields";
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
  type RetirementInputs,
} from "@/lib/retirement/plan";
import {
  DETAIL_BLURB,
  DETAIL_LABEL,
  RETIREMENT_DETAILS,
  type RetirementDetail,
} from "@/lib/retirement/detail";
import {
  RETIREMENT_TEMPLATES,
  templateById,
  templateInputs,
  type RetirementTemplateId,
} from "@/lib/retirement/templates";
import { Rocket, SlidersHorizontal } from "lucide-react";
import { useId } from "react";

type Patch = (next: Partial<RetirementInputs>) => void;

export function QuickStart({
  inputs,
  patch,
  replace,
  portfolioValue,
  detail,
  onDetailChange,
  templateId,
  onTemplate,
}: {
  inputs: RetirementInputs;
  patch: Patch;
  /** A template replaces the whole plan, so it cannot go through `patch`. */
  replace: (next: RetirementInputs) => void;
  portfolioValue: number | null;
  detail: RetirementDetail;
  onDetailChange: (next: RetirementDetail) => void;
  templateId: RetirementTemplateId | null;
  onTemplate: (id: RetirementTemplateId) => void;
}) {
  const region = regionById(inputs.regionId);
  const code = currencyCodeFor(region.currency);
  const regionSelectId = useId();
  const amounts = livingStandardsFor(region, inputs.household);
  const standardNow =
    inputs.spendingMode === "standard" ? inputs.standard : null;
  const chosen = templateById(templateId);

  return (
    <Panel>
      <PanelHeader
        icon={<Rocket className="h-4 w-4" />}
        title="Start here"
        subtitle="Press the life that looks most like yours and the whole plan fills in. Then correct the few figures that are actually yours. Everything below is the answer, and none of it needs anything else from you."
      />

      <div className="flex flex-col gap-3">
        <MicroLabel>Pick a starting point</MicroLabel>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {RETIREMENT_TEMPLATES.map((template) => {
            const on = template.id === templateId;
            return (
              <button
                key={template.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  replace(templateInputs(template, inputs.regionId));
                  onTemplate(template.id);
                }}
                className={cn(
                  CARD,
                  "flex min-w-0 flex-col gap-1 p-3 text-left transition-colors",
                  /*
                    An outline, not a ring. `ring-*` is a box-shadow
                    utility and `.glass-well` sets `box-shadow` directly
                    from the same cascade layer, later in the file, so the
                    ring loses and the chosen card looks exactly like the
                    other seven. Measured on the rendered card: the whole
                    of its computed shadow was the well's own 1px rim.
                  */
                  on
                    ? "outline-2 -outline-offset-2 outline-primary"
                    : "hover:outline-1 hover:-outline-offset-1 hover:outline-border"
                )}
              >
                <span className="text-sm font-semibold text-foreground">
                  {template.label}
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {template.blurb}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {chosen ? (
            <>
              Everything below is worked from the{" "}
              <span className="text-foreground">{chosen.label}</span> figures
              until you change them, and they are a plausible life rather than
              a guess about yours. Correct the six below and the answers follow
              you.
            </>
          ) : (
            <>
              A template is a plausible life, not a guess about yours. Every
              figure it fills in is visible and changeable, and all eight use
              the same market assumptions, so the difference between two of
              them is the difference between two lives.
            </>
          )}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <MicroLabel>The figures only you know</MicroLabel>
        <div className={FIELD_GRID}>
          <Field
            label="Country"
            htmlFor={regionSelectId}
            note="Decides the prices, the state pension and the age it starts."
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
          <Field label="Planning for" note="A couple costs more than one person and much less than two.">
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
            note="Move this more than anything else here. It changes the answer more than any other figure on the page."
          />
          <MoneyField
            label="Invested for this now"
            value={inputs.currentPot}
            currency={code}
            onChange={(currentPot) => patch({ currentPot })}
            note={
              portfolioValue != null && portfolioValue > 0 ? (
                <span>
                  Your portfolios are worth{" "}
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:text-foreground"
                    onClick={() => patch({ currentPot: portfolioValue })}
                  >
                    {currency(portfolioValue, 0, "USD")}
                  </button>
                  . Press it to use that figure.
                </span>
              ) : (
                "Everything already put away for this, wherever it sits. A house you live in is not part of it."
              )
            }
          />
          <MoneyField
            label="You add, a year"
            value={inputs.annualContribution}
            currency={code}
            onChange={(annualContribution) => patch({ annualContribution })}
            note="Everything that goes in, yours and your employer's."
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Field
          label="The life you want"
          note={
            standardNow
              ? STANDARD_BLURB[standardNow]
              : "You have typed your own figure further down, so these are switched off. Press one to come back to a published basket."
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
            onChange={(standard) =>
              patch({
                spendingMode: "standard",
                standard,
                customAnnualSpend: amounts[standard],
              })
            }
          />
        </Field>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {standardNow ? (
            <>
              <span className="font-mono tabular-nums text-foreground">
                {currency(amounts[standardNow], 0, region.currency)}
              </span>{" "}
              a year, after tax, in today&apos;s money, with housing counted
              separately. Published figures for {region.name}.
            </>
          ) : (
            <>
              <span className="font-mono tabular-nums text-foreground">
                {currency(inputs.customAnnualSpend, 0, region.currency)}
              </span>{" "}
              a year, your own figure, after tax and with housing counted
              separately.
            </>
          )}
        </p>
      </div>

      {/*
        Deliberately not inside a `CARD`. A card's own padding costs 32px of
        a 360px phone, which at three equal cells is the 3px that broke
        "Everything" onto two lines, and a control that decides what the
        whole page shows is not a nested well anyway.
      */}
      <div className="flex flex-col gap-3">
        <MicroLabel>
          <span className="inline-flex items-center gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            How much of it you want to see
          </span>
        </MicroLabel>
        {/*
          Full width with a column per level rather than a compact toggle
          beside the label. Compact cells are `flex-1` from a zero basis,
          so they divide whatever the row has left equally and the longest
          label is the one that loses: measured at every width from 360 to
          1280, "Everything" was clipped by 3px while "Simple" sat in space
          it did not need.
        */}
        <Segmented<RetirementDetail>
          options={RETIREMENT_DETAILS.map((id) => ({
            id,
            label: DETAIL_LABEL[id],
          }))}
          value={detail}
          columns={3}
          ariaLabel="How much of it you want to see"
          onChange={onDetailChange}
        />
        <p className="text-sm leading-relaxed text-muted-foreground">
          {DETAIL_BLURB[detail]}
        </p>
        {detail === "simple" ? (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onDetailChange("more")}
            >
              Show me the other dials
            </Button>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
