"use client";

import { ChartXRail, ChartYAxis } from "@/components/ui/ChartAxis";
import { cn, percent, signedTone } from "@/lib/format";
import { memo, useMemo, useState } from "react";

export type ComparisonSeries = {
  label: string;
  color: string;
  /** Fractional return series, e.g. 0.05 = +5%, aligned/same length across series. */
  points: number[];
  /** Extra line under the % in the legend, usually a dollar move. */
  hint?: string;
};

type Props = {
  series: ComparisonSeries[];
  /** Same length as each series. Shown on hover so you can read the exact day. */
  labels?: string[];
  width?: number;
  height?: number;
  className?: string;
};

function formatDayLabel(raw: string) {
  if (!raw || raw === "Live") return "Live";
  const iso = raw.length <= 10 ? `${raw}T12:00:00` : raw;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function uniqueTicks(rawMin: number, rawMax: number): number[] {
  const raw = [rawMax, 0, rawMin];
  const out: number[] = [];
  for (const v of raw) {
    if (out.some((t) => Math.abs(t - v) < 0.0005)) continue;
    out.push(v);
  }
  return out;
}

/**
 * Multi-line % return chart (Margus vs SPY vs, optionally, a user's portfolio).
 * Plots return, not dollars, so different starting capital can share an axis.
 * Axis copy is HTML text-xs so it does not scale with the SVG.
 */
export const ComparisonChart = memo(function ComparisonChart({
  series,
  labels,
  width = 640,
  height = 132,
  className,
}: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const padL = 8;
  const padR = 8;
  const padTop = 10;
  const padBottom = 8;

  const geometry = useMemo(() => {
    const usable = series.filter((s) => s.points.length >= 2);
    const len = usable[0]?.points.length ?? 0;
    const xAt = (i: number) =>
      len > 1
        ? padL + (i / (len - 1)) * (width - padL - padR)
        : width / 2;
    if (usable.length === 0) return null;
    const allValues = usable.flatMap((s) => s.points);
    const rawMin = Math.min(...allValues, 0);
    const rawMax = Math.max(...allValues, 0);
    const span = rawMax - rawMin || 0.01;
    const pad = Math.max(span * 0.06, 0.001);
    const min = rawMin - pad;
    const max = rawMax + pad;
    const range = max - min || 1;
    const yAt = (v: number) =>
      padTop + (1 - (v - min) / range) * (height - padTop - padBottom);
    const toXY = (points: number[]) =>
      points
        .map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`)
        .join(" ");
    return { usable, len, xAt, min, max, range, toXY, yAt, rawMin, rawMax };
  }, [series, width, height]);

  if (!geometry) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        History builds up day by day. Check back tomorrow.
      </div>
    );
  }

  const { usable, len, xAt, toXY, yAt, rawMin, rawMax } = geometry;
  const active = hover != null && hover >= 0 && hover < len ? hover : null;
  const dayLabel =
    active != null
      ? formatDayLabel(labels?.[active] ?? labels?.[labels.length - 1] ?? "Live")
      : null;
  const startLabel = formatDayLabel(labels?.[0] ?? "");
  const endLabel = formatDayLabel(labels?.[len - 1] ?? "Live");
  const ticks = uniqueTicks(rawMin, rawMax);

  function indexFromClientX(clientX: number, target: SVGSVGElement) {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || len <= 1) return 0;
    const x = ((clientX - rect.left) / rect.width) * width;
    const t = (x - padL) / (width - padL - padR);
    return Math.max(0, Math.min(len - 1, Math.round(t * (len - 1))));
  }

  return (
    <div className={cn("min-w-0 max-w-full", className)}>
      <div className="relative">
        <div className="relative">
          <ChartYAxis
            overlay
            ticks={ticks}
            yAt={yAt}
            height={height}
            format={percent}
          />
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="h-36 w-full min-w-0 touch-pan-y sm:h-40"
            role="img"
            aria-label="Return comparison. Hover or drag to read a day."
            onPointerMove={(e) => {
              setHover(indexFromClientX(e.clientX, e.currentTarget));
            }}
            onPointerLeave={() => setHover(null)}
          >
            {ticks.map((t) => (
              <line
                key={t}
                x1={padL}
                x2={width - padR}
                y1={yAt(t)}
                y2={yAt(t)}
                stroke="currentColor"
                strokeOpacity={t === 0 ? 0.22 : 0.08}
                strokeDasharray={t === 0 ? "4 4" : undefined}
              />
            ))}
            {usable.map((s, i) => (
              /* Each line draws itself in on arrival, one after the other,
                 so the race reads as a race (`line-draw`, globals.css). */
              <polyline
                key={s.label}
                fill="none"
                stroke={s.color}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={toXY(s.points)}
                pathLength={1}
                className="line-draw"
                style={{ animationDelay: `${i * 160}ms` }}
              />
            ))}
            {active == null &&
              usable.map((s, i) => {
                const last = s.points.length - 1;
                if (last < 0) return null;
                // Where each line is now, breathing, once it has arrived.
                return (
                  <circle
                    key={`${s.label}-now`}
                    cx={xAt(last)}
                    cy={yAt(s.points[last] ?? 0)}
                    r={3}
                    fill={s.color}
                    className="live-dot"
                    style={{ animationDelay: `${1100 + i * 160}ms` }}
                  />
                );
              })}
            {active != null && (
              <line
                x1={xAt(active)}
                x2={xAt(active)}
                y1={padTop}
                y2={height - padBottom}
                stroke="currentColor"
                strokeOpacity={0.35}
              />
            )}
            {active != null &&
              usable.map((s) => {
                const v = s.points[active] ?? 0;
                return (
                  <circle
                    key={s.label}
                    cx={xAt(active)}
                    cy={yAt(v)}
                    r={3.5}
                    fill={s.color}
                  />
                );
              })}
          </svg>
        </div>
        {active != null && dayLabel && (
          <div className="pointer-events-none absolute left-1/2 top-1 z-10 -translate-x-1/2 rounded-md border border-border bg-muted/95 px-2 py-1 text-sm shadow-lg">
            <p className="text-center font-medium text-foreground">{dayLabel}</p>
            <div className="mt-0.5 flex flex-wrap justify-center gap-x-3">
              {usable.map((s) => {
                const v = s.points[active] ?? 0;
                return (
                  <span key={s.label} className="tabular-nums text-muted-foreground">
                    <span style={{ color: s.color }}>{s.label}</span>{" "}
                    <span className={v >= 0 ? "text-gain" : "text-loss"}>
                      {percent(v)}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <ChartXRail inset>
        <span className="absolute left-0 top-0">{startLabel}</span>
        <span className="absolute right-0 top-0">{endLabel}</span>
      </ChartXRail>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {usable.map((s) => {
          const last = s.points[s.points.length - 1] ?? 0;
          return (
            <li key={s.label} className="flex min-w-0 items-baseline gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
                aria-hidden
              />
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <span
                className={cn(
                  "text-base font-semibold tabular-nums",
                  signedTone(last, "text-foreground")
                )}
              >
                {percent(last)}
              </span>
              {s.hint ? (
                <span className={cn("text-sm tabular-nums", signedTone(last, "text-muted-foreground"))}>
                  {s.hint}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
});
