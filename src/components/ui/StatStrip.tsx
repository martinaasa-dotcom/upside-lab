import type { ReactNode } from "react";
import { MicroLabel } from "@/components/ui/Panel";
import { cn } from "@/lib/format";

/**
 * A row of figures separated by hairlines, never a row of bordered cards.
 *
 * Three rooms printed their summary figures as four bordered `Score`
 * cards under a hero figure and a chart, so a page answering one question
 * read as a wall of boxes: every figure got the same frame, the same
 * padding and the same weight as the chart beside it. A strip gives each
 * figure a label, the number and at most one short qualifier, with the
 * space doing the separating. Use `Scoreboard` where each cell carries a
 * sentence; use this where it carries a figure.
 */
export type StripItem = {
  label: ReactNode;
  value: ReactNode;
  /** One short qualifier under the figure: a year, a share. */
  sub?: ReactNode;
  /** A text colour class for the figure. Neutral when omitted. */
  tone?: string;
  /** A word rather than a number ("Concentrated"): set in the sentence
   * face, since a monospace word is half as wide again and crowds its
   * neighbour on a phone. */
  word?: boolean;
  /** A text colour class for the qualifier. Muted when omitted. */
  subTone?: string;
};

export function StatStrip({
  items,
  className,
}: {
  items: StripItem[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        /* The last thing in a panel keeps its top rule only: a bottom rule
         * right above the panel's own edge read as a stray double line. */
        "grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border py-5 last:border-b-0 last:pb-0",
        items.length >= 4 ? "sm:grid-cols-4" : items.length === 3 ? "sm:grid-cols-3" : null,
        className
      )}
    >
      {items.map((item, i) => (
        <div key={i} className="flex min-w-0 flex-col gap-1.5">
          <dt className="[&_button]:text-left">
            <MicroLabel>{item.label}</MicroLabel>
          </dt>
          <dd
            className={cn(
              item.word
                ? "font-heading text-lg font-semibold"
                : "font-mono text-xl font-semibold tabular-nums",
              item.tone ?? "text-foreground"
            )}
          >
            {item.value}
          </dd>
          {item.sub != null ? (
            <dd className={cn("text-xs", item.subTone ?? "text-muted-foreground")}>
              {item.sub}
            </dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}
