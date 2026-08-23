/**
 * Post-process Margus (and other LLM) prose so em dashes and other
 * AI-tell punctuation never reach the UI, even when the model ignores
 * the persona Voice rules.
 *
 * Safe for Markdown: only rewrites dash punctuation and a short list of
 * stock AI openers. Does not touch table pipes, cashtags, or code fences.
 */

import { groupMoneyInText } from "@/lib/money-text";

const EM = "\u2014"; // —
const EN = "\u2013"; // –

/** Replace em/en dashes with natural punctuation a person would type. */
export function stripAiDashes(text: string): string {
  if (!text || (!text.includes(EM) && !text.includes(EN))) return text;

  let s = text;

  // Parenthetical aside: "foo — bar — baz" → "foo, bar, baz"
  s = s.replace(
    new RegExp(`\\s*${EM}\\s*([^${EM}\\n]+?)\\s*${EM}\\s*`, "g"),
    ", $1, "
  );

  // Remaining em dashes → comma (or period before a capital / cashtag).
  s = s.replace(new RegExp(`\\s*${EM}\\s*(?=[A-Z$])`, "g"), ". ");
  s = s.replace(new RegExp(`\\s*${EM}\\s*`, "g"), ", ");

  // En dash as a numeric range (2028–2029, 5–12%) → hyphen.
  s = s.replace(new RegExp(`(\\d)\\s*${EN}\\s*(\\d)`, "g"), "$1-$2");
  // Any other en dash used as a clause break → comma.
  s = s.replace(new RegExp(`\\s*${EN}\\s*`, "g"), ", ");

  // Tidy doubles from overlapping replacements.
  s = s.replace(/,\s*,+/g, ", ");
  s = s.replace(/\.\s*\.+/g, ". ");
  s = s.replace(/[ \t]{2,}/g, " ");
  s = s.replace(/ +([.,])/g, "$1");

  // Capitalize after a sentence break we introduced.
  s = s.replace(/\.\s+([a-z])/g, (_, c: string) => `. ${c.toUpperCase()}`);

  return s.trim();
}

const AI_OPENERS: Array<[RegExp, string]> = [
  [/^it'?s important to note that\s+/i, ""],
  [/^it is worth noting that\s+/i, ""],
  [/^in today'?s fast[- ]paced(?:\s+\w+)?[,]?\s+/i, ""],
  [/^at the end of the day[,]?\s+/i, ""],
  [/^when all is said and done[,]?\s+/i, ""],
  [/\bnot just\s+([^,.;]+),\s+but\s+/gi, "$1, and "],
];

/** Light scrub of stock AI openers; keeps the rest of the sentence. */
export function scrubAiPhrases(text: string): string {
  if (!text) return text;
  let s = text;
  let strippedLead = false;
  for (const [re, rep] of AI_OPENERS) {
    const next = s.replace(re, rep);
    if (next !== s) {
      s = next;
      if (re.source.startsWith("^")) strippedLead = true;
    }
  }
  if (!s) return text;
  // Only recapitalize when we actually ate a leading opener. Doing this
  // to every string turned Pulse enums (`intact`, `hold`) into `Intact` /
  // `Hold`, which the badge code then treated as unknown and painted
  // "Thesis at risk" on a fully intact Hold card.
  if (strippedLead) {
    return s.replace(/^[a-z]/, (c) => c.toUpperCase());
  }
  return s;
}

/** Kill leftover market slang the model still emits. */
function scrubMarketJargon(text: string): string {
  if (!text) return text;
  let s = text;
  s = s.replace(
    /\btape read from the move and the book(?:, no model in the loop)?(?: while the model was busy)?\.?/gi,
    ""
  );
  s = s.replace(/\btape read\b/gi, "Read");
  s = s.replace(/\bbest tape\b/gi, "biggest gainer");
  s = s.replace(/\bworst tape\b/gi, "biggest drop");
  s = s.replace(/\bon the tape\b/gi, "in the prices");
  s = s.replace(/\bthe tape\b/gi, "prices");
  s = s.replace(/\btape\b/gi, "prices");
  s = s.replace(/\blive marks\b/gi, "today's prices");
  s = s.replace(/\bAI power sleeves?\b/gi, "electricity-for-AI names");
  s = s.replace(/\bindex sleeves?\b/gi, "a mix of many companies");
  s = s.replace(/\bSaaS sleeves?\b/gi, "software names");
  s = s.replace(/\bsleeves\b/gi, "groups of similar stocks");
  s = s.replace(/\bsleeve\b/gi, "group of similar stocks");
  s = s.replace(/\bdry powder\b/gi, "cash sitting ready");
  s = s.replace(/\bdigestion years?\b/gi, "quiet years");
  s = s.replace(/\bdigestion\b/gi, "a pause");
  s = s.replace(/\brisk-off\b/gi, "when people are selling");
  s = s.replace(/\brisk-on\b/gi, "when people are buying");
  s = s.replace(/\bhigh-beta\b/gi, "jumpy");
  s = s.replace(/\bdrawdowns?\b/gi, "drops");
  s = s.replace(/\bhighest conviction\b/gi, "biggest bet");
  s = s.replace(/\bhigh conviction\b/gi, "a big bet");
  s = s.replace(/\bsector rotation\b/gi, "money moving between groups");
  s = s.replace(/\bbalance sheets\b/gi, "%%BALANCE_SHEETS%%");
  s = s.replace(/\bbalance sheet\b/gi, "%%BALANCE_SHEET%%");
  s = s.replace(/\bspreadsheets\b/gi, "%%SPREADSHEETS%%");
  s = s.replace(/\bspreadsheet\b/gi, "%%SPREADSHEET%%");
  s = s.replace(/\bthis book's\b/gi, "your portfolio's");
  s = s.replace(/\bthe book's\b/gi, "your portfolio's");
  s = s.replace(/\byour book\b/gi, "your portfolio");
  s = s.replace(/\bof the book\b/gi, "of your portfolio");
  s = s.replace(/\bon the book\b/gi, "on your portfolio");
  s = s.replace(/\bin the book\b/gi, "in your portfolio");
  s = s.replace(/\bacross the book\b/gi, "across your portfolio");
  s = s.replace(/\bthe whole book\b/gi, "your whole portfolio");
  s = s.replace(/\bthis book\b/gi, "your portfolio");
  s = s.replace(/\bthe book\b/gi, "your portfolio");
  s = s.replace(/\ba book\b/gi, "a portfolio");
  s = s.replace(/\bbooks\b/gi, "portfolios");
  s = s.replace(/\bbook\b/gi, "portfolio");
  s = s.replace(/\bthis sheet's\b/gi, "your portfolio's");
  s = s.replace(/\bthe sheet's\b/gi, "your portfolio's");
  s = s.replace(/\bof the sheet\b/gi, "of your portfolio");
  s = s.replace(/\bon the sheet\b/gi, "on your portfolio");
  s = s.replace(/\bin the sheet\b/gi, "in your portfolio");
  s = s.replace(/\bthe whole sheet\b/gi, "your whole portfolio");
  s = s.replace(/\bthis sheet\b/gi, "your portfolio");
  s = s.replace(/\bthe sheet\b/gi, "your portfolio");
  s = s.replace(/\ba sheet\b/gi, "a portfolio");
  s = s.replace(/\bsheets\b/gi, "portfolios");
  s = s.replace(/\bsheet\b/gi, "portfolio");
  s = s.replace(/\bour portfolio's\b/gi, "your portfolio's");
  s = s.replace(/\bour whole portfolio\b/gi, "your whole portfolio");
  s = s.replace(/\bour portfolio\b/gi, "your portfolio");
  s = s.replace(/\bthis portfolio\b/gi, "your portfolio");
  s = s.replace(/\bfor us this morning\b/gi, "this morning");
  s = s.replace(/\bwe barely\b/gi, "you barely");
  s = s.replace(/\bwe hold\b/gi, "you hold");
  s = s.replace(/\bwe don't need\b/gi, "you don't need");
  s = s.replace(/\bwe do not need\b/gi, "you do not need");
  s = s.replace(/\bwhen we're not\b/gi, "when you're not");
  s = s.replace(/\bwhen we are not\b/gi, "when you are not");
  s = s.replace(/\bthe reason we own\b/gi, "the reason you own");
  s = s.replace(/\bIf we did not mean\b/gi, "If you did not mean");
  s = s.replace(/\boverexposed\b/gi, "heavy in one group");
  s = s.replace(/\bwe aren't hedged\b/gi, "that one group is the whole portfolio");
  s = s.replace(/\baren't hedged\b/gi, "are all in that one group");
  s = s.replace(/\bhedged\b/gi, "protected");
  s = s.replace(/%%BALANCE_SHEETS%%/g, "balance sheets");
  s = s.replace(/%%BALANCE_SHEET%%/g, "balance sheet");
  s = s.replace(/%%SPREADSHEETS%%/g, "spreadsheets");
  s = s.replace(/%%SPREADSHEET%%/g, "spreadsheet");
  return s;
}

function firstDollar(text: string | null | undefined): string | null {
  const m = (text ?? "").match(/\$\s*[\d,]+(?:\.\d{1,2})?/);
  return m ? m[0].replace(/\s+/g, "") : null;
}

/** Stable pick so the same ticker always shows the same phrasing, but two
 * different tickers on the same card rarely land on the same one. */
function pickVariant<T>(variants: T[], seed?: string | null): T {
  if (!seed) return variants[0];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return variants[h % variants.length];
}

/** One short Pulse suggestion. A thought, never an order. */
export function pulseSuggestion(input: {
  action?: string | null;
  trimPct?: number | null;
  addLevel?: string | null;
  ticker?: string | null;
}): string {
  const action = String(input.action ?? "hold").trim().toLowerCase();
  const seed = input.ticker;
  if (action === "trim") {
    if (input.trimPct != null && Number.isFinite(input.trimPct)) {
      const pct = Math.round(input.trimPct);
      return pickVariant(
        [
          `Trim ${pct}% into the strength.`,
          `Taking ${pct}% off the top after a jump like this is a common move.`,
          `A ${pct}% trim here locks in some of the run.`,
          `${pct}% off keeps most of the position while banking some of the gain.`,
        ],
        seed
      );
    }
    return pickVariant(
      [
        "Trim a little into the strength.",
        "Taking a small bite off the top after a jump like this is a common move.",
        "A partial trim here locks in some of the run.",
      ],
      seed
    );
  }
  if (action === "add") {
    const price = firstDollar(input.addLevel);
    if (price) {
      return pickVariant(
        [
          `Adding near ${price} builds on the position if the reason still holds.`,
          `A small add around ${price} is in play while the story holds up.`,
          `Layering in near ${price} keeps this growing on the same thesis.`,
        ],
        seed
      );
    }
    return pickVariant(
      [
        "Adding here builds on the position if the reason still holds.",
        "A small add is in play while the story holds up.",
        "Layering in a bit keeps this growing on the same thesis.",
      ],
      seed
    );
  }
  if (action === "sell") {
    return pickVariant(
      [
        "Selling here closes it out if the reason it was bought is gone.",
        "Exiting makes sense once the original reason no longer holds.",
        "Closing the position out fits once the thesis is broken.",
      ],
      seed
    );
  }
  if (action === "watch") {
    return pickVariant(
      [
        "Waiting for more clarity is the safer read right now.",
        "Sitting on hands until the story firms up.",
        "Holding off until the picture is clearer fits here.",
      ],
      seed
    );
  }
  return pickVariant(
    [
      "Sitting tight fits here.",
      "No change needed while the thesis holds.",
      "Staying put is the straightforward read.",
    ],
    seed
  );
}

/** Kill leftover buy/sell orders the model still emits. Ban lists may
 * name the phrases. Output must read as a check, never an instruction. */
function scrubTradeOrders(text: string): string {
  if (!text) return text;
  let s = text;
  s = s.replace(
    /\bIf it runs, sell some\.?/gi,
    "If it runs, selling some is one way not to chase."
  );
  s = s.replace(
    /\bIf it ran too far, sell some\.?/gi,
    "If it ran too far, selling some is one way to take heat off."
  );
  s = s.replace(/\bDon'?t chase\.?/gi, "Chasing a run is how people overpay.");
  s = s.replace(/\bDo not chase\.?/gi, "Chasing a run is how people overpay.");
  s = s.replace(
    /\bDo not add this week\.?/gi,
    "Adding here would make a broken story bigger."
  );
  s = s.replace(
    /\bDo not add today\.?/gi,
    "Adding today would make a broken story bigger."
  );
  s = s.replace(
    /\bDo not add\b/gi,
    "Adding is how a broken story gets bigger"
  );
  s = s.replace(
    /\bDon'?t add\b/gi,
    "Adding is how a broken story gets bigger"
  );
  s = s.replace(
    /\bLook to add this week on the dip\.?/gi,
    pulseSuggestion({ action: "add" })
  );
  s = s.replace(
    /\bLook to add if it dips\.?/gi,
    pulseSuggestion({ action: "add" })
  );
  s = s.replace(
    /\bLook to add\.?/gi,
    pulseSuggestion({ action: "add" })
  );
  // Strip leftover "into this/the strength" padding from the raw model
  // text before substitution -- pulseSuggestion() below may add its own
  // "into the strength" phrasing, which must survive past this point.
  s = s.replace(/\s+into this strength\.?/gi, ".");
  s = s.replace(/\s+into the strength\.?/gi, ".");
  s = s.replace(
    /\bOne check:\s*selling about (\d+)\s*%(?:\s+into (?:this|the) (?:strength|run(?:-up)?))?\.?/gi,
    (_, n: string) => pulseSuggestion({ action: "trim", trimPct: Number(n) })
  );
  s = s.replace(
    /\bTrim about (\d+)\s*%(?:\s+into (?:this|the) (?:strength|run(?:-up)?))?\.?/gi,
    (_, n: string) => pulseSuggestion({ action: "trim", trimPct: Number(n) })
  );
  s = s.replace(
    /\bOne check:\s*selling a little into the run\.?/gi,
    pulseSuggestion({ action: "trim" })
  );
  s = s.replace(
    /\bAdd now\s*~?\s*(\$\s*[\d,]+(?:\.\d{1,2})?)/gi,
    (_, price: string) =>
      pulseSuggestion({ action: "add", addLevel: price.replace(/\s+/g, "") })
  );
  s = s.replace(/\bAdd now\s*~?\s*/gi, "Adding a bit around ");
  s = s.replace(
    /\bdo not buy more(?: here)?(?: or chase it)?\.?/gi,
    "Buying more here is how people chase a run."
  );
  s = s.replace(
    /\bdon'?t buy more(?: here)?(?: or chase it)?\.?/gi,
    "Buying more here is how people chase a run."
  );
  s = s.replace(
    /\bno trades before the (?:open|bell)(?: today)?\.?/gi,
    "Nothing you need to do before the open."
  );
  s = s.replace(
    /\bYou should not add\b/gi,
    "Adding here would make a broken story bigger"
  );
  s = s.replace(
    /\bYou should sell\b/gi,
    pulseSuggestion({ action: "sell" })
  );
  s = s.replace(
    /\bYou should buy\b/gi,
    pulseSuggestion({ action: "add" })
  );
  s = s.replace(
    /\bYou should add\b/gi,
    pulseSuggestion({ action: "add" })
  );
  s = s.replace(
    /\bI recommend (buying|selling|adding|trimming)\b/gi,
    (_, verb: string) => {
      const a = verb.toLowerCase();
      if (a === "selling") return pulseSuggestion({ action: "sell" });
      if (a === "trimming") return pulseSuggestion({ action: "trim" });
      return pulseSuggestion({ action: "add" });
    }
  );
  s = s.replace(/[ \t]{2,}/g, " ");
  return s;
}

/** Full pass for a single Margus string. */
export function humanizeMargusText(text: string): string {
  if (!text) return text;
  // Grouping runs last, and on the model's own prose: the facts it is
  // given are formatted, but nothing stops it from typing $129709 back.
  return groupMoneyInText(
    scrubAiPhrases(stripAiDashes(scrubTradeOrders(scrubMarketJargon(text))))
  );
}

/**
 * Keys that are codes, not prose. Running the sentence sanitizer on them
 * title-cases enums and breaks every `=== "intact"` check downstream.
 */
const LEAVE_ALONE = new Set([
  "thesisStatus",
  "action",
  "ticker",
  "id",
  "kind",
  "type",
  "generatedAt",
  "cachedAt",
  "publishedAt",
  "link",
  "url",
]);

/**
 * Recursively humanize every string in a plain object / array tree
 * (forecast plans, pulse reports, fund decisions, etc.).
 */
export function humanizeMargusTree<T>(value: T): T {
  if (typeof value === "string") {
    return humanizeMargusText(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => humanizeMargusTree(v)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = LEAVE_ALONE.has(k) ? v : humanizeMargusTree(v);
    }
    return out as T;
  }
  return value;
}
