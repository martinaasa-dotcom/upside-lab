import { describe, expect, it } from "vitest";
import {
  answerCard,
  buildRecallCards,
  deckProgress,
  dueCards,
  isDue,
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
    const card = cards.find((c) => c.concept === "concentration")!;
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

  it("counts today's fallers", () => {
    const card = cards.find((c) => c.id === "down-today")!;
    expect(card.options[card.answerIndex]).toBe("2");
  });

  it("says the company's name where it knows it, and the ticker where it does not", () => {
    expect(cards.some((c) => c.question.includes("Apple"))).toBe(true);
    expect(cards.some((c) => c.question.includes("$VOO"))).toBe(true);
  });

  it("keeps a card's id steady as prices move, so it can come back", () => {
    const later = buildRecallCards({
      ...INPUT,
      holdings: INPUT.holdings.map((h) => ({
        ...h,
        price: h.price * 1.05,
        value: h.value * 1.05,
      })),
      totalValue: INPUT.totalValue * 1.05,
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
