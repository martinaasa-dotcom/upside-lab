import { cn } from "@/lib/format";
import type { ReactNode } from "react";

/**
 * Equal tracks. Every column gets the same share of leftover width, and no
 * column is ever narrower than what is written in it.
 *
 * The floor is `min-content`, not 0, and that is the whole rule. Cells are
 * `whitespace-nowrap` (a price broken over two lines is not a price), so a
 * track thinner than its content does not clip and does not wrap: it spills,
 * silently, over the columns either side. Measured on the covered calls
 * table at 1440, "Far from your target" painted 168px inside a 104px track
 * and landed on the distance to its left and the strike to its right, so a
 * reader saw `29.6%Far from your target$330.00`. At 820 every header in that
 * table did it at once. With the floor the row is as wide as its widest
 * cells and `FluidTable` scrolls sideways instead, which is the one answer
 * that neither hides a figure nor prints it over another one.
 */
export function equalCols(count: number): string {
  return `repeat(${count}, minmax(min-content, 1fr))`;
}

/**
 * Width of the trailing row-action track (the per-row delete). Fixed, not
 * `1fr`, so the action never competes with the data columns for space and
 * a wide value can never overflow into it.
 */
export const ACTION_COL = "1.75rem";

/**
 * Ticker column sizes to the cashtag (and chip, when mixed). The rest share
 * leftover equally. `action` appends a fixed narrow track for a row action.
 */
export function tableCols(
  count: number,
  tickerFit: boolean,
  action = false
): string {
  const base = tickerFit
    ? `max-content repeat(${Math.max(0, count - 1)}, minmax(min-content, 1fr))`
    : equalCols(count);
  return action ? `${base} ${ACTION_COL}` : base;
}

/**
 * Full-width CSS grid. `px-1.5` plus each cell's `px-1.5` makes the side
 * gutter match the gap between columns. Rows break out of that pad so
 * hover and footer fills reach the card edge.
 *
 * Every row is a fixed `h-10`. Do not add min-h or extra py on cells.
 */
export function FluidTable({
  template,
  children,
  className,
}: {
  template: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full min-w-0 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]",
        className
      )}
    >
      <div
        className="grid w-full min-w-0 px-1.5 text-sm tabular-nums"
        style={{ gridTemplateColumns: template }}
      >
        {children}
      </div>
    </div>
  );
}

export function FluidRow({
  children,
  className,
  footer = false,
}: {
  children: ReactNode;
  className?: string;
  footer?: boolean;
}) {
  return (
    <div
      className={cn(
        "col-span-full -mx-1.5 box-border grid h-10 w-full grid-cols-subgrid items-center justify-items-stretch px-1.5",
        footer ? "bg-muted/60" : "border-b border-border/50 hover:bg-muted/50",
        className
      )}
    >
      {children}
    </div>
  );
}

export const cellBase =
  "flex h-full min-w-0 w-full items-center justify-center whitespace-nowrap px-1.5 py-1.5 text-center font-mono tabular-nums";

/** Left-aligned ticker + chip. Pair with `tableCols(n, true)` so leftover does not sit after the chip. */
export const cellTicker =
  "flex h-full w-max max-w-full items-center justify-start whitespace-nowrap px-1.5 py-1.5 text-left";

/**
 * The `<table>` twin of `FluidTable`, and `table-auto` for the same reason
 * its tracks floor at `min-content`. `table-fixed` hands every column the
 * same width whatever is written in it, and these cells are
 * `whitespace-nowrap`, so a column too narrow for its content spills over
 * the column beside it rather than wrapping. Measured on the classroom
 * roster: the "Why" cell paints 185px of text, which overflowed its column
 * at every width tried, by 89px at 900 and by 1px even at 1440, and a
 * student's name overflowed from 900 down.
 * Auto layout sizes each column to what it holds, `w-full` still spends
 * any room left over, and the wrapper scrolls sideways when there is none.
 */
export const htmlTable = "w-full table-auto border-collapse text-sm tabular-nums";
export const htmlCell =
  "h-10 whitespace-nowrap px-1.5 py-1.5 text-center align-middle font-mono tabular-nums first:pl-3 last:pr-3";
/** Shrink-wrap the ticker column when a listing chip is showing.
 * `w-[1%]` plus `min-w-max` is the auto-layout way of saying "as narrow as
 * the cashtag and no narrower". */
export const htmlCellTicker =
  "h-10 w-[1%] min-w-max whitespace-nowrap py-1.5 pl-3 pr-3 text-left align-middle";
