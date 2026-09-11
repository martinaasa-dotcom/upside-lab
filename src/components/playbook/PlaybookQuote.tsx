"use client";

import { InfoTip } from "@/components/ui/Panel";
import { cn } from "@/lib/format";
import type { Quote } from "@/lib/playbook";

/**
 * A quotation, which is the app reporting what a named person said.
 *
 * The author is not decoration and is not optional: it is the whole reason
 * a sentence in this room may be an instruction where nothing else in the
 * product may. So the name is on the page at the same weight as everything
 * else, never a whisper under a slab of italics, and where the trail is
 * thinner than the name suggests the mark beside it says so rather than
 * the page quietly implying a source it does not have.
 *
 * The rule is drawn with a rule: a hairline down the left edge, which is
 * the one piece of typography everybody already reads as somebody else
 * talking. No quotation-mark glyph the size of a fist, no tint. The words
 * are the thing.
 */
export function PlaybookQuote({
  quote,
  className,
}: {
  quote: Quote;
  className?: string;
}) {
  return (
    <figure className={cn("border-l-2 border-primary/40 pl-4", className)}>
      <blockquote className="text-base leading-relaxed text-foreground">
        &ldquo;{quote.text}&rdquo;
      </blockquote>
      <figcaption className="mt-2 font-mono text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {quote.author}
        {quote.attribution ? (
          <InfoTip text={quote.attribution} label="Where this comes from" />
        ) : null}
      </figcaption>
    </figure>
  );
}
