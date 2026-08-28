/**
 * Post-process Margus (and other LLM) prose so em dashes and other
 * AI-tell punctuation never reach the UI, even when the model ignores
 * the persona Voice rules.
 *
 * Safe for Markdown: only rewrites dash punctuation and a short list of
 * stock AI openers. Does not touch table pipes, cashtags, or code fences.
 */

import { COINS } from "@/lib/coins";
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
  for (const coin of COINS) {
    const escaped = coin.symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(`\\$?${escaped}`, "gi"), `$${coin.short}`);
  }
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
  s = s.replace(
    /\bwhich of your portfolios\b[^?.!]*(?:[?.!]|$)/gi,
    "I'll use your portfolio."
  );
  s = s.replace(
    /\bwhich portfolio (do you want|would you like|should I|shall I|to apply|is this for|are we (?:talking|looking))\b[^?.!]*(?:[?.!]|$)/gi,
    "I'll use your portfolio."
  );
  s = s.replace(
    /\b(?:pick|select|choose) a portfolio\b[^?.!]*(?:[?.!]|$)/gi,
    "I'll use your portfolio."
  );
  s = s.replace(/\bacross (?:all )?your portfolios\b/gi, "in your portfolio");
  s = s.replace(/\bin (?:both|all) (?:of )?your portfolios\b/gi, "in your portfolio");
  s = s.replace(/\bYour other portfolios?\b/g, "Your portfolio");
  s = s.replace(/\byour other portfolios?\b/gi, "your portfolio");
  s = s.replace(/\bin your portfolios\b/gi, "in your portfolio");
  s = s.replace(/\bof your portfolios\b/gi, "of your portfolio");
  s = s.replace(/\bYour portfolios\b/g, "Your portfolio");
  s = s.replace(/\byour portfolios\b/gi, "your portfolio");
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

/**
 * Two failures the word bans above cannot catch, because both are made of
 * ordinary words.
 *
 * The first is the empty trailing clause: "RKLB slipped a bit after last
 * week's earnings miss, keeping its valuation in play." Everything before
 * the comma is a fact. Everything after it is a shape where a thought goes.
 * A reader cannot act on it, cannot disagree with it, and cannot even say
 * what it claims, which is precisely why a model reaches for it: it ends
 * the sentence without committing to anything. Cutting it costs nothing.
 *
 * The second is the small pile of trade-desk nouns that read as English to
 * anybody who has worked in this and as nothing at all to everybody else.
 * "Valuation", "an earnings miss", "guidance", "a catalyst", "a headwind".
 * The rule in AGENTS.md is that a grandmother gets every sentence, and none
 * of these clears that.
 *
 * Order matters: the empty clauses go first, so a clause about to be cut is
 * not first rewritten word by word and then cut anyway.
 */
const EMPTY_CLAUSES: RegExp[] = [
  /,\s*(?:which is\s+)?(?:keep|keeping|leav|leaving|put|putting|set|setting)\w*\s+[^,.!?]*?\b(?:in play|on the table|in focus|in the frame|front and cent(?:er|re)|in question|interesting|worth watching)\b/gi,
  /,\s*(?:which\s+)?(?:keeps|leaves|puts|sets)\s+[^,.!?]*?\b(?:in play|on the table|in focus|in question)\b/gi,
];

const PLAIN_WORDS: Array<[RegExp, string]> = [
  [/\bearnings misses\b/gi, "results below what people expected"],
  [/\bearnings miss\b/gi, "results below what people expected"],
  [/\bearnings beats\b/gi, "results above what people expected"],
  [/\bearnings beat\b/gi, "results above what people expected"],
  [/\bguidance cut\b/gi, "cut to the company's own forecast"],
  [/\bcut guidance\b/gi, "cut its own forecast"],
  [/\braised guidance\b/gi, "raised its own forecast"],
  [/\bguidance\b/gi, "the company's own forecast"],
  [/\bvaluations\b/gi, "prices"],
  [/\bvaluation\b/gi, "price"],
  [/\bcatalysts\b/gi, "events"],
  [/\bcatalyst\b/gi, "event"],
  [/\bheadwinds\b/gi, "pressures"],
  [/\bheadwind\b/gi, "pressure"],
  [/\btailwinds\b/gi, "things helping it"],
  [/\btailwind\b/gi, "something helping it"],
  [/\bde-?risked\b/gi, "made safer"],
  [/\bde-?risking\b/gi, "making it safer"],
  [/\bmultiple expansion\b/gi, "people paying more for the same earnings"],
  [/\bre-?rating\b/gi, "a change in what people will pay for it"],
  [/\bin play\b/gi, "an open question"],
];

function scrubVagueEndings(text: string): string {
  if (!text) return text;
  let s = text;
  for (const re of EMPTY_CLAUSES) s = s.replace(re, "");
  for (const [re, rep] of PLAIN_WORDS) s = s.replace(re, rep);
  // A cut clause can leave " ." or a doubled space behind it.
  s = s.replace(/\s+([.,;:!?])/g, "$1").replace(/[ \t]{2,}/g, " ");
  return s;
}

function firstDollar(text: string | null | undefined): string | null {
  const m = (text ?? "").match(/\$\s*[\d,]+(?:\.\d{1,2})?/);
  return m ? m[0].replace(/\s+/g, "") : null;
}

/** Cashtag or bare symbol the model stuck onto an order. */
const ORDER_SYM = "(?:\\$[A-Za-z]{1,6}|[A-Z]{2,6})";
/** Rest of a sentence, including 5.2% (a `.` inside a figure is not a stop). */
const SENTENCE_REST = "([^.!?]*(?:\\.\\d+[^.!?]*)*[.!]?)";

/**
 * Terms §2: not a recommendation to buy, sell, or hold. An order prefix
 * is dropped. The news clause after it (after X, because Y, near $N) stays,
 * so Why still says why the range tag fired.
 */
function joinFact(fact: string, rest: string): string {
  let clause = rest
    .replace(new RegExp(`^\\s*(?:on|of)\\s+${ORDER_SYM}\\b\\s*`, "i"), "")
    .replace(/^\s*(?:of this (?:holding|position)|of the position)\s*/i, "")
    .replace(/^\s*(?:into (?:this|the) (?:strength|run(?:-up)?))\s*/i, "")
    .replace(
      /,?\s*then\s+(?:revisit|look again|check again|add more|buy more)(?:\s+if)?\b[^,.]*?(?=[,.]|\bbecause\b|\bas\b|$)/gi,
      ""
    )
    .replace(/,?\s*keeping the rest\b[^,]*/gi, "")
    .replace(/,?\s*keeping the[^,.]*?upside\b/gi, "")
    .replace(/^[\s,;:.-]+/, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  const base = fact.replace(/\.+$/, "");
  const dollar = firstDollar(clause);
  if (dollar && base.includes(dollar)) {
    clause = clause
      .replace(
        /^(near|around|at)\s*\$\s*[\d,]+(?:\.\d{1,2})?\s*,?\s*/i,
        ""
      )
      .trim();
  }
  if (!clause) return `${base}.`;
  if (
    /^(after|because|tied to|as|following|from|on the back of|keeping)\b/i.test(
      clause
    )
  ) {
    return `${base} ${clause}`;
  }
  if (/^(near|around|at)\s*\$/.test(clause)) {
    return `${base}, ${clause}`;
  }
  return `${base}. ${clause.charAt(0).toUpperCase()}${clause.slice(1)}`;
}

/** One short Pulse observation. A price or thesis fact, never an order. */
export function pulseSuggestion(input: {
  action?: string | null;
  trimPct?: number | null;
  addLevel?: string | null;
  ticker?: string | null;
}): string {
  const action = String(input.action ?? "hold").trim().toLowerCase();
  if (action === "trim") {
    return "Price is above its recent range.";
  }
  if (action === "add") {
    const price = firstDollar(input.addLevel);
    return price
      ? `Price is below its recent range, near ${price}.`
      : "Price is below its recent range.";
  }
  if (action === "sell") {
    return "The reason you own this no longer matches what the company is doing.";
  }
  if (action === "watch") {
    return "There is not enough price history yet to say where this sits in its range.";
  }
  return "Price is inside its recent range.";
}

/** Kill leftover buy/sell orders the model still emits. Ban lists may
 * name the phrases. Output must read as a price or thesis fact. */
function scrubTradeOrders(text: string): string {
  if (!text) return text;
  let s = text;
  s = s.replace(
    /\bIf it runs, sell some\.?/gi,
    pulseSuggestion({ action: "trim" })
  );
  s = s.replace(
    /\bIf it ran too far, sell some\.?/gi,
    pulseSuggestion({ action: "trim" })
  );
  s = s.replace(
    /\bDon'?t chase\.?/gi,
    "Price is above its recent range."
  );
  s = s.replace(
    /\bDo not chase\.?/gi,
    "Price is above its recent range."
  );
  s = s.replace(
    /\bDo not add this week\.?/gi,
    pulseSuggestion({ action: "sell" })
  );
  s = s.replace(
    /\bDo not add today\.?/gi,
    pulseSuggestion({ action: "sell" })
  );
  s = s.replace(/\bDo not add\b/gi, pulseSuggestion({ action: "sell" }));
  s = s.replace(/\bDon'?t add\b/gi, pulseSuggestion({ action: "sell" }));
  s = s.replace(
    /\bLook to add this week on the dip\.?/gi,
    pulseSuggestion({ action: "add" })
  );
  s = s.replace(
    /\bLook to add if it dips\.?/gi,
    pulseSuggestion({ action: "add" })
  );
  s = s.replace(/\bLook to add\.?/gi, pulseSuggestion({ action: "add" }));
  s = s.replace(/\s+into this strength\.?/gi, ".");
  s = s.replace(/\s+into the strength\.?/gi, ".");
  s = s.replace(
    /\bOne check:\s*selling about (\d+)\s*%(?:\s+into (?:this|the) (?:strength|run(?:-up)?))?\.?/gi,
    () => pulseSuggestion({ action: "trim" })
  );
  s = s.replace(
    new RegExp(
      `\\b(?:Trim(?:ming)?|Take off)\\s+(?:about\\s+)?\\d{1,2}(?:\\.\\d+)?\\s*%(?:\\s+(?:of|on)\\s+(?:this\\s+(?:holding|position)|the\\s+position|${ORDER_SYM}))?${SENTENCE_REST}`,
      "gi"
    ),
    (_full, rest: string) =>
      joinFact(pulseSuggestion({ action: "trim" }), rest ?? "")
  );
  s = s.replace(
    /\bOne check:\s*selling a little into the run\.?/gi,
    pulseSuggestion({ action: "trim" })
  );
  s = s.replace(
    new RegExp(
      `\\bTake (?:a little|some) off\\b${SENTENCE_REST}?`,
      "gi"
    ),
    (_full, rest: string) =>
      joinFact(pulseSuggestion({ action: "trim" }), rest ?? "")
  );
  s = s.replace(
    /\s+with a \d{1,2}% modeled trim (?:level|fact)\b/gi,
    ""
  );
  s = s.replace(
    new RegExp(
      `\\bA \\d{1,2}% modeled trim (?:level|fact) fits\\s+(?:${ORDER_SYM}\\s+)?${SENTENCE_REST}`,
      "gi"
    ),
    (_full, rest: string) =>
      joinFact(pulseSuggestion({ action: "trim" }), rest ?? "")
  );
  s = s.replace(
    /\bAdd now\s*~?\s*(\$\s*[\d,]+(?:\.\d{1,2})?)/gi,
    (_, price: string) =>
      pulseSuggestion({ action: "add", addLevel: price.replace(/\s+/g, "") })
  );
  s = s.replace(/\bAdd now\s*~?\s*/gi, "");
  s = s.replace(
    new RegExp(
      `\\b(?:Buy|Add)(?:ing)?(?:\\s+the)?\\s+dips?(?:\\s+(?:on|in)\\s+${ORDER_SYM})?\\b${SENTENCE_REST}`,
      "gi"
    ),
    (_full, rest: string) => {
      const clause = rest ?? "";
      return joinFact(
        pulseSuggestion({ action: "add", addLevel: firstDollar(clause) }),
        clause
      );
    }
  );
  s = s.replace(
    /,?\s*then\s+(?:revisit|look again|check again|add more|buy more)(?:\s+if)?\b[^,.]*?(?=[,.]|\bbecause\b|\bas\b|$)/gi,
    ""
  );
  s = s.replace(
    /[;,]?\s*(?:worth\s+)?keep(?:ing)? an eye on\s+([^.!?]+)/gi,
    (_full, thing: string) => {
      const t = String(thing ?? "")
        .trim()
        .replace(/[.,;]+$/, "");
      if (!t) return "";
      return `. ${t.charAt(0).toUpperCase()}${t.slice(1)} would change the picture`;
    }
  );
  s = s.replace(
    /\bdo not buy more(?: here)?(?: or chase it)?\.?/gi,
    "Price is above its recent range."
  );
  s = s.replace(
    /\bdon'?t buy more(?: here)?(?: or chase it)?\.?/gi,
    "Price is above its recent range."
  );
  s = s.replace(
    /\bno trades before the (?:open|bell)(?: today)?\.?/gi,
    "Prices before the open are still forming."
  );
  s = s.replace(/\bYou should not add\b/gi, pulseSuggestion({ action: "sell" }));
  s = s.replace(/\bYou should sell\b/gi, pulseSuggestion({ action: "sell" }));
  s = s.replace(/\bYou should buy\b/gi, pulseSuggestion({ action: "add" }));
  s = s.replace(/\bYou should add\b/gi, pulseSuggestion({ action: "add" }));
  s = s.replace(/\bSit tight\.?/gi, pulseSuggestion({ action: "hold" }));
  s = s.replace(/\bSitting tight fits here\.?/gi, pulseSuggestion({ action: "hold" }));
  s = s.replace(
    /\bStart small(?: only if you still like why you'd own it)?\.?/gi,
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
  s = s.replace(/,\s*,+/g, ", ");
  s = s.replace(/\.\s*\.+/g, ". ");
  s = s.replace(/ +([.,])/g, "$1");
  s = s.replace(/\.\s+([a-z])/g, (_m, c: string) => `. ${c.toUpperCase()}`);
  return s.trim();
}

/** Full pass for a single Margus string. */
export function humanizeMargusText(text: string): string {
  if (!text) return text;
  // Grouping runs last, and on the model's own prose: the facts it is
  // given are formatted, but nothing stops it from typing $129709 back.
  return groupMoneyInText(
    scrubAiPhrases(
      stripAiDashes(scrubTradeOrders(scrubVagueEndings(scrubMarketJargon(text))))
    )
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
