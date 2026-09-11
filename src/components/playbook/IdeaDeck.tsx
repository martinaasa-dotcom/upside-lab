"use client";

import { PlaybookQuote } from "@/components/playbook/PlaybookQuote";
import { Card, MicroLabel, NoteRows } from "@/components/ui/Panel";
import { cn } from "@/lib/format";
import { IDEA_THEMES, IDEAS, type Idea } from "@/lib/playbook";
import { Plus } from "lucide-react";
import { useState } from "react";

/*
  A CARD OPENS IN PLACE RATHER THAN TURNING OVER, AND THAT WAS ARGUED
  AGAINST THE PRETTIER OPTION RATHER THAN ASSUMED.

  The obvious treatment for a deck of ideas is a flip: the principle on the
  front, what it means on the back. It looks wonderful and it loses the
  thing the reader came for, because the point of every card here is the
  pair. The principle and the way it goes wrong are one lesson, and a flip
  is a promise that only one of them is on screen at a time, so a reader
  compares them by remembering rather than by looking. Opening in place
  keeps both halves in one column where the eye can hold them together.

  THE SUBJECTS ARE HEADINGS AND NOT A FILTER, WHICH WAS MEASURED.

  This started as a row of seven chips, All plus the six subjects, as a
  compact `Segmented`. Rendered with the app's own CSS at 360, 390 and 430
  it collided with itself four times over at every one of them: the row
  does not wrap, so seven labels in 360px of column simply painted through
  each other, which is the same arithmetic AGENTS.md already records
  against a segmented control whose cells are priced by the whole row.

  Grouping is better than fixing it. Fourteen cards is not a list anybody
  needs to narrow, a filter on that many is a control asking the reader to
  do work in exchange for nothing, and a reader who touches it has to be
  told what it hid. Headings give the six subjects to somebody scrolling,
  which is what they were for, and cost no width at all.
*/

function IdeaCard({ idea }: { idea: Idea }) {
  const [open, setOpen] = useState(false);
  return (
    <Card
      tone="default"
      className={cn("flex flex-col p-0 sm:p-0", open && "ring-1 ring-primary/20")}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 rounded-lg p-4 text-left transition hover:bg-hover sm:p-6"
      >
        <span className="min-w-0 flex-1 text-base font-medium leading-snug text-foreground">
          {idea.title}
        </span>
        <Plus
          aria-hidden
          className={cn(
            "mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-45"
          )}
        />
      </button>
      {open ? (
        <div className="flex flex-col gap-5 border-t border-border p-4 sm:p-6">
          <PlaybookQuote quote={idea.quote} />
          <NoteRows
            rows={[
              { label: "What it means", body: idea.meaning },
              { label: "In practice", body: idea.inPractice },
              { label: "Goes wrong", body: idea.goesWrong },
            ]}
          />
        </div>
      ) : null}
    </Card>
  );
}

export function IdeaDeck() {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm leading-relaxed text-muted-foreground">
        {IDEAS.length} ideas that keep turning up in the writing of people who
        did this well for a long time, grouped by what they are about. Every one
        of them carries the way it goes wrong, because each has an opposite that
        is also true and the whole skill is knowing which one the week in front
        of you is asking for. Open one to read it.
      </p>
      {IDEA_THEMES.map((theme) => {
        const shown = IDEAS.filter((i) => i.theme === theme.id);
        if (shown.length === 0) return null;
        return (
          <div key={theme.id} className="flex flex-col gap-3">
            <MicroLabel>{theme.label}</MicroLabel>
            {shown.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
