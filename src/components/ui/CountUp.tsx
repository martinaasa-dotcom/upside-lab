"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// Layout effect in the browser, so the starting figure is in place before
// the first paint and the number never flashes its end value first.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * A figure that rolls to its value instead of appearing.
 *
 * On arrival it runs up the last tenth of the way, which is enough to say
 * "this is live" without a reader watching a number climb from zero, and
 * whenever the value moves after that (a price tick) it rolls from the old
 * figure to the new one. The frames in between are motion, not figures:
 * they last under a second, the ends are always two real values, and the
 * real one is what a screen reader hears from the first frame.
 *
 * The rolling text is `aria-hidden` and the real figure sits beside it for
 * a screen reader, so nobody hears the numbers counting. Under reduced
 * motion, and on the server, it simply prints the value.
 */
const DURATION_MS = 900;
const ARRIVAL_SHARE = 0.9;

function ease(t: number): number {
  // Quick start, long settle: the last digits land gently.
  return 1 - Math.pow(1 - t, 4);
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function CountUp({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef<number | null>(null);
  const raf = useRef<number | null>(null);

  useIsoLayoutEffect(() => {
    if (!Number.isFinite(value) || prefersReducedMotion()) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = from.current ?? value * ARRIVAL_SHARE;
    from.current = value;
    if (start === value) {
      setShown(value);
      return;
    }
    setShown(start);
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / DURATION_MS);
      setShown(start + (value - start) * ease(t));
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [value]);

  return (
    <span className={className}>
      <span aria-hidden>{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
