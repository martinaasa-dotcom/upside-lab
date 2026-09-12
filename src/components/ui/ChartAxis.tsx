import { cn } from "@/lib/format";
import type { ReactNode } from "react";

/**
 * Chart ticks live in HTML at text-xs. SVG <text> scales with the
 * viewBox, so a 11px label on a 640-wide chart becomes ~22px on a
 * laptop. GoldNav, Forecast, Compound, and Margus vs SPY all use this.
 */
export function ChartYAxis({
  ticks,
  yAt,
  height,
  format,
  className,
  overlay = false,
}: {
  ticks: number[];
  yAt: (v: number) => number;
  height: number;
  format: (v: number) => string;
  className?: string;
  /** Sit on the plot so the line can use the full width. */
  overlay?: boolean;
}) {
  return (
    <div
      className={cn(
        overlay
          ? "pointer-events-none absolute inset-y-0 left-0 z-[2] w-auto"
          : "relative w-12 shrink-0",
        className
      )}
    >
      {ticks.map((t) => (
        <span
          key={t}
          className={cn(
            "absolute -translate-y-1/2 text-xs tabular-nums text-muted-foreground",
            overlay ? "left-0 chart-label-halo" : "right-0"
          )}
          style={{
            top: `${(yAt(t) / height) * 100}%`,
          }}
        >
          {format(t)}
        </span>
      ))}
    </div>
  );
}

export function ChartXRail({
  children,
  className,
  railClassName,
  inset = false,
}: {
  children: ReactNode;
  className?: string;
  railClassName?: string;
  /** No Y-axis gutter. Use when labels overlay the plot. */
  inset?: boolean;
}) {
  return (
    <div className={cn("mt-1.5 flex", className)}>
      {inset ? null : <div className={cn("w-12 shrink-0", railClassName)} />}
      <div className="relative h-4 min-w-0 flex-1 text-xs text-muted-foreground">
        {children}
      </div>
    </div>
  );
}
