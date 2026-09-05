"use client";

import { MicroLabel, Panel, PanelHeader } from "@/components/ui/Panel";
import { WhyThis } from "@/components/ui/WhyThis";
import { companyHref } from "@/lib/company/client";
import { fundOverlap, overlapSentence } from "@/lib/company/fund-overlap";
import { fundProvenance } from "@/lib/provenance";
import { cashtag, percent } from "@/lib/format";
import type { CompanyFacts } from "@/lib/company/facts";
import { aimOnPress } from "@/lib/route-aim";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PieChart } from "lucide-react";

/**
 * What is actually inside a fund, and how much of it you already own.
 *
 * A fund is not a company, so every question this room asks about a
 * company is the wrong question here: there is no revenue, no margin and
 * no profit to price. What decides how a fund turns out is what it holds,
 * how concentrated that is, and what it charges, and the last of those is
 * on the figures panel above because it is the only number a holder
 * controls.
 *
 * The overlap line is the part I have not seen anywhere else and is the
 * reason this panel is worth having. Somebody holding Nvidia, Apple and
 * Microsoft looking at an S&P 500 fund is looking at a fund that is
 * already a fifth those three companies, and that is the exact answer to
 * "am I spreading out or doubling down". It needs both halves, the fund's
 * holdings and the reader's own, which is why no fund page anywhere shows
 * it. Nothing here judges the answer: a large overlap is fine when it is
 * deliberate.
 *
 * Every holding is a link, because a fund page whose contents you cannot
 * open is a list of tickers.
 */
export function FundInside({
  facts,
  owned,
}: {
  facts: CompanyFacts;
  /** The reader's own tickers, for the overlap line. */
  owned: string[];
}) {
  const router = useRouter();
  const holdings = facts.topHoldings;
  const sectors = facts.sectorWeights;
  if (holdings.length === 0 && sectors.length === 0) return null;

  const overlap = fundOverlap(holdings, owned);
  const sentence = overlapSentence(overlap);
  const mine = new Set(overlap?.shared.map((h) => h.symbol) ?? []);
  const topTen = holdings.reduce((sum, h) => sum + h.weight, 0);
  const peak = Math.max(...holdings.map((h) => h.weight), 0.01);

  return (
    <Panel>
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2">
            What the fund holds
            <WhyThis
              provenance={fundProvenance({
                ticker: facts.ticker,
                holdingCount: holdings.length,
                at: facts.fetchedAt,
                hasOverlap: Boolean(sentence),
              })}
            />
          </span>
        }
        subtitle={
          facts.fundCategory
            ? `A ${facts.fundCategory.toLowerCase()} fund${facts.fundFamily ? ` run by ${facts.fundFamily}` : ""}. Buying it buys a slice of everything below.`
            : "Buying this buys a slice of everything below, in these proportions."
        }
        icon={<PieChart className="h-4 w-4" />}
      />

      {holdings.length > 0 && (
        <div className="flex flex-col gap-3">
          <MicroLabel>
            Its {holdings.length} largest holdings, {percent(topTen, 0)} of the
            fund between them
          </MicroLabel>
          <ul className="glass-well overflow-hidden rounded-lg">
            {holdings.map((h) => (
              <li key={h.symbol} className="border-b border-border last:border-b-0">
                <Link
                  href={companyHref(h.symbol)}
                  onPointerDown={(e) =>
                    aimOnPress(e.nativeEvent, companyHref(h.symbol), (href) =>
                      router.push(href)
                    )
                  }
                  className="relative flex items-center gap-3 px-3 py-2 transition hover:bg-hover"
                >
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-foreground/[0.06]"
                    style={{ width: `${(h.weight / peak) * 100}%` }}
                  />
                  <span className="relative w-20 shrink-0 font-mono text-sm tabular-nums text-foreground">
                    {cashtag(h.symbol)}
                  </span>
                  <span className="relative min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {h.name}
                    {mine.has(h.symbol.toUpperCase()) && (
                      <span className="ml-2 rounded-md border border-primary/40 px-1.5 py-0.5 font-mono text-xs uppercase tracking-[0.06em] text-primary">
                        You own it
                      </span>
                    )}
                  </span>
                  <span className="relative shrink-0 font-mono text-sm tabular-nums text-foreground">
                    {percent(h.weight, 1)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sentence && (
        <div className="glass-well rounded-lg p-4 sm:p-6">
          <p className="text-sm leading-relaxed text-foreground">{sentence}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            That is not a reason to do anything either way. Owning the same
            companies twice is fine when it is on purpose, and this is only
            the way to find out whether it is.
          </p>
        </div>
      )}

      {sectors.length > 0 && (
        <div className="flex flex-col gap-3">
          <MicroLabel>Sector breakdown</MicroLabel>
          <ul className="flex flex-col gap-2">
            {sectors.map((s) => (
              <li key={s.sector} className="flex items-center gap-3">
                <span className="w-36 shrink-0 truncate text-sm text-muted-foreground">
                  {s.sector}
                </span>
                <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/10">
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 rounded-full bg-foreground/40"
                    style={{ width: `${Math.min(s.weight * 100, 100)}%` }}
                  />
                </span>
                <span className="w-12 shrink-0 text-right font-mono text-sm tabular-nums text-foreground">
                  {percent(s.weight, 0)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
