"use client";

/**
 * Everything the plan is built from, grouped by the question it answers.
 *
 * The order is the order somebody thinks in, not the order the arithmetic
 * needs: where you are, what kind of life you want, what your home costs,
 * who depends on you, what you already have, what the state owes you. The
 * hard, technical inputs are not here at all. They live in Assumptions at
 * the foot of the page, because a reader who has to pick an equity glide
 * path before they can find out what a retirement costs will close the tab.
 *
 * WHAT IS DELIBERATELY NOT ASKED. Nothing about salary, and nothing about
 * job or employer. A salary would let the page estimate a contribution and
 * a state pension entitlement, and it would also be the single most
 * sensitive number in the app, kept for a convenience the reader can supply
 * in one field themselves. The plan never leaves this browser, and asking
 * for less is most of how that promise is kept.
 */

import { Button } from "@/components/ui/button";
import { CARD, MicroLabel, Panel, PANEL_STACK, PanelHeader } from "@/components/ui/Panel";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { cn, currency } from "@/lib/format";
import {
  ChoiceField,
  CountField,
  Field,
  FIELD_GRID,
  MoneyField,
  MonthlyMoneyField,
  PercentField,
  currencyCodeFor,
} from "@/components/retirement/fields";
import {
  LIVING_STANDARDS,
  REGIONS,
  STANDARD_BLURB,
  STANDARD_LABEL,
  UK_COST_ANCHORS,
  livingStandardsFor,
  regionById,
  type Household,
  type LivingStandard,
} from "@/lib/retirement/regions";
import {
  retargetHousehold,
  retargetRegion,
  type Housing,
  type RetirementInputs,
} from "@/lib/retirement/plan";
import type { Sex } from "@/lib/retirement/longevity";
import { Baby, Car, Check, Home, PiggyBank, UserRound, Wallet } from "lucide-react";
import { useId } from "react";

type Patch = (next: Partial<RetirementInputs>) => void;

/** The three baskets as pressable cards, which is what the row is for. */
function StandardPicker({
  inputs,
  patch,
  code,
}: {
  inputs: RetirementInputs;
  patch: Patch;
  code: string;
}) {
  const region = regionById(inputs.regionId);
  const amounts = livingStandardsFor(region, inputs.household);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {LIVING_STANDARDS.map((id: LivingStandard) => {
        const chosen = inputs.spendingMode === "standard" && inputs.standard === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={chosen}
            onClick={() =>
              patch({
                spendingMode: "standard",
                standard: id,
                customAnnualSpend: amounts[id],
              })
            }
            className={cn(
              CARD,
              "veil-hover flex min-w-0 flex-col gap-2 border-2 p-4 text-left transition-colors",
              chosen ? "border-primary" : "border-transparent hover:border-border"
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "font-semibold",
                  chosen ? "text-primary" : "text-foreground"
                )}
              >
                {STANDARD_LABEL[id]}
              </span>
              <Check
                aria-hidden
                className={cn(
                  "h-4 w-4 shrink-0 text-primary",
                  chosen ? "" : "opacity-0"
                )}
              />
            </span>
            <span className="font-mono text-lg tabular-nums text-foreground">
              {currency(Math.round(amounts[id] / 12), 0, code)}
              <span className="ml-1 font-sans text-xs text-muted-foreground">
                a month
              </span>
            </span>
            <span className="text-xs leading-relaxed text-muted-foreground">
              {STANDARD_BLURB[id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function PlanInputs({
  inputs,
  patch,
  portfolioValue,
}: {
  inputs: RetirementInputs;
  patch: Patch;
  /** What the reader actually holds, so the pot can be filled from it. */
  portfolioValue: number | null;
}) {
  const region = regionById(inputs.regionId);
  const code = currencyCodeFor(region.currency);
  const regionSelectId = useId();
  const costsId = useId();

  return (
    <div className={PANEL_STACK}>
      <Panel>
        <PanelHeader
          icon={<UserRound className="h-4 w-4" />}
          title="You"
          subtitle="Where you live decides the prices, the state pension and the age it starts. Everything below opens on that country's published figures and every one of them can be changed."
        />
        <div className={FIELD_GRID}>
          <Field label="Country" htmlFor={regionSelectId} note="The country you expect to retire in, which need not be the one you are in now.">
            {/*
              `NativeSelect` IS the select, not a wrapper around one. Nesting
              a second inside it renders an empty control: the outer element
              has no options of its own, so the country picker came up blank
              on the first real render of this page.
            */}
            <NativeSelect
              id={regionSelectId}
              value={inputs.regionId}
              onChange={(e) => patch(retargetRegion(inputs, e.target.value))}
              className="w-full"
            >
              {REGIONS.map((r) => (
                <NativeSelectOption key={r.id} value={r.id}>
                  {r.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <ChoiceField<Household>
            label="Planning for"
            value={inputs.household}
            options={[
              { id: "single", label: "One person" },
              { id: "couple", label: "A couple" },
            ]}
            onChange={(household) => patch(retargetHousehold(inputs, household))}
            note="A couple costs more than one person and much less than two, which is why the published baskets have both."
          />
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
            onChange={(retirementAge) => patch({ retirementAge })}
            min={Math.max(16, inputs.currentAge)}
            max={90}
            suffix="years"
            note="Move this more than anything else on the page. It changes the answer more than any other input."
          />
          <ChoiceField<Sex>
            label="For the longevity figures"
            value={inputs.sex}
            options={[
              { id: "female", label: "Woman" },
              { id: "male", label: "Man" },
              { id: "average", label: "Either" },
            ]}
            onChange={(sex) => patch({ sex })}
            note="Only used to pick which published life expectancy the survival curve is fitted to. Women live about three years longer on average, so it changes how long the money must last."
          />
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          icon={<Wallet className="h-4 w-4" />}
          title="The life you want"
          subtitle="After tax, in today's money, and housing is not in these figures. Pick one of the three published standards or type your own over them."
        />
        <StandardPicker inputs={inputs} patch={patch} code={region.currency} />
        <div className={FIELD_GRID}>
          <MonthlyMoneyField
            label="Or your own figure, a month"
            value={inputs.customAnnualSpend}
            currency={code}
            onChange={(customAnnualSpend) =>
              patch({ spendingMode: "custom", customAnnualSpend })
            }
            note="Typing here switches off the cards above. What you spend now, less the mortgage if it will be gone, less what you save, is usually closer than people expect."
          />
          <PercentField
            label="Tax on what you draw out"
            value={inputs.withdrawalTaxPct}
            digits={1}
            onChange={(withdrawalTaxPct) => patch({ withdrawalTaxPct })}
            note="Leave at zero if your savings come out tax free. Otherwise the plan draws enough extra to still land the figure above."
          />
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          icon={<Home className="h-4 w-4" />}
          title="Your home"
          subtitle="The published baskets assume a home owned outright, which is not most people. This is where that assumption gets corrected, and for a renter it is the largest single line on the page."
        />
        <ChoiceField<Housing>
          label="By the time you stop working"
          value={inputs.housing}
          options={[
            { id: "owned", label: "Owned outright" },
            { id: "mortgage", label: "Still paying" },
            { id: "renting", label: "Renting" },
          ]}
          onChange={(housing) => patch({ housing })}
          columns={3}
        />
        {inputs.housing === "mortgage" ? (
          <div className={FIELD_GRID}>
            <MonthlyMoneyField
              label="Mortgage a month"
              value={inputs.mortgageAnnual}
              currency={code}
              onChange={(mortgageAnnual) => patch({ mortgageAnnual })}
              note={`Opened on ${currency(UK_COST_ANCHORS.mortgageAnnual / 12, 0, "GBP")} a month at UK prices, moved onto ${region.name}'s.`}
            />
            <CountField
              label="Years left on it"
              value={inputs.mortgageYearsLeft}
              onChange={(mortgageYearsLeft) => patch({ mortgageYearsLeft })}
              max={60}
              suffix="years"
              note="Counted from today. A mortgage that ends partway through retirement makes the early years dear and the rest ordinary, which is exactly the shape a single average would hide."
            />
          </div>
        ) : inputs.housing === "renting" ? (
          <MonthlyMoneyField
            label="Rent a month"
            value={inputs.rentAnnual}
            currency={code}
            onChange={(rentAnnual) => patch({ rentAnnual })}
            note={`Rent never ends, so this is carried to the last year of the plan. Opened on ${currency(UK_COST_ANCHORS.rentMonthly, 0, "GBP")} a month at UK prices, moved onto ${region.name}'s.`}
          />
        ) : null}
      </Panel>

      <Panel>
        <PanelHeader
          icon={<Baby className="h-4 w-4" />}
          title="Children"
          subtitle="Each child is counted from the age they are now until the age they stop costing money, so they drop off the plan on the right year rather than being averaged across it."
        />
        <div className={cn(CARD, "flex flex-col gap-3 p-4")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <MicroLabel>
              {inputs.children.length === 0
                ? "No children on the plan"
                : `${inputs.children.length} on the plan`}
            </MicroLabel>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                patch({
                  children: [
                    ...inputs.children,
                    { id: `child-${Date.now()}`, age: 0 },
                  ],
                })
              }
            >
              Add a child
            </Button>
          </div>
          {inputs.children.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {inputs.children.map((child, i) => (
                <div key={child.id} className="flex items-end gap-2">
                  <CountField
                    label={`Child ${i + 1} age`}
                    value={child.age}
                    min={0}
                    max={60}
                    onChange={(age) =>
                      patch({
                        children: inputs.children.map((c) =>
                          c.id === child.id ? { ...c, age } : c
                        ),
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mb-1"
                    onClick={() =>
                      patch({
                        children: inputs.children.filter((c) => c.id !== child.id),
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {inputs.children.length > 0 ? (
          <div className={FIELD_GRID}>
            <MonthlyMoneyField
              label="Each child, a month"
              value={inputs.childAnnualCost}
              currency={code}
              onChange={(childAnnualCost) => patch({ childAnnualCost })}
              note={UK_COST_ANCHORS.childSource}
            />
            <CountField
              label="Until they are"
              value={inputs.childUntilAge}
              onChange={(childUntilAge) => patch({ childUntilAge })}
              min={0}
              max={40}
              suffix="years old"
              note="18 for most people. 21 or more if you expect to support them through university."
            />
          </div>
        ) : null}
      </Panel>

      <Panel>
        <PanelHeader
          icon={<Car className="h-4 w-4" />}
          title="A car"
          subtitle="A lease or a finance payment is one of the few costs that can genuinely never end, and whether yours does changes the pot more than most people guess."
        />
        <div className={FIELD_GRID}>
          <MoneyField
            label="A month"
            value={inputs.carMonthly}
            currency={code}
            onChange={(carMonthly) => patch({ carMonthly })}
            note={`Leave at zero if you own a car outright or do not have one. Opened on ${currency(UK_COST_ANCHORS.carMonthly, 0, "GBP")} a month at UK prices.`}
          />
          {inputs.carForever ? null : (
            <CountField
              label="Years of payments left"
              value={inputs.carYearsLeft}
              onChange={(carYearsLeft) => patch({ carYearsLeft })}
              max={60}
              suffix="years"
              note="Counted from today, the same as the mortgage, so it can finish well before you stop working or run years into retirement depending on how far off that is."
            />
          )}
        </div>
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="min-w-0 text-sm text-muted-foreground">
            I will always have a car payment
          </span>
          <Switch
            checked={inputs.carForever}
            onCheckedChange={(carForever) => patch({ carForever })}
          />
        </label>
      </Panel>

      <Panel>
        <PanelHeader
          icon={<PiggyBank className="h-4 w-4" />}
          title="What you have and what you add"
          subtitle="Only money meant for this. A house you live in is not part of the pot, because selling it to eat means living somewhere else."
        />
        <div className={FIELD_GRID}>
          <MoneyField
            label="Invested now"
            value={inputs.currentPot}
            currency={code}
            onChange={(currentPot) => patch({ currentPot })}
            note={
              portfolioValue != null && portfolioValue > 0 ? (
                inputs.currentPot === Math.round(portfolioValue) ? (
                  /*
                    THE FIRST VISIT ALREADY APPLIED THIS FIGURE, so a note
                    still inviting a press here would be inviting a press
                    that does nothing, which is the stale-copy fault this
                    file's own AGENTS.md keeps finding in other rooms. Once
                    the two agree, the sentence says why they agree instead.
                  */
                  <span>
                    Pre-filled from what your portfolios are worth,{" "}
                    {currency(portfolioValue, 0, "USD")}. Type over it if that
                    figure includes money not meant for this.
                  </span>
                ) : (
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
                )
              ) : (
                "Everything already invested for this, wherever it sits."
              )
            }
          />
          <MoneyField
            label="Other savings for this"
            value={inputs.otherSavings}
            currency={code}
            onChange={(otherSavings) => patch({ otherSavings })}
            note="A pension this app cannot see, money in a savings account, anything else earmarked."
          />
          <MonthlyMoneyField
            label="You add, a month"
            value={inputs.annualContribution}
            currency={code}
            onChange={(annualContribution) => patch({ annualContribution })}
            note="Everything that goes in, yours and your employer's. What you actually save now, after the costs above."
          />
          <PercentField
            label="That rises by, a year"
            value={inputs.contributionGrowthPct}
            digits={1}
            onChange={(contributionGrowthPct) => patch({ contributionGrowthPct })}
            note="Above inflation, not including it. One per cent is an ordinary career. Zero is honest if you would rather not count on a rise."
          />
        </div>
        <label
          htmlFor={costsId}
          className="flex cursor-pointer items-start justify-between gap-3"
        >
          <span className="min-w-0 text-sm text-muted-foreground">
            Take the children and the car off what I save each year. Only turn
            this on if the figure above is what you could save before those
            costs, or it will be counted twice.
          </span>
          <Switch
            id={costsId}
            checked={inputs.costsReduceSaving}
            onCheckedChange={(costsReduceSaving) => patch({ costsReduceSaving })}
          />
        </label>
      </Panel>

      <Panel>
        <PanelHeader
          icon={<Wallet className="h-4 w-4" />}
          title="Income that is not the pot"
          subtitle="Every currency of guaranteed income is a currency the pot does not have to find, and at a 3% withdrawal rate a state pension is worth a third of a million to the plan. It is the most under-counted thing in retirement arithmetic."
        />
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="min-w-0 text-sm text-muted-foreground">
            Count the state pension
          </span>
          <Switch
            checked={inputs.includeStatePension}
            onCheckedChange={(includeStatePension) => patch({ includeStatePension })}
          />
        </label>
        {inputs.includeStatePension ? (
          <div className={FIELD_GRID}>
            <MonthlyMoneyField
              label="State pension a month"
              value={inputs.statePensionAnnual}
              currency={code}
              onChange={(statePensionAnnual) => patch({ statePensionAnnual })}
              note={`${region.statePensionSource}.${inputs.household === "couple" ? " Two of them, because the published rate is per person and you are planning for two." : ""} Approximate, and a year or two old. If you have a statement, use its figure.`}
            />
            <CountField
              label="Starting at age"
              value={inputs.statePensionAge}
              onChange={(statePensionAge) => patch({ statePensionAge })}
              min={50}
              max={80}
              suffix="years"
              note="Most countries are raising this. If you are under 40, planning on a year or two later than today's is the cautious read."
            />
          </div>
        ) : null}
        <div className={FIELD_GRID}>
          <MonthlyMoneyField
            label="Anything else guaranteed, a month"
            value={inputs.otherIncomeAnnual}
            currency={code}
            onChange={(otherIncomeAnnual) => patch({ otherIncomeAnnual })}
            note="A workplace pension that pays a set amount, rent from a property, an annuity."
          />
          <CountField
            label="Starting at age"
            value={inputs.otherIncomeFromAge}
            onChange={(otherIncomeFromAge) => patch({ otherIncomeFromAge })}
            min={30}
            max={100}
            suffix="years"
          />
        </div>
      </Panel>
    </div>
  );
}
