"use client";

import { cn } from "@/lib/format";
import { useState, type ReactNode } from "react";

/**
 * A figure that says, for a moment, that it just changed.
 *
 * Prices here poll every fifteen seconds in the session, and a number that
 * silently swaps one digit reads as a number that never moved: the reader
 * cannot tell a live portfolio from a screenshot of one. When the value
 * changes the figure takes a short wash in the direction it went (gain up,
 * loss down) that fades out over most of a second. Nothing about the figure
 * itself moves, so the digits a reader is reading never jump.
 *
 * The first value is never flashed, only a change after it, and the
 * previous value is held in state rather than an effect, which is React's
 * own pattern for "compare with last render" and costs no extra paint.
 * Off entirely under reduced motion (`.tick-up`/`.tick-down` in
 * globals.css).
 */
export function LiveFigure({
  value,
  children,
  className,
}: {
  value: number | null | undefined;
  children: ReactNode;
  className?: string;
}) {
  const [seen, setSeen] = useState(value);
  const [tick, setTick] = useState<{ dir: "up" | "down"; n: number } | null>(null);
  if (value !== seen) {
    setSeen(value);
    if (
      typeof seen === "number" &&
      typeof value === "number" &&
      Number.isFinite(seen) &&
      Number.isFinite(value)
    ) {
      setTick({ dir: value > seen ? "up" : "down", n: (tick?.n ?? 0) + 1 });
    }
  }
  return (
    <span
      key={tick?.n ?? 0}
      className={cn(className, tick && (tick.dir === "up" ? "tick-up" : "tick-down"))}
    >
      {children}
    </span>
  );
}
