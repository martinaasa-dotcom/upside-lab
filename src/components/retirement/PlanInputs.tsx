"use client";

/**
 * Everything the plan is built from that the first card does not already
 * ask, grouped by the question it answers.
 *
 * WHY THIS DOES NOT REPEAT `QuickStart`. The country, who you are planning
 * for, your age, the age you want to stop, what you have invested and what
 * you add each year, and the life you want to fund are all essentials on
 * the first card, and they used to be asked again here, verbatim, the
 * moment a reader opened "More": the same country picker, the same age
 * fields, the same pot, printed a screen apart with no sign either copy was
 * the other one. A reader who corrected one had no way to know the other
 * still held the old figure. This panel now covers only what is left: the
 * home, who depends on you, a car, the rest of the money picture, and what
 * the state owes you. The sex control that used to sit in a "You" panel
 * here moved to `LongevityPanel`, next to the curve it actually feeds.
 *
 * The order is the order somebody thinks in: what your home costs, who
 * depends on you, a car, what else you have and draw out, what the state
 * owes you. The hard, technical inputs are not here at all. They live in
 * Assumptions at the foot of the page, because a reader who has to pick an
 * equity glide path before they can find out what a retirement costs will
 * close the tab.
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
import { Switch } from "@/components/ui/switch";
import { cn, currency } from "@/lib/format";
import {
  ChoiceField,
  CountField,
  FIELD_GRID,
  MoneyField,
  MonthlyMoneyField,
  PercentField,
  currencyCodeFor,
} from "@/components/retirement/fields";
import {
  costAnchorsForStandard,
  STANDARD_LABEL,
  UK_COST_ANCHORS,
  regionById,
} from "@/lib/retirement/regions";
import type { Housing, RetirementInputs } from "@/lib/retirement/plan";
import { Baby, Car, Home, PiggyBank, Wallet } from "lucide-react";
import { useId } from "react";

type Patch = (next: Partial<RetirementInputs>) => void;

export function PlanInputs({
  inputs,
  patch,
}: {
  inputs: RetirementInputs;
  patch: Patch;
}) {
  const region = regionById(inputs.regionId);
  const code = currencyCodeFor(region.currency);
  const costsId = useId();
  const standardCosts = costAnchorsForStandard(inputs.standard);

  return (
    <div className={PANEL_STACK}>
      <Panel>
        <PanelHeader
          icon={<Home className="h-4 w-4" />}
          title="Your home"
          subtitle="The published baskets assume a home owned outright. Correct that here."
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
              note={`Opened on ${currency(standardCosts.mortgageAnnual / 12, 0, "GBP")} a month for the ${STANDARD_LABEL[inputs.standard].toLowerCase()} standard. Type what you pay.`}
            />
            <CountField
              label="Years left on it"
              value={inputs.mortgageYearsLeft}
              onChange={(mortgageYearsLeft) => patch({ mortgageYearsLeft })}
              max={60}
              suffix="years"
              note="Counted from today."
            />
          </div>
        ) : inputs.housing === "renting" ? (
          <MonthlyMoneyField
            label="Rent a month"
            value={inputs.rentAnnual}
            currency={code}
            onChange={(rentAnnual) => patch({ rentAnnual })}
            note={`Rent never ends, so it is carried to the last year of the plan. Opened on ${currency(UK_COST_ANCHORS.rentMonthly, 0, "GBP")} a month.`}
          />
        ) : null}
      </Panel>

      <Panel>
        <PanelHeader
          icon={<Baby className="h-4 w-4" />}
          title="Children"
          subtitle="Each child drops off the plan the year they stop costing money."
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
              note="A rough starting figure. Type your own."
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
          subtitle="A lease or finance payment can carry on indefinitely, which changes the pot more than most people guess."
        />
        <div className={FIELD_GRID}>
          <MoneyField
            label="A month"
            value={inputs.carMonthly}
            currency={code}
            onChange={(carMonthly) => patch({ carMonthly })}
            note={
              inputs.standard === "minimum"
                ? "The minimum standard is priced with no car in it, so this opens at zero. Type a figure if you have one."
                : `Leave at zero if you own your car outright. Opened on ${currency(standardCosts.carMonthly, 0, "GBP")} a month for the ${STANDARD_LABEL[inputs.standard].toLowerCase()} standard.`
            }
          />
          {inputs.carForever ? null : (
            <CountField
              label="Years of payments left"
              value={inputs.carYearsLeft}
              onChange={(carYearsLeft) => patch({ carYearsLeft })}
              max={60}
              suffix="years"
              note="Counted from today, same as the mortgage."
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
          title="What else you have, and what you draw out"
          subtitle="Other savings, whether your saving keeps pace, and tax on the way out."
        />
        <div className={FIELD_GRID}>
          <MoneyField
            label="Other savings for this"
            value={inputs.otherSavings}
            currency={code}
            onChange={(otherSavings) => patch({ otherSavings })}
            note="A pension this app cannot see, or anything else set aside."
          />
          <PercentField
            label="That you add rises by, a year"
            value={inputs.contributionGrowthPct}
            digits={1}
            onChange={(contributionGrowthPct) => patch({ contributionGrowthPct })}
            note="Above inflation. One per cent is an ordinary career; zero is fine too."
          />
          <PercentField
            label="Tax on what you draw out"
            value={inputs.withdrawalTaxPct}
            digits={1}
            onChange={(withdrawalTaxPct) => patch({ withdrawalTaxPct })}
            note="Leave at zero if your savings come out tax free."
          />
        </div>
        <label
          htmlFor={costsId}
          className="flex cursor-pointer items-start justify-between gap-3"
        >
          <span className="min-w-0 text-sm text-muted-foreground">
            Take children and car costs off what I save each year.
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
          subtitle="Guaranteed income the pot does not have to fund. Often worth more than people realize."
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
              note={`${region.statePensionSource}.${inputs.household === "couple" ? " Two pensions, one per person." : ""} Use your own statement if you have one.`}
            />
            <CountField
              label="Starting at age"
              value={inputs.statePensionAge}
              onChange={(statePensionAge) => patch({ statePensionAge })}
              min={50}
              max={80}
              suffix="years"
              note="Most countries are raising this age over time."
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
