"use client";

import { InfoTip, MicroLabel } from "@/components/ui/Panel";
import { cn } from "@/lib/format";
import type { SentimentSpark } from "@/lib/market-sentiment";
import type {
  SentimentGaugeNote,
  SentimentStretch,
} from "@/lib/market-sentiment-story";
import { sentimentSparkLayout } from "@/lib/market-sentiment-viz";
import { PALETTE } from "@/lib/palette";
import { useMemo } from "react";

const SPARK_W = 240;
const SPARK_H = 56;

function TrackMarker({ pct, className }: { pct: number; className: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background",
        className
      )}
      style={{ left: `${pct}%` }}
    />
  );
}

export function SentimentSparkPlot({
  spark,
  className,
}: {
  spark: SentimentSpark;
  className?: string;
}) {
  const layout = useMemo(
    () => sentimentSparkLayout(spark.price, spark.usual, SPARK_W, SPARK_H),
    [spark.price, spark.usual]
  );
  if (!layout) return null;
  const stroke = layout.last.above ? PALETTE.gain : PALETTE.loss;

  return (
    <div className={cn("text-muted-foreground", className)}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <MicroLabel>
          Last year
          <InfoTip text="S&P 500 versus its typical price over about the last year. The dashed line is that typical price. Above it is a climb. Below it is a slide." />
        </MicroLabel>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span
            aria-hidden
            className="w-3.5 border-t border-dashed border-muted-foreground/80"
          />
          Usual
        </span>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          preserveAspectRatio="none"
          className="h-14 w-full"
          role="img"
          aria-label={
            layout.last.above
              ? "S&P 500 over the last year, above its usual price"
              : "S&P 500 over the last year, below its usual price"
          }
        >
          {layout.gain.map((pts, i) => (
            <polygon
              key={`g${i}`}
              points={pts}
              fill={PALETTE.gain}
              fillOpacity={0.16}
            />
          ))}
          {layout.loss.map((pts, i) => (
            <polygon
              key={`l${i}`}
              points={pts}
              fill={PALETTE.loss}
              fillOpacity={0.16}
            />
          ))}
          <polyline
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.55}
            strokeWidth={1.5}
            strokeDasharray="3 3"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            points={layout.usualLine}
          />
          <polyline
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            points={layout.priceLine}
          />
        </svg>
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background",
            layout.last.above ? "bg-gain" : "bg-loss"
          )}
          style={{ left: `${layout.last.x}%`, top: `${layout.last.y}%` }}
        />
      </div>
    </div>
  );
}

export function SentimentStretchTrack({
  stretch,
  className,
}: {
  stretch: SentimentStretch;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-2 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <p className="text-sm text-foreground">{stretch.inLabel}</p>
        {stretch.moreLabel ? (
          <p className="text-sm text-muted-foreground sm:text-right">
            {stretch.moreLabel}
          </p>
        ) : null}
      </div>
      <div
        className="relative h-1.5 w-full rounded-full bg-foreground/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(stretch.fillPct)}
        aria-label={`${stretch.inLabel}. ${stretch.moreLabel}`.trim()}
      >
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            stretch.above ? "bg-gain" : "bg-loss"
          )}
          style={{ width: `${stretch.fillPct}%` }}
        />
        <TrackMarker
          pct={stretch.fillPct}
          className={stretch.above ? "bg-gain" : "bg-loss"}
        />
      </div>
    </div>
  );
}

function LinearTrack({
  markerPct,
  band,
  bandClass,
  dotClass,
}: {
  markerPct: number;
  band: { fromPct: number; toPct: number } | null;
  bandClass?: string;
  dotClass: string;
}) {
  return (
    <div className="relative h-1.5 w-full rounded-full bg-foreground/10">
      {band && (
        <div
          className={cn(
            "absolute inset-y-0 rounded-full",
            bandClass ?? "bg-foreground/15"
          )}
          style={{
            left: `${band.fromPct}%`,
            width: `${band.toPct - band.fromPct}%`,
          }}
        />
      )}
      <TrackMarker pct={markerPct} className={dotClass} />
    </div>
  );
}

function SignedTrack({ fillPct, dotClass }: { fillPct: number; dotClass: string }) {
  const right = fillPct > 0;
  const width = Math.abs(fillPct);
  const markerPct = Math.max(2, Math.min(98, 50 + fillPct));
  return (
    <div className="relative h-1.5 w-full rounded-full bg-foreground/10">
      <div
        aria-hidden
        className="absolute inset-y-[-3px] left-1/2 w-px -translate-x-1/2 bg-foreground/35"
      />
      {width > 0 && (
        <div
          className={cn(
            "absolute inset-y-0 rounded-full",
            right ? "left-1/2 bg-gain" : "right-1/2 bg-loss"
          )}
          style={{ width: `${width}%` }}
        />
      )}
      <TrackMarker pct={markerPct} className={dotClass} />
    </div>
  );
}

export function SentimentGaugeRow({ gauge }: { gauge: SentimentGaugeNote }) {
  return (
    <div
      className="min-w-0"
      role="group"
      aria-label={`${gauge.label} ${gauge.value}, ${gauge.sub}`}
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <MicroLabel>
          {gauge.label}
          <InfoTip text={gauge.explain} />
        </MicroLabel>
        <p
          className={cn(
            "shrink-0 font-mono text-sm font-semibold tabular-nums",
            gauge.valueClassName ?? "text-foreground"
          )}
        >
          {gauge.value}
        </p>
      </div>
      {gauge.kind === "signed" && gauge.signedFillPct != null ? (
        <SignedTrack fillPct={gauge.signedFillPct} dotClass={gauge.dotClass} />
      ) : gauge.markerPct != null ? (
        <LinearTrack
          markerPct={gauge.markerPct}
          band={gauge.band}
          bandClass={gauge.bandClass}
          dotClass={gauge.dotClass}
        />
      ) : (
        <div className="h-1.5 w-full rounded-full bg-foreground/10" />
      )}
      <p className="mt-1 text-sm text-muted-foreground">{gauge.sub}</p>
    </div>
  );
}
