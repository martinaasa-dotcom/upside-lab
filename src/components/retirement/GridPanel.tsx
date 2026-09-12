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

import { CARD, MicroLabel, Panel, PanelHeader, Segmented } from "@/components/ui/Panel";
import { cn, currency } from "@/lib/format";
import {
  STANDARD_LABEL,
  UK_STANDARDS_SOURCE,
  livingStandardsFor,
  regionById,
} from "@/lib/retirement/regions";
import type { TableMode, TableRow } from "@/lib/retirement/table";
import type { PlanResult, RetirementInputs } from "@/lib/retirement/plan";
import { Table2 } from "lucide-react";

const CELL = "whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums";
const HEAD = "whitespace-nowrap px-3 py-2 text-right font-medium";

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

  return (
    <Panel>
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
            <tr className="border-b border-border text-muted-foreground">
              <th scope="col" className={cn(HEAD, "text-left")}>
                Stop at
              </th>
              <th scope="col" className={HEAD}>
                Saving
              </th>
              <th scope="col" className={HEAD}>
                Drawing
              </th>
              {mode === "invested" ? (
                <th scope="col" className={HEAD}>
                  Rate
                </th>
              ) : null}
              <th scope="col" className={HEAD}>
                <span className="block">{STANDARD_LABEL.minimum}</span>
                <span className="block text-xs font-normal">
                  {currency(amounts.minimum, 0, code)}
                </span>
              </th>
              <th scope="col" className={HEAD}>
                <span className="block">{STANDARD_LABEL.moderate}</span>
                <span className="block text-xs font-normal">
                  {currency(amounts.moderate, 0, code)}
                </span>
              </th>
              <th scope="col" className={HEAD}>
                <span className="block">{STANDARD_LABEL.comfortable}</span>
                <span className="block text-xs font-normal">
                  {currency(amounts.comfortable, 0, code)}
                </span>
              </th>
              <th scope="col" className={HEAD}>
                <span className="block">Yours</span>
                <span className="block text-xs font-normal">a month to get there</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.retirementAge}
                className={cn(
                  "border-b border-border/50 last:border-0",
                  row.isChosen && "bg-primary/10"
                )}
              >
                <th
                  scope="row"
                  className="whitespace-nowrap px-3 py-2 text-left font-mono font-semibold tabular-nums text-foreground"
                >
                  {row.retirementAge}
                </th>
                <td className={cn(CELL, "text-muted-foreground")}>
                  {row.yearsSaving}y
                </td>
                <td className={cn(CELL, "text-muted-foreground")}>
                  {row.yearsDrawing}y
                </td>
                {mode === "invested" ? (
                  <td className={cn(CELL, "text-muted-foreground")}>
                    {row.swrPct.toFixed(2)}%
                  </td>
                ) : null}
                <td className={cn(CELL, "text-gain")}>
                  {currency(row.byStandard.minimum, 0, code)}
                </td>
                <td className={cn(CELL, "text-foreground")}>
                  {currency(row.byStandard.moderate, 0, code)}
                </td>
                <td className={cn(CELL, "text-loss")}>
                  {currency(row.byStandard.comfortable, 0, code)}
                </td>
                <td className={cn(CELL, "font-semibold text-foreground")}>
                  {row.monthlyToCustom > 0
                    ? currency(row.monthlyToCustom, 0, code)
                    : "there already"}
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
            ? "Cash just keeping pace with inflation, no fees. The last column, what to save each month, is the most useful number here if you have not started."
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
