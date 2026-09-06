"use client";

import Link from "next/link";
import { Card, MicroLabel, Panel, PanelHeader } from "@/components/ui/Panel";
import { WhyThis } from "@/components/ui/WhyThis";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { cashtag, cn, currency, percent } from "@/lib/format";
import { bandMapProvenance } from "@/lib/provenance";
import { companyHref } from "@/lib/company/client";
import { actionableFirst, type BandMapPoint } from "@/lib/company/band-map";
import { BellRing, ChevronRight } from "lucide-react";

/**
 * The names whose price has reached one of the ends of their own plan.
 *
 * Home's job here is to say which names are worth opening, not to say
 * what to do about them: each row is the name, the band that name's own
 * plan files it under, the price, and the level it reached, and pressing
 * it opens that company's page where the whole ladder is, with every
 * level editable. Nothing on this card is phrased as an instruction and
 * nothing here is scored.
 *
 * The middle of a ladder is deliberately absent. A price sitting in the
 * band a plan calls "hold, nothing new" is the ordinary case, and a list
 * that included it would be the portfolio again, which Home already has.
 */
export function BandAlerts({
  points,
  code = "USD",
  at,
  max = 6,
}: {
  points: BandMapPoint[];
  code?: string;
  at?: string | null;
  max?: number;
}) {
  const reached = actionableFirst(points);
  if (reached.length === 0) return null;
  const shown = reached.slice(0, max);

  return (
    <Panel className="overview-fade">
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2">
            Prices that reached a level you planned
            <WhyThis provenance={bandMapProvenance({ count: points.length, at })} />
          </span>
        }
        subtitle={
          reached.length === 1
            ? "One of your holdings is at an end of its own price plan. Open it to see where exactly, and to change the level."
            : `${reached.length} of your holdings are at an end of their own price plans. Open one to see where exactly, and to change the level.`
        }
        icon={<BellRing className="h-4 w-4" />}
      />

      <div className="flex flex-col gap-2">
        {shown.map((p) => (
          <Link
            key={p.ticker}
            href={companyHref(p.ticker)}
            className="group block rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
          >
            <Card
              className={cn(
                // The accent marks a level reached, and nothing here uses
                // the gain and loss pair: those mean money made and money
                // lost, and a name at the top of its plan is usually one
                // in profit, so rose on it would read as a loss.
                "flex items-center gap-3 border-l-2 border-l-primary/60 p-4 transition group-hover:bg-hover"
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-foreground">
                  <span className="font-mono font-semibold tabular-nums">
                    {cashtag(p.ticker)}
                  </span>
                  <span className="text-muted-foreground">{p.bandLabel}</span>
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {currency(p.spot, 2, code)} today
                  {p.edge !== null
                    ? `, against the ${currency(p.edge, 2, code)} level of ${
                        p.edited
                          ? "the plan you set"
                          : "the plan this app worked out and you have not changed"
                      }`
                    : ""}
                  . {percent(p.share, 1)} of what you own.
                </p>
              </div>
              <ChevronRight
                aria-hidden
                className="h-4 w-4 shrink-0 text-muted-foreground"
              />
            </Card>
          </Link>
        ))}
      </div>

      {reached.length > shown.length && (
        <MicroLabel>
          {reached.length - shown.length} more on the holdings page
        </MicroLabel>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        A level being reached is a fact about a price, not a reason to do
        anything. {ADVICE_DISCLAIMER_SHORT}
      </p>
    </Panel>
  );
}
