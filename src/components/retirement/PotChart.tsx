"use client";

import { cn, currency } from "@/lib/format";
import type { PotCurvePoint } from "@/lib/retirement/plan";
import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

/**
 * "WHEN CAN I STOP", AS ONE PICTURE YOU CAN DRAG.
 *
 * Two lines across the ages you could stop at: what the pot would be on
 * that day (gold, climbing as saving and growth add up) and what stopping
 * at that age would need (dashed, falling, because every year later is a
 * year less to fund and a year nearer the pension). Where gold crosses the
 * dashed line is the earliest age this plan works, and it is the same
 * number the sentence under it names, because both read `potCurve`.
 *
 * The handle is the reader's own age of stopping. Dragging it (or the
 * arrow keys, since it is a slider) moves the plan, and the readout above
 * it says what they would have, what they would need, and the difference,
 * in their own money. It replaces a headline number and a paragraph with
 * the one thing a person actually asks of a retirement plan: what happens
 * if I stop a little earlier, or a little later.
 *
 * The need line starts out of sight: stopping next year needs many times
 * more than anybody has, and a scale drawn to fit that flattens both lines
 * into the floor. So the scale fits the pot and the need at the ages that
 * matter, and the need line enters from above the frame.
 */
export function PotChart({
  curve,
  retirementAge,
  earliestAge,
  onRetirementAge,
  code,
}: {
  curve: PotCurvePoint[];
  retirementAge: number;
  earliestAge: number | null;
  onRetirementAge: (age: number) => void;
  code: string;
}) {
  // Per instance: a fixed id collides when the room is mounted twice.
  const clipId = `pot-clip-${useId().replace(/:/g, "")}`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => {
      const next = el.clientWidth;
      if (next > 0) setW((prev) => (Math.abs(prev - next) < 1 ? prev : next));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 220;
  const PAD_TOP = 12;
  const PAD_BOTTOM = 26;
  const plotH = H - PAD_TOP - PAD_BOTTOM;

  const first = curve[0]?.age ?? 30;
  const last = curve[curve.length - 1]?.age ?? 80;
  const span = Math.max(1, last - first);
  const age = Math.min(last, Math.max(first, Math.round(retirementAge)));
  const at = curve.find((p) => p.age === age) ?? curve[0];

  /*
    The scale is fitted to the decision, not to the whole curve. Fitted to
    the pot at 80 it flattened the need line into the floor and the
    crossing, the one point the chart exists for, into a corner. So it
    fits both figures at the reader's own age and at the crossing, plus a
    few years of the pot past whichever is later, and lets the pot line
    leave through the top after that.
  */
  const yMax = useMemo(() => {
    const pointAt = (a: number | null) =>
      a == null ? null : (curve.find((p) => p.age === a) ?? null);
    const later = Math.min(last, Math.max(age, earliestAge ?? age) + 4);
    const candidates = [pointAt(age), pointAt(earliestAge), pointAt(later)]
      .filter((p): p is PotCurvePoint => p != null)
      .flatMap((p) => [p.have, p.need]);
    return Math.max(1, Math.max(0, ...candidates) * 1.2);
  }, [curve, age, earliestAge, last]);

  const x = useCallback((a: number) => ((a - first) / span) * w, [first, span, w]);
  const y = useCallback(
    (v: number) => PAD_TOP + plotH - (Math.min(v, yMax * 1.6) / yMax) * plotH,
    [plotH, yMax]
  );

  const path = (key: "have" | "need") =>
    curve
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.age).toFixed(1)},${y(p[key]).toFixed(1)}`)
      .join(" ");

  /*
    The stretch where the pot is enough, filled between the two lines, so
    the answer is a shape as well as a crossing.
  */
  const enough = useMemo(() => {
    const pts = curve.filter((p) => p.need > 0 && p.have >= p.need);
    if (pts.length < 2) return null;
    const top = pts.map((p) => `${x(p.age).toFixed(1)},${y(p.have).toFixed(1)}`);
    const bottom = [...pts].reverse().map((p) => `${x(p.age).toFixed(1)},${y(p.need).toFixed(1)}`);
    return `M${top.join(" L")} L${bottom.join(" L")} Z`;
  }, [curve, x, y]);

  const ticks = useMemo(() => {
    const step = span > 40 ? 10 : 5;
    const out: number[] = [];
    for (let a = Math.ceil(first / step) * step; a <= last; a += step) out.push(a);
    return out;
  }, [first, last, span]);

  const dragging = useRef(false);
  /*
    The readout only speaks while the handle is being moved. At rest the
    handle sits on the reader's own age of stopping, and the verdict card
    directly above has already said what they would have and need there,
    in bigger type; printing it a second time over the chart was the same
    three figures twice in one card.
  */
  const [active, setActive] = useState(false);
  const ageFromEvent = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / Math.max(1, rect.width);
    return Math.round(first + Math.min(1, Math.max(0, frac)) * span);
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    setActive(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    const next = ageFromEvent(e);
    if (next !== age) onRetirementAge(next);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const next = ageFromEvent(e);
    if (next !== age) onRetirementAge(next);
  };
  const onUp = () => {
    dragging.current = false;
    setActive(false);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (e.key === "Home") return void (e.preventDefault(), onRetirementAge(first));
    if (e.key === "End") return void (e.preventDefault(), onRetirementAge(last));
    if (!step) return;
    e.preventDefault();
    onRetirementAge(Math.min(last, Math.max(first, age + step)));
  };

  const gap = at ? at.have - at.need : 0;
  const hx = x(age);
  const readoutLeft = Math.min(Math.max(hx, 90), Math.max(90, w - 90));

  return (
    <div className="flex flex-col gap-3">
      {/* The readout rides above the handle. */}
      <div className="relative h-14" aria-live="polite">
        <span
          className={cn(
            "absolute left-0 top-0 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground transition-opacity duration-150 motion-reduce:transition-none",
            active ? "opacity-0" : "opacity-100"
          )}
          aria-hidden
        >
          Drag to try another age
        </span>
        <div
          className={cn(
            "absolute inset-x-0 top-0 h-full transition-opacity duration-150 motion-reduce:transition-none",
            active ? "opacity-100" : "opacity-0"
          )}
        >
          <div
            className="absolute top-0 flex -translate-x-1/2 flex-col items-center whitespace-nowrap text-center transition-[left] duration-150 ease-out motion-reduce:transition-none"
            style={{ left: readoutLeft }}
          >
            <span className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
              Stop at <span className="text-foreground">{age}</span>
            </span>
            <span className="font-mono text-sm tabular-nums text-foreground">
              <span className="text-primary">{currency(at?.have ?? 0, 0, code)}</span>
              <span className="text-muted-foreground"> of </span>
              {currency(at?.need ?? 0, 0, code)}
            </span>
            <span className="text-xs text-muted-foreground">
              {gap >= 0
                ? `${currency(gap, 0, code)} more than it needs`
                : `${currency(-gap, 0, code)} short`}
            </span>
          </div>
        </div>
      </div>

      <div
        ref={wrapRef}
        role="slider"
        tabIndex={0}
        aria-label="Age you stop working"
        aria-valuemin={first}
        aria-valuemax={last}
        aria-valuenow={age}
        aria-valuetext={`Stop at ${age}: ${currency(at?.have ?? 0, 0, code)} against ${currency(at?.need ?? 0, 0, code)} needed`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        onFocus={(e) => {
          if (e.currentTarget.matches(":focus-visible")) setActive(true);
        }}
        onBlur={() => setActive(false)}
        className="relative cursor-ew-resize touch-none select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ height: H }}
      >
        <svg width={w} height={H} className="block overflow-visible" aria-hidden>
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={w} height={H - PAD_BOTTOM} />
            </clipPath>
          </defs>
          {/* Floor. */}
          <line x1={0} x2={w} y1={y(0)} y2={y(0)} className="stroke-foreground/15" strokeWidth={1} />
          <g clipPath={`url(#${clipId})`}>
            {enough ? <path d={enough} className="fill-foreground/[0.06]" /> : null}
            <path
              d={path("need")}
              fill="none"
              className="stroke-foreground/55"
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
            <path
              d={path("have")}
              fill="none"
              className="line-reveal stroke-primary"
              strokeWidth={2.25}
              strokeLinejoin="round"
            />
          </g>
          {earliestAge != null ? (
            <g>
              <circle
                cx={x(earliestAge)}
                cy={y(curve.find((p) => p.age === earliestAge)?.have ?? 0)}
                r={4.5}
                className="fill-background stroke-primary"
                strokeWidth={2}
              />
            </g>
          ) : null}
          {/* The handle: the reader's own age of stopping. */}
          <line
            x1={hx}
            x2={hx}
            y1={PAD_TOP - 6}
            y2={y(0)}
            className="stroke-foreground/50"
            strokeWidth={1}
          />
          <circle cx={hx} cy={y(at?.have ?? 0)} r={6} className="fill-primary" />
          <circle cx={hx} cy={y(at?.have ?? 0)} r={11} className="fill-primary/20" />
          <rect
            x={hx - 9}
            y={y(0) - 1}
            width={18}
            height={10}
            rx={5}
            className="fill-foreground"
          />
        </svg>
        {/* Age ticks, in HTML so they are the app's own type. */}
        {ticks.map((t) => (
          <span
            key={t}
            className="pointer-events-none absolute -translate-x-1/2 font-mono text-xs tabular-nums text-muted-foreground"
            style={{ left: x(t), top: H - PAD_BOTTOM + 10 }}
            aria-hidden
          >
            {t}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground" aria-hidden>
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-5 rounded-full bg-primary" />
          What you would have
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-5 border-t-[1.5px] border-dashed border-foreground/55" />
          What stopping then needs
        </span>
        {earliestAge != null ? (
          <span className="inline-flex items-center gap-2">
            <span className={cn("size-2.5 rounded-full border-2 border-primary bg-background")} />
            Earliest: {earliestAge}
          </span>
        ) : null}
      </div>
    </div>
  );
}
