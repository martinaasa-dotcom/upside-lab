import { NO_VALUE, cashtag, currency } from "@/lib/format";
import { formatDateTime } from "@/lib/timezone";

/**
 * Where a number on screen came from, in the reader's own language.
 *
 * The one question this product keeps being asked is where a figure comes
 * from, and the honest answer differs sharply from one card to the next:
 * most of the app is arithmetic on holdings somebody typed in, and a
 * handful of surfaces are a language model reasoning about a company. Those
 * two deserve very different amounts of trust, and until now the screen
 * looked identical either way, so a reader with any suspicion of generated
 * text had no way to tell them apart and reasonably assumed the worst about
 * all of it.
 *
 * So anything a model touched carries an eye, and behind the eye is this:
 * what made the number, every input it was given, and what it cannot know.
 * The rule for writing one is that it must be checkable. Name the real
 * inputs, in the order the prompt gives them, and name the real gaps. A
 * reassuring paragraph that does not survive somebody reading the code is
 * worse than nothing, because it is the second thing they stop believing.
 */
export type ProvenanceMaker = "model" | "arithmetic" | "market";

export type ProvenanceInput = {
  /** The input, named as a person would name it. */
  what: string;
  /** The value it actually had, when the surface knows it. */
  detail?: string;
};

export type Provenance = {
  maker: ProvenanceMaker;
  /** Two or three words on the trigger's tooltip and the popover's heading. */
  title: string;
  /** One sentence saying who made the number. Blunt, never reassuring. */
  headline: string;
  /** Everything that went in. Empty is not an acceptable answer. */
  inputs: ProvenanceInput[];
  /** What it cannot know. A model number always has some. */
  blindSpots: string[];
  /** When the number was worked out, ISO. */
  at?: string | null;
  /** One closing line. What the reader can do about it, if anything. */
  yours?: string;
};

/**
 * The model's own knowledge is an input like any other, and it is the one a
 * skeptic is actually asking about, so it is never left implicit.
 */
const TRAINING_INPUT: ProvenanceInput = {
  what: "What the model already knows about the company",
  detail:
    "from its training, which stopped at some point in the past and does not include this morning",
};

const NO_NEWS: string =
  "Anything in the news. No article, filing or analyst note is fetched or read.";

const NOT_A_TARGET: string =
  "It is not a price target, and it is nobody telling you to buy or sell.";

const NOT_THE_FUTURE: string =
  "Anything that has not happened yet. An earnings miss, a rate move, a competitor, a bad year.";

const TRAINING_IS_STALE: string =
  "Anything that happened after the model last learned. This morning is not in there.";

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
}): Provenance {
  const tag = cashtag(input.ticker);
  if (input.fallback) {
    return {
      maker: "arithmetic",
      title: "Where this came from",
      headline: `No model run has landed for ${tag} yet, so this path is a plain shape for its kind of business. It is not reasoning about this company.`,
      inputs: [
        {
          what: "Today's price",
          detail: input.spot > 0 ? currency(input.spot) : NO_VALUE,
        },
        {
          what: "The kind of business it is",
          detail: input.sector?.trim() || "worked out from the ticker",
        },
        {
          what: "A typical shape for that kind of business",
          detail: "quiet years and fast years, rather than a straight line",
        },
      ],
      blindSpots: [
        "Anything specific to this company. It is a shape, not a view.",
        NOT_THE_FUTURE,
        NOT_A_TARGET,
      ],
      at: input.at,
      yours: "Ask Margus to work it out, or type your own price over any year.",
    };
  }
  return {
    maker: "model",
    title: "Where this came from",
    headline: `A language model wrote this path for ${tag}. Nobody here picked the numbers, and no analyst was asked.`,
    inputs: [
      {
        what: "Today's price",
        detail:
          (input.spot > 0 ? currency(input.spot) : NO_VALUE) +
          ", the number every later year in the path is measured from",
      },
      {
        what: "The kind of business it is",
        detail: input.sector?.trim() || "worked out from the ticker",
      },
      {
        what: "Your position size",
        detail: "how much of your total portfolio this holding is",
      },
      input.hasOwnReason
        ? {
            what: "Your own reason for holding it",
            detail: "your written thesis, and how sure you said you were",
          }
        : {
            what: "Your own reason for holding it",
            detail: "not written down, so the model reasoned without it",
          },
      {
        what: "The rest of your portfolio",
        detail:
          "your cash, your total, and which of your holdings are the same kind of business, so a name is priced as part of what you hold rather than on its own",
      },
      {
        what: "Today's date",
        detail: "so the first year is the rest of this year, not a whole one",
      },
      {
        what: "The whole-market baseline",
        detail:
          "about 10% a year, what a broad index fund is assumed to return. This path can land above it or below it.",
      },
      TRAINING_INPUT,
    ],
    blindSpots: [NOT_THE_FUTURE, NO_NEWS, NOT_A_TARGET],
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
}): Provenance {
  if (input.fallback) {
    return {
      maker: "arithmetic",
      title: "Where this came from",
      headline:
        "No model run has landed yet, so each path is a plain shape for that kind of business. The chart is those shapes added up.",
      inputs: [
        { what: "Your share counts" },
        { what: "Today's prices, from the market data feed" },
        {
          what: "A typical shape for each kind of business",
          detail: "quiet years and fast years, rather than a straight line",
        },
      ],
      blindSpots: [
        "Anything specific to a company. These are shapes, not a view.",
        NOT_THE_FUTURE,
        NOT_A_TARGET,
      ],
      at: input.at,
      yours: "Ask Margus to work each name out, or type your own price over any year.",
    };
  }
  return {
    maker: "model",
    title: "Where this came from",
    headline:
      "A language model writes a yearly price for each holding from what that company does, how much of it you own, and what you wrote down as the reason. The chart is those prices times your share counts. Today's column is the market. Every year after that is modeled.",
    inputs: [
      { what: "Today's price of each holding" },
      { what: "The kind of business each one is" },
      { what: "How much of the portfolio each one is" },
      { what: "Your written reason for holding a name, when you have one" },
      {
        what: "Your cash, your total, and which holdings are the same kind of business",
      },
      { what: "Today's date, so the first year is the rest of this one" },
      {
        what: "The whole-market baseline",
        detail:
          "about 10% a year, what a broad index fund is assumed to return. Each path can land above it or below it.",
      },
      TRAINING_INPUT,
    ],
    blindSpots: [NOT_THE_FUTURE, NO_NEWS, TRAINING_IS_STALE, NOT_A_TARGET],
    at: input.at,
    yours: "Open any card's eye for that name. Type over a year and yours wins.",
  };
}

/** The whole-portfolio path. The same run, added up. */
export function forecastTotalProvenance(input: {
  at?: string | null;
  fallback?: boolean;
}): Provenance {
  return {
    maker: "arithmetic",
    title: "Where this came from",
    headline:
      "This line is your share counts times the modeled price of each holding, added up. The addition is plain arithmetic. The prices in it are the modeled ones.",
    inputs: [
      { what: "Your share count for each holding" },
      {
        what: "Each holding's modeled path",
        detail: input.fallback
          ? "a plain shape per kind of business, since no model run has landed"
          : "written by a language model, one name at a time",
      },
      { what: "Any price you typed over yourself" },
    ],
    blindSpots: [
      "Anything you buy or sell later. It assumes you hold exactly what you hold today.",
      NOT_THE_FUTURE,
      NOT_A_TARGET,
    ],
    at: input.at,
    yours: "Open any card to see what made that name's path.",
  };
}

/** A Thesis Pulse verdict on one name. */
export function pulseProvenance(input: {
  ticker: string;
  hasOwnReason: boolean;
  headlineCount?: number;
  at?: string | null;
}): Provenance {
  const tag = cashtag(input.ticker);
  const n = input.headlineCount ?? 0;
  return {
    maker: "model",
    title: "Where this came from",
    headline: `A language model read your own reason for owning ${tag} against how the price has moved, and said whether the two still agree.`,
    inputs: [
      input.hasOwnReason
        ? { what: "Your written reason for owning it", detail: "in your words" }
        : {
            what: "Your written reason for owning it",
            detail: "you have not written one, which is why the reading is thin",
          },
      { what: "Today's price and how it has moved recently" },
      { what: "Where it sits against its recent high and low" },
      n > 0
        ? {
            what: "Recent headlines, fetched for this check",
            detail:
              n === 1
                ? "one headline, listed on the card"
                : `${n} headlines, listed on the card`,
          }
        : {
            what: "Recent headlines",
            detail: "none came back for this check, so it worked without them",
          },
      { what: "Last and next earnings dates, when the feed has them" },
      TRAINING_INPUT,
    ],
    blindSpots: [
      "Headlines it did not get. The fetch misses things, and a missed story is not in the reading.",
      TRAINING_IS_STALE,
      "Whether you are right. It checks whether your reason and the price still fit, not whether the reason was good.",
      NOT_A_TARGET,
    ],
    at: input.at,
    yours: "Rewrite your reason and the next reading answers the new one.",
  };
}

/** The made-up bad days in Lab. Arithmetic, not a model. */
export function scenarioProvenance(): Provenance {
  return {
    maker: "arithmetic",
    title: "Where this came from",
    headline:
      "Nobody asked a model. Each day is a made-up move, written into the app, applied to your share counts at today's prices.",
    inputs: [
      { what: "Your share counts" },
      { what: "Today's prices" },
      {
        what: "The move this day assumes for each kind of business",
        detail: "a percentage written into the app, not something the market did",
      },
    ],
    blindSpots: [
      "Whether that day would actually happen.",
      "Whether you would sell, buy more, or sit through it. The numbers assume you hold exactly what you hold today.",
      NOT_A_TARGET,
    ],
    yours: "Pick a different day from the row above.",
  };
}

/** Margus in the corner. Every reply is a model. */
export function margusChatProvenance(): Provenance {
  return {
    maker: "model",
    title: "Where this came from",
    headline:
      "Margus is a language model. Replies are reasoned from the holdings on this portfolio, what you just asked, and what the model already knows. Not a person, and not a recommendation.",
    inputs: [
      { what: "The holdings and cash on this portfolio" },
      { what: "Today's prices" },
      { what: "What you typed, and any screenshot you attached" },
      {
        what: "Any Pulse and Forecast readings this portfolio already has",
        detail: "only when the reply is about those",
      },
      TRAINING_INPUT,
    ],
    blindSpots: [
      NO_NEWS,
      TRAINING_IS_STALE,
      "Your taxes, your timing, anything sitting at a broker this app cannot see.",
      NOT_A_TARGET,
    ],
    yours: "It can edit the numbers in this app if you ask. It cannot buy or sell anything real.",
  };
}

/** The paper portfolio Margus runs in public. */
export function upsideFundProvenance(): Provenance {
  return {
    maker: "model",
    title: "Where this came from",
    headline:
      "Paper money. A language model named Margus picks one move a day in a pretend portfolio. It is not a real fund and not a signal to copy.",
    inputs: [
      { what: "The fund's own pretend holdings" },
      { what: "Yesterday's prices" },
      { what: "The rule that it makes one decision a day, in public" },
      TRAINING_INPUT,
    ],
    blindSpots: [
      "Anything the market did after the day's decision.",
      NO_NEWS,
      TRAINING_IS_STALE,
      NOT_A_TARGET,
    ],
    yours: "Watch it like a diary, not like a manager.",
  };
}

/** The line under a Home card, and anything else that is pure arithmetic. */
export function holdingsProvenance(input: {
  at?: string | null;
}): Provenance {
  return {
    maker: "arithmetic",
    title: "Where this came from",
    headline:
      "No model wrote this. It is your own share counts times today's prices, and nothing else.",
    inputs: [
      { what: "The holdings you typed in" },
      { what: "Today's prices, from the market data feed" },
    ],
    blindSpots: [
      "Anything you own somewhere else. Nothing here is connected to a bank or a broker.",
    ],
    at: input.at,
  };
}

/** "Worked out 24 Aug 2026, 09:12", or nothing if the surface never knew. */
export function provenanceWhen(at?: string | null): string | null {
  if (!at) return null;
  const stamp = formatDateTime(at);
  return stamp ? `Worked out ${stamp}` : null;
}
