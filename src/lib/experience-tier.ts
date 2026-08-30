/**
 * Self-reported experience tier — drives which tabs/panels default to
 * visible. Deliberately coarse (3 tiers, a handful of gates) rather than
 * per-feature toggles: the goal is "this looks simpler," not a settings
 * page with 30 checkboxes.
 */
export type ExperienceTier = "novice" | "investor" | "advanced";

export const EXPERIENCE_TIERS: {
  id: ExperienceTier;
  label: string;
  blurb: string;
}[] = [
  {
    id: "novice",
    label: "New to investing",
    blurb: "Show me the essentials, I'll grow into the rest.",
  },
  {
    id: "investor",
    label: "Comfortable investor",
    blurb: "I understand stocks and portfolios, show me most things.",
  },
  {
    id: "advanced",
    label: "Very experienced",
    blurb: "I actively trade, show me everything.",
  },
];

const STORAGE_KEY = "portfell-experience-tier";

export function loadStoredTier(): ExperienceTier | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "novice" || raw === "investor" || raw === "advanced" ? raw : null;
  } catch {
    return null;
  }
}

export const EXPERIENCE_TIER_EVENT = "upside:experience-tier";

function emitExperienceChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EXPERIENCE_TIER_EVENT));
}

export function saveStoredTier(tier: ExperienceTier) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, tier);
  } catch {
    /* ignore quota / private mode */
  }
  emitExperienceChanged();
}

/**
 * Meta-tab ids hidden per tier. Must be the `__xxx__` constants from
 * `lib/overview` (same ids `PortfolioTabs` uses), not labels.
 *
 * Pulse and Growth stay on every tier: Pulse is the thesis check the
 * product is for, and Growth is the compounding explainer the newest
 * readers need most. Lab is the analysis suite (allocation, shocks,
 * trends, seasonality). It waits until someone says they are comfortable.
 */
export const TIER_HIDDEN_META_TABS: Record<ExperienceTier, string[]> = {
  novice: ["__lab__"], // LAB_TAB_ID. Pulse and Growth stay.
  investor: [],
  advanced: [],
};

/**
 * LabSheet sub-tab ids hidden per tier (`alloc` | `risk` | `trends` |
 * `seasonality`). Novice never reaches Lab, so this list is for someone
 * who later opens it. Risk (book-wide shocks) is the one that reads as a
 * toy until you already know the names.
 */
export const TIER_HIDDEN_LAB_TABS: Record<ExperienceTier, string[]> = {
  novice: ["risk"],
  investor: ["risk"],
  advanced: [],
};

const KNOWS_OPTIONS_STORAGE_KEY = "portfell-knows-options";

/**
 * Options familiarity — deliberately separate from ExperienceTier.
 * Tri-state: null = hasn't answered yet, true = opted in, false =
 * explicitly none.
 *
 * **Hides on an explicit "no" only.** Someone who told us they do not know
 * options does not get covered-call panels, strike alerts, Call % fields or
 * Margus's options tools. Someone who has never been asked keeps what they
 * already had.
 *
 * That last part is the whole reason this is not `knowsOptions !== true`,
 * which is the stricter reading and was disabled outright on 2026-08-18
 * rather than shipped. The problem with it is structural, not a matter of
 * taste: `shouldSkipExperienceOnboarding` returns true as soon as
 * `holdingsCount > 0`, so **anybody who already owns anything never sees
 * the question**, and their answer stays null forever. Treating null as
 * "hide" would therefore strip covered calls from every existing holder at
 * once — people who had been using the feature for months, who were never
 * asked, and who would have no idea why it vanished.
 *
 * Hiding on an explicit "no" keeps the protection where it was actually
 * aimed. Anyone can change the answer either way in Account, and a null can
 * still become a true or a false there, so nothing here is a dead end.
 */
export function shouldHideOptions(knowsOptions: boolean | null): boolean {
  return knowsOptions === false;
}

/**
 * Household / already-filled books skip the first-run questionnaire.
 * Karoliine claiming Karud should land on the shared names, not "Add
 * what you own". Classroom joins skip it in the gate via isPaperClassOnly.
 * A circle invite does not skip: same questions as signing in on Home.
 */
export const HOUSEHOLD_SEED_SLUGS = new Set([
  "karud",
  "lap",
  "aasad",
  "anu",
  "maryann",
]);

export function shouldSkipExperienceOnboarding(input: {
  holdingsCount: number;
  portfolioSlugs: Array<string | null | undefined>;
}): boolean {
  if (input.holdingsCount > 0) return true;
  return input.portfolioSlugs.some(
    (slug) => typeof slug === "string" && HOUSEHOLD_SEED_SLUGS.has(slug)
  );
}

export function loadStoredKnowsOptions(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KNOWS_OPTIONS_STORAGE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return null;
  } catch {
    return null;
  }
}

export function saveStoredKnowsOptions(value: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KNOWS_OPTIONS_STORAGE_KEY, String(value));
  } catch {
    /* ignore quota / private mode */
  }
  emitExperienceChanged();
}
