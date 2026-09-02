/**
 * Product invariants from the Aug 2026 review.
 * Run: npx tsx scripts/test-invariants.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { buildBookInsights } from "../src/lib/book-insights";
import { forecastThemeForTicker } from "../src/lib/forecast-conviction";
import { usdToDisplay, displayToUsd } from "../src/lib/display-currency";
import { liveFundTodayMove, liveFundTotalValue } from "../src/lib/margus-fund-mark";
import {
  MARK_ASPECT,
  MARK_FACETS,
  MARK_VIEWBOX,
} from "../src/lib/brand/mark";
import {
  fundCopyBullets,
  numberedReportHeadline,
  serialFromNewest,
  stripReportSerialPrefix,
} from "../src/lib/fund-copy";
import {
  composeDailyFundPost,
  composeWeeklyFundPost,
} from "../src/lib/fund-x-copy";
import {
  applyYtdAnchor,
  downsampleToWeeks,
  paintBookNavSeries,
  reconstructAssumedNav,
  startNavFromYtdPct,
} from "../src/lib/market/assumed-nav";
import { playbookBullets } from "../src/lib/forecast-playbook";
import { niceScale } from "../src/components/mobile/BookNavChart";
import {
  buildFallbackForecastPlan,
  isFallbackForecastPlan,
  shouldAutoRefreshForecast,
  type ForecastPlan,
} from "../src/lib/forecast-plan";
import { FORECAST_YEARS, type ForecastModel } from "../src/lib/forecast";
import {
  cleanThesisBreak,
  isBigPulseMove,
  isGenericThesisBreak,
  pulseLeftHold,
  actionLabel,
  reconcilePulseCheck,
  shouldAutoPulseTicker,
  pulseTickerKey,
  sortPulseCandidates,
  statusLabel,
  verdictRepeatsTrim,
  verdictRepeatsSuggestion,
  scanLineBody,
  stripTrailingScanStop,
  buildFallbackPulseCheck,
  buildPulseScan,
  pulseNeedsExplainer,
  pulseScanLine,
  type PulseCheck,
} from "../src/lib/thesis-pulse";
import {
  beginBackgroundLlm,
  chatIsBusy,
  endBackgroundLlm,
  markChatActive,
} from "../src/lib/ai/llm-slots";
import { humanizeMargusTree, humanizeMargusText, pulseSuggestion } from "../src/lib/ai/humanize-copy";
import { communityInviteCopy, emptyBookNudgeHtml } from "../src/lib/email-letter";
import { looksLikePromptLeak } from "../src/lib/ai/prompt-leak";
import { fallbackWeeklyTake } from "../src/lib/weekly-margus";
import { noteTestAudience } from "../src/lib/note-cron";
import { SUPERADMIN_NOTE_EMAIL } from "../src/lib/auth/superadmin";
import {
  buildWeeklyLetter,
  weeklyLetterHtml,
  weeklyLetterText,
  weeklySubject,
} from "../src/lib/weekly-letter";
import { ADVICE_DISCLAIMER_SHORT } from "../src/lib/disclaimer";
import {
  inviteEmailAllowlist,
  parseInviteEmails,
  storeInviteEmails,
} from "../src/lib/invite-emails";
import {
  inviteAdminStatus,
  inviteLockLabel,
  inviteUsesLabel,
} from "../src/lib/community-invite-admin";
import {
  FEEDBACK_MONTH_MS,
  FEEDBACK_TO,
  formatMonthlyFeedbackText,
  isMonthlyFeedbackDue,
  MONTHLY_STEPS,
  parseManualFeedback,
  parseMonthlyFeedback,
  stepAnswerText,
} from "../src/lib/feedback";
import { parseSharePortfolioIds } from "../src/lib/community-share";
import {
  inviteFromLocation,
  inviteLandingCopy,
} from "../src/lib/invite-landing";
import { COMPOUND_TAB_ID, LAB_TAB_ID, PULSE_TAB_ID, todayDollarFor, buildOverview } from "../src/lib/overview";
import {
  shouldHideOptions,
  shouldSkipExperienceOnboarding,
  TIER_HIDDEN_LAB_TABS,
  TIER_HIDDEN_META_TABS,
} from "../src/lib/experience-tier";
import {
  AASA_ALIAS_EMAIL,
  AASA_PARTNER_EMAIL,
  AASA_PRIMARY_EMAIL,
  ACCOUNT_ALIAS_FALLBACK,
  collapseMailRecipients,
  collapseMembersByAlias,
  combineHouseholdNames,
  connectedEmailsFor,
  emailMatchesAllowlist,
  expandHouseholdUserIds,
  householdEmailsFor,
  KARUD_ALIAS_EMAIL,
  KARUD_PRIMARY_EMAIL,
  SEED_EMAIL_SLUGS,
} from "../src/lib/auth/identity";
import { ANIMAL_CARD_TONE, THEME_COLOR } from "../src/lib/portfolio-personality";
import type { ForecastTheme } from "../src/lib/forecast-conviction";
import { PALETTE } from "../src/lib/palette";
import {
  asSurpriseFraction,
  buildEarningsNote,
  medianAbs,
  priceRange,
  sessionReaction,
} from "../src/lib/earnings-brief";
import { insightWhen, isUsAfterCashClose, sessionMark } from "../src/lib/market-session";
import {
  lastCompletedUsSessionKey,
  pinQuotesToSessionClose,
  quotePollMs,
  quoteViewMaxAgeMs,
  usWeekMondayKey,
} from "../src/lib/market/session";
import {
  isLegacyHost,
  isNonPublicHost,
  normalizeHostname,
  safeInternalPath,
} from "../src/lib/site-url";
import { validateServerEnv } from "../src/lib/env-schema";
import {
  isDirectPostgresUrl,
  isSupabasePoolerUrl,
} from "../src/lib/supabase/env";
import { mergeQuotes } from "../src/lib/quote-cache";
import {
  currentDuelSessionKey,
  duelCanSettle,
  duelSessionCopy,
  duelSessionLabel,
} from "../src/lib/daily-duel";
import {
  closeOnDate,
  portfolioCostValue,
  portfolioValueOnDate,
  priorNySessionKey,
  quotesCoverDate,
  sheetReturnPathSince,
} from "../src/lib/sheet-mark";
import { sanitizeFundWatchlist } from "../src/lib/fund-watchlist";
import {
  EMPTY_BOOK_NUDGE_AFTER_DAYS,
  emptyBookNudgeSubject,
  emptyBookNudgeText,
  hasLiveHoldings,
  isEmptyBookNudgeDue,
  shouldSkipEmptyBookNudge,
} from "../src/lib/empty-book-nudge";
import {
  ALWAYS_POPULAR_TICKERS,
  FALLBACK_POPULAR_TICKERS,
  POPULAR_TICKER_COUNT,
  currentPopularMonth,
  sanitizePopularTickers,
} from "../src/lib/popular-tickers";
import {
  localTickerSuggestions,
  looksLikeTickerQuery,
  mergeTickerSuggestions,
  pickTickerSuggestion,
} from "../src/lib/market/ticker-search";
import {
  listingAmountToUsd,
  listingCurrenciesAreMixed,
  listingCurrency,
  listingCurrencyFromTicker,
  normalizeListedPrice,
  usdPerMapFromFx,
  usdToListingAmount,
} from "../src/lib/listing-currency";
import { macroFromQuotesPayload } from "../src/lib/market/macro-numbers";
import {
  balticYahooSymbol,
  normalizeYahooTicker,
  resolveImportTicker,
  tickerStem,
  yahooQuoteCandidates,
} from "../src/lib/ticker";
import { watchLook } from "../src/lib/watch-look";
import {
  formatEarningsCalendarBlock,
  resolveYahooEarnings,
} from "../src/lib/market/earnings-dates";
import { buildCcSystemPrompt, type CcChatContext } from "../src/lib/ai/cc-advisor";
import { buildTrendStory } from "../src/lib/market/trend-story";
import {
  NIGHTLY_SNAPSHOT_WINDOW,
  snapshotSheetsForOwner,
} from "../src/lib/book-snapshot";
import { sheetCashBalance, tracksTradeCash } from "../src/lib/cash-balance";
import { importCashDelta, tradeCashDelta } from "../src/lib/cash-delta";
import { upsertHolding } from "../src/lib/demo-store";
import {
  cagr,
  finiteNumber,
  MAX_SAFE_MONEY,
  mean,
  roundMoney,
  safeDiv,
  sumMoney,
  weightedMean,
} from "../src/lib/money";
import { cashtag, NO_VALUE, percent, signedPercent, splitMoveTint } from "../src/lib/format";
import { sanitizeTickerDraft, sanitizeTickerQuery } from "../src/lib/input-guard";
import { parseDecimal } from "../src/lib/number-input";
import { formatMoneyFromRaw } from "../src/lib/format-live-input";
import { pearson } from "../src/lib/correlation";
import { priorPriceFromChange, synthesizeSparkline } from "../src/lib/market/sparkline";
import { concentrationRead, themeBreakdown } from "../src/lib/allocation";
import { analyzePortfolioShock } from "../src/lib/book-shock";
import { enrichHoldings, buildSnapshot } from "../src/lib/calculations";
import { effectiveAnnualRate, calculateCompound } from "../src/lib/compound-interest";
import {
  filledCardColumns,
  filledGridColumns,
} from "../src/lib/filled-grid";
import {
  allowClassAction,
  classifyHoldingWrite,
  classifyImportWrite,
  holdingWriteActions,
  parseClassPlan,
  parseStartingCash,
  realBookPortfolios,
  ownedBookPortfolios,
  isPaperClassOnly,
  resolveClassroomTrade,
  startPeriodNow,
} from "../src/lib/classroom";
import {
  CLASS_TEMPLATES,
  formatCashDigits,
  parseCashDigits,
} from "../src/lib/class-templates";

function check(partial: Partial<PulseCheck>): PulseCheck {
  return {
    ticker: "TEST",
    situation: ["x"],
    moveReason: "y",
    thesisStatus: "intact",
    earningsNote: "",
    action: "hold",
    trimPct: null,
    addLevel: "",
    verdict: "z",
    ...partial,
  };
}

let failed = 0;
function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`fail  ${name}`);
    console.error(err);
  }
}

/*
 * Rewritten. The old rule was "every animal gets a colour nobody else has",
 * which stopped being true on purpose: ten theme animals now take the
 * colour of the theme they represent, so a Beaver card and the "AI
 * computer builders" slice of the allocation bar match without anyone
 * keeping two lists in sync, and the remaining eleven are graded by
 * temperament, which is what they actually describe.
 *
 * Asserting uniqueness again would force those pairings apart. What is
 * worth protecting is the property the old test was really after -- that
 * the colours carry meaning and are not assigned at random -- so that is
 * what this checks now.
 */
run("power animal colours follow theme, then temperament", () => {
  const bars = Object.values(ANIMAL_CARD_TONE).map((t) => t.bar);

  /*
   * The property that actually matters, and the reason uniqueness was
   * given up: a theme animal's card paints from the *same* CSS variable as
   * that theme's slice of the allocation bar. Checked against THEME_COLOR
   * itself, so the two lists cannot drift apart silently -- which is the
   * whole thing the design note promises.
   */
  const themeAnimal: Record<string, ForecastTheme> = {
    beaver: "ai_infra",
    rhino: "ai_power",
    badger: "semi",
    scorpion: "drones",
    otter: "fintech",
    chameleon: "software",
    flamingo: "healthcare",
    dragon: "crypto",
    elephant: "index",
  };
  for (const [animal, theme] of Object.entries(themeAnimal)) {
    const cssVar = THEME_COLOR[theme];
    assert.equal(
      ANIMAL_CARD_TONE[animal]?.bar,
      `bg-[${cssVar}]`,
      `${animal} should paint from ${theme}'s colour (${cssVar})`
    );
  }

  // The non-theme animals share exactly three temperament grades, so a new
  // animal cannot quietly introduce a fourth.
  const steady = ["hatchling", "squirrel", "turtle", "owl"];
  const balanced = ["octopus", "crab", "falcon", "fox"];
  const hot = ["squid", "shark", "wolf"];
  for (const group of [steady, balanced, hot]) {
    const first = ANIMAL_CARD_TONE[group[0]!];
    for (const id of group) {
      assert.equal(ANIMAL_CARD_TONE[id], first, `${id} shares its group's tone`);
    }
  }
  assert.equal(
    new Set([steady, balanced, hot].map((g) => ANIMAL_CARD_TONE[g[0]!]!.bar)).size,
    3,
    "the three temperament grades stay visually distinct"
  );

  // Every animal still resolves to a real tone -- no silent fallthrough.
  assert.ok(bars.every((bar) => typeof bar === "string" && bar.length > 0));
  assert.ok(!bars.some((bar) => /brand|mustard|gain|loss/.test(bar)));
  assert.equal(PALETTE.brand, "#d4bc79");
  assert.equal(PALETTE.bronze, "#d4bc79");
  assert.equal(PALETTE.teal, "#2dd4bf");
  assert.equal(PALETTE.steel, "#60a5fa");
  assert.equal(PALETTE.gain, "#34d399");
  assert.equal(PALETTE.loss, "#f43f5e");
  const community = readFileSync(
    join(process.cwd(), "src/components/CommunityView.tsx"),
    "utf8"
  );
  assert.doesNotMatch(community, /border-gain\/40 bg-gain\/10/);
  /*
   * The neutral animals used to be `border-border bg-muted`. Flat muted
   * fills went with the glass pass, and the tones now mix from
   * `--cat-neutral`, so what is asserted is the property that made the old
   * markup right: an animal is a category, never a verdict, so no tone may
   * borrow the gain, loss or destructive tokens.
   */
  const tones = readFileSync(
    join(process.cwd(), "src/lib/portfolio-personality.ts"),
    "utf8"
  );
  const toneBlock = tones.slice(tones.indexOf("const TONE"), tones.indexOf("ANIMAL_CARD_TONE"));
  assert.match(toneBlock, /--cat-neutral/);
  assert.doesNotMatch(toneBlock, /\b(?:bg|border|text)-(?:gain|loss|destructive)\b/);
});

run("options UI hides on an explicit no, and only on an explicit no", () => {
  // Told us they know options -> show.
  assert.equal(shouldHideOptions(true), false);
  // Told us they do not -> hide. This is the protection.
  assert.equal(shouldHideOptions(false), true);
  /*
   * Never asked -> show. Onboarding is skipped for anyone who already owns
   * something (`shouldSkipExperienceOnboarding`, holdingsCount > 0), so
   * null is the permanent state of every existing holder. Hiding on null
   * would take covered calls away from all of them at once, silently.
   */
  assert.equal(shouldHideOptions(null), false);
});

run("Karud household is two accounts on one book, like Martin and Amanda", () => {
  assert.equal(ACCOUNT_ALIAS_FALLBACK[KARUD_ALIAS_EMAIL], undefined);
  assert.deepEqual(SEED_EMAIL_SLUGS[KARUD_ALIAS_EMAIL], ["karud"]);
  assert.deepEqual(SEED_EMAIL_SLUGS[KARUD_PRIMARY_EMAIL], ["karud"]);
  assert.equal(
    combineHouseholdNames(["Martin Aasa", "Amanda Aasa"]),
    "Martin and Amanda Aasa"
  );
  assert.equal(
    combineHouseholdNames([
      "Rasmus-Richard Marjapuu",
      "Karoliine Karu",
    ]),
    "Rasmus and Karoliine"
  );
  assert.equal(
    shouldSkipExperienceOnboarding({
      holdingsCount: 0,
      portfolioSlugs: ["karud"],
    }),
    true
  );
  assert.equal(
    shouldSkipExperienceOnboarding({
      holdingsCount: 8,
      portfolioSlugs: ["my-portfolio"],
    }),
    true
  );
  assert.equal(
    shouldSkipExperienceOnboarding({
      holdingsCount: 0,
      portfolioSlugs: [],
    }),
    false
  );

  const people = collapseMembersByAlias(
    [
      {
        user_id: "rasmus-id",
        role: "member",
        joined_at: "2026-01-01T00:00:00.000Z",
        profile: {
          id: "rasmus-id",
          email: KARUD_PRIMARY_EMAIL,
          display_name: "Rasmus-Richard Marjapuu",
          avatar_url: null,
        },
      },
      {
        user_id: "karoliine-id",
        role: "member",
        joined_at: "2026-08-16T00:00:00.000Z",
        profile: {
          id: "karoliine-id",
          email: KARUD_ALIAS_EMAIL,
          display_name: "Karoliine Karu",
          avatar_url: null,
        },
      },
    ],
    "karoliine-id"
  );
  assert.equal(people.length, 2);
  assert.equal(
    people.find((p) => p.person_id === "karoliine-id")?.is_you,
    true
  );
  assert.equal(
    people.find((p) => p.person_id === "rasmus-id")?.is_you,
    false
  );

  const seedSql = readFileSync(
    join(process.cwd(), "scripts/seed-ownership.sql"),
    "utf8"
  );
  assert.match(seedSql, /karukaroliine99@gmail.com.*karud/s);
  assert.doesNotMatch(
    seedSql,
    /karukaroliine99@gmail.com.*rasmusmarjapuu@gmail.com/s
  );
  const dropAlias = readdirSync(join(process.cwd(), "supabase/migrations"))
    .filter((f) => f.includes("052_karud_two_accounts"))
    .map((f) =>
      readFileSync(join(process.cwd(), "supabase/migrations", f), "utf8")
    )
    .join("\n");
  assert.match(dropAlias, /delete from public.portfell_account_aliases/i);
  assert.match(dropAlias, /karukaroliine99@gmail.com/);
  const ensure = readFileSync(
    join(process.cwd(), "src/lib/auth/ensure-profile.ts"),
    "utf8"
  );
  assert.match(ensure, /SEED_EMAIL_SLUGS/);
  assert.match(ensure, /portfell_sync_household_community_memberships/);
  assert.deepEqual(householdEmailsFor(KARUD_ALIAS_EMAIL).sort(), [
    KARUD_ALIAS_EMAIL,
    KARUD_PRIMARY_EMAIL,
  ].sort());
  assert.deepEqual(householdEmailsFor(AASA_PARTNER_EMAIL).sort(), [
    AASA_ALIAS_EMAIL,
    AASA_PARTNER_EMAIL,
    AASA_PRIMARY_EMAIL,
  ].sort());
  assert.deepEqual(householdEmailsFor("liinaanette@gmail.com"), [
    "liinaanette@gmail.com",
  ]);
  const paired = expandHouseholdUserIds(
    ["karoliine-id"],
    [
      { id: "karoliine-id", email: KARUD_ALIAS_EMAIL },
      { id: "rasmus-id", email: KARUD_PRIMARY_EMAIL },
      { id: "amanda-id", email: AASA_PARTNER_EMAIL },
    ]
  );
  assert.equal(paired.length, 2);
  assert.ok(paired.includes("karoliine-id"));
  assert.ok(paired.includes("rasmus-id"));
  assert.ok(!paired.includes("amanda-id"));
  const aasaPaired = expandHouseholdUserIds(
    ["martin-gmail"],
    [
      { id: "martin-gmail", email: AASA_ALIAS_EMAIL },
      { id: "martin-work", email: AASA_PRIMARY_EMAIL },
      { id: "amanda-id", email: AASA_PARTNER_EMAIL },
    ]
  );
  assert.equal(aasaPaired.length, 3);
  const pairSql = readdirSync(join(process.cwd(), "supabase/migrations"))
    .filter((f) => f.includes("household_community_pairs"))
    .map((f) =>
      readFileSync(join(process.cwd(), "supabase/migrations", f), "utf8")
    )
    .join("\n");
  assert.match(pairSql, /portfell_household_groups/);
  assert.match(pairSql, /amandalucas400@gmail.com/);
  assert.match(pairSql, /rasmusmarjapuu@gmail.com/);
  assert.match(pairSql, /kind = 'classroom'/);
  assert.match(pairSql, /portfell_mirror_household_community_member/);
  const dash = readFileSync(
    join(process.cwd(), "src/components/Dashboard.tsx"),
    "utf8"
  );
  assert.match(dash, /shouldSkipExperienceOnboarding/);
  assert.match(dash, /skipExperienceOnboarding/);
  assert.doesNotMatch(dash, /ExperienceOnboardingModal/);
  assert.match(dash, /BOOK_REFRESH_EVENT/);
  const tierSrc = readFileSync(
    join(process.cwd(), "src/lib/experience-tier.ts"),
    "utf8"
  );
  assert.doesNotMatch(tierSrc, /inACircle/);
  const shell = readFileSync(
    join(process.cwd(), "src/components/WorkspaceShell.tsx"),
    "utf8"
  );
  /*
   * `ExperienceOnboardingGate` became `WelcomeTourGate` on 2026-08-23, and
   * the question it asks changed with the name: not "have they been
   * onboarded" but "have they seen *this* walkthrough". Holdings no longer
   * decide whether it opens, only which screens are in it, and a paper
   * class still skips the add-your-holdings screen.
   */
  const onboardGate = readFileSync(
    join(process.cwd(), "src/components/WelcomeTourGate.tsx"),
    "utf8"
  );
  assert.match(shell, /WelcomeTourGate/);
  assert.match(onboardGate, /isPaperClassOnly/);
  assert.match(onboardGate, /WELCOME_TOUR_VERSION/);
  assert.doesNotMatch(onboardGate, /inACircle/);
  assert.doesNotMatch(onboardGate, /communityListHasCircle/);
  const joinPage = readFileSync(
    join(process.cwd(), "src/app/communities/join/page.tsx"),
    "utf8"
  );
  assert.match(joinPage, /rememberJoinedCommunity/);
  assert.match(joinPage, /saveLastCircleId/);
});

run("circle invite joins still get the same onboarding as Home", () => {
  assert.equal(
    shouldSkipExperienceOnboarding({
      holdingsCount: 0,
      portfolioSlugs: ["my-portfolio"],
    }),
    false
  );
  const gate = readFileSync(
    join(process.cwd(), "src/components/WelcomeTourGate.tsx"),
    "utf8"
  );
  const shell = readFileSync(
    join(process.cwd(), "src/components/WorkspaceShell.tsx"),
    "utf8"
  );
  /*
   * The old gate had to say out loud that a Circle invite does not count
   * as having been onboarded, because it decided from what the account
   * looked like. `WelcomeTourGate` decides from one thing, the version the
   * account has seen, so joining a circle cannot skip anybody by
   * construction. That is the stronger form of the same rule, and what is
   * asserted is that nothing about a circle, a community or a holding
   * count has crept back into the decision.
   */
  assert.match(shell, /<WelcomeTourGate/);
  assert.match(gate, /isPaperClassOnly/);
  assert.match(gate, /tourIsDue\(/);
  assert.match(gate, /saveSeenTourVersion\(WELCOME_TOUR_VERSION\)/);
  const decision = gate.slice(gate.indexOf("const [plan, setPlan]"));
  assert.doesNotMatch(decision, /inACircle|communityListHasCircle/);
  assert.doesNotMatch(decision, /shouldSkipExperienceOnboarding/);
});

run("earnings surprise parses both fractions and percent points", () => {
  assert.equal(asSurpriseFraction(0.041), 0.041);
  assert.ok(Math.abs((asSurpriseFraction("4.1") ?? 0) - 0.041) < 1e-10);
  assert.ok(Math.abs((asSurpriseFraction(4.1) ?? 0) - 0.041) < 1e-10);
});

run("earnings range is spot plus or minus the expected move", () => {
  const { low, high } = priceRange(200, 0.1);
  assert.equal(low, 180);
  assert.ok(Math.abs(high - 220) < 1e-9);
  assert.equal(medianAbs([-0.02, 0.08, -0.01, 0.04]), 0.03);
});

run("after-hours earnings reaction uses the next session", () => {
  const bars = [
    { date: "2026-05-19", close: 220 },
    { date: "2026-05-20", close: 223 },
    { date: "2026-05-21", close: 219 },
  ];
  const afterHours = new Date("2026-05-20T20:20:00.000Z");
  const move = sessionReaction(bars, afterHours);
  assert.ok(move != null);
  assert.equal(Math.round(move! * 1000) / 1000, Math.round((219 / 223 - 1) * 1000) / 1000);
});

run("earnings note flags a stretched run-in without sounding like a slogan", () => {
  const note = buildEarningsNote({
    expectedMovePct: 0.07,
    runupPct: 0.18,
    beatCount: 4,
    printCount: 4,
    typicalAbsMovePct: 0.05,
  });
  /*
    Both figures have to be in the sentence: how far it has already run, and
    how far it usually moves on the day. That is the whole point of the note.

    This used to also assert the word "lighten", from a clause that read
    "this is when people lighten a bit before the print". That is a trade
    instruction, which the guardrails in MARGUS_PERSONA forbid on every
    surface, and "the print" is desk vocabulary besides. So the assertion is
    inverted: the note states the two facts and leaves the decision alone.
  */
  assert.match(note, /18%/);
  assert.match(note, /±7%/);
  assert.doesNotMatch(note, /lighten|trim|add here|sell some/i);
  assert.doesNotMatch(note, /—/);
});

run("closed session keeps last print vs yesterday close, including leftover after-hours", () => {
  const closedAh = sessionMark({
    marketState: "CLOSED",
    regularPrice: 100,
    postPrice: 102,
    prePrice: null,
    previousClose: 90,
  });
  assert.equal(closedAh.price, 102);
  assert.equal(closedAh.previousClose, 90);

  const closedFlat = sessionMark({
    marketState: "CLOSED",
    regularPrice: 100,
    postPrice: null,
    prePrice: null,
    previousClose: 90,
  });
  assert.equal(closedFlat.price, 100);
  assert.equal(closedFlat.previousClose, 90);

  const pre = sessionMark({
    marketState: "PRE",
    regularPrice: 100,
    postPrice: null,
    prePrice: 101,
    previousClose: 90,
  });
  assert.equal(pre.price, 101);
  assert.equal(pre.previousClose, 100);

  const preBeforeFirstTick = sessionMark({
    marketState: "PRE",
    regularPrice: 100,
    postPrice: 102,
    prePrice: null,
    previousClose: 90,
  });
  assert.equal(preBeforeFirstTick.price, 102);
  assert.equal(preBeforeFirstTick.previousClose, 100);

  const closedPrefersAhOverMorningPre = sessionMark({
    marketState: "CLOSED",
    regularPrice: 100,
    postPrice: 102,
    prePrice: 103,
    previousClose: 90,
  });
  assert.equal(closedPrefersAhOverMorningPre.price, 102);
  assert.equal(closedPrefersAhOverMorningPre.previousClose, 90);

  const closedIgnoresStaleMorningPre = sessionMark({
    marketState: "CLOSED",
    regularPrice: 100,
    postPrice: null,
    prePrice: 103,
    previousClose: 90,
  });
  assert.equal(closedIgnoresStaleMorningPre.price, 100);
  assert.equal(closedIgnoresStaleMorningPre.previousClose, 90);

  const closedUnflattenAh = sessionMark({
    marketState: "CLOSED",
    regularPrice: 100,
    postPrice: 102,
    prePrice: null,
    previousClose: 102,
  });
  assert.equal(closedUnflattenAh.price, 102);
  assert.equal(closedUnflattenAh.previousClose, 100);

  const preUnflatten = sessionMark({
    marketState: "PRE",
    regularPrice: 101,
    postPrice: null,
    prePrice: 101,
    previousClose: 100,
  });
  assert.equal(preUnflatten.price, 101);
  assert.equal(preUnflatten.previousClose, 100);
});

run("flat overnight quotes keep the last real previous close", () => {
  const prev = {
    NVDA: {
      ticker: "NVDA",
      price: 225.3,
      change: 1.21,
      changePercent: 0.0054,
      previousClose: 224.09,
      sparkline: [],
      marketState: "CLOSED",
      preMarketPrice: null,
      preMarketChange: null,
      preMarketChangePercent: null,
      postMarketPrice: null,
      postMarketChange: null,
      postMarketChangePercent: null,
    },
  };
  const incoming = {
    NVDA: {
      ...prev.NVDA,
      price: 225.3,
      change: 0,
      changePercent: 0,
      previousClose: 225.3,
    },
  };
  const merged = mergeQuotes(prev, incoming);
  assert.equal(merged.NVDA?.previousClose, 224.09);
  assert.ok((merged.NVDA?.change ?? 0) > 1);

  const regularIncoming = {
    NVDA: {
      ...prev.NVDA,
      marketState: "REGULAR",
      price: 225.3,
      change: 0,
      changePercent: 0,
      previousClose: 225.3,
    },
  };
  const regularMerged = mergeQuotes(prev, regularIncoming);
  assert.equal(regularMerged.NVDA?.previousClose, 225.3);
});

run("quote polls stay live through pre-market and after hours", () => {
  // Friday 14 Aug 2026, America/New_York is EDT (UTC-4). Asserted as a
  // shape rather than as five constants: the cadence is a curve now, and an
  // invariant pinned to today's numbers protects nothing and blocks every
  // future tuning pass. What must stay true is the ordering.
  const preMarket = quotePollMs(new Date("2026-08-14T12:00:00Z")); // 08:00 ET
  const open = quotePollMs(new Date("2026-08-14T15:00:00Z")); // 11:00 ET
  const afterHours = quotePollMs(new Date("2026-08-14T21:00:00Z")); // 17:00 ET
  const overnight = quotePollMs(new Date("2026-08-18T06:00:00Z")); // 02:00 ET Tue
  const weekend = quotePollMs(new Date("2026-08-15T14:00:00Z")); // 10:00 ET Sat

  // Anything Yahoo carries a print for polls at least once a minute.
  assert.ok(preMarket <= 60_000, `pre-market poll ${preMarket}ms`);
  assert.ok(open <= 60_000, `open poll ${open}ms`);
  assert.ok(afterHours <= 2 * 60_000, `after-hours poll ${afterHours}ms`);

  // The regular session is never slower than the extended sessions around it.
  assert.ok(open <= preMarket && open <= afterHours);

  // The windows where no US venue prints back off, and the weekend, where
  // nothing prints for two whole days, backs off furthest.
  assert.ok(overnight > afterHours, `overnight ${overnight} <= AH ${afterHours}`);
  assert.ok(weekend >= overnight, `weekend ${weekend} < overnight ${overnight}`);

  // The cadence tightens again before 04:00 so the day's first pre-market
  // print is not up to a full overnight cycle late.
  const beforePre = quotePollMs(new Date("2026-08-18T07:30:00Z")); // 03:30 ET
  assert.ok(beforePre < overnight, `03:30 ${beforePre} >= overnight ${overnight}`);

  // A reader on the screen never waits on the background cadence. This is
  // the whole reason the two numbers are allowed to diverge.
  for (const t of [
    "2026-08-14T15:00:00Z",
    "2026-08-14T21:00:00Z",
    "2026-08-18T06:00:00Z",
    "2026-08-15T14:00:00Z",
  ]) {
    const when = new Date(t);
    assert.ok(
      quoteViewMaxAgeMs(when) <= quotePollMs(when),
      `view age ${quoteViewMaxAgeMs(when)} > poll ${quotePollMs(when)} at ${t}`
    );
  }
});

run("fund reports date to the last closed US session, not Tallinn tomorrow", () => {
  assert.equal(
    lastCompletedUsSessionKey(new Date("2026-08-17T21:30:00Z")),
    "2026-08-17"
  );
  assert.equal(
    lastCompletedUsSessionKey(new Date("2026-08-18T14:30:00Z")),
    "2026-08-17"
  );
  assert.equal(
    lastCompletedUsSessionKey(new Date("2026-08-14T21:30:00Z")),
    "2026-08-14"
  );
  assert.equal(
    lastCompletedUsSessionKey(new Date("2026-08-15T11:00:00Z")),
    "2026-08-14"
  );
  const live = {
    NVDA: {
      ticker: "NVDA",
      price: 220,
      change: 2.5,
      changePercent: 0.011,
      previousClose: 217.5,
      sparkline: [],
      marketState: "REGULAR",
      preMarketPrice: null,
      preMarketChange: null,
      preMarketChangePercent: null,
      postMarketPrice: null,
      postMarketChange: null,
      postMarketChangePercent: null,
    },
  };
  const pinned = pinQuotesToSessionClose(
    live,
    "2026-08-17",
    new Date("2026-08-18T14:30:00Z")
  );
  assert.equal(pinned.NVDA?.price, 217.5);
  const sameDay = pinQuotesToSessionClose(
    live,
    "2026-08-18",
    new Date("2026-08-18T21:30:00Z")
  );
  assert.equal(sameDay.NVDA?.price, 220);
  assert.equal(usWeekMondayKey("2026-08-17"), "2026-08-17");
  assert.equal(usWeekMondayKey("2026-08-14"), "2026-08-10");
});

run("sheet mark as-of a pin date uses that session's close, not last night's", () => {
  assert.equal(priorNySessionKey("2026-08-12"), "2026-08-11");
  assert.equal(priorNySessionKey("2026-08-10"), "2026-08-07");

  const q = {
    ticker: "NBIS",
    price: 260,
    change: 5,
    changePercent: 0.02,
    previousClose: 255,
    sparkline: [],
    marketState: "PRE",
    preMarketPrice: 260,
    preMarketChange: 5,
    preMarketChangePercent: 0.02,
    postMarketPrice: null,
    postMarketChange: null,
    postMarketChangePercent: null,
    dailyCloses: [
      { date: "2026-08-11", close: 200 },
      { date: "2026-08-12", close: 250 },
      { date: "2026-08-13", close: 255 },
    ],
  };
  assert.equal(closeOnDate(q, "2026-08-11"), 200);
  const meta = { id: "aasad", cash_balance: 0 };
  const holdings = [
    { portfolio_id: "aasad", ticker: "NBIS", shares: 500, buy_price: 110 },
  ];
  const asOf = portfolioValueOnDate(meta, holdings, { NBIS: q }, "2026-08-11");
  assert.equal(asOf, 100_000);
  const liveCost = portfolioCostValue(meta, holdings);
  assert.equal(liveCost, 55_000);
  assert.equal(quotesCoverDate({ NBIS: q }, holdings, "aasad", "2026-08-11"), true);
  assert.equal(quotesCoverDate({ NBIS: q }, holdings, "aasad", "2026-01-01"), false);

  const path = sheetReturnPathSince({
    labels: ["2026-08-11", "2026-08-12", "2026-08-13", "Live"],
    baselineDate: "2026-08-12",
    baselineValue: 100_000,
    liveValue: 130_000,
    meta,
    holdings,
    quotes: { NBIS: q },
  });
  assert.deepEqual(
    path.map((n) => Math.round(n * 1000) / 1000),
    [0, 0.25, 0.275, 0.3]
  );
});

run("fund today move is live NAV minus last snapshot", () => {
  const move = liveFundTodayMove({ liveTotal: 110, lastReportValue: 100 });
  assert.equal(move.todayDollar, 10);
  assert.equal(move.todayPct, 0.1);
  const missing = liveFundTodayMove({ liveTotal: 110, lastReportValue: null });
  assert.equal(missing.todayDollar, 0);
  assert.equal(missing.todayPct, null);
});

run("fund thesis and exit plans split into short bullets", () => {
  const thesis = fundCopyBullets(
    "Data cloud consumption accelerating with GenAI workloads; remaining performance obligations (RPO) up >50% YoY, signaling durable multi-year expansion as enterprises unify analytics and AI pipelines."
  );
  assert.deepEqual(thesis, [
    "Data cloud consumption accelerating with GenAI workloads",
    "RPO up >50% YoY",
    "Durable multi-year expansion",
    "Enterprises unify analytics and AI pipelines",
  ]);
  const exit = fundCopyBullets(
    "Sell if product revenue growth decelerates below 25% YoY for two quarters or if adjusted FCF margin fails to exceed 20% by FY28."
  );
  assert.deepEqual(exit, [
    "Product revenue growth below 25% YoY for two quarters",
    "Adjusted FCF margin below 20% by FY28",
  ]);
});

run("fund report headlines number with digits, not spelled-out days", () => {
  assert.equal(
    stripReportSerialPrefix("Day one: built an 8-position paper portfolio"),
    "Built an 8-position paper portfolio"
  );
  assert.equal(
    stripReportSerialPrefix("Day 1: Built an 8-position paper portfolio"),
    "Built an 8-position paper portfolio"
  );
  assert.equal(
    stripReportSerialPrefix("AI infrastructure steadies while risk appetite nudges higher"),
    "AI infrastructure steadies while risk appetite nudges higher"
  );
  assert.equal(serialFromNewest(3, 0), 3);
  assert.equal(serialFromNewest(3, 2), 1);
  assert.equal(
    numberedReportHeadline(
      "Day one: built an 8-position paper portfolio",
      "Day",
      1
    ),
    "Day 1: Built an 8-position paper portfolio"
  );
  assert.equal(
    numberedReportHeadline(
      "AI infrastructure steadies while risk appetite nudges higher",
      "Day",
      2
    ),
    "Day 2: AI infrastructure steadies while risk appetite nudges higher"
  );
  assert.equal(
    numberedReportHeadline("Quiet week, held the book", "Week", 1),
    "Week 1: Quiet week, held your portfolio"
  );
});

run("Upside Fund X posts put P&L, ending value, and S&P on the same stretch", () => {
  const daily = composeDailyFundPost({
    serial: 3,
    daily: { dollar: 180.54, pct: 0.00361, spyPct: 0.004488 },
    weekly: { dollar: 1240, pct: 0.0253, spyPct: 0.011 },
    total: { dollar: 194.25, pct: 0.003885, spyPct: 0.0085 },
    balance: 50194.25,
    actions: [],
    movers: [
      { ticker: "NVDA", changePct: 0.03 },
      { ticker: "MSFT", changePct: -0.008 },
      { ticker: "AMD", changePct: -0.02 },
    ],
    radar: [
      { ticker: "NVDA", waitFor: "earnings next week" },
      { ticker: "BTC", waitFor: "" },
      { ticker: "RKLB", waitFor: "launches this month" },
    ],
  });
  assert.match(daily, /^Day 3: held\n\n/);
  assert.match(daily, /🔴 Day \+\$181 \(\+0\.36%\) · \$SPY \+0\.45%/);
  assert.match(daily, /🟢 Wk \+\$1,240 \(\+2\.53%\) · \$SPY \+1\.10%/);
  assert.match(daily, /🔴 Tot \+\$194 \(\+0\.39%\) · \$SPY \+0\.85%/);
  assert.match(daily, /\n\n💼 \$50,194\n/);
  assert.match(daily, /\$NVDA \+3\.0% 🟢/);
  assert.match(daily, /\$AMD -2\.0% 🔴/);
  assert.match(daily, /\$MSFT -0\.8% 🔴/);
  assert.match(
    daily,
    /👀 \$NVDA earnings next week · \$BTC · \$RKLB launches this month/
  );
  assert.ok(daily.length <= 280);
  assert.doesNotMatch(daily, /\u2014/);
  assert.doesNotMatch(daily, /UPSIDE FUND/i);

  const firstDay = composeDailyFundPost({
    serial: 1,
    daily: { dollar: 0, pct: 0, spyPct: null },
    weekly: { dollar: 0, pct: 0, spyPct: null },
    total: { dollar: 0, pct: 0, spyPct: null },
    balance: 50000,
    actions: [{ type: "buy", ticker: "NVDA" }],
  });
  assert.match(firstDay, /^Day 1: bought nvda/);
  assert.match(firstDay, /🟢 Day \$0 \(0\.00%\)/);
  assert.doesNotMatch(firstDay, /\$SPY/);
  assert.ok(firstDay.length <= 280);

  const traded = composeDailyFundPost({
    serial: 7,
    daily: { dollar: -640, pct: -0.012, spyPct: -0.004 },
    weekly: { dollar: -640, pct: -0.012, spyPct: -0.004 },
    total: { dollar: -640, pct: -0.012, spyPct: -0.004 },
    balance: 49360,
    actions: [
      { type: "exit", ticker: "MSFT" },
      { type: "buy", ticker: "NVDA" },
      { type: "hold", ticker: "AMD" },
    ],
  });
  assert.match(traded, /^Day 7: sold msft, bought nvda/);
  assert.doesNotMatch(traded, /Thesis intact/);
  assert.ok(traded.length <= 280);

  const weekly = composeWeeklyFundPost({
    serial: 1,
    daily: { dollar: 180.54, pct: 0.00361, spyPct: 0.004488 },
    weekly: { dollar: 194.25, pct: 0.003885, spyPct: 0.007005 },
    total: { dollar: 194.25, pct: 0.003885, spyPct: 0.007005 },
    balance: 50194.25,
    actions: [],
  });
  assert.match(weekly, /^Week 1: held/);
  assert.match(weekly, /🔴 Wk \+\$194 \(\+0\.39%\) · \$SPY \+0\.70%/);
  assert.ok(weekly.length <= 280);
});

run("fund cron composes an X post but only sends it when switched on", () => {
  const route = readFileSync(
    join(process.cwd(), "src/app/api/cron/margus-fund/route.ts"),
    "utf8"
  );
  assert.match(route, /composeDailyFundPost/);
  assert.match(route, /composeWeeklyFundPost/);
  assert.match(route, /maybeTweetFundUpdate/);
  /*
   * Auto-posting is opt-in, and credentials being present is NOT the
   * opt-in. Keys stay configured across a paused plan, so gating on
   * `xPostingConfigured` alone meant every run burned a request to be told
   * 402 and wrote a red row into /admin. The gate is `xPostingEnabled()`,
   * which additionally requires X_POSTING_ENABLED=true, set deliberately
   * once there are credits to spend.
   */
  assert.match(route, /xPostingEnabled/);
  // Gating on "keys exist" alone must not come back.
  assert.doesNotMatch(route, /xPostingConfigured/);
  const xPost = readFileSync(
    join(process.cwd(), "src/lib/x-post.ts"),
    "utf8"
  );
  assert.match(xPost, /X_POSTING_ENABLED/);
  assert.match(
    xPost,
    /xPostingConfigured\(\) && env\("X_POSTING_ENABLED"\)/,
    "enabled must require BOTH credentials and the explicit switch"
  );
  assert.match(route, /lastCompletedUsSessionKey/);
  assert.match(route, /deadlineAt/);
  assert.match(route, /maxDuration = 300/);
  assert.doesNotMatch(route, /todayKeyInTz/);
  const crons = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
  assert.match(crons, /30 23 \* \* 1-5/);
  assert.match(crons, /0 11 \* \* 1-6/);
  const page = readFileSync(
    join(process.cwd(), "src/components/UpsidePortfolioPage.tsx"),
    "utf8"
  );
  assert.match(page, /FUND_X_URL/);
  assert.match(page, /Daily notes on X/);
});

run("forecast add/trim lines split into bullets", () => {
  assert.deepEqual(playbookBullets("Hold, no add"), []);
  assert.deepEqual(playbookBullets("No mix change"), []);
  assert.deepEqual(playbookBullets("Same mix"), []);
  assert.deepEqual(playbookBullets("Nothing, just hold"), []);
  const sleeve = playbookBullets(
    "AI power / $CEG or $VST (~0% to 5%): initiate on pullbacks to build exposure before next grid interconnect auctions."
  );
  assert.equal(sleeve.length, 1);
  assert.equal(sleeve[0]?.head, "AI power / $CEG or $VST (~0% to 5%)");
  assert.match(sleeve[0]?.detail ?? "", /Initiate on pullbacks/);
  const packed = playbookBullets(
    "$NBIS (40.5% -> 35%) / $CRWV (36.8% -> 32%): trim into pre-earnings run-ups above $285 and $120 to curb cluster concentration."
  );
  assert.equal(packed.length, 1);
  assert.equal(
    packed[0]?.head,
    "$NBIS · 40.5% → 35% · $CRWV · 36.8% → 32%"
  );
  assert.match(packed[0]?.detail ?? "", /Trim into pre-earnings/);
  const listed = playbookBullets(
    "$RKLB (14% -> 9%): fade the launch print; SaaS sleeve (~3%): start a small sleeve on a red day"
  );
  assert.equal(listed.length, 2);
  assert.equal(listed[0]?.head, "$RKLB · 14% → 9%");
  assert.equal(listed[1]?.head, "SaaS sleeve (~3%)");
});

run("trim verdict that restates the size line is dropped", () => {
  assert.equal(
    verdictRepeatsTrim("Trim about 20% into the strength. Keep the rest.", 20),
    true
  );
  assert.equal(
    verdictRepeatsTrim("Trim about 20% so it isn't a third of the book.", 20),
    false
  );
  assert.equal(
    verdictRepeatsTrim(
      "Trimming about 20% after a jump like this wouldn't be a bad idea.",
      20
    ),
    true
  );
  assert.equal(
    verdictRepeatsSuggestion("Price is above its recent range.", {
      action: "trim",
      trimPct: 15,
    }),
    true
  );
  assert.equal(
    verdictRepeatsSuggestion(
      "Price is above its recent range after its 6.3% jump tied to Burry.",
      { action: "trim", trimPct: 15 }
    ),
    false
  );
});

run("trim on a run is Thesis intact", () => {
  const next = reconcilePulseCheck(
    check({ thesisStatus: "watch", action: "trim", trimPct: 10 })
  );
  assert.equal(next.thesisStatus, "intact");
  assert.equal(next.action, "trim");
  assert.equal(next.trimPct, 10);
  const prompt = readFileSync(
    join(process.cwd(), "src/app/api/thesis/pulse/route.ts"),
    "utf8"
  );
  const fallback = readFileSync(
    join(process.cwd(), "src/lib/thesis-pulse.ts"),
    "utf8"
  );
  assert.match(prompt, /Never mark Thesis watch just because the price went up/);
  assert.match(fallback, /price is up more than it usually moves in a day/i);
  assert.doesNotMatch(
    fallback,
    /euphoric[\s\S]{0,400}thesisStatus: "watch"/
  );
});

run("broken + trim becomes sell", () => {
  const next = reconcilePulseCheck(
    check({ thesisStatus: "broken", action: "trim", trimPct: 20 })
  );
  assert.equal(next.action, "sell");
  assert.equal(next.trimPct, null);
});

run("broken + hold becomes watch", () => {
  const next = reconcilePulseCheck(
    check({ thesisStatus: "broken", action: "hold" })
  );
  assert.equal(next.thesisStatus, "watch");
  assert.equal(next.action, "hold");
});

run("broken + add becomes watch", () => {
  const next = reconcilePulseCheck(
    check({ thesisStatus: "broken", action: "add" })
  );
  assert.equal(next.thesisStatus, "watch");
});

run("title-cased Pulse enums no longer paint intact as at-risk", () => {
  const next = reconcilePulseCheck(
    check({
      thesisStatus: "Intact" as PulseCheck["thesisStatus"],
      action: "Hold" as PulseCheck["action"],
      situation: [
        "No stress signal from today's move.",
        "Position stays in normal monitoring mode.",
      ],
      verdict: "Hold and reassess on new catalysts, earnings, or thesis-changing news.",
    })
  );
  assert.equal(next.thesisStatus, "intact");
  assert.equal(next.action, "hold");
  assert.equal(statusLabel(next.thesisStatus), "Thesis intact");
  assert.equal(statusLabel("Intact"), "Thesis intact");
  assert.equal(statusLabel("broken"), "Thesis broken");
  assert.equal(statusLabel("watch"), "Thesis watch");
});

run("humanize does not title-case Pulse enums", () => {
  const tree = humanizeMargusTree({
    thesisStatus: "intact",
    action: "hold",
    verdict: "it's important to note that the dip is noise.",
  });
  assert.equal(tree.thesisStatus, "intact");
  assert.equal(tree.action, "hold");
  assert.equal(tree.verdict, "The dip is noise.");
});

run("humanize still recapitalizes after stripping a leading opener", () => {
  assert.equal(
    humanizeMargusText("it's important to note that the dip is noise."),
    "The dip is noise."
  );
});

run("humanize kills leftover market slang", () => {
  assert.equal(
    humanizeMargusText("The thesis is intact on the dip."),
    "The thesis is intact on the dip."
  );
  assert.match(
    humanizeMargusText("Add an AI power sleeve next to the compute names."),
    /electricity-for-AI names/i
  );
  assert.doesNotMatch(
    humanizeMargusText("A calmer sleeve next to it keeps one delay from being the whole year."),
    /\bsleeve\b/i
  );
  assert.doesNotMatch(
    humanizeMargusText("Tape read from the move and the book while the model was busy."),
    /\btape\b/i
  );
  assert.doesNotMatch(
    humanizeMargusText("Tape read from the move and the book while the model was busy."),
    /Couldn't get a full model|model was busy/i
  );
  assert.equal(
    humanizeMargusText("$NBIS is 35% of the book."),
    "$NBIS is 35% of your portfolio."
  );
  assert.equal(
    humanizeMargusText("Most of this sheet is chip makers."),
    "Most of your portfolio is chip makers."
  );
  assert.equal(
    humanizeMargusText("Paste from a spreadsheet."),
    "Paste from a spreadsheet."
  );
  assert.doesNotMatch(humanizeMargusText("Do not add today."), /do not add/i);
  assert.match(
    humanizeMargusText("If it runs, sell some. Don't chase."),
    /above its recent range/i
  );
  assert.doesNotMatch(
    humanizeMargusText("If it runs, sell some. Don't chase."),
    /sell some/i
  );
  assert.doesNotMatch(
    humanizeMargusText("Look to add if it dips."),
    /look to add/i
  );
  assert.match(
    humanizeMargusText("Trim about 15% into this strength."),
    /above its recent range/i
  );
  assert.doesNotMatch(
    humanizeMargusText("Trim about 15% into this strength."),
    /Trim 15%/i
  );
  assert.doesNotMatch(
    humanizeMargusText("Trim about 15% into this strength."),
    /one check|into this strength/i
  );
  assert.doesNotMatch(
    humanizeMargusText("One check: selling about 20% into this strength."),
    /one check|into this strength/i
  );
  assert.match(
    humanizeMargusText("Add now ~$80"),
    /below its recent range, near \$80/i
  );
  assert.match(
    humanizeMargusText("Let the move play out, but do not buy more here or chase it."),
    /above its recent range/i
  );
  assert.doesNotMatch(
    humanizeMargusText("No trades before the open today."),
    /no trades/i
  );
  const trimWhy = humanizeMargusText(
    "Trim 15% on NBIS after its 6.3% jump tied to Burry's NVDA call concerns and its AI GPU revenue."
  );
  assert.match(trimWhy, /above its recent range/i);
  assert.match(trimWhy, /Burry/i);
  assert.doesNotMatch(trimWhy, /\btrim(?:ming)?\s+\d/i);
  const addWhy = humanizeMargusText(
    "Add the dip on DRAM near $52, then revisit if the price drops to $48, because AI-driven memory demand is intact."
  );
  assert.match(addWhy, /below its recent range/i);
  assert.match(addWhy, /\$52/);
  assert.match(addWhy, /AI-driven memory/i);
  assert.doesNotMatch(addWhy, /\badd the dip\b/i);
  assert.doesNotMatch(addWhy, /\brevisit if\b/i);
  const watchWhy = humanizeMargusText(
    "Reddit's dip is a warning sign; keep an eye on user growth and ad revenue"
  );
  assert.match(watchWhy, /user growth/i);
  assert.doesNotMatch(watchWhy, /keep an eye/i);
  assert.match(
    humanizeMargusText("Add an AI power sleeve next to the compute names."),
    /electricity-for-AI names/i
  );
  assert.doesNotMatch(
    humanizeMargusText("Add an AI power sleeve next to the compute names."),
    /below its recent range/i
  );
  assert.match(
    pulseSuggestion({ action: "trim", trimPct: 20 }),
    /Price is above its recent range/
  );
  assert.doesNotMatch(
    pulseSuggestion({ action: "trim", trimPct: 20 }),
    /opportunity|risk profiles/i
  );
  assert.match(
    pulseSuggestion({ action: "add", addLevel: "around $80" }),
    /Price is below its recent range, near \$80/
  );
  assert.match(
    pulseSuggestion({ action: "sell" }),
    /reason you own this no longer matches/i
  );
  assert.match(
    pulseSuggestion({ action: "watch" }),
    /not enough price history/i
  );
  assert.match(
    pulseSuggestion({ action: "hold" }),
    /Price is inside its recent range/
  );
  assert.equal(
    pulseSuggestion({ action: "trim", trimPct: 20, ticker: "NBIS" }),
    pulseSuggestion({ action: "trim", trimPct: 20, ticker: "NBIS" })
  );
});

run("the Sunday letter never ships the writing brief", () => {
  const leak =
    "We need to produce a Sunday note block, 4-6 short sentences, plain English, no greetings/sign-off, no em-dash, no banned words, tickers as cashtags. Use only names from facts: NBIS, CRWV. The instruction says Thesis is fine.";
  assert.equal(looksLikePromptLeak(leak), true);
  assert.equal(
    looksLikePromptLeak(
      "$NBIS did the week. Chip makers did the work. I'd wait on $AVGO if the thesis still holds."
    ),
    false
  );
});

run("the Sunday letter is the only scheduled email, and it earns its sections", () => {
  const blank = {
    change: 0,
    changePercent: 0,
    previousClose: 100,
    sparkline: [] as number[],
    marketState: null,
    preMarketPrice: null,
    preMarketChange: null,
    preMarketChangePercent: null,
    postMarketPrice: null,
    postMarketChange: null,
    postMarketChangePercent: null,
  };
  const q = (ticker: string, price: number) => ({
    ...blank,
    ticker,
    price,
    previousClose: price,
  });

  const letter = buildWeeklyLetter({
    name: "Martin Aasa",
    cash: 0,
    holdings: [
      { ticker: "NBIS", shares: 500, buy_price: 109.96 },
      { ticker: "CRWV", shares: 100, buy_price: 83.27 },
      { ticker: "RKLB", shares: 200, buy_price: 68.65 },
    ],
    quotes: {
      NBIS: q("NBIS", 120),
      CRWV: q("CRWV", 80),
      RKLB: q("RKLB", 70),
    },
    weekReturns: {
      NBIS: { start: 100, end: 120, pct: 20 },
      CRWV: { start: 90, end: 80, pct: -11.1 },
      RKLB: { start: 70, end: 70, pct: 0 },
    },
    conviction: {
      CRWV: {
        level: 3,
        thesis: "Rented GPUs at scale.",
        updatedAt: "2026-08-01T00:00:00.000Z",
        stamps: [
          {
            at: "2026-08-15T00:00:00.000Z",
            verdict: "v",
            line: "l",
            action: "sell",
            thesisStatus: "broken",
          },
        ],
      },
    },
    watchlist: ["ASTS", "NBIS"],
    watchQuotes: { ASTS: q("ASTS", 40), NBIS: q("NBIS", 120) },
    watchWeekReturns: {
      // Fractions, the way `fetchWeekReturns` reports them: -0.2 is -20%.
      ASTS: { start: 50, end: 40, pct: -0.2 },
      NBIS: { start: 100, end: 120, pct: 0.2 },
    },
    earnings: [
      { ticker: "NBIS", date: "2026-08-25", days: 6 },
      { ticker: "ZZZZ", date: "2026-08-25", days: 6 },
    ],
    now: new Date("2026-08-23T06:00:00.000Z"),
  });

  // The week's arithmetic, not today's session.
  assert.equal(letter.nameCount, 3);
  assert.ok(letter.weekPct != null && letter.weekPct > 0);

  // A Pulse verdict the reader already saw drives the suggestion, and a
  // broken thesis outranks everything else on that ticker.
  const sell = letter.suggestions.find((s) => s.ticker === "CRWV");
  assert.ok(sell, "expected a suggestion for CRWV");
  assert.equal(sell.kind, "sell");
  assert.equal(sell.source, "pulse");

  // Concentration is named from plain arithmetic. NBIS is 60000 of 81000.
  const trim = letter.suggestions.find(
    (s) => s.ticker === "NBIS" && s.kind === "trim"
  );
  assert.ok(trim, "expected NBIS flagged as an outsized position");
  assert.equal(trim.source, "size");

  // Watchlist: every name the reader does not already hold, whichever way
  // it went. NBIS is held, so it is not a watchlist row.
  assert.deepEqual(
    letter.watchRows.map((w) => w.ticker),
    ["ASTS"]
  );
  // Only a real fall is an idea the prose may raise.
  assert.equal(letter.watchRows[0].dipped, true);
  assert.equal(Math.round(letter.watchRows[0].pct), -20);

  // The calendar only mentions names the reader owns or watches.
  assert.equal(letter.weekAhead.length, 1);
  assert.match(letter.weekAhead[0], /\$NBIS/);

  // The fallback voice ships a real letter when the model is unreachable.
  const take = fallbackWeeklyTake(letter);
  // Four or five short paragraphs, the same shape the model is asked for,
  // so a reader cannot tell which one wrote their letter.
  const paras = take.split(/\n{2,}/);
  assert.ok(
    paras.length >= 3 && paras.length <= 6,
    `fallback should be 3-6 paragraphs, got ${paras.length}`
  );
  // The figure is defused in the very next sentence, in dollars per $100.
  assert.match(paras[0], /out of every \$100/);
  /*
    And it ends on how the rest of the week's holdings compared, without
    telling the reader to do anything. Asserted as the rule rather than as
    one exact sentence: the previous version pinned the literal string
    "quiet relative to last week", so rewording the letter to say companies
    instead of names broke a check that was never about that.
  */
  const closer = paras[paras.length - 1]!;
  assert.match(closer, /\bquiet\b/i, "the fallback closes on the quiet rest");
  assert.match(closer, /last week/i, "and compares it with last week");
  assert.match(take, /[.!?]$/);
  assert.doesNotMatch(take, /\bwe\b|\bour\b|\bus\b/i);
  // Banned market slang never reaches a reader (AGENTS.md).
  assert.doesNotMatch(
    take,
    /\bsleeve\b|\btape\b|\bdry powder\b|\bdrawdown\b|\brotation\b|\brisk-on\b/i
  );

  letter.margus = take;
  const html = weeklyLetterHtml(letter);
  // Every section the letter promises is actually rendered.
  assert.match(html, /Your week/);
  assert.match(html, /What moved/);
  // One heading per kind of suggestion, and no outer kicker repeating the
  // word over cards that already carry it.
  assert.match(html, /Reason no longer matches|Above recent range or a large share|Below recent range/);
  assert.match(html, /On your watchlist/);
  assert.match(html, /Next week/);
  // It is painted in the app's own palette, not the old brass letterhead.
  assert.match(html, /#000000/);
  assert.match(html, /#d4bc79/);
  assert.doesNotMatch(html, /#d6ad69|#f4f1ea|#08090c/);
  // Not financial advice stays on the surface that gives opinions.
  assert.ok(html.includes(ADVICE_DISCLAIMER_SHORT));

  const text = weeklyLetterText(letter);
  assert.match(text, /What moved/);
  assert.match(text, /Reason no longer matches|Above recent range or a large share|Below recent range/);

  assert.match(weeklySubject(letter), /Your week/);
});

run("the weekday and after-close emails are gone, not just unscheduled", () => {
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
    crons: { path: string }[];
  };
  const paths = vercel.crons.map((c) => c.path);
  assert.ok(paths.includes("/api/cron/sunday-note"));
  assert.ok(!paths.some((p) => /morning-note|close-note/.test(p)));
  assert.ok(!existsSync("src/app/api/cron/morning-note"));
  assert.ok(!existsSync("src/app/api/cron/close-note"));
  assert.ok(!existsSync("src/lib/note-report.ts"));
  assert.ok(!existsSync("src/lib/morning-email.ts"));
  // The account screen and onboarding both ask about one email, not three.
  const account = readFileSync("src/components/AccountPage.tsx", "utf8");
  assert.match(account, /weekly-note/);
  assert.doesNotMatch(account, /note-morning|noteMorning/);
  const onboarding = readFileSync("src/components/WelcomeTour.tsx", "utf8");
  assert.match(onboarding, /weekly-note/);
  assert.doesNotMatch(onboarding, /noteMorning/);
});

run("manual note cron stays on Martin", () => {
  const vercel = noteTestAudience(
    new Request("https://upsidelab.app/api/cron/sunday-note", {
      headers: { "x-vercel-cron": "1" },
    })
  );
  assert.equal(vercel.onlyEmails, undefined);
  const manual = noteTestAudience(
    new Request("https://upsidelab.app/api/cron/sunday-note")
  );
  assert.deepEqual(manual.onlyEmails, [SUPERADMIN_NOTE_EMAIL]);
  assert.equal(SUPERADMIN_NOTE_EMAIL, AASA_PRIMARY_EMAIL);
  const me = noteTestAudience(
    new Request("https://upsidelab.app/api/cron/sunday-note?only=me")
  );
  assert.deepEqual(me.onlyEmails, [AASA_PRIMARY_EMAIL]);
  const sunday = readFileSync("src/app/api/cron/sunday-note/route.ts", "utf8");
  assert.match(sunday, /noteTestAudience\(req\)/);
});

run("connected emails send notes to the first address only", () => {
  const collapsed = collapseMailRecipients([
    { id: "gmail", email: AASA_ALIAS_EMAIL, name: "Martin Gmail" },
    { id: "work", email: AASA_PRIMARY_EMAIL, name: "Martin Work" },
    { id: "amanda", email: AASA_PARTNER_EMAIL, name: "Amanda" },
  ]);
  assert.equal(collapsed.length, 2);
  assert.deepEqual(
    collapsed.map((r) => r.to).sort(),
    [AASA_PARTNER_EMAIL, AASA_PRIMARY_EMAIL].sort()
  );
  assert.ok(!collapsed.some((r) => r.to === AASA_ALIAS_EMAIL));
  const martin = collapsed.find((r) => r.to === AASA_PRIMARY_EMAIL);
  assert.equal(martin?.profile.id, "work");

  const aliasOnly = collapseMailRecipients([
    { id: "gmail", email: AASA_ALIAS_EMAIL },
  ]);
  assert.deepEqual(
    aliasOnly.map((r) => r.to),
    [AASA_PRIMARY_EMAIL]
  );

  assert.deepEqual(connectedEmailsFor(AASA_ALIAS_EMAIL), [
    AASA_PRIMARY_EMAIL,
    AASA_ALIAS_EMAIL,
  ]);
  const allow = new Set([AASA_PRIMARY_EMAIL]);
  assert.equal(emailMatchesAllowlist(AASA_ALIAS_EMAIL, allow), true);
  assert.equal(emailMatchesAllowlist(AASA_PARTNER_EMAIL, allow), false);

  const cron = readFileSync(
    join(process.cwd(), "src/lib/note-cron.ts"),
    "utf8"
  );
  const nudge = readFileSync(
    join(process.cwd(), "src/lib/empty-book-nudge.ts"),
    "utf8"
  );
  assert.match(cron, /collapseMailRecipients/);
  assert.match(nudge, /collapseMailRecipients/);
  assert.match(nudge, /connectedEmailsFor/);
});

run("novice hides Lab, never Pulse or Growth", () => {
  assert.deepEqual(TIER_HIDDEN_META_TABS.novice, [LAB_TAB_ID]);
  assert.ok(!TIER_HIDDEN_META_TABS.novice.includes(PULSE_TAB_ID));
  assert.ok(!TIER_HIDDEN_META_TABS.novice.includes(COMPOUND_TAB_ID));
  assert.deepEqual(TIER_HIDDEN_META_TABS.investor, []);
  assert.deepEqual(TIER_HIDDEN_META_TABS.advanced, []);
  assert.deepEqual(TIER_HIDDEN_LAB_TABS.novice, ["risk"]);
  assert.deepEqual(TIER_HIDDEN_LAB_TABS.investor, ["risk"]);
  assert.deepEqual(TIER_HIDDEN_LAB_TABS.advanced, []);
});

run("FX conversion falls back to 1:1 and rounds to cents", () => {
  assert.equal(usdToDisplay(100.004, "USD", null), 100);
  assert.equal(usdToDisplay(100, "EUR", null), 100);
  assert.equal(usdToDisplay(100, "EUR", 0), 100);
  assert.equal(displayToUsd(50, "EUR", null), 50);
});

run("home keeps Fund and Communities in view", () => {
  const overview = readFileSync("src/components/OverviewDashboard.tsx", "utf8");
  const world = readFileSync("src/components/HomeWorld.tsx", "utf8");
  assert.ok(overview.includes("HomeWorld"));
  assert.ok(!overview.includes("CommunitiesSpotlight"));
  assert.ok(world.includes("Around Upside Lab"));
  assert.ok(world.includes("Upside Fund"));
  assert.ok(world.includes("Circle"));
  assert.doesNotMatch(world, /fundOnly/);
});

run("community books lead with today's percent, not dollar size", () => {
  const community = readFileSync(
    join(process.cwd(), "src/components/CommunityTodayBoard.tsx"),
    "utf8"
  );
  const roster = readFileSync(
    join(process.cwd(), "src/components/ClassroomRoster.tsx"),
    "utf8"
  );
  const cards = readFileSync(
    join(process.cwd(), "src/components/CircleCards.tsx"),
    "utf8"
  );
  const readOnly = cards.slice(cards.indexOf("export function ReadOnlyHoldings"));
  assert.match(readOnly, /label="Today"/);
  assert.match(readOnly, /signedPercent\(todayPct\)/);
  assert.match(readOnly, /sub=\{signedCurrency\(todayDollar\)\}/);
  assert.match(community, /Ranked by today&apos;s percent, not dollar size/);
  assert.match(roster, /signedPercent\(vsStartPct\)/);
  assert.match(roster, /signedPercent\(m\.todayPct\)/);
});

run("circle awards are a grid of cards, not a flat divided list", () => {
  const community = readFileSync(
    join(process.cwd(), "src/components/CircleHome.tsx"),
    "utf8"
  );
  const awardsStart = community.indexOf("Community superlatives");
  const awardsEnd = community.indexOf("<CommunityTodayBoard", awardsStart);
  const awards = community.slice(awardsStart, awardsEnd);
  assert.match(awards, /grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3/);
  // Each award is a glass-well card, not a divided list row. Asserted by
  // the classes that carry that meaning rather than by their exact order:
  // the tiles became <button>s (they select a member), which legitimately
  // inserted `w-full` into the middle of the old pinned sequence.
  for (const cls of ["glass-well", "flex-col", "gap-1.5", "rounded-lg", "p-3"]) {
    assert.ok(
      awards.includes(cls),
      `circle award tiles should still carry ${cls}`
    );
  }
  assert.doesNotMatch(awards, /<ItemGroup/);
  assert.doesNotMatch(awards, /<ItemSeparator/);
  assert.doesNotMatch(awards, /bg-pink-500/);
});

run("insight prose never greens the letters up inside group", () => {
  const none = (s: string) =>
    splitMoveTint(s)
      .filter((span) => span.tone)
      .map((span) => span.text);
  assert.deepEqual(
    none(
      "If electricity stays tight, this group can stall. That group is most of the money."
    ),
    []
  );
  assert.deepEqual(none("update the group and show up later"), []);
  assert.deepEqual(none("Chin up. Download the sheet."), []);
  assert.deepEqual(none("$RKLB is up 6.8% today."), ["up 6.8%"]);
  assert.deepEqual(none("it is down about 2.1% this week"), ["down about 2.1%"]);
  assert.deepEqual(none("the sparkline is trending up lately"), ["trending up"]);
  assert.equal(
    splitMoveTint("$RKLB is up 6.8% today.").find((span) => span.tone)?.tone,
    "up"
  );
  const panel = readFileSync(
    join(process.cwd(), "src/components/ui/Panel.tsx"),
    "utf8"
  );
  assert.match(panel, /splitMoveTint/);
  assert.doesNotMatch(panel, /\(up\|down\)\(\s\+about/);
});

run("product is Upside Lab on upsidelab.app", () => {
  const product = readFileSync("src/lib/product.ts", "utf8");
  assert.match(product, /PRODUCT_NAME = "Upside Lab"/);
  assert.match(product, /PRODUCT_DOMAIN = "upsidelab.app"/);
  const site = readFileSync("src/lib/site-url.ts", "utf8");
  assert.match(site, /PRODUCT_DOMAIN/);
  assert.match(site, /LEGACY_HOSTS/);
  assert.match(site, /UPSIDE_CANONICAL_HOST/);
  assert.match(site, /safeInternalPath/);
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  assert.match(layout, /PRODUCT_NAME/);
  const envEx = readFileSync(".env.example", "utf8");
  assert.match(envEx, /upsidelab\.app/);
  assert.doesNotMatch(envEx, /jwjezdgggrgdgfsovgtx/);
  const nextCfg = readFileSync("next.config.ts", "utf8");
  assert.match(nextCfg, /poweredByHeader: false/);
  assert.match(nextCfg, /STATIC_SECURITY_HEADERS/);
  const securityHeaders = readFileSync("src/lib/security-headers.ts", "utf8");
  assert.match(securityHeaders, /X-Frame-Options/);
  assert.match(securityHeaders, /Strict-Transport-Security/);
  assert.match(securityHeaders, /X-Content-Type-Options/);
  assert.match(securityHeaders, /default-src 'self'/);
  assert.match(securityHeaders, /buildContentSecurityPolicy/);
  const callback = readFileSync("src/app/auth/callback/route.ts", "utf8");
  assert.match(callback, /safeInternalPath/);
  const proxy = readFileSync("src/proxy.ts", "utf8");
  assert.match(proxy, /redirectTarget/);
  assert.match(proxy, /Content-Security-Policy/);
  assert.match(proxy, /limitMutationRequest/);
  assert.match(proxy, /limitPublicMarketRequest/);
  /*
    The forged-request gate covers every mutation, not only `/api/*`. It sat
    inside the `isApi` branch, which left `/auth/email/complete` (a POST on a
    page path that mints a session) as the one mutating route in the app with
    nothing in front of it. Assert the check runs before that branch opens,
    so the next POST added outside `/api/` is covered without anybody
    remembering this.
  */
  const gateAt = proxy.indexOf("isSameOriginMutation(request)");
  const apiBranchAt = proxy.indexOf("if (isApi) {");
  assert.ok(gateAt > 0, "the proxy still gates forged mutations");
  assert.ok(
    apiBranchAt < 0 || gateAt < apiBranchAt,
    "the forged-request gate must run for every mutation, not just /api/*"
  );
  const rateLimit = readFileSync("src/lib/rate-limit.ts", "utf8");
  assert.match(rateLimit, /limitMutationRequest/);
  assert.match(rateLimit, /limitPublicMarketRequest/);
  const durable = readFileSync("src/lib/rate-limit-durable.ts", "utf8");
  assert.match(durable, /portfell_rate_take/);
  const parseBody = readFileSync("src/lib/parse-json-body.ts", "utf8");
  assert.match(parseBody, /schema\.safeParse/);
  const demoLock = readFileSync("src/app/api/demo/lock/route.ts", "utf8");
  // The dev-only demo lock refuses on any deployed environment, not just
  // NODE_ENV=production, so a misconfigured preview can't expose it either.
  assert.match(demoLock, /isDeployed/);
  assert.match(demoLock, /VERCEL_ENV/);
});

run("public pages ship OG cards and private rooms are noindex", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const robots = readFileSync("src/app/robots.ts", "utf8");
  const sitemap = readFileSync("src/app/sitemap.ts", "utf8");
  const nextCfg = readFileSync("next.config.ts", "utf8");
  const home = readFileSync("src/app/page.tsx", "utf8");
  const login = readFileSync("src/app/login/page.tsx", "utf8");
  const communities = readFileSync("src/app/communities/page.tsx", "utf8");
  const lab = readFileSync("src/app/lab/page.tsx", "utf8");
  const margus = readFileSync("src/app/margus/page.tsx", "utf8");
  const seo = readFileSync("src/lib/seo-routes.ts", "utf8");
  const meta = readFileSync("src/lib/site-metadata.ts", "utf8");
  const manifest = readFileSync("src/app/manifest.ts", "utf8");

  assert.match(layout, /metadataBase/);
  assert.match(layout, /openGraph/);
  assert.match(layout, /apple-touch-icon\.png/);
  const icons = readFileSync("scripts/generate-pwa-icons.mjs", "utf8");
  /*
    The icon generator draws from the same geometry the app draws from,
    rather than rasterising a PNG somebody exported once, and the Apple touch
    icon comes off the square `app` preset.

    This used to assert the opposite: that the generator composited a rounded
    mask over every output with `dest-in`. That baked a 22.5 percent corner
    radius into the touch icon, which iOS then rounds again -- the tell is a
    thin dark crescent inside each corner. The rounding now lives in the SVG,
    and only on the shapes nothing else masks. See docs/BRAND_MARK.md.
  */
  assert.match(icons, /brand\/mark/);
  assert.match(icons, /opaque\("app", 180/);
  assert.doesNotMatch(icons, /dest-in/);
  assert.doesNotMatch(icons, /rimSvg/);
  assert.doesNotMatch(icons, /stroke="url\(#g\)"/);
  assert.match(home, /HOME_METADATA/);
  assert.match(login, /LOGIN_METADATA/);
  assert.match(communities, /COMMUNITIES_METADATA/);
  assert.match(lab, /privatePageMetadata/);
  assert.match(margus, /privatePageMetadata/);
  assert.match(meta, /index: false/);
  assert.match(meta, /follow: false/);
  assert.match(seo, /"\/lab"/);
  assert.match(seo, /"\/margus"/);
  /*
    The sign-in pages and handlers live under `/auth` and are not rooms;
    the prefix is what gives every one of them the noindex header and the
    robots line. `/dashboard` and `/forecast` have no page at all: the
    proxy 308s them to `/` before any page could run, so a page file or a
    noindex entry for them describes a response nobody ever receives.
  */
  assert.match(seo, /"\/auth"/);
  assert.doesNotMatch(seo, /"\/dashboard"/);
  assert.doesNotMatch(seo, /"\/forecast"/);
  assert.ok(!existsSync("src/app/dashboard/page.tsx"));
  assert.ok(!existsSync("src/app/forecast/page.tsx"));
  /*
    Both halves of robots.txt are derived from `seo-routes.ts`, and the
    sitemap is keyed off the same list.

    This used to assert that the literal `/communities$` appeared in
    `robots.ts`. It did, because the five public paths were written out by
    hand there and again in the sitemap, which is the duplication
    `seo-routes.ts` exists to prevent; the assertion was holding that
    duplication in place. What matters is that neither file can name a
    path the list does not, so that is what is asserted here, and the
    generated output (the `/communities$` anchor included) is checked
    against the real rules in `src/lib/seo-consistency.test.ts`.
  */
  assert.match(robots, /PRIVATE_NOINDEX_PATHS/);
  assert.match(robots, /PUBLIC_INDEX_PATHS/);
  assert.match(sitemap, /PUBLIC_INDEX_PATHS/);
  assert.match(nextCfg, /X-Robots-Tag/);
  assert.match(nextCfg, /PRIVATE_NOINDEX_PATHS/);
  assert.match(manifest, /icon-192\.png/);
  assert.match(manifest, /icon-512-maskable\.png/);
});

run("canonical host strips www and rejects off-site next paths", () => {
  assert.equal(normalizeHostname("https://www.upsidelab.app/"), "www.upsidelab.app");
  assert.ok(isLegacyHost("www.upsidelab.app"));
  assert.ok(isLegacyHost("https://upside-upthink-solutions.vercel.app"));
  assert.ok(!isLegacyHost("upsidelab.app"));
  assert.ok(isNonPublicHost("ci.upsidelab.test"));
  assert.ok(!isNonPublicHost("upsidelab.app"));
  assert.equal(safeInternalPath("https://evil.example"), "/");
  assert.equal(safeInternalPath("//evil.example"), "/");
  assert.equal(safeInternalPath("/lab?tab=pulse"), "/lab?tab=pulse");
  assert.equal(safeInternalPath("lab"), "/");
});

run("set env values that are not https are rejected", () => {
  const issues = validateServerEnv({
    NEXT_PUBLIC_SUPABASE_URL: "http://insecure.example",
    UPSIDE_CANONICAL_HOST: "not a host",
  });
  assert.ok(issues.some((i) => i.key === "NEXT_PUBLIC_SUPABASE_URL"));
  assert.ok(issues.some((i) => i.key === "UPSIDE_CANONICAL_HOST"));
  assert.equal(
    validateServerEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://uzrnybyggznpvgxgrvgl.supabase.co",
      X_API_KEY: "xk_test_key",
      X_API_SECRET: "xk_test_secret",
      X_ACCESS_TOKEN: "xk_test_token",
      X_ACCESS_TOKEN_SECRET: "xk_test_token_secret",
    }).length,
    0
  );
});

/* ---------- design system ---------- */

function componentSources(): { file: string; src: string }[] {
  const dirs = ["src/components", "src/components/ui", "src/app"];
  const out: { file: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".tsx")) {
        out.push({ file: path, src: readFileSync(path, "utf8") });
      }
    }
  };
  for (const d of dirs) walk(d);
  return out;
}

/** Source with comments stripped, so rules about shipped code and rules
 * about shipped copy never trip over each other's explanations. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const sources = componentSources().map(({ file, src }) => ({
  file,
  src: code(src),
}));

function offendersOf(pattern: RegExp): string[] {
  return [
    ...new Set(
      sources.filter(({ src }) => pattern.test(src)).map(({ file }) => file)
    ),
  ];
}

run("hairline grids never leave an empty last-row cell", () => {
  assert.equal(filledGridColumns(5, 3), 5);
  assert.equal(filledGridColumns(4, 3), 4);
  assert.equal(filledGridColumns(6, 3), 3);
  assert.equal(filledGridColumns(3, 3), 3);
  assert.equal(filledGridColumns(2, 3), 2);
  assert.equal(filledGridColumns(10, 3), 2);
  assert.equal(filledGridColumns(10, 5), 5);
  assert.equal(filledGridColumns(1, 3), 1);
  assert.equal(filledGridColumns(0, 3), 1);
  assert.equal(filledCardColumns(5, 2), 1);
  assert.equal(filledCardColumns(4, 3), 2);
  assert.equal(filledCardColumns(3, 3), 3);
  assert.equal(filledCardColumns(4, 2), 2);

  const panel = readFileSync(
    join(process.cwd(), "src/components/ui/Panel.tsx"),
    "utf8"
  );
  assert.match(panel, /filledGridColumns\(options.length/);
  assert.match(panel, /filledCardColumns\(n, cols\)/);
  assert.match(panel, /export function HairlineGrid/);

  const offenders = sources
    .filter(({ src }) => {
      const blobs = src.match(/["'`][^"'`]{0,500}gap-px[^"'`]{0,500}["'`]/g) ?? [];
      return blobs.some(
        (blob) =>
          /bg-border/.test(blob) &&
          (/\bgrid\b/.test(blob) || /grid-cols/.test(blob)) &&
          /grid-cols-(?:\d+|\[(?!repeat\(var\(--sg-))/.test(blob)
      );
    })
    .map(({ file }) => file);
  assert.deepEqual(
    offenders,
    [],
    `gap-px + bg-border grids cannot use a fixed grid-cols-N (empty last-row box). Use Segmented, HairlineGrid, or Scoreboard. Offenders: ${offenders.join(", ")}`
  );
});

run("no type below 12px anywhere a person reads", () => {
  /*
   * One documented exception, and it is a tier rather than a call site:
   * mono caps scaffolding (`MicroLabel`, every table column header) is
   * 11-12px uppercase at 0.1em tracking, decided on 2026-08-21 and written
   * down in DESIGN_TOKENS.md under "Label voice". Uppercase mono set that
   * wide is not the legibility case this rule exists for, which is prose.
   * Anything below 11px is still refused, and so is 11px prose.
   */
  const MONO_CAPS = /font-mono[^"'`]*uppercase|uppercase[^"'`]*font-mono/;
  const offenders = sources
    .filter(({ src }) =>
      src
        .split("\n")
        .some(
          (line) =>
            /text-\[(?:[0-9]|10)(?:\.\d+)?px\]/.test(line) ||
            (/text-\[11(?:\.\d+)?px\]/.test(line) && !MONO_CAPS.test(line))
        )
    )
    .map(({ file }) => file);
  assert.deepEqual(
    offenders,
    [],
    `sub-12px type is unreadable on a phone, use text-xs. Offenders: ${offenders.join(", ")}`
  );
});

run("product UI stays on shadcn tokens, not palette leftovers", () => {
  const red = offendersOf(/\b(?:text|bg|border)-red-(?:[0-9]{2,3})\b/);
  assert.deepEqual(
    red,
    [],
    `use destructive/loss tokens, not Tailwind red-N. Offenders: ${red.join(", ")}`
  );
  const leftover = offendersOf(
    /ring-offset-app|hover:border-foreground\/20|text-foreground\/80|text-ink|focus:ring-white|bg-card\/95|stroke="#2b2b2b"/
  );
  assert.deepEqual(
    leftover,
    [],
    `broken or leftover classes. Offenders: ${leftover.join(", ")}`
  );
  const table = readFileSync(
    join(process.cwd(), "src/components/FluidTable.tsx"),
    "utf8"
  );
  assert.match(table, /text-sm tabular-nums/);
  assert.match(table, /font-mono tabular-nums/);
});

run("UI type stays on the ladder, and the landing is the one exception", () => {
  /*
   * The ladder is xs, sm, base, lg, xl, 2xl. `xl` is on it because a figure
   * steps up from `text-lg` on a wide screen (`sm:text-xl` on the
   * dashboard's portfolio total), which is the phone-first sizing rule in
   * AGENTS.md rather than an invented size.
   *
   * `SignedOutLanding.tsx` is exempt on purpose. It is a marketing page and
   * not a room: its hero is deliberately larger than anything in the app,
   * the way Arena's is, and holding it to the app's ladder is what would
   * make it wrong. Everything a signed-in reader touches stays on the
   * ladder, and arbitrary `text-[Npx]` stays refused everywhere but the
   * mark and the mono-caps tier above.
   */
  const offenders = sources
    .filter(({ file, src }) => {
      if (
        file.endsWith("UpsideLogo.tsx") ||
        file.endsWith("SignedOutLanding.tsx") ||
        /src\/components\/ui\//.test(file)
      ) {
        return false;
      }
      return (
        /text-\[(?:\d|\.)+[^\]]*\]/.test(src) ||
        /text-(?:3xl|4xl|5xl)/.test(src) ||
        /sm:text-(?:3xl|4xl)/.test(src)
      );
    })
    .map(({ file }) => file);
  assert.deepEqual(
    [...new Set(offenders)],
    [],
    `use text-xs/sm/base/lg/xl/2xl only. Offenders: ${offenders.join(", ")}`
  );
});

run("chart ticks stay HTML text-xs, never SVG text", () => {
  const files = [
    "src/components/ComparisonChart.tsx",
    "src/components/CompoundInterestSheet.tsx",
    "src/components/mobile/BookNavChart.tsx",
    "src/components/ForecastPanel.tsx",
  ];
  for (const file of files) {
    const src = readFileSync(join(process.cwd(), file), "utf8");
    assert.doesNotMatch(src, /<text[\s>]/, file);
    assert.doesNotMatch(src, /fontSize=/, file);
  }
  const axis = readFileSync(
    join(process.cwd(), "src/components/ui/ChartAxis.tsx"),
    "utf8"
  );
  assert.match(axis, /text-xs tabular-nums text-muted/);
  const compare = readFileSync(
    join(process.cwd(), "src/components/ComparisonChart.tsx"),
    "utf8"
  );
  assert.doesNotMatch(compare, /<Stat/);
  const fund = readFileSync(
    join(process.cwd(), "src/components/UpsidePortfolioPage.tsx"),
    "utf8"
  );
  assert.match(fund, /Compare my portfolio/);
  assert.doesNotMatch(fund, /Compare my sheet/);
  const nav = readFileSync(
    join(process.cwd(), "src/components/mobile/BookNavChart.tsx"),
    "utf8"
  );
  assert.match(nav, /preserveAspectRatio="none"/);
  assert.doesNotMatch(nav, /min-h-\[4\.75rem\]/);
  assert.match(nav, /h-64 w-full/);
  assert.match(nav, /min-h-9/);
  assert.match(nav, /plotMax = scale.max \+ span \* 0\.18/);
  assert.match(nav, /held these same companies all year/i);
  assert.match(nav, /Fill in an assumed year/);
  assert.doesNotMatch(nav, /!assumed && !loading && onRestoreAssumed/);
  const home = readFileSync(
    join(process.cwd(), "src/components/OverviewDashboard.tsx"),
    "utf8"
  );
  assert.match(home, /BookNavChart/);
  assert.match(home, /This year/);
  assert.doesNotMatch(home, /function MobileHomeHero/);
  assert.doesNotMatch(home, /overview-fade hidden md:block/);
});

run("niceScale stays at a handful of ticks", () => {
  const wide = niceScale(600_000, 1_200_000, 4);
  assert.ok(
    wide.ticks.length <= 5,
    `wide scale painted ${wide.ticks.length} ticks`
  );
  const dense = niceScale(605_000, 1_180_000, 4);
  assert.ok(
    dense.ticks.length <= 5,
    `dense scale painted ${dense.ticks.length} ticks`
  );
});

run("one letter-spacing scale on small caps labels", () => {
  const offenders = offendersOf(/tracking-(?:wider|widest)/).filter(
    (file) => !/src\/components\/ui\//.test(file) || file.endsWith("ui/Panel.tsx")
  );
  assert.deepEqual(
    offenders,
    [],
    `tracking-wide is the only caps tracking, wider reads as a second design. Offenders: ${offenders.join(", ")}`
  );
});

run("chrome is quiet, black field, prose sits in a dark box", () => {
  const panel = readFileSync(
    join(process.cwd(), "src/components/ui/Panel.tsx"),
    "utf8"
  );
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const palette = readFileSync(join(process.cwd(), "src/lib/palette.ts"), "utf8");
  const header = readFileSync(
    join(process.cwd(), "src/components/AppHeader.tsx"),
    "utf8"
  );
  const pulse = readFileSync(
    join(process.cwd(), "src/components/PulsePage.tsx"),
    "utf8"
  );
  const home = readFileSync(
    join(process.cwd(), "src/components/OverviewDashboard.tsx"),
    "utf8"
  );
  const gate = readFileSync(
    join(process.cwd(), "src/components/SignInGate.tsx"),
    "utf8"
  );
  const frame = readFileSync(
    join(process.cwd(), "src/lib/page-shell.ts"),
    "utf8"
  );
  const tabs = readFileSync(
    join(process.cwd(), "src/components/PortfolioTabs.tsx"),
    "utf8"
  );
  const modeDock = readFileSync(
    join(process.cwd(), "src/components/BookModeDock.tsx"),
    "utf8"
  );
  assert.match(css, /--background: oklch\(0 0 0\)/);
  assert.match(css, /--primary: oklch\(0\.8 0\.09 90\)/);
  assert.match(css, /--card: oklch\(0\.205 0 0\)/);
  assert.match(css, /--radius: 0\.625rem/);
  assert.match(css, /--gain:/);
  assert.match(css, /--loss:/);
  assert.doesNotMatch(css, /--app: #0d110f/);
  assert.doesNotMatch(css, /--app: #1a2820/);
  assert.doesNotMatch(css, /--app: #0b0b0b/);
  assert.doesNotMatch(css, /--card: #1a1f1c/);
  assert.doesNotMatch(css, /--card: #2a2218/);
  assert.doesNotMatch(css, /--card: #151716/);
  assert.doesNotMatch(css, /--raised: #242b27/);
  assert.doesNotMatch(css, /--gain: #5a9a4a/);
  assert.doesNotMatch(css, /--gain: #3ecf6e/);
  assert.doesNotMatch(css, /--gain: #3f9d58/);
  assert.doesNotMatch(css, /--brand: #c4a36a/);
  assert.doesNotMatch(css, /--brand: #d4a24c/);
  assert.doesNotMatch(css, /--brand: #8a9a86/);
  assert.doesNotMatch(css, /--loss: #c46a58/);
  assert.doesNotMatch(css, /--caution: #c4a574/);
  assert.doesNotMatch(css, /--border: rgb\(237 232 220/);
  assert.doesNotMatch(css, /#d6ad69/);
  assert.doesNotMatch(css, /#dcad55/);
  assert.match(palette, /brand: "#d4bc79"/);
  assert.match(palette, /gain: "#34d399"/);
  assert.match(panel, /export function Reading/);
  assert.match(panel, /export function ScanList/);
  assert.match(panel, /export function InsightText/);
  assert.match(panel, /splitMoveTint/);
  assert.doesNotMatch(panel, /\(up\|down\)\(\\s\+about/);
  assert.match(
    panel.slice(panel.indexOf("export function Reading")),
    /glass-well rounded-lg/
  );
  assert.doesNotMatch(
    panel.slice(panel.indexOf("export function Reading")),
    /bg-paper/
  );
  assert.match(panel, /default: "card-sheen glass ring-foreground\/20"/);
  assert.match(panel, /rounded-lg bg-border/);
  /*
   * Asserted as properties rather than as one exact class string, which is
   * what made this brittle: the cell gained `flex flex-col` and stepped its
   * padding down on a phone (`p-4 sm:p-6`), neither of which touches what
   * this invariant is about. What it is about is that a score cell is glass
   * on the field with a ring, and never a flat fill.
   */
  const scoreCell = panel.slice(panel.indexOf("export const SCORE_CELL"), panel.indexOf("export const SCORE_CELL") + 240);
  assert.match(scoreCell, /card-sheen glass/);
  assert.match(scoreCell, /rounded-xl/);
  assert.match(scoreCell, /ring-1 ring-foreground\/20/);
  assert.doesNotMatch(scoreCell, /bg-(?:card|muted)\b/);
  assert.doesNotMatch(
    panel.slice(panel.indexOf("export function Stat")),
    /h-full rounded-xl/
  );
  assert.match(
    panel.slice(panel.indexOf("export function MicroLabel")),
    /font-mono text-\[11px\] font-medium uppercase/
  );
  const card = readFileSync(
    join(process.cwd(), "src/components/ui/card.tsx"),
    "utf8"
  );
  assert.match(
    card.slice(card.indexOf("function CardDescription")),
    /text-sm text-muted-foreground/
  );
  assert.match(
    panel.slice(panel.indexOf("export function Reading")),
    /text-sm font-semibold tracking-tight text-foreground/
  );
  assert.match(panel, /padded &&\s*"flex flex-col gap-5 p-4 sm:gap-6 sm:p-6"/);
  assert.match(panel, /export function Scoreboard/);
  /*
   * Inverted on purpose. This used to require `whitespace-nowrap` on a
   * figure, which is the exact thing AGENTS.md now forbids: a figure that
   * cannot wrap is a figure that leaves its card, which is how
   * "23.0% a year" ended up outside one. A figure is mono, bold, tabular,
   * steps up from `text-xl` at `sm`, and wraps.
   */
  assert.match(panel, /font-mono text-xl font-bold[^"]*tabular-nums break-words sm:text-2xl/);
  assert.doesNotMatch(panel, /tabular-nums[^"]*whitespace-nowrap/);
  assert.match(panel, /const STATUS/);
  assert.match(panel, /font-heading text-lg font-semibold tracking-tight/);
  assert.match(
    panel.slice(panel.indexOf("export function Score")),
    /reading \? STATUS : DISPLAY/
  );
  assert.match(panel, /bg-primary text-primary-foreground/);
  const segmentedStart = panel.indexOf("const SEGMENTED_ITEM");
  const segmented = panel.slice(
    segmentedStart,
    panel.indexOf(";", panel.indexOf('"', segmentedStart + 30)) + 1
  );
  assert.doesNotMatch(segmented, /font-semibold/);
  assert.doesNotMatch(segmented, /flex-wrap/);
  assert.doesNotMatch(segmented, /truncate/);
  assert.doesNotMatch(segmented, /border border-border bg-muted p-0.5/);
  assert.doesNotMatch(segmented, /variant="outline"/);
  /*
   * The active segment used to paint `bg-background` and hover used to be
   * `bg-foreground/10`. Both changed on purpose: an opaque fill on a
   * translucent card swallowed whatever sat under it, which is the "the
   * default gray gets completely eaten up by the highlight" report. The
   * active segment is now a raised secondary surface with primary text,
   * and hover goes through the one shared `--hover` veil.
   *
   * What is worth protecting is not the specific colour but that the
   * selected segment stays *distinguishable* and that hover keeps using
   * the shared token rather than a one-off.
   */
  /*
   * `--secondary` is byte-for-byte `--muted`, and `--muted` is what the
   * segmented container is filled with, so a selected pill painted
   * `bg-secondary` was exactly the colour it sat on and vanished. The
   * selected surface is a veil now, defined relative to whatever is under
   * it, so it cannot collide with its own container.
   */
  /*
   * The other half of the selected-state rule in DESIGN_TOKENS.md. A
   * segmented item is a control, so it takes the accent at full lightness
   * with `--primary-foreground` type; `WorkspaceSwitcher` is the one that
   * stays neutral, because it must not compete with the header's CTA.
   * There is no middle, and `bg-selected` on a control was the middle.
   */
  assert.match(segmented, /data-\[state=on\]:bg-primary/);
  assert.match(segmented, /data-\[state=on\]:text-primary-foreground/);
  assert.match(segmented, /data-\[state=on\]:text-primary/);
  assert.match(segmented, /hover:bg-hover/);
  // Never an opaque fill on the active segment again.
  assert.doesNotMatch(
    segmented,
    /data-\[state=on\]:bg-(background|muted|card|secondary)\b/,
    "a fixed colour can equal the container it sits on -- use the veil"
  );
  // Hover must not reintroduce a one-off alpha wash beside the token.
  assert.doesNotMatch(segmented, /hover:bg-foreground\//);
  assert.doesNotMatch(panel, /bg-zinc-100 text-zinc-900/);
  assert.doesNotMatch(
    panel.slice(panel.indexOf("export function MicroLabel")),
    /uppercase tracking-wide/
  );
  assert.match(panel, /const FIGURE/);
  assert.match(panel, /font-mono text-xl font-bold tabular-nums/);
  /*
   * The chrome's fill and blur are one CSS class now, not utilities on the
   * header. That is load-bearing rather than tidying: a `backdrop-filter`
   * samples its own slice of the backdrop, so a phone bar and a market
   * strip as two stacked panes landed at two different tones with a seam
   * between them. One pane, one sample. And the only edge the chrome
   * carries is at its bottom where it meets the page, which is why there
   * is no `border-b` on the wrapper or between its rows.
   */
  assert.match(header, /chrome-pane sticky top-0/);
  assert.doesNotMatch(header, /backdrop-blur/);
  assert.doesNotMatch(header, /border-b border-(?:border|white\/10)/);
  assert.match(css, /\.chrome-pane \{[^}]*background-color: color-mix\(in oklch, var\(--background\)/);
  assert.match(css, /\.chrome-pane \{[^}]*backdrop-filter: blur/);
  assert.match(home, /morning.notices.map/);
  assert.match(home, /<InsightText text=\{notice.text\} \/>/);
  assert.doesNotMatch(home, /opened the book/);
  assert.doesNotMatch(home, /border-brand\/30 bg-brand\/\[0\.07\]/);
  assert.doesNotMatch(home, /border-amber-500\/25 bg-amber-950\/20/);
  assert.doesNotMatch(pulse, /border-brand\/30 bg-brand\/\[0\.07\]/);
  assert.doesNotMatch(pulse, /border-amber-500\/30 bg-amber-950\/15/);
  assert.match(gate, /<Reading nested label="Worth noticing">/);
  const landing = readFileSync(
    join(process.cwd(), "src/components/SignedOutLanding.tsx"),
    "utf8"
  );
  assert.equal(actionLabel("hold"), "Inside recent range");
  assert.match(gate, /Inside recent range/);
  assert.match(landing, /Inside recent range/);
  assert.doesNotMatch(gate, /<Pill>Hold<\/Pill>/);
  assert.doesNotMatch(landing, /<Pill>Hold<\/Pill>/);
  assert.doesNotMatch(landing, /<Pill>Look<\/Pill>/);
  assert.match(frame, /bg-background text-foreground/);
  assert.doesNotMatch(frame, /#141614/);
  assert.doesNotMatch(frame, /#0d110f/);
  assert.doesNotMatch(frame, /#1a2820/);
  assert.doesNotMatch(frame, /#2d3d32/);
  /*
   * The marker itself moved into `DockMarker`, which both docks draw, so
   * the fill is asserted there and each bar is asserted to be drawing it.
   * A dock that stopped rendering the marker would otherwise pass a rule
   * about what colour the marker is by having no marker.
   */
  const dockMarker = readFileSync(
    join(process.cwd(), "src/components/DockMarker.tsx"),
    "utf8"
  );
  /*
   * The dock spends no accent at all now. Where you are is said by one
   * neutral marker that slides behind the cells, because which room you are
   * in is the least surprising fact on the screen and a slab of mustard the
   * width of a cell was the loudest thing on the bar for the least reason.
   * The rule that stands is the one this used to protect from the other
   * side: a selected surface is either the accent at full lightness or a
   * neutral veil with foreground type, never a dim tint in between.
   */
  assert.match(modeDock, /<DockMarker /);
  assert.match(dockMarker, /bg-foreground\/10/);
  assert.doesNotMatch(dockMarker, /bg-primary/);
  assert.doesNotMatch(modeDock, /bg-primary text-primary-foreground/);
  assert.doesNotMatch(tabs, /bg-white text-black/);

  const bland = [
    /bg-zinc-100/,
    /text-zinc-900/,
    /bg-white text-black/,
    /accent-zinc/,
    /bg-emerald-/,
    /text-emerald-/,
    /border-emerald-/,
    /bg-sky-/,
    /text-sky-/,
    /border-sky-/,
    /bg-violet-/,
    /text-violet-/,
    /bg-rose-/,
    /text-rose-/,
    /border-rose-/,
    /bg-amber-/,
    /text-amber-/,
    /#1a2820/,
    /#2a2218/,
    /#2d3d32/,
    /#5a9a4a/,
    /#6a8f5a/,
    /#a89878/,
    /#0d110f/,
  ];
  for (const pattern of bland) {
    const offenders = offendersOf(pattern);
    assert.deepEqual(
      offenders,
      [],
      `${pattern} is outside the office palette. Offenders: ${offenders.join(", ")}`
    );
  }
});

run("boxes sit off the field, never the same color as the page", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const panel = readFileSync(
    join(process.cwd(), "src/components/ui/Panel.tsx"),
    "utf8"
  );
  const members = readFileSync(
    join(process.cwd(), "src/components/CommunityMembersPanel.tsx"),
    "utf8"
  );
  const share = readFileSync(
    join(process.cwd(), "src/components/ShareSheets.tsx"),
    "utf8"
  );
  assert.match(css, /--background: oklch\(0 0 0\)/);
  assert.match(css, /--card: oklch\(0\.205 0 0\)/);
  assert.notEqual("oklch(0 0 0)", "oklch(0.205 0 0)");
  assert.match(panel, /export const BOX/);
  assert.match(panel, /export const CARD/);
  assert.match(panel, /export const LIST/);
  assert.match(panel, /rounded-xl text-sm text-card-foreground ring-1 ring-foreground\/20/);
  assert.match(
    members,
    /divide-y divide-border overflow-hidden rounded-xl glass ring-1 ring-foreground\/20/
  );
  assert.match(share, /rounded-xl glass ring-1 ring-foreground\/20 p-6/);
  assert.deepEqual(
    offendersOf(/bg-card\/(?:80|50)\b/),
    [],
    "page boxes use solid bg-card, not a wash of the field"
  );
  assert.deepEqual(
    offendersOf(/bg-background\/40\b/),
    [],
    "a box painted with the field color disappears"
  );

  const hollow = sources
    .filter(({ src }) => {
      for (const line of src.split("\n")) {
        if (!/rounded-(xl|2xl)/.test(line)) continue;
        if (!/border-border/.test(line)) continue;
        if (/\bbg-/.test(line)) continue;
        // A glass pane or well is a fill. It is the fill, in fact: the whole
        // point of the material is that a box reads off the field without a
        // flat colour, so `glass-well` satisfies this rule rather than
        // dodging it.
        if (/\bglass(?:-well)?\b/.test(line)) continue;
        return true;
      }
      return false;
    })
    .map(({ file }) => file);
  assert.deepEqual(
    hollow,
    [],
    `xl/2xl bordered boxes need a fill. Offenders: ${hollow.join(", ")}`
  );
});

run("Lab chrome is a toolbar, Seasonality does not paint bronze", () => {
  const lab = readFileSync(
    join(process.cwd(), "src/components/LabSheet.tsx"),
    "utf8"
  );
  const season = readFileSync(
    join(process.cwd(), "src/components/SeasonalityPage.tsx"),
    "utf8"
  );
  assert.match(lab, /padded=\{false\}/);
  assert.doesNotMatch(lab, /FlaskConical/);
  assert.doesNotMatch(lab, /bg-brand/);
  assert.doesNotMatch(lab, /text-amber/);
  assert.doesNotMatch(season, /amber-950/);
  assert.doesNotMatch(season, /197,160,89/);
  assert.doesNotMatch(season, /border-brand\/30 bg-brand\/10/);
  assert.doesNotMatch(season, /shadow-\[0_0_12px/);
  assert.doesNotMatch(season, /<h2 className="text-base font-bold text-white">Seasonality<\/h2>/);
  assert.match(season, /border-gain\/30 bg-gain\/\[0\.08\]/);
  assert.match(season, /border-loss\/30 bg-loss\/\[0\.08\]/);
  assert.match(season, /text-lg font-semibold tabular-nums/);
});

run("explainers portal and sit on a lifted popover", () => {
  const panel = readFileSync(
    join(process.cwd(), "src/components/ui/Panel.tsx"),
    "utf8"
  );
  const pop = readFileSync(
    join(process.cwd(), "src/components/ui/popover.tsx"),
    "utf8"
  );
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  assert.match(panel, /PopoverContent/);
  assert.doesNotMatch(panel, /left-1\/2 top-full/);
  assert.match(pop, /collisionPadding=\{12\}/);
  assert.match(css, /--card: oklch\(0\.205 0 0\)/);
  assert.match(css, /--popover: oklch\(0\.205 0 0\)/);
});

run("Geist headings and body, no third face", () => {
  const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const logo = readFileSync(
    join(process.cwd(), "src/components/UpsideLogo.tsx"),
    "utf8"
  );
  assert.match(layout, /Geist/);
  assert.match(layout, /Geist_Mono/);
  assert.doesNotMatch(layout, /Montserrat|Inter|Newsreader|Outfit|JetBrains/);
  assert.match(css, /--font-sans: "Geist"/);
  /*
   * Archivo since the brand pass (DESIGN_TOKENS.md, "Two typefaces, split
   * by job"). Still two faces doing two jobs, which is what this invariant
   * is for: a heading face and a mono face, and no third one wandering in.
   */
  assert.match(css, /--font-heading: "Archivo"/);
  assert.match(css, /--font-mono: /);
  assert.match(css, /--font-logo: "Archivo"/);
  assert.match(css, /--font-mono: "Geist Mono"/);
  assert.match(css, /h1 \{\s*\n\s*font-size: 1\.5rem;/);
  assert.match(css, /h2 \{\s*\n\s*font-size: 1\.125rem;/);
  assert.match(css, /h3 \{\s*\n\s*font-size: 1rem;/);
  assert.match(css, /h4 \{\s*\n\s*font-size: 0\.875rem;/);
  assert.doesNotMatch(css, /font-newsreader|font-outfit|font-montserrat|font-inter/);
  assert.match(code(logo), /font-logo/);
  assert.match(code(logo), /uppercase/);
  assert.match(code(logo), /Upside/);
  assert.match(code(logo), /Lab/);
  assert.doesNotMatch(code(logo), /tracking-\[0\./);
});

run("movers are compact tiles, not a stretched table or sparkline", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/OverviewDashboard.tsx"),
    "utf8"
  );
  const row = src.slice(
    src.indexOf("function MoverTile"),
    src.indexOf("function PortfolioLane")
  );
  assert.doesNotMatch(row, /Sparkline/);
  assert.doesNotMatch(src, /MOVER_GRID/);
  assert.doesNotMatch(row, /8\.5rem/);
  assert.match(row, /percent\(pct/);
  assert.match(row, /signedCurrency\(dollars/);
  assert.match(row, /min-w-0/);
  assert.match(row, /shrink-0/);
  assert.match(src, /sm:grid-cols-2/);
  assert.doesNotMatch(row, /label="Price"/);
  assert.doesNotMatch(row, />Recent</);
});

run("rounded-xl is the panel radius, nothing rounder", () => {
  const offenders = offendersOf(/rounded-3xl/);
  assert.deepEqual(
    offenders,
    [],
    `panels are rounded-xl, nested rounded-lg, controls rounded-lg. Offenders: ${offenders.join(", ")}`
  );
});

run("no em dashes in user-facing copy", () => {
  // A cell with no number in it says NO_VALUE, which is "n/a" and not a
  // dash at all any more, so nothing here needs an exception for it.
  // What's banned is the dash used as sentence punctuation, so this only
  // fires when there's a real word on both sides of it.
  const offenders = offendersOf(/[\p{L}\d]\s*—\s*[\p{L}\d]/u);
  assert.deepEqual(
    offenders,
    [],
    `em dashes are the biggest AI tell, use a period or comma. Offenders: ${offenders.join(", ")}`
  );
});

run("live price polls back off when New York is closed", () => {
  // A flat setInterval on quotes burns the shared free-tier rate limit all
  // night re-fetching the same close. Anything that polls prices has to ask
  // marketSession/quotePollMs what the right cadence is right now.
  const pollers = [
    "Dashboard.tsx",
    "UpsidePortfolioPage.tsx",
    "MacroStrip.tsx",
    "CommunityView.tsx",
    "MarketSentimentWidget.tsx",
  ];
  const offenders = pollers.filter((name) => {
    const found = sources.find(({ file }) => file.endsWith(name));
    return !found || !/marketSession|quotePollMs/.test(found.src);
  });
  assert.deepEqual(
    offenders,
    [],
    `these poll prices without checking the session: ${offenders.join(", ")}`
  );
});

run("weakening trend names the 40-week average and the slope", () => {
  const story = buildTrendStory({
    ticker: "RDDT",
    regime: "weakening",
    aboveLongMa: true,
    rsi: 62,
    macdBuilding: true,
    divergence: null,
    rs13: 0.04,
    rs26: 0.08,
    chg2w: 0.266,
    chg4w: 0.31,
    lastClose: 45.2,
    longMa: 43.84,
    vsLongMaPct: 45.2 / 43.84 - 1,
    longSlopePct: -0.012,
    macdHistogram: 0.18,
    macdHistogramPrev: 0.24,
  });
  const trend = story.signals.find((s) => s.key === "trend");
  assert.ok(trend);
  assert.equal(trend!.value, "Weakening");
  assert.ok(trend!.detail.length >= 2);
  const blob = trend!.detail.join(" ");
  assert.match(blob, /40-week/);
  assert.match(blob, /↓/);
  assert.match(blob, /8 weeks/);
  assert.match(blob, /45\.20|\$45/);
  for (const s of story.signals) {
    assert.ok(Array.isArray(s.detail) && s.detail.length > 0, s.key);
    for (const line of s.detail) {
      assert.ok(line.length < 80, `${s.key} chip is a sentence: ${line}`);
    }
  }
  const momentum = story.signals.find((s) => s.key === "momentum");
  assert.equal(momentum!.value, "Building");
  assert.ok(momentum!.detail.some((line) => /0\.18/.test(line)));
  assert.ok(momentum!.detail.some((line) => /0\.24/.test(line)));
});

run("trend story board is Trend full-width then a 2-col grid, not a 5-wide row", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/TrendsPanel.tsx"),
    "utf8"
  );
  assert.match(src, /sm:grid-cols-2/);
  assert.match(src, /story\.signals\.find\(\(s\) => s\.key === "trend"\)/);
  assert.doesNotMatch(src, /cols=\{5\}/);
  assert.doesNotMatch(src, /bullets=\{s\.detail\}/);
  assert.match(src, /<Reading>/);
  assert.match(src, /Those come first/);
});

run("signed-in pages share one column so rooms do not jump", () => {
  const pages = [
    "Dashboard.tsx",
    "CommunitiesList.tsx",
    "CommunityView.tsx",
    "UpsidePortfolioPage.tsx",
    "AccountPage.tsx",
    "AdminPage.tsx",
    "AppHeader.tsx",
    "PortfolioTabs.tsx",
  ];
  for (const name of pages) {
    const src = readFileSync(join(process.cwd(), "src/components", name), "utf8");
    assert.match(src, /PAGE_(MAIN|COLUMN|FRAME)_CLASS/, name);
    assert.doesNotMatch(src, /max-w-3xl|max-w-4xl|max-w-6xl/, name);
  }
  const shell = readFileSync(
    join(process.cwd(), "src/lib/page-shell.ts"),
    "utf8"
  );
  assert.match(shell, /max-w-\[1200px\]/);
  assert.match(shell, /w-full/);
  assert.match(shell, /page-frame/);
  assert.match(shell, /\[--dock-pad:10.5rem\]/);
  assert.match(shell, /md:\[--dock-pad:11.5rem\]/);
  assert.match(shell, /pt-6/);
  assert.match(shell, /pb-\[var\(--dock-pad\)\]/);
  assert.doesNotMatch(shell, /sm:py-8/);
  assert.doesNotMatch(shell, /sm:py-10/);
  assert.doesNotMatch(shell, /\bpy-8\b/);
  assert.doesNotMatch(shell, /md:\[--dock-pad:5.5rem\]/);
  assert.doesNotMatch(shell, /md:\[--dock-pad:7.75rem\]/);
  assert.doesNotMatch(shell, /md:\[--dock-pad:8.5rem\]/);
  assert.match(shell, /PAGE_CHROME_SPACER_CLASS/);
  /*
   * The fixed `hidden h-24 shrink-0 md:block` spacer went with the dock
   * rework. Clearance under a dock is published from a measurement now
   * (`use-dock-pad.ts` writes `--dock-clearance` and `data-dock` onto
   * `<html>`), precisely so no page hardcodes a dock's height again, so
   * there is nothing here to assert in its place.
   */
  const header = readFileSync(
    join(process.cwd(), "src/components/AppHeader.tsx"),
    "utf8"
  );
  assert.match(header, /sticky top-0/);
  assert.match(header, /AppStatusStrip/);
  assert.match(header, /PAGE_CHROME_SPACER_CLASS/);
  const strip = readFileSync(
    join(process.cwd(), "src/components/AppStatusStrip.tsx"),
    "utf8"
  );
  // One fixed row height at every breakpoint — the strip used to stack
  // (label row + wrapped macro grid) below `sm`, costing ~2x the height on
  // a phone. Now it is always a single h-10 row; the macro numbers scroll
  // horizontally inside it if they do not fit, instead of wrapping.
  assert.match(strip, /\bh-9 min-h-9\b/);
  assert.doesNotMatch(strip, /flex-col/);
  const macroStrip = readFileSync(
    join(process.cwd(), "src/components/MacroStrip.tsx"),
    "utf8"
  );
  assert.doesNotMatch(macroStrip, />\s*Markets\s*</);
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  assert.match(css, /scrollbar-gutter:\s*stable/);
  /*
    These two moved out of globals.css into scroll-host.css and were deleted
    rather than repointed when that turned CI red, which left the rule in
    AGENTS.md with nothing enforcing it. The track and its clearance are the
    whole reason `.scroll-host` exists.
  */
  assert.match(css, /@import\s+["']\.\/scroll-host\.css["']/);
  const scrollHost = readFileSync(
    join(process.cwd(), "src/app/scroll-host.css"),
    "utf8"
  );
  assert.match(scrollHost, /\.scroll-host\s*\{/);
  assert.match(scrollHost, /--scroll-clearance:\s*1rem/);
  assert.match(scrollHost, /padding-inline-end:\s*var\(--scroll-clearance\)/);
  const dash = readFileSync(
    join(process.cwd(), "src/components/Dashboard.tsx"),
    "utf8"
  );
  assert.doesNotMatch(dash, /Status strip, below the header/);
  const tabs = readFileSync(
    join(process.cwd(), "src/components/PortfolioTabs.tsx"),
    "utf8"
  );
  const mobileDock = readFileSync(
    join(process.cwd(), "src/components/mobile/MobileTabBar.tsx"),
    "utf8"
  );
  const workspaceShell = readFileSync(
    join(process.cwd(), "src/components/WorkspaceShell.tsx"),
    "utf8"
  );
  assert.match(tabs, /useDockPad/);
  assert.match(tabs, /fixed inset-x-0 bottom-0/);
  assert.match(mobileDock, /useDockPad/);
  assert.match(workspaceShell, /WORKSPACE_DOCK_SLOT_ID/);
  assert.match(css, /input\[type="range"\]/);
  assert.match(css, /touch-action:\s*pan-y/);
});

run("sheets sit in the visible viewport so the keyboard cannot cover them", () => {
  const overlay = readFileSync(
    join(process.cwd(), "src/components/ui/ViewportOverlay.tsx"),
    "utf8"
  );
  const vars = readFileSync(
    join(process.cwd(), "src/lib/use-visual-viewport.ts"),
    "utf8"
  );
  const providers = readFileSync(
    join(process.cwd(), "src/components/Providers.tsx"),
    "utf8"
  );
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  assert.match(overlay, /--vv-height/);
  assert.match(overlay, /keepFocusedFieldVisible/);
  assert.match(vars, /visualViewport/);
  assert.match(vars, /--vv-height/);
  assert.match(vars, /--vv-keyboard/);
  assert.match(vars, /dataset.keyboard/);
  assert.match(vars, /keepFocusedFieldVisible/);
  assert.match(vars, /focusin/);
  assert.match(providers, /VisualViewportVars/);
  assert.match(css, /\.viewport-overlay input/);
  assert.match(css, /html\[data-keyboard="open"\] \.keyboard-chrome/);
  assert.match(css, /--vv-keyboard/);
  const chrome = [
    "PortfolioTabs.tsx",
    "mobile/MobileTabBar.tsx",
    "ui/sonner.tsx",
    "CcAdvisorChat.tsx",
  ];
  for (const name of chrome) {
    const src = readFileSync(join(process.cwd(), "src/components", name), "utf8");
    assert.match(src, /keyboard-chrome/, name);
  }
  const chat = readFileSync(
    join(process.cwd(), "src/components/CcAdvisorChat.tsx"),
    "utf8"
  );
  assert.match(chat, /--vv-height/);
  assert.match(chat, /margus-open/);
  assert.match(chat, /--dock-clearance/);
  assert.match(css, /html\[data-keyboard="open"\] \.margus-open/);
  const sheets = [
    "HoldingModal.tsx",
    "CashModal.tsx",
    "YtdAnchorModal.tsx",
    "InvitePartnerModal.tsx",
    "CsvImportModal.tsx",
    "RenameSheetModal.tsx",
    "CostBasisModal.tsx",
    "SnapshotsModal.tsx",
    "WelcomeTour.tsx",
    "TickerDrawer.tsx",
    "AccountPage.tsx",
    "CommunityView.tsx",
    "FeedbackModal.tsx",
    "CommunitiesList.tsx",
  ];
  for (const name of sheets) {
    const src = readFileSync(join(process.cwd(), "src/components", name), "utf8");
    assert.match(src, /ViewportOverlay/, name);
    // A raw overflow-y-auto with a hidden bar is what `.scroll-host` exists
    // to replace. Every one of these carries it today; the assertion went
    // when two of the files were briefly missing it, and never came back.
    assert.match(src, /scroll-host/, name);
    assert.doesNotMatch(src, /fixed inset-0/, name);
  }
  const confirm = readFileSync(
    join(process.cwd(), "src/components/ui/ConfirmModal.tsx"),
    "utf8"
  );
  assert.match(confirm, /AlertDialog/);
  assert.doesNotMatch(confirm, /fixed inset-0/);
  const commandPalette = readFileSync(
    join(process.cwd(), "src/components/CommandPalette.tsx"),
    "utf8"
  );
  assert.match(commandPalette, /CommandDialog/);
  assert.doesNotMatch(commandPalette, /ViewportOverlay/);
  assert.doesNotMatch(commandPalette, /fixed inset-0/);
});

run("Compound controls sit on one panel, not nested cards", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/CompoundInterestSheet.tsx"),
    "utf8"
  );
  const controls = src.slice(
    src.indexOf("Growth calculator"),
    src.indexOf("Results & Projections")
  );
  assert.match(src, /var\(--dock-pad\)/);
  assert.match(src, /overflow-x-clip/);
  assert.match(src, /minmax\(0,380px\)/);
  assert.match(src, /touch-pan-y/);
  assert.doesNotMatch(src, /touch-none/);
  assert.match(controls, /divide-y divide-border/);
  assert.doesNotMatch(controls, /Card tone="raised"/);
  assert.doesNotMatch(controls, /text-sky-400/);
  assert.doesNotMatch(controls, /type="range"/);
  assert.doesNotMatch(controls, /Or borrow one/);
  assert.doesNotMatch(controls, /Full Book Value/);
  assert.doesNotMatch(controls, /Your book/);
  assert.doesNotMatch(controls, /flex-wrap/);
  assert.doesNotMatch(controls, /ChipButton/);
  assert.match(controls, /columns=\{4\}/);
  assert.match(controls, /look="buttons"/);
  assert.match(controls, /This portfolio/);
  assert.doesNotMatch(src, /tipFlash|setTipFlash/);
  assert.doesNotMatch(controls, /bg-gain\/\[0\.06\]/);
  assert.match(controls, /<fieldset/);
  assert.match(controls, /Taking out each month/);
  assert.match(
    controls,
    /id: "none"[\s\S]*?id: "deposits"[\s\S]*?id: "withdrawals"[\s\S]*?id: "both"/
  );
  assert.doesNotMatch(src, /If it starts badly/);
  assert.doesNotMatch(src, /Crash first|Slow start|Even years/);
  assert.doesNotMatch(src, /drawdown30|flat2y|calculateWithShock|ShockKind/);
  const yearWords = src.slice(src.indexOf("Any single year, in words"));
  assert.match(yearWords, /look="buttons"/);
  assert.match(yearWords, /columns=\{storyOpts\.length\}/);
  assert.doesNotMatch(yearWords, /<Tabs/);
  assert.doesNotMatch(yearWords, /variant="line"/);
  assert.doesNotMatch(yearWords, /Card tone="raised"/);
  assert.doesNotMatch(yearWords, /rounded-lg bg-muted/);
  assert.doesNotMatch(yearWords, /columns=\{3\}/);
});

run("every tier's default surface uses the shared Panel shell", () => {
  // The drift this catches: a new screen hand-rolls its own border+bg and the
  // app grows a fourth dialect. If a file draws a top-level section, it should
  // be getting the shell from ui/Panel.
  const shells = [
    "OverviewDashboard.tsx",
    "PulsePage.tsx",
    "ForecastPanel.tsx",
    "LabSheet.tsx",
    "CoveredCallPanel.tsx",
    "CompoundInterestSheet.tsx",
    "TickerDrawer.tsx",
    "ScenarioSimulator.tsx",
  ];
  const offenders = shells.filter((name) => {
    const found = sources.find(({ file }) => file.endsWith(name));
    return !found || !/from "@\/components\/ui\/Panel"/.test(found.src);
  });
  assert.deepEqual(
    offenders,
    [],
    `these draw their own panel shell instead of using ui/Panel: ${offenders.join(", ")}`
  );
});

run("quote clients honor the CDN cache", () => {
  const files = [
    "src/components/Dashboard.tsx",
    "src/components/PulsePage.tsx",
    "src/components/MacroStrip.tsx",
    "src/components/CommunityView.tsx",
    "src/components/UpsidePortfolioPage.tsx",
  ];
  for (const rel of files) {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    assert.doesNotMatch(
      src,
      /quotesUrl\([^)]*\),\s*\{\s*cache:\s*"no-store"/,
      `${rel} still bypasses /api/quotes CDN cache`
    );
    assert.doesNotMatch(
      src,
      /\/api\/quotes[^`]*cache:\s*"no-store"/,
      `${rel} still bypasses /api/quotes CDN cache`
    );
  }
  const route = readFileSync(
    join(process.cwd(), "src/app/api/quotes/route.ts"),
    "utf8"
  );
  assert.match(route, /Vercel-CDN-Cache-Control/);
  assert.doesNotMatch(route, /force-dynamic/);
});

run("own-book compare also draws on the Margus vs SPY chart", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/UpsidePortfolioPage.tsx"),
    "utf8"
  );
  assert.match(src, /sheetReturnPathSince/);
  const chart = src.slice(
    src.indexOf("const comparisonSeries"),
    src.indexOf("const fetchMyPortfolios")
  );
  assert.match(chart, /youReturnSeries/);
  assert.match(chart, /SERIES_COLOR\.you/);
});

run("fund stats speak in percent and dollars, not points", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/UpsidePortfolioPage.tsx"),
    "utf8"
  );
  assert.doesNotMatch(code(src), /\dpt\b|pt vs SPY|ahead by|vs cost|Dead even over this window/);
});

run("fund watchlist drops names he already holds", () => {
  const cleaned = sanitizeFundWatchlist(
    [
      { ticker: "$SNOW", waitFor: "A 10% dip off the highs" },
      { ticker: "snow", waitFor: "duplicate" },
      { ticker: "AVGO", waitFor: "Wait for a cleaner print" },
      { ticker: "!!!", waitFor: "junk" },
      { ticker: "PLTR", waitFor: "   " },
    ],
    ["SNOW"]
  );
  assert.deepEqual(
    cleaned.map((w) => w.ticker),
    ["AVGO"]
  );
});

run("fund page names cash purpose and the watchlist", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/UpsidePortfolioPage.tsx"),
    "utf8"
  );
  assert.match(src, /Watching/);
  assert.match(src, /Cash is sitting for/);
  assert.doesNotMatch(code(src), /Dry powder/);
  const scoreboard = src.slice(
    src.indexOf('label="Total value"'),
    src.indexOf("What he")
  );
  assert.doesNotMatch(scoreboard, /cash_purpose/);
});

run("first-run is import, not an empty named sheet", () => {
  const dash =
    readFileSync(join(process.cwd(), "src/components/Dashboard.tsx"), "utf8") +
    readFileSync(
      join(process.cwd(), "src/lib/use-dashboard-book-writes.ts"),
      "utf8"
    );
  assert.doesNotMatch(dash, /DashboardWelcome/);
  assert.match(dash, /FIRST_SHEET_NAME/);
  assert.match(dash, /ensureFirstSheet/);
  const welcomeGone = (() => {
    try {
      readFileSync(
        join(process.cwd(), "src/components/DashboardWelcome.tsx"),
        "utf8"
      );
      return false;
    } catch {
      return true;
    }
  })();
  assert.equal(welcomeGone, true, "DashboardWelcome.tsx should be deleted");
  const overview = readFileSync(
    join(process.cwd(), "src/components/OverviewDashboard.tsx"),
    "utf8"
  );
  assert.match(overview, /Upload a CSV/);
  assert.match(overview, /Import a screenshot/);
  assert.match(overview, /Not Apple Stocks or a watchlist/);
  assert.doesNotMatch(overview, /watch the Upside Fund or start a circle below/);
  assert.doesNotMatch(dash, /Invite someone onto this sheet/);
  assert.doesNotMatch(dash, /wasEmpty && !pulseHiddenForTier/);
});

run("screenshot import failure names what is missing", () => {
  const copy = readFileSync(
    join(process.cwd(), "src/lib/screenshot-import-copy.ts"),
    "utf8"
  );
  const chat = readFileSync(
    join(process.cwd(), "src/components/CcAdvisorChat.tsx"),
    "utf8"
  );
  const advisor = readFileSync(
    join(process.cwd(), "src/lib/ai/cc-advisor.ts"),
    "utf8"
  );
  const route = readFileSync(
    join(process.cwd(), "src/app/api/chat/route.ts"),
    "utf8"
  );
  assert.match(copy, /Need a holdings screenshot/);
  assert.match(copy, /price list, not what you own/);
  assert.match(copy, /how many shares/);
  assert.match(copy, /what you paid/);
  assert.match(copy, /watchlist/);
  assert.doesNotMatch(copy, /Didn't land/);
  assert.match(chat, /reportScreenshotIssue/);
  assert.match(chat, /screenshotIssueCopy/);
  assert.match(advisor, /reportScreenshotIssue/);
  assert.match(advisor, /Not a holdings screenshot/);
  assert.match(route, /FALLBACK_SCREENSHOT_TEXT/);
});

run("sign-in reads as a product", () => {
  const product = readFileSync(
    join(process.cwd(), "src/lib/product.ts"),
    "utf8"
  );
  assert.match(product, /SIGNIN_WHO/);
  assert.match(product, /SIGNIN_POINTS/);
  assert.match(product, /See what your portfolio did/);
  const gate = readFileSync(
    join(process.cwd(), "src/components/SignInGate.tsx"),
    "utf8"
  );
  assert.match(gate, /PRODUCT_SENTENCE/);
  assert.match(gate, /SIGNIN_WHO/);
  assert.match(gate, /SIGNIN_POINTS/);
  assert.match(gate, /Sample/);
  assert.match(gate, /ticker: "RKLB"/);
  assert.match(gate, /ticker: "AMZN"/);
  assert.match(gate, /ticker: "MSFT"/);
  /*
   * The demo card, not one sentence of it. The copy was rewritten to say
   * what the reader should take from the move rather than restate the
   * number, and an invariant that pins a sentence turns every copy edit
   * into a failing build.
   */
  assert.match(gate, /\$RKLB rose 6\.8% today/);
  /*
   * The old assertion pinned "Check whether cheaper launches still hold",
   * a sentence deliberately rewritten: it leaned on a thesis nobody
   * outside the example knows and called a move "a bounce", which is the
   * market slang AGENTS.md bans. What is asserted now is that the sample
   * still explains the move rather than just restating the number, and
   * that it stays clear of the slang.
   */
  assert.match(gate, /whether something changed at the/);
  assert.doesNotMatch(gate, /<InsightText text="[^"]*\ba bounce\b/);
  assert.match(gate, /Thesis intact/);
  assert.match(gate, /Up ≥5%/);
  assert.doesNotMatch(gate, /did most of today/);
  assert.doesNotMatch(gate, /quiet down day/);
  assert.doesNotMatch(gate, /\$50k|AI manage/);
  assert.doesNotMatch(gate, /h-2\.5 w-10 rounded-sm bg-zinc-700/);
  assert.match(gate, /signin-rise-3 h-auto gap-4 p-4/);
  // Two columns from md, with both sides bounded so neither starves. The
  // exact track sizes have moved once already and are not the invariant.
  assert.match(gate, /md:grid-cols-\[minmax\(0,[^\]]+\)_minmax\(0,[^\]]+\)\]/);
  // The landing must scroll with the document, not inside the frame.
  // A y-auto overflow here is the hard colour cutoff at the fold.
  assert.doesNotMatch(gate, /overflow-y-auto/);
  assert.doesNotMatch(gate, /signin-rise-3 hidden h-auto md:block/);
  assert.doesNotMatch(gate, /Scoreboard/);
  assert.doesNotMatch(gate, /Communities stay read-only/);
  assert.match(gate, /inviteLandingCopy/);
});

run("community invite landing names the circle", () => {
  assert.deepEqual(inviteFromLocation("/communities/join", "?token=abc"), {
    kind: "community",
    name: null,
  });
  assert.equal(inviteFromLocation("/", "?token=abc"), null);
  assert.equal(
    inviteLandingCopy({ kind: "community", name: null }).title,
    "You've been invited to join a group."
  );
  assert.equal(
    inviteLandingCopy({ kind: "community", name: "Upside Circle" }).title,
    "You've been invited to join Upside Circle."
  );
  assert.equal(
    inviteLandingCopy({ kind: "classroom", name: null }).title,
    "You've been invited to a class."
  );
  assert.match(
    readFileSync(join(process.cwd(), "src/app/api/communities/join/route.ts"), "utf8"),
    /export const GET/
  );
});

run("inbox letters share one letterhead", () => {
  const invite = communityInviteCopy({
    name: "Upside Circle",
    url: "https://upsidelab.app/communities/join?token=abc",
    classroom: false,
  });
  assert.equal(invite.subject, "Join Upside Circle");
  assert.match(invite.html, /-apple-system/);
  assert.doesNotMatch(invite.html, /Georgia/);
  assert.match(invite.html, /#000000/);
  assert.match(invite.html, /Open the invite/);
  assert.doesNotMatch(invite.html, /\u2014/);
  assert.doesNotMatch(invite.text, /the book|the sheet/);
  const nudge = emptyBookNudgeHtml(emptyBookNudgeText("Martin Aasa"));
  assert.match(nudge, /Your portfolio is still empty/);
  assert.match(nudge, /Open Upside Lab/);
  assert.doesNotMatch(nudge, /\u2014/);
  const send = readFileSync("src/lib/send-note.ts", "utf8");
  assert.match(send, /fallbackNoteHtml/);
  const letter = readFileSync(
    join(process.cwd(), "src/lib/email-letter.ts"),
    "utf8"
  );
  assert.match(letter, /export function emailCard/);
});

run("one community invite can name several emails", () => {
  assert.deepEqual(
    parseInviteEmails("Ada@X.com, bob@y.com; cara@z.com"),
    { emails: ["ada@x.com", "bob@y.com", "cara@z.com"], invalid: [] }
  );
  assert.deepEqual(storeInviteEmails(["ada@x.com", "bob@y.com"]), "ada@x.com,bob@y.com");
  assert.equal(inviteEmailAllowlist("not-an-email").ok, false);
  const ok = inviteEmailAllowlist("ada@x.com, bob@y.com");
  assert.equal(ok.ok, true);
  if (ok.ok) assert.deepEqual(ok.emails, ["ada@x.com", "bob@y.com"]);
});

run("the recent Pulse and briefing bugs stay gone", () => {
  const morning = readFileSync(
    join(process.cwd(), "src/lib/morning-read.ts"),
    "utf8"
  );
  const notes = readFileSync(
    join(process.cwd(), "src/lib/weekly-letter.ts"),
    "utf8"
  );
  const shock = readFileSync(
    join(process.cwd(), "src/lib/book-shock.ts"),
    "utf8"
  );
  const sim = readFileSync(
    join(process.cwd(), "src/components/ScenarioSimulator.tsx"),
    "utf8"
  );
  assert.match(sim, /FluidTable/);
  assert.match(sim, /tableCols\(5,/);
  assert.doesNotMatch(sim, /htmlTable/);
  assert.doesNotMatch(sim, /min-w-\[40rem\]/);
  assert.doesNotMatch(sim, /Price now/);
  assert.doesNotMatch(sim, /Value now/);
  assert.match(sim, /<Stat/);
  assert.match(sim, /label="Portfolio after this"/);
  const drawer = readFileSync(
    join(process.cwd(), "src/components/TickerDrawer.tsx"),
    "utf8"
  );
  assert.doesNotMatch(morning, /did most of today's move/);
  assert.doesNotMatch(notes, /did most of the move/);
  assert.doesNotMatch(shock, /driver: "AI computers"/);
  assert.doesNotMatch(sim, /"AI computers":/);
  assert.match(drawer, /THEME_LABEL\[theme\]/);
  assert.match(drawer, /<FieldLabel htmlFor="ticker-thesis">/);
  assert.match(drawer, /<ToggleGroup/);
  assert.doesNotMatch(drawer, /tone="raised"/);
  assert.doesNotMatch(drawer, /bg-gain\/10/);
  assert.match(notes, /if \(action === "trim"\)/);
  // The letter suggests adding, trimming, or selling. A Pulse "watch"
  // verdict deliberately produces no suggestion at all, so trim can no
  // longer lose to watch the way it once did.
  assert.doesNotMatch(notes, /action === "watch"/);
});

/*
  The rule outlived the module that used to carry it.

  `investor-briefing.ts` built Home's cards and was guarded by five
  invariants, one of which said Home never rotates a covered-call pep
  talk. That module stopped shipping when `morning-read.ts` took the
  surface over, and the guard went on passing against code no reader
  could reach, which is the same drift that once had the suite asserting
  the privacy page still described weekday notes.

  Home is `buildMorningRead` now, so the rule is asserted there. It is
  worth keeping on its own terms: covered-call copy is gated on an
  explicit `knows_options`, and Home is read by every tier including
  people who have never heard of an option.
*/
run("Home copy never rotates a covered-call pep talk", () => {
  const home = [
    readFileSync(join(process.cwd(), "src/lib/morning-read.ts"), "utf8"),
    readFileSync(join(process.cwd(), "src/lib/book-insights.ts"), "utf8"),
  ].join("\n");
  for (const pep of [/write when/i, /sell a call/i, /call premium/i]) {
    assert.doesNotMatch(home, pep);
  }
});

run("gap thoughts name the weight and the mix", () => {
  const out = buildBookInsights([
    { ticker: "CRWV", value: 80_000 },
    { ticker: "NBIS", value: 20_000 },
  ]);
  const idea = out.idea ?? "";
  assert.match(idea, /\d+%/);
  assert.match(idea, /power|electric/i);
  assert.match(idea, /power shortage is a portfolio/);
  assert.doesNotMatch(idea, /Check |Add up |See /);
  assert.doesNotMatch(idea, /computer side/);
  assert.doesNotMatch(idea, /usual neighbor/);
  assert.doesNotMatch(idea, /sits next to that/);
  const morning = readFileSync(
    join(process.cwd(), "src/lib/morning-read.ts"),
    "utf8"
  );
  assert.match(morning, /Also/);
  assert.doesNotMatch(morning, /A thought/);
  assert.doesNotMatch(morning, /A few names did the work/);
  assert.doesNotMatch(morning, /A few holdings moved the whole number/);
  assert.match(morning, /pickSwingSentence/);
  assert.match(morning, /pickHomeNotices/);
  assert.match(morning, /Since you looked/);
  assert.doesNotMatch(morning, /!quiet && insights\.idea/);
  assert.doesNotMatch(morning, /!quiet && insights\.rotation/);
  assert.doesNotMatch(morning, /whether something changed at the company/);
});

run("advice copy names a check, not a vibe", () => {
  const shock = readFileSync(join(process.cwd(), "src/lib/book-shock.ts"), "utf8");
  const themes = readFileSync(
    join(process.cwd(), "src/lib/portfolio-personality.ts"),
    "utf8"
  );
  const insights = readFileSync(
    join(process.cwd(), "src/lib/book-insights.ts"),
    "utf8"
  );
  assert.doesNotMatch(shock, /money-app|money apps/);
  assert.doesNotMatch(themes, /money apps/);
  assert.doesNotMatch(themes, /a bit of everything/);
  assert.match(themes, /payments and finance/);
  assert.match(themes, /broad market funds/);
  assert.doesNotMatch(insights, /computer side/);
  assert.doesNotMatch(insights, /usual neighbor/);
});

run("Worth noticing names the two groups in plain English", () => {
  const holdings = [
    { ticker: "AVGO", value: 20_000, todayPct: -0.06 },
    { ticker: "CRWV", value: 18_000, todayPct: 0.05 },
    { ticker: "MSFT", value: 5_000, todayPct: 0.01 },
  ];
  const out = buildBookInsights(holdings);
  const line = out.rotation ?? "";
  assert.match(line, /\$AVGO/);
  assert.match(line, /chip makers/);
  assert.match(line, /\$CRWV/);
  assert.match(line, /AI computer/);
  assert.match(line, /not the same bet/);
  assert.match(line, /today/);
  assert.doesNotMatch(line, /money is leaving/);
  assert.doesNotMatch(line, /computer chips/);
  assert.doesNotMatch(line, /If you didn't mean to take that bet/);

  const friday = buildBookInsights(holdings, "friday").rotation ?? "";
  assert.match(friday, /on Friday/);
  assert.doesNotMatch(friday, /today/);
  const week = buildBookInsights(holdings, "this week").rotation ?? "";
  assert.match(week, /this week/);
  assert.doesNotMatch(week, /today/);

  const sunday = new Date("2026-08-16T12:00:00+03:00");
  assert.equal(insightWhen("closed", sunday), "friday");
  assert.equal(isUsAfterCashClose("closed", sunday), true);
  const monday = new Date("2026-08-17T11:00:00-04:00");
  assert.equal(insightWhen("open", monday), "today");

  assert.equal(forecastThemeForTicker("AAPL"), "software");
  assert.equal(
    buildBookInsights([{ ticker: "AAPL", value: 50_000, todayPct: 0.002 }])
      .rotation,
    null
  );
  assert.equal(
    buildBookInsights([{ ticker: "ZZZZ", value: 50_000, todayPct: 0 }]).rotation,
    null
  );
  assert.doesNotMatch(
    buildBookInsights([{ ticker: "AAPL", value: 50_000 }]).rotation ?? "",
    /other businesses/
  );

  const overview = readFileSync(
    join(process.cwd(), "src/components/OverviewDashboard.tsx"),
    "utf8"
  );
  assert.match(
    overview,
    /<p className="text-base font-medium leading-relaxed text-foreground">\s*\{morning\.sentence\}/
  );
  const header = overview.slice(
    overview.indexOf("{morning.moveLabel}"),
    overview.indexOf("<Scoreboard className=\"overview-fade\">")
  );
  assert.doesNotMatch(header, /morning\.sentence/);
});

run("empty book does not lead with Fund", () => {
  const overview = readFileSync(
    join(process.cwd(), "src/components/OverviewDashboard.tsx"),
    "utf8"
  );
  const emptyBlock = overview.slice(
    overview.indexOf("if (bookIsEmpty)"),
    overview.indexOf("return (", overview.indexOf("if (bookIsEmpty)") + 40)
  );
  // The empty return must not render HomeWorld.
  const emptyFn = overview.slice(
    overview.indexOf("function EmptyBook"),
    overview.indexOf("function signedMovePct")
  );
  assert.doesNotMatch(emptyFn, /HomeWorld/);
  assert.doesNotMatch(emptyFn, /browse circles/);
  assert.doesNotMatch(emptyFn, /Ask Margus first/);
  assert.match(emptyFn, /homework portfolio/);
  assert.match(emptyFn, /Do not paste a real portfolio/);
  void emptyBlock;
});

run("phone sheets switch from the header, not Overview chips", () => {
  const overview = readFileSync(
    join(process.cwd(), "src/components/OverviewDashboard.tsx"),
    "utf8"
  );
  const dash = readFileSync(
    join(process.cwd(), "src/components/Dashboard.tsx"),
    "utf8"
  );
  const picker = readFileSync(
    join(process.cwd(), "src/components/SheetPicker.tsx"),
    "utf8"
  );
  assert.doesNotMatch(overview, /HomeSheetChip/);
  assert.doesNotMatch(overview, /All portfolios/);
  assert.doesNotMatch(dash, /homeSheetId/);
  assert.match(dash, /<SheetPicker/);
  /*
   * `SheetPicker` keeps its identifier and its file name, which the rename
   * deliberately left alone. What a person reads in it is "portfolio", and
   * this is the assertion that says so: it caught "New sheet" still sitting
   * in the menu months after the rename was called done.
   */
  assert.match(picker, /All portfolios/);
  assert.match(picker, /New portfolio/);
  assert.doesNotMatch(picker, />\s*(?:All|New) sheets?\s*</);
  assert.match(picker, /aria-haspopup="menu"/);
});

run("lab sync writes conviction only", () => {
  const client = readFileSync(
    join(process.cwd(), "src/lib/lab-sync-client.ts"),
    "utf8"
  );
  const bundle = readFileSync(
    join(process.cwd(), "src/lib/lab-bundle.ts"),
    "utf8"
  );
  const api = readFileSync(join(process.cwd(), "src/app/api/lab/route.ts"), "utf8");
  assert.match(client, /conviction: bundle.conviction/);
  assert.doesNotMatch(client, /cashflows: bundle.cashflows/);
  assert.doesNotMatch(client, /arena: bundle.arena/);
  assert.doesNotMatch(bundle, /journal|cashflows|arena|badges/);
  assert.doesNotMatch(api, /journal|cashflows|defaultArena|badges/);
});

run("holdings table does not fake a thesis-intact badge", () => {
  const table = readFileSync(
    join(process.cwd(), "src/components/PortfolioTable.tsx"),
    "utf8"
  );
  assert.doesNotMatch(table, /Thesis intact/);
  assert.doesNotMatch(table, /ShieldCheck/);
});

run("Account is not a workspace room", () => {
  const switcher = readFileSync(
    join(process.cwd(), "src/components/WorkspaceSwitcher.tsx"),
    "utf8"
  );
  const header = readFileSync(
    join(process.cwd(), "src/components/AppHeader.tsx"),
    "utf8"
  );
  assert.doesNotMatch(switcher, /"Account"/);
  assert.match(header, /\{showWorkspaceNav && <WorkspaceSwitcher \/>\}/);
  assert.match(header, /\{end \?\? <DefaultAccountEnd \/>\}/);
});

run("UPSIDE LAB always goes to Overview at /", () => {
  const brand = readFileSync(
    join(process.cwd(), "src/components/HeaderBrand.tsx"),
    "utf8"
  );
  const header = readFileSync(
    join(process.cwd(), "src/components/AppHeader.tsx"),
    "utf8"
  );
  const dash = readFileSync(
    join(process.cwd(), "src/components/Dashboard.tsx"),
    "utf8"
  );
  const rooms = readFileSync(
    join(process.cwd(), "src/lib/workspace-rooms.ts"),
    "utf8"
  );
  /*
   * A link and nothing else. The lockup used to fire a GO_HOME event
   * alongside its href, because the book remembered its tab in state while
   * the URL said `/`, so arriving at `/` was not enough to mean Overview.
   * Overview *is* `/` now, so the href says the whole thing and the event
   * is gone. Anything that grows back here is the old shape returning.
   */
  assert.match(brand, /href="\/"/);
  assert.match(brand, /<Link/);
  assert.doesNotMatch(brand, /<button[\s>]/);
  assert.doesNotMatch(brand, /onClick/);
  assert.match(header, /<HeaderBrand \/>/);
  assert.doesNotMatch(header, /onBrandClick|brandTitle/);
  assert.doesNotMatch(dash, /onBrandClick/);
  assert.doesNotMatch(dash, /GO_HOME_EVENT|takeGoHomeRequest/);
  assert.doesNotMatch(rooms, /requestGoHome|takeGoHomeRequest/);
});

run("Forecast is always the base case", () => {
  const panel = readFileSync(
    join(process.cwd(), "src/components/ForecastPanel.tsx"),
    "utf8"
  );
  const route = readFileSync(
    join(process.cwd(), "src/app/api/forecast/plan/route.ts"),
    "utf8"
  );
  const plan = readFileSync(
    join(process.cwd(), "src/lib/forecast-plan.ts"),
    "utf8"
  );
  assert.doesNotMatch(panel, /Cautious/);
  assert.doesNotMatch(panel, /Optimistic/);
  assert.doesNotMatch(panel, /SPY/);
  assert.match(panel, /Drag across to read a year/);
  assert.doesNotMatch(panel, /mustBeTrue/);
  /*
   * The rule is that every number carries its reason, not that the reason
   * is rendered by one particular component. It used to be a `ScanList`
   * under the grid, and a reader read the grid, saw five paths and no
   * reasoning, and called the whole panel a guess. The reason is on the
   * card it belongs to now, so assert that it reaches the card.
   */
  assert.match(panel, /why=\{whyByTicker/);
  assert.match(panel, /<InsightText text=\{why\}/);
  assert.match(panel, /<Reading/);
  assert.doesNotMatch(route, /requestedStance/);
  assert.doesNotMatch(route, /body\.stance/);
  assert.doesNotMatch(plan, /STANCE = BEARISH/);
  assert.doesNotMatch(plan, /STANCE = BULLISH/);
});

run("Forecast does not call the model when a path is already saved", () => {
  const saved = {
    eoyTargets: [{ ticker: "NBIS", prices: { 2026: 1 } }],
  } as Parameters<typeof shouldAutoRefreshForecast>[0]["plan"];
  assert.equal(
    shouldAutoRefreshForecast({
      plan: { ...(saved as ForecastPlan), fallback: true },
      tickers: ["NBIS"],
      fullyCovered: false,
      cachedTickers: ["NBIS"],
    }).run,
    true
  );
  assert.equal(
    shouldAutoRefreshForecast({
      plan: saved,
      tickers: ["NBIS"],
      fullyCovered: false,
      cachedTickers: [],
    }).run,
    false
  );
  assert.equal(
    shouldAutoRefreshForecast({
      plan: null,
      tickers: ["NBIS"],
      fullyCovered: false,
      cachedTickers: ["NBIS"],
    }).run,
    false
  );
  assert.equal(
    shouldAutoRefreshForecast({
      plan: null,
      tickers: ["NBIS"],
      fullyCovered: true,
    }).run,
    false
  );
  assert.equal(
    shouldAutoRefreshForecast({
      plan: null,
      tickers: ["NBIS"],
      fullyCovered: false,
      cachedTickers: [],
    }).reason,
    "first-run"
  );
  assert.equal(
    shouldAutoRefreshForecast({
      plan: saved,
      tickers: ["NBIS", "CRWV"],
      fullyCovered: false,
      cachedTickers: ["NBIS"],
    }).reason,
    "new-holding"
  );
});

run("Forecast first-run always leaves a shaped path, never a skip", () => {
  const panel = readFileSync(
    join(process.cwd(), "src/components/ForecastPanel.tsx"),
    "utf8"
  );
  const route = readFileSync(
    join(process.cwd(), "src/app/api/forecast/plan/route.ts"),
    "utf8"
  );
  assert.doesNotMatch(panel, /auto:\s*true/);
  assert.doesNotMatch(panel, /auto:\s*Boolean\(opts/);
  assert.ok(isFallbackForecastPlan(buildFallbackForecastPlan({
    forecast: {
      years: FORECAST_YEARS,
      rows: [],
      currentTotal: 0,
      eoyTotals: {
        2026: 0,
        2027: 0,
        2028: 0,
        2029: 0,
        2030: 0,
      },
      gainPct: 0,
    },
    portfolioId: "p1",
    portfolioName: "Test",
  })));
  assert.match(panel, /Ask Margus/);
  assert.doesNotMatch(panel, /hasn't weighed in yet/);
  assert.doesNotMatch(panel, /Nothing for you to do/);
  assert.match(panel, /seedFallbackIfNeeded/);
  assert.match(panel, /buildFallbackForecastPlan/);
  assert.doesNotMatch(route, /beginBackgroundLlm/);
  assert.doesNotMatch(route, /skipped:\s*true/);
  assert.match(route, /buildFallbackForecastPlan/);
  assert.match(route, /fallback:\s*true/);

  const spot = 277.78;
  const flat = {
    2026: spot,
    2027: spot,
    2028: spot,
    2029: spot,
    2030: spot,
  } as ForecastModel["rows"][number]["eoyPrices"];
  const forecast: ForecastModel = {
    years: FORECAST_YEARS,
    rows: [
      {
        ticker: "NBIS",
        shares: 500,
        currentPrice: spot,
        currentValue: 138890,
        eoyPrices: flat,
        eoyValues: flat,
        targetedYears: {
          2026: false,
          2027: false,
          2028: false,
          2029: false,
          2030: false,
        },
        gainPct: 0,
        hasTargets: false,
      },
    ],
    currentTotal: 138890,
    eoyTotals: flat,
    gainPct: 0,
  };
  const plan = buildFallbackForecastPlan({
    forecast,
    portfolioId: "p1",
    portfolioName: "Aasad",
    now: new Date("2026-08-16T00:00:00Z"),
  });
  const row = plan.eoyTargets.find((t) => t.ticker === "NBIS");
  assert.ok(row);
  for (const year of FORECAST_YEARS) {
    assert.equal(typeof row!.prices[year], "number");
    assert.ok(row!.prices[year]! > 0);
  }
  assert.notEqual(row!.prices[2026], spot);
  assert.ok(row!.prices[2030]! > spot);
  assert.ok(plan.periods.length >= 2);
});

run("chat does not ping the model before the first token", () => {
  const model = readFileSync(join(process.cwd(), "src/lib/ai/model.ts"), "utf8");
  const chat = readFileSync(
    join(process.cwd(), "src/app/api/chat/route.ts"),
    "utf8"
  );
  assert.doesNotMatch(model, /prompt:\s*"ping"/);
  assert.match(model, /rememberStreamingProvider/);
  assert.match(chat, /markChatActive/);
  assert.match(chat, /rememberStreamingProvider/);
  assert.match(chat, /speaking:\s*true/);
  assert.match(chat, /reasoningEffort:\s*"low"/);
  assert.match(model, /GROQ_CHAT_MODEL/);
  assert.match(model, /openai\/gpt-oss-20b/);
  assert.match(model, /STRUCTURED_PROVIDER_OPTIONS/);
  assert.match(
    readFileSync(join(process.cwd(), "src/app/api/forecast/plan/route.ts"), "utf8"),
    /STRUCTURED_PROVIDER_OPTIONS/
  );
  assert.doesNotMatch(
    readFileSync(join(process.cwd(), "src/app/api/forecast/plan/route.ts"), "utf8"),
    /effort:\s*"high"/
  );
});

run("Pulse Breaks-if hides the copy-paste kill switch", () => {
  const boilerplate =
    "This breaks if the reason you own it disappears. Lost the customer, a restatement, or guidance that kills the multi-year case. A quiet day is not that.";
  assert.equal(isGenericThesisBreak(boilerplate), true);
  assert.equal(
    isGenericThesisBreak(
      "the reason you own it disappears. Lost the customer, a restatement, or guidance that kills the multi-year case. A quiet day is not that."
    ),
    true
  );
  assert.equal(cleanThesisBreak(boilerplate), "");
  assert.equal(cleanThesisBreak(""), "");
  assert.equal(
    cleanThesisBreak(
      "Data-center bookings stall for two quarters and the big cloud contracts slip."
    ),
    "Data-center bookings stall for two quarters and the big cloud contracts slip."
  );
  const next = reconcilePulseCheck(check({ thesisBreak: boilerplate }));
  assert.equal(next.thesisBreak, "");
});

run("Pulse scan sits in its own card, not under the lookup bar", () => {
  const page = readFileSync(
    join(process.cwd(), "src/components/PulsePage.tsx"),
    "utf8"
  );
  const schema = readFileSync(
    join(process.cwd(), "src/lib/thesis-pulse-schema.ts"),
    "utf8"
  );
  assert.match(page, /Today's scan/);
  assert.match(page, /<ScanList/);
  assert.match(page, /scanRows\.map/);
  assert.doesNotMatch(page, /Add yours/);
  assert.doesNotMatch(page, /<Reading/);
  assert.doesNotMatch(page, /Market mood/);
  // The legal line lives behind the eye on each check, not as a subtitle
  // on the room. Wallpaper here taught people to skip it.
  assert.doesNotMatch(page, /ADVICE_DISCLAIMER_SHORT/);
  assert.match(page, /WhyThis/);
  assert.match(page, /pulseProvenance/);
  assert.match(page, /actions=\{/);
  assert.doesNotMatch(
    page,
    /skippedTickers\.length > 0[\s\S]{0,400}humanizeMargusText\(summary\)/
  );
  assert.doesNotMatch(page, /humanizeMargusText\(summary\)/);
  assert.doesNotMatch(schema, /lead with any sharp drops/);
  // The room strips the trailing stop through the library's own helper
  // rather than doing it inline, so the rule is asserted below against
  // `scanLineBody` instead of against the page's wiring.
  assert.match(page, /scanLineBody/);

  const pulseLib = readFileSync(
    join(process.cwd(), "src/lib/thesis-pulse.ts"),
    "utf8"
  );
  assert.match(pulseLib, /export function stripTrailingScanStop/);
  assert.match(pulseLib, /stripTrailingScanStop\(body\.trim\(\)\)/);
  // A ticker is stored data and two import paths write one without checking
  // its shape, so this must never be a regular expression built from it: a
  // holding saved as "A(B" would throw while Pulse renders and take the
  // room down for the reader and every co-owner.
  assert.equal(scanLineBody("A(B", "Something happened"), "Something happened");
  assert.equal(scanLineBody("NBIS", "$NBIS  Looks like a chase."), "Looks like a chase");
  assert.equal(scanLineBody("NBIS", "$NBISX moved today"), "$NBISX moved today");
  assert.equal(
    stripTrailingScanStop("What's Next for the Company?."),
    "What's Next for the Company?"
  );
  assert.equal(
    stripTrailingScanStop("Today move is -5.8%."),
    "Today move is -5.8%"
  );
  assert.doesNotMatch(
    pulseScanLine({
      ticker: "AVGO",
      effectivePct: -0.058,
      moveLabel: "Today",
    }),
    /\.$/
  );
  assert.doesNotMatch(
    pulseScanLine({
      ticker: "RDDT",
      effectivePct: 0.127,
      moveLabel: "Today",
      headline: "What's Next for the Company?",
    }),
    /\.$/
  );
  assert.doesNotMatch(
    pulseScanLine({
      ticker: "NBIS",
      effectivePct: 0.089,
      moveLabel: "Today",
      headline: "Can South Wales Deployment Help Nebius Expand Its AI Cloud Footprint?",
    }),
    /\.\s*$/
  );

  const quiet: PulseCheck = {
    ticker: "MSFT",
    situation: ["Nothing unusual today."],
    moveReason: "Today move is +0.4%.",
    thesisStatus: "intact",
    earningsNote: "",
    action: "hold",
    addLevel: "",
    verdict: "Hold. Come back if the story actually changes.",
  };
  assert.doesNotMatch(
    pulseScanLine({
      ticker: "AVGO",
      effectivePct: -0.058,
      moveLabel: "Today",
      check: {
        ...quiet,
        ticker: "AVGO",
        moveReason: "Today move is -5.8%.",
      },
    }),
    /\.$/
  );
  const hot: PulseCheck = {
    ticker: "RDDT",
    situation: ["It's running hot."],
    moveReason: "Looks like a chase, not a new story.",
    thesisStatus: "watch",
    earningsNote: "",
    action: "trim",
    trimPct: 10,
    addLevel: "",
    verdict: "Take a little off. The story is the same, the price ran.",
  };
  assert.equal(
    pulseNeedsExplainer({ isBigMove: false, leftHold: false, check: quiet }),
    false
  );
  assert.equal(
    pulseNeedsExplainer({ isBigMove: true, leftHold: false, check: quiet }),
    true
  );
  assert.equal(
    pulseNeedsExplainer({ isBigMove: false, leftHold: false, check: hot }),
    true
  );
  const scan = buildPulseScan([
    {
      ticker: "AVGO",
      isBigMove: true,
      leftHold: false,
      effectivePct: -0.07,
      moveLabel: "Today",
      check: {
        ...quiet,
        ticker: "AVGO",
        moveReason: "Financing talk, not the chip story.",
        verdict: "",
      },
    },
    {
      ticker: "RDDT",
      isBigMove: true,
      leftHold: false,
      effectivePct: 0.127,
      moveLabel: "Today",
      check: hot,
    },
    {
      ticker: "MSFT",
      isBigMove: false,
      leftHold: false,
      effectivePct: 0.004,
      moveLabel: "Today",
      check: quiet,
    },
  ]);
  assert.deepEqual(
    scan.map((r) => r.ticker),
    ["AVGO", "RDDT"]
  );
  assert.match(scan[0]!.line, /\$AVGO/);
  assert.match(scan[0]!.line, /Financing talk/);
  assert.match(scan[1]!.line, /\$RDDT/);
  assert.match(
    pulseScanLine({
      ticker: "AVGO",
      effectivePct: -0.07,
      moveLabel: "Today",
    }),
    /\$AVGO/
  );
});

run("Pulse puts hold-exits and 5% movers on top", () => {
  assert.equal(isBigPulseMove(0.05), true);
  assert.equal(isBigPulseMove(-0.05), true);
  assert.equal(isBigPulseMove(0.049), false);
  assert.equal(isBigPulseMove(null), false);

  const now = Date.parse("2026-08-15T12:00:00Z");
  assert.equal(
    pulseLeftHold(
      "add",
      [
        { action: "hold", at: "2026-08-14T10:00:00Z" },
        { action: "add", at: "2026-08-15T10:00:00Z" },
      ],
      now
    ),
    true
  );
  assert.equal(
    pulseLeftHold(
      "add",
      [
        { action: "hold", at: "2026-08-13T10:00:00Z" },
        { action: "add", at: "2026-08-13T11:00:00Z" },
      ],
      now
    ),
    false
  );
  assert.equal(
    pulseLeftHold("hold", [{ action: "hold", at: "2026-08-15T10:00:00Z" }], now),
    false
  );
  assert.equal(
    pulseLeftHold(
      "trim",
      [
        { action: "hold", at: "2026-08-14T10:00:00Z" },
        { action: "add", at: "2026-08-15T09:00:00Z" },
        { action: "trim", at: "2026-08-15T10:00:00Z" },
      ],
      now
    ),
    false
  );

  const ranked = sortPulseCandidates(
    [
      { ticker: "QUIET", effectivePct: 0.01, bookPct: 0.4, currentValue: 400 },
      { ticker: "UP", effectivePct: 0.08, bookPct: 0.05, currentValue: 50 },
      { ticker: "DOWN", effectivePct: -0.06, bookPct: 0.05, currentValue: 50 },
      { ticker: "LEFT", effectivePct: 0.01, bookPct: 0.1, currentValue: 100 },
    ],
    { leftHoldTickers: new Set(["LEFT"]) }
  );
  assert.deepEqual(
    ranked.map((r) => r.ticker),
    ["LEFT", "UP", "DOWN", "QUIET"]
  );

  const movers = sortPulseCandidates([
    { ticker: "A", effectivePct: 0.06, bookPct: 0.5 },
    { ticker: "B", effectivePct: -0.11, bookPct: 0.1 },
    { ticker: "C", effectivePct: 0.09, bookPct: 0.2 },
  ]);
  assert.deepEqual(
    movers.map((r) => r.ticker),
    ["B", "C", "A"]
  );
});

run("Pulse does not hourly-refresh the model", () => {
  const page = readFileSync(
    join(process.cwd(), "src/components/PulsePage.tsx"),
    "utf8"
  );
  assert.doesNotMatch(page, /setInterval\(\(\) => \{[\s\S]*runPulse/);
  assert.match(page, /shouldAutoPulseTicker/);
  assert.match(page, /Check again/);
  assert.equal(
    shouldAutoPulseTicker({
      needsAttention: false,
      cachedAt: "2026-08-15T00:00:00Z",
      check: buildFallbackPulseCheck({
        ticker: "NBIS",
        effectivePct: 0,
        moveLabel: "Today",
      } as Parameters<typeof buildFallbackPulseCheck>[0]),
    }),
    false
  );
  assert.equal(
    shouldAutoPulseTicker({
      needsAttention: false,
      cachedAt: "2026-08-15T00:00:00Z",
      check: {
        ticker: "NBIS",
        situation: [],
        moveReason: "",
        thesisStatus: "intact",
        earningsNote: "",
        action: "hold",
        addLevel: "",
        verdict: "",
      },
    }),
    true
  );
  assert.equal(shouldAutoPulseTicker({ needsAttention: true }), true);
  assert.equal(shouldAutoPulseTicker({ needsAttention: false }), true);
  assert.equal(
    shouldAutoPulseTicker({
      needsAttention: false,
      cachedAt: "2026-01-01T00:00:00Z",
      check: {
        ticker: "AVGO",
        situation: ["Down more than a typical day."],
        moveReason: "Today move is -5.8%.",
        thesisStatus: "intact",
        earningsNote: "",
        action: "add",
        addLevel: "around $120",
        verdict: "",
      },
    }),
    true
  );
  assert.doesNotMatch(
    pulseScanLine({
      ticker: "AVGO",
      effectivePct: 0.018,
      moveLabel: "Today",
      check: {
        ticker: "AVGO",
        situation: ["Down more than a typical day."],
        moveReason: "Today move is -5.8%.",
        thesisStatus: "intact",
        earningsNote: "",
        action: "add",
        addLevel: "around $120",
        verdict: "",
      },
    }),
    /Today move is|-5\.8/
  );
});

run("Pulse matches $AAPL to AAPL and keeps trimPct required for Groq", () => {
  assert.equal(pulseTickerKey("$AAPL"), "AAPL");
  assert.equal(pulseTickerKey(" aapl "), "AAPL");
  assert.equal(pulseTickerKey("AAPL"), "AAPL");
  const schema = readFileSync(
    join(process.cwd(), "src/lib/thesis-pulse-schema.ts"),
    "utf8"
  );
  assert.doesNotMatch(schema, /trimPct:[\s\S]{0,120}\.optional\(\)/);
  assert.match(schema, /trimPct:[\s\S]{0,120}\.nullable\(\)/);
});

run("background Margus waits while chat is live", () => {
  markChatActive(0);
  endBackgroundLlm();
  endBackgroundLlm();
  markChatActive(5_000);
  assert.equal(chatIsBusy(), true);
  assert.equal(beginBackgroundLlm(), false);
  markChatActive(0);
  assert.equal(chatIsBusy(), false);
  assert.equal(beginBackgroundLlm(), true);
  assert.equal(beginBackgroundLlm(), false);
  endBackgroundLlm();
});

run("Daily Duel paints the last pick before the network returns", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/DailyDuelCard.tsx"),
    "utf8"
  );
  const view = readFileSync(
    join(process.cwd(), "src/components/CircleHome.tsx"),
    "utf8"
  );
  const route = readFileSync(
    join(process.cwd(), "src/app/api/communities/[id]/duel/route.ts"),
    "utf8"
  );
  assert.match(src, /loadCommunityDuelCache/);
  assert.match(src, /saveCommunityDuelCache/);
  assert.match(src, /loadStickyDuelPick/);
  assert.match(src, /useHydratedCache/);
  assert.match(src, /useLayoutEffect/);
  assert.match(src, /initialDuel/);
  assert.match(src, /currentDuelSessionKey/);
  assert.match(src, /keepPick/);
  assert.doesNotMatch(src, /todayKeyInTz/);
  assert.doesNotMatch(src, /overview-fade/);
  assert.match(view, /initialDuel=\{duelCache\}/);
  assert.match(route, /currentDuelSessionKey/);
  assert.doesNotMatch(route, /todayKeyInTz/);
});

run("Daily Duel is the next open US session, never yesterday", () => {
  // Friday 3pm ET (EDT = UTC-4) is still Friday's session.
  const fridayOpen = new Date("2026-08-14T19:00:00.000Z");
  assert.equal(currentDuelSessionKey(fridayOpen), "2026-08-14");
  assert.equal(duelCanSettle("2026-08-14", fridayOpen), false);
  assert.equal(duelSessionLabel("2026-08-14", fridayOpen), "today");
  // Friday 4pm ET rolls to Monday.
  const fridayClose = new Date("2026-08-14T20:00:00.000Z");
  assert.equal(currentDuelSessionKey(fridayClose), "2026-08-17");
  assert.equal(duelCanSettle("2026-08-14", fridayClose), true);
  assert.equal(duelCanSettle("2026-08-17", fridayClose), false);
  // Weekend looks at Monday, and does not settle the live card.
  const sunday = new Date("2026-08-16T14:00:00.000Z");
  assert.equal(currentDuelSessionKey(sunday), "2026-08-17");
  assert.equal(duelCanSettle("2026-08-17", sunday), false);
  assert.equal(duelSessionLabel("2026-08-17", sunday), "Monday");
  assert.equal(
    duelSessionCopy("2026-08-17", sunday),
    "Who finishes Monday's US session higher."
  );
  const saturday = new Date("2026-08-15T16:00:00.000Z");
  assert.equal(currentDuelSessionKey(saturday), "2026-08-17");
  // Monday morning is still Monday. After the close it is Tuesday.
  const mondayOpen = new Date("2026-08-17T14:00:00.000Z");
  assert.equal(currentDuelSessionKey(mondayOpen), "2026-08-17");
  const mondayClose = new Date("2026-08-17T20:00:00.000Z");
  assert.equal(currentDuelSessionKey(mondayClose), "2026-08-18");
});

run("Communities list does not blank a cached circle while it refreshes", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/CommunitiesList.tsx"),
    "utf8"
  );
  assert.doesNotMatch(src, /hadCache = communities\.length/);
  assert.match(src, /loadCommunityListCache/);
  assert.match(src, /communities\.length === 0 && loading/);
  assert.match(src, /Public circles/);
  // The rule is that a pending request says so, not the words it uses.
  assert.match(src, /Waiting for approval/);
  assert.doesNotMatch(src, /Requested · pending/);
  assert.match(src, /no public circles right now/i);
  assert.doesNotMatch(src, /discover\.length > 0 &&/);
  assert.match(src, /<PanelHeader/);
  assert.match(src, /flex flex-col gap-4/);
  assert.doesNotMatch(src, /sm:grid-cols-2/);
  assert.doesNotMatch(src, /HomeWorld/);
  assert.doesNotMatch(src, /fundOnly/);
  assert.doesNotMatch(src, /Compare books/);
  assert.doesNotMatch(src, /which sheets/);
  assert.match(src, />\s*Circle\s*</);
  assert.doesNotMatch(src, /Start a class[\s\S]{0,80}How the class runs/);
});

run("Daily Duel is not on Home", () => {
  const home = readFileSync(
    join(process.cwd(), "src/components/OverviewDashboard.tsx"),
    "utf8"
  );
  assert.doesNotMatch(home, /DailyDuelCard/);
});

run("options onboarding is regularly-only", () => {
  /*
   * Asked in the walkthrough now, of everybody rather than only of people
   * with an empty portfolio, which is how the nulls this rule depends on
   * finally start draining. The answer itself is unchanged: only "yes,
   * regularly" is `knowsOptions`, because an unambiguous yes is the one
   * answer worth deriving a hidden feature from.
   */
  const onboarding = readFileSync(
    join(process.cwd(), "src/components/WelcomeTour.tsx"),
    "utf8"
  );
  assert.match(onboarding, /q2 === "regularly"/);
  assert.doesNotMatch(onboarding, /q2 !== "never"/);
});

run("onboarding asks about the one Sunday email, nothing else", () => {
  /*
   * The walkthrough replaced the modal on 2026-08-23, and the screen copy
   * moved out of the component into `screenCopy` so that exactly one
   * `#welcome-tour-title` exists in the tree for `aria-labelledby`. So the
   * headings are asserted where they now live and the behaviour where it
   * now lives, rather than both against one file that no longer exists.
   */
  const onboarding = readFileSync(
    join(process.cwd(), "src/components/WelcomeTour.tsx"),
    "utf8"
  );
  const copy = readFileSync(
    join(process.cwd(), "src/lib/welcome-tour.ts"),
    "utf8"
  );
  assert.match(copy, /Want the Sunday email/);
  // There is exactly one email now: no weekday checkbox, no second state.
  assert.doesNotMatch(onboarding, /noteMorning/);
  assert.doesNotMatch(onboarding, /Weekdays/);
  assert.doesNotMatch(copy, /Weekdays/);
  assert.match(onboarding, /noteSunday, setNoteSunday\] = useState\(true\)/);
  assert.match(onboarding, /One email a week/);
  assert.match(copy, /This is \$\{PRODUCT_NAME\}/);
  assert.match(copy, /Add what you own/);
  assert.match(copy, /Names you are watching/);
  assert.match(onboarding, /saveWatchlist/);
});

run("popular ticker snapshot is 30 names, one month at a time", () => {
  assert.equal(FALLBACK_POPULAR_TICKERS.length, POPULAR_TICKER_COUNT);
  assert.equal(sanitizePopularTickers(["nvda", "NVDA", "bad!", "AAPL"]).length, 30);
  /*
   * The seven everybody can name come first, whatever the month's movers
   * were, which is why this no longer echoes back the caller's own order:
   * a reader offered RIG and PLUG and no Apple is the fault this seeding
   * exists to prevent (see AGENTS.md, and never `.slice()` the result).
   */
  assert.deepEqual(
    sanitizePopularTickers(["nvda", "AAPL"]).slice(0, ALWAYS_POPULAR_TICKERS.length),
    [...ALWAYS_POPULAR_TICKERS]
  );
  assert.match(currentPopularMonth(new Date("2026-08-15T12:00:00Z")), /^2026-08$/);
});

run("earnings dates use the call when it already happened", () => {
  const now = new Date("2026-08-15T12:00:00Z");
  const crwv = resolveYahooEarnings(
    {
      history: [{ period: "-1q", quarter: "2026-03-31T00:00:00.000Z" }],
      earningsDates: ["2026-11-11T12:00:00.000Z"],
      earningsCallDates: ["2026-08-11T12:00:00.000Z"],
      nextIsEstimate: true,
    },
    now
  );
  assert.equal(crwv.lastKey, "2026-08-11");
  assert.equal(crwv.nextKey, "2026-11-11");
  assert.equal(crwv.nextIsEstimate, true);
  const nvda = resolveYahooEarnings(
    {
      history: [{ period: "-1q", quarter: "2026-04-30T00:00:00.000Z" }],
      earningsDates: ["2026-08-26T12:00:00.000Z"],
      earningsCallDates: ["2026-08-26T12:00:00.000Z"],
      nextIsEstimate: false,
    },
    now
  );
  assert.equal(nvda.nextKey, "2026-08-26");
  assert.ok((nvda.daysUntilNext ?? 0) > 7);
  const block = formatEarningsCalendarBlock([
    {
      ticker: "CRWV",
      lastDate: "2026-08-11",
      daysSinceLast: 4,
      nextDate: "2026-11-11",
      daysUntilNext: 88,
      nextIsEstimate: true,
    },
  ]);
  assert.match(block, /Do not invent/);
  assert.match(block, /\$CRWV/);
  assert.match(block, /2026-08-11/);
  const prompt = buildCcSystemPrompt({
    portfolioName: "Test",
    cashBalance: 0,
    holdings: [],
    rows: [],
    totals: {
      cost: 0,
      value: 0,
      roiPct: 0,
      roiDollar: 0,
      yield2wAvg: 0,
      premiumTotal: 0,
    },
    earnings: [
      {
        ticker: "NVDA",
        lastDate: null,
        daysSinceLast: null,
        nextDate: "2026-08-26",
        daysUntilNext: 11,
      },
    ],
  } as CcChatContext);
  assert.match(prompt, /Do not invent/);
  assert.match(prompt, /\$NVDA/);
  assert.match(prompt, /2026-08-26/);
  assert.doesNotMatch(prompt, /Other portfolios \(read-only/);
  assert.doesNotMatch(prompt, /copy something across/);
  assert.doesNotMatch(prompt, /open that portfolio and ask again/i);
  assert.match(prompt, /Never ask the reader to pick a portfolio/);
});

run("watchlist look is a range read, not a made-up target", () => {
  const low = watchLook({
    price: 102,
    changePercent: -0.01,
    sparkline: [100, 118, 116, 114, 112, 110, 108, 106, 104, 103],
  });
  assert.equal(low.kind, "look");
  assert.match(low.headline, /recent low/i);
  const high = watchLook({
    price: 117,
    changePercent: 0.01,
    sparkline: [100, 102, 104, 106, 108, 110, 112, 114, 116, 117],
  });
  assert.equal(high.kind, "wait");
  assert.match(high.headline, /recent high/i);
  const report = watchLook(
    {
      price: 110,
      changePercent: 0,
      sparkline: [100, 102, 104, 106, 108, 110],
    },
    3
  );
  assert.equal(report.kind, "report");
  assert.match(report.headline, /3 days/);
  const strip = readFileSync(
    join(process.cwd(), "src/components/WatchlistStrip.tsx"),
    "utf8"
  );
  assert.match(strip, /Fetch price/);
  assert.match(strip, /cache: "no-store"/);
  assert.match(strip, /watchLook/);
  assert.match(strip, /Open Pulse/);
});

run("watchlist typeahead matches names as you type", () => {
  const local = localTickerSuggestions(
    "GOO",
    ["GOOGL", "GOOG", "MSFT"],
    new Set()
  );
  assert.deepEqual(
    local.map((r) => r.symbol),
    ["GOOGL", "GOOG"]
  );
  const merged = mergeTickerSuggestions(
    local,
    [{ symbol: "GOOGL", name: "Alphabet Inc." }],
    new Set(["MSFT"])
  );
  assert.equal(merged[0]?.symbol, "GOOGL");
  assert.equal(merged[0]?.name, "Alphabet Inc.");
  assert.equal(looksLikeTickerQuery("NVDA"), true);
  assert.equal(looksLikeTickerQuery("spy5"), true);
  assert.equal(looksLikeTickerQuery("Apple"), false);
  assert.equal(looksLikeTickerQuery("iShares Core"), false);
  assert.equal(
    pickTickerSuggestion("Apple", [
      { symbol: "AAPL", name: "Apple Inc." },
      { symbol: "APLE", name: "Apple Hospitality REIT" },
    ])?.symbol,
    "AAPL"
  );
  assert.equal(
    pickTickerSuggestion("NVDA", [
      { symbol: "NVDL", name: "GraniteShares 2x NVIDIA" },
      { symbol: "NVDA", name: "NVIDIA Corporation" },
    ])?.symbol,
    "NVDA"
  );
  assert.equal(
    pickTickerSuggestion("SPY5", [
      { symbol: "SPY", name: "SPDR S&P 500 ETF Trust" },
      { symbol: "SPY5.DE", name: "iShares Core S&P 500" },
    ])?.symbol,
    "SPY5.DE"
  );
  assert.equal(
    pickTickerSuggestion("NVIDIA", [
      { symbol: "NVDA", name: "NVIDIA Corporation" },
    ])?.symbol,
    "NVDA"
  );
  assert.equal(
    pickTickerSuggestion("BTC", [
      { symbol: "BTC", name: "Grayscale Bitcoin Mini Trust" },
      { symbol: "BTC-USD", name: "Bitcoin" },
    ])?.symbol,
    "BTC-USD"
  );
  assert.equal(sanitizeTickerQuery("Apple Inc"), "Apple Inc");
  assert.equal(sanitizeTickerQuery("SPY5"), "SPY5");
  const strip = readFileSync(
    join(process.cwd(), "src/components/WatchlistStrip.tsx"),
    "utf8"
  );
  assert.match(strip, /\/api\/market\/search/);
  assert.match(strip, /sanitizeTickerQuery/);
  assert.match(strip, /pickTickerSuggestion/);
  const holding = readFileSync(
    join(process.cwd(), "src/components/HoldingModal.tsx"),
    "utf8"
  );
  assert.match(holding, /sanitizeTickerQuery/);
  assert.match(holding, /pickTickerSuggestion/);
});

run("Pulse can price a bare EU ETF like VUAA", () => {
  assert.equal(normalizeYahooTicker("VUAA"), "VUAA.DE");
  assert.equal(normalizeYahooTicker("vuaa"), "VUAA.DE");
  assert.equal(normalizeYahooTicker("VUAA.L"), "VUAA.L");
  assert.equal(normalizeYahooTicker("VWCE"), "VWCE.DE");
  assert.equal(normalizeYahooTicker("SPY5"), "SPY5.DE");
  assert.equal(normalizeYahooTicker("XETRA:SPY5"), "SPY5.DE");
  assert.equal(normalizeYahooTicker("ETR:SPY5"), "SPY5.DE");
  assert.equal(normalizeYahooTicker("SPYL"), "SPYL.DE");
  assert.equal(normalizeYahooTicker("EUNL"), "EUNL.DE");
  assert.equal(normalizeYahooTicker("NVDA"), "NVDA");
  assert.equal(normalizeYahooTicker("€VUAA"), "VUAA.DE");
  assert.equal(normalizeYahooTicker("$€VUAA"), "VUAA.DE");
  assert.equal(normalizeYahooTicker("EXXT"), "EXXT.DE");
  assert.equal(normalizeYahooTicker("LHV1T"), "LHV1T.TL");
  assert.equal(normalizeYahooTicker("LHV"), "LHV1T.TL");
  assert.equal(normalizeYahooTicker("TAL:LHV1T"), "LHV1T.TL");
  assert.equal(normalizeYahooTicker("LHV1T.TL"), "LHV1T.TL");
  assert.equal(normalizeYahooTicker("GRD1R"), "GRD1R.RG");
  assert.equal(normalizeYahooTicker("TEL1L"), "TEL1L.VS");
  assert.equal(balticYahooSymbol("LHV1T"), "LHV1T.TL");
  assert.equal(balticYahooSymbol("NVDA"), null);
  assert.equal(resolveImportTicker("LHV1T"), "LHV1T.TL");
  assert.equal(resolveImportTicker("FOO", "EE0000000000"), "FOO.TL");
  assert.equal(resolveImportTicker("BAR", "LV0000000000"), "BAR.RG");
  assert.equal(resolveImportTicker("BAZ", "LT0000000000"), "BAZ.VS");
  assert.deepEqual(yahooQuoteCandidates("SPY5"), ["SPY5.DE"]);
  assert.deepEqual(yahooQuoteCandidates("XETRA:SPY5"), ["SPY5.DE"]);
  assert.deepEqual(yahooQuoteCandidates("LHV1T"), ["LHV1T.TL"]);
  assert.deepEqual(yahooQuoteCandidates("EXXT"), ["EXXT.DE"]);
  const nvda = yahooQuoteCandidates("NVDA");
  assert.equal(nvda[0], "NVDA");
  assert.ok(nvda.includes("NVDA.DE"));
  assert.ok(nvda.includes("NVDA.L"));
  assert.ok(nvda.includes("NVDA.AS"));
  assert.ok(nvda.includes("NVDA.HE"));
  assert.ok(nvda.includes("NVDA.TL"));
  const unknown = yahooQuoteCandidates("ZZZX");
  assert.equal(unknown[0], "ZZZX");
  assert.ok(unknown.includes("ZZZX.DE"));
  assert.ok(unknown.includes("ZZZX.HE"));
  assert.ok(unknown.includes("ZZZX.TL"));
  assert.equal(tickerStem("VUAA.DE"), "VUAA");
  assert.equal(tickerStem("LHV1T.TL"), "LHV1T");
  assert.equal(sanitizeTickerDraft("€vuaa"), "VUAA");
  assert.equal(sanitizeTickerDraft("$€VUAA"), "VUAA");
  assert.equal(cashtag("€VUAA"), "VUAA.DE");
  assert.equal(cashtag("$€VUAA"), "VUAA.DE");
  assert.equal(cashtag("VUAA.DE"), "VUAA.DE");
  assert.equal(cashtag("EXXT"), "EXXT.DE");
  assert.equal(cashtag("LHV1T"), "LHV1T.TL");
  assert.equal(cashtag("NBIS"), "$NBIS");
  assert.equal(cashtag("NVDA"), "$NVDA");
  assert.equal(cashtag("BTC-USD"), "$BTC");
  assert.equal(normalizeYahooTicker("BTC"), "BTC");
  assert.deepEqual(yahooQuoteCandidates("BTC-USD"), ["BTC-USD"]);
  assert.equal(tickerStem("BTC-USD"), "BTC");
  const pulse = readFileSync(
    join(process.cwd(), "src/components/PulsePage.tsx"),
    "utf8"
  );
  assert.match(pulse, /normalizeYahooTicker/);
  assert.match(pulse, /resolveListedTicker/);
  assert.match(pulse, /\/api\/market\/search/);
  assert.match(pulse, /sanitizeTickerQuery/);
  assert.match(pulse, /resolveTypedTicker/);
  assert.match(pulse, /pickTickerSuggestion/);
  assert.match(pulse, /looksLikeTickerQuery/);
  const quotes = readFileSync(
    join(process.cwd(), "src/lib/market/quotes.ts"),
    "utf8"
  );
  assert.match(quotes, /aliasResolvedQuotes/);
  assert.match(quotes, /yahooQuoteCandidates/);
  const yahoo = readFileSync(
    join(process.cwd(), "src/lib/market/yahoo.ts"),
    "utf8"
  );
  assert.match(yahoo, /yahooQuoteCandidates/);
  assert.match(yahoo, /resolveYahooListedSymbol/);
  assert.match(yahoo, /usdPer/);
  assert.match(yahoo, /nativePrice/);
  const search = readFileSync(
    join(process.cwd(), "src/lib/market/ticker-search-yahoo.ts"),
    "utf8"
  );
  assert.match(search, /\.DE/);
  const home = readFileSync(
    join(process.cwd(), "src/components/OverviewDashboard.tsx"),
    "utf8"
  );
  assert.match(home, /Add a holding/);
  assert.doesNotMatch(home, /Ask Margus/);
  assert.doesNotMatch(home, /function MobileHomeHero/);
  assert.doesNotMatch(home, /overview-fade hidden md:block/);
  assert.doesNotMatch(
    home,
    /btn-(?:primary|secondary)[^"'`]*\b(?:hidden|md:hidden|sm:hidden)/,
    "btn-primary sets display, so hidden on the same className never wins"
  );
  const btnHits = offendersOf(
    /className=\{?["'`][^"'`]*btn-(?:primary|secondary)[^"'`]*\b(?:hidden|md:hidden|sm:hidden|lg:hidden)/
  );
  assert.deepEqual(
    btnHits,
    [],
    `hide the wrapper, not the mustard button. Offenders: ${btnHits.join(", ")}`
  );
  const topBar = readFileSync(
    join(process.cwd(), "src/components/mobile/MobileTopBar.tsx"),
    "utf8"
  );
  assert.match(topBar, /HeaderBrand/);
  assert.match(topBar, /alwaysType/);
  assert.doesNotMatch(topBar, /grid-cols-\[5rem/);
  const dock = readFileSync(
    join(process.cwd(), "src/components/mobile/MobileTabBar.tsx"),
    "utf8"
  );
  /*
   * A capsule that hugs its contents, carrying glyphs and no words, with
   * one neutral marker sliding behind the cells. `rounded-full` on both the
   * shell and the cells, which is the one radius pair that stays concentric
   * at any size; the old `rounded-xl` / `rounded-lg` pair was arithmetic
   * (12 - 4 = 8) and this needs none.
   *
   * The accent is spent on news rather than on where you are: the only
   * saturated pixel left on the bar is the alert dot.
   */
  assert.match(dock, /rounded-full/);
  // The marker is `DockMarker`, shared with the laptop bar; its fill is
  // asserted where it is written.
  assert.match(dock, /<DockMarker /);
  assert.match(
    readFileSync(join(process.cwd(), "src/components/DockMarker.tsx"), "utf8"),
    /bg-foreground\/10/
  );
  assert.doesNotMatch(dock, /bg-primary text-primary-foreground/);
  /*
   * The promise that makes a wordless bar safe: it says the name of every
   * room you touch, on `pointerdown` rather than on `click`, because a name
   * arriving after the tap it was meant to answer is a name nobody needed.
   * `onFocus` fires it too, since a keyboard never presses anything.
   *
   * Painted names under every glyph were tried and taken back out: the
   * reference bar carries four destinations across ~380px and this one
   * carries six across 374px, 60% of the room for the same cell, and six
   * words at 12px in 374px is a wall of text however it is set. See the
   * note at the top of the component.
   */
  assert.match(dock, /onPointerDown=\{\(e\) => say\(shortLabel, e\.currentTarget\)\}/);
  assert.match(dock, /onFocus=\{\(e\) => say\(shortLabel, e\.currentTarget\)\}/);
  /*
   * Which room you are in is a WEIGHT, and that is the one thing kept from
   * the labelled round. Filled against outline is the reference's read and
   * it does not survive this icon set, half of which is open paths.
   */
  assert.match(dock, /strokeWidth=\{on \? 2\.5 : 1\.75\}/);
  /*
   * Every cell is the link it draws. The bar used to cancel its own
   * navigation with `preventDefault` and set state instead, stashing the
   * tab token because a client navigation dropped the query string it
   * depended on. A path is not dropped, so both are gone.
   */
  assert.match(dock, /href: LAB_PATH/);
  assert.match(dock, /href: GROWTH_PATH/);
  assert.doesNotMatch(dock, /stashOpenTab|onSelect\b/);
  assert.doesNotMatch(dock, /label: "Account"/);
  const frame = readFileSync(
    join(process.cwd(), "src/lib/page-shell.ts"),
    "utf8"
  );
  assert.match(frame, /bg-background text-foreground/);
  assert.doesNotMatch(frame, /md:bg-\[radial-gradient/);
});

run("listing currency chips and FX convert kronor", () => {
  assert.equal(listingCurrencyFromTicker("NVDA"), "USD");
  assert.equal(listingCurrencyFromTicker("LHV1T"), "EUR");
  assert.equal(listingCurrencyFromTicker("VWCE.DE"), "EUR");
  assert.equal(listingCurrencyFromTicker("VOLV-B.ST"), "SEK");
  assert.equal(listingCurrencyFromTicker("EQNR.OL"), "NOK");
  assert.equal(listingCurrencyFromTicker("VOD.L"), "GBP");
  assert.equal(listingCurrency("VOLV-B.ST", "SEK"), "SEK");
  assert.equal(listingCurrency("NVDA", "USD"), "USD");
  assert.equal(normalizeListedPrice(9840, "GBp").code, "GBP");
  assert.equal(normalizeListedPrice(9840, "GBp").amount, 98.4);
  const fx = usdPerMapFromFx({
    eurUsd: 1.1,
    gbpUsd: 1.3,
    usdPer: { SEK: 0.1 },
  });
  assert.equal(listingAmountToUsd(100, "EUR", fx), 110);
  assert.equal(usdToListingAmount(110, "EUR", fx), 100);
  assert.equal(listingAmountToUsd(142.5, "SEK", fx), 14.25);
  assert.equal(
    listingAmountToUsd(1.1582117, "USD", { USD: 1 }),
    1.16,
    "USD quotes round to cents, which is why the strip cannot use quotes[EURUSD=X].price"
  );
  assert.equal(
    listingCurrenciesAreMixed([{ ticker: "NVDA" }, { ticker: "AAPL" }]),
    false
  );
  assert.equal(
    listingCurrenciesAreMixed([{ ticker: "LHV1T" }, { ticker: "VWCE.DE" }]),
    false
  );
  assert.equal(
    listingCurrenciesAreMixed([{ ticker: "NVDA" }, { ticker: "VWCE.DE" }]),
    true
  );
  const table = readFileSync(
    join(process.cwd(), "src/components/PortfolioTable.tsx"),
    "utf8"
  );
  assert.match(table, /TickerSymbol/);
  const chip = readFileSync(
    join(process.cwd(), "src/components/TickerSymbol.tsx"),
    "utf8"
  );
  assert.match(chip, /ListingCurrencyChip/);
  assert.match(chip, /showCurrency/);
  assert.match(chip, /rounded-md/);
  assert.match(chip, /text-xs font-semibold/);
});

run("macro strip reads live EURUSD, not the cent-rounded quote price", () => {
  const prev = { vix: 14.2, eurusd: 1.1573, btc: 118000, tenYear: 4.21 };
  const next = macroFromQuotesPayload(
    {
      quotes: {
        "^VIX": { price: 14.8, nativePrice: 14.8 },
        "EURUSD=X": { price: 1.16, nativePrice: 1.1582117 },
        "BTC-USD": { price: 119432.12, nativePrice: 119432.12 },
        "^TNX": { price: 4.19, nativePrice: 4.19 },
      },
      fx: { eurUsd: 1.1582117 },
    },
    prev
  );
  assert.equal(next.eurusd, 1.1582117);
  assert.equal(next.vix, 14.8);
  assert.equal(next.tenYear, 4.19);
  const kept = macroFromQuotesPayload({ quotes: {}, fx: {} }, prev);
  assert.equal(kept.eurusd, 1.1573);
  assert.equal(kept.vix, 14.2);
});

run("onboarding lets you pick this month's popular names", () => {
  const strip = readFileSync(
    join(process.cwd(), "src/components/WatchlistStrip.tsx"),
    "utf8"
  );
  const cron = readFileSync(
    join(process.cwd(), "src/app/api/cron/popular-tickers/route.ts"),
    "utf8"
  );
  const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
  assert.match(strip, /Watching/);
  assert.match(strip, /\/api\/popular-tickers/);
  assert.match(cron, /refreshPopularTickers/);
  assert.match(vercel, /\/api\/cron\/popular-tickers/);
  assert.match(vercel, /0 7 1 \* \*/);
});

run("nightly snapshots can store mark-to-market", () => {
  const snap = readFileSync(
    join(process.cwd(), "src/lib/book-snapshot.ts"),
    "utf8"
  );
  const cron = readFileSync(
    join(process.cwd(), "src/app/api/cron/snapshot/route.ts"),
    "utf8"
  );
  assert.match(snap, /computeSnapshotMarks/);
  assert.match(cron, /payload.marks = computeSnapshotMarks/);
});

run("Pulse never nags that it is guessing", () => {
  const pulse = readFileSync(
    join(process.cwd(), "src/components/PulsePage.tsx"),
    "utf8"
  );
  const pulseApi = readFileSync(
    join(process.cwd(), "src/app/api/thesis/pulse/route.ts"),
    "utf8"
  );
  const chat = readFileSync(
    join(process.cwd(), "src/app/api/chat/route.ts"),
    "utf8"
  );
  const model = readFileSync(
    join(process.cwd(), "src/lib/ai/model.ts"),
    "utf8"
  );
  assert.doesNotMatch(pulse, /Pulse is guessing/);
  assert.doesNotMatch(pulse, /Check all again/);
  assert.doesNotMatch(pulse, /Write why you own/);
  assert.doesNotMatch(pulse, /Pulling news/);
  assert.doesNotMatch(pulse, /Couldn't get a full model/);
  assert.doesNotMatch(pulse, /The model was busy/);
  assert.doesNotMatch(pulse, /buildFallbackPulseCheck/);
  assert.doesNotMatch(pulseApi, /Couldn't get a full model/);
  assert.doesNotMatch(pulseApi, /The model was busy/);
  assert.doesNotMatch(pulseApi, /Couldn't reach the model/);
  assert.match(pulseApi, /isEmptyPulseCheck/);
  assert.match(pulseApi, /buildFallbackPulseCheck/);
  assert.match(pulseApi, /checksForCandidates/);
  assert.match(pulse, /<ActionBadge action=\{action\} \/>/);
  assert.doesNotMatch(chat, /backup on your next/);
  assert.doesNotMatch(chat, /The model provider is overloaded/);
  assert.match(chat, /fallbackChatResponse/);
  assert.doesNotMatch(model, /The model provider is overloaded/);
});

run("panel copy is not pinched to a reading measure", () => {
  const files = [
    "src/components/ui/Panel.tsx",
    "src/components/LabSheet.tsx",
    "src/components/PulsePage.tsx",
    "src/components/SeasonalityPage.tsx",
    "src/components/OverviewDashboard.tsx",
    "src/components/ForecastPanel.tsx",
  ];
  for (const rel of files) {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    assert.doesNotMatch(
      src,
      /max-w-(?:xl|2xl|prose)/,
      `${rel} still caps in-panel copy so it wraps short of the card`
    );
  }
});

run("split rows stack on a phone so copy fills the card", () => {
  const panel = readFileSync(
    join(process.cwd(), "src/components/ui/Panel.tsx"),
    "utf8"
  );
  assert.match(panel, /export const SPLIT_ROW/);
  assert.match(panel, /flex flex-col gap-3 sm:flex-row/);
  const files = [
    "src/components/ui/Panel.tsx",
    "src/components/LabSheet.tsx",
    "src/components/SeasonalityPage.tsx",
    "src/components/ForecastPanel.tsx",
    "src/components/TickerDrawer.tsx",
    "src/components/AccountPage.tsx",
  ];
  for (const rel of files) {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    assert.doesNotMatch(
      src,
      /flex flex-wrap items-start justify-between[\s\S]{0,220}min-w-0 flex-1/,
      `${rel} still pinches copy into the leftover strip next to controls`
    );
  }
  const seasonality = readFileSync(
    join(process.cwd(), "src/components/SeasonalityPage.tsx"),
    "utf8"
  );
  assert.match(seasonality, /SPLIT_ROW/);
  assert.match(seasonality, /SPLIT_COPY/);
});

run("a setting is a label on the left and one control on the right", () => {
  /*
    This check was deleted rather than repointed when `SETTING_ROW` moved
    out of Panel.tsx and `pinActions` was replaced by `SettingBar`. The rule
    it guards did not go anywhere: AGENTS.md still says Account settings are
    a label left, a control right, one row at every width, and a wrapped
    control under its own label is what that exists to prevent.

    Assert the rule, not today's class string beyond the two properties
    that are the rule: one row, and a control that does not shrink.
  */
  const row = readFileSync(
    join(process.cwd(), "src/components/ui/setting-row.tsx"),
    "utf8"
  );
  assert.match(row, /export const SETTING_ROW/);
  assert.match(row, /export function SettingBar/);
  assert.match(row, /export function PinnedHeader/);
  assert.match(row, /flex-nowrap/);
  assert.match(row, /justify-between/);
  assert.match(row, /shrink-0/);
  /*
    Deliberately says nothing about `item.tsx`. The deleted check demanded
    `flex-nowrap` and an `ml-auto shrink-0` actions row there, which that
    file has never had: `Item` is the generic shadcn list row and its
    `flex-wrap` is what makes `ItemHeader`'s `basis-full` wrap onto its own
    line. That half was asserting a UI nobody wrote, and dropping it was
    right. The settings rule above is the part that was real.
  */
  const account = readFileSync(
    join(process.cwd(), "src/components/AccountPage.tsx"),
    "utf8"
  );
  assert.match(account, /SettingBar/);
});

run("assumed YTD NAV uses current size and forward-fills gaps", () => {
  /*
   * This used to assert `2 * 0 (BBB not listed yet)`, which is not what
   * the name says and not what the chart is for. Forward-filling a gap
   * means carrying a name's last close through a day it did not trade,
   * and there is something to carry. Before a name's *first* close there
   * is nothing, and pricing it at zero does not draw the book slightly
   * low, it draws a rise that never happened: two flat holdings whose
   * histories start three days apart came out at +50%.
   *
   * So the path starts on the first day the whole book can be priced, and
   * both halves are asserted here: BBB's late start moves the beginning,
   * and AAA's missing Jan 6 is carried forward from Jan 5.
   */
  const points = reconstructAssumedNav(
    1000,
    [
      { ticker: "AAA", shares: 10 },
      { ticker: "BBB", shares: 2 },
    ],
    {
      AAA: [
        { date: "2026-01-02", close: 10 },
        { date: "2026-01-05", close: 12 },
      ],
      BBB: [
        { date: "2026-01-05", close: 50 },
        { date: "2026-01-06", close: 50 },
      ],
    }
  );
  // Jan 2 is not drawn: BBB cannot be priced, so the book cannot be.
  assert.equal(points.length, 2);
  assert.equal(points[0]!.date, "2026-01-05");
  // Jan 5: cash 1000 + 10*12 + 2*50
  assert.equal(points[0]!.nav, 1220);
  // Jan 6: AAA did not print, so its Jan 5 close is carried forward.
  assert.equal(points[1]!.nav, 1220);
  const weeks = downsampleToWeeks(points);
  assert.ok(weeks.length >= 1);
  assert.equal(weeks[weeks.length - 1]!.nav, 1220);
});

run("year chart never stitches a live total onto another book's path", () => {
  const hist = [
    { date: "2026-01-02", nav: 400_000 },
    { date: "2026-01-03", nav: 620_000 },
    { date: "2026-01-04", nav: 780_000 },
  ];
  assert.deepEqual(
    paintBookNavSeries({
      hist,
      histBelongsToBook: false,
      liveNav: 210_000,
    }),
    []
  );
  const painted = paintBookNavSeries({
    hist,
    histBelongsToBook: true,
    liveNav: 790_000,
  });
  assert.equal(painted[painted.length - 1]!.nav, 790_000);
  assert.equal(painted[painted.length - 1]!.date, "Live");
});

run("year chart never paints a zero or empty live tip", () => {
  const hist = [
    { date: "2026-01-02", nav: 400_000 },
    { date: "2026-01-03", nav: 620_000 },
    { date: "2026-01-04", nav: 0 },
  ];
  const noLive = paintBookNavSeries({
    hist,
    histBelongsToBook: true,
    liveNav: 0,
  });
  assert.equal(noLive.length, 2);
  assert.equal(noLive[noLive.length - 1]!.nav, 620_000);
  const withLive = paintBookNavSeries({
    hist,
    histBelongsToBook: true,
    liveNav: 790_000,
  });
  assert.equal(withLive[withLive.length - 1]!.nav, 790_000);
  assert.ok(withLive.every((p) => p.nav > 0));
});

run("year chart can start from a single recorded night", () => {
  const painted = paintBookNavSeries({
    hist: [{ date: "2026-08-15", nav: 600_000 }],
    histBelongsToBook: true,
    liveNav: 751_030,
  });
  assert.equal(painted.length, 2);
  assert.equal(painted[0]!.date, "2026-08-15");
  assert.equal(painted[0]!.nav, 600_000);
  assert.equal(painted[1]!.date, "Live");
  assert.equal(painted[1]!.nav, 751_030);

  const flat = paintBookNavSeries({
    hist: [{ date: "2026-08-15", nav: 600_000 }],
    histBelongsToBook: true,
    liveNav: 600_000,
  });
  assert.equal(flat.length, 2);
  assert.equal(flat[1]!.date, "Live");
});

run("YTD anchor keeps the assumed shape and pins the year size", () => {
  const start = startNavFromYtdPct(120, 0.2);
  assert.equal(start, 100);
  const scaled = applyYtdAnchor(
    [
      { date: "2026-01-02", nav: 200 },
      { date: "2026-01-03", nav: 250 },
      { date: "2026-01-04", nav: 300 },
    ],
    100,
    150
  );
  assert.equal(scaled[0]!.nav, 100);
  assert.equal(scaled[1]!.nav, 125);
  assert.equal(scaled[2]!.nav, 150);
});

run("empty class plan is anything goes", () => {
  const trade = resolveClassroomTrade(
    parseClassPlan({}),
    new Date("2026-08-15T12:00:00Z")
  );
  assert.equal(trade.kind, "open");
  assert.equal(trade.canBuy, true);
  assert.equal(trade.canSell, true);
  assert.equal(trade.studentLocked, false);
});

run("class starting cash shows thousands separators", () => {
  assert.equal(formatCashDigits(100_000), "100,000");
  assert.equal(parseCashDigits("$100,000"), 100_000);
  assert.equal(parseStartingCash("100,000"), 100_000);
  assert.equal(parseStartingCash("$1,000,000"), 1_000_000);
});

run("class templates cover the usual teacher setups", () => {
  assert.ok(CLASS_TEMPLATES.length >= 6);
  const ids = new Set(CLASS_TEMPLATES.map((t) => t.id));
  assert.equal(ids.size, CLASS_TEMPLATES.length);
  for (const t of CLASS_TEMPLATES) {
    assert.ok(t.title.trim());
    assert.ok(t.blurb.trim());
    assert.ok(t.assignment.trim());
    assert.doesNotMatch(t.assignment, /—/);
    assert.doesNotMatch(t.blurb, /thesis|NAV|sleeve/i);
    assert.ok(t.cash >= 10_000 && t.cash <= 1_000_000);
  }
});

run("buy week blocks sell", () => {
  const now = new Date("2026-08-15T12:00:00Z");
  const plan = parseClassPlan(
    {
      periods: [
        {
          id: "a",
          kind: "buy",
          startsAt: "2026-08-10T00:00:00Z",
          endsAt: "2026-08-20T00:00:00Z",
        },
      ],
    },
    now
  );
  const trade = resolveClassroomTrade(plan, now);
  assert.equal(trade.kind, "buy");
  assert.equal(trade.canBuy, true);
  assert.equal(trade.canSell, false);
  assert.equal(trade.canAdjust, true);
  assert.equal(allowClassAction(trade, "sell"), false);
});

run("startPeriodNow ends the live stretch", () => {
  const now = new Date("2026-08-15T12:00:00Z");
  const plan = parseClassPlan(
    {
      periods: [
        {
          id: "a",
          kind: "buy",
          startsAt: "2026-08-10T00:00:00Z",
          endsAt: null,
        },
      ],
    },
    now
  );
  const next = startPeriodNow(plan, "closed", now);
  const trade = resolveClassroomTrade(
    next,
    new Date("2026-08-15T12:00:01Z")
  );
  assert.equal(trade.kind, "closed");
  assert.equal(trade.canBuy, false);
  assert.equal(trade.canCash, false);
});

run("startPeriodNow is a no-op when that rule is already on", () => {
  const now = new Date("2026-08-15T12:00:00Z");
  const plan = parseClassPlan(
    {
      periods: [
        {
          id: "a",
          kind: "buy",
          startsAt: "2026-08-10T00:00:00Z",
          endsAt: null,
        },
      ],
    },
    now
  );
  const next = startPeriodNow(plan, "buy", now);
  assert.equal(next.periods.length, 1);
  assert.equal(next.periods[0]!.id, "a");
});

run("parseClassPlan drops stretches that already ended", () => {
  const now = new Date("2026-08-15T12:00:00Z");
  const plan = parseClassPlan(
    {
      periods: [
        {
          id: "old",
          kind: "buy",
          startsAt: "2026-08-01T00:00:00Z",
          endsAt: "2026-08-10T00:00:00Z",
        },
        {
          id: "live",
          kind: "closed",
          startsAt: "2026-08-10T00:00:00Z",
          endsAt: null,
        },
      ],
    },
    now
  );
  assert.equal(plan.periods.length, 1);
  assert.equal(plan.periods[0]!.id, "live");
});

run("latest overlapping stretch wins", () => {
  const now = new Date("2026-08-15T12:00:00Z");
  const plan = parseClassPlan(
    {
      periods: [
        {
          id: "a",
          kind: "buy",
          startsAt: "2026-08-01T00:00:00Z",
          endsAt: "2026-08-30T00:00:00Z",
        },
        {
          id: "b",
          kind: "fix",
          startsAt: "2026-08-14T00:00:00Z",
          endsAt: "2026-08-16T00:00:00Z",
        },
      ],
    },
    now
  );
  const trade = resolveClassroomTrade(plan, now);
  assert.equal(trade.kind, "fix");
  assert.equal(trade.canSell, true);
  assert.equal(trade.canBuy, false);
});

run("holding write classify buy sell adjust", () => {
  assert.equal(
    classifyHoldingWrite({ isNew: true, isDelete: false }),
    "buy"
  );
  assert.equal(
    classifyHoldingWrite({ isNew: false, isDelete: true }),
    "sell"
  );
  assert.equal(
    classifyHoldingWrite({
      isNew: false,
      isDelete: false,
      existingShares: 10,
      nextShares: 12,
    }),
    "buy"
  );
  assert.equal(
    classifyHoldingWrite({
      isNew: false,
      isDelete: false,
      existingShares: 10,
      nextShares: 8,
    }),
    "sell"
  );
  assert.equal(
    classifyHoldingWrite({
      isNew: false,
      isDelete: false,
      existingShares: 10,
      nextShares: 10,
    }),
    "adjust"
  );
  assert.deepEqual(
    holdingWriteActions({
      isNew: false,
      isDelete: false,
      tickerChanged: true,
    }),
    ["buy", "sell"]
  );
});

run("class sheets stay out of the real book", () => {
  assert.deepEqual(
    realBookPortfolios([
      { id: "real", classroom_community_id: null },
      { id: "hw", classroom_community_id: "class-1" },
    ]).map((p) => p.id),
    ["real"]
  );
  assert.deepEqual(
    realBookPortfolios([{ id: "hw", classroom_community_id: "class-1" }]).map(
      (p) => p.id
    ),
    []
  );
  assert.equal(
    isPaperClassOnly([{ classroom_community_id: "class-1" }]),
    true
  );
  assert.equal(
    isPaperClassOnly([{ classroom_community_id: null }]),
    false
  );
  assert.equal(
    isPaperClassOnly(
      [{ classroom_community_id: "class-1" }],
      [{ kind: "circle" }]
    ),
    false
  );
  assert.equal(
    isPaperClassOnly([], [{ kind: "classroom" }]),
    true
  );
  assert.deepEqual(
    ownedBookPortfolios([{ id: "hw", classroom_community_id: "class-1" }]).map(
      (p) => p.id
    ),
    ["hw"]
  );
  assert.deepEqual(
    ownedBookPortfolios([
      { id: "real", classroom_community_id: null },
      { id: "hw", classroom_community_id: "class-1" },
    ]).map((p) => p.id),
    ["real"]
  );
});

run("paper class still gets Pulse, Forecast, Fund, and Circle", () => {
  const dash = readFileSync(
    join(process.cwd(), "src/components/Dashboard.tsx"),
    "utf8"
  );
  const switcher = readFileSync(
    join(process.cwd(), "src/components/WorkspaceSwitcher.tsx"),
    "utf8"
  );
  const dock = readFileSync(
    join(process.cwd(), "src/components/BookModeDock.tsx"),
    "utf8"
  );
  assert.match(dash, /ownedBookPortfolios/);
  assert.match(dash, /forecastVisible \?/);
  assert.doesNotMatch(dash, /paper\.only/);
  assert.doesNotMatch(switcher, /paper\.only/);
  assert.match(switcher, /\/upside-portfolio/);
  assert.match(switcher, /\/communities/);
  assert.doesNotMatch(dock, /paper\.only/);
  const notes = readFileSync(
    join(process.cwd(), "src/lib/note-cron.ts"),
    "utf8"
  );
  assert.match(notes, /ownedBookPortfolios/);
});

run("inbox notes say Thesis intact to a person", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/weekly-letter.ts"),
    "utf8"
  );
  assert.match(src, /Thesis intact/);
  assert.doesNotMatch(src, /Last Pulse:/);
  assert.match(src, /humanPulseStatus/);
});

run("full-book restore only touches sheets you own", () => {
  const ids = snapshotSheetsForOwner(
    {
      portfolios: [
        { id: "mine-a" },
        { id: "theirs" },
        { id: "mine-b" },
        { name: "no-id" },
      ],
      holdings: [],
    },
    ["mine-a", "mine-b", "ghost"]
  );
  assert.deepEqual(ids, ["mine-a", "mine-b"]);
});

run("buying a name spends cash and selling adds it back", () => {
  assert.equal(tradeCashDelta({ buyShares: 10, buyPrice: 20 }), -200);
  assert.equal(tradeCashDelta({ sellShares: 10, sellPrice: 25 }), 250);
  assert.equal(
    tradeCashDelta({
      sellShares: 5,
      sellPrice: 10,
      buyShares: 2,
      buyPrice: 8,
    }),
    34
  );
  assert.equal(
    importCashDelta(
      [{ ticker: "AAPL", shares: 10, buy_price: 100 }],
      [{ ticker: "AAPL", shares: 12, buy_price: 110 }],
      false,
      {}
    ),
    -220
  );
  assert.equal(
    importCashDelta(
      [{ ticker: "AAPL", shares: 10, buy_price: 100 }],
      [{ ticker: "AAPL", shares: 4, buy_price: 100 }],
      false,
      { AAPL: 90 }
    ),
    540
  );
  assert.equal(
    importCashDelta(
      [
        { ticker: "AAPL", shares: 10, buy_price: 100 },
        { ticker: "MSFT", shares: 2, buy_price: 400 },
      ],
      [{ ticker: "AAPL", shares: 10, buy_price: 100 }],
      true,
      { MSFT: 410 }
    ),
    820
  );
  // Borrowed money is negative cash on any portfolio, paper or real.
  assert.equal(
    sheetCashBalance({ cash_balance: -1600 }),
    -1600
  );
  assert.equal(
    sheetCashBalance({
      cash_balance: -1600,
      classroom_community_id: "class-1",
    }),
    -1600
  );
  assert.equal(tracksTradeCash({}), false);
  assert.equal(tracksTradeCash({ classroom_community_id: "class-1" }), true);
  const before = {
    portfolios: [
      {
        id: "real-1",
        name: "Real",
        slug: "real",
        sort_order: 1,
        cash_balance: 0,
      },
    ],
    holdings: [],
  };
  const after = upsertHolding(before, {
    portfolio_id: "real-1",
    ticker: "AAPL",
    shares: 10,
    buy_price: 160,
    eoy_target: null,
    target_call_pct: 0.15,
    stock_target_override: null,
    sort_order: 1,
  });
  assert.equal(after.portfolios[0]!.cash_balance, 0);
  const paper = upsertHolding(
    {
      portfolios: [
        {
          id: "hw-1",
          name: "Homework",
          slug: "hw",
          sort_order: 1,
          cash_balance: 10_000,
          classroom_community_id: "class-1",
        },
      ],
      holdings: [],
    },
    {
      portfolio_id: "hw-1",
      ticker: "AAPL",
      shares: 10,
      buy_price: 160,
      eoy_target: null,
      target_call_pct: 0.15,
      stock_target_override: null,
      sort_order: 1,
    }
  );
  assert.equal(paper.portfolios[0]!.cash_balance, 8400);
  const realNav = buildOverview(
    [{ id: "r", name: "R", slug: "r", sort_order: 0, cash_balance: -1600 }],
    [
      {
        id: "h1",
        portfolio_id: "r",
        ticker: "AAPL",
        shares: 10,
        buy_price: 100,
        eoy_target: null,
        target_call_pct: 0.15,
        stock_target_override: null,
        sort_order: 1,
      },
    ],
    {
      AAPL: {
        ticker: "AAPL",
        price: 200,
        change: 0,
        changePercent: 0,
        previousClose: 200,
        sparkline: [],
        marketState: null,
        preMarketPrice: null,
        preMarketChange: null,
        preMarketChangePercent: null,
        postMarketPrice: null,
        postMarketChange: null,
        postMarketChangePercent: null,
      },
    }
  );
  // The borrowed $1,600 counts against the total rather than vanishing.
  assert.equal(realNav.totals.cash, -1600);
  assert.equal(realNav.totals.equityValue, 2000);
  assert.equal(realNav.totals.totalValue, 400);
  const holdingsApi = readFileSync(
    join(process.cwd(), "src/app/api/holdings/route.ts"),
    "utf8"
  );
  assert.match(holdingsApi, /applyTradeCashDelta/);
  assert.doesNotMatch(holdingsApi, /applyPortfolioCashDelta/);
  const cashModal = readFileSync(
    join(process.cwd(), "src/components/CashModal.tsx"),
    "utf8"
  );
  // A phone number pad has no minus key, so the sign is a toggle.
  assert.match(cashModal, /Money borrowed/);
  assert.doesNotMatch(cashModal, /allowNegative/);
  const portfoliosApi = readFileSync(
    join(process.cwd(), "src/app/api/portfolios/route.ts"),
    "utf8"
  );
  assert.doesNotMatch(portfoliosApi, /cannot go below zero/);
  assert.match(portfoliosApi, /isSafeSignedMoney\(raw\)/);
});

run("saves list hides nightly rows", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/api/snapshots/route.ts"),
    "utf8"
  );
  assert.match(src, /neq\("kind", "nightly"\)/);
  assert.match(src, /kind === "nightly"/);
});

run("fun facts and circle facts do not say NAV or dry powder", () => {
  /*
    Home's own fun facts were generated on every build and rendered nowhere
    (the field was never read), so the module went. Only the circle's facts
    reach a reader now.
  */
  assert.ok(!existsSync(join(process.cwd(), "src/lib/fun-facts.ts")));
  const circle = readFileSync(
    join(process.cwd(), "src/lib/community-fun-facts.ts"),
    "utf8"
  );
  const compound = readFileSync(
    join(process.cwd(), "src/lib/compound-play.ts"),
    "utf8"
  );
  const personality = readFileSync(
    join(process.cwd(), "src/lib/portfolio-personality.ts"),
    "utf8"
  );
  const league = readFileSync(
    join(process.cwd(), "src/components/CommunityView.tsx"),
    "utf8"
  );
  assert.doesNotMatch(circle, /dry-powder stash|dry powder/i);
  assert.doesNotMatch(circle, /Circle NAV/);
  assert.doesNotMatch(circle, /live mark/i);
  assert.doesNotMatch(circle, /risk-taker|Risk Taker/i);
  assert.doesNotMatch(personality, /volatile treasure/i);
  assert.doesNotMatch(league, /The Risk Taker/);
  assert.doesNotMatch(compound, /thesis breaks/);
  assert.doesNotMatch(compound, /index-ish beta/);
  assert.doesNotMatch(compound, /long-only beta/);
  assert.doesNotMatch(compound, /this book's assumed rate/);
  assert.match(compound, /your rate on this plan/);
  const compareUi = readFileSync(
    join(process.cwd(), "src/components/CompoundInterestSheet.tsx"),
    "utf8"
  );
  assert.doesNotMatch(compareUi, /This plan/);
  assert.doesNotMatch(compareUi, /featured \? "brand"/);
  assert.doesNotMatch(compareUi, /compareTakeaway/);
  assert.doesNotMatch(compound, /buildCompareTakeaway/);
  assert.doesNotMatch(compound, /The gap:/);
  assert.match(compareUi, /<Scoreboard cols=\{2\}/);
  assert.match(compareUi, /s\.color/);
  const play = readFileSync(
    join(process.cwd(), "src/lib/compound-play.ts"),
    "utf8"
  );
  assert.match(play, /PALETTE\.muted/);
  assert.match(play, /PALETTE\.teal/);
  assert.match(play, /PALETTE\.steel/);
  assert.match(play, /PALETTE\.bronze/);
});

run("Fund page labels Margus's note Thesis", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/UpsidePortfolioPage.tsx"),
    "utf8"
  );
  assert.match(src, /label="Thesis"/);
  assert.match(src, /function FundPosition/);
  const card = src.slice(
    src.indexOf("function FundNote"),
    src.indexOf("export function UpsidePortfolioPage")
  );
  assert.match(card, /Hold for/);
  assert.match(card, /label="Since buy"/);
  assert.match(card, /label="Sell if"/);
  // The fund position sits on the shared glass surface and the note uses
  // the shared Reading block. AGENTS.md names BOX/CARD in Panel.tsx as the
  // canonical card treatment, so these are the design system's primitives,
  // not hand-rolled divs — this used to pin <Card>/<Item>, which the
  // component moved off deliberately.
  assert.match(card, /cn\(BOX,/);
  assert.match(card, /<Reading /);
  assert.match(card, /items-start/);
  assert.doesNotMatch(card, /items-stretch/);
  assert.doesNotMatch(card, /md:grid-cols-\[minmax/);
  assert.doesNotMatch(card, /<Score /);
  assert.doesNotMatch(card, /md:border-l/);
  const positions = src.slice(
    src.indexOf("Open positions"),
    src.indexOf("Weekly recap")
  );
  assert.match(positions, /<FundPosition/);
  assert.doesNotMatch(positions, /<Stat/);
  assert.doesNotMatch(card, /<Stat/);
});

run("Fund page shows one latest report then View more in sevens", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/UpsidePortfolioPage.tsx"),
    "utf8"
  );
  assert.match(src, /const FEED_CHUNK = 7/);
  assert.match(src, /View more/);
  assert.match(src, /numberedReportHeadline/);
  assert.match(src, /weeklyRecaps\.slice\(0, weeklyVisible\)/);
  assert.match(src, /reports\.slice\(0, dailyVisible\)/);
  assert.doesNotMatch(src, /weeklyRecaps\.map\(/);
});

run("Margus never writes trade orders to a person", () => {
  const notes = readFileSync(join(process.cwd(), "src/lib/weekly-letter.ts"), "utf8");
  const pulseUi = readFileSync(
    join(process.cwd(), "src/components/PulsePage.tsx"),
    "utf8"
  );
  const pulseLib = readFileSync(
    join(process.cwd(), "src/lib/thesis-pulse.ts"),
    "utf8"
  );
  const insights = readFileSync(
    join(process.cwd(), "src/lib/book-insights.ts"),
    "utf8"
  );
  const forecastUi = readFileSync(
    join(process.cwd(), "src/components/ForecastPanel.tsx"),
    "utf8"
  );
  const drawer = readFileSync(
    join(process.cwd(), "src/components/TickerDrawer.tsx"),
    "utf8"
  );
  const persona = readFileSync(
    join(process.cwd(), "src/lib/ai/margus-persona.ts"),
    "utf8"
  );
  const humanize = readFileSync(
    join(process.cwd(), "src/lib/ai/humanize-copy.ts"),
    "utf8"
  );
  const chat = readFileSync(
    join(process.cwd(), "src/lib/ai/cc-advisor.ts"),
    "utf8"
  );
  for (const src of [notes, pulseUi, pulseLib, insights, forecastUi, drawer]) {
    assert.doesNotMatch(src, /Do not add today/);
    assert.doesNotMatch(src, /Look to add if it dips/);
    assert.doesNotMatch(src, /Don't chase/);
    assert.doesNotMatch(src, /Add now ~/);
  }
  assert.doesNotMatch(pulseUi, /Trim about \{/);
  assert.doesNotMatch(pulseUi, /into this strength/);
  assert.doesNotMatch(pulseUi, /One check: selling/);
  assert.match(pulseUi, /pulseSuggestion\(/);
  assert.doesNotMatch(notes, /If it runs, sell some/);
  assert.doesNotMatch(insights, /Own it on purpose or cut it/);
  assert.match(persona, /Never write trade orders/);
  assert.match(persona, /Say you, your/);
  assert.match(humanize, /function scrubTradeOrders/);
  /*
   * The intent is what is asserted: the chat carries the reader's own
   * conviction notes into the prompt, and it does not carry trade orders
   * back out. The wording it used to hang on ("Margus memory on this
   * sheet") went with the portfolio rename.
   */
  assert.match(chat, /Margus memory on this portfolio/);
  assert.match(chat, /Never say you have not given thoughts/);
  assert.match(chat, /Same voice as the/);
  assert.match(forecastUi, /Modeled mix/);
});

run("prompts do not teach the model trader words as working vocab", () => {
  const persona = readFileSync(
    join(process.cwd(), "src/lib/ai/margus-persona.ts"),
    "utf8"
  );
  const forecast = readFileSync(
    join(process.cwd(), "src/lib/forecast-plan.ts"),
    "utf8"
  );
  const pulse = readFileSync(
    join(process.cwd(), "src/app/api/thesis/pulse/route.ts"),
    "utf8"
  );
  const notes = readFileSync(
    join(process.cwd(), "src/lib/weekly-margus.ts"),
    "utf8"
  );
  const fund = readFileSync(
    join(process.cwd(), "src/lib/margus-fund.ts"),
    "utf8"
  );
  assert.doesNotMatch(persona, /high-conviction, forward-looking/);
  assert.doesNotMatch(persona, /liquidity expansion, risk-on/);
  assert.doesNotMatch(forecast, /OWNER CONVICTION/);
  assert.doesNotMatch(forecast, /owner's thesis/);
  assert.doesNotMatch(pulse, /Owner thesis:/);
  assert.doesNotMatch(pulse, /Tape read/);
  assert.doesNotMatch(notes, /Owner thesis:/);
  assert.match(notes, /looksLikePromptLeak/);
  assert.match(notes, /fallbackWeeklyTake/);
  assert.doesNotMatch(fund, /Original thesis:/);
  assert.doesNotMatch(fund, /fundamentals-based thesis/);
  const chat = readFileSync(
    join(process.cwd(), "src/components/CcAdvisorChat.tsx"),
    "utf8"
  );
  assert.doesNotMatch(chat, /not OTM/);
});

run("import classify treats default replace as a sell", () => {
  const actions = classifyImportWrite({
    cash: false,
    replace: true,
    rows: [{ ticker: "AAPL", shares: 5 }],
    existing: [
      { ticker: "AAPL", shares: 10 },
      { ticker: "MSFT", shares: 2 },
    ],
  });
  assert.ok(actions.includes("sell"));
  assert.ok(!actions.includes("buy"));
});

run("money rounds the same distance either side of zero", () => {
  // roundMoney used to add Number.EPSILON before scaling, which does nothing
  // above ~1, and leaned on Math.round, which breaks ties toward +Infinity.
  // So 8.165 rounded down to 8.16 and -1.005 rounded to -1 while 1.005
  // rounded to 1.01. Sheets carry negative cash, so a buy and the sell that
  // undoes it have to cancel exactly.
  for (const v of [1.005, 2.675, 8.165, 0.005, 1234.565]) {
    assert.equal(
      roundMoney(-v),
      -roundMoney(v),
      `${v} rounds differently below zero`
    );
  }
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(roundMoney(8.165), 8.17);
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  // -0 serialises as "-0" and fails Object.is against 0, so a balance that
  // rounded to nothing would look like a change to anything diffing it.
  assert.ok(Object.is(roundMoney(-0.001), 0), "rounds to negative zero");
  // Junk in, zero out: NaN and Infinity are not amounts of money.
  assert.equal(roundMoney(Number.NaN), 0);
  assert.equal(roundMoney(Number.POSITIVE_INFINITY), 0);
  // Real but past the point where a double can hold cents, so it clamps
  // instead of returning a number nobody can reason about.
  assert.equal(roundMoney(1e18), Number.MAX_SAFE_INTEGER / 100);
  assert.equal(roundMoney(-1e18), -Number.MAX_SAFE_INTEGER / 100);
});

run("safeDiv and sumMoney never emit NaN or drift", () => {
  assert.equal(safeDiv(1, 0), 0);
  assert.equal(safeDiv(0, 0), 0);
  assert.equal(safeDiv(Number.NaN, 2), 0);
  assert.equal(safeDiv(1, Number.NaN), 0);
  assert.equal(sumMoney([0.1, 0.2, 0.3]), 0.6);
  assert.equal(sumMoney([0.01, Number.NaN, 0.02]), 0.03);
  // A long column of thirds must not accumulate a stray fraction of a cent.
  assert.equal(sumMoney(Array(300).fill(0.01)), 3);
});

run("a round trip through cash leaves the balance where it started", () => {
  // The regression this guards: asymmetric rounding meant buy-then-sell at the
  // same price could leave a stray cent behind in cash.
  for (const [shares, price] of [
    [3, 2.675],
    [7, 8.165],
    [11, 1.005],
    [1, 0.005],
  ] as [number, number][]) {
    const out = tradeCashDelta({ buyShares: shares, buyPrice: price });
    const back = tradeCashDelta({ sellShares: shares, sellPrice: price });
    assert.equal(out + back, 0, `${shares} @ ${price} did not net to zero`);
  }
  assert.equal(tradeCashDelta({ buyShares: Number.NaN, buyPrice: 10 }), 0);
});

run("zero-balance books and junk inputs never emit NaN or Infinity", () => {
  assert.equal(finiteNumber(Number.NaN), 0);
  assert.equal(finiteNumber(Number.POSITIVE_INFINITY, 7), 7);
  assert.equal(mean([Number.NaN, Number.POSITIVE_INFINITY]), 0);
  assert.equal(weightedMean([{ value: 0.1, weight: 0 }]), null);
  assert.equal(cagr(0, 200, 5), null);
  assert.equal(cagr(100, 200, 0), null);
  assert.ok(cagr(100, 200, 1) !== null);
  assert.equal(cagr(100, 200, 1), 1);

  const empty = todayDollarFor(0, 0.02);
  assert.equal(empty.dollar, 0);
  assert.ok(Number.isFinite(empty.dollar));
  const wiped = todayDollarFor(100, -1);
  assert.equal(wiped.dollar, 0);
  assert.equal(wiped.pct, -1);
  const junk = todayDollarFor(Number.NaN, Number.POSITIVE_INFINITY);
  assert.equal(junk.dollar, 0);
  assert.equal(junk.pct, null);

  const rows = enrichHoldings(
    [
      {
        id: "h1",
        portfolio_id: "p1",
        ticker: "AAA",
        shares: 10,
        buy_price: 0,
        eoy_target: null,
        target_call_pct: 0.14,
        stock_target_override: null,
        sort_order: 0,
      },
    ],
    { AAA: { ticker: "AAA", price: 5, change: 0, changePercent: 0, previousClose: 5, sparkline: [], marketState: null, preMarketPrice: null, preMarketChange: null, preMarketChangePercent: null, postMarketPrice: null, postMarketChange: null, postMarketChangePercent: null } },
    Number.NaN
  );
  assert.ok(rows.every((h) => Number.isFinite(h.pctOfTotal)));
  assert.equal(rows[0]!.roiPct, 0);

  const snap = buildSnapshot(
    { id: "p1", name: "Empty", slug: "e", sort_order: 0, cash_balance: 0 },
    [],
    {},
    {}
  );
  assert.equal(snap.totals.currentValue, 0);
  assert.equal(snap.totals.roiPct, 0);
  assert.equal(snap.totals.yield2wAvg, 0);

  const overview = buildOverview(
    [{ id: "p1", name: "Empty", slug: "e", sort_order: 0, cash_balance: Number.NaN }],
    [],
    {}
  );
  assert.equal(overview.totals.totalValue, 0);
  assert.equal(overview.totals.roiPct, 0);
  assert.equal(overview.totals.todayPct, null);
  assert.ok(Number.isFinite(overview.totals.cash));

  const fund = liveFundTotalValue({
    cash: 100,
    holdings: [{ ticker: "X", shares: 2, cost_basis: 10 }],
    quotes: { X: { price: Number.NaN } },
  });
  assert.equal(fund, 120);

  const conc = concentrationRead([]);
  assert.equal(conc.effectivePositions, 0);
  assert.equal(conc.topWeightPct, 0);
  assert.deepEqual(themeBreakdown([]), []);

  const shock = analyzePortfolioShock(
    [{ ticker: "AAA", shares: 10, price: 10 }],
    -100,
    "broad_down15"
  );
  assert.ok(Number.isFinite(shock.margin.shockedLeverage));
  assert.ok(Number.isFinite(shock.deltaPct));
  assert.notEqual(shock.margin.shockedLeverage, Number.POSITIVE_INFINITY);

  const ear = effectiveAnnualRate(-0.05, "monthly");
  assert.ok(ear < 0);
  assert.ok(Number.isFinite(ear));
  const compound = calculateCompound({
    principal: 0,
    ratePercent: Number.NaN,
    ratePeriod: "annual",
    compound: "monthly",
    years: 10,
    months: 0,
    contributionMode: "none",
    depositAmount: 0,
    depositFrequency: "monthly",
    withdrawalAmount: 0,
    withdrawalFrequency: "monthly",
    increaseMode: "percent",
    annualIncrease: 0,
  });
  assert.ok(Number.isFinite(compound.futureValue));
  assert.ok(Number.isFinite(compound.allTimeRoR));

  const huge = calculateCompound({
    principal: 1e308,
    ratePercent: 1e9,
    ratePeriod: "annual",
    compound: "continuous",
    years: 80,
    months: 0,
    contributionMode: "deposits",
    depositAmount: 1e308,
    depositFrequency: "monthly",
    withdrawalAmount: 0,
    withdrawalFrequency: "monthly",
    increaseMode: "percent",
    annualIncrease: 1e6,
  });
  assert.ok(Number.isFinite(huge.futureValue));
  assert.ok(huge.futureValue <= MAX_SAFE_MONEY);
  assert.ok(Number.isFinite(huge.allTimeRoR));
  assert.notEqual(huge.futureValue, Number.POSITIVE_INFINITY);

  assert.ok(Number.isNaN(parseDecimal("Infinity")));
  assert.ok(Number.isNaN(parseDecimal("1e400")));
  assert.equal(parseDecimal(""), 0);
  assert.equal(parseDecimal("12.5"), 12.5);
  const hugeMoney = formatMoneyFromRaw("999999999999999999", "USD", 0);
  assert.equal(hugeMoney.value, MAX_SAFE_MONEY);
  assert.ok(Number.isFinite(hugeMoney.value));
  assert.equal(pearson([1, 2, Number.NaN], [1, 2, 3]), null);
  const aligned = pearson([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6]);
  assert.equal(aligned, 1);
  const gapped = pearson(
    [1, 2, Number.NaN, 4, 5, 6, 7],
    [1, 2, 3, 4, 5, 6, 7]
  );
  assert.ok(gapped != null && Number.isFinite(gapped));

  assert.equal(priorPriceFromChange(10, -100), 10);
  assert.ok(synthesizeSparkline(10, -100).every(Number.isFinite));
  assert.equal(percent(0.1 + 0.2), "30.0%");
  assert.equal(signedPercent(0.123), "+12.3%");
  assert.equal(percent(Number.POSITIVE_INFINITY), NO_VALUE);
});

run("holdings writes are scoped to the portfolio they were cleared for", () => {
  const src = code(
    readFileSync(join(process.cwd(), "src/app/api/holdings/route.ts"), "utf8")
  );
  // Authorization for an existing row must come from that row. Falling back to
  // a client-supplied portfolio id (`row?.portfolio_id ?? body.portfolio_id`)
  // let a failed lookup authorize against whatever the caller named, and
  // getSupabaseDataClient() is the service-role client in production, so RLS is
  // not there to catch it. POST naming a portfolio for a brand-new holding is
  // fine — it is ownership-checked directly.
  assert.ok(
    !/\?\?\s*\(?\s*body\.portfolio_id/.test(src),
    "an existing holding's portfolio must not fall back to request input"
  );
  // The lookup that decides ownership has to fail closed, not treat an error
  // as "no such row".
  assert.ok(
    /if \(error\)/.test(src) && /status: 503/.test(src),
    "a failed holding lookup must fail closed"
  );
  // Both row-level writes must also filter on portfolio_id, so the rows the
  // ownership check cleared and the rows the write touches are the same set.
  const scopedWrites = src.match(/\.eq\("portfolio_id", portfolioId\)/g) ?? [];
  assert.ok(
    scopedWrites.length >= 2,
    `expected update and delete to be portfolio-scoped, found ${scopedWrites.length}`
  );
});

run("cash deltas are applied in one atomic statement", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/cash-trade.ts"), "utf8");
  assert.ok(
    /portfell_apply_cash_delta/.test(src),
    "cash moves must go through the atomic RPC, not a read-modify-write"
  );
  assert.ok(
    /cash_rpc_failed/.test(src),
    "a failed cash RPC must emit structured telemetry"
  );
  assert.ok(
    !/falling back to read-modify-write/.test(src),
    "a failed RPC must fail closed, not fall back to a racy write"
  );
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/041_atomic_cash_delta.sql"),
    "utf8"
  );
  assert.ok(
    /cash_balance = round\([\s\S]{0,120}coalesce\(cash_balance, 0\)/.test(
      migration
    ),
    "the RPC must add the delta to the stored value inside the UPDATE"
  );
  // Round the delta, not the running total. Postgres round() breaks ties away
  // from zero, so rounding the balance after each add compounds: +100.005 then
  // -100.005 stored 100.01 and then 0.01 instead of returning to 0.
  assert.ok(
    /round\(p_delta::numeric, 2\)/.test(migration),
    "the delta must be rounded before it is added, or cents accumulate"
  );
  // Supabase default-grants execute on new public functions to anon, so
  // revoking from PUBLIC alone leaves anon holding it. It has to be named.
  assert.ok(
    /revoke all on function public\.portfell_apply_cash_delta[\s\S]{0,80}from anon/.test(
      migration
    ),
    "anon must be revoked by name, not just via PUBLIC"
  );
  assert.ok(
    !/grant execute[^;]*to anon/i.test(migration),
    "the cash RPC must never be granted to anon"
  );
  // It takes a portfolio id and an arbitrary amount, so without its own check
  // any caller reaching PostgREST could move any sheet's cash given a UUID.
  assert.ok(
    /portfell_is_portfolio_co_owner\(p_portfolio_id\)/.test(migration),
    "the cash RPC must verify co-ownership itself, not trust its callers"
  );
});

run("cash RPC cannot pin a pooler slot on a waited lock", () => {
  const src = readFileSync(
    join(process.cwd(), "supabase/migrations/054_pool_indexes_lock_timeouts.sql"),
    "utf8"
  );
  assert.match(src, /set lock_timeout = '3s'/);
  assert.match(src, /set statement_timeout = '8s'/);
  assert.match(src, /set idle_in_transaction_session_timeout = '5s'/);
  assert.match(src, /from anon, public, authenticated/);
  assert.doesNotMatch(src, /grant execute[^;]*to authenticated/i);
  assert.match(src, /portfell_community_invite_uses_user_idx/);
  assert.match(src, /portfell_profiles_email_lower_idx/);
  assert.match(src, /portfell_book_snapshots_kind_created_idx/);
  assert.match(src, /portfell_holdings_portfolio_sort_idx/);
});

run("server supabase client is reused and every fetch has a timeout", () => {
  const server = readFileSync(
    join(process.cwd(), "src/lib/supabase/server.ts"),
    "utf8"
  );
  assert.match(server, /cached && cached.url === url && cached.key === key/);
  assert.match(server, /supabaseFetch/);
  assert.match(server, /persistSession: false/);
  const auth = readFileSync(
    join(process.cwd(), "src/lib/supabase/server-auth.ts"),
    "utf8"
  );
  assert.match(auth, /supabaseFetch/);
  const http = readFileSync(
    join(process.cwd(), "src/lib/supabase/http.ts"),
    "utf8"
  );
  assert.match(http, /AbortSignal\.timeout/);
  assert.match(http, /SUPABASE_FETCH_TIMEOUT_MS/);
  const market = readFileSync(
    join(process.cwd(), "src/lib/market/circuit-breaker.ts"),
    "utf8"
  );
  assert.match(market, /AbortSignal\.timeout/);
  assert.match(market, /MARKET_FETCH_TIMEOUT_MS/);
});

run("direct Postgres is not the serverless pooler", () => {
  assert.equal(
    isDirectPostgresUrl(
      "postgresql://postgres:x@db.uzrnybyggznpvgxgrvgl.supabase.co:5432/postgres"
    ),
    true
  );
  assert.equal(
    isSupabasePoolerUrl(
      "postgresql://postgres.foo:x@aws-0-eu-north-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
    ),
    true
  );
  assert.equal(
    isDirectPostgresUrl(
      "postgresql://postgres.foo:x@aws-0-eu-north-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
    ),
    false
  );
  const envExample = readFileSync(
    join(process.cwd(), ".env.example"),
    "utf8"
  );
  assert.match(envExample, /DATABASE_POOLER_URL/);
  assert.match(envExample, /6543/);
  assert.match(envExample, /transaction-mode pooler/i);
});

run("holdings writes retry when a concurrent update wins", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/api/holdings/route.ts"),
    "utf8"
  );
  assert.ok(
    /parseJsonBody/.test(src),
    "invalid JSON must 400, not throw into a 500"
  );
  assert.ok(
    /23505/.test(src),
    "a unique-constraint insert has to retry, not 500"
  );
  assert.ok(
    /\.eq\("shares", existingRow\.shares\)/.test(src),
    "an update must match the shares it just read so two overlapping buys cannot both compute cash from the same starting count"
  );
  assert.ok(
    /\.eq\("shares", prevShares\)/.test(src),
    "a share-changing PATCH must compare-and-swap on the shares it priced the cash delta from"
  );
  assert.ok(
    /select\("shares, buy_price, ticker"\)/.test(src),
    "DELETE must return the row it actually removed so cash uses that count, not a stale pre-read"
  );
  assert.ok(
    /if \(!deletedRaw\)/.test(src),
    "a second overlapping DELETE must not credit the sale twice"
  );
  assert.ok(
    /holding_cas_retry/.test(src),
    "compare-and-swap retries must be logged"
  );
  assert.ok(
    /holding_cas_exhausted/.test(src),
    "exhausted compare-and-swap retries must be logged"
  );
});

run("dashboard book writes are queued and do not clobber in-flight saves", () => {
  const dash =
    readFileSync(join(process.cwd(), "src/components/Dashboard.tsx"), "utf8") +
    readFileSync(
      join(process.cwd(), "src/lib/use-dashboard-book-writes.ts"),
      "utf8"
    );
  assert.ok(
    /pendingBookWritesRef/.test(dash),
    "a book reload while a save is in flight must wait, not overwrite the optimistic row"
  );
  assert.ok(
    /enqueueBookWrite/.test(dash),
    "holdings/cash writes from one tab have to run in order"
  );
  assert.ok(
    /applyCashDelta/.test(dash),
    "optimistic cash must add a delta, not stamp an absolute number from a stale closure"
  );
  assert.ok(
    /addingSheetRef/.test(dash),
    "double-submitting new portfolio must not create two sheets"
  );
});

run("request JSON is read as unknown", () => {
  const http = readFileSync(join(process.cwd(), "src/lib/http.ts"), "utf8");
  assert.ok(/readJsonBody/.test(http));
  assert.ok(/readJsonBodyOr400/.test(http));
  const parseBody = readFileSync(
    join(process.cwd(), "src/lib/parse-json-body.ts"),
    "utf8"
  );
  assert.ok(/parseJsonBody/.test(parseBody));
  const holdings = readFileSync(
    join(process.cwd(), "src/app/api/holdings/route.ts"),
    "utf8"
  );
  assert.doesNotMatch(
    holdings,
    /const body = await req\.json\(\);/,
    "holdings must not parse JSON as implicit any"
  );
  const portfolios = readFileSync(
    join(process.cwd(), "src/app/api/portfolios/route.ts"),
    "utf8"
  );
  assert.doesNotMatch(portfolios, /const body = await req\.json\(\);/);
});

run("browser-only caches are not read during render", () => {
  // /communities and /communities/[id] have no auth gate in front of them, so
  // they really are prerendered and hydrated. Seeding state from localStorage
  // or window.location during render makes the server and client trees
  // disagree, and React throws the server HTML away — the opposite of what
  // the cache was for.
  const files = [
    "src/components/CommunitiesList.tsx",
    "src/components/CommunityView.tsx",
    "src/components/WatchlistStrip.tsx",
    "src/components/DailyDuelCard.tsx",
    "src/components/HomeWorld.tsx",
    "src/components/LabSheet.tsx",
    "src/components/Dashboard.tsx",
  ];
  const offenders: string[] = [];
  for (const file of files) {
    const src = code(readFileSync(join(process.cwd(), file), "utf8"));
    // `useState<Foo[]>(() => loadThing())` and `useState(readThing(id))` both
    // count; the generic argument is optional, so the pattern has to allow it.
    if (/useState(?:<[^>]*>)?\(\s*(?:\(\)\s*=>\s*)?(?:load|read)[A-Z]/.test(src)) {
      offenders.push(`${file}: useState seeded from a cache read`);
    }
    if (/useState(?:<[^>]*>)?\([^;]{0,240}new URLSearchParams\(window/.test(src)) {
      offenders.push(`${file}: useState seeded from window.location`);
    }
    if (/useRef\(\s*(?:load|read)[A-Z]/.test(src)) {
      offenders.push(`${file}: useRef seeded from a cache read`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join("; "));
});

run("nightly NAV history reads the newest nights, bounded by retention", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/api/book/nav-history/route.ts"),
    "utf8"
  );
  // Ascending + limit took the *oldest* rows. One nightly row covers every
  // user's book, so once retention passed the limit the chart would have
  // frozen on ancient history for everyone.
  assert.ok(
    /ascending: false/.test(src),
    "nightly history must read newest-first"
  );
  assert.ok(
    /limit\(NIGHTLY_SNAPSHOT_WINDOW\)/.test(src),
    "the window must track the retention constant, not a magic number"
  );
  assert.equal(NIGHTLY_SNAPSHOT_WINDOW, 14);
});

run("membership checks do not run one query per community", () => {
  const src = code(
    readFileSync(join(process.cwd(), "src/app/api/portfolios/route.ts"), "utf8")
  );
  assert.ok(
    !/Promise\.all\([^)]*userIsCommunityAdmin/.test(src),
    "mapping a per-row membership query over a list is an N+1"
  );
  assert.ok(/communityAdminFlags/.test(src));
});

run("dashboard modules sit behind an error boundary", () => {
  const dash =
    readFileSync(join(process.cwd(), "src/components/Dashboard.tsx"), "utf8") +
    readFileSync(
      join(process.cwd(), "src/components/DashboardModals.tsx"),
      "utf8"
    );
  for (const name of ["Pulse", "Lab", "Overview", "Holdings", "Forecast", "Margus", "Alerts", "Ticker"]) {
    assert.ok(
      dash.includes(`<WidgetErrorBoundary name="${name}">`),
      `Dashboard must isolate ${name}`
    );
  }
  const boundary = readFileSync(
    join(process.cwd(), "src/components/WidgetErrorBoundary.tsx"),
    "utf8"
  );
  assert.ok(/getDerivedStateFromError/.test(boundary));
  assert.ok(/Retry/.test(boundary));
  assert.ok(/resetKey/.test(boundary));
  assert.ok(
    /reportClientError/.test(boundary),
    "a widget crash must report with session context, not only console.error"
  );
  const community =
    readFileSync(
      join(process.cwd(), "src/components/CommunityView.tsx"),
      "utf8"
    ) +
    readFileSync(join(process.cwd(), "src/components/CircleHome.tsx"), "utf8") +
    readFileSync(
      join(process.cwd(), "src/components/ClassroomHome.tsx"),
      "utf8"
    );
  assert.ok(community.includes(`<WidgetErrorBoundary name="Daily Duel"`));
  assert.ok(/WidgetErrorBoundary[\s\S]{0,80}name="Member portfolio"/.test(community));
  assert.ok(community.includes(`<WidgetErrorBoundary name="Community totals">`));
  const fund = readFileSync(
    join(process.cwd(), "src/components/UpsidePortfolioPage.tsx"),
    "utf8"
  );
  assert.ok(fund.includes(`<WidgetErrorBoundary name="Fund chart">`));
  const account = readFileSync(
    join(process.cwd(), "src/components/AccountPage.tsx"),
    "utf8"
  );
  assert.ok(account.includes(`<WidgetErrorBoundary name="Account">`));
  const overview = readFileSync(
    join(process.cwd(), "src/components/OverviewDashboard.tsx"),
    "utf8"
  );
  assert.ok(overview.includes(`<WidgetErrorBoundary name="Watchlist">`));
  const lab = readFileSync(
    join(process.cwd(), "src/components/LabSheet.tsx"),
    "utf8"
  );
  assert.ok(lab.includes(`<WidgetErrorBoundary name="Allocation">`));
  assert.match(lab, /Do these move together/);
  assert.match(lab, /minmax\(2\.5rem, max-content\)/);
  assert.doesNotMatch(lab, /max-w-full truncate/);
  const strip = readFileSync(
    join(process.cwd(), "src/components/AppStatusStrip.tsx"),
    "utf8"
  );
  assert.ok(strip.includes(`<WidgetErrorBoundary name="Market"`));
});

run("no Refresh button in the top header", () => {
  const dash = readFileSync(
    join(process.cwd(), "src/components/Dashboard.tsx"),
    "utf8"
  );
  const fund = readFileSync(
    join(process.cwd(), "src/components/UpsidePortfolioPage.tsx"),
    "utf8"
  );
  const headerSlice = dash.slice(
    dash.lastIndexOf("<AppHeader"),
    dash.indexOf("</AppHeader>", dash.lastIndexOf("<AppHeader"))
  );
  assert.doesNotMatch(headerSlice, /Refresh prices/);
  assert.doesNotMatch(headerSlice, /<span className="hidden md:inline">Refresh<\/span>/);
  assert.doesNotMatch(fund, /Refresh prices/);
  const fundHeader = fund.slice(
    fund.indexOf("<AppHeader"),
    fund.indexOf("</AppHeader>")
  );
  assert.doesNotMatch(fundHeader, /RefreshCw/);
});

run("workspace nav marks the current room and the skip link exists", () => {
  const switcher = readFileSync(
    join(process.cwd(), "src/components/WorkspaceSwitcher.tsx"),
    "utf8"
  );
  // Marking where you are is the invariant; it is not an action, so it
  // must not wear the primary CTA fill and compete with the one real
  // button in the bar. It used to take primary text to say so. It does not
  // any more, and that is the design note in DESIGN_TOKENS.md rather than
  // a slip: a selected surface is either the accent at full lightness or a
  // neutral veil with foreground type, never a dim tint in between. Both
  // docks take the second of those now, so this is no longer the lone
  // exception it was written as.
  assert.ok(/aria-current=\{active \? "page"/.test(switcher));
  assert.ok(/bg-selected/.test(switcher));
  assert.ok(/text-foreground/.test(switcher));
  assert.ok(!/bg-primary text-primary-foreground/.test(switcher));
  assert.ok(!/bg-secondary/.test(switcher), "bg-secondary equals bg-muted; use the selected veil");
  assert.ok(!/bg-zinc-100 text-zinc-900/.test(switcher));
  assert.ok(!/bg-brand\/20 text-brand-bright/.test(switcher));
  const providers = readFileSync(
    join(process.cwd(), "src/components/Providers.tsx"),
    "utf8"
  );
  assert.ok(/href="#main"/.test(providers));
  assert.ok(/Skip to content/.test(providers));
  assert.match(providers, /WorkspaceShell/);
  const shell = readFileSync(
    join(process.cwd(), "src/components/WorkspaceShell.tsx"),
    "utf8"
  );
  assert.match(shell, /Keep visited rooms mounted/);
  assert.match(shell, /hidden=\{!on\}/);
  assert.match(shell, /mountedRef\.current\.add\("book"\)/);
  const homePage = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
  assert.match(homePage, /return null/);
  assert.doesNotMatch(homePage, /Dashboard/);
  const dock = readFileSync(
    join(process.cwd(), "src/components/BookModeDock.tsx"),
    "utf8"
  );
  /*
   * Not a width. The well hugs its cells and centres itself, which is the
   * whole reason `dock-stability.test.ts` exists: a cell that appears or
   * disappears resizes the bar, so what must never happen is a cell count
   * that depends on the page you are looking at. A fixed `sm:w-[42rem]`
   * was the old shape and asserting it now would forbid the current one.
   */
  assert.match(dock, /mx-auto/);
  /*
   * Real destinations, not query strings the dock then cancels. Home is
   * the root; the rest are the paths `book-routes.ts` names.
   */
  assert.match(dock, /href: "\/"/);
  assert.match(dock, /href: PULSE_PATH/);
  assert.doesNotMatch(dock, /\?tab=/);
  assert.doesNotMatch(dock, /onSelectMode/);
  // Circle is a cell in the well like any other destination, not a
  // separate link component beside it.
  assert.match(dock, /useCircleHref/);
  assert.match(dock, /hover:text-foreground/);
  assert.doesNotMatch(dock, /hover:bg-accent/);
  const tabs = readFileSync(
    join(process.cwd(), "src/components/PortfolioTabs.tsx"),
    "utf8"
  );
  assert.match(tabs, /BookModeDock/);
  assert.match(tabs, /createPortal/);
  assert.match(tabs, /WORKSPACE_DOCK_SLOT_ID/);
  /*
   * The rail this ordered the dock against is gone: `BookModeDock` draws
   * the sections, the portfolios and Circle as one row of identical cells,
   * which is what removed the two-halves-that-share-no-shape problem the
   * comment at the top of that file describes. So what is left to hold is
   * that the shell renders the dock and nothing else has grown back
   * beside it.
   */
  assert.doesNotMatch(tabs, /Sheets\s*[—-]/);
  const community = readFileSync(
    join(process.cwd(), "src/components/CommunityView.tsx"),
    "utf8"
  );
  assert.match(
    community,
    /pathname\.startsWith\(`\/communities\/\$\{communityId\}`\)/
  );
  const mobile = readFileSync(
    join(process.cwd(), "src/components/mobile/MobileTabBar.tsx"),
    "utf8"
  );
  assert.match(mobile, /href: PULSE_PATH/);
  assert.match(mobile, /href: PORTFOLIO_PATH/);
  assert.doesNotMatch(mobile, /\?tab=|stashOpenTab/);
});

run("holding and cash saves cannot double-fire", () => {
  const holding = readFileSync(
    join(process.cwd(), "src/components/HoldingModal.tsx"),
    "utf8"
  );
  const cash = readFileSync(
    join(process.cwd(), "src/components/CashModal.tsx"),
    "utf8"
  );
  assert.match(holding, /flex gap-6/);
  assert.ok(/if \(busy\) return/.test(holding));
  assert.ok(/disabled=\{busy\}/.test(holding));
  assert.ok(/if \(busy\) return/.test(cash));
  assert.ok(/disabled=\{busy\}/.test(cash));
});

run("cash RPC still fails closed and money has a hard ceiling", () => {
  const money = readFileSync(join(process.cwd(), "src/lib/money.ts"), "utf8");
  assert.ok(/export const MAX_SAFE_MONEY/.test(money));
  assert.ok(/export const MAX_SAFE_SHARES/.test(money));
});

run("email and admin RPCs are not callable with a user JWT", () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/043_rls_grants_oracles_initplan.sql"
    ),
    "utf8"
  );
  assert.ok(
    /revoke execute on function public\.portfell_lookup_profile_id_by_email\(text\)[\s\S]{0,40}from authenticated/.test(
      migration
    ),
    "lookup-by-email must not stay on authenticated"
  );
  assert.ok(
    /revoke execute on function public\.portfell_superadmin_overview\(\)[\s\S]{0,40}from authenticated/.test(
      migration
    ),
    "admin overview must not stay on authenticated"
  );
  assert.ok(
    /with check \(false\)/.test(migration),
    "error-log inserts must fail closed for JWT roles"
  );
  assert.ok(
    /revoke all on table public\.%I from anon/.test(migration),
    "anon must lose table grants, including TRUNCATE"
  );
  const ownership = readFileSync(
    join(process.cwd(), "src/lib/auth/ownership.ts"),
    "utf8"
  );
  assert.ok(
    /portfell_lookup_profile_id_by_email/.test(ownership),
    "co-owner add still goes through the service-role RPC"
  );
  const redeem = readFileSync(
    join(process.cwd(), "supabase/migrations/044_redeem_invite_rpcs.sql"),
    "utf8"
  );
  assert.ok(
    /create or replace function public\.portfell_redeem_community_invite/.test(
      redeem
    )
  );
  assert.ok(
    /create or replace function public\.portfell_redeem_portfolio_invite/.test(
      redeem
    )
  );
  assert.ok(
    /set accepted_at = now\(\)/.test(redeem),
    "redeem must claim the invite row in the same statement"
  );
  assert.ok(
    /revoke all on function public\.portfell_redeem_community_invite\(text\) from public, anon/.test(
      redeem
    )
  );
  const reuse = readFileSync(
    join(process.cwd(), "supabase/migrations/048_multi_email_community_invites.sql"),
    "utf8"
  );
  assert.match(reuse, /em = any\(string_to_array\(email, ','\)\)/);
  assert.doesNotMatch(reuse, /set accepted_at = now\(\)/);
  const mint = readFileSync(
    join(process.cwd(), "src/app/api/communities/[id]/invites/route.ts"),
    "utf8"
  );
  assert.doesNotMatch(mint, /daysValid \?\? 14/);
  // An open invite link is a bearer credential, so "no days given" must
  // mean a bounded default, not "forever". Never-expiring has to be asked
  // for explicitly. The bound is shared with the route that replaces a
  // link, so it lives beside the other invite helpers.
  const inviteAdmin = readFileSync(
    join(process.cwd(), "src/lib/community-invite-admin.ts"),
    "utf8"
  );
  assert.match(inviteAdmin, /const DEFAULT_INVITE_DAYS = 30/);
  assert.match(mint, /DEFAULT_INVITE_DAYS/);
  assert.match(mint, /body\.neverExpires === true/);
  assert.doesNotMatch(mint, /expiresAt: string \| null = null/);
  assert.match(mint, /inviteEmailAllowlist/);
  assert.match(mint, /sendNoteEmail/);
  assert.match(mint, /token_hint/);
  assert.match(mint, /inviteJoinPath/);
  // The link is in the create response and nowhere else. Storing the raw
  // token beside its hash made the hash decorative: one read of the table
  // handed out every live link in it.
  assert.match(mint, /token,/);
  assert.doesNotMatch(mint, /token_hint: tokenHintFromToken\(token\),\s*\n\s*token,/);
  assert.doesNotMatch(mint, /created_by, token_hint, token/);
  assert.match(mint, /communityInviteUses/);
  assert.match(mint, /created_by/);
  const usesMig = readFileSync(
    join(process.cwd(), "supabase/migrations/050_community_invite_uses.sql"),
    "utf8"
  );
  assert.match(usesMig, /portfell_community_invite_uses/);
  assert.match(usesMig, /on conflict \(invite_id, user_id\) do nothing/);
  assert.doesNotMatch(usesMig, /set accepted_at = now\(\)/);
  const retire = readFileSync(
    join(
      process.cwd(),
      "src/app/api/communities/[id]/invites/[inviteId]/route.ts"
    ),
    "utf8"
  );
  assert.match(retire, /revoked_at/);
  assert.match(retire, /communityInvitePatchSchema/);
  // No GET here. A route that reads an invite's link back out of the table
  // is the thing that made the stored hash pointless.
  assert.doesNotMatch(retire, /export const GET/);
  const communityView =
    readFileSync(
      join(process.cwd(), "src/components/CommunityView.tsx"),
      "utf8"
    ) +
    readFileSync(
      join(process.cwd(), "src/components/CommunityMembersPanel.tsx"),
      "utf8"
    );
  assert.doesNotMatch(communityView, /daysValid: community\?\.kind === "classroom" \? 90 : 14/);
  assert.match(communityView, /This link works for 30 days/);
  assert.doesNotMatch(communityView, /This link stays live/);
  assert.match(communityView, /inviteNeverExpires/);
  // The rule is that the invite form takes optional email addresses, not
  // the exact placeholder it says that in.
  assert.match(communityView, /Email addresses[^"]*optional/i);
  assert.match(communityView, /Retire this link/);
  assert.match(communityView, /copyInviteLink/);
  // An invite already in the list cannot be shown again, because only its
  // hash was kept. Sharing it again means minting a fresh link.
  assert.doesNotMatch(communityView, /inv\.path/);
  assert.match(communityView, /Make a new link/);
  assert.match(communityView, /inviteUsesLabel/);
  const joinPeek = readFileSync(
    join(process.cwd(), "src/app/api/communities/join/route.ts"),
    "utf8"
  );
  assert.doesNotMatch(joinPeek, /row\.email && row\.accepted_at/);
  assert.doesNotMatch(joinPeek, /row\.accepted_at \|\| row\.revoked_at/);
});

run("circle portfolios show unless you turn one off", () => {
  assert.equal(parseSharePortfolioIds(null), null);
  assert.deepEqual(parseSharePortfolioIds([]), []);
  assert.deepEqual(
    parseSharePortfolioIds(["a0000000-0000-4000-8000-000000000001", "nope"]),
    ["a0000000-0000-4000-8000-000000000001"]
  );
  const share = readFileSync(
    join(process.cwd(), "src/lib/community-share.ts"),
    "utf8"
  );
  assert.match(share, /isClassroomKind/);
  assert.match(share, /classroom_community_id/);
  const joinRoute = readFileSync(
    join(process.cwd(), "src/app/api/communities/join/route.ts"),
    "utf8"
  );
  assert.match(joinRoute, /shareOwnedSheetsIntoCommunity/);
  const req = readFileSync(
    join(process.cwd(), "src/app/api/communities/[id]/join-request/route.ts"),
    "utf8"
  );
  assert.match(req, /share_portfolio_ids/);
  const mig = readFileSync(
    join(process.cwd(), "supabase/migrations/051_circle_share_opt_out.sql"),
    "utf8"
  );
  assert.match(mig, /is distinct from 'classroom'/);
  assert.match(mig, /classroom_community_id is null/);
  const sheetsUi = readFileSync(
    join(process.cwd(), "src/components/ShareSheets.tsx"),
    "utf8"
  );
  // The rule is opt-out sharing, not the sentence that states it.
  assert.match(sheetsUi, /unless you turn (?:it|one) off/i);
  const list = readFileSync(
    join(process.cwd(), "src/components/CommunitiesList.tsx"),
    "utf8"
  );
  assert.match(list, /What should /);
  assert.match(list, /portfolioIds/);
});

run("in-app feedback is a monthly walk-through and freeform when you open it", () => {
  assert.equal(FEEDBACK_TO, "martin.aasa@upthink.ee");
  assert.equal(FEEDBACK_MONTH_MS, 30 * 24 * 60 * 60 * 1000);
  const now = Date.parse("2026-08-16T12:00:00Z");
  assert.equal(
    isMonthlyFeedbackDue(
      {
        firstSeenAt: "2026-08-16T11:00:00Z",
        lastPromptAt: null,
        lastSubmittedAt: null,
        snoozeUntil: null,
      },
      now
    ),
    false,
    "a fresh account is left alone"
  );
  assert.equal(
    isMonthlyFeedbackDue(
      {
        firstSeenAt: "2026-08-01T12:00:00Z",
        lastPromptAt: null,
        lastSubmittedAt: null,
        snoozeUntil: null,
      },
      now
    ),
    false,
    "two weeks in is not a month yet"
  );
  assert.equal(
    isMonthlyFeedbackDue(
      {
        firstSeenAt: "2026-06-01T12:00:00Z",
        lastPromptAt: null,
        lastSubmittedAt: null,
        snoozeUntil: null,
      },
      now
    ),
    true
  );
  assert.equal(
    isMonthlyFeedbackDue(
      {
        firstSeenAt: "2026-06-01T12:00:00Z",
        lastPromptAt: "2026-08-10T12:00:00Z",
        lastSubmittedAt: null,
        snoozeUntil: "2026-09-09T12:00:00Z",
      },
      now
    ),
    false
  );
  assert.equal(
    isMonthlyFeedbackDue(
      {
        firstSeenAt: "2026-06-01T12:00:00Z",
        lastPromptAt: "2026-08-10T12:00:00Z",
        lastSubmittedAt: null,
        // A week-long snooze written by the old build has already passed.
        snoozeUntil: "2026-08-15T12:00:00Z",
      },
      now
    ),
    false,
    "the last prompt still holds it for a month"
  );
  assert.equal(parseMonthlyFeedback({}).ok, false);
  assert.equal(parseMonthlyFeedback({ feel: "easy" }).ok, true);
  assert.equal(parseMonthlyFeedback({ feel: "nope" }).ok, false);
  assert.equal(MONTHLY_STEPS.length, 4, "four questions, one per screen");
  assert.deepEqual(
    MONTHLY_STEPS.map((s) => s.id),
    ["feel", "helped", "blocked", "change"]
  );
  const emptyRow = stepAnswerText(MONTHLY_STEPS[0]!, {
    feel: null,
    helped: [],
    blocked: [],
    change: null,
    changeNote: "",
  });
  assert.equal(emptyRow, NO_VALUE, "an unanswered question reads as n/a");
  const letter = formatMonthlyFeedbackText({
    feel: "easy",
    helped: ["pulse", "forecast"],
    blocked: [],
    change: "emails",
    changeNote: "Send it earlier.",
  });
  assert.match(letter, /How the month felt: Easy to follow/);
  assert.match(letter, /What helped: Pulse, Forecast/);
  assert.match(letter, new RegExp(`What got in the way: ${NO_VALUE}`));
  assert.match(letter, /In their words: Send it earlier\./);
  assert.equal(parseManualFeedback({ topic: "Bug", body: "short" }).ok, false);
  assert.equal(
    parseManualFeedback({
      topic: "Bug",
      body: "The add name flow ate my ticker.",
    }).ok,
    true
  );
  const api = readFileSync(
    join(process.cwd(), "src/app/api/feedback/route.ts"),
    "utf8"
  );
  assert.match(api, /FEEDBACK_TO/);
  assert.match(api, /kind === "monthly"/);
  assert.match(api, /kind === "weekly"/, "queued offline drafts still replay");
  assert.match(api, /kind === "manual"/);
  assert.match(api, /replyTo/);
  const modal = readFileSync(
    join(process.cwd(), "src/components/FeedbackModal.tsx"),
    "utf8"
  );
  assert.match(modal, /How was this month\?/);
  assert.match(modal, /Tell Upside/);
  assert.match(modal, /Question \{index \+ 1\} of/, "one question at a time");
  assert.match(modal, /AnswerTable/, "a small table of the questions so far");
  assert.match(modal, /What is this about\?/);
  assert.match(modal, /mode === "monthly"/);
  assert.doesNotMatch(
    modal,
    /MONTHLY_FEEL|MONTHLY_HELPED|MONTHLY_BLOCKED|MONTHLY_CHANGE/,
    "questions come from MONTHLY_STEPS, not four hand-copied lists"
  );
  assert.equal(
    (modal.match(/<Textarea/g) || []).length,
    1,
    "only the manual form is a free box"
  );
  const header = readFileSync(
    join(process.cwd(), "src/components/AppHeader.tsx"),
    "utf8"
  );
  assert.match(header, /FeedbackHeaderButton/);
  const host = readFileSync(
    join(process.cwd(), "src/components/FeedbackHost.tsx"),
    "utf8"
  );
  assert.match(host, /isMonthlyFeedbackDue/);
  assert.match(host, /setMode\("manual"\)/);
  assert.doesNotMatch(
    host,
    /fixed right-4/,
    "mobile feedback lives in the header chrome, not a floating chip over Margus"
  );
  const topBar = readFileSync(
    join(process.cwd(), "src/components/mobile/MobileTopBar.tsx"),
    "utf8"
  );
  /*
   * The rule is that the phone's chrome can open feedback on its own, not
   * that it draws a particular component. This named `FeedbackIconButton`
   * and an `aria-label`, and both went the day feedback stopped being its
   * own 44px glyph out on the bar and became a row in the one overflow
   * menu, which is a change the invariant should have survived.
   */
  assert.match(
    topBar,
    /useFeedback\(\)/,
    "the phone chrome opens feedback itself, rather than sending a reader to Account to find it"
  );
  const phoneMenu = readFileSync(
    join(process.cwd(), "src/lib/phone-menu.ts"),
    "utf8"
  );
  assert.match(
    topBar + phoneMenu,
    /label: "Feedback"|aria-label="Feedback"/,
    "and calls it Feedback, whether that is a button on the bar or a row in its menu"
  );
  const account = readFileSync(
    join(process.cwd(), "src/components/AccountPage.tsx"),
    "utf8"
  );
  assert.match(account, /Tell Upside/);
});

run("community invite admin list reads like Discord", () => {
  assert.equal(inviteUsesLabel(0), "Never used");
  assert.equal(inviteUsesLabel(1), "Used once");
  assert.equal(inviteUsesLabel(3), "Used 3 times");
  assert.equal(inviteLockLabel(null), "Anyone with the link");
  assert.equal(inviteLockLabel("a@b.com,c@d.com"), "Locked to 2 emails");
  assert.equal(
    inviteAdminStatus({ revoked_at: "2026-08-16T00:00:00Z", expires_at: null }),
    "retired"
  );
  assert.equal(
    inviteAdminStatus({ revoked_at: null, expires_at: "2000-01-01T00:00:00Z" }),
    "expired"
  );
  assert.equal(
    inviteAdminStatus({ revoked_at: null, expires_at: null }),
    "live"
  );
});

run("fund page does not read localStorage during render", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/UpsidePortfolioPage.tsx"),
    "utf8"
  );
  assert.ok(
    /useLayoutEffect\(\(\) => \{[\s\S]*loadUpsidePortfolioCache/.test(src),
    "fund cache must hydrate in a layout effect"
  );
  const beforeHook = src.slice(0, src.indexOf("useLayoutEffect(() => {"));
  assert.ok(
    !/loadUpsidePortfolioCache\(\)/.test(beforeHook),
    "loadUpsidePortfolioCache must not run during render"
  );
});

run("retry backoff drops the abort listener when the wait ends", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/abort.ts"), "utf8");
  assert.ok(/removeEventListener\("abort"/.test(src));
});

run("saved/copied flashes cannot setState after unmount", () => {
  const hook = readFileSync(
    join(process.cwd(), "src/lib/use-timeout.ts"),
    "utf8"
  );
  assert.ok(/ids\.current\.clear\(\)/.test(hook));
  const account = readFileSync(
    join(process.cwd(), "src/components/AccountPage.tsx"),
    "utf8"
  );
  assert.ok(/useTimeout\(\)/.test(account));
  assert.ok(!/setTimeout\(\(\) => setTierSaved/.test(account));
  const feedback = readFileSync(
    join(process.cwd(), "src/components/FeedbackModal.tsx"),
    "utf8"
  );
  assert.ok(/useTimeout\(\)/.test(feedback));
  assert.ok(!/setTimeout\(onClose/.test(feedback));
});

run("search, long-press, and keyboard timers abort on unmount", () => {
  const search = readFileSync(
    join(process.cwd(), "src/lib/use-ticker-search.ts"),
    "utf8"
  );
  assert.ok(/ctrl\.abort\(\)/.test(search));
  assert.ok(/signal: ctrl\.signal/.test(search));
  /*
   * The long-press timer this used to guard is gone rather than unguarded:
   * the dock opens a portfolio's menu from a context-menu event, so there
   * is no pending timeout to clear. Asserted as the absence, so that
   * reintroducing a hand-rolled press timer without an unmount path fails
   * here instead of leaking quietly.
   */
  for (const name of ["PortfolioTabs.tsx", "BookModeDock.tsx", "mobile/MobileTabBar.tsx"]) {
    const src = readFileSync(join(process.cwd(), "src/components", name), "utf8");
    if (/setTimeout\(/.test(src)) {
      assert.ok(/useTimeout\(\)|clearTimeout\(/.test(src), name);
    }
  }
  const vv = readFileSync(
    join(process.cwd(), "src/lib/use-visual-viewport.ts"),
    "utf8"
  );
  assert.ok(/keepTimers\.push\(window\.setTimeout\(applyVisualViewportVars/.test(vv));
});

run("offline status is not read during render", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/use-online-status.ts"),
    "utf8"
  );
  assert.ok(/useState\(true\)/.test(src));
  assert.ok(/useLayoutEffect/.test(src));
  assert.ok(/navigator\.onLine/.test(src));
});

run("sign-in returns to the page you were on", () => {
  const auth = readFileSync(
    join(process.cwd(), "src/components/AuthProvider.tsx"),
    "utf8"
  );
  const site = readFileSync(join(process.cwd(), "src/lib/site-url.ts"), "utf8");
  const google = readFileSync(
    join(process.cwd(), "src/app/auth/google/callback/route.ts"),
    "utf8"
  );
  assert.ok(
    /auth\/google\?next=/.test(auth),
    "Google sign-in must pass the current path as next"
  );
  assert.ok(/function currentInternalNext/.test(site));
  assert.ok(/path\.startsWith\("\/auth\/"\)/.test(site));
  assert.match(google, /signInWithIdToken/);
  assert.doesNotMatch(google, /supabase\.co\/auth\/v1\/callback/);
});

run("pages reconnect after offline and back-forward cache", () => {
  const resume = readFileSync(
    join(process.cwd(), "src/lib/use-network-resume.ts"),
    "utf8"
  );
  assert.ok(/pageshow/.test(resume));
  assert.ok(/e\.persisted/.test(resume));
  const community = readFileSync(
    join(process.cwd(), "src/components/CommunityView.tsx"),
    "utf8"
  );
  assert.ok(/signal: ctrl\.signal/.test(community));
  assert.ok(/useNetworkResume/.test(community));
});

run("Lab market reads are shared per ticker, not fetched per visitor", () => {
  const trends = readFileSync(
    join(process.cwd(), "src/lib/market/trends-cache.ts"),
    "utf8"
  );
  const seasonality = readFileSync(
    join(process.cwd(), "src/lib/market/seasonality-fetch.ts"),
    "utf8"
  );
  const lab = readFileSync(
    join(process.cwd(), "src/components/LabSheet.tsx"),
    "utf8"
  );
  assert.ok(/unstable_cache/.test(trends));
  assert.ok(/trends-weekly-closes-v1/.test(trends));
  assert.ok(/trends-row-v1/.test(trends));
  assert.ok(/unstable_cache/.test(seasonality));
  assert.ok(/seasonality-model-v1/.test(seasonality));
  assert.ok(
    /tab === "trends"/.test(lab),
    "Trends should mount when that tab is open, not on every Lab visit"
  );
  assert.ok(/tab === "seasonality"/.test(lab));
});

run("empty books skip holdings emails and get one week-later nudge", () => {
  assert.equal(EMPTY_BOOK_NUDGE_AFTER_DAYS, 7);
  assert.equal(hasLiveHoldings([]), false);
  assert.equal(hasLiveHoldings([{ ticker: "RKLB", shares: 0 }]), false);
  assert.equal(hasLiveHoldings([{ ticker: "RKLB", shares: 10 }]), true);
  assert.equal(
    shouldSkipEmptyBookNudge({
      hasClassroomSheet: true,
      hasLiveHoldings: false,
    }),
    true
  );
  assert.equal(
    shouldSkipEmptyBookNudge({
      hasClassroomSheet: false,
      hasLiveHoldings: true,
    }),
    true
  );
  assert.equal(
    shouldSkipEmptyBookNudge({
      hasClassroomSheet: false,
      hasLiveHoldings: false,
    }),
    false
  );
  const now = new Date("2026-08-15T12:00:00Z");
  assert.equal(
    isEmptyBookNudgeDue({
      createdAt: "2026-08-14T12:00:00Z",
      sentAt: null,
      now,
    }),
    false
  );
  assert.equal(
    isEmptyBookNudgeDue({
      createdAt: "2026-08-08T12:00:00Z",
      sentAt: null,
      now,
    }),
    true
  );
  assert.equal(
    isEmptyBookNudgeDue({
      createdAt: "2026-08-01T12:00:00Z",
      sentAt: "2026-08-08T12:00:00Z",
      now,
    }),
    false
  );

  const text = emptyBookNudgeText("Martin Aasa");
  assert.equal(emptyBookNudgeSubject(), "Your portfolio is still empty");
  assert.match(text, /Hi Martin\./);
  assert.match(text, /add what you already own/i);
  assert.match(text, /upsidelab\.app/);
  assert.match(text, /one-time note/);
  assert.doesNotMatch(text, /\u2014/);
  assert.doesNotMatch(text, /spam/i);
  assert.doesNotMatch(text, /sleeve|dry powder|conviction|drawdown/i);

  const cron = readFileSync(
    join(process.cwd(), "src/lib/note-cron.ts"),
    "utf8"
  );
  const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
  const route = readFileSync(
    join(process.cwd(), "src/app/api/cron/empty-book-nudge/route.ts"),
    "utf8"
  );
  assert.match(cron, /hasLiveHoldings\(holdings\)/);
  assert.match(vercel, /\/api\/cron\/empty-book-nudge/);
  assert.match(vercel, /0 14 \* \* \*/);
  assert.match(route, /dispatchEmptyBookNudges/);
});

run("legal pages name the operator and match the product", () => {
  const product = readFileSync(
    join(process.cwd(), "src/lib/product.ts"),
    "utf8"
  );
  const terms = readFileSync(
    join(process.cwd(), "src/app/terms/page.tsx"),
    "utf8"
  );
  const privacy = readFileSync(
    join(process.cwd(), "src/app/privacy/page.tsx"),
    "utf8"
  );

  assert.match(product, /LEGAL_OPERATOR = "Upthink Solutions OÜ"/);
  assert.match(product, /LEGAL_COUNTRY = "Estonia"/);
  assert.match(product, /LEGAL_REGISTRY_CODE = "16683946"/);
  assert.match(product, /LEGAL_VAT_ID = "EE102590654"/);
  assert.match(product, /Aiandi tn 8\/2-28/);
  assert.match(product, /PRODUCT_CONTACT_EMAIL = "privacy@upthink.ee"/);
  assert.match(product, /PRODUCT_SUPPORT_EMAIL = "app.support@upthink.ee"/);

  for (const src of [terms, privacy]) {
    assert.match(src, /LEGAL_OPERATOR/);
    assert.match(src, /LEGAL_COUNTRY/);
    assert.match(src, /LEGAL_REGISTRY_CODE/);
    assert.match(src, /LEGAL_ADDRESS/);
    assert.match(src, /LEGAL_VAT_ID/);
    assert.match(src, /PRODUCT_CONTACT_EMAIL/);
    assert.match(src, /Under 13 is never allowed/);
    // Two ages now, and both documents must state both: 16 for someone
    // signing up on their own (the strictest EU Article 8 threshold, so no
    // per-country analysis is needed), 13 inside a teacher-run Classroom
    // (school context, pretend money, no payment).
    assert.match(src, /16 or older/);
    assert.match(src, /the age is 13/);
    assert.match(src, /PRODUCT_SUPPORT_EMAIL/);
    assert.match(src, /Classroom/);
    assert.match(src, /paper/);
    assert.doesNotMatch(src, /Martin Aasa/);
    assert.doesNotMatch(src, /Amanda|Rasmus|Karoliine/);
    assert.doesNotMatch(src, /martin\.aasa@upthink\.ee/);
    assert.doesNotMatch(src, /There is no separate company/);
    assert.doesNotMatch(src, /That person is responsible/);
    assert.doesNotMatch(src, /below the age required to hold a brokerage/);
    assert.doesNotMatch(src, /\u2014/);
  }

  {
    // The UI must enforce exactly the ages the documents state.
    const gate = readFileSync("src/components/SignInGate.tsx", "utf8");
    assert.match(gate, /invite\?\.kind === "classroom" \? 13 : 16/);
    /*
     * Age used to be its own checkbox. It is now asserted inside the same
     * sentence as Terms and Privacy, the way most sites do it -- one
     * consent, not a separate box to hunt for. The age itself is still
     * enforced and still varies by invite kind, so what this checks is
     * that the sentence carries it, not that a checkbox exists.
     */
    assert.match(gate, /you confirm you are \{minAge\} or older and agree to/);
    // The age claim and the documents must stay in one statement.
    const consent = gate.slice(gate.indexOf("you confirm you are"));
    assert.match(consent.slice(0, 400), /Terms/);
    assert.match(consent.slice(0, 400), /Privacy/);
    // No going back to a standalone age tickbox.
    assert.doesNotMatch(gate, /checked=\{ageOk\}|setAgeOk|ageConfirmed/);
  }

  assert.match(terms, /governed by the laws of \{LEGAL_COUNTRY\}/);
  assert.match(terms, /Courts in/);
  assert.match(terms, /what you paid/);

  assert.match(privacy, /today&apos;s prices, the companies you hold/);
  assert.match(privacy, /They do not see what you paid/);
  assert.match(privacy, /Pulse, the Sunday email/);
  assert.match(privacy, /screenshot/);
  assert.match(privacy, /Resend/);
  assert.match(privacy, /United States/);
  assert.match(privacy, /household/);
  assert.match(privacy, /Feedback/);
  assert.match(privacy, /Google sets cookies/);
  assert.match(privacy, /only if you allow/);
  assert.doesNotMatch(privacy, /explicitly ask them to/);
  assert.doesNotMatch(privacy, /not your raw cash balance/);
  assert.doesNotMatch(privacy, /only when you explicitly ask/);
});

run("production telemetry covers crashes, slow routes, and vitals", () => {
  const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
  assert.ok(/<WebVitals \/>/.test(layout), "root layout must report web vitals");
  assert.match(layout, /ConsentedAnalytics/);
  const inst = readFileSync(
    join(process.cwd(), "src/instrumentation.ts"),
    "utf8"
  );
  assert.ok(/installSlowRouteLogger/.test(inst));
  assert.match(
    inst,
    /if \(isRequestAbort\(err\)\) return;/,
    "onRequestError must skip client disconnects, not log them as crashes"
  );
  const observe = readFileSync(
    join(process.cwd(), "src/lib/observe-route.ts"),
    "utf8"
  );
  assert.match(
    observe,
    /isRequestAbort/,
    "observeRoute must not log a hung-up client as route_throw"
  );
  const logError = readFileSync(
    join(process.cwd(), "src/app/api/internal/log-error/route.ts"),
    "utf8"
  );
  assert.ok(/sanitizeContext\(body\.context\)/.test(logError));
  const apiRoot = join(process.cwd(), "src/app/api");
  const missing: string[] = [];
  const walk = (dir: string) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.name === "route.ts") {
        const src = readFileSync(full, "utf8");
        // cronRoute is observeRoute plus the dead-man's-switch ping
        // (src/lib/cron-heartbeat.ts); a route wrapped in it is observed.
        if (!/(observeRoute|cronRoute)\(/.test(src)) missing.push(full);
      }
    }
  };
  walk(apiRoot);
  assert.deepEqual(missing, [], `unwrapped API routes: ${missing.join(", ")}`);
});

run("offline-first engine caches the book and queues safe writes", () => {
  const sw = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
  // Pin that the shell cache *is* versioned, not which version it is on.
  // Pinning the literal made every legitimate bump a red invariant, which
  // is how this sat failing after the favicon work moved it to v8. The
  // name now also carries the mark-source hash (mark-version.test.ts
  // owns that half), so the shape is v<n>-<hash8>.
  assert.match(sw, /const CACHE = "upside-shell-v\d+-[0-9a-f]{8}"/);
  assert.match(sw, /skipWaiting/);
  assert.match(sw, /clients\.claim/);
  assert.match(sw, /path\.startsWith\("\/api\/"\)/);
  assert.doesNotMatch(sw, /cache\.put\(.*\/api\//);

  const nextCfg = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
  assert.match(nextCfg, /source: "\/sw\.js"/);
  assert.match(nextCfg, /Service-Worker-Allowed/);

  const banner = readFileSync(
    join(process.cwd(), "src/components/OfflineBanner.tsx"),
    "utf8"
  );
  assert.match(banner, /Offline Mode/);
  assert.match(banner, /useOnlineStatus/);
  assert.match(banner, /pointer-events-none fixed/);
  assert.doesNotMatch(banner, /PAGE_COLUMN_CLASS/);
  assert.doesNotMatch(banner, /border-b/);

  const providers = readFileSync(
    join(process.cwd(), "src/components/Providers.tsx"),
    "utf8"
  );
  assert.match(providers, /OfflineRuntime/);
  assert.match(providers, /OfflineBanner/);

  const header = readFileSync(
    join(process.cwd(), "src/components/AppHeader.tsx"),
    "utf8"
  );
  assert.doesNotMatch(header, /Offline Mode/);
  assert.doesNotMatch(header, /OfflineBanner/);

  const queue = readFileSync(
    join(process.cwd(), "src/lib/offline/sync-queue.ts"),
    "utf8"
  );
  assert.match(queue, /\/api\/account\/experience-tier/);
  assert.match(queue, /\/api\/lab/);
  assert.match(queue, /\/api\/feedback/);
  assert.doesNotMatch(queue, /\/api\/holdings/);
  assert.doesNotMatch(queue, /\/api\/portfolios/);

  const book = readFileSync(join(process.cwd(), "src/lib/book-cache.ts"), "utf8");
  assert.match(book, /persistBookSnapshot/);
  const quotes = readFileSync(
    join(process.cwd(), "src/lib/quote-cache.ts"),
    "utf8"
  );
  assert.match(quotes, /persistQuotesSnapshot/);
});

run("GDPR hard-delete, export engine, and session purge", () => {
  const mig = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260817124031_gdpr_hard_delete_cash_events.sql"
    ),
    "utf8"
  );
  assert.match(mig, /create table if not exists public\.portfell_cash_events/);
  assert.match(mig, /references public\.portfell_portfolios\(id\) on delete cascade/);
  assert.match(mig, /portfell_purge_user_data/);
  assert.match(mig, /portfell_scrub_snapshot_payload/);
  assert.match(mig, /portfell_profiles_before_delete/);
  assert.match(mig, /delete from public\.portfell_error_log where user_id = p_uid/);
  assert.match(mig, /insert into public\.portfell_cash_events/);
  assert.doesNotMatch(mig, /grant execute[^;]*portfell_purge_user_data[^;]*to authenticated/i);

  // One export route. `/api/user/export` was a second door onto the same
  // payload that nothing in the app opened, and it is gone.
  assert.ok(!existsSync(join(process.cwd(), "src/app/api/user/export")));

  const accountExport = readFileSync(
    join(process.cwd(), "src/app/api/account/export/route.ts"),
    "utf8"
  );
  assert.match(accountExport, /encrypt: false/);
  assert.match(accountExport, /userExportResponse/);

  const accountPage = readFileSync(
    join(process.cwd(), "src/components/AccountPage.tsx"),
    "utf8"
  );
  assert.match(accountPage, /fetch\("\/api\/account\/export"/);
  assert.match(accountPage, /fetch\("\/api\/account\/delete"/);

  const del = readFileSync(
    join(process.cwd(), "src/app/api/account/delete/route.ts"),
    "utf8"
  );
  assert.match(del, /revokeAllUserSessions/);
  assert.match(del, /signOut\(jwt, "global"\)/);
  assert.match(del, /deleteUser/);

  const auth = readFileSync(
    join(process.cwd(), "src/components/AuthProvider.tsx"),
    "utf8"
  );
  assert.match(auth, /\/api\/auth\/sign-out/);
  assert.match(auth, /signOut\(\{ scope: "global" \}\)/);
  assert.match(auth, /purgeClientSession/);

  const signOut = readFileSync(
    join(process.cwd(), "src/app/api/auth/sign-out/route.ts"),
    "utf8"
  );
  assert.match(signOut, /observeRoute\(handlePOST, "\/api\/auth\/sign-out"\)/);
  assert.match(signOut, /revokeAllUserSessions/);

  const engine = readFileSync(
    join(process.cwd(), "src/lib/gdpr/user-export.ts"),
    "utf8"
  );
  assert.match(engine, /cash_events/);
  assert.match(engine, /omitKeys\(row, \["token_hash", "token_hint", "token"\]\)/);
  assert.match(engine, /sliceSnapshotPayload/);
  assert.doesNotMatch(engine, /select\([^)]*token_hash/);
});

run("signed-in users only see sheets they co-own", () => {
  const dash = readFileSync(
    join(process.cwd(), "src/components/Dashboard.tsx"),
    "utf8"
  );
  assert.match(dash, /isUnsignedLocalCache/);
  assert.match(dash, /keepLiveSheetsOnly/);
  assert.match(dash, /isLiveSheetId/);
  assert.match(dash, /user \? "supabase" : "demo"/);
  const writes = readFileSync(
    join(process.cwd(), "src/lib/use-dashboard-book-writes.ts"),
    "utf8"
  );
  const addSheet = writes.slice(
    writes.indexOf("async function handleAddSheet"),
    writes.indexOf("async function ensureFirstSheet")
  );
  assert.match(addSheet, /if \(user\) \{/);
  assert.doesNotMatch(addSheet, /if \(source === "supabase"\)/);
  const load = dash.slice(
    dash.indexOf("const loadPortfolios"),
    dash.indexOf("const applyFxPayload")
  );
  assert.match(load, /sourceName === "supabase" \|\| userId/);
  assert.doesNotMatch(load, /source: "demo"/);

  const api = readFileSync(
    join(process.cwd(), "src/app/api/portfolios/route.ts"),
    "utf8"
  );
  /*
    The seed those two names referred to is gone: it was four real people's
    portfolios, read by nothing, in a public repository. The assertion is
    now that neither the route nor the store carries one again.
  */
  assert.doesNotMatch(api, /DEMO_PORTFOLIOS/);
  assert.doesNotMatch(api, /DEMO_HOLDINGS/);

  assert.match(api, /A signed-in book is only sheets this user co-owns/);

  const runtime = readFileSync(
    join(process.cwd(), "src/lib/offline/runtime.ts"),
    "utf8"
  );
  assert.match(runtime, /isUnsignedLocalCache/);
  assert.match(runtime, /book\.userId === uid/);

  const demo = readFileSync(
    join(process.cwd(), "src/lib/demo-store.ts"),
    "utf8"
  );
  assert.match(demo, /portfolios: \[\], holdings: \[\]/);
  /*
    The sentence this used to look for stood over four real people's
    portfolios, which were read by nothing and sat in a public repository.
    What matters is that an unsigned store starts empty and that no seed
    comes back, which the line above and the two below assert directly.
  */
  assert.doesNotMatch(demo, /DEMO_PORTFOLIOS|DEMO_HOLDINGS/);
  assert.ok(!existsSync(join(process.cwd(), "data/locked-demo.json")));
});

run("classroom membership actions stay per person, not household-mirrored", () => {
  // Audit pass 8: resolveTargetUserIds used to expand every admin remove/
  // re-role action to the target's household partner (Rasmus <-> Karoliine,
  // Martin <-> Amanda) regardless of community kind. The DB-side mirror
  // trigger (053) already excludes classrooms; the app-side admin action
  // route did not, so a teacher removing one sibling from a class could
  // silently also evict the other sibling and unpin their homework sheet,
  // even though classrooms are explicitly per-person (AGENTS.md).
  const route = readFileSync(
    join(
      process.cwd(),
      "src/app/api/communities/[id]/members/[userId]/route.ts"
    ),
    "utf8"
  );
  assert.match(route, /isClassroomKind/);
  const resolveFn = route.slice(
    route.indexOf("async function resolveTargetUserIds"),
    route.indexOf("/** Admin: remove member or change role")
  );
  assert.match(resolveFn, /isClassroomKind\(/);
  assert.match(resolveFn, /return aliasIds;/);
  // The household expansion (expandHouseholdUserIds) must come after the
  // classroom early-return, not before it.
  const classroomGateIdx = resolveFn.indexOf("isClassroomKind(");
  const householdExpandIdx = resolveFn.indexOf("expandHouseholdUserIds(");
  assert.ok(classroomGateIdx > -1 && householdExpandIdx > -1);
  assert.ok(classroomGateIdx < householdExpandIdx);
});

run("a private community's existence does not leak through join-request", () => {
  // Audit pass 8: a nonexistent community id used to 404 ("Not found")
  // while a real private community 403'd ("This community is invite-only")
  // -- distinguishing the two let anyone holding a private community's id
  // (a pasted link, a screenshot) confirm it exists even though they were
  // never shown its name. Both cases now respond identically.
  const route = readFileSync(
    join(
      process.cwd(),
      "src/app/api/communities/[id]/join-request/route.ts"
    ),
    "utf8"
  );
  const postFn = route.slice(
    route.indexOf("async function handlePOST"),
    route.indexOf("/** Cancel your own pending request. */")
  );
  assert.doesNotMatch(postFn, /"Not found"/);
  assert.match(
    postFn,
    /!community \|\| \(community as \{ visibility\?: string \}\)\.visibility !== "public"/
  );
});

run("a deleted account's email doesn't survive in the hardcoded seed tables", () => {
  // Pass 9 L2. portfell_household_groups, portfell_account_aliases, and
  // portfell_seed_claims are migration-seeded, no FK to portfell_profiles.
  // AGENTS.md guards their *content* (don't invent/edit Martin's family
  // data), not whether account deletion sweeps a matching email out of
  // them -- this closes that erasure gap without touching a single row.
  const mig = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260819170000_purge_email_seed_tables_on_deletion.sql"
    ),
    "utf8"
  );
  assert.match(mig, /create or replace function public\.portfell_purge_user_data/);
  assert.match(
    mig,
    /delete from public\.portfell_household_groups\s+where lower\(email\) = lower\(em\)/
  );
  assert.match(
    mig,
    /delete from public\.portfell_account_aliases\s+where lower\(alias_email\) = lower\(em\)\s+or lower\(primary_email\) = lower\(em\)/
  );
  assert.match(
    mig,
    /delete from public\.portfell_seed_claims\s+where lower\(email\) = lower\(em\)/
  );
  // Must stay inside the `em is not null` guard so it never fires with a
  // null/empty email (which would otherwise match nothing, harmlessly --
  // but the guard is what makes that explicit rather than accidental).
  assert.match(
    mig,
    /if em is not null and length\(trim\(em\)\) > 0 then[\s\S]{0,900}portfell_seed_claims/
  );
});

run("a community keeps at least one admin, and a student can't self-unpin a classroom sheet, even over direct REST", () => {
  // Pass 8 M2 + L1, folded into one migration since both were the same
  // shape of "app already enforces this, the database doesn't yet."
  const mig = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260819160000_community_last_admin_and_classroom_unpin.sql"
    ),
    "utf8"
  );
  assert.match(
    mig,
    /create or replace function public\.portfell_community_members_guard_last_admin/
  );
  assert.match(mig, /raise exception 'Keep at least one admin'/);
  assert.match(
    mig,
    /before update or delete on public\.portfell_community_members/
  );
  // Must not block a community's own cascade delete of its last admin row.
  assert.match(
    mig,
    /community_still_exists/,
    "must check the parent community row before raising, so deleting the community itself still works"
  );
  assert.match(
    mig,
    /create policy portfell_community_portfolios_owner_delete/
  );
  assert.match(mig, /not exists[\s\S]{0,220}kind = 'classroom'/);
});

run("a classmate's cost basis is not the whole class's business", () => {
  // Audit pass 8 M1: the gate was `classroom` alone, so every student saw
  // every classmate's buy price on the class book. The teacher needs it
  // (that is what the original comment says it was for) and you always see
  // your own; nobody else does. Circles still hide it from everyone.
  const route = readFileSync(
    join(process.cwd(), "src/app/api/communities/[id]/book/route.ts"),
    "utf8"
  );
  assert.match(route, /const viewerIsAdmin =/);
  assert.match(route, /const showAllCost = classroom && viewerIsAdmin/);
  assert.match(
    route,
    /buy_price: showAllCost \|\| \(classroom && own\) \? row\.buy_price : 0/
  );
  assert.doesNotMatch(route, /buy_price: classroom \? row\.buy_price : 0/);
});

run("the four open write endpoints survive a serverless restart", () => {
  // Audit pass 2: an in-memory counter resets with the lambda, so a caller
  // who reconnects gets a fresh budget every time. These four take
  // unauthenticated or cheap-to-repeat writes, so they use the Postgres
  // counter instead.
  for (const rel of [
    "src/app/api/feedback/route.ts",
    "src/app/api/internal/telemetry/route.ts",
    "src/app/api/internal/log-error/route.ts",
    "src/app/api/communities/join/route.ts",
  ]) {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    assert.match(src, /takeDurableRateLimit/, `${rel} must use the durable limiter`);
    assert.doesNotMatch(
      src,
      /\bcheckRateLimit\(/,
      `${rel} still calls the in-memory limiter`
    );
  }
});

run("every text box that can fail tells you what happened", () => {
  /*
   * The watchlist box had four ways to do nothing at all: a name it could
   * not resolve, a ticker already in your portfolio, one already on the
   * list, and a search request that threw. Each was a bare `return`. You
   * pressed Enter and got no message, no spinner, and your text still
   * sitting there -- indistinguishable from the app being broken.
   *
   * The walkthrough's own holdings box gets the same interaction right, so
   * it is the standard rather than an invention. Both are checked here so
   * neither regresses back to silence.
   */
  const watch = readFileSync(
    join(process.cwd(), "src/components/WatchlistStrip.tsx"),
    "utf8"
  );
  assert.match(watch, /setNote\(/, "watchlist reports outcomes");
  assert.match(watch, /role="status"/, "and announces them to screen readers");
  assert.match(watch, /Nothing found for/);
  assert.match(watch, /already own/);
  assert.match(watch, /already on your watchlist/);
  // A slow company-name lookup must show it is working.
  assert.match(watch, /setAdding\(true\)/);
  assert.match(watch, /disabled=\{!draft\.trim\(\) \|\| adding\}/);
  // A failed lookup must be distinguishable from "no such company",
  // because only one of the two is worth retrying.
  assert.match(watch, /Couldn't look that up just now/);

  const onboarding = readFileSync(
    join(process.cwd(), "src/components/WelcomeTour.tsx"),
    "utf8"
  );
  assert.match(onboarding, /setStockError\("Type a ticker, a company, or a coin\."\)/);
  assert.match(onboarding, /Couldn't open a portfolio/);
  assert.match(onboarding, /Couldn't save that holding/);
});

run("every community route checks membership in code, not just auth", () => {
  /*
   * `getSupabaseDataClient()` returns the **service role** client whenever
   * one is configured, and the service role bypasses RLS entirely. That is
   * the documented convention here (AGENTS.md: "Prefer
   * SUPABASE_SERVICE_ROLE_KEY for API writes, with ownership checks in
   * code") -- but it means the database will not save a route that forgets
   * to check. The code is the only gate there is.
   *
   * Every route under /api/communities/[id] was read by hand in the Round 2
   * audit and every one of them checks. This turns that reading into
   * something that stays true: a thirteenth route added next year cannot
   * quietly ship without a gate, and the failure names the file.
   *
   * `requireAuthUser` alone is deliberately not enough to pass. Being
   * signed in says nothing about belonging to *this* community, and these
   * routes serve members' emails, bios, cost bases and combined books.
   */
  const dir = join(process.cwd(), "src/app/api/communities");
  const routes: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "route.ts") routes.push(full);
    }
  };
  walk(dir);

  const scoped = routes.filter((f) => f.includes(`communities${sep}[id]`));
  // If this ever hits zero the glob broke and the test would pass vacuously.
  assert.ok(scoped.length >= 9, `expected the [id] routes, found ${scoped.length}`);

  for (const file of scoped) {
    const src = readFileSync(file, "utf8");
    const rel = file.slice(file.indexOf("src/"));
    assert.match(src, /requireAuthUser/, `${rel} must require a signed-in user`);
    assert.ok(
      /userIsCommunityMember|userIsCommunityAdmin/.test(src),
      `${rel} must check membership or admin -- the service role bypasses RLS, so nothing else will`
    );
  }
});

run("the logo mark fills its box, and its lockups keep its aspect", () => {
  /*
   * This mark went missing from the app bar and nothing failed.
   *
   * It became inline SVG (to get a 260 KB PNG out of the LCP path) keeping
   * the source's `0 0 128 128` box, with the polygons pushed inside it by a
   * `translate(14 18) scale(0.78)`. That left about a third of the viewBox
   * as empty padding. Invisible at splash size; in a 1.4em app-bar box the
   * mark drew roughly 12 px and read as simply absent.
   *
   * A geometry bug like that throws nothing and types fine, so the only
   * thing that catches it is measuring the artwork against the box it is
   * declared in. That is what this does.
   *
   * The facets come from `src/lib/brand/mark.ts` rather than from a table
   * inside the component, because the letter, the favicon, the BIMI mark,
   * the app icons and the OG card are all one drawing since 2026-08-23.
   */
  const src = readFileSync(
    join(process.cwd(), "src/components/UpsideLogo.tsx"),
    "utf8"
  );

  assert.equal(MARK_FACETS.length, 10, "expected the ten facets");

  const xs = MARK_FACETS.flatMap((f) => f.points.map((p) => p[0]));
  const ys = MARK_FACETS.flatMap((f) => f.points.map((p) => p[1]));
  for (const n of [...xs, ...ys]) assert.ok(Number.isFinite(n), `bad point ${n}`);

  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const artW = Math.max(...xs) - minX;
  const artH = Math.max(...ys) - minY;

  const [vx, vy, vw, vh] = MARK_VIEWBOX.trim().split(/\s+/).map(Number) as number[];

  /*
   * The component takes its viewBox from the geometry rather than repeating
   * it, so a drifted number is not a thing that can happen -- but a wrapping
   * transform is, and one of those makes the viewBox stop describing the
   * artwork again. The per-facet transforms are fine: they scale each facet
   * about its own centroid to close the hairlines at small sizes, and cannot
   * move the drawing as a whole.
   */
  assert.match(
    src,
    /viewBox=\{MARK_VIEWBOX\}/,
    "the mark must take its viewBox from the geometry"
  );
  assert.doesNotMatch(
    src,
    /<g transform=/,
    "a transform inside the mark makes the viewBox no longer describe the artwork"
  );

  const close = (a: number, b: number) => Math.abs(a - b) <= 1;
  assert.ok(close(vx!, minX), `viewBox x ${vx} should sit at the art's left edge ${minX.toFixed(2)}`);
  assert.ok(close(vy!, minY), `viewBox y ${vy} should sit at the art's top edge ${minY.toFixed(2)}`);
  assert.ok(close(vw!, artW), `viewBox width ${vw} should match the art width ${artW.toFixed(2)}`);
  assert.ok(close(vh!, artH), `viewBox height ${vh} should match the art height ${artH.toFixed(2)}`);

  /*
   * The mark is about 1.24x wider than tall. Every lockup that gives it an
   * explicit box must use that ratio, or the browser letterboxes it and the
   * mark silently loses height it could have had -- the same "still there,
   * just too small to see" failure in a different disguise.
   */
  const aspect = artW / artH;
  assert.ok(
    Math.abs(aspect - MARK_ASPECT) < 0.001,
    `the geometry says ${MARK_ASPECT.toFixed(3)} but the drawing measures ${aspect.toFixed(3)}`
  );
  const boxes = [...src.matchAll(/h-\[([\d.]+)(em|rem)\] w-\[([\d.]+)\2\]/g)];
  assert.ok(boxes.length >= 3, `expected the mark's sized boxes, found ${boxes.length}`);
  for (const box of boxes) {
    const h = Number(box[1]);
    const w = Number(box[3]);
    assert.ok(
      Math.abs(w / h - aspect) < 0.05,
      `${box[0]} has aspect ${(w / h).toFixed(3)}, but the mark is ${aspect.toFixed(3)} wide`
    );
  }

  /*
   * And the mark is exactly symmetric about the centre line. It was traced
   * rather than constructed, and the trace leaned up to 0.75 units out of
   * true across a 105-unit drawing -- which is nothing on a specimen sheet
   * and a visibly crooked logo on a splash screen.
   */
  const AXIS = minX + artW / 2;
  const key = (x: number, y: number) => `${Math.abs(x - AXIS).toFixed(2)}:${y.toFixed(2)}`;
  const tally = new Map<string, number>();
  for (const facet of MARK_FACETS) {
    for (const [x, y] of facet.points) {
      tally.set(key(x, y), (tally.get(key(x, y)) ?? 0) + 1);
    }
  }
  const lonely = [...tally.entries()].filter(([, n]) => n % 2 !== 0);
  assert.deepEqual(
    lonely.map(([k]) => k),
    [],
    `these points have no mirror across the centre line, so the mark leans: ${lonely.map(([k]) => k).join(", ")}`
  );
});

run("SVG paint servers get per-instance ids, never literals", () => {
  /*
   * The logo vanished from the app bar because of this, and nothing caught
   * it -- not types, not lint, not any test.
   *
   * The lockup mounts twice per page (the mobile top bar and the desktop
   * header, one hidden by a breakpoint). Both emitted gradients with the
   * same literal ids, so `url(#upside-mark-g0)` resolved to the FIRST match
   * in document order -- the copy inside the hidden header. A paint server
   * inside a `display:none` subtree does not paint, so the visible mark
   * held its 24x20 box and drew nothing at all.
   *
   * The codebase already knew this: ForecastPanel and BookNavChart both
   * derive their gradient id from `useId()`. The inline logo was the one
   * place that used a literal, and it was introduced by this audit.
   *
   * A duplicate id is legal HTML, renders without complaint, and only
   * misbehaves when two copies are on screen at once -- so the only
   * defence is refusing the literal.
   */
  /*
   * The one shape a literal is allowed in, and it is not an exception so
   * much as the other half of the same rule.
   *
   * A paint server referenced from a STYLESHEET cannot have a per-instance
   * id: `filter: url(#ambient-dither)` in globals.css is static text, and
   * there is nothing for `useId()` to reach. (Nor can it move to a file and
   * be referenced as `url(/x.svg#id)`, which is why it is inline: Safari
   * does not resolve a filter from an external document at all.)
   *
   * So for those the defence is not a unique id, it is proving the thing
   * can only mount once. That is strictly stronger than what this check
   * asks of everything else, which is only that two mounts would not
   * collide. Below: every literal id must be referenced from globals.css,
   * the component holding it must be rendered from exactly one place, and
   * that place must be the root layout. Miss any of the three and it is an
   * offender again.
   */
  const PAINT_SERVERS = /<(linearGradient|radialGradient|pattern|filter|mask|clipPath)\b[^>]*?\bid="([^"]+)"/g;
  const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const LAYOUT = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
  const styledFrom = (id: string) => CSS.includes(`url(#${id})`);

  const offenders: string[] = [];
  /** rel path -> the literal ids in it that a stylesheet points at. */
  const singletons = new Map<string, string[]>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".tsx") || entry.name.includes(".test.")) continue;
      const src = readFileSync(full, "utf8");
      const rel = full.slice(full.indexOf("src/")).split(sep).join("/");
      // A literal id (id="...") rather than an interpolated one (id={...}).
      const ids = [...src.matchAll(PAINT_SERVERS)].map((m) => m[2]!);
      if (!ids.length) continue;
      if (ids.every(styledFrom)) singletons.set(rel, ids);
      else offenders.push(rel);
    }
  };
  walk(join(process.cwd(), "src"));

  assert.deepEqual(
    offenders,
    [],
    `these give an SVG paint server a fixed id, which collides when the component mounts twice and leaves the visible copy painting nothing: ${offenders.join(", ")}`
  );

  // A stylesheet-referenced id buys its literal by being unmountable twice.
  for (const [rel, ids] of singletons) {
    const name = rel.split("/").pop()!.replace(/\.tsx$/, "");
    const mounts: string[] = [];
    const findMounts = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) { findMounts(full); continue; }
        if (!e.name.endsWith(".tsx") || e.name.includes(".test.")) continue;
        if (full.endsWith(rel.split("/").pop()!)) continue; // its own definition
        if (readFileSync(full, "utf8").includes(`<${name} `) ||
            readFileSync(full, "utf8").includes(`<${name}/>`)) {
          mounts.push(full.slice(full.indexOf("src/")).split(sep).join("/"));
        }
      }
    };
    findMounts(join(process.cwd(), "src"));
    assert.deepEqual(
      mounts,
      ["src/app/layout.tsx"],
      `${rel} holds ${ids.join(", ")}, which globals.css points at by name, so it may only be rendered from the root layout. Rendered from: ${mounts.join(", ") || "nowhere"}`
    );
    assert.equal(
      LAYOUT.split(`<${name} `).length - 1 + LAYOUT.split(`<${name}/>`).length - 1,
      1,
      `the root layout renders ${name} more than once, so its literal ids collide`
    );
  }

  // And the logo specifically must keep deriving its ids per instance.
  const logo = readFileSync(
    join(process.cwd(), "src/components/UpsideLogo.tsx"),
    "utf8"
  );
  assert.match(logo, /useId\(\)/, "the logo mark must derive its gradient ids from useId");
  assert.match(logo, /id=\{`upside-mark-\$\{uid\}/);
});

run("nothing distinguishes a surface by a colour equal to its container", () => {
  /*
   * `--secondary` and `--muted` hold the same value. That is fine until
   * something paints one on top of the other to say "this is the selected
   * one", which is exactly what the segmented control did: the chosen pill
   * was the same colour as the container it sat in and disappeared, while
   * the hover veil above it stayed visible. The control advertised the item
   * under your cursor more loudly than the item you had picked.
   *
   * This fails while the two tokens are identical AND anything uses
   * bg-secondary for a selected state. If they are ever given different
   * values, the check retires itself.
   */
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const val = (name: string) => {
    const m = new RegExp(`^\\s+--${name}:\\s*([^;]+);`, "m").exec(css);
    return m ? m[1]!.trim() : null;
  };
  const secondary = val("secondary");
  const muted = val("muted");
  assert.ok(secondary && muted, "could not read --secondary / --muted");

  if (secondary !== muted) return; // they differ now; nothing to guard

  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(e.name) || e.name.includes(".test.")) continue;
      const src = readFileSync(full, "utf8");
      if (/(data-\[state=on\]|aria-pressed|aria-selected|data-\[state=active\]):bg-secondary/.test(src)) {
        offenders.push(full.slice(full.indexOf("src/")).split(sep).join("/"));
      }
    }
  };
  walk(join(process.cwd(), "src"));

  assert.deepEqual(
    offenders,
    [],
    `--secondary and --muted are both ${secondary}, so a selected state painted bg-secondary is invisible on a bg-muted container: ${offenders.join(", ")}`
  );
});

if (failed > 0) {
  console.error(`\n${failed} invariant(s) failed`);
  process.exit(1);
}
console.log("\nall invariants passed");
