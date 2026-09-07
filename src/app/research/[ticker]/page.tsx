import { ResearchPage } from "@/components/research/ResearchPage";
import { loadResearchPage } from "@/lib/research/page-data";
import {
  plainCompanyName,
  researchDescription,
  researchTitle,
} from "@/lib/research/seo-copy";
import { fairValueRead } from "@/lib/company/fair-value";
import { FORECAST_YEARS } from "@/lib/forecast";
import {
  isResearchTicker,
  normalizeResearchTicker,
  researchHref,
} from "@/lib/research/universe";
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from "@/lib/seo-routes";
import { canonicalUrl } from "@/lib/site-metadata";
import { PRODUCT_NAME } from "@/lib/product";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/*
  Six hours. It has to be a literal here: Next reads this value statically,
  so `RESEARCH_REVALIDATE_SECONDS` cannot be imported into it. The two are
  written apart and `research-seo.test.ts` fails if they ever disagree.
*/
export const revalidate = 21600;

/**
 * Nothing is pre-rendered at build, and that is a decision rather than an
 * oversight.
 *
 * Listing the whole universe here would put one provider call per company
 * into every deployment, on a free tier, with the build failing if the
 * provider has a bad minute while somebody is shipping an unrelated fix.
 * What it would buy is that the first visitor to each page does not wait
 * for a render, which happens once per page per six hours and is a second
 * at worst. Every page after that is served from the cache either way.
 *
 * `dynamicParams` stays on, so a page is built the first time somebody
 * asks for it and then stands. The universe is still closed: the check
 * below is the gate, and it runs before anything is fetched.
 */
export function generateStaticParams(): { ticker: string }[] {
  return [];
}

type Props = { params: Promise<{ ticker: string }> };

/**
 * The load is shared with the page and the social image through
 * `loadResearchPage`, which is one cache entry per company, so asking for
 * the title does not cost a second trip to the provider.
 */
async function read(params: Props["params"]) {
  const { ticker: raw } = await params;
  const ticker = normalizeResearchTicker(raw ?? "");
  if (!ticker || !isResearchTicker(ticker)) return null;
  const page = await loadResearchPage(ticker);
  return page ? { ticker, page } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await read(params);
  if (!found) {
    return { title: "Research", robots: { index: false, follow: false } };
  }
  const { facts } = found.page;
  const yearOne = FORECAST_YEARS[0];
  const yearTwo = FORECAST_YEARS[1];
  const path = found.page.brief?.path;
  const fair = fairValueRead(facts, {
    modelYearOne: yearOne != null ? path?.[yearOne] ?? null : null,
    modelYearTwo: yearTwo != null ? path?.[yearTwo] ?? null : null,
  });

  const title = researchTitle(facts);
  const description = researchDescription(facts, fair);
  const url = canonicalUrl(researchHref(found.ticker));
  const image = {
    url: `${researchHref(found.ticker)}/opengraph-image`,
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    alt: `${plainCompanyName(facts)} on ${PRODUCT_NAME}`,
  };

  return {
    title,
    description,
    alternates: { canonical: url },
    /*
      Indexable, and told to use as much of the page as it likes. A page
      whose whole argument is that every figure on it is checkable has no
      reason to withhold a longer snippet: the snippet is the answer.

      The opt-out from being harvested for a model is a header rather than
      part of this, set in `next.config.ts` for the whole section, so the
      two cannot end up contradicting each other from different files.
    */
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-snippet": -1,
        "max-image-preview": "large",
        "max-video-preview": -1,
      },
    },
    openGraph: {
      title,
      description,
      url,
      siteName: PRODUCT_NAME,
      locale: "en_US",
      type: "website",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image.url],
    },
  };
}

export default async function ResearchTickerRoute({ params }: Props) {
  const found = await read(params);
  /*
    A symbol outside the published list, and a symbol the feed knows
    nothing about, are both a page that does not exist rather than a page
    that failed. Answering 404 is what keeps a crawler from coming back to
    it, and what keeps the section's URL count equal to the sitemap's.
  */
  if (!found) notFound();
  return <ResearchPage page={found.page} />;
}
