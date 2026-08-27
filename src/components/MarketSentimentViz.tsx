"use client";

import { InfoTip, MicroLabel } from "@/components/ui/Panel";
import { cn, signedPercent, signedTone } from "@/lib/format";
import type { SentimentSpark } from "@/lib/market-sentiment";
import {
  linearProbeCopy,
  signedProbeCopy,
  sparkProbeCopy,
  stretchProbeCopy,
  type SentimentGaugeNote,
  type SentimentScaleTick,
  type SentimentStretch,
} from "@/lib/market-sentiment-story";
import {
  pctFromClientX,
  sentimentSparkLayout,
  sparkIndexFromClientX,
} from "@/lib/market-sentiment-viz";
import { PALETTE } from "@/lib/palette";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

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

function ScaleTicks({ ticks, show }: { ticks: SentimentScaleTick[]; show: boolean }) {
  if (!show || ticks.length === 0) return null;
  return (
    <div className="pointer-events-none relative mt-1 h-4">
      {ticks.map((tick) => (
        <span
          key={`${tick.pct}-${tick.label}`}
          className="absolute top-0 -translate-x-1/2 font-mono text-xs text-muted-foreground first:translate-x-0 last:translate-x-[-100%]"
          style={{ left: `${tick.pct}%` }}
        >
          {tick.label}
        </span>
      ))}
    </div>
  );
}

function useScrubPct() {
  const [pct, setPct] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pinned) return;
    function onDoc(e: Event) {
      if (ref.current?.contains(e.target as Node)) return;
      setPinned(false);
      setPct(null);
    }
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [pinned]);

  function read(e: PointerEvent<HTMLDivElement>) {
    return pctFromClientX(e.clientX, e.currentTarget.getBoundingClientRect());
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setPct(read(e));
    if (e.pointerType !== "mouse") setPinned(true);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" || e.currentTarget.hasPointerCapture(e.pointerId)) {
      setPct(read(e));
    }
  }

  function onPointerLeave(e: PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) return;
    if (!pinned) setPct(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setPinned(true);
    setPct((prev) => {
      const cur = prev ?? 50;
      return Math.max(0, Math.min(100, cur + (e.key === "ArrowRight" ? 4 : -4)));
    });
  }

  return {
    pct,
    ref,
    show: pct != null,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerLeave,
      onKeyDown,
    },
  };
}

export function SentimentSparkPlot({
  spark,
  className,
}: {
  spark: SentimentSpark;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const layout = useMemo(
    () =>
      sentimentSparkLayout(
        spark.price,
        spark.usual,
        SPARK_W,
        SPARK_H,
        spark.streakFrom ?? null
      ),
    [spark.price, spark.usual, spark.streakFrom]
  );

  useEffect(() => {
    if (!pinned) return;
    function onDoc(e: Event) {
      if (svgRef.current?.contains(e.target as Node)) return;
      setPinned(false);
      setActive(null);
    }
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [pinned]);

  if (!layout) return null;
  const lastIdx = spark.price.length - 1;
  const hover = active != null ? Math.max(0, Math.min(lastIdx, active)) : null;
  const hoverPrice = hover != null ? spark.price[hover] : null;
  const hoverUsual = hover != null ? spark.usual[hover] : null;
  const probe =
    hoverPrice != null && hoverUsual != null
      ? sparkProbeCopy(hoverPrice, hoverUsual, spark.at?.[hover!])
      : null;
  const probePt = hover != null ? layout.probes[hover] : null;
  const stroke = layout.last.above ? PALETTE.gain : PALETTE.loss;
  const streakFill = layout.last.above ? PALETTE.gain : PALETTE.loss;

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setActive(
      sparkIndexFromClientX(e.clientX, e.currentTarget.getBoundingClientRect(), lastIdx)
    );
    if (e.pointerType !== "mouse") setPinned(true);
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    if (e.pointerType === "mouse" || e.currentTarget.hasPointerCapture(e.pointerId)) {
      setActive(
        sparkIndexFromClientX(e.clientX, e.currentTarget.getBoundingClientRect(), lastIdx)
      );
    }
  }

  function onPointerLeave(e: PointerEvent<SVGSVGElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) return;
    if (!pinned) setActive(null);
  }

  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setPinned(true);
    setActive((prev) => {
      const cur = prev ?? lastIdx;
      return e.key === "ArrowLeft"
        ? Math.max(0, cur - 1)
        : Math.min(lastIdx, cur + 1);
    });
  }

  return (
    <div className={cn("text-muted-foreground", className)}>
      <div className="mb-2 flex items-center justify-between gap-3">
        {probe ? (
          <>
            <p className="min-w-0 truncate text-sm text-foreground">
              {probe.date || "Last year"}
            </p>
            <p className="shrink-0 text-right text-sm tabular-nums">
              <span className="text-foreground">{probe.vs}</span>
              <span className={cn("ml-1.5", signedTone(probe.ratio))}>
                {signedPercent(probe.ratio)}
              </span>
            </p>
          </>
        ) : (
          <>
            <MicroLabel>
              Last year
              <InfoTip text="S&P 500 versus its typical price over about the last year. The dashed line is that typical price. Above it is a climb. Below it is a slide. Drag across to read a day." />
            </MicroLabel>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span
                aria-hidden
                className="w-3.5 border-t border-dashed border-muted-foreground/80"
              />
              Usual
            </span>
          </>
        )}
      </div>
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          preserveAspectRatio="none"
          className="h-14 w-full cursor-crosshair touch-none outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50"
          role="slider"
          tabIndex={0}
          aria-label="S&P 500 over the last year versus its usual price. Drag or use arrows to read a day."
          aria-valuemin={0}
          aria-valuemax={lastIdx}
          aria-valuenow={hover ?? lastIdx}
          aria-valuetext={
            probe
              ? `${probe.date ? `${probe.date}, ` : ""}${probe.vs}, ${signedPercent(probe.ratio)}`
              : undefined
          }
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onKeyDown={onKeyDown}
        >
          {layout.streak ? (
            <rect
              x={(layout.streak.x0 / 100) * SPARK_W}
              y={SPARK_H - 5}
              width={((layout.streak.x1 - layout.streak.x0) / 100) * SPARK_W}
              height={3}
              rx={1.5}
              fill={streakFill}
              fillOpacity={0.45}
            />
          ) : null}
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
          {probePt ? (
            <line
              x1={(probePt.x / 100) * SPARK_W}
              x2={(probePt.x / 100) * SPARK_W}
              y1={0}
              y2={SPARK_H}
              stroke="currentColor"
              strokeOpacity={0.35}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background",
            layout.last.above ? "bg-gain" : "bg-loss"
          )}
          style={{ left: `${layout.last.x}%`, top: `${layout.last.y}%` }}
        />
        {probePt && probe ? (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground ring-2 ring-background"
              style={{ left: `${probePt.x}%`, top: `${probePt.yUsual}%` }}
            />
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background",
                probe.ratio >= 0 ? "bg-gain" : "bg-loss"
              )}
              style={{ left: `${probePt.x}%`, top: `${probePt.yPrice}%` }}
            />
          </>
        ) : null}
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
  const scrub = useScrubPct();
  const probing = scrub.show;
  const more = probing
    ? stretchProbeCopy(stretch, scrub.pct!)
    : stretch.moreLabel;

  return (
    <div className={className}>
      <div className="mb-2 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <p className="text-sm text-foreground">{stretch.inLabel}</p>
        {more ? (
          <p className="text-sm text-muted-foreground sm:text-right">{more}</p>
        ) : null}
      </div>
      <div
        ref={scrub.ref}
        className="relative flex min-h-8 cursor-ew-resize touch-none items-center outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50"
        role="slider"
        tabIndex={0}
        aria-label={`${stretch.inLabel}. ${stretch.moreLabel}. Drag to read a typical run.`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(scrub.pct ?? stretch.fillPct)}
        aria-valuetext={more}
        {...scrub.handlers}
      >
        <div className="relative h-1.5 w-full rounded-full bg-foreground/10">
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
          {probing ? (
            <TrackMarker pct={scrub.pct!} className="bg-foreground" />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LinearTrack({
  markerPct,
  band,
  bandClass,
  dotClass,
  probePct,
}: {
  markerPct: number;
  band: { fromPct: number; toPct: number } | null;
  bandClass?: string;
  dotClass: string;
  probePct: number | null;
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
      {probePct != null ? (
        <TrackMarker pct={probePct} className="bg-foreground" />
      ) : null}
    </div>
  );
}

function SignedTrack({
  fillPct,
  dotClass,
  probePct,
}: {
  fillPct: number;
  dotClass: string;
  probePct: number | null;
}) {
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
      {probePct != null ? (
        <TrackMarker pct={probePct} className="bg-foreground" />
      ) : null}
    </div>
  );
}

export function SentimentGaugeRow({ gauge }: { gauge: SentimentGaugeNote }) {
  const scrub = useScrubPct();
  const live =
    gauge.kind === "signed"
      ? gauge.signedFillPct != null
      : gauge.markerPct != null;
  const probing = live && scrub.show;
  const sub = probing
    ? gauge.kind === "signed"
      ? signedProbeCopy(gauge, scrub.pct!)
      : linearProbeCopy(gauge, scrub.pct!)
    : gauge.sub;

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
      {live ? (
        <div
          ref={scrub.ref}
          className="relative flex min-h-8 cursor-ew-resize touch-none items-center outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50"
          role="slider"
          tabIndex={0}
          aria-label={`${gauge.label} scale. ${gauge.explain}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(scrub.pct ?? gauge.markerPct ?? 50)}
          aria-valuetext={sub}
          {...scrub.handlers}
        >
          {gauge.kind === "signed" && gauge.signedFillPct != null ? (
            <SignedTrack
              fillPct={gauge.signedFillPct}
              dotClass={gauge.dotClass}
              probePct={probing ? scrub.pct : null}
            />
          ) : (
            <LinearTrack
              markerPct={gauge.markerPct!}
              band={gauge.band}
              bandClass={gauge.bandClass}
              dotClass={gauge.dotClass}
              probePct={probing ? scrub.pct : null}
            />
          )}
        </div>
      ) : (
        <div className="flex min-h-8 items-center">
          <div className="h-1.5 w-full rounded-full bg-foreground/10" />
        </div>
      )}
      {probing ? (
        <>
          <ScaleTicks ticks={gauge.ticks} show />
          <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{gauge.sub}</p>
      )}
    </div>
  );
}
