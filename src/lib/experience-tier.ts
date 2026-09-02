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
  /*
    Two sentences each, never a comma splice, and worded to match what the
    walkthrough calls the same three answers. "I actively trade" described
    the tier the walkthrough calls "Very experienced. I follow markets
    closely", so a reader picking one in Account and the other on the way
    in could not tell they were the same choice. The label is also printed
    into a sentence on the walkthrough's last screen, which is why it stays
    a plain noun phrase.
  */
  {
    id: "novice",
    label: "New to investing",
    blurb: "Show me the essentials. I will grow into the rest.",
  },
  {
    id: "investor",
    label: "Comfortable investor",
    blurb: "I understand stocks and portfolios. Show me most things.",
  },
  {
    id: "advanced",
    label: "Very experienced",
    blurb: "I follow markets closely. Show me everything.",
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
 * **Empty on every tier, and that is the decision rather than an oversight.**
 *
 * Lab used to be hidden from a novice, on the reasoning that the analysis
 * suite waits until somebody says they are comfortable. Read against what
 * this product is for, that is backwards: Lab is where a beginner finds out
 * that three of their holdings are most of their money, what a rough week
 * would do to it, and which of the companies they own move together. It is
 * the teaching room, and it was being withheld from the one reader who had
 * said out loud that they are new.
 *
 * The tier answer is still honoured, and "show me the essentials" is still
 * a real request. What a novice asked for is fewer *unexplained* things,
 * and the way to give them that is to explain, not to hide: every Lab tab
 * now opens with a sentence in the reader's own figures saying what the
 * view is for and one thing to notice in it. The tier still decides which
 * panels are visible by default (`isPanelVisible`), which is the part of
 * "this looks simpler" that costs a beginner nothing.
 *
 * There is also no way back in. Nothing surfaces a hidden room later, so
 * "I'll grow into the rest" meant "never", unless the reader thought to go
 * and change an answer in Account, which nobody does.
 *
 * Kept as records rather than deleted so the next person who wants to hide
 * a room has to come past this argument first, and so the two flags stay
 * visibly separate from `knows_options` below, which does still hide things
 * and for a different reason.
 */
export const TIER_HIDDEN_META_TABS: Record<ExperienceTier, string[]> = {
  novice: [],
  investor: [],
  advanced: [],
};

/**
 * LabSheet sub-tab ids hidden per tier (`alloc` | `risk` | `trends` |
 * `seasonality`).
 *
 * Risk was hidden from a novice and from an investor, on the reasoning that
 * a portfolio-wide shock test reads as a toy until you already know the
 * companies. Two things are wrong with that. Somebody who has said they are
 * comfortable with stocks and portfolios being refused a shock test is hard
 * to argue for at all, and "what would a rough week do to this" is the
 * question a beginner most needs a safe way to ask, because the alternative
 * is finding out during the rough week.
 *
 * The tab now opens by naming the reader's own largest holding and its
 * share, which is the sentence that makes the rest of the panel mean
 * something.
 */
export const TIER_HIDDEN_LAB_TABS: Record<ExperienceTier, string[]> = {
  novice: [],
  investor: [],
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
