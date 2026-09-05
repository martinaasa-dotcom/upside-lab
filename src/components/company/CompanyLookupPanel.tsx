"use client";

import { Panel, PanelHeader, MicroLabel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanySearch } from "@/components/company/CompanySearch";
import { companyHref, loadRecentCompanies } from "@/lib/company/client";
import { aimOnPress } from "@/lib/route-aim";
import { cashtag } from "@/lib/format";
import { ALWAYS_POPULAR_TICKERS } from "@/lib/popular-tickers";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * The front door to the company pages, living in Lab.
 *
 * Lab's other tabs are all whole-portfolio tools, so a per-company page
 * does not belong as a tab in its own right. What belongs here is the way
 * in: a search field, the companies this reader has already looked at, the
 * names they are watching, and a handful everybody can name for somebody
 * who has arrived with nothing in mind.
 *
 * The watchlist is why this sits in Lab rather than anywhere else. Adding
 * a name to it was, until this room existed, a thing that had no
 * consequence at all beyond a mention in the Sunday letter. Now it is a
 * list of companies with a page each.
 */

function TickerChips({
  tickers,
  label,
}: {
  tickers: string[];
  label: string;
}) {
  const router = useRouter();
  if (tickers.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <MicroLabel>{label}</MicroLabel>
      <div className="flex flex-wrap gap-2">
        {tickers.map((t) => (
          <Link
            key={t}
            href={companyHref(t)}
            onPointerDown={(e) =>
              aimOnPress(e.nativeEvent, companyHref(t), (href) =>
                router.push(href)
              )
            }
            className="touch-target rounded-md border border-border px-2.5 py-1.5 font-mono text-sm tabular-nums text-muted-foreground transition hover:bg-hover hover:text-foreground"
          >
            {cashtag(t)}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function CompanyLookupPanel({
  watchlist = [],
  owned = [],
}: {
  /** Names the reader is watching, from their own lab state. */
  watchlist?: string[];
  /** Companies they already own, so a page they can compare against is close. */
  owned?: string[];
}) {
  const [recents, setRecents] = useState<string[] | null>(null);

  useEffect(() => {
    setRecents(loadRecentCompanies());
  }, []);

  const seen = new Set<string>();
  const dedupe = (list: string[]) =>
    list
      .map((t) => t.trim().toUpperCase())
      .filter((t) => {
        if (!t || seen.has(t)) return false;
        seen.add(t);
        return true;
      });

  const recentChips = dedupe(recents ?? []);
  // Capped like the others. A long watchlist would otherwise put four rows
  // of chips above the three that are meant to be browsed.
  const watchChips = dedupe(watchlist).slice(0, 12);
  const ownedChips = dedupe(owned).slice(0, 10);
  const popularChips = dedupe([...ALWAYS_POPULAR_TICKERS]).slice(0, 8);

  return (
    <Panel>
      <PanelHeader
        title="Look up a company"
        subtitle="Type any company and get the whole picture in plain words: what they do, what the finances look like, what several different methods say it is worth, and both sides of the argument. You do not have to own it, and nothing changes in your portfolio."
        icon={<Search className="h-4 w-4" />}
      />
      <CompanySearch placeholder="Apple, NVDA, an index fund, anything" />
      {recents === null ? (
        <Skeleton className="h-8 w-64" aria-hidden />
      ) : (
        <TickerChips tickers={recentChips} label="You looked at" />
      )}
      <TickerChips tickers={watchChips} label="You are watching" />
      <TickerChips tickers={ownedChips} label="You already own" />
      <TickerChips tickers={popularChips} label="Companies everybody knows" />
    </Panel>
  );
}
