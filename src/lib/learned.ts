import { LAST_BOX, type DeckState } from "@/lib/recall-deck";
import type { WordsLookedUp } from "@/lib/words-looked-up";

/**
 * What this reader has actually done, said back to them.
 *
 * Nothing in this app tells somebody they are getting better at reading
 * their own money, and the reason nothing did is a good one: the obvious
 * version of it is a badge, and a badge is a claim. "You are becoming a
 * confident investor" is unfalsifiable, flattering and unearned, which is
 * the exact shape the whole product is built to keep off the screen.
 *
 * So this is a record and never a score, which is the line `visit-streak.ts`
 * already drew and this stays behind. Three rules follow from it and each
 * one is load-bearing:
 *
 * Every figure is a thing that happened. A word counts when the reader
 * opened its definition, a question when they answered it. Nothing here is
 * inferred from a room being visited or a panel being on screen, so no
 * line can ever claim something that did not happen.
 *
 * Nothing is a target and nothing is out of a total. A progress bar needs
 * a denominator, and the denominator would be this app's opinion about how
 * much somebody ought to know. There is no such number, so there is no bar.
 *
 * And no sentence praises. Not "well done", not "you are getting the hang
 * of this", not a streak to protect. The reader is shown what they did and
 * left to think whatever they like about it, which is the same respect
 * every figure in this product is handed over with.
 */

export type LearnedRecord = {
  /** Distinct words opened, most recently read first. */
  words: { id: string; times: number; last: string }[];
  /** Questions answered at least once. */
  answered: number;
  /**
   * Questions answered right at the widest spacing the deck uses, which is
   * the only evidence here that something stuck rather than was guessed:
   * the card came back after two months and was still known.
   */
  settled: number;
};

export function buildLearnedRecord(input: {
  words: WordsLookedUp;
  deck: DeckState;
}): LearnedRecord {
  const words = Object.values(input.words)
    .map((w) => ({ id: w.id, times: w.times, last: w.last }))
    .sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0));

  const cards = Object.values(input.deck);
  return {
    words,
    answered: cards.length,
    settled: cards.filter((c) => (c.box ?? 0) >= LAST_BOX).length,
  };
}

/**
 * Nothing done yet. The panel does not draw at all for this.
 *
 * Words and questions only. How many days somebody has opened the app was
 * in here for one draft and is not: nothing on this panel shows it, and a
 * field carried but never rendered is the hazard this repo already names
 * -- the next reader of the file reasonably assumes some surface uses it.
 * Worse, counting it made the panel appear for somebody who had visited
 * twenty times and never opened a word, under the heading "What you have
 * looked up" and the sentence "Nothing here yet", which is a room telling
 * a reader what they have not done. The visit count has its home on
 * Account, where it is about attention rather than about learning.
 */
export function recordIsEmpty(record: LearnedRecord): boolean {
  return record.words.length === 0 && record.answered === 0;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The one sentence over the record.
 *
 * It states the two figures and stops. Earlier drafts of this line said
 * things like "you are building a real habit" and "most people never learn
 * this much", and both are the unfalsifiable flattery the rule above bans:
 * being wrong about them is invisible, and they are about the reader
 * rather than about anything that happened.
 */
export function learnedLead(record: LearnedRecord): string {
  const parts: string[] = [];
  if (record.words.length > 0) {
    parts.push(plural(record.words.length, "word", "words"));
  }
  if (record.answered > 0) {
    parts.push(plural(record.answered, "question", "questions"));
  }
  if (parts.length === 0) return "Nothing here yet.";
  const list =
    parts.length === 1 ? parts[0]! : `${parts[0]!} and ${parts[1]!}`;
  return `You have looked up ${list}.`;
}

/**
 * The line about the questions that came back, or null.
 *
 * Null below one, because "0 have come back" is a sentence about nothing,
 * and the deck's widest gap is two months, so a reader in their first week
 * cannot have any and should not be shown a zero that reads as a failure.
 */
export function settledLine(record: LearnedRecord): string | null {
  if (record.settled < 1) return null;
  return `${plural(record.settled, "question", "questions")} came back weeks later and you still knew the answer.`;
}
