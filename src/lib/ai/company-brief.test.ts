import { describe, expect, it } from "vitest";
import { NO_VALUE } from "@/lib/format";
import {
  buildCompanyBriefPrompt,
  resolveCompanyBrief,
} from "@/lib/ai/company-brief";
import type { CompanyBriefRaw } from "@/lib/ai/company-brief-schema";
import type { CompanyReading } from "@/lib/company/readings";
import type { CompanyArticle } from "@/lib/company/sources";
import { makeOrdinaryFacts } from "@/lib/company/facts-fixture";
import { FORECAST_YEARS } from "@/lib/forecast";
import { PLAIN_WORDS_RULE } from "@/lib/ai/margus-persona";

/**
 * The rule the whole room rests on: **a point that cannot name what it
 * rests on never reaches the reader.**
 *
 * Somebody is deciding what to do with their own money on the strength of
 * these sentences. A model writing a confident unsourced paragraph about a
 * company is precisely the thing this room was built to replace, so the
 * check has to be blunt and it has to be tested against the ways a model
 * actually gets it wrong: citing a figure that is not on the page, citing a
 * headline index that does not exist, citing a figure that came back empty,
 * and citing nothing at all.
 */

const READINGS: CompanyReading[] = [
  {
    id: "profit",
    label: "Whether they make money",
    value: "10.0%",
    plain: "Out of every $100, about $10 is profit.",
    compare: "Most large companies keep $5 to $15.",
    tone: "good",
  },
  {
    id: "growth",
    label: "Whether that is growing",
    value: NO_VALUE,
    plain: null,
    compare: "The economy grows a few percent a year.",
    tone: "neutral",
  },
];

const ARTICLES: CompanyArticle[] = [
  {
    title: "Test Company wins a large order",
    publisher: "A Publisher",
    href: "https://example.com/one",
    publishedAt: "2026-09-01T00:00:00.000Z",
  },
];

function raw(over: Partial<CompanyBriefRaw> = {}): CompanyBriefRaw {
  return {
    whatTheyDo: "They make a thing and sell it to other companies.",
    howTheyMakeMoney: "Customers pay a fee every month.",
    inOneLine: "A profitable maker of one thing.",
    caseFor: [],
    caseAgainst: [],
    watchFor: [],
    path: [],
    pathReason: "",
    ...over,
  };
}

const resolve = (over: Partial<CompanyBriefRaw>) =>
  resolveCompanyBrief(raw(over), {
    readings: READINGS,
    articles: ARTICLES,
    hasProfile: true,
  });

describe("a point has to name what it rests on", () => {
  it("keeps a point citing a figure that is on the page", () => {
    const brief = resolve({
      caseFor: [
        { point: "They keep ten dollars of every hundred.", cite: { kind: "figure", ref: "profit" } },
      ],
    });
    expect(brief.caseFor).toHaveLength(1);
    expect(brief.caseFor[0]?.cite).toMatchObject({
      kind: "figure",
      label: "Whether they make money",
    });
    expect(brief.uncited).toBe(0);
  });

  it("deletes a point citing a figure that does not exist", () => {
    const brief = resolve({
      caseFor: [
        { point: "Their factories run at full tilt.", cite: { kind: "figure", ref: "utilisation" } },
      ],
    });
    expect(brief.caseFor).toHaveLength(0);
    expect(brief.uncited).toBe(1);
  });

  it("deletes a point citing a figure that came back empty", () => {
    /*
      The nastiest of the four, because the citation resolves. A point
      leaning on a number the reader can see is `n/a` is exactly the
      unfalsifiable claim this pass exists to remove.
    */
    const brief = resolve({
      caseAgainst: [
        { point: "Sales are barely moving.", cite: { kind: "figure", ref: "growth" } },
      ],
    });
    expect(brief.caseAgainst).toHaveLength(0);
    expect(brief.uncited).toBe(1);
  });

  it("keeps a point citing a headline it was actually given", () => {
    const brief = resolve({
      caseFor: [
        { point: "They just won a large order.", cite: { kind: "article", ref: "0" } },
      ],
    });
    expect(brief.caseFor[0]?.cite).toMatchObject({
      kind: "article",
      publisher: "A Publisher",
      href: "https://example.com/one",
    });
  });

  it("deletes a point citing a headline that does not exist", () => {
    const brief = resolve({
      caseFor: [
        { point: "Analysts upgraded it this week.", cite: { kind: "article", ref: "7" } },
        { point: "Something happened.", cite: { kind: "article", ref: "not a number" } },
      ],
    });
    expect(brief.caseFor).toHaveLength(0);
    expect(brief.uncited).toBe(2);
  });

  it("deletes a point resting on a company description there is none of", () => {
    const brief = resolveCompanyBrief(
      raw({
        caseFor: [
          { point: "They describe themselves as a platform.", cite: { kind: "profile", ref: "" } },
        ],
      }),
      { readings: READINGS, articles: ARTICLES, hasProfile: false }
    );
    expect(brief.caseFor).toHaveLength(0);
    expect(brief.uncited).toBe(1);
  });

  it("counts across every section, so the reader sees the whole toll", () => {
    const bad = { kind: "figure" as const, ref: "nope" };
    const brief = resolve({
      caseFor: [{ point: "One made up thing.", cite: bad }],
      caseAgainst: [{ point: "Another made up thing.", cite: bad }],
      watchFor: [{ point: "A third made up thing.", cite: bad }],
    });
    expect(brief.uncited).toBe(3);
    expect(brief.caseFor.concat(brief.caseAgainst, brief.watchFor)).toHaveLength(0);
  });

  it("leaves a section empty rather than topping it up", () => {
    const brief = resolve({
      caseFor: [{ point: "A real one.", cite: { kind: "figure", ref: "profit" } }],
      caseAgainst: [{ point: "A made up one.", cite: { kind: "figure", ref: "nope" } }],
    });
    expect(brief.caseFor).toHaveLength(1);
    expect(brief.caseAgainst).toHaveLength(0);
  });
});

describe("the path it sketches", () => {
  it("keeps only the years this app actually draws", () => {
    const brief = resolve({
      path: [
        { year: FORECAST_YEARS[0]!, price: 120 },
        { year: 1999, price: 5 },
      ],
    });
    expect(Object.keys(brief.path)).toEqual([String(FORECAST_YEARS[0])]);
  });

  it("drops a price that is not a price", () => {
    const brief = resolve({
      path: [{ year: FORECAST_YEARS[0]!, price: -4 }],
    });
    expect(Object.keys(brief.path)).toHaveLength(0);
  });
});

const facts = () =>
  makeOrdinaryFacts({
    about: "It tests things for other companies.",
    revenue: null,
    revenueGrowth: null,
    trailingPe: null,
    forwardPe: null,
  });

describe("the prompt hands over exactly what may be cited", () => {
  const prompt = buildCompanyBriefPrompt({
    facts: facts(),
    readings: READINGS,
    articles: ARTICLES,
  });

  it("lists every figure by the id a citation has to use", () => {
    for (const r of READINGS) expect(prompt).toContain(`id=${r.id}`);
  });

  it("numbers the headlines so an index can point at one", () => {
    expect(prompt).toContain("[0]");
    expect(prompt).toContain("A Publisher");
  });

  it("tells the model an uncited point will be deleted", () => {
    expect(prompt.toLowerCase()).toContain("deleted before the reader sees it");
  });

  it("forbids citing a figure that came back empty", () => {
    expect(prompt).toContain(NO_VALUE);
  });

  it("carries the same forecast rules the Growth room uses", () => {
    // Imported rather than restated, so the two rooms cannot drift into
    // telling a reader two different stories about one company.
    expect(prompt).toContain("Forecast stance (MANDATORY)");
    for (const year of FORECAST_YEARS) expect(prompt).toContain(String(year));
  });

  it("carries the shared plain-words rule rather than a miniature of it", () => {
    /*
      Pointing at the one rule instead of restating five of its words is
      the same move `forecast-plan.ts` made, and it is what keeps this
      file out of the copy guard's exception list: a prompt that names the
      banned words is a file with market slang in it.
    */
    expect(prompt).toContain(PLAIN_WORDS_RULE);
  });

  it("tells it never to say what to do", () => {
    expect(prompt).toContain("Never tell the reader what to do");
  });
});
