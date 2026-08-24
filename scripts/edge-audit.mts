/**
 * Edge-case guard for the pure calculation layer.
 *
 * Feeds every money/percentage function the inputs real users actually
 * produce (empty book on day one, a single name, a gifted share with no
 * cost basis, a short showing as a negative value, a position that went to
 * zero, a 0% or negative growth rate, a withdrawal larger than the
 * balance) and fails on anything non-finite, out of its documented range,
 * or negative where it can't be.
 *
 * This caught allocation slices rendering as 105% and -5% when a book held
 * a negative position, which the UI turned into a negative CSS bar width.
 *
 * Run: npm run check:edges
 */
const problems: string[] = [];

/* eslint-disable @typescript-eslint/no-explicit-any -- assertions here
   deliberately probe values the types claim are impossible; that's the
   whole point of the harness. */
type Predicate = (v: any) => boolean;

function check(
  label: string,
  value: unknown,
  predicate: Predicate,
  expectation: string
) {
  if (!predicate(value)) {
    problems.push(
      `${label}: got ${JSON.stringify(value)}, expected ${expectation}`
    );
  }
}
const finite: Predicate = (v) => typeof v === "number" && Number.isFinite(v);
const inRange =
  (lo: number, hi: number): Predicate =>
  (v) =>
    finite(v) && v >= lo && v <= hi;

const { concentrationRead, themeBreakdown, allocationBySector, allocationByTicker } =
  await import("@/lib/allocation");
const { buildPortfolioPersonality } = await import("@/lib/portfolio-personality");

const CASES = {
  empty: [],
  single: [{ ticker: "NVDA", currentValue: 10000 }],
  zeroValue: [{ ticker: "NVDA", currentValue: 0 }],
  allZero: [
    { ticker: "NVDA", currentValue: 0 },
    { ticker: "AMD", currentValue: 0 },
  ],
  negative: [{ ticker: "NVDA", currentValue: -500 }],
  mixedNegative: [
    { ticker: "NVDA", currentValue: 10000 },
    { ticker: "AMD", currentValue: -500 },
  ],
  tiny: [
    { ticker: "NVDA", currentValue: 0.00001 },
    { ticker: "AMD", currentValue: 0.00001 },
  ],
  huge: [
    { ticker: "NVDA", currentValue: 1e12 },
    { ticker: "AMD", currentValue: 1 },
  ],
  unknownTicker: [{ ticker: "ZZZZQQ", currentValue: 5000 }],
  many: Array.from({ length: 60 }, (_, i) => ({
    ticker: `T${i}`,
    currentValue: 1000,
  })),
};

for (const [name, holdings] of Object.entries(CASES)) {
  const c = concentrationRead(holdings);
  check(`concentrationRead(${name}).effectivePositions`, c.effectivePositions, finite, "finite");
  check(`concentrationRead(${name}).topWeightPct`, c.topWeightPct, inRange(0, 1), "0..1");
  check(`concentrationRead(${name}).topFivePct`, c.topFivePct, inRange(0, 1), "0..1");
  check(`concentrationRead(${name}).positionCount`, c.positionCount, (v) => Number.isInteger(v) && v >= 0, "int >= 0");

  const themes = themeBreakdown(holdings);
  const sum = themes.reduce((s, t) => s + t.pct, 0);
  check(
    `themeBreakdown(${name}) pct sum`,
    Number(sum.toFixed(6)),
    (v) => themes.length === 0 ? v === 0 : Math.abs(v - 1) < 1e-6,
    "0 (empty) or 1"
  );
  for (const t of themes) {
    check(`themeBreakdown(${name}).${t.theme}.pct`, t.pct, inRange(0, 1), "0..1");
    check(`themeBreakdown(${name}).${t.theme}.label`, t.label, (v) => typeof v === "string" && v.length > 0, "non-empty label");
  }

  const allocFns: [string, typeof allocationBySector][] = [
    ["allocationBySector", allocationBySector],
    ["allocationByTicker", allocationByTicker],
  ];
  for (const [fnName, fn] of allocFns) {
    for (const s of fn(holdings)) {
      check(`${fnName}(${name}).${s.label}.pct`, s.pct, inRange(0, 1), "0..1");
      check(`${fnName}(${name}).${s.label}.value`, s.value, finite, "finite");
    }
  }

  const p = buildPortfolioPersonality(holdings.map((h) => ({ ticker: h.ticker, value: h.currentValue })));
  check(`personality(${name}).diversificationScore`, p.diversificationScore, inRange(0, 100), "0..100");
  check(`personality(${name}).riskScore`, p.riskScore, inRange(0, 100), "0..100");
  check(`personality(${name}).expectedAnnualReturnPct`, p.expectedAnnualReturnPct, finite, "finite");
  check(`personality(${name}).maxDrawdownPct`, p.maxDrawdownPct, inRange(0, 100), "0..100");
  check(`personality(${name}).modeledAlphaPct`, p.modeledAlphaPct, finite, "finite");
  check(`personality(${name}).convictionScore`, p.convictionScore, inRange(0, 100), "0..100");
  check(`personality(${name}).specialistScore`, p.specialistScore, inRange(0, 100), "0..100");
  check(`personality(${name}).themeCount`, p.themeCount, (v) => finite(v) && v >= 0 && v <= 20, "0..20");
  check(`personality(${name}).cashPct`, p.cashPct, finite, "finite");
  check(`personality(${name}).animal`, p.animal, (v) => typeof v === "string" && v.length > 0, "an animal");
  check(`personality(${name}).tagline`, p.tagline, (v) => typeof v === "string" && !v.includes("undefined") && !v.includes("NaN"), "clean tagline");
}

{
  const empty = buildPortfolioPersonality([]);
  check("animal(empty)", empty.animal, (v) => v === "Hatchling", "Hatchling");
  const squirrel = buildPortfolioPersonality([{ ticker: "VOO", value: 70 }], 30);
  check("animal(cash-heavy)", squirrel.animal, (v) => v === "Squirrel", "Squirrel");
  const dragon = buildPortfolioPersonality([{ ticker: "BMNR", value: 100 }]);
  check("animal(crypto)", dragon.animal, (v) => v === "Dragon", "Dragon");
  const panda = buildPortfolioPersonality([
    { ticker: "NBIS", value: 80 },
    { ticker: "CRWV", value: 20 },
  ]);
  check("animal(ai-diet)", panda.animal, (v) => v === "Beaver", "Beaver");
  const octopus = buildPortfolioPersonality([
    { ticker: "NBIS", value: 25 },
    { ticker: "RKLB", value: 25 },
    { ticker: "NVDA", value: 20 },
    { ticker: "VOO", value: 15 },
    { ticker: "BMNR", value: 15 },
  ]);
  check("animal(many-themes)", octopus.animal, (v) => v === "Squid", "Squid");
}

// --- Compound engine ------------------------------------------------------
const { calculateCompound, DEFAULT_COMPOUND_INPUTS, timeToDouble } =
  await import("@/lib/compound-interest");

const COMPOUND_CASES: Record<string, Partial<typeof DEFAULT_COMPOUND_INPUTS>> = {
  defaults: {},
  zeroYears: { years: 0, months: 0 },
  zeroRate: { ratePercent: 0 },
  negativeRate: { ratePercent: -8 },
  zeroPrincipal: { principal: 0 },
  negativePrincipal: { principal: -1000 },
  hugeRate: { ratePercent: 500 },
  hugeHorizon: { years: 100 },
  withdrawMoreThanBalance: {
    principal: 100,
    contributionMode: "withdrawals",
    withdrawalAmount: 100000,
  },
  bigAnnualIncrease: { annualIncrease: 1000 },
  fractionalMonths: { years: 0, months: 7 },
};

for (const [name, patch] of Object.entries(COMPOUND_CASES)) {
  const inputs = { ...DEFAULT_COMPOUND_INPUTS, ...patch };
  let r;
  try {
    r = calculateCompound(inputs);
  } catch (e) {
    problems.push(`calculateCompound(${name}) threw: ${(e as Error).message}`);
    continue;
  }
  check(`compound(${name}).futureValue`, r.futureValue, finite, "finite");
  check(`compound(${name}).totalInterest`, r.totalInterest, finite, "finite");
  check(`compound(${name}).allTimeRoR`, r.allTimeRoR, finite, "finite");
  check(`compound(${name}).effectiveAnnualRate`, r.effectiveAnnualRate, finite, "finite");
  // Never-doubles (0% or negative) legitimately yields Infinity here; the
  // Compound sheet guards it with Number.isFinite and prints a dash.
  check(
    `compound(${name}).doubleYears`,
    r.doubleYears,
    (v) => finite(v) || v === Infinity || v === null,
    "finite, or Infinity/null meaning never"
  );
  for (const seriesName of ["yearly", "monthly"] as const) {
    const rows = r[seriesName];
    check(
      `compound(${name}).${seriesName} all finite`,
      Array.isArray(rows) &&
        rows.every(
          (row) =>
            finite(row.interest) &&
            finite(row.accruedInterest) &&
            finite(row.balance)
        ),
      (v) => v === true,
      "every row finite"
    );
    check(
      `compound(${name}).${seriesName} no negative balance`,
      Array.isArray(rows) && rows.every((row) => row.balance >= -1e-6),
      (v) => v === true,
      "no negative balances"
    );
  }
}

// annualRate here is a decimal (0.07 = 7%), not a percent.
for (const [label, rate] of [["zero", 0], ["negative", -0.05], ["normal", 0.07]] as const) {
  const d = timeToDouble(rate, "monthly");
  check(
    `timeToDouble(${label})`,
    d,
    (v) =>
      v != null &&
      !Number.isNaN(v.years) &&
      !Number.isNaN(v.months) &&
      Number.isFinite(v.months),
    "never NaN (Infinity years is the legitimate 'never' sentinel)"
  );
}

// --- Today's P&L ----------------------------------------------------------
// The move is quoted against yesterday's close, so it has to be applied to
// the position's value *then*. Applying it to today's value understates the
// day by exactly the day's percent, which is what this pins down.
const { todayDollarFor } = await import("@/lib/overview");

for (const [label, shares, price, pct] of [
  ["down day", 500, 250.36, -0.034],
  ["up day", 500, 250.36, 0.034],
  ["flat", 500, 250.36, 0],
  ["huge gain", 10, 1000, 5],
] as const) {
  const priorClose = price / (1 + pct);
  const expected = shares * (price - priorClose);
  const got = todayDollarFor(shares * price, pct).dollar;
  check(
    `todayDollarFor(${label})`,
    Math.abs(got - expected) < 0.01,
    (v) => v === true,
    `shares x per-share move (${expected.toFixed(2)}), got ${got.toFixed(2)}`
  );
}

for (const bad of [null, undefined, NaN]) {
  const r = todayDollarFor(10000, bad);
  check(`todayDollarFor(${String(bad)})`, r.dollar, (v) => v === 0, "0");
  check(`todayDollarFor(${String(bad)}).pct`, r.pct, (v) => v === null, "null");
}
// -100% would divide yesterday's close to zero.
check(
  "todayDollarFor(total wipeout)",
  todayDollarFor(0, -1).dollar,
  finite,
  "finite, not -Infinity"
);

// --- Correlation ----------------------------------------------------------
const { pearson } = await import("@/lib/correlation");
const CORR_CASES: Record<string, [number[], number[]]> = {
  identical: [[1, 2, 3, 4], [1, 2, 3, 4]],
  inverse: [[1, 2, 3, 4], [4, 3, 2, 1]],
  flatA: [[5, 5, 5, 5], [1, 2, 3, 4]],
  bothFlat: [[5, 5, 5, 5], [5, 5, 5, 5]],
  empty: [[], []],
  singlePoint: [[1], [1]],
  mismatchedLength: [[1, 2, 3], [1, 2]],
};
for (const [name, [a, b]] of Object.entries(CORR_CASES)) {
  const r = pearson(a, b);
  check(
    `pearson(${name})`,
    r,
    (v) => v === null || (finite(v) && v >= -1.0000001 && v <= 1.0000001),
    "null or -1..1"
  );
}

// --- Shock ----------------------------------------------------------------
const { SHOCKS, shockedPrice, shockedPct } = await import("@/lib/book-shock");
for (const s of SHOCKS) {
  for (const [label, spot] of [["normal", 100], ["zero", 0], ["tiny", 0.0001], ["negative", -5]] as const) {
    for (const ticker of ["NVDA", "ZZZZQQ"]) {
      const sp = shockedPrice(ticker, spot, s.id);
      check(
        `shockedPrice(${ticker},${s.id},${label})`,
        sp,
        (v) => finite(v),
        "finite"
      );
    }
  }
  check(`shockedPct(${s.id})`, shockedPct("ZZZZQQ", s.id), finite, "finite");
}

// --- Trend story ------------------------------------------------------------
// Every regime × divergence combination has to produce a non-empty headline
// and sentence, and the sentence must not stutter the ticker (the original
// bug: composing "TICKER" placeholders wrong printed "NBIS NBIS is ..." or
// "NBIS 's long-term trend").
const { buildTrendStory } = await import("@/lib/market/trend-story");
const REGIMES = ["strong-up", "weakening", "strong-down", "recovering", "flat"] as const;
const DIVERGENCES = [
  null,
  { kind: "bearish" as const, weeksAgo: 2, priceFrom: 100, priceTo: 110, rsiFrom: 70, rsiTo: 60 },
  { kind: "bullish" as const, weeksAgo: 2, priceFrom: 100, priceTo: 90, rsiFrom: 30, rsiTo: 40 },
];
for (const regime of REGIMES) {
  for (const divergence of DIVERGENCES) {
    const story = buildTrendStory({
      ticker: "NBIS",
      regime,
      aboveLongMa: regime === "strong-up" || regime === "weakening",
      rsi: 55,
      macdBuilding: true,
      divergence,
      rs13: 0.1,
      rs26: 0.2,
      chg2w: 0.05,
      chg4w: 0.1,
    });
    const label = `trendStory(${regime},${divergence?.kind ?? "none"})`;
    check(label, story.headline, (v) => typeof v === "string" && v.length > 0, "non-empty headline");
    check(
      `${label}.sentence`,
      story.sentence,
      (v) => typeof v === "string" && v.includes("NBIS") && !v.includes("NBIS NBIS") && !/NBIS\s+'s/.test(v),
      "mentions NBIS exactly once, no stutter"
    );
    check(
      `${label}.priority`,
      story.priority,
      finite,
      "finite"
    );
  }
}

// The actual bug report this guards against: a name that just blew out
// earnings and ripped +75% in two weeks must not get told "weakening" /
// "trend rolling over" just because its slow 40-week average hasn't
// caught up yet. The sharp recent move has to win the headline.
{
  const surging = buildTrendStory({
    ticker: "CRWV",
    regime: "weakening",
    aboveLongMa: true,
    rsi: 55,
    macdBuilding: true,
    divergence: null,
    rs13: -0.099,
    rs26: 0.1,
    chg2w: 0.75,
    chg4w: 0.9,
  });
  check(
    "trendStory(surge-overrides-weakening).tone",
    surging.tone,
    (v) => v === "gain",
    "gain, not warn, despite weakening long-term regime"
  );
  check(
    "trendStory(surge-overrides-weakening).headline",
    surging.headline,
    (v) => typeof v === "string" && !/weaken|rolling over/i.test(v),
    "does not call it weakening/rolling over"
  );

  const crashing = buildTrendStory({
    ticker: "ZZZZ",
    regime: "strong-up",
    aboveLongMa: true,
    rsi: 45,
    macdBuilding: false,
    divergence: null,
    rs13: -0.2,
    rs26: -0.1,
    chg2w: -0.3,
    chg4w: -0.35,
  });
  check(
    "trendStory(surge-overrides-strong-up).tone",
    crashing.tone,
    (v) => v === "loss",
    "loss, not gain, despite still-intact long-term uptrend"
  );
}

// --- Pulse thesis-status/action reconciliation ------------------------------
// Trim and sell mean opposite situations (profit-taking on a winner vs.
// exiting a broken thesis). If the model conflates them, "broken" + "trim"
// must resolve to "sell" (never keep trim), and "broken" + "add" must
// soften the status rather than let a broken thesis recommend deploying.
const { reconcilePulseCheck } = await import("@/lib/thesis-pulse");
const baseCheck = {
  ticker: "ZZZZ",
  situation: ["placeholder"],
  moveReason: "placeholder",
  earningsNote: "",
  addLevel: "",
  verdict: "placeholder",
};
{
  const brokenTrim = reconcilePulseCheck({
    ...baseCheck,
    thesisStatus: "broken" as const,
    action: "trim" as const,
    trimPct: 20,
  });
  check(
    "reconcile(broken+trim).action",
    brokenTrim.action,
    (v) => v === "sell",
    "sell, never trim, for a broken thesis"
  );
  check(
    "reconcile(broken+trim).trimPct",
    brokenTrim.trimPct,
    (v) => v == null,
    "cleared, a sell has no trim size"
  );

  const brokenAdd = reconcilePulseCheck({
    ...baseCheck,
    thesisStatus: "broken" as const,
    action: "add" as const,
    trimPct: null,
  });
  check(
    "reconcile(broken+add).thesisStatus",
    brokenAdd.thesisStatus,
    (v) => v === "watch",
    "softened to watch, broken shouldn't pair with add"
  );

  const brokenHold = reconcilePulseCheck({
    ...baseCheck,
    thesisStatus: "broken" as const,
    action: "hold" as const,
    trimPct: null,
  });
  check(
    "reconcile(broken+hold).thesisStatus",
    brokenHold.thesisStatus,
    (v) => v === "watch",
    "softened to watch, Hold next to Thesis at risk is the original bug"
  );
  check(
    "reconcile(broken+hold).action",
    brokenHold.action,
    (v) => v === "hold",
    "hold stays hold, we don't invent a sell"
  );

  const brokenSell = reconcilePulseCheck({
    ...baseCheck,
    thesisStatus: "broken" as const,
    action: "sell" as const,
    trimPct: null,
  });
  check(
    "reconcile(broken+sell)",
    brokenSell.action,
    (v) => v === "sell",
    "left untouched, this pairing is already correct"
  );
}

// Every formatter is the last line of defence before a bad number reaches
// the screen, so all of them must degrade to NO_VALUE rather than printing
// "$∞", "Infinity%" or "$NaN".
//
// Compared against the exported constant, never against the string it
// happens to hold today. This check spent the whole of the NO_VALUE change
// asserting an em dash, because the answer was typed in here as well as
// defined over there, and nothing tells you when two copies disagree.
const { currency, percent, number, signedCurrency, NO_VALUE } = await import(
  "@/lib/format"
);
const formatters: [string, (v: number | null | undefined) => string][] = [
  ["currency", currency],
  ["percent", percent],
  ["number", number],
  ["signedCurrency", signedCurrency],
];
for (const bad of [NaN, Infinity, -Infinity, null, undefined]) {
  for (const [fname, fn] of formatters) {
    check(
      `${fname}(${String(bad)})`,
      fn(bad),
      (v) => v === NO_VALUE,
      `NO_VALUE (${NO_VALUE})`
    );
  }
}

if (problems.length === 0) {
  console.log("PASS: no edge-case problems found");
} else {
  console.error(`FAIL: ${problems.length} edge-case problem(s):`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
