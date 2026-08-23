"use client";

import { NO_VALUE, cn } from "@/lib/format";
import { PALETTE } from "@/lib/palette";
import { memo } from "react";

type Props = {
  points: number[];
  className?: string;
  width?: number;
  height?: number;
  /** Stretch to the parent width. ViewBox still uses width/height. */
  fill?: boolean;
};

export const Sparkline = memo(function Sparkline({
  points,
  className,
  width = 96,
  height = 28,
  fill = false,
}: Props) {
  if (!points.length) {
    return (
      <div
        className={cn("text-sm text-muted-foreground", className)}
        style={fill ? { height } : { width, height }}
      >
        {NO_VALUE}
      </div>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coords = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * (width - 2) + 1;
      const y = height - 2 - ((p - min) / range) * (height - 4);
      return `${x},${y}`;
    })
    .join(" ");

  const up = points[points.length - 1] >= points[0];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={fill ? "none" : "xMidYMid meet"}
      width={fill ? "100%" : width}
      height={height}
      className={cn(fill && "block", className)}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke={up ? PALETTE.gain : PALETTE.loss}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={coords}
      />
    </svg>
  );
});
