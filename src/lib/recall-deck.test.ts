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

  it("does not always ask the shock question about the same holding", () => {
    // The reported bug: this card was keyed to the single biggest holding,
    // so it was the same ticker on every visit regardless of the roll.
    const varied = buildRecallCards({
      ...INPUT,
      holdings: [
        { ticker: "$AAA", shares: 1, buyPrice: 1, price: 1, value: 2600, todayPct: 0 },
        { ticker: "$BBB", shares: 1, buyPrice: 1, price: 1, value: 2500, todayPct: 0 },
        { ticker: "$CCC", shares: 1, buyPrice: 1, price: 1, value: 2100, todayPct: 0 },
      ],
      totalValue: 7200,
      cash: 0,
    });
    const shockIds = new Set<string>();
    for (let roll = 0; roll < 60; roll += 1) {
      const id = pickCard(varied, {}, "2026-09-02", roll)?.id;
      if (id?.startsWith("shock:")) shockIds.add(id);
    }
    expect(shockIds.size).toBeGreaterThan(1);
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

  it("asks the shock and doubling questions about every holding, not only the biggest", () => {
    for (const h of INPUT.holdings) {
      expect(cards.some((c) => c.id === `shock:${h.ticker}`), h.ticker).toBe(true);
      expect(cards.some((c) => c.id === `double:${h.ticker}`), h.ticker).toBe(true);
    }
  });

  it("never lets a shock question's distractors collide with its own answer", () => {
    // Two of the three distractors are fixed numbers (a third of the
    // answer, and a flat 20%), which only coincide with the answer at
    // rounded === 1 and rounded === 20. Walk every share from the 2% floor
    // to a full portfolio and check every one keeps four distinct options.
    for (let pct = 2; pct <= 100; pct += 1) {
      const share = pct / 100;
      const built = buildRecallCards({
        ...INPUT,
        holdings: [
          {
            ticker: "$ONE",
            shares: 1,
            buyPrice: 1,
            price: 1,
            value: share * 10000,
            todayPct: 0,
          },
          {
            ticker: "$TWO",
            shares: 1,
            buyPrice: 1,
            price: 1,
            value: (1 - share) * 10000,
            todayPct: 0,
          },
        ],
        totalValue: 10000,
        cash: 0,
      });
      const card = built.find((c) => c.id === "shock:$ONE");
      if (!card) continue; // rounds under 1%, deliberately not asked
      expect(new Set(card.options).size, `share ${pct}%`).toBe(card.options.length);
      expect(card.options.length, `share ${pct}%`).toBe(4);
    }
  });

  it("never lets a doubling question's distractors collide with its own answer", () => {
    // Two of the three distractors are the fixed "about 100%" and the
    // doubled share capped at 95%, which only coincide with the answer on
    // a heavily concentrated holding (share near 95% or 100%).
    for (let pct = 2; pct <= 100; pct += 1) {
      const share = pct / 100;
      const built = buildRecallCards({
        ...INPUT,
        holdings: [
          {
            ticker: "$ONE",
            shares: 1,
            buyPrice: 1,
            price: 1,
            value: share * 10000,
            todayPct: 0,
          },
          {
            ticker: "$TWO",
            shares: 1,
            buyPrice: 1,
            price: 1,
            value: (1 - share) * 10000,
            todayPct: 0,
          },
        ],
        totalValue: 10000,
        cash: 0,
      });
      const card = built.find((c) => c.id === "double:$ONE")!;
      expect(new Set(card.options).size, `share ${pct}%`).toBe(4);
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

describe("words that did not stick come back as questions", () => {
  const base = {
    holdings: [
      { ticker: "AAA", shares: 10, buyPrice: 10, price: 20, value: 200, todayPct: 0.01 },
      { ticker: "BBB", shares: 10, buyPrice: 10, price: 10, value: 100, todayPct: 0.01 },
    ],
    totalValue: 300,
    cash: 0,
    todayPct: 0.01,
    money: (n: number) => `$${n.toFixed(0)}`,
    percent: (n: number) => `${(n * 100).toFixed(0)}%`,
  };

  it("asks about a word opened twice, and not one opened once", () => {
    /*
      Once is curiosity. Asking somebody to define a word they glanced at
      is a test they never sat down for; twice is a definition that did not
      land, which is the one thing worth bringing back.
    */
    const cards = buildRecallCards({
      ...base,
      words: {
        borrowed: { id: "borrowed", times: 2 },
        cash: { id: "cash", times: 1 },
      },
    });
    const ids = cards.map((c) => c.id);
    expect(ids).toContain("word:borrowed");
    expect(ids).not.toContain("word:cash");
  });

  it("puts the meaning in the question and the words in the options", () => {
    const card = buildRecallCards({
      ...base,
      words: { borrowed: { id: "borrowed", times: 3 } },
    }).find((c) => c.id === "word:borrowed")!;

    expect(card.concept).toBe("word");
    expect(card.question).toContain("Which of these means");
    // Four short words, not four walls of prose.
    expect(card.options.length).toBe(4);
    for (const option of card.options) expect(option.length).toBeLessThan(40);
    expect(card.options[card.answerIndex]).toBe("Borrowed money");
  });

  it("keeps the id stable, so the card can actually come back", () => {
    const twice = [2, 9].map(
      (times) =>
        buildRecallCards({
          ...base,
          words: { borrowed: { id: "borrowed", times } },
        }).find((c) => c.id === "word:borrowed")!
    );
    expect(twice[0]!.id).toBe(twice[1]!.id);
    expect(twice[0]!.options).toEqual(twice[1]!.options);
  });

  it("ignores a word the glossary has never heard of", () => {
    const cards = buildRecallCards({
      ...base,
      words: { nonsense: { id: "nonsense", times: 5 } },
    });
    expect(cards.some((c) => c.id.startsWith("word:"))).toBe(false);
  });

  it("changes nothing for a reader who has looked nothing up", () => {
    const without = buildRecallCards(base).map((c) => c.id);
    const withEmpty = buildRecallCards({ ...base, words: {} }).map((c) => c.id);
    expect(withEmpty).toEqual(without);
  });
});

describe("a word that did not land comes back soon, not eventually", () => {
  const words = {
    today: { id: "today", first: "2026-09-12", last: "2026-09-12", times: 2 },
    premium: { id: "premium", first: "2026-09-12", last: "2026-09-12", times: 3 },
    dividend: { id: "dividend", first: "2026-09-12", last: "2026-09-12", times: 2 },
  };

  function deck(extra: Record<string, unknown> = {}) {
    return buildRecallCards({
      holdings: [
        { ticker: "AAA", shares: 10, buyPrice: 10, price: 20, value: 200, todayPct: 1 },
        { ticker: "BBB", shares: 5, buyPrice: 40, price: 30, value: 150, todayPct: -1 },
        { ticker: "CCC", shares: 2, buyPrice: 5, price: 9, value: 18, todayPct: 0.5 },
      ],
      totalValue: 368,
      cash: 20,
      todayPct: 0.4,
      money: (n: number) => `$${n.toFixed(0)}`,
      percent: (n: number) => `${(n * 100).toFixed(0)}%`,
      words,
      ...extra,
    } as Parameters<typeof buildRecallCards>[0]);
  }

  it("comes back within a couple of visits, not a fortnight", () => {
    /*
      Measured on the running app before this: with twice-opened words
      seeded, the first word card arrived on the twelfth reload, because
      it was one concept among a dozen on the roll. For somebody opening
      the app daily that is a fortnight after they asked.
    */
    const cards = deck();
    for (const start of [0, 1, 2, 5, 10, 41]) {
      const seen = [start, start + 1].map(
        (r) => pickCard(cards, {}, "2026-09-12", r)?.concept
      );
      expect(seen, `rolls ${start} and ${start + 1}`).toContain("word");
    }
  });

  it("leaves the rest of the deck to somebody who never answers", () => {
    /*
      The bound, and the reason this is every other visit rather than
      every one. Given outright priority it was measured on the running
      app serving a word card on all five of five consecutive visits,
      which is the fault the roll itself was introduced for in new
      clothes: a reader who does not tap loses the portfolio half of the
      deck entirely.
    */
    const cards = deck();
    const concepts = Array.from({ length: 10 }, (_, r) =>
      pickCard(cards, {}, "2026-09-12", r)?.concept
    );
    expect(concepts.filter((c) => c === "word").length).toBeGreaterThan(0);
    expect(concepts.filter((c) => c !== "word").length).toBeGreaterThan(0);
  });

  it("still varies which word it asks", () => {
    const cards = deck();
    const asked = new Set(
      [0, 2, 4, 6].map((r) => pickCard(cards, {}, "2026-09-12", r)?.id)
    );
    expect(asked.size).toBeGreaterThan(1);
  });

  it("leaves the queue once answered, so it cannot monopolise", () => {
    /*
      The bound that keeps this from re-creating the fault the roll was
      introduced for. An answered card has state, so it is no longer
      unseen and falls back to the schedule.
    */
    const cards = deck();
    const state: Record<string, { box: number; due: string }> = {};
    for (const c of cards) {
      if (c.concept === "word") state[c.id] = { box: 3, due: "2099-01-01" };
    }
    const picked = pickCard(cards, state as never, "2026-09-12", 4);
    expect(picked).not.toBeNull();
    expect(picked?.concept).not.toBe("word");
  });

  it("does nothing at all for a reader who looked nothing up", () => {
    const cards = buildRecallCards({
      holdings: [
        { ticker: "AAA", shares: 10, buyPrice: 10, price: 20, value: 200, todayPct: 1 },
        { ticker: "BBB", shares: 5, buyPrice: 40, price: 30, value: 150, todayPct: -1 },
        { ticker: "CCC", shares: 2, buyPrice: 5, price: 9, value: 18, todayPct: 0.5 },
      ],
      totalValue: 368,
      cash: 20,
      todayPct: 0.4,
      money: (n: number) => `$${n.toFixed(0)}`,
      percent: (n: number) => `${(n * 100).toFixed(0)}%`,
    } as Parameters<typeof buildRecallCards>[0]);
    expect(cards.some((c) => c.concept === "word")).toBe(false);
    const picked = pickCard(cards, {}, "2026-09-12", 3);
    expect(picked?.concept).not.toBe("word");
  });
});
