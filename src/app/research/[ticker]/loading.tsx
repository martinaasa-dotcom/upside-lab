import { Panel, PanelHeader } from "@/components/ui/Panel";
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
 * where each panel is going to land: the price plan first, then a strip of
 * panel-shaped blocks in the order the real ones arrive. Nothing here
 * reads a ticker, so it cannot say anything false about one.
 */
export default function ResearchTickerLoading() {
  return (
    <ResearchChrome>
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Skeleton className="h-4 w-40" />
      </nav>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-64 max-w-full" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>

      <Panel>
        <PanelHeader
          hero
          title={<Skeleton className="h-6 w-48" />}
          subtitle={<Skeleton className="h-4 w-72 max-w-full" />}
        />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </Panel>

      <Panel>
        <PanelHeader title={<Skeleton className="h-5 w-40" />} />
        <Skeleton className="h-[380px] w-full" />
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>

      {[0, 1, 2].map((i) => (
        <Panel key={i}>
          <PanelHeader title={<Skeleton className="h-5 w-56" />} />
          <Skeleton className="h-40 w-full" />
        </Panel>
      ))}
    </ResearchChrome>
  );
}
