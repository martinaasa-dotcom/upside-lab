/**
 * One proportional bar, `Segmented`'s well made presentational.
 *
 * Three screens drew this exact bar by hand (the circle's "What the
 * circle owns", Lab's "What you're actually betting on", the Fund's
 * "Where the money sits") with three copies of the same markup, so a fix
 * to one had to be remembered in the other two. One component now, so
 * the three cannot drift apart again.
 *
 * Adjacent slices used to sit flush against each other with no edge
 * between them, which is fine when two neighbouring colors are far apart
 * on the wheel and reads as one blended block when they are not — this
 * app's own ten-hue ramp (`--cat-*` in globals.css) puts a couple of
 * near-identical blues a few slices apart, and on a book weighted toward
 * one or two themes those are exactly the two likely to land side by
 * side. A `gap` between slices was tried first and reverted: flexbox
 * treats each slice's `width` as its flex-basis, so a gap large enough to
 * read forces every slice to shrink to make room for it, which is a
 * second, silent distortion of the one thing a bar like this promises —
 * that a slice's width is its share. An inset `box-shadow` costs nothing
 * from the layout instead: it paints a hairline just inside each slice's
 * trailing edge, over its own fill, so widths stay exactly what the data
 * said.
 *
 * The line is `--muted`, the track's own color (the bar sits on
 * `bg-muted`), not `--background`. `--muted` is `oklch(0.269 0 0)` against
 * a true-black `--background` of `oklch(0 0 0)` — close enough that the
 * difference is invisible on its own, but a seam drawn in pure black reads
 * as a foreign line cut into the bar, where the track's own color reads as
 * the track showing through a seam, which is what a gap would have shown
 * had it not cost the bar its own widths.
 */
export type AllocationBarSlice = {
  key: string;
  /** 0-1. Rendered width is never less than 1.5%, so a real but tiny
   * slice still shows a sliver rather than vanishing. */
  pct: number;
  color: string;
  /** Read on hover/focus; callers already have their own "12%" vs "less
   * than 1%" rounding rule, so this is the finished string, not a number. */
  title: string;
};

export function AllocationBar({ slices }: { slices: AllocationBarSlice[] }) {
  return (
    <div className="flex h-3 overflow-hidden rounded-full bg-muted">
      {slices.map((s, i) => (
        <div
          key={s.key}
          style={{
            width: `${Math.max(1.5, s.pct * 100)}%`,
            backgroundColor: s.color,
            boxShadow:
              i < slices.length - 1
                ? "inset -1.5px 0 0 0 var(--muted)"
                : undefined,
          }}
          title={s.title}
        />
      ))}
    </div>
  );
}
