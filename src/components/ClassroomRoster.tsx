"use client";

import { htmlCell, htmlTable } from "@/components/FluidTable";
import { NO_VALUE, cashtag, cn, currency, signedPercent, signedTone } from "@/lib/format";
import { Card } from "@/components/ui/Panel";
import type { ThesisCoverage } from "@/lib/classroom";
import type { Holding, Quote } from "@/lib/types";

type RosterMember = {
  id: string;
  name: string;
  isYou: boolean;
  sheetCount: number;
  totalValue: number;
  todayDollar: number;
  todayPct: number | null;
  topTicker: string | null;
  topWeight: number | null;
};

export function ClassroomRoster({
  members,
  startingCash,
  holdings,
  quotes,
  ownership,
  thesisCoverage,
  onOpen,
}: {
  members: RosterMember[];
  startingCash: number;
  holdings: Holding[];
  quotes: Record<string, Quote>;
  ownership: { portfolio_id: string; user_id: string }[];
  thesisCoverage: Record<string, ThesisCoverage>;
  onOpen: (memberId: string) => void;
}) {
  const rows = [...members].sort((a, b) => {
    const pctA =
      a.sheetCount && startingCash > 0
        ? (a.totalValue - startingCash) / startingCash
        : Number.NEGATIVE_INFINITY;
    const pctB =
      b.sheetCount && startingCash > 0
        ? (b.totalValue - startingCash) / startingCash
        : Number.NEGATIVE_INFINITY;
    return pctB - pctA;
  });

  return (
    <section className="overflow-hidden rounded-xl glass ring-1 ring-foreground/20">
      <div className="border-b border-border px-6 py-6">
        <h2 className="font-semibold text-foreground">Roster</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Same start. Ranked by percent vs start. Who wrote a why, who is all-in on one name.
        </p>
      </div>
      <div className="flex flex-col gap-3 p-6 md:hidden">
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nobody in the class yet.
          </p>
        ) : (
          rows.map((m) => {
            const vsStart = m.sheetCount
              ? m.totalValue - startingCash
              : null;
            const vsStartPct =
              vsStart != null && startingCash > 0
                ? vsStart / startingCash
                : null;
            const thesis = thesisCoverage[m.id];
            const sheetIds = new Set(
              ownership
                .filter((o) => o.user_id === m.id)
                .map((o) => o.portfolio_id)
            );
            const top = topHolding(holdings, quotes, sheetIds);
            const biggest = m.topTicker
              ? { ticker: m.topTicker, weight: m.topWeight }
              : top;
            const why =
              !m.sheetCount
                ? NO_VALUE
                : !thesis || thesis.names === 0
                  ? "No names yet"
                  : thesis.withWhy === 0
                    ? "No why yet"
                    : `${thesis.withWhy} of ${thesis.names}`;
            const body = (
              <Card>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-base font-semibold text-foreground">
                    {m.name}
                    {m.isYou ? (
                      <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                        you
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm tabular-nums text-foreground">
                    {m.sheetCount ? currency(m.totalValue) : NO_VALUE}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">vs start</p>
                    <p
                      className={`font-semibold tabular-nums ${
                        vsStart == null ? "text-muted-foreground" : signedTone(vsStart)
                      }`}
                    >
                      {vsStartPct == null ? NO_VALUE : signedPercent(vsStartPct)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Today</p>
                    <p
                      className={`font-semibold tabular-nums ${
                        m.sheetCount ? signedTone(m.todayPct) : "text-muted-foreground"
                      }`}
                    >
                      {m.sheetCount && m.todayPct != null
                        ? signedPercent(m.todayPct)
                        : NO_VALUE}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Why</p>
                    <p className="text-muted-foreground">{why}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Biggest</p>
                    <p className="text-muted-foreground">
                      {biggest?.ticker
                        ? `${cashtag(biggest.ticker)}${
                            biggest.weight != null
                              ? ` · ${Math.round(biggest.weight)}%`
                              : ""
                          }`
                        : NO_VALUE}
                    </p>
                  </div>
                </div>
              </Card>
            );
            return m.sheetCount > 0 ? (
              <button
                key={m.id}
                type="button"
                onClick={() => onOpen(m.id)}
                className="block w-full text-left"
              >
                {body}
              </button>
            ) : (
              <div key={m.id}>{body}</div>
            );
          })
        )}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className={cn(htmlTable, "min-w-[36rem]")}>
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className={cn(htmlCell, "font-medium")}>Student</th>
              <th className={cn(htmlCell, "font-medium")}>Now</th>
              <th className={cn(htmlCell, "font-medium")}>vs start</th>
              <th className={cn(htmlCell, "font-medium")}>Today</th>
              <th className={cn(htmlCell, "font-medium")}>Why</th>
              <th className={cn(htmlCell, "font-medium")}>Biggest</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className={cn(htmlCell, "h-auto py-8 text-muted-foreground")}>
                  Nobody in the class yet.
                </td>
              </tr>
            ) : (
              rows.map((m) => {
                const vsStart = m.sheetCount
                  ? m.totalValue - startingCash
                  : null;
                const vsStartPct =
                  vsStart != null && startingCash > 0
                    ? vsStart / startingCash
                    : null;
                const thesis = thesisCoverage[m.id];
                const sheetIds = new Set(
                  ownership
                    .filter((o) => o.user_id === m.id)
                    .map((o) => o.portfolio_id)
                );
                const top = topHolding(holdings, quotes, sheetIds);
                const biggest = m.topTicker
                  ? { ticker: m.topTicker, weight: m.topWeight }
                  : top;
                return (
                  <tr
                    key={m.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className={htmlCell}>
                      {m.sheetCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => onOpen(m.id)}
                          className="font-medium text-foreground hover:text-foreground"
                        >
                          {m.name}
                          {m.isYou ? (
                            <span className="ml-1.5 font-normal text-muted-foreground">
                              you
                            </span>
                          ) : null}
                        </button>
                      ) : (
                        <span className="font-medium text-muted-foreground">
                          {m.name}
                          {m.isYou ? (
                            <span className="ml-1.5 font-normal text-muted-foreground">
                              you
                            </span>
                          ) : null}
                        </span>
                      )}
                    </td>
                    <td className={cn(htmlCell, "tabular-nums text-foreground")}>
                      {m.sheetCount ? currency(m.totalValue) : NO_VALUE}
                    </td>
                    <td
                      className={cn(
                        htmlCell,
                        "font-semibold tabular-nums",
                        vsStart == null ? "text-muted-foreground" : signedTone(vsStart)
                      )}
                    >
                      {vsStartPct == null ? NO_VALUE : signedPercent(vsStartPct)}
                    </td>
                    <td
                      className={cn(
                        htmlCell,
                        "font-semibold tabular-nums",
                        m.sheetCount ? signedTone(m.todayPct) : "text-muted-foreground"
                      )}
                    >
                      {m.sheetCount && m.todayPct != null
                        ? signedPercent(m.todayPct)
                        : NO_VALUE}
                    </td>
                    <td className={cn(htmlCell, "text-muted-foreground")}>
                      {!m.sheetCount
                        ? NO_VALUE
                        : !thesis || thesis.names === 0
                          ? "No names yet"
                          : thesis.withWhy === 0
                            ? "No why yet"
                            : `${thesis.withWhy} of ${thesis.names}`}
                    </td>
                    <td className={cn(htmlCell, "text-muted-foreground")}>
                      {biggest?.ticker
                        ? `${biggest.ticker}${
                            biggest.weight != null
                              ? ` · ${Math.round(biggest.weight)}%`
                              : ""
                          }`
                        : NO_VALUE}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function topHolding(
  holdings: Holding[],
  quotes: Record<string, Quote>,
  sheetIds: Set<string>
): { ticker: string; weight: number } | null {
  const mine = holdings.filter((h) => sheetIds.has(h.portfolio_id));
  if (!mine.length) return null;
  const values = mine.map((h) => ({
    ticker: h.ticker,
    value: h.shares * (quotes[h.ticker]?.price ?? 0),
  }));
  const total = values.reduce((s, v) => s + v.value, 0);
  const top = [...values].sort((a, b) => b.value - a.value)[0];
  if (!top || total <= 0) return null;
  return { ticker: top.ticker, weight: (top.value / total) * 100 };
}
