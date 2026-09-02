import { humanizeMargusText } from "@/lib/ai/humanize-copy";

const MAX_BULLETS = 4;
const MAX_WORDS = 16;

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function tidy(part: string): string {
  let s = part.trim().replace(/^[.;,\s]+|[.;,\s]+$/g, "");
  s = s.replace(/^sell if\s+/i, "");
  s = s.replace(/^if\s+/i, "");
  /*
   * Every other rule in this file opens a term up. This one used to close
   * one, turning "remaining performance obligations (RPO)" into a
   * three-letter acronym on a card a beginner reads. Both spellings go the
   * same plain way now.
   */
  s = s.replace(
    /\bremaining performance obligations\s*\(RPO\)/gi,
    "signed orders not yet billed"
  );
  s = s.replace(/\bRPO\b/g, "signed orders not yet billed");
  s = s.replace(/\bfails to exceed\b/gi, "below");
  s = s.replace(/\bdecelerates below\b/gi, "below");
  s = s.replace(/^signaling\s+/i, "");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "";
  return capitalize(humanizeMargusText(s));
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

function clipWords(s: string): string {
  const words = s.split(/\s+/);
  if (words.length <= MAX_WORDS) return s;
  return `${words.slice(0, MAX_WORDS).join(" ")}`;
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
  const body = stripReportSerialPrefix(humanizeMargusText(text));
  return `${unit} ${n}: ${body}`;
}

function clipRecap(s: string): string {
  const words = s.split(/\s+/);
  if (words.length <= RECAP_WORDS) return s;
  return words.slice(0, RECAP_WORDS).join(" ");
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
