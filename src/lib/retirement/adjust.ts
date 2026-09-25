import type { RetirementInputs } from "@/lib/retirement/plan";
import type { MoneyWriter } from "@/lib/retirement/summary";

/**
 * WHAT A READER CAN ADJUST, ONE THING AT A TIME.
 *
 * This replaced three detail levels, "Simple", "More" and "Everything",
 * which answered the wrong question. A level decides how much of the whole
 * page to show, and what somebody actually arrives wanting is one change:
 * their rent is not the template's rent, or they have a pension statement.
 * Under the levels that meant pressing "More", which opened every panel at
 * once, and scrolling through the home, the children, the car and the
 * returns to reach the one field they came for.
 *
 * So every part of the plan that is not one of the essentials is a topic,
 * drawn as a chip that already says what the plan assumes for it ("Rent
 * $1,633 a month", "State pension from 67"). Pressing one opens that
 * editor and nothing else, directly under the card. A chip that says
 * "None" is still a statement: a reader can see at a glance everything the
 * plan counts without opening a single panel, which is what the old
 * sentence at the foot of the simple level was trying to do in prose.
 *
 * Nothing is ever unreachable, and nothing is asked that was not chosen.
 * The open set is remembered per browser, so somebody who always tunes
 * their returns finds that editor open next time.
 */

export type AdjustTopic =
  | "home"
  | "children"
  | "car"
  | "income"
  | "savings"
  | "returns"
  | "lifespan"
  | "bridge"
  | "working";

export const ADJUST_TOPICS: readonly AdjustTopic[] = [
  "home",
  "children",
  "car",
  "income",
  "savings",
  "returns",
  "lifespan",
  "bridge",
  "working",
];

export const ADJUST_LABEL: Record<AdjustTopic, string> = {
  home: "Home",
  children: "Children",
  car: "Car",
  income: "Pensions and income",
  savings: "Savings and tax",
  returns: "Returns and mix",
  lifespan: "How long it lasts",
  bridge: "A pot that runs out",
  working: "How it is worked out",
};

/**
 * What the plan assumes for one topic, in a few words, with the figures in
 * it. Short enough for a chip at phone width, and a statement of fact
 * rather than an instruction, so "None" is said out loud rather than left
 * blank: a blank chip reads as a chip that failed to load.
 */
export function topicSummary(
  topic: AdjustTopic,
  inputs: RetirementInputs,
  money: MoneyWriter,
  extra: { planningAge: number; swrPct: number }
): string {
  switch (topic) {
    case "home":
      if (inputs.housing === "renting") {
        return `Rent ${money(inputs.rentAnnual / 12)} a month`;
      }
      if (inputs.housing === "mortgage") {
        return `Mortgage ${money(inputs.mortgageAnnual / 12)} a month, ${Math.round(inputs.mortgageYearsLeft)} years`;
      }
      return "Owned outright";
    case "children": {
      const n = inputs.children.length;
      if (n === 0) return "None";
      return `${n}, ${money(inputs.childAnnualCost / 12)} a month each`;
    }
    case "car":
      if (inputs.carMonthly <= 0) return "None";
      return inputs.carForever
        ? `${money(inputs.carMonthly)} a month, always`
        : `${money(inputs.carMonthly)} a month, ${Math.round(inputs.carYearsLeft)} years`;
    case "income": {
      const state =
        inputs.includeStatePension && inputs.statePensionAnnual > 0
          ? `State ${money(inputs.statePensionAnnual / 12)} a month from ${Math.round(inputs.statePensionAge)}`
          : "No state pension";
      return inputs.otherIncomeAnnual > 0
        ? `${state}, plus ${money(inputs.otherIncomeAnnual / 12)} more`
        : state;
    }
    case "savings": {
      const parts: string[] = [];
      if (inputs.otherSavings > 0) parts.push(`${money(inputs.otherSavings)} elsewhere`);
      if (inputs.withdrawalTaxPct > 0) parts.push(`${inputs.withdrawalTaxPct}% tax`);
      return parts.length ? parts.join(", ") : "Nothing else, no tax";
    }
    case "returns":
      return `Shares ${inputs.returns.equityPct.toFixed(1)}% a year, real`;
    case "lifespan":
      return `Planned to age ${extra.planningAge}`;
    case "bridge": {
      const years = Math.round(inputs.statePensionAge) - Math.round(inputs.retirementAge);
      return inputs.includeStatePension && years > 0
        ? `${years} ${years === 1 ? "year" : "years"} before your pension`
        : "For a stretch with an end date";
    }
    case "working":
      return `Drawing ${extra.swrPct.toFixed(1)}% a year`;
  }
}

export const RETIREMENT_OPEN_KEY = "upside-retirement-open-v1";

export function sanitizeOpenTopics(raw: unknown): AdjustTopic[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<AdjustTopic>();
  for (const t of raw) {
    if (ADJUST_TOPICS.includes(t as AdjustTopic)) seen.add(t as AdjustTopic);
  }
  // Always in the chips' own order, so the editors below never shuffle.
  return ADJUST_TOPICS.filter((t) => seen.has(t));
}

export function loadOpenTopics(): AdjustTopic[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RETIREMENT_OPEN_KEY);
    return raw ? sanitizeOpenTopics(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function saveOpenTopics(open: readonly AdjustTopic[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RETIREMENT_OPEN_KEY, JSON.stringify(open));
  } catch {
    /* A full or blocked store is not worth breaking the page over. */
  }
}

/** Open or close one topic, keeping the chips' order. */
export function toggleTopic(
  open: readonly AdjustTopic[],
  topic: AdjustTopic
): AdjustTopic[] {
  return open.includes(topic)
    ? open.filter((t) => t !== topic)
    : sanitizeOpenTopics([...open, topic]);
}
