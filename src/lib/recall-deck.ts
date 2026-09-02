/**
 * One question a day, about the reader's own portfolio, that comes back.
 *
 * Reading a number teaches nobody anything; being asked for it does. The
 * effect is old and well measured: a person who is asked to retrieve a fact
 * remembers it far better than a person who reads the same fact again, and
 * spacing the asking out matters more than how long they spent the first
 * time. So this is a small deck of questions built entirely from what the
 * reader actually holds, answered in one tap, with the real figure shown
 * the moment they answer.
 *
 * Three rules keep it from becoming a quiz app bolted to a portfolio.
 *
 * Every question has a checkable answer in the reader's own data. Nothing
 * asks an opinion, nothing asks a prediction, and nothing has a "right"
 * answer about what to do with money, which would be advice wearing a
 * multiple choice hat.
 *
 * Getting one wrong costs nothing. There is no score, no streak of correct
 * answers and no leaderboard. A wrong answer sends the card back to the
 * front of the queue, which is the only consequence, because the point is
 * the second asking rather than the first.
 *
 * A card retires. Once a question has been answered right at the far end of
 * the schedule it stops coming back, so somebody who knows their portfolio
 * is not asked about it forever.
 */

import { daySize, type TypicalMove } from "@/lib/typical-move";

/** Days from a correct answer to the next asking, one entry per box. */
const INTERVALS = [1, 3, 7, 21, 60] as const;

/** Answered right at the last box: the reader knows it, so it rests. */
export const LAST_BOX = INTERVALS.length;

export type CardState = {
  /** 1 to LAST_BOX. Higher is further apart. */
  box: number;
  /** Day key (YYYY-MM-DD) this card is next worth asking. */
  due: string;
  /** Day key it was last answered, for the record rather than the schedule. */
  seen?: string;
};

export type DeckState = Record<string, CardState>;

export type RecallCard = {
  /**
   * Stable across days for the same question about the same subject, so a
   * card can come back. Includes the subject but never a figure, or every
   * price move would mint a new card and nothing would ever repeat.
   */
  id: string;
  /** What the question is about, for the record and for grouping. */
  concept: string;
  question: string;
  options: string[];
  answerIndex: number;
  /** Said the moment they answer, right or wrong, with the real figure. */
  because: string;
};

function addDays(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const next = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
  return next.toISOString().slice(0, 10);
}

/** A card nobody has answered yet is due the first time it is offered. */
export function isDue(state: DeckState, id: string, today: string): boolean {
  const card = state[id];
  if (!card) return true;
  if (card.box >= LAST_BOX && card.seen) return false;
  return card.due <= today;
}

/**
 * Record an answer and say when the card comes back.
 *
 * Right moves it one box out; wrong sends it to the first box, due
 * tomorrow rather than today, because asking the same question twice in one
 * sitting tests short-term memory and nothing else.
 */
export function answerCard(
  state: DeckState,
  id: string,
  correct: boolean,
  today: string
): DeckState {
  const current = state[id];
  const box = correct ? Math.min((current?.box ?? 0) + 1, LAST_BOX) : 1;
  const interval = INTERVALS[box - 1] ?? INTERVALS[0];
  return { ...state, [id]: { box, due: addDays(today, interval), seen: today } };
}

/**
 * The cards worth asking today, in the order to ask them.
 *
 * A card that has been answered before comes ahead of one that has not,
 * because the whole value is in the second asking; among those, the one
 * waiting longest goes first. Capped, because the point is one question a
 * day rather than a test.
 */
export function dueCards(
  cards: RecallCard[],
  state: DeckState,
  today: string,
  limit = 1
): RecallCard[] {
  const due = cards.filter((c) => isDue(state, c.id, today));
  due.sort((a, b) => {
    const sa = state[a.id];
    const sb = state[b.id];
    if (Boolean(sa) !== Boolean(sb)) return sa ? -1 : 1;
    if (sa && sb) return sa.due < sb.due ? -1 : sa.due > sb.due ? 1 : 0;
    return 0;
  });
  return due.slice(0, Math.max(0, limit));
}

/** How much of the deck the reader has answered right at the far end. */
export function deckProgress(
  cards: RecallCard[],
  state: DeckState
): { known: number; total: number } {
  const known = cards.filter((c) => (state[c.id]?.box ?? 0) >= LAST_BOX).length;
  return { known, total: cards.length };
}

/* ------------------------------------------------------------------ cards */

export type DeckHolding = {
  ticker: string;
  /** What the reader calls it, when the app knows: "Apple", else the ticker. */
  label?: string;
  shares: number;
  buyPrice: number;
  price: number;
  value: number;
  todayPct: number | null;
};

export type DeckInput = {
  holdings: DeckHolding[];
  totalValue: number;
  cash: number;
  todayPct: number | null;
  typical?: TypicalMove | null;
  /** Formatters, so this module states no opinion about money. */
  money: (n: number) => string;
  percent: (n: number) => string;
};

function shuffleTo(options: string[], answer: string, seed: number): {
  options: string[];
  answerIndex: number;
} {
  // A deterministic order from the card's own subject, so the right answer
  // does not sit in the same slot every day and the card still looks the
  // same on two devices on the same day.
  const at = seed % options.length;
  const rest = options.filter((o) => o !== answer);
  const out = [...rest];
  out.splice(at, 0, answer);
  return { options: out, answerIndex: at };
}

function seedOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function biggest(holdings: DeckHolding[]): DeckHolding | null {
  return (
    [...holdings].sort((a, b) => b.value - a.value).find((h) => h.value > 0) ??
    null
  );
}

/**
 * Every card this reader's portfolio can currently support.
 *
 * A generator that cannot ask an honest question returns nothing, so a
 * portfolio of one holding simply has a smaller deck rather than a deck of
 * questions with no answer.
 */
export function buildRecallCards(input: DeckInput): RecallCard[] {
  const { holdings, totalValue, money, percent } = input;
  const cards: RecallCard[] = [];
  const named = (h: DeckHolding) => h.label ?? h.ticker;

  const top = biggest(holdings);
  if (top && totalValue > 0 && holdings.length >= 2) {
    const share = top.value / totalValue;
    const bands = ["under a tenth", "about a quarter", "about a half", "most of it"];
    const band =
      share < 0.15
        ? bands[0]!
        : share < 0.35
          ? bands[1]!
          : share < 0.6
            ? bands[2]!
            : bands[3]!;
    const { options, answerIndex } = shuffleTo(
      bands,
      band,
      seedOf(`share:${top.ticker}`)
    );
    cards.push({
      id: `share:${top.ticker}`,
      concept: "share-of-portfolio",
      question: `How much of everything you own is ${named(top)}?`,
      options,
      answerIndex,
      because: `${named(top)} is ${percent(share)} of your portfolio, ${money(top.value)} of ${money(totalValue)}.`,
    });
  }

  if (top && totalValue > 0) {
    // What a bad day for the largest holding alone does to the total. The
    // arithmetic is the lesson: a fifth off the biggest name is not a fifth
    // off the portfolio, and most people guess that it is.
    const share = top.value / totalValue;
    const hit = share * 0.2;
    const rounded = Math.round(hit * 100);
    const wrong = [Math.max(1, Math.round(rounded / 3)), 20, Math.min(95, rounded * 2 + 3)];
    const answer = `about ${rounded}%`;
    const { options, answerIndex } = shuffleTo(
      [answer, ...wrong.map((w) => `about ${w}%`)].filter(
        (v, i, a) => a.indexOf(v) === i
      ),
      answer,
      seedOf(`shock:${top.ticker}`)
    );
    if (options.length >= 3) {
      cards.push({
        id: `shock:${top.ticker}`,
        concept: "concentration",
        question: `If ${named(top)} fell 20% tomorrow and nothing else moved, your whole portfolio would fall by about how much?`,
        options,
        answerIndex,
        because: `${named(top)} is ${percent(share)} of what you own, so a fifth off it is about ${percent(hit)} off your total, which is ${money(hit * totalValue)}.`,
      });
    }
  }

  for (const h of holdings.slice(0, 3)) {
    if (!(h.buyPrice > 0) || !(h.price > 0)) continue;
    const above = h.price >= h.buyPrice;
    const answer = above ? "above what you paid" : "below what you paid";
    const { options, answerIndex } = shuffleTo(
      ["above what you paid", "below what you paid", "exactly what you paid"],
      answer,
      seedOf(`paid:${h.ticker}`)
    );
    cards.push({
      id: `paid:${h.ticker}`,
      concept: "paid-each",
      question: `${named(h)} is ${money(h.price)} today. Is that above or below what you paid?`,
      options,
      answerIndex,
      because: `You paid ${money(h.buyPrice)} a share on average, so today is ${above ? "above" : "below"} it by ${money(Math.abs(h.price - h.buyPrice))} a share.`,
    });
  }

  if (holdings.length >= 3) {
    const down = holdings.filter((h) => (h.todayPct ?? 0) < 0).length;
    const answer = String(down);
    const nearby = [down - 1, down + 1, down + 2].filter(
      (n) => n >= 0 && n <= holdings.length && n !== down
    );
    const { options, answerIndex } = shuffleTo(
      [answer, ...nearby.slice(0, 2).map(String)],
      answer,
      seedOf("down-today")
    );
    if (options.length >= 3) {
      cards.push({
        id: "down-today",
        concept: "today",
        question: `How many of your ${holdings.length} holdings are down today?`,
        options,
        answerIndex,
        because: `${down} of ${holdings.length}. When nearly all of them move the same way, it is usually the whole market rather than any one company.`,
      });
    }
  }

  if (input.typical && input.todayPct != null && totalValue > 0) {
    const size = daySize(input.todayPct, input.typical);
    const answer =
      size === "ordinary"
        ? "an ordinary day"
        : size === "bigger"
          ? "bigger than usual"
          : "much bigger than usual";
    const { options, answerIndex } = shuffleTo(
      ["an ordinary day", "bigger than usual", "much bigger than usual"],
      answer,
      seedOf("today-size")
    );
    cards.push({
      id: "today-size",
      concept: "typical-move",
      question: "Your portfolio moved today. Was that an ordinary day for it?",
      options,
      answerIndex,
      because: `Your portfolio usually moves about ${percent(input.typical.typicalPct)}, which is ${money(input.typical.typicalPct * totalValue)}. Today it moved ${percent(Math.abs(input.todayPct))}.`,
    });
  }

  return cards;
}
