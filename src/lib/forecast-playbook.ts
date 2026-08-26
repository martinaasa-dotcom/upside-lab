/**
 * Forecast add/trim lines used to land as one packed paragraph
 * ("$NBIS (40%) / $CRWV (37%): trim into the run-up"). Cards need a list.
 * Splits cached slash-packed strings and the semicolon lists Margus
 * should emit going forward, without rewriting old plans.
 */

export type PlaybookBullet = {
  head: string;
  detail: string | null;
};

const HOLD_RE =
  /^(hold,?\s*no\s*(add|trim)|nothing,?\s*just\s*hold|hold\.?|no mix change|unchanged in this stretch)$/i;

function isTickerish(s: string): boolean {
  const t = s.trim();
  if (/\$[A-Z]{1,6}\b/.test(t)) return true;
  if (/^[A-Z]{1,6}(\.[A-Z]{1,3})?\b/.test(t) && /\(/.test(t)) return true;
  return false;
}

function sentenceCase(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function formatHead(name: string): string {
  const t = name.trim();
  const sized = t.match(/^(.*?)\s*\(([^)]*->[^)]*)\)\s*$/);
  if (sized?.[1] && sized[2]) {
    return `${sized[1].trim()} · ${sized[2].replace(/\s*->\s*/g, " → ").trim()}`;
  }
  return t.replace(/\s*->\s*/g, " → ");
}

function toBullet(name: string, why: string | null): PlaybookBullet {
  return {
    head: formatHead(name),
    detail: why ? sentenceCase(why) : null,
  };
}

function priceMentions(s: string): number {
  return (s.match(/\$\d[\d,]*(?:\.\d+)?/g) ?? []).length;
}

function splitChunk(chunk: string): PlaybookBullet[] {
  const colon = chunk.indexOf(":");
  if (colon <= 0 || colon > 90) {
    return [toBullet(chunk, null)];
  }
  const namesPart = chunk.slice(0, colon).trim();
  const why = chunk.slice(colon + 1).trim();
  if (!why) return [toBullet(chunk, null)];

  const names = namesPart
    .split(/\s*\/\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.length >= 2 && names.every(isTickerish)) {
    // One rationale naming prices ($285 and $120) is about the cluster,
    // not each name. Copying it onto $NBIS made those look like NBIS levels.
    if (priceMentions(why) > 0) {
      return [
        {
          head: names.map(formatHead).join(" · "),
          detail: sentenceCase(why),
        },
      ];
    }
    return names.map((n) => toBullet(n, why));
  }
  return [toBullet(namesPart, why)];
}

export function playbookBullets(
  text: string | null | undefined
): PlaybookBullet[] {
  const raw = text?.trim() ?? "";
  if (!raw || HOLD_RE.test(raw)) return [];

  const chunks = raw
    .split(/\n+|;\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  const out: PlaybookBullet[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    for (const bullet of splitChunk(chunk)) {
      const key = `${bullet.head}|${bullet.detail ?? ""}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(bullet);
    }
  }
  return out;
}
