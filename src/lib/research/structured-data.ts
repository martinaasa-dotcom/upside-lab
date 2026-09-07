/**
 * The machine-readable copy of what the page already says.
 *
 * One rule runs through all of it: **nothing goes in here that is not on
 * the page in words.** Structured data that says something the reader
 * cannot see is the oldest trick in this field and it is dishonest in
 * exactly the way this product is built not to be, quite apart from being
 * the thing search engines penalise hardest.
 *
 * Deliberately not `Article`. These pages are not articles, they are a
 * company's figures with an argument attached, and typing them as
 * journalism to collect a richer result would be a claim about what they
 * are. `WebPage` with the company as its subject is what they actually
 * are, and `FAQPage` is exactly true of the question block at the foot.
 *
 * One script tag holding a `@graph`, rather than three tags, because the
 * nodes reference each other and a graph is how that is expressed.
 */
import type { CompanyFacts } from "@/lib/company/facts";
import { isCryptoLike, isFundLike } from "@/lib/company/facts";
import { PRODUCT_NAME, PRODUCT_ORIGIN } from "@/lib/product";
import { researchHref } from "@/lib/research/universe";
import type { ResearchQuestion } from "@/lib/research/seo-copy";
import { plainCompanyName } from "@/lib/research/seo-copy";

type Node = Record<string, unknown>;

/**
 * `<` escaped, because a JSON string carrying one closes the script tag
 * that holds it. Nothing in these fields is written by a stranger, but the
 * company's own filed description of itself is, and that is enough.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function siteNode(origin: string): Node {
  return {
    "@type": "WebSite",
    "@id": `${origin}/#website`,
    url: origin,
    name: PRODUCT_NAME,
    publisher: { "@id": `${origin}/#publisher` },
  };
}

function publisherNode(origin: string): Node {
  return {
    "@type": "Organization",
    "@id": `${origin}/#publisher`,
    name: PRODUCT_NAME,
    url: origin,
  };
}

/**
 * The company itself.
 *
 * A fund is not a `Corporation` and a coin is neither, so each gets the
 * type that is true of it. Getting this wrong is the same mistake the
 * valuation panel refuses to make one level up: running a company's
 * questions on something that is not a company.
 */
function subjectNode(facts: CompanyFacts, origin: string): Node {
  const url = `${origin}${researchHref(facts.ticker)}`;
  const shared: Node = {
    "@id": `${url}#subject`,
    name: plainCompanyName(facts),
    alternateName: facts.name ?? undefined,
    tickerSymbol: facts.ticker,
    identifier: facts.ticker,
  };
  if (isCryptoLike(facts)) {
    return { "@type": "Thing", ...shared };
  }
  if (isFundLike(facts)) {
    return {
      "@type": "InvestmentFund",
      ...shared,
      description: facts.fundCategory ?? undefined,
    };
  }
  return {
    "@type": "Corporation",
    ...shared,
    description: facts.about ?? undefined,
    url: facts.website ?? undefined,
    numberOfEmployees: facts.employees ?? undefined,
    industry: facts.industry ?? undefined,
  };
}

export function researchJsonLd(input: {
  facts: CompanyFacts;
  title: string;
  description: string;
  questions: ResearchQuestion[];
  /** When the figures on the page were taken. */
  modifiedAt: string | null;
  origin?: string;
}): unknown {
  const origin = input.origin ?? PRODUCT_ORIGIN;
  const url = `${origin}${researchHref(input.facts.ticker)}`;
  const graph: Node[] = [
    publisherNode(origin),
    siteNode(origin),
    subjectNode(input.facts, origin),
    {
      "@type": "WebPage",
      "@id": `${url}#page`,
      url,
      name: input.title,
      description: input.description,
      isPartOf: { "@id": `${origin}/#website` },
      about: { "@id": `${url}#subject` },
      dateModified: input.modifiedAt ?? undefined,
      inLanguage: "en",
      breadcrumb: { "@id": `${url}#crumbs` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#crumbs`,
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: PRODUCT_NAME,
          item: origin,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Research",
          item: `${origin}/research`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: `${input.facts.ticker}`,
          item: url,
        },
      ],
    },
  ];

  if (input.questions.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#questions`,
      mainEntity: input.questions.map((q) => ({
        "@type": "Question",
        name: q.question,
        acceptedAnswer: { "@type": "Answer", text: q.answer },
      })),
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

/** The index page: a plain list, so a crawler meets every page at once. */
export function researchIndexJsonLd(input: {
  tickers: readonly string[];
  origin?: string;
}): unknown {
  const origin = input.origin ?? PRODUCT_ORIGIN;
  return {
    "@context": "https://schema.org",
    "@graph": [
      publisherNode(origin),
      siteNode(origin),
      {
        "@type": "CollectionPage",
        "@id": `${origin}/research#page`,
        url: `${origin}/research`,
        name: `Research · ${PRODUCT_NAME}`,
        isPartOf: { "@id": `${origin}/#website` },
        inLanguage: "en",
      },
      {
        "@type": "ItemList",
        "@id": `${origin}/research#list`,
        numberOfItems: input.tickers.length,
        itemListElement: input.tickers.map((ticker, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: ticker,
          url: `${origin}${researchHref(ticker)}`,
        })),
      },
    ],
  };
}
