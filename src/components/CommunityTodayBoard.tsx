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
import { cn, NO_VALUE, signedPercent, signedTone } from "@/lib/format";
import { Trophy } from "lucide-react";
import { Fragment } from "react";
import type { MemberStat } from "@/components/community-types";

/**
 * A circle ranks people by how their day went, and by nothing else.
 *
 * The board used to carry a dollar column beside the percent, so a friend's
 * whole portfolio was one subtraction away from anybody in the room. The
 * landing page promises the opposite in as many words, and it is the reason
 * people agree to be in one of these at all. The percent is also the more
 * useful of the two: it is the only figure that compares a first job to a
 * pension, which is exactly who is in a family circle together.
 *
 * The percent carries its sign (`signedPercent`), which it did not: a good
 * day printed "1.2%" beside every loss printing "-0.8%", so the winning row
 * was the only one on the board without a sign on it.
 */
export function CommunityTodayBoard({
  members,
  onOpen,
}: {
  members: MemberStat[];
  onOpen: (id: string) => void;
}) {
  return (
    <section className="overview-fade order-1 rounded-xl glass ring-1 ring-foreground/20 p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="card-sheen glass-well rounded-xl p-2 text-primary">
            <Trophy className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-foreground">Today</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              How each portfolio moved today, biggest move first
            </p>
          </div>
        </div>
      </div>
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
                    <ItemContent>
                      <ItemTitle>
                        {m.name}
                        {m.isYou ? (
                          <span className="font-normal text-muted-foreground">
                            (you)
                          </span>
                        ) : null}
                      </ItemTitle>
                    </ItemContent>
                    <ItemActions className="shrink-0">
                      <span
                        className={cn(
                          "w-16 text-right text-sm font-semibold tabular-nums",
                          signedTone(pct, "text-muted-foreground")
                        )}
                      >
                        {pct != null ? signedPercent(pct) : NO_VALUE}
                      </span>
                    </ItemActions>
                  </button>
                </Item>
              </Fragment>
            );
          })}
      </ItemGroup>
    </section>
  );
}
