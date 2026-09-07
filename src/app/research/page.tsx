import { ResearchChrome } from "@/components/research/ResearchChrome";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { PRODUCT_NAME } from "@/lib/product";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { cashtag } from "@/lib/format";
import {
  RESEARCH_GROUPS,
  RESEARCH_TICKERS,
  researchHref,
} from "@/lib/research/universe";
import {
  researchIndexJsonLd,
  serializeJsonLd,
} from "@/lib/research/structured-data";
import { publicPageMetadata } from "@/lib/site-metadata";
import Link from "next/link";

/*
  Nothing on this page changes between deploys: it is a list of constants
  in this repository. `false` is Next's own way of saying so, and it makes
  the page static for a year rather than rebuilding it on a clock for no
  reason.
*/
export const revalidate = false;

export const metadata = publicPageMetadata({
  title: "Research",
  description: `Plain-English research on ${RESEARCH_TICKERS.length} companies and funds. What each one does, what the accounts say, what the price is assuming, and both sides of the argument. Every figure named, with a link to where it came from.`,
  path: "/research",
  ogTitle: `Research · ${PRODUCT_NAME}`,
});

/**
 * The way in, and the only page that links to all of them.
 *
 * A hundred company pages that only link to a handful of neighbours each
 * are a hundred pages a crawler finds slowly and in no particular order.
 * One index that names every one of them, linked from the footer of every
 * public page and listed in the sitemap, is what makes the section a
 * single reachable thing rather than a scattering.
 *
 * It is grouped rather than alphabetical because the groups are how a
 * person browses: somebody who came for one chip company is far more
 * likely to want the next chip company than the next name in the alphabet.
 */
export default function ResearchIndex() {
  return (
    <ResearchChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            researchIndexJsonLd({ tickers: RESEARCH_TICKERS })
          ),
        }}
      />

      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold tracking-[-0.035em] text-balance text-foreground">
          Research
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {RESEARCH_TICKERS.length} companies and funds, each one written the
          same way: what it does, what the accounts say, what the price is
          assuming, and both sides of the argument. Every figure is the real
          one, named properly, with a plain sentence under it and a link back
          to where it came from. Nothing here is a rating, a score or a
          recommendation.
        </p>
      </div>

      {RESEARCH_GROUPS.map((group) => (
        <Panel key={group.id}>
          <PanelHeader title={group.title} subtitle={group.blurb} />
          <ul className="flex flex-wrap gap-2">
            {group.tickers.map((ticker) => (
              <li key={ticker}>
                <Link
                  href={researchHref(ticker)}
                  className="inline-flex rounded-md border border-border px-3 py-1.5 font-mono text-sm tabular-nums text-muted-foreground transition hover:bg-hover hover:text-foreground"
                >
                  {cashtag(ticker)}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ))}

      <Panel>
        <PanelHeader
          title={`Why these companies and not others`}
          subtitle="The list is closed on purpose, and it is a list of listings rather than of opinions."
        />
        <p className="text-sm leading-relaxed text-muted-foreground">
          A public page costs a call to a data provider and a run of a model
          to write, so an open front door on every symbol anybody can type
          would be unbounded in both. The test for being on this list is
          whether an ordinary person might plausibly type the name into a
          search box, which is why it is the largest listings, the names that
          carry the news, and the broad funds most first accounts hold.
          Nothing is here because anybody at {PRODUCT_NAME} believes in it,
          and nothing is missing because anybody does not.{" "}
          {ADVICE_DISCLAIMER_SHORT}
        </p>
      </Panel>
    </ResearchChrome>
  );
}
