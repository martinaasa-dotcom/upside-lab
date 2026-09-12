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
  PercentField,
  currencyCodeFor,
} from "@/components/retirement/fields";
import { UK_COST_ANCHORS, regionById } from "@/lib/retirement/regions";
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

  return (
    <div className={PANEL_STACK}>
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
            <MoneyField
              label="Mortgage a year"
              value={inputs.mortgageAnnual}
              currency={code}
              onChange={(mortgageAnnual) => patch({ mortgageAnnual })}
              note={`Opened on ${currency(UK_COST_ANCHORS.mortgageAnnual, 0, "GBP")} a year at UK prices, moved onto ${region.name}'s.`}
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
          <MoneyField
            label="Rent a year"
            value={inputs.rentAnnual}
            currency={code}
            onChange={(rentAnnual) => patch({ rentAnnual })}
            note={`Rent never ends, so this is carried to the last year of the plan. Opened on ${currency(UK_COST_ANCHORS.rentMonthly * 12, 0, "GBP")} a year at UK prices, moved onto ${region.name}'s.`}
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
            <MoneyField
              label="Each child, a year"
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
          title="What else you have, and what you draw out"
          subtitle="What you already have and add each year is asked once, on the first card. This is the rest of the money picture: savings that card does not know about, whether your saving keeps pace, and tax on the way out."
        />
        <div className={FIELD_GRID}>
          <MoneyField
            label="Other savings for this"
            value={inputs.otherSavings}
            currency={code}
            onChange={(otherSavings) => patch({ otherSavings })}
            note="A pension this app cannot see, money in a savings account, anything else earmarked."
          />
          <PercentField
            label="That you add rises by, a year"
            value={inputs.contributionGrowthPct}
            digits={1}
            onChange={(contributionGrowthPct) => patch({ contributionGrowthPct })}
            note="Above inflation, not including it. One per cent is an ordinary career. Zero is honest if you would rather not count on a rise."
          />
          <PercentField
            label="Tax on what you draw out"
            value={inputs.withdrawalTaxPct}
            digits={1}
            onChange={(withdrawalTaxPct) => patch({ withdrawalTaxPct })}
            note="Leave at zero if your savings come out tax free. Otherwise the plan draws enough extra to still land your own spending figure."
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
            <MoneyField
              label="State pension a year"
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
          <MoneyField
            label="Anything else guaranteed, a year"
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
