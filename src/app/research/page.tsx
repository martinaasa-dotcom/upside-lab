import { ResearchChrome } from "@/components/research/ResearchChrome";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { PRODUCT_NAME } from "@/lib/product";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { cashtag } from "@/lib/format";
import { companyName } from "@/lib/company-names";
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
          {RESEARCH_TICKERS.length} companies and funds, read the same way:
          what each does, what its accounts say and what its price assumes.
          Every figure links to where it came from.
        </p>
      </div>

      {RESEARCH_GROUPS.map((group) => (
        <Panel key={group.id}>
          <PanelHeader title={group.title} subtitle={group.blurb} />
          <ul className="flex flex-wrap gap-2">
            {group.tickers.map((ticker, i) => (
              <li
                key={ticker}
                className="wave-in"
                style={{ ["--i" as string]: Math.min(i, 12) }}
              >
                <Link
                  href={researchHref(ticker)}
                  className="card-sheen glass-well inline-flex items-baseline gap-2 rounded-lg px-3 py-1.5 text-sm text-foreground transition hover:bg-hover active:scale-[0.97] motion-reduce:active:scale-100"
                >
                  {/* The name a person searches for, with the ticker beside
                      it: "$LRCX" alone means nothing to somebody who came
                      looking for Lam Research. A fund keeps its ticker. */}
                  {companyName(ticker) ? (
                    <>
                      <span>{companyName(ticker)}</span>
                      {companyName(ticker)!.toUpperCase() !== ticker ? (
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {ticker}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {cashtag(ticker)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ))}

      <Panel>
        <PanelHeader
          title={`Why these companies and not others`}
          subtitle="A closed list of listings, not of opinions."
        />
        <p className="text-sm leading-relaxed text-muted-foreground">
          Every public page costs a data call and a model run, so the list is
          bounded: the largest listings, the names in the news, and the broad
          funds most first accounts hold. Nothing is here because anybody at{" "}
          {PRODUCT_NAME} believes in it. {ADVICE_DISCLAIMER_SHORT}
        </p>
      </Panel>
    </ResearchChrome>
  );
}
