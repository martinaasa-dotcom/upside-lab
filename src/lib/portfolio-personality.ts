/**
 * Fun, non-serious personality scoring for comparing portfolios in
 * Communities — a diversification score, a risk score, a modeled return
 * profile, and a "spirit animal" derived from all of it. None of this is
 * investment analysis; it's a light, shareable way to compare books at a
 * glance ("who's the shark, who's the owl").
 */

import { forecastThemeForTicker, impliedAnnualReturnForTheme, type ForecastTheme } from "@/lib/forecast-conviction";

/** Rough 0-100 risk/volatility read per theme — illustrative, not a
 * real risk model. Crypto and concentrated growth names score hot;
 * index funds and healthcare score calm. */
const THEME_RISK_SCORE: Record<ForecastTheme, number> = {
  crypto: 95,
  space: 85,
  ai_infra: 80,
  drones: 78,
  semi: 72,
  ai_power: 65,
  fintech: 60,
  software: 55,
  other: 50,
  healthcare: 35,
  index: 15,
};

/**
 * A rough guess at how far a bad stretch could take each kind of business,
 * typed into this app by hand. Nothing here was measured, nothing was
 * modelled, and no history was read to produce it: it is shaped by what these
 * sectors have broadly done, and that is the whole of its authority. Copy that
 * reads this table must say so rather than presenting it as a measurement.
 */
const THEME_MAX_DRAWDOWN_PCT: Record<ForecastTheme, number> = {
  crypto: 75,
  space: 60,
  ai_infra: 55,
  drones: 55,
  semi: 50,
  ai_power: 45,
  fintech: 45,
  software: 42,
  other: 40,
  healthcare: 30,
  index: 22,
};

/** A broad index ticker (SPY, CSPX, a total-market fund…) is internally
 * diversified even though it's "one position" in a per-ticker weight
 * breakdown — let it count in the concentration math as if it were spread
 * across this many synthetic equal-weight slices. */
const INDEX_LOOKTHROUGH_SLOTS = 15;

/** Effective-position count (1 / HHI) needed to read as "fully
 * diversified" (100/100). A handful of single-stock bets — a common,
 * real setup — should read as concentrated, not "87% diversified"; it
 * should take something closer to a genuinely broad book to max out. */
const DIVERSIFICATION_CEILING_N = 20;

/** Long-run assumptions for the CAPM-style "modeled alpha" read below —
 * same spirit as the Compound sheet's cash-yield/index assumptions, just
 * local here to avoid a cross-import for two constants. */
const RISK_FREE_ANNUAL_PCT = 4.5;
const MARKET_ANNUAL_RETURN_PCT = 10;

/**
 * Risk score to CAPM beta. This used to be `riskScore / 50`, which put a
 * broad index fund (risk 15) at beta 0.3 when an index tracking the market
 * is beta 1.0 by definition, so a plain index book showed a fake negative
 * alpha and every risky book got an unfairly low hurdle to clear.
 *
 * Anchored instead so index lands at ~1.0 and the hottest themes land
 * around 2.8, which is the right neighbourhood for a concentrated
 * single-name growth book.
 */
function betaForRiskScore(riskScore: number): number {
  const INDEX_RISK = 15;
  const INDEX_BETA = 1.0;
  const SLOPE = 0.0225; // risk 95 (crypto) lands at ~2.8
  return Math.max(0.2, INDEX_BETA + (riskScore - INDEX_RISK) * SLOPE);
}

export type ScoreBand = { label: string; description: string };

export type PortfolioPersonality = {
  /** 0-100, higher = more spread across effectively-independent positions. */
  diversificationScore: number;
  diversificationBand: ScoreBand;
  /** 0-100, higher = hotter/more volatile theme mix. */
  riskScore: number;
  riskBand: ScoreBand;
  /** 0-100, weight of the single largest position. */
  convictionScore: number;
  convictionBand: ScoreBand;
  /** Ticker behind convictionScore, if any. */
  topTicker: string | null;
  /** 0-100, weight sitting in the heaviest forecast theme. */
  specialistScore: number;
  /** Themes that actually move the needle (>= 8% of equity). */
  themeCount: number;
  /** Cash as a % of NAV. Negative cash (margin) stays negative. */
  cashPct: number;
  dominantTheme: ForecastTheme;
  animal: string;
  animalEmoji: string;
  tagline: string;
  /** Full bestiary entry backing `animal` — the whole card, not just the
   * one-liner, so a UI can show strength/watchFor without a second lookup. */
  archetype: AnimalArchetype;
  /**
   * Why *this* book got *this* animal, quoting its own scores. The
   * bestiary copy describes the archetype in the abstract and reads the
   * same for everyone who lands on it; this is the part that connects the
   * badge to the person looking at it.
   */
  whyThisAnimal: string;
  /** Blended forward-looking annual return of the actual picks (equity
   * only), from the same engine Forecast uses — a modeled expectation,
   * not a promise. */
  expectedAnnualReturnPct: number;
  /** Blended illustrative worst-case drawdown across the held themes. */
  maxDrawdownPct: number;
  /**
   * "Modeled alpha" — a playful, CAPM-inspired number: this book's own
   * blended forward-return model minus what a passive index bet carrying
   * the *same* risk (beta, proxied from the risk score) would need to earn
   * under long-run market assumptions. Positive = the actual stock
   * selection is modeled to earn more than its risk level alone would
   * "deserve"; negative = the picks are modeled to earn less than a
   * same-risk index bet. Not a real backtested Jensen's alpha — a fun,
   * directional read using the forecast engine's own return assumptions.
   */
  modeledAlphaPct: number;
};

/**
 * The full field guide — every possible archetype a book can land on, in
 * the same order pickAnimal() checks them (most extreme/specific first,
 * most general last). Exported so a "what do the animals mean?" UI can
 * show the whole taxonomy, not just whichever one you got.
 */
export type AnimalArchetype = {
  /** Stable key, independent of the display name. */
  id: string;
  animal: string;
  emoji: string;
  /** Plain-English trigger — what combination of scores lands here. */
  criteria: string;
  /** The one-liner used everywhere the card needs to stay compact. */
  tagline: string;
  /** A fuller two-line personality read, for a "learn more" surface. */
  vibe: string;
  strength: string;
  watchFor: string;
};

export const ANIMAL_BESTIARY: AnimalArchetype[] = [
  {
    id: "hatchling",
    animal: "Hatchling",
    emoji: "🥚",
    criteria: "Nothing added yet",
    tagline: "Nothing held yet. Every portfolio starts here.",
    vibe: "Nothing picked. Every other animal on this list started right here, deciding what to hatch into.",
    strength: "Nothing to lose, and no bad habits yet.",
    watchFor: "Cash on its own only keeps pace with a savings account.",
  },
  {
    id: "squirrel",
    animal: "Squirrel",
    emoji: "🐿️",
    criteria: "Cash is at least about 28% of your portfolio",
    tagline: "Keeps a fat cash stash so a quiet stretch doesn't starve your portfolio.",
    vibe: "There are holdings here, but the pile of cash is the real personality. Ready to pounce, or just nervously hoarding.",
    strength: "Can buy when prices drop without selling something else first.",
    watchFor: "Cash that is never spent earns what a savings account earns, no more.",
  },
  {
    id: "dragon",
    animal: "Dragon",
    emoji: "🐉",
    criteria: "Crypto is the heaviest group, and a real slice of your portfolio",
    tagline: "Sits on jumpy treasure. Up fast, down fast.",
    vibe: "Lives and dies by crypto, and likes it that way. When the pile is up, nothing moves faster.",
    strength: "First in line when crypto runs.",
    watchFor: "The pile can lose half its value by morning.",
  },
  {
    id: "panda",
    animal: "Panda",
    emoji: "🐼",
    criteria: "Two thirds or more in one kind of stock that doesn't have its own animal yet",
    tagline: "Eats one thing. When that group moves, the whole portfolio moves.",
    vibe: "Not random. A chosen diet, just not one of the groups that has its own animal yet.",
    strength: "Gets the full ride when that one group is right.",
    watchFor: "A panda with no bamboo left has nothing else to eat.",
  },
  {
    id: "beaver",
    animal: "Beaver",
    emoji: "🦫",
    criteria: "Two thirds or more in AI computer builders",
    tagline: "Builds the same structure over and over. Every log goes into one dam.",
    vibe: "Convinced the dam is worth building. As long as the water keeps coming, which here means companies keep buying AI computers, the dam pays for itself many times over.",
    strength: "Gets the full ride when that one group is right.",
    watchFor: "A dam holds until it doesn't. All the effort sits behind one wall.",
  },
  {
    id: "rhino",
    animal: "Rhino",
    emoji: "🦏",
    criteria: "Two thirds or more in data-center power stocks",
    tagline: "Heavy, armored, and built for one job: keeping the lights on for everyone else.",
    vibe: "Not flashy. This is the heavy, unglamorous end of the same AI story everyone else is buying: the companies that supply the electricity it runs on.",
    strength: "Gets the full ride when that one group is right.",
    watchFor: "Armor is heavy. It doesn't move fast if the story changes.",
  },
  {
    id: "badger",
    animal: "Badger",
    emoji: "🦡",
    criteria: "Two thirds or more in chip makers",
    tagline: "Digs straight down into one thing: the chips underneath everything else.",
    vibe: "Doesn't care what's built on top. Cares who made the part everyone else needs.",
    strength: "Gets the full ride when that one group is right.",
    watchFor: "A badger that's dug in one direction has a long way back up if it's wrong.",
  },
  {
    id: "scorpion",
    animal: "Scorpion",
    emoji: "🦂",
    criteria: "Two thirds or more in defense and drone stocks",
    tagline: "Armored and built to strike. One group of businesses, chosen on purpose.",
    vibe: "A bet on who gets paid regardless of who's winning. Quiet until it isn't.",
    strength: "Gets the full ride when that one group is right.",
    watchFor: "Budgets and contracts can shift fast, and a scorpion has nowhere else to hide.",
  },
  {
    id: "otter",
    animal: "Otter",
    emoji: "🦦",
    criteria: "Two thirds or more in payments and finance stocks",
    tagline: "Plays in one river its whole life: money moving from one place to another.",
    vibe: "Every business here makes money on money moving. Different companies, same river.",
    strength: "Gets the full ride when that one group is right.",
    watchFor: "One river running dry leaves an otter with nowhere else to swim.",
  },
  {
    id: "chameleon",
    animal: "Chameleon",
    emoji: "🦎",
    criteria: "Two thirds or more in software stocks",
    tagline: "Blends into whatever it's sitting on. One group, many different-looking businesses.",
    vibe: "Software touches everything, which can look like variety even when it's one group of businesses reacting to the same news.",
    strength: "Gets the full ride when that one group is right.",
    watchFor: "Looking varied and actually being varied are not the same thing.",
  },
  {
    id: "flamingo",
    animal: "Flamingo",
    emoji: "🦩",
    criteria: "Two thirds or more in healthcare stocks",
    tagline: "Stands in one spot for a long time on purpose, waiting for results that take years rather than months.",
    vibe: "Healthcare moves on a different clock than the rest of the market. A flamingo is comfortable with that.",
    strength: "Gets the full ride when that one group is right, on its own timeline.",
    watchFor: "Patience only pays off if the underlying story was actually right.",
  },
  {
    id: "octopus",
    animal: "Octopus",
    emoji: "🐙",
    criteria: "Three or more kinds of stocks, genuinely spread across them",
    tagline: "A tentacle in every pond. Many kinds of stocks, no single bet on the weather.",
    vibe: "Curious, or just collected. Your portfolio is not one story. It is several, running side by side.",
    strength: "A bad year in one pond does not empty the tank.",
    watchFor: "Eight tentacles can become eight half-finished reasons.",
  },
  {
    id: "squid",
    animal: "Squid",
    emoji: "🦑",
    criteria: "Three or more kinds of stocks, and the mix itself runs hot",
    tagline: "Many kinds of stocks, and every one of them jumpy. Fast in every direction at once.",
    vibe: "Not one wild bet, several. The spread doesn't calm this portfolio down, it just gives the swings more places to come from.",
    strength: "A bad year in one pond does not empty the tank, and there's real upside in more than one place.",
    watchFor: "Several jumpy holdings can all have a bad week at the same time.",
  },
  {
    id: "crab",
    animal: "Crab",
    emoji: "🦀",
    criteria: "Three or more kinds of stocks, but a couple of holdings still carry most of the weight",
    tagline: "Sideways on purpose. A few different groups, but the weight still sits on a couple of holdings.",
    vibe: "Not a single bet, and not really spread out either. A few different stories, one or two of them doing most of the carrying.",
    strength: "More than one place for good news to come from.",
    watchFor: "The mix looks varied on the label, less so once you weigh it.",
  },
  {
    id: "shark",
    animal: "Shark",
    emoji: "🦈",
    criteria: "Jumpy holdings, and one really big one",
    tagline: "A few big bets, hunted with total focus.",
    vibe: "No wasted motion and no safety net. Every holding is there because you meant it.",
    strength: "Gets the full benefit when those few are right.",
    watchFor: "One bad call and there's no net underneath.",
  },
  {
    id: "wolf",
    animal: "Wolf",
    emoji: "🐺",
    criteria: "Jumpy holdings, spread across a pack",
    tagline: "Runs with a pack of jumpy holdings, not just one.",
    vibe: "Bold, but never betting the whole den on one hunt. Jumpy and spread at once is the rare mix.",
    strength: "Chases the fast movers on more than one front.",
    watchFor: "A pack of jumpy holdings can all fall together if they move as one.",
  },
  {
    id: "falcon",
    animal: "Falcon",
    emoji: "🦅",
    criteria: "Three holdings or fewer",
    tagline: "Small, sharp-eyed, and diving hard on very few targets.",
    vibe: "Every holding was picked, not just added. Nowhere for a bad call to hide.",
    strength: "Everything here is what you are surest about. No clutter.",
    watchFor: "A falcon with a bad target has nowhere else to turn.",
  },
  {
    id: "turtle",
    animal: "Turtle",
    emoji: "🐢",
    criteria: "Calm holdings, still a short list",
    tagline: "A small, well-armored shell, slow and steady on purpose.",
    vibe: "A short list on purpose, in companies calm enough that the shell rarely needs to close.",
    strength: "Quiet growth, calm under pressure, on purpose.",
    watchFor: "Short-and-calm only works while those few picks stay calm too.",
  },
  {
    id: "owl",
    animal: "Owl",
    emoji: "🦉",
    criteria: "Calm holdings, and genuinely spread out",
    tagline: "Watchful and calm, and actually spread out.",
    vibe: "Sees what is coming, and is not sitting on one perch. Calm and spread out, rather than calm and holding a single company.",
    strength: "Rarely surprised, rarely rattled. A genuinely calm portfolio.",
    watchFor: "All that watching can turn into missed chances. Calm is not the same as asleep.",
  },
  {
    id: "elephant",
    animal: "Elephant",
    emoji: "🐘",
    criteria: "Index-broad, or an index fund doing the spreading",
    tagline: "Broad, steady, and hard to spook. Never one bad day away from trouble.",
    vibe: "Built to survive any single holding's worst day. Slow to startle, and it remembers every cycle it has lived through.",
    strength: "No single ticker can sink this portfolio on its own.",
    watchFor: "Broad can drift into bland. Check the spread is on purpose, not just default.",
  },
  {
    id: "fox",
    animal: "Fox",
    emoji: "🦊",
    criteria: "The flexible middle. Not extreme on cash, diet, heat, or spread",
    tagline: "Clever and adaptable. A bit of everything, and no rule it has to follow.",
    vibe: "Some holdings here to grow, some here to steady things. This portfolio does not need a label to be doing its job.",
    strength: "Can lean either way when prices shift.",
    watchFor: "Flexible can turn into unfocused. Know what this portfolio is actually for.",
  },
];

const ARCHETYPE_BY_ID = new Map(ANIMAL_BESTIARY.map((a) => [a.id, a]));

/** Per-animal card chrome: the left accent bar, the pill next to a member
 * name, the tile behind the emoji, and the milestone bar. Full literal
 * Tailwind class strings so the JIT picks them up — these must never be
 * built from a template literal, or the classes silently stop existing. */
export type AnimalCardTone = {
  bar: string;
  border: string;
  wash: string;
  well: string;
  name: string;
  milestone: string;
};

/**
 * One tone, derived from a single design token.
 *
 * This used to be 21 hand-picked Tailwind hues — one bespoke palette per
 * archetype, including `bg-purple-400`, `bg-violet-400`, `bg-fuchsia-400`
 * and `bg-indigo-400`, all four of which are banned app-wide, plus a
 * `bg-<hue>-500/10` tinted card wash for every one of them, which is the
 * pattern AGENTS.md bans by name. Twenty-one distinguishable hues cannot
 * be picked tastefully; the attempt is what produced the rainbow.
 *
 * Two things make that unnecessary:
 *
 * 1. Every archetype already carries its own emoji and name. 🐺 Wolf is
 *    not identified by being violet — colour was redundant with the two
 *    strongest identity cues on the card.
 * 2. The archetypes are not 21 unrelated things. Ten of them *are* the
 *    theme animals — Beaver is AI computer builders, Rhino is data-center
 *    power, Dragon is crypto — so they can share the theme's own colour
 *    and agree with the Lab allocation bar for free. The other eleven
 *    describe temperament, which is a real three-step axis, not eleven
 *    arbitrary points.
 *
 * So colour here now means something, and every value comes from a token.
 */
const TONE = {
  cat1: {
    bar: "bg-[var(--cat-1)]",
    border: "border-[color-mix(in_oklch,var(--cat-1),transparent_55%)]",
    wash: "bg-[color-mix(in_oklch,var(--cat-1),transparent_88%)]",
    well: "bg-[color-mix(in_oklch,var(--cat-1),transparent_80%)]",
    name: "text-[var(--cat-1)]",
    milestone: "bg-[var(--cat-1)]",
  },
  cat2: {
    bar: "bg-[var(--cat-2)]",
    border: "border-[color-mix(in_oklch,var(--cat-2),transparent_55%)]",
    wash: "bg-[color-mix(in_oklch,var(--cat-2),transparent_88%)]",
    well: "bg-[color-mix(in_oklch,var(--cat-2),transparent_80%)]",
    name: "text-[var(--cat-2)]",
    milestone: "bg-[var(--cat-2)]",
  },
  cat3: {
    bar: "bg-[var(--cat-3)]",
    border: "border-[color-mix(in_oklch,var(--cat-3),transparent_55%)]",
    wash: "bg-[color-mix(in_oklch,var(--cat-3),transparent_88%)]",
    well: "bg-[color-mix(in_oklch,var(--cat-3),transparent_80%)]",
    name: "text-[var(--cat-3)]",
    milestone: "bg-[var(--cat-3)]",
  },
  cat4: {
    bar: "bg-[var(--cat-4)]",
    border: "border-[color-mix(in_oklch,var(--cat-4),transparent_55%)]",
    wash: "bg-[color-mix(in_oklch,var(--cat-4),transparent_88%)]",
    well: "bg-[color-mix(in_oklch,var(--cat-4),transparent_80%)]",
    name: "text-[var(--cat-4)]",
    milestone: "bg-[var(--cat-4)]",
  },
  cat5: {
    bar: "bg-[var(--cat-5)]",
    border: "border-[color-mix(in_oklch,var(--cat-5),transparent_55%)]",
    wash: "bg-[color-mix(in_oklch,var(--cat-5),transparent_88%)]",
    well: "bg-[color-mix(in_oklch,var(--cat-5),transparent_80%)]",
    name: "text-[var(--cat-5)]",
    milestone: "bg-[var(--cat-5)]",
  },
  cat6: {
    bar: "bg-[var(--cat-6)]",
    border: "border-[color-mix(in_oklch,var(--cat-6),transparent_55%)]",
    wash: "bg-[color-mix(in_oklch,var(--cat-6),transparent_88%)]",
    well: "bg-[color-mix(in_oklch,var(--cat-6),transparent_80%)]",
    name: "text-[var(--cat-6)]",
    milestone: "bg-[var(--cat-6)]",
  },
  cat7: {
    bar: "bg-[var(--cat-7)]",
    border: "border-[color-mix(in_oklch,var(--cat-7),transparent_55%)]",
    wash: "bg-[color-mix(in_oklch,var(--cat-7),transparent_88%)]",
    well: "bg-[color-mix(in_oklch,var(--cat-7),transparent_80%)]",
    name: "text-[var(--cat-7)]",
    milestone: "bg-[var(--cat-7)]",
  },
  cat9: {
    bar: "bg-[var(--cat-9)]",
    border: "border-[color-mix(in_oklch,var(--cat-9),transparent_55%)]",
    wash: "bg-[color-mix(in_oklch,var(--cat-9),transparent_88%)]",
    well: "bg-[color-mix(in_oklch,var(--cat-9),transparent_80%)]",
    name: "text-[var(--cat-9)]",
    milestone: "bg-[var(--cat-9)]",
  },
  cat10: {
    bar: "bg-[var(--cat-10)]",
    border: "border-[color-mix(in_oklch,var(--cat-10),transparent_55%)]",
    wash: "bg-[color-mix(in_oklch,var(--cat-10),transparent_88%)]",
    well: "bg-[color-mix(in_oklch,var(--cat-10),transparent_80%)]",
    name: "text-[var(--cat-10)]",
    milestone: "bg-[var(--cat-10)]",
  },
  /** Steady temperament, and the "no clear theme" fallback. */
  neutral: {
    bar: "bg-[var(--cat-neutral)]",
    border: "border-[color-mix(in_oklch,var(--cat-neutral),transparent_50%)]",
    wash: "bg-[color-mix(in_oklch,var(--cat-neutral),transparent_88%)]",
    well: "bg-[color-mix(in_oklch,var(--cat-neutral),transparent_78%)]",
    name: "text-[var(--cat-neutral)]",
    milestone: "bg-[var(--cat-neutral)]",
  },
  /** Balanced temperament — the app's own accent. */
  balanced: {
    bar: "bg-primary",
    border: "border-primary/45",
    wash: "bg-primary/12",
    well: "bg-primary/20",
    name: "text-primary",
    milestone: "bg-primary",
  },
  /** Runs hot. `--warning` is the caution token, which is exactly what a
   * jumpy, concentrated book is — not a loss, and not decoration. */
  hot: {
    bar: "bg-warning",
    border: "border-warning/45",
    wash: "bg-warning/12",
    well: "bg-warning/20",
    name: "text-warning",
    milestone: "bg-warning",
  },
} as const satisfies Record<string, AnimalCardTone>;

/**
 * Archetype -> tone.
 *
 * The ten theme animals point at the same `--cat-*` step their theme uses
 * in `THEME_COLOR` below, so a Beaver card and the "AI computer builders"
 * slice of the allocation bar are the same colour without anyone having to
 * remember to keep them in sync.
 *
 * The remaining eleven are graded by temperament, which is what they
 * actually describe: steady, balanced, or running hot.
 */
export const ANIMAL_CARD_TONE: Record<string, AnimalCardTone> = {
  // Theme animals — colour matches the theme they represent.
  beaver: TONE.cat2, // ai_infra
  rhino: TONE.cat3, // ai_power
  badger: TONE.cat5, // semi
  scorpion: TONE.cat7, // drones
  otter: TONE.cat4, // fintech
  chameleon: TONE.cat10, // software
  flamingo: TONE.cat6, // healthcare
  dragon: TONE.cat1, // crypto
  elephant: TONE.cat9, // index
  panda: TONE.neutral, // a theme with no animal of its own

  // Steady: no names yet, sitting on cash, or calm and short.
  hatchling: TONE.neutral,
  squirrel: TONE.neutral,
  turtle: TONE.neutral,
  owl: TONE.neutral,

  // Balanced: genuinely spread, or deliberately in the middle.
  octopus: TONE.balanced,
  crab: TONE.balanced,
  falcon: TONE.balanced,
  fox: TONE.balanced,

  // Runs hot: jumpy names, or a mix that runs hot.
  squid: TONE.hot,
  shark: TONE.hot,
  wolf: TONE.hot,
};


export function animalCardTone(id: string | undefined | null): AnimalCardTone {
  return (id && ANIMAL_CARD_TONE[id]) || ANIMAL_CARD_TONE.hatchling!;
}

/** Stable color per forecast theme, shared by every theme chart (Lab's
 * allocation fingerprint, the community sector chart) and their legends so
 * a swatch always means the same theme wherever you see it. */
/**
 * Theme colours for the allocation bar and its legend.
 *
 * These are `var(--cat-*)` references, not hex. The table used to be
 * eleven hardcoded Tailwind hex values (#a78bfa violet, #e879f9 fuchsia,
 * #818cf8 indigo, #f59e0b amber, plus cyan/sky/blue/teal/rose) — four of
 * them explicitly banned app-wide, all of them outside any token, and all
 * of them rendered as the widest strip of colour in the product. The ramp
 * they now point at is defined once in `globals.css` and documented in
 * DESIGN_TOKENS.md: one lightness, one chroma, hue only.
 *
 * Ordered so the themes that most often sit next to each other in a real
 * book (ai_infra / ai_power / semi are usually the three biggest slices)
 * land on well-separated hues rather than neighbours.
 */
export const THEME_COLOR: Record<ForecastTheme, string> = {
  ai_infra: "var(--cat-2)",
  ai_power: "var(--cat-3)",
  semi: "var(--cat-5)",
  crypto: "var(--cat-1)",
  space: "var(--cat-8)",
  fintech: "var(--cat-4)",
  software: "var(--cat-10)",
  healthcare: "var(--cat-6)",
  drones: "var(--cat-7)",
  index: "var(--cat-9)",
  other: "var(--cat-neutral)",
};

export const THEME_LABEL: Record<ForecastTheme, string> = {
  ai_infra: "AI computer builders",
  ai_power: "data-center power",
  crypto: "crypto",
  space: "space",
  semi: "chip makers",
  fintech: "payments and finance",
  software: "software",
  healthcare: "healthcare",
  // Covers the defense primes as well as pure drone/autonomy names, so
  // "drones" alone would mislabel a Lockheed or an RTX.
  drones: "defense and drones",
  index: "broad market funds",
  // Not "a mixed bag": this is the bucket for names the sector map doesn't
  // recognise, and as the label on a 51% slice it explained nothing.
  other: "other businesses",
};

function diversificationBandFor(score: number): ScoreBand {
  if (score < 25)
    return {
      label: "Concentrated",
      description: "A handful of holdings carry most of your portfolio.",
    };
  if (score < 50)
    return {
      label: "Moderate",
      description: "Somewhat spread out, but a few holdings still dominate.",
    };
  if (score < 75)
    return {
      label: "Spread out",
      description: "Broad enough that no single holding can sink it.",
    };
  return {
    label: "Broad",
    description: "As broad as an index fund. No single holding can wreck it.",
  };
}

function riskBandFor(score: number): ScoreBand {
  if (score < 30)
    return { label: "Conservative", description: "A calm mix. Nothing in it jumps around much." };
  if (score < 55)
    return { label: "Balanced", description: "A mix of steady and speculative." };
  if (score < 75)
    return { label: "Aggressive", description: "Leans towards holdings that swing hard." };
  return { label: "Fast-moving", description: "Most of the money sits in companies whose prices swing hard." };
}

function convictionBandFor(score: number): ScoreBand {
  if (score >= 50)
    return {
      label: "All-in",
      description: "One name is half the portfolio or more.",
    };
  if (score >= 35)
    return {
      label: "A big bet",
      description: "The largest position really decides the year.",
    };
  if (score >= 20)
    return {
      label: "Leaning",
      description: "A favourite, but not the whole story.",
    };
  return {
    label: "No single name",
    description: "Nothing dominates. The portfolio moves as a group.",
  };
}

/** Herfindahl-style concentration → effective position count → 0-100
 * diversification score. Index-themed tickers get credit for the spread
 * already inside the fund via INDEX_LOOKTHROUGH_SLOTS. */
function diversificationScoreFromHoldings(
  holdings: Array<{ ticker: string; value: number }>
): number {
  const total = holdings.reduce((s, h) => s + Math.max(0, h.value), 0);
  if (total <= 0 || holdings.length === 0) return 0;
  const hhi = holdings.reduce((s, h) => {
    const w = Math.max(0, h.value) / total;
    const theme = forecastThemeForTicker(h.ticker);
    const lookthrough = theme === "index" ? INDEX_LOOKTHROUGH_SLOTS : 1;
    return s + (w * w) / lookthrough;
  }, 0);
  if (hhi <= 0) return 100;
  const effectiveN = 1 / hhi;
  const score =
    ((effectiveN - 1) / (DIVERSIFICATION_CEILING_N - 1)) * 100;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Which archetype id a heavily-concentrated (non-crypto, non-index) book
 * lands on, keyed by its dominant theme — so a book that's two-thirds AI
 * computer builders reads as a different animal than one that's two-thirds
 * chip makers, instead of every concentrated book becoming a generic
 * "Panda". Themes without an entry (currently just "other") fall back to
 * "panda" in pickAnimal. */
const CONCENTRATED_ANIMAL_BY_THEME: Partial<Record<ForecastTheme, string>> = {
  ai_infra: "beaver",
  ai_power: "rhino",
  semi: "badger",
  drones: "scorpion",
  fintech: "otter",
  software: "chameleon",
  healthcare: "flamingo",
};

function archetype(id: string): AnimalArchetype {
  const found = ARCHETYPE_BY_ID.get(id);
  if (!found) throw new Error(`Unknown animal archetype id: ${id}`);
  return found;
}

/**
 * Same decision order as ANIMAL_BESTIARY. Keep the two in sync.
 *
 * The static bestiary copy describes the animal in general; it never
 * explains why *you* are one, which made the badge feel assigned at random.
 * Every branch below has a specific numeric trigger, so the reason is
 * already known at the moment of the decision. Returning it quotes the
 * viewer's own scores back at them instead of a generic personality read.
 */
function pickAnimal(opts: {
  diversification: number;
  risk: number;
  theme: ForecastTheme;
  specialistScore: number;
  themeCount: number;
  conviction: number;
  cashPct: number;
  positionCount: number;
}): { archetype: AnimalArchetype; why: string } {
  const {
    diversification,
    risk,
    theme,
    specialistScore,
    themeCount,
    conviction,
    cashPct,
    positionCount,
  } = opts;
  /*
    Every sentence below is built from these, so they have to be phrases
    that survive being dropped into one.

    They did not. The two scores were relabelled on the cards ("How jumpy",
    "How spread out") and the new label was pasted into the prose where the
    old noun had been, which produced "4 kinds of stocks across 18 names,
    and how jumpy 81/100 is hot" on a real member card. A label is not a
    noun phrase. Each sentence now says the reading out loud, the way a
    person reading the card aloud would.

    "Names" is gone with them. It is what a trading desk calls a company,
    and this card is read by somebody's mother.
  */
  const holdings =
    positionCount === 1 ? "1 holding" : `${positionCount} holdings`;
  const swings = `${risk} out of 100 for how much it swings`;
  const spread = `${diversification} out of 100 for how evenly it is spread`;
  const biggest = `the largest holding is ${conviction}% of it`;

  if (positionCount === 0) {
    return {
      archetype: archetype("hatchling"),
      why: "Nothing held yet, so there's nothing to read.",
    };
  }
  if (cashPct >= 28) {
    return {
      archetype: archetype("squirrel"),
      why: `Cash is ${cashPct}% of your portfolio. That cash is doing more work right now than any single holding in it.`,
    };
  }
  if (theme === "crypto" && specialistScore >= 35) {
    return {
      archetype: archetype("dragon"),
      why: `Crypto is ${specialistScore}% of what you hold, and this portfolio scores ${swings}. Nothing else in the field guide moves like that.`,
    };
  }
  if (
    specialistScore >= 68 &&
    theme !== "crypto" &&
    theme !== "index"
  ) {
    const id = CONCENTRATED_ANIMAL_BY_THEME[theme] ?? "panda";
    return {
      archetype: archetype(id),
      why: `${specialistScore}% of your portfolio sits in ${THEME_LABEL[theme]}. One kind of business, chosen on purpose.`,
    };
  }
  if (themeCount >= 3) {
    if (risk >= 65) {
      return {
        archetype: archetype("squid"),
        why: `${themeCount} kinds of business across ${holdings}, and it scores ${swings}. Spread out and fast-moving at the same time.`,
      };
    }
    if (diversification < 40) {
      return {
        archetype: archetype("crab"),
        why: `${themeCount} kinds of business across ${holdings}, but it scores only ${spread}, because ${biggest} and that one carries most of the year.`,
      };
    }
    return {
      archetype: archetype("octopus"),
      why: `${themeCount} kinds of business across ${holdings}. This is not one story. It is a handful of them running side by side.`,
    };
  }
  if (
    risk >= 72 &&
    (conviction >= 38 || (diversification < 28 && positionCount <= 6))
  ) {
    return {
      archetype: archetype("shark"),
      why: `It scores ${swings}, and ${biggest}. Across ${holdings}, one or two of them decide almost everything.`,
    };
  }
  if (risk >= 72) {
    return {
      archetype: archetype("wolf"),
      why: `It scores ${swings}, which is high, but also ${spread} across ${holdings}. No single holding gets to decide the year.`,
    };
  }
  if (positionCount <= 3) {
    return {
      archetype: archetype("falcon"),
      why: `Just ${holdings}. At that count every single one matters enormously, whichever way it goes.`,
    };
  }
  if (risk < 38 && (conviction >= 40 || diversification < 35)) {
    return {
      archetype: archetype("turtle"),
      why: `It scores only ${swings}, and ${biggest}. A short list of genuinely calm companies.`,
    };
  }
  if (risk < 42 && diversification >= 40) {
    return {
      archetype: archetype("owl"),
      why: `It scores ${swings}, which is at the calm end, and ${spread}. Calm and genuinely spread out, rather than calm and holding one thing.`,
    };
  }
  if (diversification >= 68 || (theme === "index" && specialistScore >= 50)) {
    return {
      archetype: archetype("elephant"),
      why: `It scores ${spread}, across ${holdings}. A portfolio spread this wide is hard to knock over.`,
    };
  }
  return {
    archetype: archetype("fox"),
    why: `It scores ${swings} and ${spread}, across ${themeCount} kinds of business, and ${biggest}. Middling on every measure, which is its own kind of choice.`,
  };
}

export function buildPortfolioPersonality(
  holdings: Array<{ ticker: string; value: number }>,
  cash = 0
): PortfolioPersonality {
  const positive = holdings.filter((h) => h.value > 0);
  const diversificationScore = diversificationScoreFromHoldings(positive);

  const total = positive.reduce((s, h) => s + h.value, 0);
  let riskScore = 50;
  let expectedAnnualReturnPct = 0;
  let maxDrawdownPct = 0;
  let convictionScore = 0;
  let topTicker: string | null = null;
  const themeWeights = new Map<ForecastTheme, number>();
  if (total > 0) {
    let weightedRisk = 0;
    let weightedReturn = 0;
    let weightedDrawdown = 0;
    let topValue = -1;
    for (const h of positive) {
      const theme = forecastThemeForTicker(h.ticker);
      const weight = h.value / total;
      weightedRisk += weight * (THEME_RISK_SCORE[theme] ?? 50);
      weightedReturn += weight * impliedAnnualReturnForTheme(theme) * 100;
      weightedDrawdown += weight * (THEME_MAX_DRAWDOWN_PCT[theme] ?? 40);
      themeWeights.set(theme, (themeWeights.get(theme) ?? 0) + weight);
      if (h.value > topValue) {
        topValue = h.value;
        topTicker = h.ticker;
        convictionScore = Math.round(weight * 100);
      }
    }
    riskScore = Math.round(weightedRisk);
    expectedAnnualReturnPct = Math.round(weightedReturn * 10) / 10;
    maxDrawdownPct = Math.round(weightedDrawdown);
  }

  let dominantTheme: ForecastTheme = "other";
  let bestWeight = -1;
  for (const [theme, weight] of themeWeights) {
    if (weight > bestWeight) {
      bestWeight = weight;
      dominantTheme = theme;
    }
  }
  const specialistScore =
    bestWeight > 0 ? Math.round(bestWeight * 100) : 0;
  const themeCount = [...themeWeights.values()].filter((w) => w >= 0.08).length;

  const nav = total + cash;
  const cashPct =
    Math.abs(nav) > 1e-9 ? Math.round((cash / nav) * 100) : cash > 0 ? 100 : 0;

  const beta = betaForRiskScore(riskScore);
  const capmExpectedPct =
    RISK_FREE_ANNUAL_PCT + beta * (MARKET_ANNUAL_RETURN_PCT - RISK_FREE_ANNUAL_PCT);
  const modeledAlphaPct =
    positive.length > 0
      ? Math.round((expectedAnnualReturnPct - capmExpectedPct) * 10) / 10
      : 0;

  const picked = pickAnimal({
    diversification: diversificationScore,
    risk: riskScore,
    theme: dominantTheme,
    specialistScore,
    themeCount,
    conviction: convictionScore,
    cashPct,
    positionCount: positive.length,
  });

  return {
    diversificationScore,
    diversificationBand: diversificationBandFor(diversificationScore),
    riskScore,
    riskBand: riskBandFor(riskScore),
    convictionScore,
    convictionBand: convictionBandFor(convictionScore),
    topTicker,
    specialistScore,
    themeCount,
    cashPct,
    dominantTheme,
    animal: picked.archetype.animal,
    animalEmoji: picked.archetype.emoji,
    tagline: `${picked.archetype.tagline} Mostly ${THEME_LABEL[dominantTheme]}.`,
    archetype: picked.archetype,
    whyThisAnimal: picked.why,
    expectedAnnualReturnPct,
    maxDrawdownPct,
    modeledAlphaPct,
  };
}
