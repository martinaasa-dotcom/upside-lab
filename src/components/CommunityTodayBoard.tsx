"use client";

import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { RankMedal } from "@/components/RankMedal";
import { MicroLabel, Panel, PanelHeader } from "@/components/ui/Panel";
import {
  barFillPct,
  cn,
  currency,
  NO_VALUE,
  signedCurrency,
  signedPercent,
  signedTone,
} from "@/lib/format";
import { Trophy } from "lucide-react";
import { Fragment } from "react";
import type { MemberStat } from "@/components/community-types";

/**
 * A circle ranks people by how their day went, in percent, with the money
 * beside it.
 *
 * The ranking is the percent and only the percent, because it is the only
 * figure that compares a first job to a pension, which is exactly who is in
 * a family circle together. The dollar column is a second reading of the
 * same day rather than a second ordering of the people: it sits after the
 * percent, in a fixed width so a wide figure cannot shove the column it
 * follows, and it is hidden below `sm`, where 358px of row has no space for
 * two numbers and a name.
 *
 * The percent carries its sign (`signedPercent`), which it did not: a good
 * day printed "1.2%" beside every loss printing "-0.8%", so the winning row
 * was the only one on the board without a sign on it.
 */
export type CircleTotals = {
  todayPct: number | null;
  todayDollar: number;
  totalValue: number;
  cash: number;
};

export function CommunityTodayBoard({
  members,
  onOpen,
  totals,
}: {
  members: MemberStat[];
  onOpen: (id: string) => void;
  /**
   * What the circle holds between it. The board is the room's lead now:
   * the three cards that used to stand above it said the day, the total
   * and the cash in three boxes the height of a phone screen, and the
   * ranking they summarised started below the fold. One figure on top and
   * the people under it is the same information in a third of the room.
   */
  totals?: CircleTotals;
}) {
  const maxAbs = Math.max(
    0.001,
    ...members.map((m) => Math.abs(m.todayPct ?? 0))
  );
  return (
    <Panel className="overview-fade order-1">
      <PanelHeader
        icon={<Trophy className="h-4 w-4" />}
        title="Today"
        subtitle="How each portfolio moved today, biggest move first"
      />
      {/*
        The circle's figure beside the people on a laptop, above them on a
        phone: at full width the names and the bars sat a hand apart with
        nothing between them.
      */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:items-start lg:gap-10">
      {totals ? (
        <div className="flex flex-col gap-1.5">
          <MicroLabel>The whole circle</MicroLabel>
          <p className={cn("figure-hero", signedTone(totals.todayPct, "text-foreground"))}>
            {totals.todayPct != null ? signedPercent(totals.todayPct) : NO_VALUE}
          </p>
          <p className="text-sm tabular-nums text-muted-foreground">
            {signedCurrency(totals.todayDollar, 0)} today, on{" "}
            {currency(totals.totalValue, 0)} across{" "}
            {members.length === 1 ? "1 portfolio" : `${members.length} portfolios`}
            {totals.cash !== 0 ? `, ${currency(totals.cash, 0)} of it cash` : ""}
          </p>
        </div>
      ) : null}
      <ItemGroup className="gap-0 has-data-[size=sm]:gap-0">
        {[...members]
          .sort((a, b) => (b.todayPct ?? -1) - (a.todayPct ?? -1))
          .map((m, i) => {
            const pct = m.todayPct;
            return (
              <Fragment key={m.id}>
                {i > 0 ? <ItemSeparator className="my-0" /> : null}
                <Item asChild size="sm" className="px-0 hover:bg-hover">
                  <button
                    type="button"
                    onClick={() => {
                      onOpen(m.id);
                    }}
                    className="cursor-pointer text-left"
                  >
                    <ItemMedia className="w-6 justify-center">
                      {i < 3 ? (
                        <>
                          <RankMedal place={(i + 1) as 1 | 2 | 3} />
                          {/*
                            The medal is the only place the top three carry
                            their position, and it is drawn `aria-hidden`, so
                            without this a screen reader heard "4", "5", "6"
                            down the board and nothing at all for the three
                            rows that matter most.
                          */}
                          <span className="sr-only">{i + 1}</span>
                        </>
                      ) : (
                        <span className="w-6 text-center text-sm tabular-nums text-muted-foreground">
                          {i + 1}
                        </span>
                      )}
                    </ItemMedia>
                    <ItemContent className="min-w-0 sm:w-32 sm:flex-none">
                      <ItemTitle className={cn(m.isYou && "text-primary")}>
                        {m.name}
                        {m.isYou && m.name.trim().toLowerCase() !== "you" ? (
                          <span className="font-normal text-muted-foreground">
                            (you)
                          </span>
                        ) : null}
                      </ItemTitle>
                    </ItemContent>
                    {/*
                      Each day as a bar from a middle line, rises to the
                      right and falls to the left, on one scale for the
                      whole board: the list says the order, the bars say
                      how far apart the places are.
                    */}
                    <span className="relative block h-1.5 w-16 shrink-0 rounded-full bg-foreground/[0.06] sm:w-auto sm:flex-1" aria-hidden>
                      <span className="absolute inset-y-[-3px] left-1/2 w-px bg-foreground/20" />
                      {pct != null && pct !== 0 ? (
                        <span
                          className={cn(
                            "absolute inset-y-0 rounded-full",
                            pct > 0 ? "left-1/2 bg-gain/75" : "right-1/2 bg-loss/75"
                          )}
                          style={{ width: `${barFillPct((Math.abs(pct) / maxAbs) * 50, 1, 50)}%` }}
                        />
                      ) : null}
                    </span>
                    <ItemActions className="shrink-0">
                      <span
                        className={cn(
                          "w-16 text-right text-sm font-semibold tabular-nums",
                          signedTone(pct, "text-muted-foreground")
                        )}
                      >
                        {pct != null ? signedPercent(pct) : NO_VALUE}
                      </span>
                      {/* Fixed-width so a wide dollar figure
                        * cannot shove the percent column. */}
                      <span
                        className={cn(
                          "hidden w-24 text-right text-sm tabular-nums sm:inline-block",
                          signedTone(m.todayDollar, "text-muted-foreground")
                        )}
                      >
                        {signedCurrency(m.todayDollar, 0)}
                      </span>
                    </ItemActions>
                  </button>
                </Item>
              </Fragment>
            );
          })}
      </ItemGroup>
      </div>
    </Panel>
  );
}
