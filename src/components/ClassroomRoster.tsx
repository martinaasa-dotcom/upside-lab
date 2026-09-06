"use client";

import { htmlCell, htmlTable } from "@/components/FluidTable";

/**
 * A name and a sentence are not figures. `htmlCell` is centred `font-mono`,
 * which is exactly right for a price and reads as a serial number when it
 * holds "No reasons written yet" or somebody's name.
 */
const htmlCellName =
  "h-10 whitespace-nowrap px-1.5 py-1.5 text-left align-middle font-sans first:pl-3 last:pr-3";
import { NO_VALUE, cashtag, cn, currency, signedPercent, signedTone } from "@/lib/format";
import { Card } from "@/components/ui/Panel";
import type { Holding, Quote } from "@/lib/types";

type RosterMember = {
  id: string;
  name: string;
  isYou: boolean;
  /** A teacher watching the class rather than trading in it. */
  isTeacher?: boolean;
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
  onOpen,
}: {
  members: RosterMember[];
  startingCash: number;
  holdings: Holding[];
  quotes: Record<string, Quote>;
  ownership: { portfolio_id: string; user_id: string }[];
  onOpen: (memberId: string) => void;
}) {
  /*
    Only people who have a paper portfolio are rows.

    Measured on a real class, the teacher appeared as a student in her own
    roster reading "Ms Tamm you, n/a, n/a, n/a, n/a, n/a", and anybody who
    had joined but not started yet was five more empty cells. A row of n/a
    teaches nothing and pushes the students who did the work down the page.
    They are named in one line underneath instead, which is the actual thing
    a teacher wants to know.
  */
  const started = members.filter((m) => m.sheetCount > 0);
  /*
    A teacher with no paper portfolio has not failed to start: watching the
    class is the ordinary thing for her to be doing. Measured on a real
    class, "Ms Tamm you, n/a, n/a, n/a, n/a, n/a" sat in her own roster as
    though she were a student who had not handed anything in.
  */
  const notStarted = members.filter((m) => m.sheetCount === 0 && !m.isTeacher);
  const rows = [...started].sort((a, b) => {
    const pctA =
      startingCash > 0 ? (a.totalValue - startingCash) / startingCash : 0;
    const pctB =
      startingCash > 0 ? (b.totalValue - startingCash) / startingCash : 0;
    return pctB - pctA;
  });

  return (
    <section className="overflow-hidden rounded-xl glass ring-1 ring-foreground/20">
      <div className="border-b border-border px-6 py-6">
        <h2 className="font-semibold text-foreground">Roster</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Everyone started with the same cash. This is ranked by how far each
          student is up or down since then, and it shows who has written down a
          reason for what they own and who is holding just one company.
        </p>
      </div>
      <div className="flex flex-col gap-3 p-6 md:hidden">
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nobody has started a paper portfolio yet.
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
            const sheetIds = new Set(
              ownership
                .filter((o) => o.user_id === m.id)
                .map((o) => o.portfolio_id)
            );
            const top = topHolding(holdings, quotes, sheetIds);
            const biggest = m.topTicker
              ? { ticker: m.topTicker, weight: m.topWeight }
              : top;
            const body = (
              <Card>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-base font-semibold text-foreground">
                    {m.name}
                    {m.isYou ? (
                      <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                        (you)
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm tabular-nums text-foreground">
                    {m.sheetCount ? currency(m.totalValue) : NO_VALUE}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Since start</p>
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
        <table className={cn(htmlTable, "min-w-[30rem]")}>
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className={cn(htmlCellName, "font-medium")}>Student</th>
              <th className={cn(htmlCell, "font-medium")}>Now</th>
              <th className={cn(htmlCell, "font-medium")}>Since start</th>
              <th className={cn(htmlCell, "font-medium")}>Today</th>
              <th className={cn(htmlCell, "font-medium")}>Biggest</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className={cn(htmlCell, "h-auto py-8 text-muted-foreground")}>
                  Nobody has started a paper portfolio yet.
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
                    <td className={htmlCellName}>
                      {m.sheetCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => onOpen(m.id)}
                          className="font-medium text-foreground hover:text-foreground"
                        >
                          {m.name}
                          {m.isYou ? (
                            <span className="ml-1.5 font-normal text-muted-foreground">
                              (you)
                            </span>
                          ) : null}
                        </button>
                      ) : (
                        <span className="font-medium text-muted-foreground">
                          {m.name}
                          {m.isYou ? (
                            <span className="ml-1.5 font-normal text-muted-foreground">
                              (you)
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
                      {biggest?.ticker
                        ? `${cashtag(biggest.ticker)}${
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
      {notStarted.length > 0 ? (
        <p className="border-t border-border px-6 py-4 text-sm leading-relaxed text-muted-foreground">
          {notStarted.length === 1
            ? `${notStarted[0]!.name} has not started yet.`
            : `Not started yet: ${notStarted.map((m) => m.name).join(", ")}.`}
        </p>
      ) : null}
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
