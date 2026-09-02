"use client";

import { ClassTradeBanner } from "@/components/ClassTradeBanner";
import { ClassroomRoster } from "@/components/ClassroomRoster";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import { Button } from "@/components/ui/button";
import { Score, Scoreboard, Segmented } from "@/components/ui/Panel";
import type { ClassroomTrade, ThesisCoverage } from "@/lib/classroom";
import {
  currency,
  NO_VALUE,
  signedCurrency,
  signedPercent,
} from "@/lib/format";
import type { OverviewModel } from "@/lib/overview";
import type { Holding, Quote } from "@/lib/types";
import type { ReactNode } from "react";
import type { CommunityViewTab, MemberStat } from "@/components/community-types";

export type ClassroomHomeProps = {
  name: string;
  houseNote: string | null;
  classTrade: ClassroomTrade | null | undefined;
  isAdmin: boolean;
  myClassSheet: boolean;
  claimBusy: boolean;
  onClaim: () => void;
  view: CommunityViewTab;
  setView: (view: CommunityViewTab) => void;
  contentView: "overview" | "play" | "members";
  overview: OverviewModel;
  membersWithBooks: MemberStat[];
  memberStats: MemberStat[];
  startingCash: number;
  classVsStartPct: number | null;
  classVsStartDollar: number;
  holdings: Holding[];
  quotes: Record<string, Quote>;
  ownership: { portfolio_id: string; user_id: string }[];
  thesisCoverage: Record<string, ThesisCoverage>;
  communityId: string;
  onOpenMember: (id: string) => void;
  members: ReactNode;
};

export function ClassroomHome({
  name,
  houseNote,
  classTrade,
  isAdmin,
  myClassSheet,
  claimBusy,
  onClaim,
  view,
  setView,
  contentView,
  overview,
  membersWithBooks,
  memberStats,
  startingCash,
  classVsStartPct,
  classVsStartDollar,
  holdings,
  quotes,
  ownership,
  thesisCoverage,
  communityId,
  onOpenMember,
  members,
}: ClassroomHomeProps) {
  return (
    <>
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold text-foreground">{name}</h1>
        {classTrade &&
        (classTrade.kind !== "open" || classTrade.until) ? (
          <ClassTradeBanner
            trade={classTrade}
            teacherNote={
              isAdmin ? "You can still edit. Students cannot." : undefined
            }
          />
        ) : houseNote ? (
          <p className="text-sm leading-relaxed text-foreground">{houseNote}</p>
        ) : null}
        {!myClassSheet ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl glass ring-1 ring-foreground/20 px-6 py-4">
            <p className="min-w-0 flex-1 text-sm text-foreground">
              {isAdmin
                ? "You are watching the class. Get a paper portfolio if you want to trade alongside them."
                : "You do not have a paper portfolio in this class yet. Tap Get paper portfolio to start with the same cash as everyone else."}
            </p>
            <Button
              type="button"
              className="shrink-0"
              disabled={claimBusy}
              onClick={onClaim}
            >
              {claimBusy ? "Making portfolio …" : "Get paper portfolio"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Open your paper portfolio to buy companies with the paper
            money. The Sunday letter is your weekly summary.
          </p>
        )}
      </section>

      <Segmented
        ariaLabel="Class view"
        value={view}
        onChange={setView}
        options={[
          { id: "overview" as const, label: "Roster" },
          { id: "members" as const, label: "Members" },
        ]}
      />

      <WidgetErrorBoundary name="Class totals">
        <Scoreboard cols={3}>
          <Score
            label="Today"
            value={
              overview.totals.todayPct != null
                ? signedPercent(overview.totals.todayPct)
                : NO_VALUE
            }
            sub={signedCurrency(overview.totals.todayDollar)}
            tone={
              (overview.totals.todayPct ?? 0) > 0
                ? "up"
                : (overview.totals.todayPct ?? 0) < 0
                  ? "down"
                  : undefined
            }
          />
          <Score
            label="Total value"
            value={currency(overview.totals.totalValue)}
          />
          <Score
            label="Since start"
            value={
              classVsStartPct != null
                ? signedPercent(classVsStartPct)
                : NO_VALUE
            }
            sub={`${signedCurrency(classVsStartDollar)} · ${currency(startingCash)} each`}
            tone={
              (classVsStartPct ?? 0) > 0
                ? "up"
                : (classVsStartPct ?? 0) < 0
                  ? "down"
                  : undefined
            }
          />
        </Scoreboard>
      </WidgetErrorBoundary>

      {contentView === "overview" && (
        <div className="flex flex-col gap-3">
          <WidgetErrorBoundary name="Class roster" resetKey={communityId}>
            <ClassroomRoster
              members={memberStats.map((m) => ({
                id: m.id,
                name: m.name,
                isYou: m.isYou,
                sheetCount: m.sheetCount,
                totalValue: m.totalValue,
                todayDollar: m.todayDollar,
                todayPct: m.todayPct,
                topTicker: m.personality?.topTicker ?? null,
                topWeight: m.personality?.convictionScore ?? null,
              }))}
              startingCash={startingCash}
              holdings={holdings}
              quotes={quotes}
              ownership={ownership}
              thesisCoverage={thesisCoverage}
              onOpen={(id) => {
                onOpenMember(id);
              }}
            />
          </WidgetErrorBoundary>
          {membersWithBooks.length === 0 && isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground">
                Send the invite. Each student gets the same starting
                cash and an empty portfolio.
              </p>
              <Button
                type="button"
                variant="link"
                onClick={() => setView("members")}
              >
                Invite students
              </Button>
            </div>
          )}
        </div>
      )}

      {contentView === "members" && members}
    </>
  );
}
