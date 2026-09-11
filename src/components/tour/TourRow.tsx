"use client";

import { cn } from "@/lib/format";

/*
  The material every card inside the walkthrough is made of.

  Top-level `.glass`, not the nested `.glass-well` a card inside a Panel
  uses. A well is deliberately the quieter of the two: weaker top hairline,
  no bottom hairline, no lift. That is right for something sitting inside a
  page card that is already carrying the refraction, and wrong here, because
  the walkthrough floats over an 80% scrim where there is nothing else doing
  it. On a near-black field the edge is what sells glass rather than the
  blur, so these need all three specular terms.
*/
export const ROW_GLASS = "card-sheen glass rounded-lg";

/** One explained thing on a telling screen. Icon, name, sentence. */
export function TourRow({
  icon: Icon,
  term,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  term: string;
  children: React.ReactNode;
}) {
  return (
    <li className={cn(ROW_GLASS, "flex items-start gap-3 p-4")}>
      {Icon ? (
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      ) : null}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{term}</span>
        <span className="text-sm text-muted-foreground">{children}</span>
      </span>
    </li>
  );
}

/**
 * The line that sits above an interaction and says what to do with it.
 *
 * Every screen in this walkthrough wants a tap before it wants a read, and
 * a thing you can press is only obviously a thing you can press once you
 * have pressed one. So each of them says so once, quietly, in the same
 * place and the same voice.
 */
/**
 * The one line per screen that says what to do here.
 *
 * It was `text-sm`, the same size as every other word in the walkthrough,
 * separated from the body only by its weight. Measured across all seven
 * screens, 98% of the tour's words were at 14px or smaller and exactly one
 * word was larger, so the screens had no hierarchy inside them at all: the
 * ask, the explanation and the fine print were one size. A step up costs
 * one line of height per screen and is the whole of what makes the ask
 * findable.
 */
export function TourAsk({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-base font-medium leading-snug text-foreground">
      {children}
    </p>
  );
}
