import { PANEL_STACK, Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/skeleton";
import { ResearchChrome } from "@/components/research/ResearchChrome";

/**
 * What a reader sees while a research page is still being built.
 *
 * Most visits never reach this: the page is served from the CDN's own
 * six-hour cache (`RESEARCH_REVALIDATE_SECONDS`) and the underlying figures
 * and brief are a shared cache behind that, so a company somebody else has
 * already looked up answers instantly. This is only for the first visit to
 * a company in a cache window, or a cold cache after a deploy, and it is
 * the App Router's own Suspense boundary for the route segment, so it
 * appears the instant the click lands rather than after the server render
 * finishes.
 *
 * It stands in for `ResearchPage`'s own shape rather than a generic
 * spinner, because a reader who has seen the real page once recognises
 * where each panel is going to land, and because a skeleton meaningfully
 * shorter than the page it stands in for is its own layout shift: the
 * page grows underneath the reader's scroll position the moment the real
 * content lands.
 *
 * THE HEIGHTS ARE MEASURED, NOT GUESSED. A first pass sized every panel
 * off reading the JSX, which is exactly the mistake this repository's
 * own account of the real research room warns against ("render the
 * component and measure it"): it came out at 3,375px against a real
 * page, measured the same way, of 7,334px -- less than half. Rendered
 * the real `ResearchPage` for a real ticker (AAPL, no brief -- this
 * sandbox has no database, which is also the common case this specific
 * route serves: the public page never generates, so most cache misses
 * land here before the cron has written an argument) and read each
 * panel's own `getBoundingClientRect` at 1000px wide: hero 385px, the
 * four questions 1,060, valuation 730, key financials 840, the business
 * 1,170, questions people ask 873, sources 1,086, the closing CTA 328.
 * Every height below comes from one of those, minus this shell's own
 * measured padding and heading overhead, and the whole skeleton was
 * then re-measured the same way against the same real page: 7,105px,
 * 3.1% short rather than 54%.
 *
 * `CompanyCases` and `CompanyPath` are deliberately absent. Both need a
 * written brief, and the brief-less state measured above is what this
 * route actually shows on the large majority of its own cache misses,
 * by the caching rule this file's docstring already states: a company
 * with a brief is normally served from cache without ever reaching this
 * component. Guessing their height for the minority case would have
 * cost accuracy on the case that matters more; a rarer, brief-having
 * page arriving shorter than its own skeleton is the smaller fault.
 * Nothing here reads a ticker, so it cannot say anything false about one.
 *
 * EVERY BAR IS A BARE `Skeleton`, NEVER `PanelHeader`'S OWN `title` OR
 * `subtitle`. A first version put a `Skeleton` (a `div`) into those
 * props, which render inside an `h2` and a `p`. The browser's own HTML
 * parser closes a `<p>` the moment it meets a block element, so the
 * div-in-p case reparented under real Chromium and React's hydration
 * diff caught the server and client disagreeing about the tree, right
 * there in the console -- found by actually loading the page, not by
 * reading the markup, which looks perfectly fine either way. `StockRoom`'s
 * own `HeroSkeleton` already had the answer: plain `Skeleton` bars,
 * `aria-hidden`, never inside a component's typographic slots.
 */

/** One "questions" panel: several stacked heading-and-paragraph answers. */
function QaPanelSkeleton({
  rows,
  rowHeight,
}: {
  rows: number;
  rowHeight: number;
}) {
  return (
    <Panel>
      <Skeleton className="h-5 w-48" />
      <div className="flex flex-col gap-5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-64 max-w-full" />
            <Skeleton className="w-full" style={{ height: rowHeight }} />
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default function ResearchTickerLoading() {
  return (
    <ResearchChrome>
      {/*
        * The skeleton stacks like the page it becomes.
        *
        * It stacked its panels at 24px while the loaded page uses the
        * shared 32 stepping to 40, so every panel slid down the moment the
        * real content arrived. That is a layout jump on the one page a
        * stranger from a search result lands on, and the whole point of a
        * skeleton is that nothing moves when it is replaced.
        */}
      <div aria-hidden className={PANEL_STACK}>
        <Skeleton className="h-4 w-40" />

        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-64 max-w-full" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>

        {/* Hero: name, badges, what the company does. Measured 385px. */}
        <Panel>
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-6 w-48 max-w-full" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-52 w-full" />
        </Panel>

        {/* The four questions: one panel, four stacked answers. 1,060px. */}
        <QaPanelSkeleton rows={4} rowHeight={210} />

        {/* Valuation: the picture, then the methods below it. 730px. */}
        <Panel>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-64 w-full" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </Panel>

        {/* Key financials: a 3x3 scoreboard of nine readings. 840px. */}
        <Panel>
          <Skeleton className="h-5 w-36" />
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 9 }, (_, i) => (
              <Skeleton key={i} className="h-60 w-full" />
            ))}
          </div>
        </Panel>

        {/* The business: period bars, then margins and results days. 1,170px. */}
        <Panel>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-[650px] w-full" />
          <Skeleton className="h-[400px] w-full" />
        </Panel>

        {/* Questions people ask: the same shape as the four questions. 873px. */}
        <QaPanelSkeleton rows={4} rowHeight={165} />

        {/* Sources: article cards, then the primary-source links. 1,086px. */}
        <Panel>
          <Skeleton className="h-5 w-24" />
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[290px] w-full" />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-[350px] w-full" />
            <Skeleton className="h-[350px] w-full" />
          </div>
        </Panel>

        {/* The closing CTA. 328px. */}
        <Panel>
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-56 w-full" />
        </Panel>
      </div>
    </ResearchChrome>
  );
}
