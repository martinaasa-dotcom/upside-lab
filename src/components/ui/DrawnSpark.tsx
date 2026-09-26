"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * A price line that draws itself in, over a soft wash of its own colour,
 * with its live end marked.
 *
 * For a card that wants to show a shape rather than read figures off it:
 * no axis, no labels, the card around it carries the numbers. `points` is
 * a drawing (a quote's `sparkline`), which this repo records is never a
 * series to do arithmetic on, and this only ever draws it.
 */
export function DrawnSpark({
  points,
  tone,
  className,
  label,
}: {
  points: number[] | null | undefined;
  /** "gain" or "loss": the colour of the line. */
  tone: "gain" | "loss" | "neutral";
  className?: string;
  label: string;
}) {
  const id = useId().replace(/:/g, "");
  const clean = (points ?? []).filter((v) => Number.isFinite(v));
  if (clean.length < 2) return null;
  const W = 100;
  const H = 32;
  const lo = Math.min(...clean);
  const hi = Math.max(...clean);
  const span = hi - lo || 1;
  const xy = clean.map((v, i) => [
    (i / (clean.length - 1)) * W,
    H - 2 - ((v - lo) / span) * (H - 4),
  ]);
  const line = xy.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `M0,${H} L${xy.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" L")} L${W},${H} Z`;
  const color =
    tone === "gain" ? "var(--gain)" : tone === "loss" ? "var(--loss)" : "var(--muted-foreground)";
  const [ex, ey] = xy[xy.length - 1]!;
  return (
    // The dot is HTML over the line rather than a circle inside it: the
    // drawing stretches to its box, which would squash a circle into an
    // ellipse and clip it at the right edge.
    <span className={cn("relative block", className)} role="img" aria-label={label}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block size-full" aria-hidden>
        <defs>
          <linearGradient id={`spark-${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#spark-${id})`} className="spark-wash" />
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="line-reveal"
        />
      </svg>
      <span
        aria-hidden
        className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: `${(ex / W) * 100}%`, top: `${(ey / H) * 100}%` }}
      >
        <span className="live-dot block size-full rounded-full" style={{ background: color, animationDelay: "1s" }} />
      </span>
    </span>
  );
}
