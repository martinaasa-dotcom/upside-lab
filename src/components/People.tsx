import { cn } from "@/lib/format";

/**
 * Retired Circle dock mark: three overlapping discs.
 *
 * The Circle cell is `CircleNavIcon` now, the same 24px stroke as the rest
 * of the bar. This file stays so the discs can return in one import if a
 * wordless phone bar ever needs a filled mark again.
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
