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

/**
 * The one card to show this visit.
 *
 * A card that has come round before still goes first, since that is the
 * asking that teaches. Among the cards nobody has answered yet, the deck
 * used to hand over the first one it generated, which was the same
 * question about the same holding every day until somebody answered it.
 * Now the visit's own roll picks a *kind* of question first and a card
 * within it second, so two visits in a row ask about different things
 * rather than the same holding's share, then its share again.
 *
 * `roll` is any non-negative integer; the panel draws a fresh one each
 * time it mounts, so a refresh is a new question, which is deliberate: a
 * card is worth more for being answered than for being the day's card.
 */
export function pickCard(
  cards: RecallCard[],
  state: DeckState,
  today: string,
  roll: number,
  except: ReadonlySet<string> = new Set()
): RecallCard | null {
  const due = cards.filter(
    (c) => !except.has(c.id) && isDue(state, c.id, today)
  );
  if (!due.length) return null;
  const seen = due
    .filter((c) => state[c.id])
    .sort((a, b) => (state[a.id]!.due < state[b.id]!.due ? -1 : 1));
  if (seen.length) return seen[0]!;
  const byConcept = new Map<string, RecallCard[]>();
  for (const c of due) byConcept.set(c.concept, [...(byConcept.get(c.concept) ?? []), c]);
  const concepts = [...byConcept.keys()];
  const r = Math.abs(Math.floor(roll)) || 0;
  const group = byConcept.get(concepts[r % concepts.length]!)!;
  return group[Math.floor(r / concepts.length) % group.length]!;
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

function byValue(holdings: DeckHolding[]): DeckHolding[] {
  return [...holdings]
    .filter((h) => h.value > 0)
    .sort((a, b) => b.value - a.value);
}

/** "under a tenth" and friends, for a share of the whole. */
const BANDS = ["under a tenth", "about a quarter", "about a half", "most of it"] as const;

function bandOf(share: number): string {
  return share < 0.15
    ? BANDS[0]
    : share < 0.35
      ? BANDS[1]
      : share < 0.6
        ? BANDS[2]
        : BANDS[3];
}

/** Since what was paid, as a fraction: 0.25 is up a quarter. */
function sinceBought(h: DeckHolding): number | null {
  if (!(h.buyPrice > 0) || !(h.price > 0)) return null;
  return h.price / h.buyPrice - 1;
}

function pctWord(n: number): string {
  return `about ${Math.round(n * 100)}%`;
}

function uniq(options: string[]): string[] {
  return options.filter((v, i, a) => a.indexOf(v) === i);
}

/**
 * Every card this reader's portfolio can currently support.
 *
 * A generator that cannot ask an honest question returns nothing, so a
 * portfolio of one holding simply has a smaller deck rather than a deck of
 * questions with no answer. Each kind of question runs over every holding
 * it can, not only the biggest one, because a deck of five cards about the
 * same company is one card asked five ways.
 */
export function buildRecallCards(input: DeckInput): RecallCard[] {
  const { holdings, totalValue, money, percent } = input;
  const cards: RecallCard[] = [];
  const named = (h: DeckHolding) => h.label ?? h.ticker;
  const ranked = byValue(holdings);
  const top = ranked[0] ?? null;

  // A card is only worth asking when its options are really different
  // answers, so every generator dedupes its options and stands down under
  // three.
  const push = (
    id: string,
    concept: string,
    question: string,
    options: string[],
    answer: string,
    because: string
  ) => {
    const distinct = uniq(options);
    if (distinct.length < 3 || !distinct.includes(answer)) return;
    const shuffled = shuffleTo(distinct, answer, seedOf(id));
    cards.push({ id, concept, question, because, ...shuffled });
  };

  /* -------------------------------------------- how much of it is this */

  if (totalValue > 0 && holdings.length >= 2) {
    for (const h of ranked) {
      const share = h.value / totalValue;
      push(
        `share:${h.ticker}`,
        "share-of-portfolio",
        `How much of everything you own is ${named(h)}?`,
        [...BANDS],
        bandOf(share),
        `${named(h)} is ${percent(share)} of your portfolio, ${money(h.value)} of ${money(totalValue)}.`
      );
    }
  }

  if (top && totalValue > 0 && ranked.length >= 3) {
    const second = ranked[1]!;
    const share = (top.value + second.value) / totalValue;
    push(
      "top-two",
      "concentration",
      `Your two biggest holdings, ${named(top)} and ${named(second)}, add up to how much of everything you own?`,
      [...BANDS],
      bandOf(share),
      `Together they are ${percent(share)} of your portfolio. The other ${ranked.length - 2} ${ranked.length - 2 === 1 ? "holding shares" : "holdings share"} the remaining ${percent(Math.max(0, 1 - share))}.`
    );
  }

  if (totalValue > 0 && Math.abs(input.cash) > 0 && holdings.length >= 1) {
    const share = Math.abs(input.cash) / totalValue;
    const borrowed = input.cash < 0;
    push(
      "cash-share",
      "cash",
      borrowed
        ? "Part of your portfolio is borrowed money. About how much of the whole is it?"
        : "How much of everything you own is sitting in cash?",
      [...BANDS],
      bandOf(share),
      borrowed
        ? `You are borrowing ${money(Math.abs(input.cash))} against a portfolio worth ${money(totalValue)}, which is ${percent(share)} of it.`
        : `${money(input.cash)} of your ${money(totalValue)} is cash, which is ${percent(share)}. Cash does not move when the market does, so it is the part of the total that stays put on a bad day.`
    );
  }

  /* ------------------------------------------------ which one is it */

  if (ranked.length >= 3) {
    const names = ranked.slice(0, 4).map(named);
    push(
      "which-biggest",
      "which-one",
      "Which of these is the biggest slice of everything you own?",
      names,
      named(top!),
      `${named(top!)}, at ${money(top!.value)}. ${names.length > 2 ? `Next is ${named(ranked[1]!)} at ${money(ranked[1]!.value)}.` : ""}`
    );
    const small = ranked[ranked.length - 1]!;
    push(
      "which-smallest",
      "which-one",
      "Which of these is the smallest slice of everything you own?",
      uniq([...ranked.slice(-3).map(named), named(top!)]),
      named(small),
      `${named(small)}, at ${money(small.value)}, which is ${percent(small.value / totalValue)} of the total. Even if it doubled or halved, the whole portfolio would barely notice.`
    );
  }

  const moved = holdings.filter((h) => h.todayPct != null);
  if (moved.length >= 3) {
    const bySize = [...moved].sort(
      (a, b) => Math.abs(b.todayPct!) - Math.abs(a.todayPct!)
    );
    const first = bySize[0]!;
    const next = bySize[1]!;
    if (Math.abs(first.todayPct!) - Math.abs(next.todayPct!) >= 0.003) {
      push(
        "which-moved-today",
        "today",
        "Which of your holdings moved the most today, up or down?",
        bySize.slice(0, 4).map(named),
        named(first),
        `${named(first)} moved ${percent(Math.abs(first.todayPct!))}, ${first.todayPct! < 0 ? "down" : "up"}. ${named(next)} was next at ${percent(Math.abs(next.todayPct!))}. A big move in a small holding can still be a small move in your total.`
      );
    }
    const up = moved.filter((h) => h.todayPct! > 0).reduce((s, h) => s + h.value, 0);
    const down = moved.filter((h) => h.todayPct! < 0).reduce((s, h) => s + h.value, 0);
    const pool = up + down;
    if (pool > 0) {
      const answer =
        Math.abs(up - down) / pool < 0.1
          ? "about an even split"
          : up > down
            ? "more of it went up"
            : "more of it went down";
      push(
        "money-direction",
        "today",
        "Counting in dollars rather than in names, did more of your money go up or down today?",
        ["more of it went up", "more of it went down", "about an even split"],
        answer,
        `${money(up)} of your holdings rose today and ${money(down)} fell. A count of names can say one thing and the money another, because one big holding outweighs three small ones.`
      );
    }
  }

  const withRoi = holdings
    .map((h) => ({ h, roi: sinceBought(h) }))
    .filter((x): x is { h: DeckHolding; roi: number } => x.roi != null)
    .sort((a, b) => b.roi - a.roi);
  if (withRoi.length >= 3) {
    const best = withRoi[0]!;
    const runnerUp = withRoi[1]!;
    if (best.roi - runnerUp.roi >= 0.03) {
      push(
        "which-best-since-bought",
        "since-bought",
        "Since you bought them, which of these has risen the most?",
        withRoi.slice(0, 4).map((x) => named(x.h)),
        named(best.h),
        `${named(best.h)}, up ${percent(best.roi)} on what you paid for it. ${named(runnerUp.h)} is next at ${best.roi >= 0 && runnerUp.roi < 0 ? `down ${percent(Math.abs(runnerUp.roi))}` : `${runnerUp.roi < 0 ? "down" : "up"} ${percent(Math.abs(runnerUp.roi))}`}.`
      );
    }
    const worst = withRoi[withRoi.length - 1]!;
    const nextWorst = withRoi[withRoi.length - 2]!;
    if (nextWorst.roi - worst.roi >= 0.03) {
      push(
        "which-worst-since-bought",
        "since-bought",
        "Since you bought them, which of these has done the worst?",
        withRoi.slice(-4).map((x) => named(x.h)),
        named(worst.h),
        `${named(worst.h)}, ${worst.roi < 0 ? "down" : "up only"} ${percent(Math.abs(worst.roi))} on what you paid. That is the price against your own cost, which is a different question from how it did today.`
      );
    }
  }

  /* --------------------------------------- the arithmetic of one name */

  if (top && totalValue > 0) {
    // What a bad day for the largest holding alone does to the total. The
    // arithmetic is the lesson: a fifth off the biggest name is not a fifth
    // off the portfolio, and most people guess that it is.
    const share = top.value / totalValue;
    const hit = share * 0.2;
    const rounded = Math.round(hit * 100);
    const wrong = [Math.max(1, Math.round(rounded / 3)), 20, Math.min(95, rounded * 2 + 3)];
    const answer = `about ${rounded}%`;
    push(
      `shock:${top.ticker}`,
      "concentration",
      `If ${named(top)} fell 20% tomorrow and nothing else moved, your whole portfolio would fall by about how much?`,
      [answer, ...wrong.map((w) => `about ${w}%`)],
      answer,
      `${named(top)} is ${percent(share)} of what you own, so a fifth off it is about ${percent(hit)} off your total, which is ${money(hit * totalValue)}.`
    );
  }

  if (totalValue > 0 && holdings.length >= 2) {
    for (const h of ranked) {
      const share = h.value / totalValue;
      if (share < 0.02) continue;
      const answer = pctWord(share);
      push(
        `double:${h.ticker}`,
        "what-if",
        `If ${named(h)} doubled overnight and nothing else moved, how much bigger would everything you own be?`,
        [answer, pctWord(share / 2), "about 100%", pctWord(Math.min(0.95, share * 2))],
        answer,
        `A holding that doubles adds its own size to the total once more. ${named(h)} is ${percent(share)} of what you own, so the whole would grow by ${percent(share)}, which is ${money(h.value)}.`
      );
    }
  }

  for (const h of holdings) {
    const roi = sinceBought(h);
    if (roi == null) continue;
    const above = h.price >= h.buyPrice;
    push(
      `paid:${h.ticker}`,
      "paid-each",
      `${named(h)} is ${money(h.price)} today. Is that above or below what you paid?`,
      ["above what you paid", "below what you paid", "exactly what you paid"],
      above ? "above what you paid" : "below what you paid",
      `You paid ${money(h.buyPrice)} a share on average, so today is ${above ? "above" : "below"} it by ${money(Math.abs(h.price - h.buyPrice))} a share.`
    );

    // The asymmetry most people never notice: a fall of a third needs a
    // rise of a half to undo, because the rise starts from a smaller
    // number. The wrong answer offered is the one nearly everybody gives.
    if (roi <= -0.05) {
      const fall = -roi;
      const rise = h.buyPrice / h.price - 1;
      const answer = pctWord(rise);
      push(
        `back-even:${h.ticker}`,
        "asymmetry",
        `${named(h)} is ${percent(fall)} below what you paid. To get back to your price, it would need to rise by about how much?`,
        [answer, pctWord(fall), pctWord(rise * 2), pctWord(fall / 2)],
        answer,
        `More than it fell. It is at ${money(h.price)} and you paid ${money(h.buyPrice)}, and the climb is measured from the lower number, so a ${percent(fall)} fall takes a ${percent(rise)} rise to undo.`
      );
    } else if (roi >= 0.05) {
      const room = 1 - h.buyPrice / h.price;
      const answer = pctWord(room);
      push(
        `room:${h.ticker}`,
        "asymmetry",
        `${named(h)} is ${percent(roi)} above what you paid. It could fall by about how much before it was back at your price?`,
        [answer, pctWord(roi), pctWord(room / 2), pctWord(Math.min(0.95, roi * 2))],
        answer,
        `Less than it rose. It is at ${money(h.price)} against the ${money(h.buyPrice)} you paid, and a fall is measured from the higher number, so a ${percent(roi)} rise is undone by a ${percent(room)} fall.`
      );
    }
  }

  /* ------------------------------------------------ your own figures */

  for (const h of holdings) {
    if (h.shares >= 3 && Number.isInteger(h.shares)) {
      const answer = String(h.shares);
      push(
        `shares:${h.ticker}`,
        "your-figures",
        `How many shares of ${named(h)} do you own?`,
        [
          answer,
          String(Math.max(1, Math.round(h.shares / 2))),
          String(h.shares * 2),
          String(Math.max(1, h.shares + (h.shares >= 10 ? 5 : 1))),
        ],
        answer,
        `${h.shares} shares, at ${money(h.price)} each, which is ${money(h.value)} all together.`
      );
    }
    if (h.value > 0) {
      const answer = money(h.value);
      push(
        `worth:${h.ticker}`,
        "your-figures",
        `What are all your ${named(h)} shares worth today, added up?`,
        [answer, money(h.value / 2), money(h.value * 2), money(h.value * 4)],
        answer,
        `${money(h.value)}, which is ${h.shares} shares at ${money(h.price)}. That is ${percent(totalValue > 0 ? h.value / totalValue : 0)} of everything you own.`
      );
    }
    const cost = h.shares * h.buyPrice;
    if (cost > 0 && h.value > 0) {
      const answer = money(cost);
      push(
        `paid-total:${h.ticker}`,
        "your-figures",
        `All together, how much did you put into ${named(h)}?`,
        [answer, money(h.value), money(cost / 2), money(cost * 2)],
        answer,
        `${money(cost)}, and it is worth ${money(h.value)} today, so you are ${h.value >= cost ? "up" : "down"} ${money(Math.abs(h.value - cost))} on it.`
      );
    }
  }

  /* --------------------------------------------------------- the day */

  if (holdings.length >= 3) {
    const down = holdings.filter((h) => (h.todayPct ?? 0) < 0).length;
    const answer = String(down);
    const nearby = [down - 1, down + 1, down + 2].filter(
      (n) => n >= 0 && n <= holdings.length && n !== down
    );
    push(
      "down-today",
      "today",
      `How many of your ${holdings.length} holdings are down today?`,
      [answer, ...nearby.slice(0, 2).map(String)],
      answer,
      `${down} of ${holdings.length}. When nearly all of them move the same way, it is usually the whole market rather than any one company.`
    );
  }

  if (input.typical && input.todayPct != null && totalValue > 0) {
    const size = daySize(input.todayPct, input.typical);
    const answer =
      size === "ordinary"
        ? "an ordinary day"
        : size === "bigger"
          ? "bigger than usual"
          : "much bigger than usual";
    push(
      "today-size",
      "typical-move",
      "Your portfolio moved today. Was that an ordinary day for it?",
      ["an ordinary day", "bigger than usual", "much bigger than usual"],
      answer,
      `Your portfolio usually moves about ${percent(input.typical.typicalPct)}, which is ${money(input.typical.typicalPct * totalValue)}. Today it moved ${percent(Math.abs(input.todayPct))}.`
    );

    const typicalDollar = input.typical.typicalPct * totalValue;
    const answerMoney = money(typicalDollar);
    push(
      "typical-dollars",
      "typical-move",
      "On an ordinary day, about how many dollars does your whole portfolio move, up or down?",
      [answerMoney, money(typicalDollar / 3), money(typicalDollar * 3), money(typicalDollar * 10)],
      answerMoney,
      `About ${money(typicalDollar)}, which is ${percent(input.typical.typicalPct)} of ${money(totalValue)}. Half your days are smaller than that, so a move of that size is not news.`
    );
  }

  return cards;
}
