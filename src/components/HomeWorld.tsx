"use client";

import { Card, MicroLabel, Panel, PanelHeader } from "@/components/ui/Panel";
import { cn, currency, signedCurrency, signedTone } from "@/lib/format";
import {
  fundDayNumber,
  liveFundTodayMove,
  liveFundTotalValue,
} from "@/lib/margus-fund-mark";
import { stripReportSerialPrefix } from "@/lib/fund-copy";
import { loadUpsidePortfolioCache } from "@/lib/upside-portfolio-cache";
import {
  loadCommunityListCache,
  prefetchCommunityList,
  saveCommunityListCache,
} from "@/lib/community-cache";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import { ArrowRight, Bot, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type FundTeaser = {
  totalValue: number;
  todayDollar: number;
  todayPct: number | null;
  headline: string | null;
  dayNumber: number;
  openCount: number;
};

type CommunityRow = {
  id: string;
  name: string;
  role: string;
};

function teaserFromFundCache(): FundTeaser | null {
  const cached = loadUpsidePortfolioCache()?.payload as
    | {
        fund?: { cash?: number; inception_date?: string; starting_capital?: number };
        holdings?: Array<{
          ticker: string;
          shares: number;
          cost_basis: number;
          status?: string;
        }>;
        reports?: Array<{
          headline?: string;
          portfolio_value?: number;
          cash?: number;
        }>;
        quotes?: Record<string, { price?: number }>;
      }
    | undefined;
  if (!cached?.fund) return null;
  const open = (cached.holdings ?? []).filter(
    (h) => !h.status || h.status === "open"
  );
  const latest = cached.reports?.[0];
  const cash = latest?.cash ?? cached.fund.cash ?? 0;
  const totalValue = liveFundTotalValue({
    cash,
    holdings: open,
    quotes: cached.quotes ?? {},
  });
  const { todayDollar, todayPct } = liveFundTodayMove({
    liveTotal: totalValue,
    lastReportValue: latest?.portfolio_value,
  });
  return {
    totalValue,
    todayDollar,
    todayPct,
    headline: stripReportSerialPrefix(latest?.headline?.trim() || "") || null,
    dayNumber: fundDayNumber(cached.fund.inception_date),
    openCount: open.length,
  };
}

/**
 * Fund + Circle on Overview. Not a second hero, not a one-line
 * afterthought. These are rooms people come back for.
 */
export function HomeWorld({
  className,
}: {
  className?: string;
}) {
  const [fund, setFund] = useHydratedCache<FundTeaser | null>(
    teaserFromFundCache,
    null
  );
  const [communities, setCommunities] = useHydratedCache<CommunityRow[] | null>(
    () => loadCommunityListCache(),
    null
  );
  const [communitiesError, setCommunitiesError] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/upside-portfolio/teaser", {
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as FundTeaser;
        if (!ctrl.signal.aborted && Number.isFinite(data.totalValue)) {
          setFund(data);
        }
      } catch {
        /* keep cache / empty card */
      }
    })();
    return () => {
      ctrl.abort();
    };
  }, [setFund]);

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/communities", { signal: ctrl.signal });
        if (!res.ok) {
          if (!ctrl.signal.aborted) setCommunitiesError(true);
          return;
        }
        const data = await res.json();
        if (!ctrl.signal.aborted) {
          const rows = (data.communities ?? []) as CommunityRow[];
          setCommunitiesError(false);
          setCommunities(rows);
          saveCommunityListCache(rows);
          prefetchCommunityList(rows);
        }
      } catch {
        if (!ctrl.signal.aborted) setCommunitiesError(true);
      }
    })();
    return () => {
      ctrl.abort();
    };
  }, [setCommunities]);

  const primary = communities?.[0];
  const communityHref = primary ? `/communities/${primary.id}` : "/communities";
  const communityTitle = primary
    ? communities && communities.length > 1
      ? `${primary.name} and ${communities.length - 1} more`
      : primary.name
    : "Start a circle";
  const communityDetail = primary
    ? "See their portfolios as they are today. You can look, not edit."
    : "Invite people you trust.";

  return (
    <Panel className={cn("overview-fade", className)}>
      <PanelHeader
        title="Around Upside Lab"
        icon={<Users className="h-4 w-4" />}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/upside-portfolio" prefetch className="group block h-full">
          <Card
            tone="brand"
            interactive
            className="h-full transition group-hover:bg-hover"
          >
            <div className="flex items-start justify-between gap-3">
              <MicroLabel>
                <Bot className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                Upside Fund
              </MicroLabel>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
            </div>
            {fund ? (
              <>
                <p className="mt-2 text-lg font-semibold tabular-nums text-foreground">
                  {currency(fund.totalValue, 0)}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-sm tabular-nums",
                    signedTone(fund.todayDollar, "text-muted-foreground")
                  )}
                >
                  {signedCurrency(fund.todayDollar)} today
                  {fund.openCount > 0
                    ? ` · ${fund.openCount} open`
                    : ""}
                  {` · day ${fund.dayNumber}`}
                </p>
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                  {fund.headline ??
                    "Paper money, and one decision a day."}
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 text-base font-semibold text-foreground">
                  Watch Margus trade
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  A paper portfolio run in public.
                </p>
              </>
            )}
          </Card>
        </Link>

        <Link href={communityHref} prefetch className="group block h-full">
          <Card
            interactive
            className="h-full transition group-hover:bg-hover"
          >
            <div className="flex items-start justify-between gap-3">
              <MicroLabel>
                <Users className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                Circle
              </MicroLabel>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
            </div>
            <p className="mt-2 text-base font-semibold text-foreground">
              {communitiesError
                ? "Couldn't load circles"
                : communities === null
                  ? "Your circles"
                  : communityTitle}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              {communitiesError
                ? "Open the page to try again."
                : communities === null
                  ? "Compare portfolios with people you actually know."
                  : communityDetail}
            </p>
          </Card>
        </Link>
      </div>
    </Panel>
  );
}
