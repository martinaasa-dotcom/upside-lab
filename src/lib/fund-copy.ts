import { humanizeMargusText } from "@/lib/ai/humanize-copy";

const MAX_BULLETS = 4;
const MAX_WORDS = 16;

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * An order book is a book, and the rename cannot tell.
 *
 * `humanizeMargusText` rewrites `\bbook\b` to "portfolio" so no leftover
 * of the old naming reaches a reader, which is right for every sentence
 * about somebody's holdings and wrong for the one phrase a model writing
 * about a company reaches for constantly: measured on this room, "order
 * book covers most of next year" arrived as "order portfolio covers most
 * of next year", which is not English. Masked here rather than in the
 * rewriter, the same way that file already masks "balance sheet", so the
 * fix is scoped to the surface that found it.
 */
const KEEP_PHRASES =
  /\border books?\b|\bbook of business\b|\bbook value\b/gi;

/**
 * A company is a company, never a "name".
 *
 * The desk usage ("the cooling name", "software names") is one of the words
 * this product does not print, and the fund is the surface where a model
 * reaches for it most. The rewrite is deliberately narrow: the plural is
 * always a company here, and the singular is only touched behind a
 * determiner and one describing word, with the words that really do describe
 * a name left alone, so "the company name" and "her first name" survive.
 */
const NOT_A_COMPANY =
  /^(company|brand|file|domain|user|account|first|last|full|real|nick|middle|maiden|pen|code|street|place)$/i;

function companiesNotNames(s: string): string {
  let out = s.replace(/\bnames\b/g, "companies");
  out = out.replace(/\bNames\b/g, "Companies");
  out = out.replace(
    /\b(a|an|the|this|that|one|another) ([A-Za-z][\w-]*) name\b/g,
    (whole, det: string, describing: string) =>
      NOT_A_COMPANY.test(describing) ? whole : `${det} ${describing} company`
  );
  return out;
}

/**
 * Every rewrite that has to happen around the shared humanizing pass.
 *
 * Each kept phrase is stashed by index rather than by phrase, so the capital
 * in "Order book keeps growing" survives: restoring from a fixed table put a
 * lowercase phrase back, and a headline, which is not run through the
 * capitaliser, then opened in lower case.
 */
export function keepingRealBooks(s: string): string {
  const kept: string[] = [];
  const masked = s.replace(KEEP_PHRASES, (m) => {
    kept.push(m);
    return `%%KEEP${kept.length - 1}%%`;
  });
  // After the shared pass, because that pass writes "names" itself.
  const humanized = companiesNotNames(humanizeMargusText(masked));
  return humanized.replace(/%%KEEP(\d+)%%/g, (whole, i: string) => {
    const original = kept[Number(i)];
    return original ?? whole;
  });
}

function tidy(part: string): string {
  let s = part.trim().replace(/^[.;,\s]+|[.;,\s]+$/g, "");
  s = s.replace(/^sell if\s+/i, "");
  s = s.replace(/^if\s+/i, "");
  /*
   * The acronym is the thing to remove, not the words.
   *
   * This used to shorten "remaining performance obligations (RPO)" to
   * "RPO", which is the opposite of what the voice rules ask for: it took
   * a phrase a reader could at least puzzle at and handed them three
   * letters nothing on the page explains. Every acronym below goes the same
   * plain way, including a bare mention with no spelled-out form beside it.
   *
   * The wording is another session's, landed in the main checkout the same
   * day this branch found the same fault. Two spellings of one plain phrase
   * would be worse than either, so this takes theirs.
   */
  s = s.replace(
    /\bremaining performance obligations\s*(?:\(RPO\))?/gi,
    "signed orders not yet billed"
  );
  s = s.replace(/\bRPO\b/g, "signed orders not yet billed");
  s = s.replace(/\byear[- ]over[- ]year\b/gi, "compared with a year earlier");
  s = s.replace(/\bYoY\b/gi, "compared with a year earlier");
  s = s.replace(/\bFCF\b/g, "free cash flow");
  s = s.replace(/\bfails to exceed\b/gi, "below");
  s = s.replace(/\bdecelerates below\b/gi, "below");
  s = s.replace(/^signaling\s+/i, "");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "";
  return capitalize(keepingRealBooks(s));
}

function splitClause(part: string): string[] {
  const signaling = part.split(/\s*,\s*signaling\s+/i);
  if (signaling.length > 1) {
    return signaling.flatMap(splitClause);
  }
  const asMatch = part.match(/^(.*?)\s+as\s+(.+)$/i);
  if (
    asMatch?.[1] &&
    asMatch[2] &&
    asMatch[1].split(/\s+/).length >= 3 &&
    asMatch[2].split(/\s+/).length >= 4
  ) {
    return [asMatch[1], asMatch[2]];
  }
  return [part];
}

/**
 * A sentence that was cut says so.
 *
 * Both clips used to end wherever the word count ran out, with nothing to
 * mark it, so a reader had no way to tell a short reason from most of a
 * long one. On the one room in this app that asks to be checked, half a
 * stated reason presented as the whole of it is the wrong half to hide.
 */
function clipTo(s: string, words: number): string {
  const parts = s.split(/\s+/);
  if (parts.length <= words) return s;
  return `${parts.slice(0, words).join(" ").replace(/[.,;:]+$/, "")} …`;
}

function clipWords(s: string): string {
  return clipTo(s, MAX_WORDS);
}

/**
 * Thesis and exit plans used to land as one paragraph. Cards need short
 * bullets. Splits on the separators Margus already uses (; / or if), then
 * trims filler so existing rows read as a list without a rewrite.
 */
export function fundCopyBullets(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  const chunks = text
    .split(/\s*;\s*|\s+or if\s+/i)
    .flatMap(splitClause)
    .map(tidy)
    .filter(Boolean)
    .map(clipWords);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of chunks) {
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= MAX_BULLETS) break;
  }
  return out;
}

const RECAP_MAX = 6;
const RECAP_WORDS = 18;

const SPELLED_NUMBERS =
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty";
const SERIAL_PREFIX_RE = new RegExp(
  `^(day|week)\\s+(\\d+|${SPELLED_NUMBERS})\\s*[:.\\u2013\\u2014-]?\\s*`,
  "i"
);

/**
 * Models sometimes stamp "Day one:" on the first headline and then drop
 * the prefix. The page always numbers from the list, so strip whatever
 * landed in storage before we add "Day 3:" ourselves.
 */
export function stripReportSerialPrefix(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(SERIAL_PREFIX_RE);
  if (!match) return trimmed;
  const rest = trimmed.slice(match[0].length).trim();
  if (!rest) return trimmed;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** Newest-first list: index 0 is the latest entry, which is Day N / Week N. */
export function serialFromNewest(
  total: number,
  indexFromNewest: number
): number {
  return Math.max(1, total - indexFromNewest);
}

export function numberedReportHeadline(
  text: string,
  unit: "Day" | "Week",
  n: number
): string {
  const body = stripReportSerialPrefix(keepingRealBooks(text));
  return `${unit} ${n}: ${body}`;
}

function clipRecap(s: string): string {
  return clipTo(s, RECAP_WORDS);
}

/**
 * Daily / weekly fund prose as a short list. Works on stored paragraphs
 * so old recaps tighten up without waiting for the next cron.
 */
export function recapBullets(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  const chunks = text
    .split(/\n+/)
    .flatMap((line) => {
      const stripped = line
        .replace(/^[-*•]\s+/, "")
        .replace(/\*+/g, "")
        .trim();
      if (!stripped) return [];
      return stripped.split(/(?<=[.!?])\s+/);
    })
    .flatMap(splitClause)
    .map(tidy)
    .filter((s) => s.length >= 8)
    .map(clipRecap);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of chunks) {
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= RECAP_MAX) break;
  }
  return out;
}
