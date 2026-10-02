import type { ReactNode } from "react";

/**
 * A gauge marker that travels to its reading on arrival (`.sweep-in`).
 *
 * Wrap the marker exactly as it was, still positioned by its own `left`
 * inside the track: this layer is the full width of the track, so moving
 * it by the marker's share of the track moves the marker from `from` to
 * `at` with a transform and no measuring. `at` and `from` are fractions of
 * the track, 0 at the start and 1 at the end.
 */
export function Sweep({
  at,
  from = 0,
  children,
}: {
  at: number;
  from?: number;
  children: ReactNode;
}) {
  const clamp = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
  return (
    <span
      aria-hidden
      className="sweep-in pointer-events-none absolute inset-0"
      style={{
        ["--at" as string]: clamp(at),
        ["--from-at" as string]: clamp(from),
      }}
    >
      {children}
    </span>
  );
}
