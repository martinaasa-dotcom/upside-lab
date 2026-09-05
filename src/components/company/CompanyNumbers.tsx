"use client";

import { MicroLabel, Panel, PanelHeader, Score, Scoreboard } from "@/components/ui/Panel";
import { TermTip } from "@/components/ui/TermTip";
import { WhyThis } from "@/components/ui/WhyThis";
import { NO_VALUE, cn } from "@/lib/format";
import { companyNumbersProvenance } from "@/lib/provenance";
import type { CompanyReading } from "@/lib/company/readings";
import type { CompanyYear } from "@/lib/company/facts";
import { bigMoney } from "@/lib/company/readings";
import { BarChart3 } from "lucide-react";

/**
 * The figures, each one said twice: once as a number and once as a
 * sentence with a unit somebody can picture.
 *
 * The second half is the whole reason this panel is not a table. A table
 * of ratios is exactly what people already cannot read, and it is what
 * every other site hands them. "9.2%" teaches nobody anything; "out of
 * every $100 customers pay them, about $9 is left as profit" teaches
 * anybody, and the number is identical.
 *
 * The third line, what ordinary looks like, is printed even where the
 * figure came back empty, because a reader who cannot get this company's
 * profit margin is still better off knowing what one is.
 */

const TONE_CLASS = {
  good: "text-gain",
  watch: "text-warning",
  neutral: "text-foreground",
} as const;

function ReadingCell({ reading }: { reading: CompanyReading }) {
  const missing = reading.value === NO_VALUE;
  return (
    <Score
      label={
        reading.glossary ? (
          <TermTip term={reading.glossary}>{reading.label}</TermTip>
        ) : (
          reading.label
        )
      }
      value={reading.value}
      valueClassName={cn(
        missing ? "text-muted-foreground" : TONE_CLASS[reading.tone]
      )}
      sub={
        <>
          {reading.plain ? (
            <span className="block text-foreground">{reading.plain}</span>
          ) : (
            <span className="block text-foreground">
              The feed did not carry this one for this company, so there is
              nothing to show. It has not been estimated.
            </span>
          )}
          <span className="mt-2 block">{reading.compare}</span>
        </>
      }
    />
  );
}

/**
 * Four years of sales and profit as two bars a year.
 *
 * A single year's revenue says almost nothing; four in a row says whether
 * this is a business that is getting bigger, and that is the question
 * people are actually asking when they ask about "the finances". Drawn as
 * plain divs rather than a chart library because it is eight bars and a
 * label, and nothing here is worth a dependency or a tooltip.
 */
function HistoryBars({
  history,
  currency,
}: {
  history: CompanyYear[];
  currency: string;
}) {
  const values = history.flatMap((h) => [h.revenue ?? 0, Math.abs(h.netIncome ?? 0)]);
  const peak = Math.max(...values, 1);
  return (
    <div className="flex flex-col gap-3">
      <MicroLabel>Sales and profit, year by year</MicroLabel>
      <div className="flex items-end gap-3 sm:gap-5">
        {history.map((year) => {
          const revenue = year.revenue ?? 0;
          const profit = year.netIncome ?? 0;
          const loss = profit < 0;
          return (
            <div
              key={year.year}
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
            >
              <div className="flex h-24 w-full items-end justify-center gap-1">
                <span
                  className="w-1/3 rounded-t-sm bg-foreground/25"
                  style={{ height: `${Math.max((revenue / peak) * 100, 2)}%` }}
                  title={`Sales ${bigMoney(year.revenue, currency)}`}
                />
                <span
                  className={cn(
                    "w-1/3 rounded-t-sm",
                    loss ? "bg-loss/60" : "bg-gain/60"
                  )}
                  style={{
                    height: `${Math.max((Math.abs(profit) / peak) * 100, 2)}%`,
                  }}
                  title={`${loss ? "Loss" : "Profit"} ${bigMoney(year.netIncome, currency)}`}
                />
              </div>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {year.year}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        The grey bar is what customers paid them that year and the coloured
        one is what was left as profit, or as a loss in red. Read left to
        right: the question is whether the pairs are getting bigger.
      </p>
    </div>
  );
}

export function CompanyNumbers({
  ticker,
  readings,
  history,
  currency,
  at,
}: {
  ticker: string;
  readings: CompanyReading[];
  history: CompanyYear[];
  currency: string;
  at?: string | null;
}) {
  const filled = readings.filter((r) => r.value !== NO_VALUE).length;
  return (
    <Panel>
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2">
            The numbers, in plain words
            <WhyThis
              provenance={companyNumbersProvenance({
                ticker,
                at,
                filled,
                total: readings.length,
              })}
            />
          </span>
        }
        subtitle="Each figure, then the same thing in ordinary words, then what ordinary looks like, so every number has something to stand next to."
        icon={<BarChart3 className="h-4 w-4" />}
      />
      <Scoreboard cols={2} mobileCols={1}>
        {readings.map((r) => (
          <ReadingCell key={r.id} reading={r} />
        ))}
      </Scoreboard>
      {history.length >= 2 && (
        <HistoryBars history={history} currency={currency} />
      )}
    </Panel>
  );
}
