import { ResearchPage } from "@/components/research/ResearchPage";
import { SessionResumeShell } from "@/components/SessionResumeShell";
import { loadResearchPage } from "@/lib/research/page-data";
import {
  plainCompanyName,
  researchDescription,
  researchTitle,
} from "@/lib/research/seo-copy";
import { fairValueRead } from "@/lib/company/fair-value";
import { FORECAST_YEARS } from "@/lib/forecast";
import {
  isOpenResearchTicker,
  isResearchTicker,
  normalizeResearchTicker,
  researchHref,
} from "@/lib/research/universe";
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from "@/lib/seo-routes";
import { canonicalUrl } from "@/lib/site-metadata";
import { PRODUCT_NAME } from "@/lib/product";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/**
 * `/stock/<ticker>`: one company, one address, for everybody.
 *
 * This is the page a stranger, a search engine and a link preview get: the
 * whole company rendered on the server from the shared cache, so it opens
 * at once, reads in full with no script, and is indexed. The same address
 * is the research room for somebody signed in, drawn by `WorkspaceShell`
 * in the browser with the app's own header and dock and the reader's own
 * holdings beside the company (`shellRoomId`). Nobody is signed in during a
 * server render, so this is always what the HTML carries, and a signed-in
 * reader's browser swaps it for the room.
 *
 * Until it does, the root element's session hint hides this page for a
 * browser that was signed in last time and shows the same loading shell
 * every other room opens on, so a reader with an account never sees the
 * public version flash up before their own. A crawler has no such hint and
 * sees the page.
 *
 * It used to be two addresses: `/research/<ticker>` for strangers and
 * `/stock/<ticker>` for readers with an account, so the link the app
 * shared was the one a stranger could not open and the one a search
 * engine indexed was the one nobody shared. The old public address now
 * answers with a permanent redirect here (`legacyRedirectPath`).
 */

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
 *
 * `listed` is whether the company is on the published list. A company that
 * is not still gets its page, because a reader inside the app shares a link
 * to whatever they were reading and the person they sent it to has no
 * account; it is simply never indexed (see `universe.ts`).
 */
async function read(params: Props["params"]) {
  const { ticker: raw } = await params;
  const ticker = normalizeResearchTicker(raw ?? "");
  if (!ticker || !isOpenResearchTicker(ticker)) return null;
  const page = await loadResearchPage(ticker);
  return page ? { ticker, page, listed: isResearchTicker(ticker) } : null;
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
    /*
      A company on the published list is always indexed: it is kept written
      by the warmer and named in the sitemap. A company off it is indexed
      once it has a written analysis, which is the ordinary case for a link
      somebody shared, because by then the page has something of its own to
      say. Before that it is the figures alone, the same table every finance
      site carries, and asking a search engine to keep thousands of those
      would be a thin page multiplied by every symbol anybody ever opened.
      Followed either way, so the links on it still work for a crawler.
    */
    robots: found.listed || found.page.brief
      ? {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-snippet": -1,
            "max-image-preview": "large",
            "max-video-preview": -1,
          },
        }
      : { index: false, follow: true },
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
    A symbol that is not shaped like a listing, and a symbol the feed knows
    nothing about, are both a page that does not exist rather than a page
    that failed. Answering 404 is what keeps a crawler from coming back to
    it.
  */
  if (!found) notFound();
  return (
    <>
      <SessionResumeShell />
      <div data-signed-out-view>
        <ResearchPage page={found.page} />
      </div>
    </>
  );
}
