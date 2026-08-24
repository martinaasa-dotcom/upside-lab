import { cn } from "@/lib/format";

/**
 * The people in your circle, at the size a glyph would be.
 *
 * Three discs rather than a picture of anybody: neither dock has a member
 * list to draw from, and inventing faces would be worse than saying "people"
 * plainly. It replaced a compass, which said "explore" and is not what a
 * circle is.
 *
 * It matters most on the phone, where the bar carries no words at all: it is
 * the one cell that is not a line drawing, which is what makes it findable
 * without a label under it. Upside Arena's last cell is the player's own
 * face doing the same job, and the two apps are meant to stay one design.
 *
 * The ring is the field's own black rather than a colour, so the discs read
 * as separated from each other rather than as outlined.
 *
 * `bg-current` at three opacities, never the accent. Two reasons, and both
 * matter. It follows the cell's own colour, so the mark brightens when the
 * cell is marked exactly as a line glyph would, instead of sitting at one
 * tone whatever the bar is doing. And the accent is spent on news: a gold
 * disc here measured about as loud as the alert dot two cells along, which
 * is the one saturated pixel on the bar that has to be the loudest thing
 * on it.
 */
export function People({ compact = false }: { compact?: boolean }) {
  const disc = cn(
    "block shrink-0 rounded-full ring-[1.5px] ring-background",
    compact ? "size-3" : "size-[15px]"
  );
  const lap = compact ? "-ml-1" : "-ml-1.5";

  return (
    <span className="flex shrink-0 items-center" aria-hidden>
      <i className={cn(disc, "bg-current")} />
      <i className={cn(disc, lap, "bg-current opacity-60")} />
      <i className={cn(disc, lap, "bg-current opacity-35")} />
    </span>
  );
}
