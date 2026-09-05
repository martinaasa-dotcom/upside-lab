"use client";

/**
 * The five-year path, drawn with an axis, a rail of years and a readout
 * you can drag along it.
 *
 * Lifted out of `ForecastPanel` unchanged so the company room can draw a
 * path the same way the portfolio does. A line with no axis is a shape
 * with no units on it: a reader can see that it goes up and cannot see
 * from what to what, which on a five-year price path is the only thing
 * they actually wanted. Both callers now get the ticks, the years and the
 * drag readout from one component, so the two cannot drift into telling
 * the same story two different ways.
 */
import { compactAxis, niceScale } from "@/components/mobile/BookNavChart";
import { ChartXRail, ChartYAxis } from "@/components/ui/ChartAxis";
import {
  currency,
  percent,
  signedCurrency,
  signedTone,
} from "@/lib/format";
import { PALETTE } from "@/lib/palette";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

export type SheetPathPoint = { label: string; value: number };

export function SheetPathChart({
  points,
  placeholder = false,
}: {
  points: SheetPathPoint[];
  /**
   * True when no model has run and this shape came from the generic
   * shaper. Presentation only: the numbers are exactly the numbers the
   * grid uses, per the no-floor rule. What changes is that the line stops
   * looking like a measurement.
   */
  placeholder?: boolean;
}) {
  const gid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const width = 640;
  const height = 176;
  const padL = 8;
  const padR = 12;
  const padT = 12;
  const padB = 8;
  const usable = useMemo(
    () => points.filter((p) => Number.isFinite(p.value) && p.value > 0),
    [points]
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

  const geometry = useMemo(() => {
    if (usable.length < 2) return null;
    const vals = usable.map((p) => p.value);
    const scale = niceScale(Math.min(...vals), Math.max(...vals), 4);
    const axisSpan = scale.max - scale.min || 1;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;
    const lastIdx = usable.length - 1;
    const xAt = (i: number) =>
      padL + (lastIdx === 0 ? innerW / 2 : (i / lastIdx) * innerW);
    const yAt = (v: number) => padT + (1 - (v - scale.min) / axisSpan) * innerH;
    const line = usable
      .map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`)
      .join(" ");
    const area = `${xAt(0).toFixed(1)},${(padT + innerH).toFixed(1)} ${line} ${xAt(lastIdx).toFixed(1)},${(padT + innerH).toFixed(1)}`;
    return { ...scale, innerW, innerH, lastIdx, xAt, yAt, line, area };
  }, [usable]);

  if (!geometry) return null;

  const { ticks, innerW, innerH, lastIdx, xAt, yAt, line, area } = geometry;
  const start = usable[0]!.value;
  const hover =
    active != null && active >= 0 && active <= lastIdx ? active : null;
  const hoverPoint = hover != null ? usable[hover] : null;
  const vsNowPct =
    hoverPoint && start > 0 ? (hoverPoint.value - start) / start : null;
  const vsNowDollar =
    hoverPoint && start > 0 ? hoverPoint.value - start : null;

  function indexFromClientX(clientX: number, target: SVGSVGElement) {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || lastIdx <= 0) return 0;
    const x = ((clientX - rect.left) / rect.width) * width;
    const t = (x - padL) / innerW;
    return Math.max(0, Math.min(lastIdx, Math.round(t * lastIdx)));
  }

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setActive(indexFromClientX(e.clientX, e.currentTarget));
    if (e.pointerType !== "mouse") setPinned(true);
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const dragging = e.currentTarget.hasPointerCapture(e.pointerId);
    if (e.pointerType === "mouse" || dragging) {
      setActive(indexFromClientX(e.clientX, e.currentTarget));
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
    <div>
      <div className="relative">
        {hoverPoint ? (
          <div className="pointer-events-none absolute inset-x-0 top-1 z-10 flex justify-center px-10">
            <p className="max-w-full truncate rounded-lg border border-border bg-muted/95 px-2.5 py-1 text-sm tabular-nums shadow-sm">
              <span className="text-muted-foreground">{hoverPoint.label}</span>
              <span className="mx-1.5 font-semibold text-foreground">
                {currency(hoverPoint.value, 0)}
              </span>
              {vsNowPct != null && vsNowDollar != null ? (
                <span className={signedTone(vsNowPct)}>
                  {vsNowPct > 0 ? "+" : ""}
                  {percent(vsNowPct)}
                  <span className="text-muted-foreground">
                    {" "}
                    · {signedCurrency(vsNowDollar, 0)}
                  </span>
                </span>
              ) : null}
            </p>
          </div>
        ) : null}

        <div className="relative">
          <ChartYAxis
            overlay
            ticks={ticks}
            yAt={yAt}
            height={height}
            format={compactAxis}
          />
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="h-56 w-full min-w-0 cursor-crosshair touch-none select-none outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50 sm:h-72"
            role="slider"
            tabIndex={0}
            aria-label="Drag across to read a year. Modeled portfolio value through the last forecast year."
            aria-valuemin={0}
            aria-valuemax={lastIdx}
            aria-valuenow={hover ?? lastIdx}
            aria-valuetext={
              hoverPoint
                ? `${hoverPoint.label}, ${currency(hoverPoint.value, 0)}${
                    vsNowPct != null
                      ? `, ${percent(vsNowPct)} against today`
                      : ""
                  }`
                : undefined
            }
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
            onKeyDown={onKeyDown}
          >
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={PALETTE.brand} stopOpacity="0.22" />
                <stop offset="1" stopColor={PALETTE.brand} stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((t) => (
              <line
                key={t}
                x1={padL}
                x2={width - padR}
                y1={yAt(t)}
                y2={yAt(t)}
                stroke="currentColor"
                strokeOpacity={0.08}
              />
            ))}
            {placeholder ? null : (
              <polygon points={area} fill={`url(#${gid})`} />
            )}
            <polyline
              fill="none"
              stroke={PALETTE.brand}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeOpacity={placeholder ? 0.5 : 1}
              /*
                The dashes are screen units, not viewBox units. This svg is
                `preserveAspectRatio="none"` over a fixed 640-wide box, so
                the horizontal scale runs from about 0.53 on a phone to 1.45
                on a laptop: a plain "6 5" pattern reads as a dashed line at
                1280 and as a solid one at 390, which is the one width where
                the reader most needs to see that nothing has been reasoned.
              */
              vectorEffect={placeholder ? "non-scaling-stroke" : undefined}
              strokeDasharray={placeholder ? "5 4" : undefined}
              points={line}
            />
            {usable.map((p, i) => (
              <circle
                key={p.label}
                cx={xAt(i)}
                cy={yAt(p.value)}
                r={2.5}
                fill={PALETTE.card}
                stroke={PALETTE.cream}
                strokeWidth={1.5}
              />
            ))}
            {hover != null && hoverPoint && (
              <g pointerEvents="none">
                <line
                  x1={xAt(hover)}
                  x2={xAt(hover)}
                  y1={padT}
                  y2={padT + innerH}
                  stroke={PALETTE.cream}
                  strokeOpacity={0.45}
                />
                <circle
                  cx={xAt(hover)}
                  cy={yAt(hoverPoint.value)}
                  r={4.5}
                  fill={PALETTE.cream}
                  stroke={PALETTE.card}
                  strokeWidth={1.5}
                />
              </g>
            )}
          </svg>
        </div>
      </div>
      <ChartXRail inset>
          {usable.map((p, i) => {
            const isFirst = i === 0;
            const isLast = i === lastIdx;
            return (
              <span
                key={p.label}
                className="absolute top-0"
                style={{
                  left: `${((xAt(i) - padL) / innerW) * 100}%`,
                  transform: isFirst
                    ? "translateX(0)"
                    : isLast
                      ? "translateX(-100%)"
                      : "translateX(-50%)",
                }}
              >
                {p.label}
              </span>
            );
          })}
      </ChartXRail>
    </div>
  );
}
