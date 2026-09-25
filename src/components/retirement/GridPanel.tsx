"use client";

/**
 * THE GRID, WHICH TEACHES THE TWO THINGS ONE ANSWER CANNOT.
 *
 * Everything above answers the reader's own question with their own numbers.
 * That is right and it is also why a calculator is hard to learn from: one
 * answer says nothing about the shape of the problem. A reader who knows
 * only that they need a certain pot at 60 cannot tell whether three more
 * years would change it a lot or a little, or whether the standard above
 * theirs is out of reach or nearly affordable.
 *
 * Rows next to each other answer both, and the second lesson is the one
 * people do not predict: stopping earlier costs three times over. More years
 * of spending, fewer years of saving, and a longer horizon that pulls the
 * safe rate down and raises the pot again.
 *
 * THE CASH COLUMN IS NOT A STRAWMAN. It is what somebody who keeps their
 * savings in a savings account actually has to put away, and it is a
 * multiple rather than a bit more. That single comparison is worth more to
 * a person who has not started than any argument about it, which is why it
 * is a toggle on a table rather than a paragraph.
 */

import { CARD, InfoTip, MicroLabel, Panel, PanelHeader, Segmented } from "@/components/ui/Panel";
import { cn, currency } from "@/lib/format";
import {
  STANDARD_LABEL,
  UK_STANDARDS_SOURCE,
  livingStandardsFor,
  regionById,
} from "@/lib/retirement/regions";
import { RETIREMENT_RESULTS_ID } from "@/lib/retirement/dom-ids";
import type { TableMode, TableRow } from "@/lib/retirement/table";
import { livingCost, type PlanResult, type RetirementInputs } from "@/lib/retirement/plan";
import { Table2 } from "lucide-react";
import { htmlHeadRow } from "@/components/FluidTable";

const YOUR_TARGET_EXPLAINER =
  "The top figure is the pot that age needs, based on what you typed for spending. Below it is what you would need to save each month to close the gap by then. That monthly figure will not always fall in a straight line: a mortgage, car payment or child cost still running between now and a later age can eat into the years left to save, even though the pot needed by then is smaller. Where your own numbers already cover the pot, it says so instead of a monthly figure.";

const CELL = "whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums";
const HEAD = "whitespace-nowrap px-3 py-2 text-right align-bottom font-medium";
/** The figure under a header label: sentence voice, so "a year" is not shouted. */
const HEAD_SUB = "mt-0.5 block font-sans text-xs font-normal normal-case tracking-normal";

export function GridPanel({
  inputs,
  plan,
  rows,
  mode,
  onModeChange,
}: {
  inputs: RetirementInputs;
  plan: PlanResult;
  rows: TableRow[];
  mode: TableMode;
  onModeChange: (mode: TableMode) => void;
}) {
  const region = regionById(inputs.regionId);
  const code = region.currency;
  const amounts = livingStandardsFor(region, inputs.household);
  const customSpend = livingCost(inputs);

  return (
    /*
      NEVER BEHIND `BelowFold`. `NumberPanel`'s "See the results table"
      button scrolls to this id, and `BelowFold`'s own doc says why it must
      not wrap anything reachable that way: an anchor that lands on an
      unmounted placeholder is a button that appears to work and does not.
      This panel used to fold at three screens down; now that every input
      panel sits above it, its own offset moves with the detail level, so a
      fixed reserve would either lurch on some plans or sit stale on others.
      Rendering it eagerly is what makes the skip button honest.
    */
    <Panel id={RETIREMENT_RESULTS_ID}>
      <PanelHeader
        icon={<Table2 className="h-4 w-4" />}
        title="What stopping at each age costs"
        subtitle={`Your plan, with the age changed. Run to ${plan.planningAge}. Your own row is marked.`}
      />

      <Segmented
        options={[
          { id: "invested", label: "Invested" },
          { id: "cash", label: "Kept as cash" },
        ]}
        value={mode}
        onChange={onModeChange}
        columns={2}
        ariaLabel="How the savings are held"
      />

      <div className={cn(CARD, "overflow-x-auto")}>
        <table className="w-full table-auto border-collapse text-sm">
          <thead>
            <tr className={htmlHeadRow}>
              <th scope="col" className={cn(HEAD, "text-left")}>
                Stop at
              </th>
              {/*
                On a phone the answer comes second. The table is wider than
                the screen there, so whatever sits on the left is all a
                reader sees before scrolling, and it used to be three
                columns of context (years saving, years drawing, the rate)
                with the pot itself off the right edge. The context columns
                follow from the age on the left, so the phone leaves them
                out and puts the reader's own target where the eye lands.
              */}
              <th scope="col" className={cn(HEAD, "sm:hidden")}>
                <span className="block">Your target</span>
                <span className={HEAD_SUB}>
                  {currency(customSpend, 0, code)} a year
                </span>
              </th>
              <th scope="col" className={cn(HEAD, "hidden sm:table-cell")}>
                Saving
              </th>
              <th scope="col" className={cn(HEAD, "hidden sm:table-cell")}>
                Drawing
              </th>
              {mode === "invested" ? (
                <th scope="col" className={cn(HEAD, "hidden sm:table-cell")}>
                  Rate
                </th>
              ) : null}
              <th scope="col" className={HEAD}>
                <span className="block">{STANDARD_LABEL.minimum}</span>
                <span className={HEAD_SUB}>
                  {currency(amounts.minimum, 0, code)}
                </span>
              </th>
              <th scope="col" className={HEAD}>
                <span className="block">{STANDARD_LABEL.moderate}</span>
                <span className={HEAD_SUB}>
                  {currency(amounts.moderate, 0, code)}
                </span>
              </th>
              <th scope="col" className={HEAD}>
                <span className="block">{STANDARD_LABEL.comfortable}</span>
                <span className={HEAD_SUB}>
                  {currency(amounts.comfortable, 0, code)}
                </span>
              </th>
              <th scope="col" className={cn(HEAD, "hidden sm:table-cell")}>
                <span className="flex items-center justify-end gap-1">
                  <span>Your target</span>
                  <InfoTip
                    label="What does your target column show?"
                    text={YOUR_TARGET_EXPLAINER}
                  />
                </span>
                <span className={HEAD_SUB}>
                  {currency(customSpend, 0, code)} a year
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.retirementAge}
                className={cn(
                  "border-b border-border/50 last:border-0",
                  /*
                    The reader's own row is a lifted row with a rail in
                    the accent, never a wash of it: a low-alpha warm fill
                    over this field lands on khaki (DESIGN_TOKENS.md).
                  */
                  row.isChosen && "bg-hover shadow-[inset_2px_0_0_var(--primary)]"
                )}
              >
                <th
                  scope="row"
                  className="whitespace-nowrap px-3 py-2 text-left font-mono font-semibold tabular-nums text-foreground"
                >
                  {row.retirementAge}
                </th>
                <td className={cn(CELL, "align-top font-semibold text-foreground sm:hidden")}>
                  <span className="block">{currency(row.custom, 0, code)}</span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    {row.monthlyToCustom > 0
                      ? `${currency(row.monthlyToCustom, 0, code)} a month`
                      : "Funded already"}
                  </span>
                </td>
                <td className={cn(CELL, "hidden text-muted-foreground sm:table-cell")}>
                  {row.yearsSaving}y
                </td>
                <td className={cn(CELL, "hidden text-muted-foreground sm:table-cell")}>
                  {row.yearsDrawing}y
                </td>
                {mode === "invested" ? (
                  <td className={cn(CELL, "hidden text-muted-foreground sm:table-cell")}>
                    {row.swrPct.toFixed(2)}%
                  </td>
                ) : null}
                {/*
                  The three standards are drawn in one neutral voice. They
                  were green, white and rose, which in this app means money
                  made and money lost: a comfortable retirement needing a
                  bigger pot is not a loss, and the colour said it was.
                */}
                <td className={cn(CELL, "text-muted-foreground")}>
                  {currency(row.byStandard.minimum, 0, code)}
                </td>
                <td className={cn(CELL, "text-muted-foreground")}>
                  {currency(row.byStandard.moderate, 0, code)}
                </td>
                <td className={cn(CELL, "text-muted-foreground")}>
                  {currency(row.byStandard.comfortable, 0, code)}
                </td>
                <td className={cn(CELL, "hidden align-top font-semibold text-foreground sm:table-cell")}>
                  <span className="block">{currency(row.custom, 0, code)}</span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    {row.monthlyToCustom > 0
                      ? `${currency(row.monthlyToCustom, 0, code)} a month`
                      : "Funded already"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={cn(CARD, "p-4")}>
        <MicroLabel>
          {mode === "cash" ? "What the cash column means" : "Reading the rows"}
        </MicroLabel>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {mode === "cash"
            ? "Cash just keeping pace with inflation, no fees. In the last column, the smaller line under the pot, what to save each month, is the most useful number here if you have not started."
            : "The rate falls as you move up the table. A longer retirement needs a bigger pot, and gives you fewer years to build it in."}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {UK_STANDARDS_SOURCE} Moved onto {region.name}&apos;s prices using
          published comparative price levels.
        </p>
      </div>
    </Panel>
  );
}
