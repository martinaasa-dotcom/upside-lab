"use client";

import { Explain } from "@/components/ui/Explain";
import { MicroLabel } from "@/components/ui/Panel";
import { glossaryEntry } from "@/lib/glossary";

/**
 * The words on a card, each one the app's own definition rather than this
 * room's.
 *
 * This is the one room in the product whose whole job is teaching, and it
 * was the one room not wired to the surface the product already uses for
 * teaching a word. `glossary.ts` holds every definition and `Explain`
 * opens one, so a reader meeting "how spread out you are" here gets the
 * same two sentences they would get on the holdings table, with their own
 * figures in it, and improving that answer improves it everywhere at once.
 * A definition typed into this room would have been a second answer to a
 * question already answered.
 *
 * No separator between the words. A dot between them strands itself at the
 * end of a wrapped line, which this repo already records against the
 * valuation method's metadata row; a wrapping flex row with its own gaps
 * has nothing to strand.
 *
 * Absent rather than empty when a card is about no particular word, and
 * absent for a key the glossary does not know, because `Explain` renders
 * the bare word in that case and a row of plain words under a label
 * promising definitions is worse than no row.
 */
export function PlaybookTerms({ terms }: { terms?: readonly string[] }) {
  const known = (terms ?? []).filter((t) => glossaryEntry(t));
  if (known.length === 0) return null;
  return (
    <div className="border-t border-border pt-4">
      {/* Singular when there is one, for the reason "Members · 1" is
        * recorded in AGENTS.md: a plural over a single thing is the label
        * disagreeing with what is under it. */}
      <MicroLabel>
        {known.length === 1 ? "Word on this one" : "Words on this one"}
      </MicroLabel>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {known.map((term) => (
          <Explain key={term} term={term}>
            {glossaryEntry(term)?.term}
          </Explain>
        ))}
      </p>
    </div>
  );
}
