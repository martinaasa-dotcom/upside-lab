"use client";

import { BookOpen } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/format";
import {
  explainTerm,
  type GlossaryExample,
} from "@/lib/glossary";

/**
 * Teach me this word.
 *
 * `InfoTip` beside it takes free text, which means every explanation in the
 * app is typed at the call site it appears on. That is fine for a sentence
 * about one chart and wrong for a word: "what you paid" is explained on the
 * holdings table, in the drawer, in the forecast and in the letter, and four
 * hand-typed answers to one question drift into four different answers. This
 * one reads `src/lib/glossary.ts`, so the answer to a word is the same answer
 * wherever the reader happens to ask it, and improving it improves it
 * everywhere at once.
 *
 * Deliberately a popover at every width, where `WhyThis` needs a bottom sheet
 * below `md`. That is not an inconsistency, it is the length: a provenance
 * answer runs to about four screens on a phone and a definition is two
 * sentences and two short lines, which fits a popover on the narrowest
 * device this app supports with room to spare. A bottom sheet for four lines
 * would cover the figure the reader is asking about, which is the one thing
 * an explanation must not do.
 *
 * Two shapes. With no children it is the same small circle `InfoTip` draws,
 * for a label that has no room for anything else. With children the label
 * itself becomes the trigger, underlined the way a word you can look up has
 * been underlined since paper, which is the better one wherever there is
 * room: it says which word is the one being defined.
 */

const TRIGGER_CLASS =
  "relative inline-flex size-4 shrink-0 items-center justify-center align-text-bottom text-muted-foreground outline-none transition hover:text-foreground focus-visible:text-foreground";

const WORD_CLASS =
  "cursor-help decoration-dotted underline underline-offset-4 decoration-muted-foreground/60 outline-none transition hover:decoration-foreground focus-visible:decoration-foreground";

export function Explain({
  term,
  children,
  className,
  ...figures
}: {
  /** A glossary id, the word itself, or any spelling it answers to. */
  term: string;
  /** The label to underline. Omit for the small circle. */
  children?: React.ReactNode;
  className?: string;
} & GlossaryExample) {
  const entry = explainTerm(term, figures);
  /*
   * A term with no entry renders the label and nothing else, rather than an
   * affordance that opens an empty panel. A missing entry is a gap in the
   * glossary, and the reader is not the right person to find out about it.
   */
  if (!entry) return <>{children ?? null}</>;

  const label = `What does ${entry.term.toLowerCase()} mean?`;

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        data-slot="explain"
        aria-label={label}
        className={cn(children ? WORD_CLASS : TRIGGER_CLASS, className)}
        onClick={(e) => e.stopPropagation()}
      >
        {children ?? (
          <>
            {/* Coarse pointers get a real target without the glyph growing. */}
            <span className="absolute -inset-3.5 lg:-inset-2.5" aria-hidden />
            <BookOpen className="relative size-3.5" aria-hidden />
          </>
        )}
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="center"
        className="w-[19rem] max-w-[min(19rem,calc(100vw-1.5rem))] gap-0 p-4 font-normal normal-case tracking-normal"
      >
        <p className="text-sm font-semibold text-foreground">{entry.term}</p>
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          {entry.meaning}
        </p>
        {/*
          The reader's own figures, and the reason this is worth a component
          rather than a static dictionary: "what you paid" means nothing
          until it means "$168.40 a share on Apple". Null whenever the caller
          had nothing to put in, because a worked example with an invented
          number in it would be worse than none.
        */}
        {entry.example ? (
          <p className="mt-3 text-sm leading-relaxed text-primary">
            {entry.example}
          </p>
        ) : null}
        {entry.outsideWord ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {entry.outsideWord}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
