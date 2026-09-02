import { NO_VALUE, cashtag, currency } from "@/lib/format";
import { formatDateTime } from "@/lib/timezone";
import type { ModelRun } from "@/lib/ai/model-label";
import type { ForecastPathAdjustment } from "@/lib/forecast-plan";

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
 * So anything a model touched carries an eye, and behind the eye is the
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

const YOUR_WORDS: ProvenanceSource = {
  name: "You",
  what: "the reason you wrote down for owning it, in your own words",
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
export function forecastPathProvenance(input: {
  ticker: string;
  spot: number;
  sector?: string | null;
  hasOwnReason?: boolean;
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
        "The percent on the card is that last price against today's price, and nothing else.",
      ],
      blindSpots: [
        "Anything at all about this company. It is a shape for a category, not a view on a name.",
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
      input.hasOwnReason
        ? {
            what: "Your own reason for holding it",
            detail: "your written reason, and how sure you said you were",
          }
        : {
            what: "Your own reason for holding it",
            detail: "you have not written one, so the model worked without it",
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
      input.hasOwnReason ? YOUR_WORDS : YOUR_HOLDINGS,
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
        ? "One of those paths was changed by this app afterwards, because the model skipped a year or drew a straight line. Open that name's own eye to see which."
        : `${input.adjustedCount} of those paths were changed by this app afterwards, because the model skipped a year or drew a straight line. Open a name's own eye to see which.`
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
      "A language model writes a yearly price for every holding, from what the company does, how much of it you own and what you wrote down as your reason. Today's column is the real market price. Every year after it is modeled.",
    model: input.model,
    inputs: [
      { what: "Today's price of each holding" },
      { what: "The kind of business each one is" },
      { what: "How big each holding is in this portfolio" },
      { what: "Your written reason for a company, where you have written one" },
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
    yours: "Open any card's eye for that name. Type over a year and yours wins.",
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
  hasOwnReason: boolean;
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
    headline: `A language model read your own reason for owning ${tag} against how the price has moved and what was in the news, then said whether the two still agree.`,
    model: input.model,
    inputs: [
      input.hasOwnReason
        ? { what: "Your written reason for owning it", detail: "in your words" }
        : {
            what: "Your written reason for owning it",
            detail:
              "you have not written one. The model still answers, but it is judging the price against nothing, which is why the reading is thin.",
          },
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
              "none came back for this check, so the reading is the price and your reason only",
          },
      { what: "Last and next earnings dates, when the feed has them" },
      TRAINING_INPUT,
    ],
    sources: [
      input.hasOwnReason ? YOUR_WORDS : YOUR_HOLDINGS,
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
      "Whether you are right. It checks whether your reason and the price still fit each other, not whether the reason was any good.",
      NOT_A_TARGET,
    ],
    at: input.at,
    yours: "Rewrite your reason and the next reading answers the new one.",
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
      { what: "Your written reason for each name, where you have one" },
      { what: "Recent headlines for each name" },
      TRAINING_INPUT,
    ],
    sources: [YOUR_HOLDINGS, YAHOO_PRICES, YAHOO_NEWS, MODEL_ITSELF],
    steps: [
      "The page picks companies by size and by how far they moved. No model is involved in choosing them.",
      n > 0
        ? `Those ${n === 1 ? "name is" : `${n} names are`} then sent to the model, and it writes one reading each.`
        : "Those companies are then sent to the model, and it writes one reading each.",
      "A reading is kept and reused until the price moves or you change your reason, so two visits on a quiet day show the same words rather than a new opinion.",
      REWRITTEN_STEP,
    ],
    blindSpots: [
      "Headlines the search missed.",
      TRAINING_IS_STALE,
      NOT_A_TARGET,
    ],
    at: input.at,
    yours: "Open any card's eye for what went into that one name.",
  };
}

/* ---------------------------------------------------------------------- *
 * Everything else
 * ---------------------------------------------------------------------- */

/** The made-up bad days in Lab. Arithmetic, not a model. */
export function scenarioProvenance(): Provenance {
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
      "If part of your portfolio is borrowed, the room before a forced sale assumes your broker wants 30% of the stocks covered by your own money. Real brokers use 25% to 30% and can raise it without warning.",
    ],
    blindSpots: [
      "Whether a day like that would actually happen, or how likely it is.",
      "What you would do in it. The numbers assume you sit still and hold exactly what you hold today.",
      NOT_A_TARGET,
    ],
    yours: "Pick a different day from the row above.",
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

/** "Worked out 24 Aug 2026, 09:12", or nothing if the surface never knew. */
export function provenanceWhen(at?: string | null): string | null {
  if (!at) return null;
  const stamp = formatDateTime(at);
  return stamp ? `Worked out ${stamp}` : null;
}
