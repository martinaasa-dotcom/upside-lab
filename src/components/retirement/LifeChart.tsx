"use client";

import { cn } from "@/lib/format";
import { shortMoney, type LifePath } from "@/lib/retirement/life-path";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

/**
 * YOUR MONEY OVER YOUR LIFE, AS ONE MOUNTAIN YOU CAN RESHAPE WITH A FINGER.
 *
 * Gold while you work, climbing as saving and growth add up; pale once you
 * stop, spent down year by year. The flag is the age you stop, and it
 * drags: every year you move it redraws the whole mountain, because the
 * plan behind it is rebuilt on the spot. Anything else that changes the
 * plan (a rent, a child, the growth rate) morphs the mountain from its old
 * shape to its new one rather than swapping it, so a reader SEES what a
 * change did rather than having to compare two pictures in their head.
 *
 * Where the money runs out, the floor under the rest of the life is drawn
 * in the loss colour with the age on it. That is the one place red is
 * spent on this card, and it means what it means everywhere else.
 *
 * The morph is a tween over the same ages, never a CSS transition on the
 * path, because Safari does not animate `d`. Under reduced motion the new
 * shape simply arrives.
 */

const H = 230;
const PAD_TOP = 34;
const PAD_BOTTOM = 34;
const TWEEN_MS = 520;

function reducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function ease(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** The shown mountain, walking towards the real one. */
function useTweened(target: Map<number, number>): Map<number, number> {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    const from = shownRef.current;
    if (reducedMotion()) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / TWEEN_MS);
      const k = ease(t);
      const next = new Map<number, number>();
      for (const [age, v] of target) {
        const a = from.get(age) ?? 0;
        next.set(age, a + (v - a) * k);
      }
      shownRef.current = next;
      setShown(next);
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [target]);
  return shown;
}

type Mark = { age: number; label: string; strong?: boolean; rank: number };

export function LifeChart({
  path,
  currentAge,
  retirementAge,
  pensionAge,
  earliestAge,
  onRetirementAge,
  symbol,
  format,
}: {
  path: LifePath;
  currentAge: number;
  retirementAge: number;
  /** When a pension starts paying, if it starts inside the picture. */
  pensionAge: number | null;
  earliestAge: number | null;
  onRetirementAge: (age: number) => void;
  /** The currency sign, for the short labels on the picture. */
  symbol: string;
  /** Full money formatting, for the readout. */
  format: (n: number) => string;
}) {
  const uid = useId().replace(/:/g, "");
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

  const target = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of path.points) m.set(p.age, p.pot);
    return m;
  }, [path]);
  const shown = useTweened(target);

  const first = Math.round(currentAge);
  const last = Math.max(first + 1, path.endAge);
  const span = last - first;
  const stop = Math.min(last - 1, Math.max(first, Math.round(retirementAge)));

  const ages: number[] = [];
  for (let a = first; a <= last; a++) if (target.has(a)) ages.push(a);

  let top = 1;
  for (const a of ages) top = Math.max(top, shown.get(a) ?? 0);
  const yMax = top * 1.12;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const x = (a: number) => ((a - first) / span) * w;
  const y = (v: number) => PAD_TOP + plotH - (Math.max(0, v) / yMax) * plotH;
  const floor = y(0);

  const line = (from: number, to: number) =>
    ages
      .filter((a) => a >= from && a <= to)
      .map((a, i) => `${i === 0 ? "M" : "L"}${x(a).toFixed(1)},${y(shown.get(a) ?? 0).toFixed(1)}`)
      .join(" ");
  const area = (from: number, to: number) => {
    const d = line(from, to);
    if (!d) return "";
    const lo = Math.max(first, from);
    const hi = Math.min(last, to);
    return `${d} L${x(hi).toFixed(1)},${floor.toFixed(1)} L${x(lo).toFixed(1)},${floor.toFixed(1)} Z`;
  };

  const [hover, setHover] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [touched, setTouched] = useState(false);
  const draggingRef = useRef(false);

  const ageAt = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - rect.left) / Math.max(1, rect.width);
    return Math.round(first + Math.min(1, Math.max(0, f)) * span);
  };
  const clampStop = (a: number) => Math.min(Math.min(90, last - 1), Math.max(first, a));
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    setDragging(true);
    setTouched(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    const a = clampStop(ageAt(e));
    if (a !== stop) onRetirementAge(a);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const a = ageAt(e);
    if (draggingRef.current) {
      const s = clampStop(a);
      if (s !== stop) onRetirementAge(s);
    } else if (e.pointerType === "mouse") {
      setHover(a);
    }
  };
  const onUp = () => {
    draggingRef.current = false;
    setDragging(false);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const d =
      e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    setTouched(true);
    onRetirementAge(clampStop(stop + d));
  };

  const stopPot = shown.get(stop) ?? 0;
  const hx = x(stop);
  const hy = y(stopPot);
  const runsOut = path.emptyAt != null && path.emptyAt < last ? path.emptyAt : null;

  /*
    The rail under the mountain. Labels that would print through each
    other are dropped lowest rank first, because two ages overlapping read
    as one broken number.
  */
  const marks = useMemo(() => {
    const all: Mark[] = [
      { age: stop, label: `Stop at ${stop}`, strong: true, rank: 0 },
      { age: first, label: `Now ${first}`, rank: 1 },
      { age: last, label: `Until ${last}`, rank: 2 },
    ];
    if (runsOut != null) all.push({ age: runsOut, label: `Runs out at ${runsOut}`, rank: 1 });
    if (earliestAge != null && earliestAge !== stop && earliestAge > first && earliestAge < last)
      all.push({ age: earliestAge, label: `Earliest ${earliestAge}`, rank: 3 });
    if (pensionAge != null && pensionAge > first && pensionAge < last)
      all.push({ age: pensionAge, label: `Pension ${pensionAge}`, rank: 3 });
    const kept: Mark[] = [];
    const minGap = w < 480 ? 76 : 92;
    for (const m of [...all].sort((a, b) => a.rank - b.rank)) {
      if (kept.every((k) => Math.abs(x(k.age) - x(m.age)) >= minGap)) kept.push(m);
    }
    return kept;
    // x is derived from first, span and w.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop, first, last, runsOut, pensionAge, earliestAge, w, span]);

  const hoverAge = dragging ? null : hover;
  const bubbleAge = hoverAge ?? stop;
  const bubbleValue = hoverAge != null ? (target.get(hoverAge) ?? 0) : (target.get(stop) ?? 0);
  const bubbleX = Math.min(Math.max(x(bubbleAge), 70), Math.max(70, w - 70));
  const bubbleY = y(hoverAge != null ? (shown.get(hoverAge) ?? 0) : stopPot);

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={wrapRef}
        role="slider"
        tabIndex={0}
        aria-label="The age you stop working"
        aria-valuemin={first}
        aria-valuemax={Math.min(90, last - 1)}
        aria-valuenow={stop}
        aria-valuetext={`Stop at ${stop}, with ${format(target.get(stop) ?? 0)}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKey}
        className={cn(
          "relative touch-none select-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring",
          dragging ? "cursor-grabbing" : "cursor-grab"
        )}
        style={{ height: H }}
      >
        <svg width={w} height={H} className="block overflow-visible" aria-hidden>
          <defs>
            <linearGradient id={`${uid}-work`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.55} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id={`${uid}-rest`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--foreground)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--foreground)" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          {/* Quiet guides at a quarter, half and three quarters. */}
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={0}
              x2={w}
              y1={y(yMax * f)}
              y2={y(yMax * f)}
              className="stroke-foreground/[0.06]"
              strokeDasharray="2 6"
            />
          ))}

          <g className="line-reveal">
            <path d={area(first, stop)} fill={`url(#${uid}-work)`} />
            <path d={area(stop, last)} fill={`url(#${uid}-rest)`} />
            <path
              d={line(first, stop)}
              fill="none"
              className="stroke-primary"
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d={line(stop, last)}
              fill="none"
              className="stroke-foreground/60"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>

          <line x1={0} x2={w} y1={floor} y2={floor} className="stroke-foreground/20" />
          {runsOut != null ? (
            <line
              x1={x(runsOut)}
              x2={w}
              y1={floor}
              y2={floor}
              className="stroke-loss"
              strokeWidth={3}
              strokeLinecap="round"
            />
          ) : null}

          {pensionAge != null && pensionAge > first && pensionAge < last ? (
            <line
              x1={x(pensionAge)}
              x2={x(pensionAge)}
              y1={floor - 8}
              y2={floor}
              className="stroke-foreground/50"
              strokeWidth={1.5}
            />
          ) : null}

          {earliestAge != null && earliestAge !== stop && earliestAge > first && earliestAge < last ? (
            <circle
              cx={x(earliestAge)}
              cy={floor}
              r={4}
              className="fill-background stroke-primary"
              strokeWidth={2}
            />
          ) : null}

          {hoverAge != null ? (
            <line
              x1={x(hoverAge)}
              x2={x(hoverAge)}
              y1={PAD_TOP - 4}
              y2={floor}
              className="stroke-foreground/25"
            />
          ) : null}

          {/* The flag: the day you stop. */}
          <line x1={hx} x2={hx} y1={hy} y2={floor} className="stroke-primary/70" strokeWidth={1.5} strokeDasharray="3 3" />
        </svg>

        {/* The knob, in HTML so it can breathe until somebody touches it. */}
        <span
          className="pointer-events-none absolute"
          style={{ left: hx, top: hy, transform: "translate(-50%, -50%)" }}
          aria-hidden
        >
          {!touched ? (
            <span className="absolute inset-0 -m-2 animate-ping rounded-full bg-primary/40 motion-reduce:hidden" />
          ) : null}
          <span
            className={cn(
              "relative block rounded-full border-2 border-background bg-primary shadow-[0_0_0_4px_color-mix(in_oklch,var(--primary)_25%,transparent)] transition-transform duration-150 motion-reduce:transition-none",
              dragging ? "size-5 scale-110" : "size-4"
            )}
          />
        </span>

        {/* The bubble: what is in the pot at the flag, or where the pointer is. */}
        <span
          className="pointer-events-none absolute flex -translate-x-1/2 flex-col items-center whitespace-nowrap"
          style={{ left: bubbleX, top: Math.max(0, bubbleY - 34) }}
          aria-hidden
        >
          <span className="rounded-full bg-background/85 px-2.5 py-0.5 font-mono text-xs tabular-nums text-foreground ring-1 ring-foreground/15">
            {hoverAge != null ? `At ${hoverAge}: ` : ""}
            {shortMoney(bubbleValue, symbol)}
          </span>
        </span>

        {/* The rail, in HTML so it is the app's own type. */}
        {marks.map((m) => {
          const left = Math.min(Math.max(x(m.age), 0), w);
          const align = left < 40 ? "left" : left > w - 40 ? "right" : "center";
          return (
            <span
              key={`${m.label}`}
              className={cn(
                "pointer-events-none absolute whitespace-nowrap text-xs",
                m.strong ? "font-medium text-foreground" : "text-muted-foreground",
                m.label.startsWith("Runs out") && "text-loss",
                align === "center" && "-translate-x-1/2",
                align === "right" && "-translate-x-full"
              )}
              style={{ left, top: floor + 10 }}
              aria-hidden
            >
              {m.label}
            </span>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground" aria-hidden>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-4 rounded-sm bg-primary/70" />
          Saving
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-4 rounded-sm bg-foreground/35" />
          Spending it
        </span>
        <span className="ml-auto">Drag the dot to try another age</span>
      </div>
    </div>
  );
}
