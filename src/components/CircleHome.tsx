"use client";

import { DailyDuelCard } from "@/components/DailyDuelCard";
import { PowerAnimalCard } from "@/components/CircleCards";
import { BelowFold } from "@/components/BelowFold";
import { CommunityTodayBoard } from "@/components/CommunityTodayBoard";
import { ShareSheets } from "@/components/ShareSheets";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import { Button } from "@/components/ui/button";
import {
  Score,
  Scoreboard,
  Segmented,
  SwatchLegend,
} from "@/components/ui/Panel";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import type { CommunityDuelCache } from "@/lib/community-cache";
import type { OverlapRow } from "@/lib/circle-overlap";
import {
  cashtag,
  cn,
  currency,
  NO_VALUE,
  signedCurrency,
  signedPercent,
  signedTone,
} from "@/lib/format";
import type { ForecastTheme } from "@/lib/forecast-conviction";
import { THEME_COLOR } from "@/lib/portfolio-personality";
import type { OverviewModel } from "@/lib/overview";
import {
  Award,
  HelpCircle,
  Lightbulb,
  Layers,
  PieChart,
  Shuffle,
  Sparkles,
} from "lucide-react";
import {
  Fragment,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type {
  CommunityAchievement,
  CommunityViewTab,
  MemberStat,
} from "@/components/community-types";

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  const first = parts[0]![0] ?? "";
  const last = parts[parts.length - 1]![0] ?? "";
  return `${first}${last}`.toUpperCase();
}

function SharedNameRow({
  ticker,
  people,
  todayPct,
  avatarByName,
}: {
  ticker: string;
  people: string[];
  todayPct: number | null;
  avatarByName: Map<string, string>;
}) {
  return (
    <Item size="sm" className="px-0">
      <ItemMedia className="w-20">
        <AvatarGroup>
          {people.map((name) => {
            const src = avatarByName.get(name);
            return (
              <Avatar key={name} size="sm">
                {src ? <AvatarImage src={src} alt="" /> : null}
                <AvatarFallback>{initialsFromName(name)}</AvatarFallback>
              </Avatar>
            );
          })}
        </AvatarGroup>
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{cashtag(ticker)}</ItemTitle>
        <ItemDescription className="line-clamp-none">
          {people.join(" · ")}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            signedTone(todayPct, "text-muted-foreground")
          )}
        >
          {todayPct != null ? signedPercent(todayPct) : NO_VALUE}
        </span>
      </ItemActions>
    </Item>
  );
}


export type CircleHomeProps = {
  name: string;
  houseNote: string | null;
  view: CommunityViewTab;
  setView: (view: CommunityViewTab) => void;
  overview: OverviewModel;
  membersWithBooks: MemberStat[];
  achievements: CommunityAchievement[];
  sharedNames: OverlapRow[];
  avatarByName: Map<string, string>;
  communityThemeBreakdown: Array<{
    theme: ForecastTheme;
    label: string;
    value: number;
    pct: number;
  }>;
  communityFunFacts: string[];
  funFactsShuffle: number;
  setFunFactsShuffle: Dispatch<SetStateAction<number>>;
  communityId: string;
  duelCache: CommunityDuelCache | null;
  onOpenMember: (id: string) => void;
  onOpenBestiary: () => void;
  onShareChanged: () => void;
  members: ReactNode;
};

export function CircleHome({
  name,
  houseNote,
  view,
  setView,
  overview,
  membersWithBooks,
  achievements,
  sharedNames,
  avatarByName,
  communityThemeBreakdown,
  communityFunFacts,
  funFactsShuffle,
  setFunFactsShuffle,
  communityId,
  duelCache,
  onOpenMember,
  onOpenBestiary,
  onShareChanged,
  members,
}: CircleHomeProps) {
  return (
    <>
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold text-foreground">{name}</h1>
        {houseNote ? (
          <p className="text-sm leading-relaxed text-foreground">{houseNote}</p>
        ) : null}
      </section>

      <Segmented
        ariaLabel="Community view"
        value={view}
        onChange={setView}
        options={[
          { id: "overview" as const, label: "Overview" },
          { id: "play" as const, label: "League" },
          { id: "members" as const, label: "Members" },
        ]}
      />

      <WidgetErrorBoundary name="Community totals">
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
            label="Cash"
            value={currency(overview.totals.cash)}
            tone={overview.totals.cash < 0 ? "down" : undefined}
          />
        </Scoreboard>
      </WidgetErrorBoundary>

      {(view === "overview" || view === "play") && (
        <div className="flex flex-col gap-3">
          {view === "overview" && membersWithBooks.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nobody has shared a portfolio here yet. Pick which of
              yours belong in this circle.
            </p>
          )}
          {view === "overview" && membersWithBooks.length > 0 && (
            <WidgetErrorBoundary name="Daily Duel" resetKey={communityId}>
              <DailyDuelCard
                compact
                communityId={communityId}
                initialDuel={duelCache}
                tickers={overview.tickers.map((t) => ({
                  ticker: t.ticker,
                  todayPct: t.todayPct,
                }))}
              />
            </WidgetErrorBoundary>
          )}
                  {view === "play" && membersWithBooks.length > 0 && (
                    <section className="overview-fade order-3 rounded-xl glass ring-1 ring-foreground/20 p-6">
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="card-sheen glass-well rounded-xl p-2 text-primary">
                            <Sparkles className="h-4 w-4" />
                          </div>
                          <div>
                            <h3 className="text-foreground">
                              Power animals
                            </h3>
                            <p className="mt-0.5 text-sm text-muted-foreground">
                              How each portfolio is put together. Tap someone to
                              open theirs.
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label="Field guide"
                          onClick={() => onOpenBestiary()}
                        >
                          <HelpCircle data-icon="inline-start" />
                          <span className="hidden sm:inline">Field guide</span>
                        </Button>
                      </div>
                      <div className="grid gap-6 lg:grid-cols-2 lg:gap-y-5">
                        {membersWithBooks.map((m) => (
                          <PowerAnimalCard
                            key={m.id}
                            name={m.name}
                            isYou={m.isYou}
                            isPending={m.isPending}
                            totalValue={m.totalValue}
                            todayPct={m.todayPct}
                            personality={m.personality}
                            milestone={m.milestone}
                            onOpen={() => {
                              onOpenMember(m.id);
                            }}
                          />
                        ))}
                      </div>
                    </section>
                  )}
                  {view === "play" && achievements.length > 0 && (
                    <section className="overview-fade order-2 rounded-xl glass ring-1 ring-foreground/20 p-6">
                      <div className="mb-4 flex items-center gap-2.5">
                        <div className="card-sheen glass-well rounded-lg p-2 text-muted-foreground">
                          <Award className="size-4" />
                        </div>
                        <div>
                          <h3 className="text-foreground">
                            Community superlatives
                          </h3>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            Fun awards pulled from the numbers above
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {achievements.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => {
                              onOpenMember(a.winnerId);
                            }}
                            className="veil-hover card-sheen glass-well flex w-full flex-col gap-1.5 rounded-lg p-3 text-left ring-1 ring-foreground/20 transition hover:scale-[1.01] hover:ring-primary/25"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-sm leading-none"
                                aria-hidden
                              >
                                {a.emoji}
                              </span>
                              <p className="text-sm font-medium tracking-tight text-foreground">
                                {a.title}
                              </p>
                            </div>
                            <p className="text-sm">
                              <span className="font-semibold text-foreground">
                                {a.winner}
                              </span>
                              <span className="text-muted-foreground">
                                {" · "}
                                {a.stat}
                              </span>
                            </p>
                            <p className="text-sm leading-relaxed text-muted-foreground">
                              {a.description}
                            </p>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  {/*
                    * THE TWO BIGGEST SECTIONS OF A CIRCLE ARE BOTH BELOW
                    * THE FOLD, SO NEITHER IS IN THE FIRST COMMIT.
                    *
                    * Measured at 390x800 with eight members: the room is
                    * 308 elements over 2.65 screens, and 75.6% of it starts
                    * below the fold. The board begins at 870px and this
                    * section at 1,347px, and between them they are 264 of
                    * those 308 -- so opening a circle laid out and painted
                    * six times more than the reader could see.
                    *
                    * `BelowFold` starts closed, which is the part that
                    * matters here rather than its lead: its children are
                    * absent from the first render whatever the lead says,
                    * and the observer opens them on the next task. The
                    * first paint costs the heading, the tabs, the totals
                    * and the duel; the rest arrives a frame later, off
                    * screen, where nobody is looking at it.
                    *
                    * The `order-*` moves out to the wrapper, or the flex
                    * parent stops seeing it and both sections jump to the
                    * top of the column.
                    */}
                  {view === "overview" && membersWithBooks.length > 0 && (
                    <BelowFold className="order-1" reserve={465}>
                      <CommunityTodayBoard
                        members={membersWithBooks}
                        onOpen={onOpenMember}
                      />
                    </BelowFold>
                  )}
                  {view === "overview" && sharedNames.length > 0 && (
                    <BelowFold className="order-4" reserve={640}>
                      <section className="overview-fade rounded-xl glass ring-1 ring-foreground/20 p-6">
                        <div className="mb-4 flex items-center gap-2.5">
                          <div className="rounded-xl bg-gain/15 p-2 text-gain">
                            <Layers className="h-4 w-4" />
                          </div>
                          <div>
                            <h3 className="text-foreground">
                              Holdings you share
                            </h3>
                            <p className="mt-0.5 text-sm text-muted-foreground">
                              Who else in the circle owns the same companies
                            </p>
                          </div>
                        </div>
                        <ItemGroup className="gap-0 has-data-[size=sm]:gap-0">
                          {sharedNames.map((row, i) => (
                            <Fragment key={row.ticker}>
                              {i > 0 ? <ItemSeparator className="my-0" /> : null}
                              <SharedNameRow
                                ticker={row.ticker}
                                people={row.people}
                                todayPct={row.todayPct}
                                avatarByName={avatarByName}
                              />
                            </Fragment>
                          ))}
                        </ItemGroup>
                      </section>
                    </BelowFold>
                  )}

                  {view === "play" && communityThemeBreakdown.length > 0 && (
                    <section className="overview-fade order-5 rounded-xl glass ring-1 ring-foreground/20 p-6">
                      <div className="mb-4 flex items-center gap-2.5">
                        <div className="card-sheen glass-well rounded-xl p-2 text-primary">
                          <PieChart className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-foreground">
                            What the circle owns
                          </h3>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            Everyone&apos;s holdings added together and grouped
                            by kind of business. This shows how the circle is put
                            together, and is not a recommendation.
                          </p>
                        </div>
                      </div>
                      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                        {communityThemeBreakdown.map((t) => (
                          <div
                            key={t.theme}
                            style={{
                              width: `${Math.max(1.5, t.pct * 100)}%`,
                              backgroundColor: THEME_COLOR[t.theme],
                            }}
                            title={`${t.label}: ${Math.round(t.pct * 100)}%`}
                          />
                        ))}
                      </div>
                      <SwatchLegend
                        className="mt-4"
                        items={communityThemeBreakdown.map((t) => ({
                          key: t.theme,
                          label: t.label,
                          color: THEME_COLOR[t.theme],
                          value: `${Math.round(t.pct * 100)}%`,
                        }))}
                      />
                    </section>
                  )}

                  {view === "play" && (
                  <section className="overview-fade order-6 rounded-xl glass ring-1 ring-foreground/20 p-6">
                    <div className="mb-4 flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="card-sheen glass-well rounded-xl p-2 text-primary">
                          <Lightbulb className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-foreground">
                            Community fun facts
                          </h3>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {funFactsShuffle > 0
                              ? "These are shuffled. Reload the page for today's own set."
                              : "A new set every day"}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="touch-target"
                        onClick={() => setFunFactsShuffle((n) => n + 1)}
                        title="Show a different set of these"
                      >
                        <Shuffle data-icon="inline-start" />
                        Shuffle
                      </Button>
                    </div>
                    {communityFunFacts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Not enough data yet. Check back once portfolios load.
                      </p>
                    ) : (
                      <ItemGroup className="gap-0 has-data-[size=sm]:gap-0">
                        {communityFunFacts.map((fact, i) => (
                          <Fragment key={`${i}-${fact.slice(0, 24)}`}>
                            {i > 0 ? (
                              <ItemSeparator className="my-0" />
                            ) : null}
                            {/* The number and the sentence sit on one
                              * baseline, which takes both halves of this.
                              *
                              * A plain `<p>`, not `ItemDescription`: that
                              * primitive is a two-line clamp in muted grey
                              * at `leading-normal`, and this call site was
                              * already overriding all three. Keeping it
                              * only bought `ItemMedia`'s
                              * `group-has-data-[slot=item-description]`
                              * rules -- a `translate-y-0.5` nudge and a
                              * `self-start` -- which exist to drop an
                              * *icon* level with a title above a
                              * description. There is no title here, so the
                              * nudge just pushed the numeral off the
                              * sentence's baseline.
                              *
                              * `leading-relaxed` on the media then matches
                              * the two line boxes exactly, so the numeral
                              * and the first line share a half-leading and
                              * land on the same baseline by construction
                              * rather than by a hand-tuned offset. */}
                            <Item className="items-start px-0">
                              <ItemMedia
                                className="w-4 justify-start self-start text-sm leading-relaxed tabular-nums text-muted-foreground"
                                aria-hidden
                              >
                                {i + 1}
                              </ItemMedia>
                              <ItemContent>
                                <p className="text-sm leading-relaxed text-foreground">
                                  {fact}
                                </p>
                              </ItemContent>
                            </Item>
                          </Fragment>
                        ))}
                      </ItemGroup>
                    )}
                  </section>
                  )}

        </div>
      )}

      <div
        className={
          view === "members" ||
          (view === "overview" && membersWithBooks.length === 0)
            ? undefined
            : "hidden"
        }
      >
        <ShareSheets communityId={communityId} onChanged={onShareChanged} />
      </div>

      {view === "members" && members}
    </>
  );
}
