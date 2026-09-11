import { NO_VALUE, cashtag, currency } from "@/lib/format";
import { formatDateTime } from "@/lib/timezone";
import type { ModelRun } from "@/lib/ai/model-label";
import type { ForecastPathAdjustment } from "@/lib/forecast-plan";
import {
  forecastThemeForTicker,
  impliedAnnualReturnForTheme,
} from "@/lib/forecast-conviction";

/**
 * Where a number on screen came from, in the reader's own language.
 *
 * The one question this product keeps being asked is where a figure comes
 * from, and the honest answer differs sharply from one card to the next:
 * most of the app is arithmetic on holdings somebody typed in, and a
 * handful of surfaces are a language model reasoning about a company.
 * Those deserve very different amounts of trust, and the screen looks
 * identical either way, so a reader with any suspicion of generated text
 * has no way to tell them apart and reasonably assumes the worst of all
 * of it.
 *
 * So anything a model touched carries an information mark, and behind it is the
 * whole account: which model answered, what it was handed, where each of
 * those things came from, what this app then did to its answer before the
 * reader saw it, and what it cannot know.
 *
 * Two rules for writing one, and they are the reason this file is long.
 *
 * **It has to be checkable.** Name the real model, the real inputs in the
 * order the prompt sends them, the real feeds by name, and the real gaps.
 * A reassuring paragraph that does not survive somebody reading the code
 * is worse than nothing, because it is the second thing they stop
 * believing.
 *
 * **It has to admit what we do to the answer.** The forecast path on
 * screen is not always the path the model wrote: a skipped year gets
 * filled from a table, and an even ramp gets re-timed onto a typical
 * rhythm. A Pulse badge that contradicted its own suggestion gets settled
 * the calm way. Every sentence the model writes is rewritten to strip
 * market jargon. None of that is a secret, and a reader who found it out
 * for themselves would be right to distrust everything else here.
 *
 * Writing this surface is what surfaced the one adjustment that could not
 * be honestly disclosed: a magnitude floor that scaled any path finishing
 * below its sector shape up to meet it, and replaced a falling path
 * outright. It is gone (2026-08-28). Nothing here moves a number up or
 * down any more, which is why no sentence in this file promises that it
 * might.
 */
export type ProvenanceMaker = "model" | "arithmetic" | "market";

export type ProvenanceInput = {
  /** The input, named as a person would name it. */
  what: string;
  /** The value it actually had, when the surface knows it. */
  detail?: string;
};

/** A named place a fact came from. Linked when there is a real page. */
export type ProvenanceSource = {
  /** Who supplied it: Yahoo Finance, you, the model's training. */
  name: string;
  /** What they supplied, in a few words. */
  what: string;
  /** Opens the actual page, for the sources that have one. */
  href?: string;
};

export type Provenance = {
  maker: ProvenanceMaker;
  /** Two or three words on the trigger's tooltip and the popover's heading. */
  title: string;
  /** One sentence saying who made the number. Blunt, never reassuring. */
  headline: string;
  /** Which model answered, when the run recorded it. Never guessed. */
  model?: ModelRun | null;
  /** Everything that went in. Empty is not an acceptable answer. */
  inputs: ProvenanceInput[];
  /** Named feeds and people behind those inputs. */
  sources?: ProvenanceSource[];
  /**
   * How the number on screen was actually worked out, in order, including
   * anything this app changed after the model answered.
   */
  steps?: string[];
  /** What it cannot know. A model number always has some. */
  blindSpots: string[];
  /** When the number was worked out, ISO. */
  at?: string | null;
  /** One closing line. What the reader can do about it, if anything. */
  yours?: string;
};

/* ---------------------------------------------------------------------- *
 * Sentences used in more than one place. Written once so the answer to
 * the same question is the same answer everywhere in the app.
 * ---------------------------------------------------------------------- */

/**
 * The model's own knowledge is an input like any other, and it is the one
 * a skeptic is actually asking about, so it is never left implicit.
 */
const TRAINING_INPUT: ProvenanceInput = {
  what: "What the model already knows about the company",
  detail:
    "from its training, which stopped at some point in the past and does not include this morning",
};

const NO_NEWS =
  "Anything in the news. No article, filing or analyst note is fetched or read for this.";

const NOT_A_TARGET =
  "It is not a price target, and it is nobody telling you to buy or sell.";

const NOT_THE_FUTURE =
  "What actually happens. An earnings miss, a rate move, a competitor, a bad year.";

const TRAINING_IS_STALE =
  "Anything that happened after the model last learned. This morning is not in there.";

const NOT_YOUR_BROKER =
  "Anything you hold somewhere else. Nothing here is connected to a bank or a broker.";

/**
 * What naming the model is actually for. A reader who has just been told
 * the name needs one clause telling them what kind of thing it is, or the
 * name is trivia. Kept short: the useful facts are that it is ordinary,
 * that it is free, and that nobody here is paid for its opinion.
 */
export const MODEL_CALIBRATION =
  "A general-purpose model on a free plan. Not a research desk, and nobody here is paid for what it says.";

/** The rewriting pass every model sentence goes through before a reader
 * sees it. Real, and not obvious from the screen, so it is always said. */
const REWRITTEN_STEP =
  "Every sentence the model wrote is run through a plain-English pass before you see it, which swaps market jargon for ordinary words. The numbers are untouched by it.";

const YAHOO_PRICES: ProvenanceSource = {
  name: "Yahoo Finance",
  what: "share prices, and the recent high and low",
  href: "https://finance.yahoo.com",
};

const YAHOO_NEWS: ProvenanceSource = {
  name: "Yahoo Finance news search",
  what: "the headlines, with the publisher and time on each",
};

const YOUR_HOLDINGS: ProvenanceSource = {
  name: "You",
  what: "share counts, buy prices and cash, as you typed or imported them",
};

/**
 * A circle's pooled picture has no single "You": shares are added up
 * across everyone who shared a portfolio there, and cost never reaches
 * it at all. `/api/communities/[id]/book` sends `buy_price` as zero for
 * every holding in an ordinary circle, this reader's own included, so
 * naming "You" as the source would credit one person with a figure
 * built from fourteen.
 */
const EVERYONE_IN_THIS_CIRCLE: ProvenanceSource = {
  name: "Everyone in this circle",
  what: "share counts pooled across every portfolio shared here, never anybody's buy price",
};

/** The model is a source in its own right, and the least checkable one. */
const MODEL_ITSELF: ProvenanceSource = {
  name: "The model itself",
  what: "everything else, out of its training. Nothing was looked up for it.",
};

/** The one line about the market baseline, so its number is stated once. */
const BASELINE_INPUT: ProvenanceInput = {
  what: "The whole-market baseline",
  detail:
    "about 10% a year, which is what a broad index fund is assumed to return. The model reasons up or down from there, and nothing in this app moves its answer afterwards. A path that ends flat, or below today's price, is shown as it was written.",
};

/* ---------------------------------------------------------------------- *
 * Forecast
 * ---------------------------------------------------------------------- */

/** What this app changed about a modeled path, named one change at a time. */
function adjustmentSteps(adjust?: ForecastPathAdjustment): string[] {
  const out: string[] = [];
  if (!adjust) return out;
  if (adjust.missing) {
    out.push(
      "The model gave no path for this name in the last run, so every year here is the plain shape for its kind of business."
    );
    return out;
  }
  if (adjust.filled) {
    out.push(
      "It skipped at least one year, and this app filled that year from a table of typical shapes rather than leaving a gap."
    );
  }
  if (adjust.reshaped) {
    out.push(
      "It answered with an even ramp, the same rise every year, which no share price does. This app spread the same move across the years in the rhythm typical of that kind of business, with quiet years and fast ones. Where the path ends is still the model's own number."
    );
  }
  return out;
}

/**
 * A single holding's modeled path.
 *
 * Every input here is one the prompt really sends (`buildForecastPlanPrompt`
 * in forecast-plan.ts, which also carries `FORECAST_CONVICTION_PROMPT` and
 * the portfolio insight lines). If that list changes, this changes with it.
 */
/**
 * How fast the fallback shape compounds, said against the market.
 *
 * The mark already said the shape came from a table written here. It did
 * not say how big the assumption was, and on some kinds of business it is
 * very big: a reader could be looking at a path implying nearly thirty per
 * cent a year with nothing on screen putting that next to the ten the
 * market's own baseline uses. State the figure and what it is next to,
 * which is the rule the whole product runs on.
 */
function shapeRateLine(ticker: string): string {
  const theme = forecastThemeForTicker(ticker);
  const rate = impliedAnnualReturnForTheme(theme);
  const market = impliedAnnualReturnForTheme("index");
  const said = `${Math.round(rate * 100)}% a year`;
  const baseline = `${Math.round(market * 100)}%`;
  return rate > market + 0.005
    ? `That shape works out at about ${said}, against the ${baseline} this app uses for the market as a whole.`
    : `That shape works out at about ${said}, which is what this app uses for the market as a whole.`;
}

export function forecastPathProvenance(input: {
  ticker: string;
  spot: number;
  sector?: string | null;
  edited?: boolean;
  fallback?: boolean;
  at?: string | null;
  /** Which model answered the run this path came out of. */
  model?: ModelRun | null;
  /** What this app changed about the model's answer for this name. */
  adjust?: ForecastPathAdjustment;
  /** When this path was reused from a run done earlier, elsewhere. */
  reusedAt?: string | null;
  /** Last year in the path, for spelling out the percent on the card. */
  lastYear?: number;
}): Provenance {
  const tag = cashtag(input.ticker);
  const spot = input.spot > 0 ? currency(input.spot) : NO_VALUE;
  const last = input.lastYear ? String(input.lastYear) : "the last year";

  if (input.fallback) {
    return {
      maker: "arithmetic",
      title: "Where this came from",
      headline: `No model has written a path for ${tag} yet. What you are looking at is a plain shape for its kind of business, and it is not reasoning about this company.`,
      inputs: [
        { what: "Today's price", detail: spot },
        {
          what: "The kind of business it is",
          detail: input.sector?.trim() || "worked out from the ticker",
        },
        {
          what: "A typical shape for that kind of business",
          detail:
            "a table written into this app: quiet years and fast years, rather than a straight line",
        },
      ],
      sources: [YAHOO_PRICES, { name: "This app", what: "the table of shapes" }],
      steps: [
        `Today's price is multiplied by the shape for that kind of business, one multiple per year out to ${last}.`,
        shapeRateLine(input.ticker),
        "The percent on the card is that last price against today's price, and nothing else.",
      ],
      blindSpots: [
        "Anything at all about this company. It is a shape for a category, not a view on a name.",
        /*
          The uncomfortable half, and the reason this line exists at all.
          The shapes are not a measurement and they are not evenly spread:
          some kinds of business were given a faster one than the market
          and most were not, and which is which is a list somebody here
          chose. A reader looking at a fallback path compounding at nearly
          thirty per cent a year is owed that, because the figure on the
          card is entirely that choice and nothing about their company.
        */
        "Which kinds of business get a faster shape than the market is a list somebody wrote here, not something measured. A company this app does not recognise is assumed to do what the market does.",
        NOT_THE_FUTURE,
        NOT_A_TARGET,
      ],
      at: input.at,
      yours: "Ask Margus to work it out, or type your own price over any year.",
    };
  }

  const steps = [
    `The model answered with one price per year out to ${last}.`,
    ...adjustmentSteps(input.adjust),
    `The percent on the card is the ${last} price against today's price: (${last} price minus today's price) divided by today's price. Nothing rounds or smooths it after that.`,
  ];
  if (input.reusedAt) {
    steps.unshift(
      `This path was not written for your portfolio. It was worked out for ${tag} in an earlier run, ${provenanceWhen(input.reusedAt) ?? "before now"}, and reused here rather than asking again. That run reasoned about the company, so your position size and your own reason did not reach it.`
    );
  }
  if (input.edited) {
    steps.push(
      "You have typed over at least one year here. Your number is used exactly as you typed it."
    );
  }

  return {
    maker: "model",
    title: "Where this came from",
    headline: `A language model wrote this path for ${tag}. Nobody here picked the numbers, no analyst was asked, and no research was bought.`,
    model: input.model,
    inputs: [
      {
        what: "Today's price",
        detail: `${spot}, the number every later year is measured from`,
      },
      {
        what: "The kind of business it is",
        detail: input.sector?.trim() || "worked out from the ticker",
      },
      {
        what: "How big this holding is for you",
        detail: "as a share of everything in this portfolio",
      },
      {
        what: "The rest of your portfolio",
        detail:
          "your cash, your total, and which of your holdings are the same kind of business, so a company is priced as part of what you hold rather than on its own",
      },
      {
        what: "Today's date",
        detail: "so the first year is the rest of this year, not a whole one",
      },
      BASELINE_INPUT,
      TRAINING_INPUT,
    ],
    sources: [
      YAHOO_PRICES,
      YOUR_HOLDINGS,
      MODEL_ITSELF,
    ],
    steps,
    blindSpots: [NOT_THE_FUTURE, NO_NEWS, TRAINING_IS_STALE, NOT_A_TARGET],
    at: input.at,
    yours: input.edited
      ? "You have typed over at least one year here, and your number wins."
      : "You can type your own price over any year, and yours wins.",
  };
}

/** The Forecast room as a whole: the chart, the cards, the yearly prices. */
export function forecastRoomProvenance(input: {
  at?: string | null;
  fallback?: boolean;
  model?: ModelRun | null;
  /** How many of the names on screen this app adjusted after the model. */
  adjustedCount?: number;
  /** How many were reused from a run done for a different portfolio. */
  reusedCount?: number;
}): Provenance {
  if (input.fallback) {
    return {
      maker: "arithmetic",
      title: "Where this came from",
      headline:
        "No model has run for this portfolio yet. Each path is a plain shape for that kind of business, and the chart is those shapes added up.",
      inputs: [
        { what: "Your share counts" },
        { what: "Today's prices" },
        {
          what: "A typical shape per kind of business",
          detail:
            "a table written into this app: quiet years and fast years, rather than a straight line",
        },
      ],
      sources: [YOUR_HOLDINGS, YAHOO_PRICES],
      steps: [
        "Each name's shape is applied to its own price, then multiplied by your share count.",
        "The chart is those added together, one column per year.",
      ],
      blindSpots: [
        "Anything about a particular company. These are shapes for a kind of business, not a view on the company itself.",
        NOT_THE_FUTURE,
        NOT_A_TARGET,
      ],
      at: input.at,
      yours:
        "Ask Margus to work each name out, or type your own price over any year.",
    };
  }

  const steps = [
    "Each holding goes to the model on its own, and comes back with one price per year.",
  ];
  if (input.adjustedCount && input.adjustedCount > 0) {
    steps.push(
      input.adjustedCount === 1
        ? "One of those paths was changed by this app afterwards, because the model skipped a year or drew a straight line. Open that name's own information mark to see which."
        : `${input.adjustedCount} of those paths were changed by this app afterwards, because the model skipped a year or drew a straight line. Open a name's own information mark to see which.`
    );
  }
  if (input.reusedCount && input.reusedCount > 0) {
    steps.push(
      input.reusedCount === 1
        ? "One name was not worked out for this portfolio at all. Its path was written in an earlier run and reused here."
        : `${input.reusedCount} of these companies were not worked out for this portfolio at all. Their paths were written in earlier runs and reused here.`
    );
  }
  steps.push(
    "The chart multiplies each year's price by your share count and adds them up. Today's column is the market. Every column after it is modeled."
  );
  steps.push(REWRITTEN_STEP);

  return {
    maker: "model",
    title: "Where this came from",
    headline:
      "A language model writes a yearly price for every holding, from what the company does and how much of it you own. Today's column is the real market price. Every year after it is modeled.",
    model: input.model,
    inputs: [
      { what: "Today's price of each holding" },
      { what: "The kind of business each one is" },
      { what: "How big each holding is in this portfolio" },
      {
        what: "Your cash, your total, and which holdings are the same kind of business",
      },
      { what: "Today's date, so the first year is the rest of this one" },
      BASELINE_INPUT,
      TRAINING_INPUT,
    ],
    sources: [YAHOO_PRICES, YOUR_HOLDINGS, MODEL_ITSELF],
    steps,
    blindSpots: [NOT_THE_FUTURE, NO_NEWS, TRAINING_IS_STALE, NOT_A_TARGET],
    at: input.at,
    yours: "Open any card's information mark for that name. Type over a year and yours wins.",
  };
}

/** The whole-portfolio path. The same run, added up. */
export function forecastTotalProvenance(input: {
  at?: string | null;
  fallback?: boolean;
  model?: ModelRun | null;
}): Provenance {
  return {
    maker: "arithmetic",
    title: "Where this came from",
    headline:
      "The adding up is plain arithmetic and you can check it by hand. The prices being added are the modeled ones, so this line is only as good as those.",
    model: input.model,
    inputs: [
      { what: "Your share count for each holding" },
      {
        what: "Each holding's path for that year",
        detail: input.fallback
          ? "a plain shape per kind of business, since no model has run yet"
          : "written by a language model, one name at a time",
      },
      { what: "Any price you typed over yourself", detail: "yours wins" },
    ],
    sources: [YOUR_HOLDINGS],
    steps: [
      "For each year: every holding's price for that year, times your shares in it.",
      "Those are added together. That is the whole calculation.",
      "It assumes you hold exactly what you hold today, every year, and never buy or sell.",
    ],
    blindSpots: [
      "Anything you buy or sell later, and any dividend, fee or tax.",
      NOT_THE_FUTURE,
      NOT_A_TARGET,
    ],
    at: input.at,
    yours: "Open any card to see what made that name's path.",
  };
}

/* ---------------------------------------------------------------------- *
 * Pulse
 * ---------------------------------------------------------------------- */

/** A Thesis Pulse verdict on one name. */
export function pulseProvenance(input: {
  ticker: string;
  headlineCount?: number;
  /** The publishers behind those headlines, so the reader can go and read them. */
  publishers?: string[];
  at?: string | null;
  model?: ModelRun | null;
}): Provenance {
  const tag = cashtag(input.ticker);
  const n = input.headlineCount ?? 0;
  const publishers = [...new Set((input.publishers ?? []).filter(Boolean))];

  return {
    maker: "model",
    title: "Where this came from",
    headline: `A language model read how the price of ${tag} has moved against what was in the news, then said whether the reason to own it still holds.`,
    model: input.model,
    inputs: [
      { what: "Today's price and how it has moved" },
      { what: "Where the price sits against its recent high and low" },
      n > 0
        ? {
            what: "Recent headlines, fetched for this check",
            detail:
              publishers.length > 0
                ? `${n === 1 ? "one headline" : `${n} headlines`}, from ${publishers.join(", ")}. They are listed on the card and each one opens.`
                : `${n === 1 ? "one headline" : `${n} headlines`}, listed on the card`,
          }
        : {
            what: "Recent headlines",
            detail:
              "none came back for this check, so the reading is the price alone",
          },
      { what: "Last and next earnings dates, when the feed has them" },
      TRAINING_INPUT,
    ],
    sources: [
      YOUR_HOLDINGS,
      YAHOO_PRICES,
      ...(n > 0 ? [YAHOO_NEWS] : []),
      MODEL_ITSELF,
    ],
    steps: [
      "All of that goes to the model in one request, and it answers with a status of intact, watch or broken, plus a short reason.",
      "Nothing reads the status back off the price afterwards. The model chose it.",
      "One thing is settled by this app: if its badge and its suggestion contradicted each other, the calmer of the two wins. A broken badge next to a suggestion to trim becomes a sell, and an intact badge next to a suggestion to sell becomes a hold.",
      REWRITTEN_STEP,
    ],
    blindSpots: [
      "Headlines it did not get. The search misses things, and a story it never saw is not in the reading.",
      TRAINING_IS_STALE,
      "Whether the reason to own it was any good. It checks whether the news and the price still fit the case for the company, not whether that case was sound.",
      NOT_A_TARGET,
    ],
    at: input.at,
    yours: "Ask for a re-check and the next reading answers today's headlines.",
  };
}

/** The Pulse room as a whole. */
export function pulseRoomProvenance(input: {
  at?: string | null;
  model?: ModelRun | null;
  checkedCount?: number;
}): Provenance {
  const n = input.checkedCount ?? 0;
  return {
    maker: "model",
    title: "Where this came from",
    headline:
      "Which companies appear here is arithmetic on your own holdings. What each card says about them is a language model.",
    model: input.model,
    inputs: [
      {
        what: "Your holdings and how each one moved",
        detail: "which is what picks the companies on this page",
      },
      { what: "Recent headlines for each name" },
      TRAINING_INPUT,
    ],
    sources: [YOUR_HOLDINGS, YAHOO_PRICES, YAHOO_NEWS, MODEL_ITSELF],
    steps: [
      "The page picks companies by size and by how far they moved. No model is involved in choosing them.",
      n > 0
        ? `Those ${n === 1 ? "name is" : `${n} names are`} then sent to the model, and it writes one reading each.`
        : "Those companies are then sent to the model, and it writes one reading each.",
      "A reading is kept and reused until the price moves, so two visits on a quiet day show the same words rather than a new opinion.",
      REWRITTEN_STEP,
    ],
    blindSpots: [
      "Headlines the search missed.",
      TRAINING_IS_STALE,
      NOT_A_TARGET,
    ],
    at: input.at,
    yours: "Open any card's information mark for what went into that one name.",
  };
}

/* ---------------------------------------------------------------------- *
 * Everything else
 * ---------------------------------------------------------------------- */

/**
 * The made-up bad days in Lab. Arithmetic, not a model.
 *
 * `guessed` is the uncomfortable half, and it is here for the reason the
 * forecast's own mark names the paths the model did not write. This room
 * prints a figure per holding, and behind each one is a profile saying
 * how that kind of business moves in that kind of day. About ninety
 * companies have a profile written about them; everything else is
 * reasoned from a plain-large-company catch-all, which on an ordinary
 * portfolio is several of the reader's own names. Nike, Disney, Berkshire
 * and every REIT land there.
 *
 * Assuming a plain large company is a fair thing to do and not a fair
 * thing to state as fact in silence. So the names are said out loud, and
 * said as a blind spot rather than buried in the steps, because what a
 * reader needs is not "some rows are approximate" but which of their own
 * rows.
 */
export function scenarioProvenance(
  guessed: string[] = [],
  /**
   * How many rows moved on a swing measured from the company's own recent
   * prices, against how many are still the typed table. The reader is owed
   * the split, because the two are not the same kind of number.
   */
  measured?: { measured: number; total: number } | null
): Provenance {
  const names = [...new Set(guessed.map((t) => t.trim().toUpperCase()))]
    .filter(Boolean)
    .sort();
  const guessedSpot =
    names.length > 0
      ? `This app has no profile written for ${listInWords(names)}, so ${
          names.length === 1 ? "it is" : "they are"
        } assumed to move like a plain large company. That is a guess, and the ${
          names.length === 1 ? "figure" : "figures"
        } beside ${names.length === 1 ? "it" : "them"} ${
          names.length === 1 ? "is" : "are"
        } only as good as it.`
      : null;
  /*
    Said as a step rather than a blind spot, because unlike the guessed
    names this is the room doing better than it used to: a measured swing
    is a fact about this company where the table was a judgement about a
    category it had been sorted into. It still says what the measurement
    cannot reach, since only the market scenarios turn on that number and
    oil, rates and supply chains remain typed.
  */
  const measuredStep =
    measured && measured.total > 0 && measured.measured > 0
      ? `${measured.measured} of your ${measured.total} holdings move on a swing measured from their own recent prices against the market, rather than on the figure typed into this app for their kind of business. That measurement only reaches the scenarios about the market as a whole; what a company does when oil doubles or a supply chain breaks is still a typed judgement.`
      : null;

  return scenarioProvenanceBody(guessedSpot, measuredStep);
}

/** Joins names the way a sentence does: "A, B and C". */
function listInWords(names: string[]): string {
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]!}`;
}

function scenarioProvenanceBody(
  guessedSpot: string | null,
  measuredStep: string | null
): Provenance {
  return {
    maker: "arithmetic",
    title: "Where this came from",
    headline:
      "Nobody asked a model. Each day is a made-up move, written into this app by hand, applied to the shares you hold at today's prices.",
    inputs: [
      { what: "Your share counts" },
      { what: "Today's prices" },
      {
        what: "The move this day assumes for each kind of business",
        detail:
          "a percentage typed into this app, not something the market did and not something measured",
      },
    ],
    sources: [
      YOUR_HOLDINGS,
      YAHOO_PRICES,
      { name: "This app", what: "the made-up percentages for each day" },
    ],
    steps: [
      "Each holding is grouped by what kind of business it is.",
      "That group's made-up percentage is applied to its value, and the results are added up.",
      ...(measuredStep ? [measuredStep] : []),
      "If part of your portfolio is borrowed, the room before a forced sale assumes your broker wants 30% of the stocks covered by your own money. Real brokers use 25% to 30% and can raise it without warning.",
    ],
    blindSpots: [
      "Whether a day like that would actually happen, or how likely it is.",
      "What you would do in it. The numbers assume you sit still and hold exactly what you hold today.",
      ...(guessedSpot ? [guessedSpot] : []),
      NOT_A_TARGET,
    ],
    yours: "Pick a different day from the row above.",
  };
}

/**
 * The ten-year index read in the Playbook. No model anywhere near it.
 *
 * This is the surface in the whole product most in need of the mark, and
 * for a reason that has nothing to do with a model. The missing-the-best-
 * days figure is the most repeated statistic in retail investing and it is
 * almost always printed with no window at all, which means the version a
 * reader has met before was unfalsifiable and, worse, free to pick: run it
 * over a different decade and it says something else. A reader who has
 * learned to distrust that number is right to, and the only answer is to
 * hand them the window, the source and the arithmetic and let them check.
 */
export function bestDaysProvenance(input: {
  from?: string | null;
  to?: string | null;
  /** Trading days in the window, so the account can say how many. */
  days?: number | null;
  starting: string;
}): Provenance {
  const window =
    input.from && input.to ? `${input.from} to ${input.to}` : "the window shown";
  return {
    maker: "arithmetic",
    title: "Where this came from",
    headline:
      "Nobody asked a model. It is the index's own daily closing prices multiplied together, once with every day and once with a few of them left out.",
    inputs: [
      {
        what: "Daily closing prices for SPY, which tracks the S&P 500",
        detail:
          input.days != null
            ? `${window}, which is ${input.days} trading days`
            : window,
      },
      {
        what: "How many of the days to leave out",
        detail: "whichever of 5, 10, 20 or 30 you picked",
      },
      {
        what: "A starting amount",
        detail: `${input.starting}, chosen to make the figures readable and nothing else`,
      },
    ],
    sources: [
      YAHOO_PRICES,
      {
        name: "This app",
        what: "the multiplying, and the count of how close the best days sat to the worst",
      },
    ],
    steps: [
      "Each day's move is the close against the day before, so a window of closing prices becomes a list of daily moves.",
      "Those moves are multiplied together to get what a pound left alone became. The best days are then taken out and the rest multiplied again, and separately the worst days.",
      "The clustering figure counts how many of the ten largest daily rises landed within ten trading days of one of the ten largest falls.",
      "Nothing is adjusted afterwards. The window is whatever the provider returned, and it is printed rather than chosen.",
    ],
    blindSpots: [
      "Dividends. These are closing prices, so the real result of holding the index was higher than every figure here.",
      "Whether the next ten years look anything like these ten. A different window gives different numbers, which is the whole reason this one names its dates.",
      "That nobody could have known in advance which days to miss. Taking days out afterwards is arithmetic on what happened, not a strategy anybody could have run.",
      NOT_A_TARGET,
    ],
    yours: "Change how many days come out with the row above.",
  };
}

/** Margus in the corner. Every reply is a model. */
export function margusChatProvenance(model?: ModelRun | null): Provenance {
  return {
    maker: "model",
    title: "Where this came from",
    headline:
      "Margus is a language model, not a person. Replies are written from the holdings on this portfolio, what you just asked, and what the model already knows.",
    model,
    inputs: [
      { what: "The holdings and cash on this portfolio" },
      { what: "Today's prices" },
      { what: "What you typed, and any screenshot you attached" },
      {
        what: "Pulse and Forecast already on file",
        detail: "only when your question is about those",
      },
      TRAINING_INPUT,
    ],
    sources: [YOUR_HOLDINGS, YAHOO_PRICES, MODEL_ITSELF],
    steps: [
      "Your question and that context go in one request. The reply comes back as it is written, a few words at a time.",
      "It can change numbers in this app when you ask it to, and those changes are saved to your portfolio like any edit you make yourself.",
      REWRITTEN_STEP,
    ],
    blindSpots: [
      NO_NEWS,
      TRAINING_IS_STALE,
      "Your taxes, your timing, and anything sitting at a broker this app cannot see.",
      NOT_A_TARGET,
    ],
    yours:
      "It can edit the numbers in this app if you ask. It cannot buy or sell anything real.",
  };
}

/** The paper portfolio Margus runs in public. */
export function upsideFundProvenance(model?: ModelRun | null): Provenance {
  return {
    maker: "model",
    title: "Where this came from",
    headline:
      "Paper money. A language model makes one pretend move a day in a pretend portfolio. It is not a real fund, nobody's money is in it, and it is not a signal to copy.",
    model,
    inputs: [
      { what: "The fund's own pretend holdings and pretend cash" },
      { what: "Yesterday's closing prices" },
      { what: "The rule that it makes exactly one decision a day, in public" },
      TRAINING_INPUT,
    ],
    sources: [YAHOO_PRICES, MODEL_ITSELF],
    steps: [
      "Once a day the model is shown the pretend portfolio and asked for one move.",
      "The move is written down whether it works or not, and the record is never edited afterwards.",
      REWRITTEN_STEP,
    ],
    blindSpots: [
      "Anything the market did after the day's decision.",
      NO_NEWS,
      TRAINING_IS_STALE,
      NOT_A_TARGET,
    ],
    yours: "Read it like a diary, not like a manager.",
  };
}

/** The line under a Home card, and anything else that is pure arithmetic. */
export function holdingsProvenance(input: { at?: string | null }): Provenance {
  return {
    maker: "arithmetic",
    title: "Where this came from",
    headline:
      "No model wrote this. It is the shares you typed in, times today's prices, and nothing else.",
    inputs: [
      { what: "The holdings you typed in or imported" },
      { what: "Today's prices" },
    ],
    sources: [YOUR_HOLDINGS, YAHOO_PRICES],
    steps: [
      "Shares times price, per holding, added up, plus your cash.",
      "You can check any line of it against your broker.",
    ],
    blindSpots: [NOT_YOUR_BROKER],
    at: input.at,
  };
}

/**
 * The Growth room's yearly rate. Not a model, but very much an assumption,
 * and it is compounded for decades, so it needs saying plainly.
 */
/**
 * `source` is which of the three the number in the box is, because the honest
 * answer to "where did this come from" is a different sentence for each: the
 * page's own opening figure, the table of typical rates per kind of business,
 * or something the reader typed over the top.
 */
export function growthRateProvenance(input: {
  ratePct?: number | null;
  source?: "baseline" | "mix" | "typed";
  /** Older spelling: true meant anything other than the mix rate. */
  edited?: boolean;
}): Provenance {
  const source = input.source ?? (input.edited ? "typed" : "mix");
  const rate =
    input.ratePct != null && Number.isFinite(input.ratePct)
      ? `${input.ratePct}% a year`
      : "the rate in the box";
  return {
    maker: "arithmetic",
    title: "Where this came from",
    headline:
      source === "typed"
        ? `This is the rate you typed: ${rate}. Everything on this page is that number compounded, and nothing on this page knows whether it is realistic.`
        : source === "baseline"
          ? `Nobody measured your portfolio's future. This page opens on ${rate}, which is roughly what the whole US market has averaged over a long stretch, before inflation is taken off. It is a starting point, not a reading of what you hold.`
          : `Nobody measured your portfolio's future. ${rate} is what a mix like yours has usually done: a table of typical rates per kind of business, written into this app, weighted by how much of each kind you hold.`,
    inputs: [
      { what: "The rate in the box, whichever preset or number you chose" },
      {
        what: "A long run average for the whole US market",
        detail: "about 10% a year, before inflation, and where this page starts",
      },
      {
        what: "What you hold, and how much of each",
        detail:
          "only for the preset that offers what this mix has usually done. That one comes from a table written into this app. It gives a broad index fund about 10% a year and puts jumpier kinds of business above that.",
      },
      { what: "Your cash, at whatever rate you set for it" },
    ],
    sources: [
      YOUR_HOLDINGS,
      { name: "This app", what: "the table of typical rates" },
    ],
    steps: [
      "The rate in the box is compounded month by month over the years you set, together with anything you pay in or take out.",
      "Nothing is added to that rate afterwards. There is no allowance for option premiums or anything else this app cannot show you.",
      "The preset for what this mix has usually done is worked out separately: each holding is grouped by kind of business, given that group's typical rate, and those are blended by how much of your money is in each.",
    ],
    blindSpots: [
      "Whether any of it happens. A single rate held for decades is not how markets behave, and the table is optimistic rather than safe.",
      "Tax, fees, inflation and dividends. None of them are in these numbers.",
      NOT_A_TARGET,
    ],
    yours: "Type any rate you like over it. Try a low one as well as a high one.",
  };
}

/* ---------------------------------------------------------------------- *
 * Research
 *
 * The room where a reader is deciding about a company they do not own yet,
 * which is the highest-stakes reading in the product and the one where the
 * least of what is on screen is theirs. Everything else here is arithmetic
 * on figures they typed; this is a feed's figures and a model's opinion
 * about a company they may never have heard of. So the mark goes on every
 * block of it, and each block gets its own account rather than one page-
 * level disclaimer, because the honest answer really is different: the
 * figures are a feed, the fair value is arithmetic on that feed, the two
 * cases are a model, and how it would sit in the portfolio is the reader's
 * own rows and no model at all.
 * ---------------------------------------------------------------------- */

const COMPANY_FEED: ProvenanceSource = {
  name: "Yahoo Finance",
  what: "the company's own filed figures, its description of itself, and the analyst targets",
  href: "https://finance.yahoo.com",
};

const CHECK_IT_YOURSELF =
  "Every figure on this page is on the company's own page at the feed, linked at the bottom under where to check. If one of them disagrees with ours, ours is the one that is wrong.";

/** The figures block. No model touched any of it. */
export function companyNumbersProvenance(input: {
  ticker: string;
  at?: string | null;
  /** How many of the readings came back with a figure in them. */
  filled?: number;
  total?: number;
}): Provenance {
  const tag = cashtag(input.ticker);
  const gaps =
    input.filled != null && input.total != null && input.filled < input.total
      ? `${input.total - input.filled} of the ${input.total} figures came back empty for this company and are shown as ${NO_VALUE} rather than filled in.`
      : null;
  return {
    maker: "market",
    title: "Where these came from",
    headline: `No model wrote any of this. Every figure here is ${tag}'s own reported number, as the feed has it, printed without being adjusted.`,
    inputs: [
      { what: "The company's last reported revenue, profit, cash and debt" },
      { what: "Today's share price, and its high and low over the last year" },
      { what: "The number of shares in issue, for the per-share figures" },
    ],
    sources: [COMPANY_FEED],
    steps: [
      "The figures are printed as the feed reports them. Nothing here rounds one up, fills a gap, or substitutes a typical value.",
      "The sentence under each figure is this app putting the same number into ordinary words, with the unit changed so it can be pictured: a profit margin becomes dollars out of every $100.",
      "The line saying what ordinary looks like is a broad, long-standing scale written into this app, not a target and not a reading of this company.",
      ...(gaps ? [gaps] : []),
    ],
    blindSpots: [
      "How fresh the figures are. A company reports every three months, so most of this describes a quarter that has already ended, not this morning.",
      "Anything not in the accounts. A lawsuit, a lost customer, a founder leaving: none of that is a number here.",
      "Whether the company's own accounting is a fair picture. These are the figures it filed, not an audit of them.",
      CHECK_IT_YOURSELF,
    ],
    at: input.at,
    yours: "Open the filings link at the bottom and read what they said themselves.",
  };
}

/**
 * The blended fair value. Arithmetic, plus one model voice that is named
 * as such, so the mark has to say both.
 */
export function fairValueProvenance(input: {
  ticker: string;
  methodNames: string[];
  droppedCount?: number;
  usesModel?: boolean;
  model?: ModelRun | null;
  at?: string | null;
}): Provenance {
  const tag = cashtag(input.ticker);
  const names = input.methodNames.filter(Boolean);
  return {
    maker: input.usesModel ? "model" : "arithmetic",
    title: "How this was worked out",
    headline: `Nobody knows what ${tag} is worth. This is ${names.length === 1 ? "one way" : `${names.length} different ways`} of estimating it, each run separately and then averaged, and every one of them is shown with the answer it gave.`,
    model: input.usesModel ? input.model : undefined,
    inputs: [
      { what: "Profit per share, last year's and next year's" },
      { what: "The spare cash the business produces, and the debt against it" },
      { what: "How fast sales are growing" },
      {
        what: "The average of the analysts' twelve-month price targets",
        detail: "with how many of them published one, which is what decides how much it counts",
      },
      ...(input.usesModel
        ? [
            {
              what: "The five-year path a language model reasoned for this company",
              detail:
                "the same path the Growth room uses, and the one input here that cannot be checked",
            },
          ]
        : []),
    ],
    sources: [
      COMPANY_FEED,
      { name: "This app", what: "the arithmetic, which is listed method by method on the card" },
      ...(input.usesModel ? [MODEL_ITSELF] : []),
    ],
    steps: [
      `Each method is run on its own: ${names.join("; ")}.`,
      "Each one carries a fixed weight, shown beside it. The analysts' average counts for more when more of them published a target and less when one or two did.",
      "Any method landing more than three times away from what the others said is thrown out before the average, because at that distance the arithmetic has stopped describing this company rather than disagreeing about it." +
        (input.droppedCount
          ? ` ${input.droppedCount === 1 ? "One method was" : `${input.droppedCount} methods were`} thrown out this way and ${input.droppedCount === 1 ? "is" : "are"} still listed, with the reason.`
          : " Nothing was thrown out this time."),
      "What is left is averaged by weight. Nothing is nudged towards the current price afterwards, in either direction.",
    ],
    blindSpots: [
      "Whether any of the assumptions hold. Each method rests on one, they are printed beside the numbers, and they are the whole argument.",
      "Anything that is not in the accounts or the headlines: a new competitor, a rule change, a founder leaving.",
      NOT_A_TARGET,
      "Agreement is not accuracy. Several methods landing close together can mean they are all reading the same optimistic forecast.",
    ],
    at: input.at,
    yours: "Open each method and argue with its assumption. That is the useful part, not the average.",
  };
}

/** The two cases, and everything else the model wrote on this page. */
export function companyBriefProvenance(input: {
  ticker: string;
  articleCount?: number;
  publishers?: string[];
  uncited?: number;
  at?: string | null;
  model?: ModelRun | null;
  /** True when this page was written for somebody else looking it up first. */
  shared?: boolean;
}): Provenance {
  const n = input.articleCount ?? 0;
  const publishers = [...new Set((input.publishers ?? []).filter(Boolean))];
  return {
    maker: "model",
    title: "Where this came from",
    headline: `A language model was handed the figures above and the headlines below, and asked which of them matter about ${cashtag(input.ticker)} and why. It was not allowed to bring facts of its own: every point that survived cites something on this page.`,
    model: input.model,
    inputs: [
      {
        what: "The figures in the block above",
        detail: "exactly as printed, with their labels, so a point can point back at one",
      },
      {
        what: "The company's own description of itself",
        detail: "the paragraph it files about what it does, unedited",
      },
      n > 0
        ? {
            what: "Recent headlines, fetched for this page",
            detail:
              publishers.length > 0
                ? `${n === 1 ? "one headline" : `${n} headlines`}, from ${publishers.join(", ")}. They are listed below and each one opens.`
                : `${n === 1 ? "one headline" : `${n} headlines`}, listed below`,
          }
        : {
            what: "Recent headlines",
            detail:
              "none came back for this company, so the two cases rest on the figures and the company's own description only, which makes them thinner than usual",
          },
      TRAINING_INPUT,
    ],
    sources: [COMPANY_FEED, ...(n > 0 ? [YAHOO_NEWS] : []), MODEL_ITSELF],
    steps: [
      "Every point it made had to name what it rests on: one of the figures above, one of the headlines below, or the company's own description.",
      "This app then checked each one. A point citing a figure that is not on the page, a headline that does not exist, or nothing at all is deleted before you see it." +
        (input.uncited
          ? ` ${input.uncited === 1 ? "One point was" : `${input.uncited} points were`} deleted this way on this run, which is worth knowing when you read what is left.`
          : " Nothing was deleted on this run."),
      "A section that loses all of its points is shown empty rather than topped up.",
      REWRITTEN_STEP,
      ...(input.shared
        ? [
            "This page was written when somebody first looked this company up, not for you, and reused since. It has not been re-read against anything you own.",
          ]
        : []),
    ],
    blindSpots: [
      "Whether it picked the right things. Deciding which four facts out of forty matter is a judgement, and it is the model's.",
      "Headlines it did not get. The search misses things, and a story it never saw is not in here.",
      TRAINING_IS_STALE,
      "Anything about you. It does not know what else you own, what you paid, or when you need the money.",
      NOT_A_TARGET,
    ],
    at: input.at,
    yours: "Open the articles at the bottom and see whether you would have drawn the same conclusion.",
  };
}

/** How a purchase would sit in the portfolio. The reader's own rows only. */
export function positionFitProvenance(input: {
  ticker: string;
  amount?: string | null;
}): Provenance {
  return {
    maker: "arithmetic",
    title: "Where this came from",
    headline: `No model wrote this. It is your own holdings, plus ${input.amount ?? "the amount in the box"} of ${cashtag(input.ticker)}, added up again.`,
    inputs: [
      { what: "Your holdings and what each is worth today" },
      { what: "Your cash, including anything borrowed" },
      { what: "The amount you typed", detail: "treated as new money going in" },
    ],
    sources: [YOUR_HOLDINGS, YAHOO_PRICES],
    steps: [
      "The amount is added to whatever you already hold of this company, and every share is worked out against the new total.",
      "The group figure counts every company you own that sits in the same kind of business, from a list written into this app.",
      "The line about a rough month assumes this one holding falls a quarter and everything else stands still. It is a way of picturing the size, not a forecast.",
    ],
    blindSpots: [
      NOT_YOUR_BROKER,
      "Tax. Buying and selling can have consequences this app does not calculate.",
      "Nothing is bought. Moving the amount changes nothing anywhere.",
    ],
    yours: "Change the amount and watch which of these numbers moves most.",
  };
}

/**
 * The price ladder. Arithmetic on two numbers already on the page, and the
 * one surface in this app whose output looks most like an instruction, so
 * it is the one that most needs to say out loud that nobody wrote it.
 */
export function planLadderProvenance(input: {
  ticker: string;
  anchor?: string | null;
  anchorSaid?: string | null;
  stepSaid?: string | null;
  floorSaid?: string | null;
  /** The bands were tightened because the price is far under the anchor. */
  farBelow?: boolean;
  edited?: boolean;
  at?: string | null;
}): Provenance {
  const tag = cashtag(input.ticker);
  return {
    maker: "arithmetic",
    title: "Where these levels came from",
    headline: `No model wrote these levels and nobody at this app chose them. They are two numbers multiplied together: an estimate for ${tag} that is already on this page, and how far this share ordinarily travels in a year. Every one of them is yours to change.`,
    inputs: [
      {
        what: "The anchor, which every level is a multiple of",
        detail: input.anchorSaid ?? input.anchor ?? "the blended estimate on this page",
      },
      {
        what: "How wide each band is",
        detail: input.stepSaid ?? "read off the year's high and low for this share",
      },
      {
        what: "The bottom of the ladder",
        detail:
          input.floorSaid ??
          "the lowest this share has actually traded in a year, where the feed carried one",
      },
      { what: "Today's price", detail: "which decides only which band it lands in" },
      ...(input.edited
        ? [{ what: "The levels you typed", detail: "which replace the worked-out ones" }]
        : []),
    ],
    sources: [
      YAHOO_PRICES,
      COMPANY_FEED,
      { name: "This app", what: "the multiplication, which is plain arithmetic and is printed above" },
      ...(input.edited
        ? [{ name: "You", what: "the levels you typed over the worked-out ones" }]
        : []),
    ],
    steps: [
      "The anchor is taken from the valuation panel below, unmodified. Nothing here re-estimates it and nothing nudges it towards today's price.",
      "Each band is a tenth of the anchor wide, which is the width the ladders this was built from use. Two fifths of how far this share's own year ran, against an ordinary company's, is added on top, so a name that barely moves gets slightly finer bands and one that swings hard slightly coarser.",
      ...(input.farBelow
        ? [
            "The bands are tighter than that here, because the price is a long way under the anchor. Down there every price is the same decision, so the fine detail belongs at the top, where the levels you would actually meet are, and the stretch below is one band rather than five.",
          ]
        : []),
      "The bottom of the ladder is the lowest this share has actually traded in a year, where the feed carried one and it sits clear of the band above it. It is a price rather than a fraction of the estimate, so it is a level you can check.",
      "Today's price is then read against those levels. That is the whole calculation: no model, no scoring, no view about this company.",
    ],
    blindSpots: [
      NOT_YOUR_BROKER,
      "Whether any of this is a sensible ladder for you. The bands are a shape, not a judgement about your money, your timescale or what else you own.",
      "Anything that happens between two prices: a level can be passed and come back before you ever look.",
      "The anchor's own assumptions. Every method behind it rests on one, and they are listed in the panel below.",
    ],
    at: input.at,
    yours: "Change any level and the ladder redraws around it. The levels are yours; this app only does the multiplication.",
  };
}

/**
 * Every holding on one ladder. Two figures from other screens drawn
 * against each other, and nothing else.
 */
export function bandMapProvenance(input: {
  count?: number;
  at?: string | null;
  /**
   * True for a circle's picture, pooled across every member rather than
   * drawn from one portfolio. "You" is not the source, no band is
   * anybody's own edited ladder, and there is no level here for the reader
   * to change, so every first-person reading is swapped rather than the
   * panel stating an ownership it cannot back up.
   */
  pooled?: boolean;
}): Provenance {
  const n = input.count ?? 0;
  const whose = input.pooled ? "the circle's holdings" : "this portfolio";
  const one = input.pooled ? "one company" : "one holding";
  const many = input.pooled ? "companies" : "holdings";
  return {
    maker: "arithmetic",
    title: "How this picture was drawn",
    headline: `No model wrote this and nothing here is a score. It is ${n === 1 ? one : `${n} ${many}`} filed by two figures that are already on other screens: each name's own price ladder, and how much of ${whose} it is.`,
    inputs: [
      {
        what: "Each name's own price ladder",
        /*
          NEVER "end of year price" ON ITS OWN -- `anchorForHolding`
          answers with one of two different kinds and this line used to
          claim only the first. A holding with nobody's chosen target
          and no shaped path to fall back on is anchored on the middle
          of the range it has actually traded in instead ("history"),
          which is not a price of anything in the future, and the old
          wording stated the wrong kind of figure for every holding
          that lands there.

          A circle's map is always the second kind, because a pooled
          picture has nobody whose target it could be, so it says so
          outright rather than offering a reader a choice of two.
        */
        detail: input.pooled
          ? "the same generic ladder a name gets when nobody has set a level on it, anchored on the range it has actually traded in"
          : "the same ladder its own page draws, anchored on an end of year price where one has been set and on the range it has actually traded in otherwise",
      },
      { what: "Today's price for each one" },
      {
        what: input.pooled
          ? "What the circle holds of each one, against everyone's holdings pooled together"
          : "What each holding is worth, against the whole portfolio",
      },
    ],
    sources: [
      input.pooled ? EVERYONE_IN_THIS_CIRCLE : YOUR_HOLDINGS,
      YAHOO_PRICES,
      {
        name: "This app",
        what: "the filing and the bar lengths, which are plain arithmetic and are described below",
      },
    ],
    steps: [
      "Each name's ladder is built first, exactly as its own page builds it. Nothing about the ladder changes because it is on this picture.",
      "Which row a name is in is which band its price is in. Every band is a multiple of that company's own fair value, which is what lets a $2 company and a $2,000 one be compared at all.",
      `A band's bar is how much of ${whose} is priced in that band, measured against the fullest band rather than against a hundred per cent, and each block in the bar is one ${input.pooled ? "company" : "holding"} sized by what it is worth.`,
      `Every row is the same height whatever ${input.pooled ? "anybody holds" : "you own"}, including the rows with nothing in them, so the shape of the ladder cannot change with the ${input.pooled ? "circle" : "portfolio"}.`,
      "A name folds away only when its band has run out of room to draw it, never because it is small on its own, and what folds is the smallest of that band. They fold into a block saying how many went and what they come to together, and a name that has reached an end of its own ladder is kept however small it is.",
      `A bar is never drawn shorter than the names inside it need to be readable, so a band holding very little of ${whose} can look longer than its share alone would make it. The figure beside the bar is the exact share, and it is the one to read.`,
    ],
    blindSpots: [
      NOT_YOUR_BROKER,
      "Anything about the companies themselves. Two names next to each other on this picture have nothing else in common.",
      ...(input.pooled
        ? [
            "Whether anybody here is up or down on any of it. What each person paid is theirs and never reaches this room, so this picture can say where a price sits and nothing about anyone's gain or loss.",
          ]
        : []),
      input.pooled
        ? "Whether the ladder behind any of it is a sensible one for anybody in particular. Every level here is this app's own generic estimate, and none of it is a level somebody in this circle chose."
        : "Whether the ladder behind any of it is a sensible one for you. The picture inherits every assumption of each name's own anchor.",
      NOT_A_TARGET,
    ],
    at: input.at,
    yours: input.pooled
      ? "Open a name to see its own page, and set your own levels there if you hold it. Nothing drawn here is anybody's edited ladder."
      : "Open a name to see the ladder behind its position, and change any level you disagree with.",
  };
}

/**
 * The four questions at the top. Every answer is a figure from the feed
 * or arithmetic on one, except the last, which quotes the written page.
 */
export function researchQuestionsProvenance(input: {
  ticker: string;
  usesModel?: boolean;
  model?: ModelRun | null;
  at?: string | null;
}): Provenance {
  const tag = cashtag(input.ticker);
  return {
    maker: input.usesModel ? "model" : "arithmetic",
    title: "Where these answers came from",
    headline: input.usesModel
      ? `Three of the four are plain arithmetic on figures the feed published for ${tag}. The fourth quotes the model's own case against, and says so where it does.`
      : `No model wrote these. All four are plain arithmetic on figures the feed published for ${tag}, and a question the figures could not answer says so rather than being answered loosely.`,
    model: input.usesModel ? input.model : undefined,
    inputs: [
      { what: "The year's high and low, and today's price" },
      { what: "Profit per share, this year's estimate and next year's" },
      { what: "The profit margin and the return on the owners' money" },
      { what: "The blended estimate from the valuation panel below" },
      ...(input.usesModel
        ? [{ what: "The first point of the model's case against", detail: "quoted, and named as the model's" }]
        : []),
    ],
    sources: [
      COMPANY_FEED,
      YAHOO_PRICES,
      { name: "This app", what: "the arithmetic, which is named inside each answer" },
      ...(input.usesModel ? [MODEL_ITSELF] : []),
    ],
    steps: [
      "Where it sits is today's price against its own year, and what it costs against a year of profit. Two yardsticks, named separately, because they answer different things.",
      "What the price is assuming is the multiple worked backwards: the yearly growth that would bring it to the ordinary multiple in five years, with no discount rate in it.",
      "The great company and the good price question prints one figure of each kind and deliberately refuses to add them up, because adding them up is a rating.",
      "What would change your mind is a level and a date, both checkable, plus whatever the model argued if it argued anything.",
    ],
    blindSpots: [
      "Anything not in the accounts: a competitor, a rule change, a customer leaving.",
      "A question the feed could not answer is marked, and an unanswered question is not the same as a comfortable answer.",
      NOT_A_TARGET,
      NOT_YOUR_BROKER,
    ],
    at: input.at,
    yours: "Answer the fourth one yourself, in writing, before you decide anything. That is the one nobody can answer for you.",
  };
}

/** What a fund holds. The feed's own published list, plus your own rows. */
export function fundProvenance(input: {
  ticker: string;
  holdingCount?: number;
  hasOverlap?: boolean;
  at?: string | null;
}): Provenance {
  const n = input.holdingCount ?? 0;
  return {
    maker: "market",
    title: "Where this came from",
    headline: `No model wrote this. It is the list of holdings ${cashtag(input.ticker)} publishes, printed as the feed has it.`,
    inputs: [
      {
        what: "The fund's largest holdings and their weights",
        detail:
          n > 0
            ? `the ${n} it publishes, which is a fraction of what a broad fund actually holds`
            : "as published",
      },
      { what: "The kinds of business it holds, as the fund groups them" },
      { what: "What it charges a year" },
      ...(input.hasOverlap
        ? [
            {
              what: "Your own holdings",
              detail:
                "only to check which of these companies you already own. Nothing about your portfolio leaves this browser to work that out.",
            },
          ]
        : []),
    ],
    sources: [
      COMPANY_FEED,
      ...(input.hasOverlap ? [YOUR_HOLDINGS] : []),
    ],
    steps: [
      "The weights are the fund's own published figures, not a calculation.",
      ...(input.hasOverlap
        ? [
            "The overlap line matches the ticker you hold against the ticker in the fund, and adds up the fund's weight in those. It counts only the holdings listed here, so a broad fund's real overlap with your portfolio is larger than the figure shown.",
          ]
        : []),
    ],
    blindSpots: [
      n > 0
        ? `Everything below the ${n} listed. A broad fund holds hundreds of companies and publishes its largest few.`
        : "Everything the fund does not publish.",
      "When the list was last updated. A fund reports its holdings periodically, not daily.",
      "How much the holdings overlap with each other, or with anything you hold outside this app.",
    ],
    at: input.at,
    yours: "Open any holding to read about it the same way.",
  };
}

/** "Worked out 24 Aug 2026, 09:12", or nothing if the surface never knew. */
export function provenanceWhen(at?: string | null): string | null {
  if (!at) return null;
  const stamp = formatDateTime(at);
  return stamp ? `Worked out ${stamp}` : null;
}

/**
 * The retirement plan. Nobody asked a model, and the interesting half of
 * the answer to "where did this come from" is what the arithmetic cannot
 * know rather than what it did.
 *
 * This one carries more sources than anything else in the app for a reason
 * that is the whole design of the module: almost every input is either a
 * published figure from a named body or a long run series anybody can look
 * up, and every one of them is editable on the page. A reader who does not
 * believe the withdrawal rate, the longevity model or the price level for
 * their own country should be able to find the sentence naming it and then
 * find the control that changes it.
 */
export function retirementProvenance(input: {
  regionName: string;
  standardsSource: string;
  returnsSource: string;
  swrSource: string;
  haircutSource: string;
  statePensionSource: string;
  /** The published years remaining at 65 the survival curve was fitted to. */
  e65: number;
  planningAge: number;
  improvementPct: number;
  swrPct: number;
  realReturnPct: number;
  /**
   * Which answer the plan was actually judged on.
   *
   * Not decoration. A cash-only plan is answered by spending down to zero
   * and no withdrawal rate is applied to it at all, so the panel that
   * exists to say where a number came from was describing machinery this
   * reader's plan never ran: it printed "the rate the pot is drawn at,
   * 2.69% a year" beside a figure nothing had drawn at 2.69%, and two
   * steps about surviving the worst run in the record. This is the one
   * surface in the app that may never be approximately right.
   */
  basis: "safeRate" | "spendDown";
}): Provenance {
  const onCash = input.basis === "spendDown";
  return {
    maker: "arithmetic",
    title: "Where this came from",
    headline:
      "No model wrote any of this. It is arithmetic, run year by year over the numbers you typed and a handful of published figures, all of which are named below and all of which you can change.",
    inputs: [
      { what: "Your age, the age you want to stop, and where you live", detail: input.regionName },
      {
        what: "What a year of your retirement costs",
        detail: "a published basket for your country, or the figure you typed over it",
      },
      {
        what: "Your housing, your children and any car payment",
        detail: "each with its own end date, because most of them have one",
      },
      { what: "What you already have invested, and what you add each year" },
      { what: "Your state pension and anything else guaranteed", detail: input.statePensionSource },
      {
        what: "How long the money must last",
        detail: `to age ${input.planningAge}, read off a survival curve fitted to ${input.e65.toFixed(1)} further years at 65`,
      },
      {
        what: "What the money earns after inflation",
        detail: onCash
          ? `${input.realReturnPct.toFixed(1)}% a year, because you are not investing any of it. No platform fee comes off, since nobody pays one on a savings account.`
          : `${input.realReturnPct.toFixed(1)}% a year on the mix you chose, fees already taken off`,
      },
      onCash
        ? {
            what: "How the pot is spent",
            detail:
              "down to nothing by the end of the plan, because a pot held in cash has no order of returns to get wrong and so no withdrawal rate to apply",
          }
        : {
            what: "The rate the pot is drawn at",
            detail: `${input.swrPct.toFixed(2)}% a year`,
          },
    ],
    sources: [
      { name: "You", what: "every figure on the plan, all of which are editable" },
      { name: "Pensions UK, formerly the PLSA", what: input.standardsSource },
      { name: "OECD", what: "comparative price levels, used to move that basket onto your country's prices" },
      { name: input.regionName, what: input.statePensionSource },
      { name: "Global Investment Returns Yearbook", what: input.returnsSource },
      ...(onCash
        ? []
        : [
            {
              name: "Bengen (1994) and the Trinity study (1998)",
              what: input.swrSource,
            },
          ]),
      { name: "Gompertz and Makeham", what: "the shape of adult mortality, fitted to your country's published life expectancy at 65" },
    ],
    steps: [
      "Every year of your retirement is costed on its own rather than averaged. A mortgage ending, a child growing up and a state pension starting each change the year they happen in, and the early years are the ones that decide whether a plan survives.",
      "Tax is grossed up rather than taken off. The published baskets are after tax, so to land a figure you have to draw more than it, and taking the tax off instead would leave the plan about a year of spending short.",
      "Everything is in today's money. Returns are real returns, after inflation, so no number on the page is a future number you would have to deflate in your head.",
      ...(onCash
        ? [
            "You are holding this in cash, so the answer is every year of the plan added up and discounted at what cash earns, ending at nothing. No safe withdrawal rate is applied: that rate exists to survive the worst ORDER returns could arrive in, and cash has no order to get wrong.",
            "Cash is priced at what it earns after inflation rather than before it, which over a long plan is the whole of the risk it carries. Cash cannot fall the way shares can, and a decade of high inflation takes just as much from it.",
          ]
        : [
            "The spending that never goes away is funded at a withdrawal rate built to survive the worst run in the historical record. Everything temporary is funded out of capital on top of it, because a debt with an end date and a lifetime of groceries are not the same financial object.",
            `That rate started at the published figure for a retirement of this length and had two things taken off it: half a point for using the world's markets rather than America's, and ${input.swrPct > 0 ? "your own fees" : "fees"}. Both are shown separately and both can be turned off.`,
          ]),
      `The age the plan runs to is not an average life expectancy. Half of people outlive theirs, so it is the age you have a small chance of reaching, with age specific death rates allowed to keep falling at ${input.improvementPct}% a year as medicine improves.`,
    ],
    blindSpots: [
      onCash
        ? "What inflation does over the length of this plan, which is the whole of the risk in holding cash and the one thing a real return assumption cannot pin down."
        : "The order your returns arrive in, which matters more than their average and which nothing can know in advance. The gap between the two answers on this panel is the price of not knowing it.",
      "Your actual tax, which depends on the account each pound sits in, the country you draw it in, and rules that will change several times before you get there.",
      "Anything that happens to you. Care costs, an inheritance, a divorce, a redundancy, a business that works. Any one of them moves this more than every assumption on the page put together.",
      "Whether the published figures are still current. They are a year or two old the day you read them and are editable for that reason.",
      NOT_A_TARGET,
    ],
    yours:
      "Every number that went into this is an input you can change, and the answer moves as you do.",
  };
}
