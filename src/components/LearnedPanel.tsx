"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { TermTip } from "@/components/ui/TermTip";
import { cn } from "@/lib/format";
import { glossaryEntry } from "@/lib/glossary";
import {
  buildLearnedRecord,
  learnedLead,
  recordIsEmpty,
  settledLine,
  type LearnedRecord,
} from "@/lib/learned";
import { loadDeck } from "@/lib/recall-deck-store";
import { loadWordsLookedUp } from "@/lib/words-looked-up";

/**
 * The words you looked up and the questions you answered, said back.
 *
 * It sits under the question card because it is the same subject: that
 * card asks one thing and then stops, and a reader who has answered
 * fifteen of them over two months had nowhere to see that any of it
 * happened.
 *
 * What it must never become is a score. `learned.ts` carries that argument
 * in full; the part that lands here is that there is no bar, no total, no
 * target and no praise. A denominator would be this app's opinion about
 * how much a person ought to know, and there is no such number.
 *
 * The words are the point of it rather than the count. Every one is
 * openable again, so this doubles as the reader's own short glossary: the
 * words *they* found worth asking about, which is a more useful list than
 * the thirty this app happens to define.
 *
 * Nothing here reaches the server. The deck, the words and the visit count
 * are all local to this browser, and all three are swept when a session is
 * purged, so a shared machine does not hand the next person somebody
 * else's reading.
 */
export function LearnedPanel({ className }: { className?: string }) {
  const userId = useAuth().user?.id ?? null;
  /*
    Read in an effect rather than an initialiser, because all three stores
    are `localStorage` and the server has none of them. Reading at first
    render would give the server an empty record and the client a full one,
    which is a hydration mismatch on a panel whose whole content is the
    difference between the two.
  */
  const [record, setRecord] = useState<LearnedRecord | null>(null);

  useEffect(() => {
    setRecord(
      buildLearnedRecord({
        words: loadWordsLookedUp(),
        deck: loadDeck(userId),
      })
    );
  }, [userId]);

  // Nothing done yet draws nothing. An empty version of this panel would be
  // a room telling a reader on their first day what they have not done.
  if (!record || recordIsEmpty(record)) return null;

  const settled = settledLine(record);

  return (
    <Panel className={cn(className)}>
      <PanelHeader
        title="What you have looked up"
        subtitle="Only what you actually opened or answered on this device. Nothing here is a score, and there is nothing to keep up."
      />

      <div className="flex flex-col gap-5">
        <p className="text-sm text-foreground">{learnedLead(record)}</p>

        {record.words.length > 0 ? (
          <div className="flex flex-col gap-2">
            {/*
              Openable again, which is the point: this is the reader's own
              glossary, the words they found worth asking about. Ordered
              most recently read first, so the one they are still chewing
              on is the one in front of them.
            */}
            <ul className="flex flex-wrap gap-x-2 gap-y-1.5">
              {record.words.map((word) => {
                const entry = glossaryEntry(word.id);
                if (!entry) return null;
                return (
                  <li key={word.id}>
                    <TermTip term={word.id}>{entry.term}</TermTip>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {settled ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {settled}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
