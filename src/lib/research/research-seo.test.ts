import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import { BLOCKED_USER_AGENTS, ROBOTS_ONLY_AI_TOKENS, WELCOME_USER_AGENTS, isBlockedCrawler } from "@/lib/bot-policy";
import { makeOrdinaryFacts } from "@/lib/company/facts-fixture";
import { fairValueRead } from "@/lib/company/fair-value";
import { isQuotableTicker } from "@/lib/ticker";
import { RESEARCH_REVALIDATE_SECONDS } from "@/lib/research/page-data";
import { WARM_PER_RUN } from "@/lib/research/warm";
import {
  researchDescription,
  researchLede,
  researchQuestions,
  researchTitle,
  plainCompanyName,
} from "@/lib/research/seo-copy";
import { researchIndexJsonLd, researchJsonLd, serializeJsonLd } from "@/lib/research/structured-data";
import {
  RESEARCH_GROUPS,
  RESEARCH_TICKERS,
  isResearchTicker,
  normalizeResearchTicker,
  researchGroupFor,
  researchHref,
  researchNeighbours,
} from "@/lib/research/universe";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("the published universe is a closed, checkable list", () => {
  it("only names symbols the rest of the app would accept", () => {
    /*
      The universe is what decides which pages exist, so a symbol in it
      that the quote path would refuse is a page in the sitemap that can
      never load.
    */
    for (const ticker of RESEARCH_TICKERS) {
      expect(isQuotableTicker(ticker), `${ticker} is not quotable`).toBe(true);
      expect(ticker).toBe(ticker.toUpperCase());
    }
  });

  it("names each company exactly once", () => {
    const seen = new Set<string>();
    for (const group of RESEARCH_GROUPS) {
      for (const ticker of group.tickers) {
        expect(seen.has(ticker), `${ticker} is in two groups`).toBe(false);
        seen.add(ticker);
      }
    }
    expect(seen.size).toBe(RESEARCH_TICKERS.length);
  });

  it("refuses anything not on the list, however it is spelled", () => {
    expect(isResearchTicker("nvda")).toBe(true);
    expect(isResearchTicker(" NVDA ")).toBe(true);
    expect(isResearchTicker("ZZZZ")).toBe(false);
    expect(isResearchTicker("")).toBe(false);
    expect(normalizeResearchTicker("%2Fetc")).toBe("/ETC");
  });

  it("gives every page a way on to the rest of its own group", () => {
    /*
      The only internal linking this section has. A group whose members
      all point at the same handful leaves the rest reachable from the
      index alone, which is the shape that gets a page crawled rarely.
    */
    for (const group of RESEARCH_GROUPS) {
      const reached = new Set<string>();
      for (const ticker of group.tickers) {
        const near = researchNeighbours(ticker);
        expect(near).not.toContain(ticker);
        expect(new Set(near).size).toBe(near.length);
        for (const t of near) {
          expect(group.tickers).toContain(t);
          reached.add(t);
        }
      }
      // Every member of a group is linked from at least one other member.
      for (const ticker of group.tickers) {
        expect(reached.has(ticker), `${ticker} is linked from nowhere`).toBe(
          true
        );
      }
    }
  });

  it("builds one spelling of a company's address", () => {
    expect(researchHref("nvda")).toBe("/research/NVDA");
    expect(researchGroupFor("NVDA")?.id).toBe("chips");
    expect(researchGroupFor("ZZZZ")).toBeNull();
  });
});

describe("nothing published here reads as advice", () => {
  const facts = makeOrdinaryFacts({ ticker: "TEST", name: "Testing Systems Inc." });
  const read12 = fairValueRead(facts, {});
  const everything = [
    researchTitle(facts),
    researchDescription(facts, read12),
    researchLede(facts),
    ...researchQuestions({ facts, read: read12 }).flatMap((q) => [
      q.question,
      q.answer,
    ]),
  ].join(" \n ");

  /*
    The same guard `value-glance.test.ts` holds one level up, applied to
    the copy a stranger meets first. A page written to be found by a search
    engine is under more pressure than any other in this app to answer the
    question the search engine's users actually typed, which is whether to
    buy. It may not.
  */
  it("prints no verdict word and no instruction", () => {
    const banned = [
      "undervalued",
      "overvalued",
      "cheap",
      "expensive",
      "bargain",
      "you should buy",
      "you should sell",
      "we recommend",
      "strong buy",
      "a good buy",
    ];
    const text = everything.toLowerCase();
    for (const word of banned) {
      expect(text.includes(word), `"${word}" reached a public page`).toBe(
        false
      );
    }
  });

  it("says out loud that it will not answer the buy question", () => {
    const asked = researchQuestions({ facts, read: read12 });
    const advice = asked.find((q) => q.id === "advice");
    expect(advice).toBeTruthy();
    expect(advice?.question.toLowerCase()).toContain("buy");
    expect(advice?.answer).toMatch(/^No\./);
  });

  it("uses no dash as a clause break, the way the rest of the app does not", () => {
    expect(everything).not.toMatch(/[–—]/);
  });

  it("drops a question it has no figure for rather than printing n/a", () => {
    const bare = {
      ...facts,
      analystTargetMean: null,
      analystCount: null,
      analystTargetLow: null,
      analystTargetHigh: null,
    };
    const asked = researchQuestions({ facts: bare, read: null });
    expect(asked.some((q) => q.id === "target")).toBe(false);
    for (const q of asked) expect(q.answer).not.toContain("n/a");
  });

  it("keeps a title short enough to survive a result list", () => {
    /*
      A result list cuts a title off around sixty characters and the
      layout appends the product name after this string, so the ceiling
      here is what is left. A name too long to fit is dropped whole rather
      than cut in half, which is why the check is on a set of real names
      rather than on one example.

      What a truncation may never lose is the ticker and the phrase people
      searched, so both are at the front and a cut only ever takes the
      tail of "and price target".
    */
    const names = [
      "Apple Inc.",
      "Berkshire Hathaway Inc.",
      "Taiwan Semiconductor Manufacturing Company Limited",
      "State Street SPDR S&P 500 ETF Trust",
    ];
    for (const name of names) {
      for (const kind of ["EQUITY", "ETF"]) {
        const title = researchTitle({ ...facts, name, kind });
        expect(title.length, `${title} is too long`).toBeLessThanOrEqual(56);
        expect(title).not.toMatch(/\(\s*\)/);
      }
    }
  });

  it("names the company the way a person would", () => {
    expect(plainCompanyName({ ...facts, name: "NVIDIA Corporation" })).toBe(
      "NVIDIA"
    );
    expect(plainCompanyName(facts)).toBe("Testing Systems");
    // Two suffixes, both stripped, one at a time.
    expect(
      plainCompanyName({ ...facts, name: "Example Holdings Inc." })
    ).toBe("Example");
    // A suffix word in the middle of a name is left alone.
    expect(
      plainCompanyName({ ...facts, name: "Group Nine Media Inc." })
    ).toBe("Group Nine Media");
    // Punctuation the strip leaves behind goes with it.
    expect(plainCompanyName({ ...facts, name: "Deere & Company" })).toBe(
      "Deere"
    );
    expect(plainCompanyName({ ...facts, name: "Apple Inc." })).toBe("Apple");
    expect(plainCompanyName({ ...facts, name: null })).toBe(facts.ticker);
  });
});

describe("the structured data says only what the page says", () => {
  const facts = makeOrdinaryFacts({ ticker: "TEST", name: "Testing Systems Inc." });
  const questions = researchQuestions({ facts, read: fairValueRead(facts, {}) });

  it("carries the same questions the page prints, and no others", () => {
    const graph = researchJsonLd({
      facts,
      title: researchTitle(facts),
      description: researchLede(facts),
      questions,
      modifiedAt: facts.fetchedAt,
    }) as { "@graph": { "@type": string; mainEntity?: { name: string }[] }[] };
    const faq = graph["@graph"].find((n) => n["@type"] === "FAQPage");
    expect(faq?.mainEntity?.map((q) => q.name)).toEqual(
      questions.map((q) => q.question)
    );
  });

  it("never types a fund or a coin as a company", () => {
    const fund = { ...facts, kind: "ETF" };
    const graph = researchJsonLd({
      facts: fund,
      title: "x",
      description: "y",
      questions: [],
      modifiedAt: null,
    }) as { "@graph": { "@type": string }[] };
    const types = graph["@graph"].map((n) => n["@type"]);
    expect(types).toContain("InvestmentFund");
    expect(types).not.toContain("Corporation");
  });

  it("cannot close the script tag that holds it", () => {
    const nasty = serializeJsonLd({ about: "</script><script>alert(1)" });
    expect(nasty).not.toContain("</script>");
    expect(JSON.parse(nasty)).toEqual({
      about: "</script><script>alert(1)",
    });
  });

  it("lists every published page on the index", () => {
    const graph = researchIndexJsonLd({ tickers: RESEARCH_TICKERS }) as {
      "@graph": { "@type": string; itemListElement?: unknown[] }[];
    };
    const list = graph["@graph"].find((n) => n["@type"] === "ItemList");
    expect(list?.itemListElement).toHaveLength(RESEARCH_TICKERS.length);
  });
});

describe("a page view can never spend a model run", () => {
  it("asks the builder not to generate, and takes no option that would", () => {
    const data = read("src/lib/research/page-data.ts");
    expect(data).toMatch(/generate: false/);
    expect(data).not.toMatch(/generate: true/);
  });

  it("keeps the segment's revalidate in step with the constant", () => {
    /*
      Next reads the segment's `revalidate` statically, so it cannot import
      the constant and the number is written in two places. This is the
      one check that keeps them the same number.
    */
    const page = read("src/app/research/[ticker]/page.tsx");
    const found = /export const revalidate = (\d+);/.exec(page);
    expect(found?.[1]).toBe(String(RESEARCH_REVALIDATE_SECONDS));
  });

  it("covers the whole list inside the store's own expiry", () => {
    /*
      The warmer is the only thing that writes these pages, and it walks
      the published list oldest first. If the list grows past what the
      schedule can cover, pages start expiring faster than they are
      written and readers begin meeting the figures-only page.

      `BRIEF_MAX_AGE_MS` is five days and `vercel.json` runs the warmer
      four times a day, so the whole list has to fit in four days of runs
      with a day of slack for the companies the feed cannot answer about.
    */
    const crons = JSON.parse(read("vercel.json")) as {
      crons: { path: string }[];
    };
    const runsPerDay = crons.crons.filter((c) =>
      c.path.startsWith("/api/cron/research-briefs")
    ).length;
    expect(runsPerDay).toBeGreaterThan(0);
    const daysToCover = RESEARCH_TICKERS.length / (runsPerDay * WARM_PER_RUN);
    expect(daysToCover).toBeLessThan(4);
  });
});

describe("bulk harvesters are refused and search crawlers are not", () => {
  it("matches a harvester however it spells itself", () => {
    expect(
      isBlockedCrawler(
        "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot"
      )
    ).toBe(true);
    expect(isBlockedCrawler("CCBot/2.0 (https://commoncrawl.org/faq/)")).toBe(
      true
    );
    expect(isBlockedCrawler("Mozilla/5.0 (compatible; AhrefsBot/7.0)")).toBe(
      true
    );
    expect(isBlockedCrawler(null)).toBe(false);
  });

  it("lets through every crawler that ends with a person reading the page", () => {
    const welcome = [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17 Safari/605.1.15 Applebot/0.1",
      "Mozilla/5.0 AppleWebKit/537.36 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)",
      "Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)",
      "facebookexternalhit/1.1",
      "Twitterbot/1.0",
      "Slackbot-LinkExpanding 1.0",
    ];
    for (const ua of welcome) {
      expect(isBlockedCrawler(ua), `${ua} was refused`).toBe(false);
    }
  });

  it("never blocks an agent it also welcomes", () => {
    for (const name of WELCOME_USER_AGENTS) {
      expect(isBlockedCrawler(name), `${name} is on both lists`).toBe(false);
    }
  });

  it("does not try to refuse a request for a name that is only a robots token", () => {
    /*
      Neither Google-Extended nor Applebot-Extended is a user agent. No
      request ever arrives calling itself one, and matching loosely on
      "Applebot" would refuse Apple's real search crawler. They belong in
      robots.txt and nowhere else, so the only thing asserted about them
      is that they are named there.
    */
    const rules = robots().rules;
    const groups = Array.isArray(rules) ? rules : [rules];
    const named = new Set(
      groups.map((r) => String(r.userAgent).toLowerCase())
    );
    for (const token of ROBOTS_ONLY_AI_TOKENS) {
      expect(named.has(token.toLowerCase()), `${token} is not in robots.txt`).toBe(
        true
      );
    }
    for (const token of BLOCKED_USER_AGENTS) {
      expect(named.has(token.toLowerCase()), `${token} is not in robots.txt`).toBe(
        true
      );
    }
    expect(isBlockedCrawler("Applebot/0.1")).toBe(false);
  });

  it("refuses a document and never an API call", () => {
    /*
      Those routes carry their own limits and their own auth, and some are
      called by schedulers and signed webhooks whose user agents nobody
      here controls. A false positive there breaks the product; on a public
      page it costs a harvester one page it was not welcome to.
    */
    const proxy = read("src/proxy.ts");
    expect(proxy).toMatch(/!isApi && isBlockedCrawler/);
  });
});
