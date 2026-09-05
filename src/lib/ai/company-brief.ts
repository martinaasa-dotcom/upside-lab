/**
 * The prompt for a company page, and the pass that throws away anything
 * the model said that it was not entitled to say.
 *
 * The order matters. `buildCompanyBriefPrompt` hands the model a numbered
 * list of exactly what it may lean on, and `keepCitedPoints` afterwards
 * deletes every point whose citation does not resolve back into that list.
 * A model that invents a fact and cites nothing loses the sentence; a model
 * that invents a fact and cites a headline that does not exist loses it
 * too. What survives is a point a reader can follow to a figure on the same
 * screen or an article they can open.
 *
 * That is a deliberately blunt instrument and it will occasionally throw
 * away a true and useful sentence. That is the right trade here: a page
 * whose every claim can be followed to its source is worth more than a page
 * with one more good sentence on it and no way to tell which sentences to
 * believe.
 */
import { PLAIN_WORDS_RULE } from "@/lib/ai/margus-persona";
import { FORECAST_CONVICTION_PROMPT } from "@/lib/forecast-conviction";
import { FORECAST_YEARS } from "@/lib/forecast";
import { NO_VALUE } from "@/lib/format";
import type { CompanyArticle } from "@/lib/company/sources";
import type { CompanyFacts } from "@/lib/company/facts";
import type { CompanyReading } from "@/lib/company/readings";
import type { CompanyBriefRaw } from "@/lib/ai/company-brief-schema";
import { formatDateTime } from "@/lib/timezone";

export type BriefPoint = {
  point: string;
  cite:
    | { kind: "figure"; ref: string; label: string }
    | { kind: "article"; ref: string; title: string; publisher: string; href: string }
    | { kind: "profile"; ref: "" };
};

export type CompanyBrief = {
  whatTheyDo: string;
  howTheyMakeMoney: string;
  inOneLine: string;
  caseFor: BriefPoint[];
  caseAgainst: BriefPoint[];
  watchFor: BriefPoint[];
  path: Partial<Record<number, number>>;
  pathReason: string;
  /** How many points were thrown away for citing nothing that exists. */
  uncited: number;
};

/**
 * The written half of the page, in the order the model is asked to think.
 *
 * Everything the model is allowed to use is in this string. Nothing is
 * fetched on its behalf mid-answer and nothing else is in scope, which is
 * what makes the citation check meaningful rather than decorative.
 *
 * Two of the things pasted in here are written by strangers: the company's
 * own filed description of itself, and the headlines. Neither is trusted as
 * an instruction, and the defence is structural rather than a warning in
 * the prompt: the answer has to fit a schema, and every point in it has to
 * name a figure on the page or one of these headlines by index or it is
 * deleted. A sentence smuggled into a filing cannot make the model produce
 * a claim that survives, because the claim still has to point at something
 * the reader can open.
 */
export function buildCompanyBriefPrompt(input: {
  facts: CompanyFacts;
  readings: CompanyReading[];
  articles: CompanyArticle[];
  nextEarnings?: string | null;
}): string {
  const { facts, readings, articles } = input;
  const figures = readings
    .map(
      (r) =>
        `- id=${r.id} · ${r.label}: ${r.value}${r.plain ? ` (${r.plain})` : ""}`
    )
    .join("\n");
  const headlines = articles.length
    ? articles
        .map(
          (a, i) =>
            `- [${i}] "${a.title}", published by ${a.publisher} on ${formatDateTime(a.publishedAt, { year: "numeric", month: "short", day: "numeric" })}`
        )
        .join("\n")
    : "- (none came back for this company)";

  const yearList = FORECAST_YEARS.join(", ");

  return `## The job

Somebody who has never analysed a company is looking at ${facts.name ?? facts.ticker} (${facts.ticker}) and trying to work out what it is and whether the price in front of them makes sense. Write the plain-English half of that page.

You are not the source of any fact here. Every number this person will see was fetched from a data feed and is listed below. Your job is to say which of those numbers matter, what they mean together, and what the reasonable arguments on both sides are.

## What you may lean on, and nothing else

### The company's own description of itself
${facts.about ? facts.about.slice(0, 1800) : "(the feed carried none)"}

Sector: ${facts.sector ?? "not given"} · Industry: ${facts.industry ?? "not given"} · Type: ${facts.kind ?? "not given"} · Employees: ${facts.employees ?? "not given"}

### The figures already on screen
${figures}

### Recent headlines
${headlines}

${input.nextEarnings ? `### Next results day\n${input.nextEarnings}\n` : ""}
## Citations, which are mandatory

Every point in caseFor, caseAgainst and watchFor carries a \`cite\`:
- \`{kind:"figure", ref:"<id>"}\` where <id> is one of the ids listed above
- \`{kind:"article", ref:"<number>"}\` where <number> is a headline's [index]
- \`{kind:"profile", ref:""}\` for something the company says about itself

A point whose citation does not resolve is deleted before the reader sees it, and a section that loses all of its points is shown as empty. So do not make a point you cannot pin to something above. If the case against is thin because nothing above supports one, give one honest thin point rather than inventing three.

Never cite a figure whose value is "${NO_VALUE}". There is no such number.

## How to write

- Every sentence has to be understandable by somebody who has never bought a share. A grandmother reading this should follow all of it.
${PLAIN_WORDS_RULE}
- Say the number, then say what it means. "They keep about nine dollars of every hundred" beats "margins are healthy".
- No em dashes or en dashes anywhere. Ranges are "2 to 3 years".
- Never tell the reader what to do. No buy, sell, hold, accumulate, avoid, or "worth considering". Describe the company; the decision is theirs.
- The case against is not a formality. If a company is losing money, carrying more debt than it sells in a year, or priced for growth it is not showing, say so first and plainly.
- Do not repeat the same fact in two sections.

## The price path

Also sketch this company's next five years, one price per year end for ${yearList}, and one sentence on why it moves the way it does.

${FORECAST_CONVICTION_PROMPT}

Today's share price is ${facts.price ?? "unknown"}${facts.currency ? ` ${facts.currency}` : ""}.`;
}

/* ---------------------------------------------------------------------- *
 * The citation check
 * ---------------------------------------------------------------------- */

type RawPoint = CompanyBriefRaw["caseFor"][number];

function resolvePoint(
  raw: RawPoint,
  readings: CompanyReading[],
  articles: CompanyArticle[],
  hasProfile: boolean
): BriefPoint | null {
  const point = raw.point?.trim();
  if (!point) return null;
  const kind = raw.cite?.kind;
  const ref = (raw.cite?.ref ?? "").trim();

  if (kind === "figure") {
    const reading = readings.find((r) => r.id === ref);
    /*
      A figure that came back empty is not a citation. The model is told
      this in the prompt and still occasionally cites one, and a point
      leaning on a number the reader can see is `n/a` is exactly the kind
      of unfalsifiable claim this whole pass exists to remove.
    */
    if (!reading || reading.value === NO_VALUE) return null;
    return { point, cite: { kind: "figure", ref, label: reading.label } };
  }

  if (kind === "article") {
    const index = Number.parseInt(ref, 10);
    const article = Number.isInteger(index) ? articles[index] : undefined;
    if (!article) return null;
    return {
      point,
      cite: {
        kind: "article",
        ref,
        title: article.title,
        publisher: article.publisher,
        href: article.href,
      },
    };
  }

  if (kind === "profile" && hasProfile) {
    return { point, cite: { kind: "profile", ref: "" } };
  }

  return null;
}

/**
 * Keep the points that cite something real, and count the ones that did
 * not. The count is shown to the reader rather than swallowed: a run where
 * half the points were thrown away is a run whose remaining points deserve
 * less confidence, and hiding that would be the same dishonesty one level
 * up.
 */
export function resolveCompanyBrief(
  raw: CompanyBriefRaw,
  input: {
    readings: CompanyReading[];
    articles: CompanyArticle[];
    hasProfile: boolean;
  }
): CompanyBrief {
  let uncited = 0;
  const keep = (points: RawPoint[]): BriefPoint[] => {
    const out: BriefPoint[] = [];
    for (const p of points ?? []) {
      const resolved = resolvePoint(
        p,
        input.readings,
        input.articles,
        input.hasProfile
      );
      if (resolved) out.push(resolved);
      else uncited += 1;
    }
    return out;
  };

  const path: Partial<Record<number, number>> = {};
  for (const entry of raw.path ?? []) {
    if (!FORECAST_YEARS.includes(entry.year)) continue;
    if (!(entry.price > 0)) continue;
    path[entry.year] = entry.price;
  }

  return {
    whatTheyDo: (raw.whatTheyDo ?? "").trim(),
    howTheyMakeMoney: (raw.howTheyMakeMoney ?? "").trim(),
    inOneLine: (raw.inOneLine ?? "").trim(),
    caseFor: keep(raw.caseFor ?? []),
    caseAgainst: keep(raw.caseAgainst ?? []),
    watchFor: keep(raw.watchFor ?? []),
    path,
    pathReason: (raw.pathReason ?? "").trim(),
    uncited,
  };
}
