"use client";

import { MicroLabel, Panel, PanelHeader } from "@/components/ui/Panel";
import { WhyThis } from "@/components/ui/WhyThis";
import { cashtag, cn, currency, signedPercent, signedTone } from "@/lib/format";
import { FORECAST_YEARS } from "@/lib/forecast";
import { SheetPathChart } from "@/components/ui/PathChart";
import { forecastPathProvenance } from "@/lib/provenance";
import type { ModelRun } from "@/lib/ai/model-label";
import { TrendingUp } from "lucide-react";

/**
 * The five-year path, drawn once and then listed year by year.
 *
 * Same path, same years and the same rules as the Growth room's, written
 * by the same prompt and stored in the same shared table, so the two rooms
 * cannot tell a reader two different stories about one company. Nothing in
 * this app moves the number afterwards: a path that ends below today's
 * price arrives here pointing down, which is the whole reason the floor
 * was taken out.
 *
 * The shape comes first and the numbers second, because the shape is the
 * honest part. Five prices to the cent look like a measurement; a line
 * with a quiet year in the middle of it looks like what it is.
 */

export function CompanyPath({
  ticker,
  path,
  reason,
  spot,
  code,
  at,
  model,
  sector,
  shared,
}: {
  ticker: string;
  path: Partial<Record<number, number>>;
  reason?: string;
  spot: number | null;
  code: string;
  at?: string | null;
  model?: ModelRun | null;
  sector?: string | null;
  shared?: boolean;
}) {
  const years = FORECAST_YEARS.filter((y) => (path[y] ?? 0) > 0);
  if (!spot || spot <= 0 || years.length < 2) return null;

  const points = [
    { label: "Now", value: spot },
    ...years.map((y) => ({ label: String(y), value: path[y] as number })),
  ];

  return (
    <Panel>
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2">
            Five-year price path
            <WhyThis
              provenance={forecastPathProvenance({
                ticker,
                spot,
                sector,
                at,
                model,
                fallback: shared,
              })}
            />
          </span>
        }
        subtitle="One price a year, reasoned by a language model. A sketch of a plausible path, not a measurement and not a target."
        icon={<TrendingUp className="h-4 w-4" />}
      />

      {/*
        The same chart the portfolio's own forecast draws, ticks and all.

        It was a bare sparkline with no axis, which is the one thing a
        five-year price path must not be: a reader could see that the line
        went up and could not see from what to what, so the shape carried
        no information they did not already have. Sharing the component
        also means the two rooms cannot drift into drawing one company's
        path two different ways.
      */}
      <SheetPathChart points={points} />

      <div className="flex flex-col gap-2">
        <MicroLabel>Year by year</MicroLabel>
        <ul className="glass-well divide-y divide-border overflow-hidden rounded-lg">
          <li className="flex h-10 items-center justify-between px-3">
            <span className="text-sm text-muted-foreground">Today</span>
            <span className="font-mono text-sm tabular-nums text-foreground">
              {currency(spot, 2, code)}
            </span>
          </li>
          {years.map((year) => {
            const price = path[year] as number;
            const move = (price - spot) / spot;
            return (
              <li
                key={year}
                className="flex h-10 items-center justify-between px-3"
              >
                <span className="font-mono text-sm tabular-nums text-muted-foreground">
                  End of {year}
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-sm tabular-nums text-foreground">
                    {currency(price, 2, code)}
                  </span>
                  <span
                    className={cn(
                      "w-16 text-right font-mono text-sm tabular-nums",
                      signedTone(move)
                    )}
                  >
                    {signedPercent(move)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {reason && (
        <p className="text-sm leading-relaxed text-muted-foreground">
          <span className="text-foreground">Why it goes that way: </span>
          {reason}
        </p>
      )}
      <p className="text-sm leading-relaxed text-muted-foreground">
        This is the same path {cashtag(ticker)} gets in the Growth room,
        written once and shared, and nothing in this app moves it up or down
        after the model has written it.
      </p>
    </Panel>
  );
}
