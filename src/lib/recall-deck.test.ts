import { describe, expect, it } from "vitest";
import {
  answerCard,
  buildRecallCards,
  deckProgress,
  dueCards,
  isDue,
  pickCard,
  LAST_BOX,
  type DeckInput,
  type DeckState,
} from "@/lib/recall-deck";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const percent = (n: number) => `${Math.round(Math.abs(n) * 100)}%`;

const INPUT: DeckInput = {
  holdings: [
    {
      ticker: "$AAPL",
      label: "Apple",
      shares: 12,
      buyPrice: 168.4,
      price: 190,
      value: 2280,
      todayPct: -0.01,
    },
    {
      ticker: "$VOO",
      shares: 9,
      buyPrice: 390.1,
      price: 380,
      value: 3420,
      todayPct: -0.004,
    },
    {
      ticker: "$NVDA",
      label: "Nvidia",
      shares: 15,
      buyPrice: 96.3,
      price: 100,
      value: 1500,
      todayPct: 0.02,
    },
  ],
  totalValue: 7200,
  cash: 300,
  todayPct: -0.005,
  typical: { typicalPct: 0.012, days: 40 },
  money,
  percent,
};

describe("the schedule", () => {
  it("offers a card nobody has answered", () => {
    expect(isDue({}, "share:$VOO", "2026-09-02")).toBe(true);
  });

  it("moves a card further out each time it is answered right", () => {
    let state: DeckState = {};
    state = answerCard(state, "a", true, "2026-09-02");
    expect(state.a!.box).toBe(1);
    expect(state.a!.due).toBe("2026-09-03");
    state = answerCard(state, "a", true, "2026-09-03");
    expect(state.a!.due).toBe("2026-09-06");
    state = answerCard(state, "a", true, "2026-09-06");
    expect(state.a!.due).toBe("2026-09-13");
  });

  it("sends a wrong answer back to the front, but not to today", () => {
    let state: DeckState = {};
    state = answerCard(state, "a", true, "2026-09-02");
    state = answerCard(state, "a", true, "2026-09-03");
    state = answerCard(state, "a", false, "2026-09-06");
    expect(state.a!.box).toBe(1);
    expect(state.a!.due).toBe("2026-09-07");
    expect(isDue(state, "a", "2026-09-06")).toBe(false);
  });

  it("retires a card the reader plainly knows", () => {
    let state: DeckState = {};
    let day = "2026-09-02";
    for (let i = 0; i < LAST_BOX; i += 1) {
      state = answerCard(state, "a", true, day);
      day = state.a!.due;
    }
    expect(state.a!.box).toBe(LAST_BOX);
    expect(isDue(state, "a", "2030-01-01")).toBe(false);
  });

  it("asks a card that has come round before ahead of one never seen", () => {
    const cards = buildRecallCards(INPUT);
    expect(cards.length).toBeGreaterThan(2);
    let state: DeckState = {};
    state = answerCard(state, cards[2]!.id, true, "2026-09-01");
    const due = dueCards(cards, state, "2026-09-02", 1);
    expect(due[0]!.id).toBe(cards[2]!.id);
  });

  it("asks one thing a day unless the caller says otherwise", () => {
    const cards = buildRecallCards(INPUT);
    expect(dueCards(cards, {}, "2026-09-02")).toHaveLength(1);
    expect(dueCards(cards, {}, "2026-09-02", 3)).toHaveLength(3);
  });

  it("counts what the reader has finished with", () => {
    const cards = buildRecallCards(INPUT);
    let state: DeckState = {};
    let day = "2026-09-02";
    for (let i = 0; i < LAST_BOX; i += 1) {
      state = answerCard(state, cards[0]!.id, true, day);
      day = state[cards[0]!.id]!.due;
    }
    expect(deckProgress(cards, state)).toEqual({
      known: 1,
      total: cards.length,
    });
  });
});

describe("the visit's roll", () => {
  const cards = buildRecallCards(INPUT);

  it("asks about more than one thing across a handful of visits", () => {
    const seen = new Set<string>();
    for (let roll = 0; roll < 12; roll += 1) {
      seen.add(pickCard(cards, {}, "2026-09-02", roll)!.concept);
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it("does not open on the biggest holding's share every time", () => {
    const ids = new Set<string>();
    for (let roll = 0; roll < 12; roll += 1) {
      ids.add(pickCard(cards, {}, "2026-09-02", roll)!.id);
    }
    expect(ids.size).toBeGreaterThan(4);
  });

  it("still puts a card that has come round before ahead of the roll", () => {
    let state: DeckState = {};
    state = answerCard(state, cards[3]!.id, false, "2026-09-01");
    for (let roll = 0; roll < 5; roll += 1) {
      expect(pickCard(cards, state, "2026-09-02", roll)!.id).toBe(cards[3]!.id);
    }
  });

  it("leaves out the cards already asked this visit", () => {
    const first = pickCard(cards, {}, "2026-09-02", 7)!;
    const second = pickCard(cards, {}, "2026-09-02", 7, new Set([first.id]))!;
    expect(second.id).not.toBe(first.id);
    expect(pickCard(cards, {}, "2026-09-02", 7, new Set(cards.map((c) => c.id)))).toBeNull();
  });
});

describe("the questions", () => {
  const cards = buildRecallCards(INPUT);

  it("only asks things the reader's own data can answer", () => {
    for (const card of cards) {
      expect(card.options.length, card.id).toBeGreaterThanOrEqual(3);
      expect(card.answerIndex, card.id).toBeGreaterThanOrEqual(0);
      expect(card.answerIndex, card.id).toBeLessThan(card.options.length);
      expect(card.because.length, card.id).toBeGreaterThan(10);
    }
  });

  it("gets the arithmetic right on a fall in the biggest holding", () => {
    const card = cards.find((c) => c.id === "shock:$VOO")!;
    // VOO is 3,420 of 7,200, which is 47.5%, so a fifth off it is 9.5%.
    expect(card.options[card.answerIndex]).toBe("about 10%");
    expect(card.because).toContain("48%");
  });

  it("knows which side of what you paid a price is on", () => {
    const apple = cards.find((c) => c.id === "paid:$AAPL")!;
    expect(apple.options[apple.answerIndex]).toBe("above what you paid");
    const voo = cards.find((c) => c.id === "paid:$VOO")!;
    expect(voo.options[voo.answerIndex]).toBe("below what you paid");
  });

  it("asks every kind of question it can about this portfolio", () => {
    const concepts = new Set(cards.map((c) => c.concept));
    for (const c of [
      "share-of-portfolio",
      "concentration",
      "cash",
      "which-one",
      "today",
      "since-bought",
      "what-if",
      "paid-each",
      "asymmetry",
      "your-figures",
      "typical-move",
    ]) {
      expect(concepts.has(c), c).toBe(true);
    }
    expect(cards.length).toBeGreaterThan(20);
  });

  it("asks about every holding, not only the biggest", () => {
    for (const h of INPUT.holdings) {
      expect(cards.some((c) => c.id === `share:${h.ticker}`), h.ticker).toBe(true);
      expect(cards.some((c) => c.id === `paid:${h.ticker}`), h.ticker).toBe(true);
    }
  });

  it("knows a fall takes a bigger rise to undo", () => {
    // VOO is 380 against 390.1 paid: down 2.6%, under the 5% floor, so no
    // card. Push it further down and the arithmetic has to hold.
    const deeper = buildRecallCards({
      ...INPUT,
      holdings: INPUT.holdings.map((h) =>
        h.ticker === "$VOO" ? { ...h, price: 260, value: 2340 } : h
      ),
    });
    const card = deeper.find((c) => c.id === "back-even:$VOO")!;
    // 260 to 390.1 is a rise of 50%, after a fall of a third.
    expect(card.options[card.answerIndex]).toBe("about 50%");
    expect(card.options).toContain("about 33%");
    const apple = cards.find((c) => c.id === "room:$AAPL")!;
    // 190 against 168.4 paid: up 12.8%, and 168.4 is 11.4% below 190.
    expect(apple.options[apple.answerIndex]).toBe("about 11%");
  });

  it("names the biggest slice and the biggest mover", () => {
    const biggest = cards.find((c) => c.id === "which-biggest")!;
    expect(biggest.options[biggest.answerIndex]).toBe("$VOO");
    const mover = cards.find((c) => c.id === "which-moved-today")!;
    expect(mover.options[mover.answerIndex]).toBe("Nvidia");
    const money = cards.find((c) => c.id === "money-direction")!;
    expect(money.options[money.answerIndex]).toBe("more of it went down");
  });

  it("never offers two options that say the same thing", () => {
    for (const card of cards) {
      expect(new Set(card.options).size, card.id).toBe(card.options.length);
    }
  });

  it("counts today's fallers", () => {
    const card = cards.find((c) => c.id === "down-today")!;
    expect(card.options[card.answerIndex]).toBe("2");
  });

  it("says the company's name where it knows it, and the ticker where it does not", () => {
    expect(cards.some((c) => c.question.includes("Apple"))).toBe(true);
    expect(cards.some((c) => c.question.includes("$VOO"))).toBe(true);
  });

  it("keeps a card's id steady as prices move, so it can come back", () => {
    // A small move, so no holding crosses the floor under which a question
    // is not asked (Nvidia is under 4% above what was paid, and the
    // asymmetry card wants 5%). A card appearing is fine; a renamed one is
    // not.
    const later = buildRecallCards({
      ...INPUT,
      holdings: INPUT.holdings.map((h) => ({
        ...h,
        price: h.price * 1.01,
        value: h.value * 1.01,
      })),
      totalValue: INPUT.totalValue * 1.01,
    });
    expect(later.map((c) => c.id).sort()).toEqual(
      cards.map((c) => c.id).sort()
    );
  });

  it("does not put the answer in the same slot for every card", () => {
    const slots = new Set(cards.map((c) => c.answerIndex));
    expect(slots.size).toBeGreaterThan(1);
  });

  it("asks nothing at all of an empty portfolio", () => {
    expect(
      buildRecallCards({ ...INPUT, holdings: [], totalValue: 0, typical: null })
    ).toEqual([]);
  });

  it("never asks an opinion, a prediction, or what to do", () => {
    for (const card of cards) {
      const text = `${card.question} ${card.because}`;
      expect(text, card.id).not.toMatch(
        /should you|do you think|will it|going to|buy|sell|hold on/i
      );
      expect(text, card.id).not.toMatch(/[—–]/);
    }
  });
});
