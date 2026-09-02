"use client";

import { useSyncExternalStore } from "react";
import { MicroLabel } from "@/components/ui/Panel";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/format";
import { explainTerm, type GlossaryExample } from "@/lib/glossary";

/**
 * A column heading a person can ask about.
 *
 * Every explanation in the holdings table used to be a `title` attribute, so
 * the reader who most needs it, the beginner on a phone, could not reach a
 * single one of them: there is no hover on a touch screen. Measured on the
 * portfolio room, 49 elements carried an explanation nobody could open.
 *
 * So a label becomes the trigger for its own glossary entry, and the entry
 * arrives with the reader's own figure in it, because "what you paid" means
 * nothing until it means "$168.40 a share on $AAPL". The words live in
 * `src/lib/glossary.ts` so the same term reads the same everywhere.
 *
 * Two shapes, the same pair `WhyThis` uses and for the same reason: a
 * bottom sheet below `md`, where a popover pinned to a table cell would be
 * a paragraph in a letterbox, and a popover from `md` up, where there is
 * room for one beside the figure it explains.
 *
 * It is deliberately not the provenance eye. That one answers "who made
 * this number"; this one answers "what is this word", and a reader
 * scanning a page has to be able to tell the two apart at a glance.
 */

const NARROW = "(max-width: 47.999rem)";

function useNarrow(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(NARROW);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(NARROW).matches,
    // No width on the server. The popover renders, and the sheet takes over
    // on hydration, which is before anybody can have pressed anything.
    () => false
  );
}

/**
 * The dotted underline is the whole affordance.
 *
 * A label that opens something has to look different from one that does
 * not, and it has to do so without spending the accent colour, which this
 * app keeps for news. A hairline under the word is the oldest answer there
 * is and it survives being set in 11px uppercase mono.
 */
const TRIGGER_CLASS =
  "inline-flex max-w-full items-center gap-1 border-b border-dashed border-border/70 text-left outline-none transition hover:border-foreground/60 hover:text-foreground focus-visible:border-foreground/60 focus-visible:text-foreground";

/** Same target, no underline, for a glyph beside a control that has its own job. */
const BARE_TRIGGER_CLASS =
  "relative inline-flex size-4 shrink-0 items-center justify-center align-text-bottom text-muted-foreground outline-none transition hover:text-foreground focus-visible:text-foreground";

function TermBody({
  term,
  meaning,
  example,
}: {
  term: string;
  meaning: string;
  example: string | null;
}) {
  return (
    <>
      <MicroLabel>{term}</MicroLabel>
      <p className="mt-2 text-sm leading-relaxed text-foreground">{meaning}</p>
      {example ? (
        <p className="mt-4 border-t border-border pt-3 text-sm leading-relaxed text-muted-foreground">
          {example}
        </p>
      ) : null}
    </>
  );
}

export function TermTip({
  term,
  example,
  children,
  className,
  bare = false,
  side = "bottom",
  align = "start",
}: {
  /** Id, word, or any spelling the glossary knows. */
  term: string;
  /** The reader's own figures, already formatted by the caller. */
  example?: GlossaryExample;
  /** What is printed on the page. Defaults to the glossary's own word. */
  children?: React.ReactNode;
  className?: string;
  /**
   * No underline. For a trigger that is a glyph rather than a word, which
   * is what a sortable table header needs: the header itself already has
   * a job, so the question mark sits beside it.
   */
  bare?: boolean;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}) {
  const narrow = useNarrow();
  const entry = explainTerm(term, example ?? {});

  // A word with no entry is printed as it is. A label that opens an empty
  // panel is worse than one that opens nothing.
  if (!entry) return <>{children ?? term}</>;

  const label = `What ${entry.term} means`;
  const shown = children ?? entry.term;
  const triggerClass = cn(bare ? BARE_TRIGGER_CLASS : TRIGGER_CLASS, className);

  if (narrow) {
    return (
      <Sheet>
        <SheetTrigger
          type="button"
          aria-label={label}
          className={triggerClass}
          onClick={(e) => e.stopPropagation()}
        >
          {shown}
        </SheetTrigger>
        <SheetContent
          side="bottom"
          className="max-h-[70svh] gap-0 rounded-t-2xl p-0"
        >
          <SheetHeader className="gap-0 pb-0">
            <SheetTitle className="sr-only">{entry.term}</SheetTitle>
          </SheetHeader>
          <div className="scroll-host min-h-0 flex-1 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1">
            <TermBody {...entry} />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={label}
        className={triggerClass}
        onClick={(e) => e.stopPropagation()}
      >
        {shown}
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        className="w-[19rem] max-w-[min(19rem,calc(100vw-1.5rem))] gap-0 overflow-y-hidden p-0 font-normal normal-case tracking-normal"
      >
        <div className="scroll-host max-h-[min(26rem,var(--radix-popover-content-available-height,60svh))] p-4">
          <TermBody {...entry} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
