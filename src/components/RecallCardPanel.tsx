"use client";

/**
 * One question a day about the reader's own portfolio.
 *
 * Reading a number teaches nobody anything; being asked for it does, and
 * the asking has to come back days later or it is a quiz rather than
 * learning. `src/lib/recall-deck.ts` builds the questions and owns the
 * schedule; this draws the one that is due and records the answer.
 *
 * Three rules the card keeps to. It shows **one** question, never a set,
 * because the point is a minute a day. Getting it wrong costs nothing:
 * there is no score, no streak and no leaderboard, and a wrong answer only
 * brings the card back sooner. And the real figure appears the moment they
 * answer, right or wrong, because the answer is the lesson and hiding it
 * behind a second tap is the quiz-app instinct this is not.
 *
 * The state is per reader in `localStorage`. It is a schedule rather than
 * anything anybody would miss, so a new device simply starts the deck
 * again; it should later ride along in `portfell_lab_state` with the
 * conviction notes and the watchlist, which is where per-owner state
 * belongs.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { filledCardColumns } from "@/lib/filled-grid";
import { cn } from "@/lib/format";
import {
  answerCard,
  buildRecallCards,
  dueCards,
  type DeckInput,
  type DeckState,
  type RecallCard,
} from "@/lib/recall-deck";
import { todayKeyInTz } from "@/lib/timezone";

const KEY_PREFIX = "upside-recall-deck-v1";

function storageKey(userId: string | null | undefined): string {
  return userId ? `${KEY_PREFIX}:${userId}` : KEY_PREFIX;
}

function loadDeck(userId: string | null | undefined): DeckState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as DeckState) : {};
  } catch {
    return {};
  }
}

function saveDeck(userId: string | null | undefined, state: DeckState): void {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    // A reader with storage switched off simply gets the question again.
  }
}

export function RecallCardPanel({
  input,
  className,
}: {
  input: DeckInput;
  className?: string;
}) {
  // Keyed per account, so two people sharing one browser do not mark each
  // other's cards. A reader with no session gets the unkeyed deck.
  const userId = useAuth().user?.id ?? null;
  const [deck, setDeck] = useState<DeckState | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    setDeck(loadDeck(userId));
  }, [userId]);

  const cards = useMemo(() => buildRecallCards(input), [input]);
  const today = todayKeyInTz();
  const card: RecallCard | null = useMemo(() => {
    if (!deck) return null;
    return dueCards(cards, deck, today, 1)[0] ?? null;
  }, [cards, deck, today]);

  const answer = useCallback(
    (index: number) => {
      if (picked != null || !card || !deck) return;
      setPicked(index);
      const next = answerCard(deck, card.id, index === card.answerIndex, today);
      saveDeck(userId, next);
      // The deck is not advanced here on purpose: replacing the card the
      // moment it is answered would take the explanation off the screen
      // before it had been read. It comes back on the next visit.
    },
    [card, deck, picked, today, userId]
  );

  if (!card) return null;
  const answered = picked != null;
  const right = answered && picked === card.answerIndex;

  return (
    <Panel className={cn("overview-fade", className)}>
      <PanelHeader
        title="One question"
        subtitle="About what you already own. Nothing is scored."
      />
      <p className="text-base font-medium leading-relaxed text-foreground">
        {card.question}
      </p>
      {/*
        * One column on a phone, and on a laptop a count that divides the
        * options, so the last row is never one button beside a gap.
        */}
      <div
        className="grid gap-2 sm:grid-cols-[repeat(var(--opt-cols),minmax(0,1fr))]"
        style={
          {
            "--opt-cols": String(filledCardColumns(card.options.length, 3)),
          } as CSSProperties
        }
      >
        {card.options.map((option, i) => {
          const isAnswer = i === card.answerIndex;
          const chosen = picked === i;
          return (
            <Button
              key={option}
              type="button"
              variant="outline"
              disabled={answered}
              onClick={() => answer(i)}
              className={cn(
                "h-auto min-h-11 justify-start whitespace-normal py-2 text-left disabled:opacity-100",
                answered && isAnswer && "ring-1 ring-gain/40 text-gain",
                answered && chosen && !isAnswer && "ring-1 ring-loss/40"
              )}
            >
              {option}
            </Button>
          );
        })}
      </div>
      {answered ? (
        <div className="flex flex-col gap-1">
          <p
            className={cn(
              "text-sm font-medium",
              right ? "text-gain" : "text-muted-foreground"
            )}
          >
            {right ? "That is it." : "Not quite, and that is fine."}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {card.because}
          </p>
        </div>
      ) : null}
    </Panel>
  );
}
