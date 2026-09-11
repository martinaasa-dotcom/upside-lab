"use client";

import { DailyDuelCard } from "@/components/DailyDuelCard";
import { PowerAnimalCard } from "@/components/CircleCards";
import { BelowFold } from "@/components/BelowFold";
import { CommunityTodayBoard } from "@/components/CommunityTodayBoard";
import { ShareSheets } from "@/components/ShareSheets";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import { Button } from "@/components/ui/button";
import {
  Panel,
  PANEL_STACK,
  PanelHeader,
  Score,
  Scoreboard,
  Segmented,
  SwatchLegend,
} from "@/components/ui/Panel";
import { AllocationBar } from "@/components/ui/AllocationBar";
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
  Copy,
  HelpCircle,
  History,
  Lightbulb,
  Layers,
  Link2,
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
      <>
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
      </>
    </Item>
  );
}

/** A whole number of percent, or "less than 1%" rather than a bare "0%". */
function themePctLabel(p: number): string {
  if (p > 0 && p < 0.01) return "less than 1%";
  return `${Math.round(p * 100)}%`;
}

type ThemeSlice = {
  theme: ForecastTheme;
  label: string;
  value: number;
  pct: number;
};

function ThemeBar({ slices }: { slices: ThemeSlice[] }) {
  return (
    <AllocationBar
      slices={slices.map((t) => ({
        key: t.theme,
        pct: t.pct,
        color: THEME_COLOR[t.theme],
        title: `${t.label}: ${themePctLabel(t.pct)}`,
      }))}
    />
  );
}

/**
 * The one sentence the chart can teach: where you differ from the room.
 * A single stacked bar tells a reader what the group holds and nothing at
 * all about themselves, which is the comparison they came for.
 */
function biggestThemeGap(
  circle: ThemeSlice[],
  you: ThemeSlice[]
): string | null {
  if (circle.length === 0 || you.length === 0) return null;
  const yourPct = new Map(you.map((t) => [t.theme, t.pct]));
  let best: { label: string; gap: number } | null = null;
  for (const slice of circle) {
    const gap = (yourPct.get(slice.theme) ?? 0) - slice.pct;
    if (!best || Math.abs(gap) > Math.abs(best.gap)) {
      best = { label: slice.label, gap };
    }
  }
  if (!best || Math.abs(best.gap) < 0.05) return null;
  const points = Math.round(Math.abs(best.gap) * 100);
  return best.gap > 0
    ? `You hold ${points} points more of ${best.label} than the circle does.`
    : `You hold ${points} points less of ${best.label} than the circle does.`;
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
  communityThemeBreakdown: ThemeSlice[];
  yourThemeBreakdown: ThemeSlice[];
  communityFunFacts: string[];
  funFactsShuffle: number;
  setFunFactsShuffle: Dispatch<SetStateAction<number>>;
  changes: string[];
  communityId: string;
  duelCache: CommunityDuelCache | null;
  isAdmin: boolean;
  /**
   * Who arrived: people waiting on an admin, people who just joined. It
   * sits under the circle's name rather than in the chrome, because a
   * digit in a badge is the smallest thing on the screen.
   */
  accessNotice: ReactNode;
  inviteBusy: boolean;
  inviteUrl: string | null;
  createInvite: () => void;
  copyInviteLink: (url: string | null, key: string) => void;
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
  yourThemeBreakdown,
  communityFunFacts,
  funFactsShuffle,
  setFunFactsShuffle,
  changes,
  communityId,
  duelCache,
  isAdmin,
  accessNotice,
  inviteBusy,
  inviteUrl,
  createInvite,
  copyInviteLink,
  onOpenMember,
  onOpenBestiary,
  onShareChanged,
  members,
}: CircleHomeProps) {
  const empty = membersWithBooks.length === 0;
  /*
    A league of one is a list with a winner and nothing to compare it to,
    so the tab is not offered until two people have shared something. The
    reader is never dropped: a view that has just stopped existing falls
    back to Overview below.
  */
  const hasLeague = membersWithBooks.length >= 2;
  const shownView = view === "play" && !hasLeague ? "overview" : view;
  const gapLine = biggestThemeGap(communityThemeBreakdown, yourThemeBreakdown);

  return (
    <>
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold text-foreground">{name}</h1>
        {houseNote ? (
          <p className="text-sm leading-relaxed text-foreground">{houseNote}</p>
        ) : null}
      </section>

      {accessNotice}

      <Segmented
        ariaLabel="Circle view"
        value={shownView}
        onChange={setView}
        /*
          The tab was called League and had no league in it: the only
          ranking, the Today board, sits on Overview, and what is behind
          this tab is each person's power animal, what stands out about
          them, what the circle owns and the day's facts. "Animals" is what
          a reader will actually find. The id stays `play`, so the
          `?view=league` links already in circulation still land here.
        */
        options={[
          { id: "overview" as const, label: "Overview" },
          ...(hasLeague ? [{ id: "play" as const, label: "Animals" }] : []),
          /*
            One word and no number. The cells of a segmented control share
            one row, so every character in the longest label narrows all
            of them, and "Members · 15" was clipped against its own pill
            on a phone. The count lives under the heading on the page the
            tab opens, where there is room for it, and anybody waiting is
            in the card at the top of this screen. See
            `members-count-line.ts`.
          */
          { id: "members" as const, label: "Members" },
        ]}
      />

      {/*
        What the circle holds between it, and how today went.

        The percent leads, because it is the one figure that compares a
        first job to a pension and it is what the board below is ranked on.
        The pooled total and the pooled cash sit beside it: they are sums
        rather than facts about any one person, which is what makes them
        safe to open a shared room on, and the per-person amounts are a tap
        away on the board and the cards.
      */}
      {!empty && (
        <WidgetErrorBoundary name="Circle totals">
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
              sub={
                membersWithBooks.length === 1
                  ? "1 portfolio in the circle"
                  : `${membersWithBooks.length} portfolios in the circle`
              }
            />
            <Score
              label="Cash"
              value={currency(overview.totals.cash)}
              sub="Everyone's, added up"
              tone={overview.totals.cash < 0 ? "down" : undefined}
            />
          </Scoreboard>
        </WidgetErrorBoundary>
      )}

      {(shownView === "overview" || shownView === "play") && (
        /*
          THE CIRCLE IS A ROOM LIKE EVERY OTHER ROOM, AND FOR A LONG TIME
          IT WAS THE ONE THE DESIGN SYSTEM NEVER REACHED.

          Every card below was a hand-rolled `rounded-xl glass ring-1 p-6`
          section rather than a `Panel`, so the spacing pass walked past
          the whole room: measured against the app's own compiled CSS, the
          cards sat 24px inside and **12px apart** at every width, where a
          panel steps 16/20 on a phone and a room stacks at 32/40. The
          grouping was inverted -- a card's last line was closer to the
          next card's first line than to its own edge -- which is the
          exact fault the pass exists to fix, and worse here than the
          24-against-24 it started from. It also cost 16px of content
          width on a 360px phone, and the titles were `h3` where every
          other panel in the product titles at `h2`.
        */
        <div className={PANEL_STACK}>
          {/*
            A brand new circle used to open on three score cards reading
            n/a, $0.00 and $0.00, one sentence, and then the share toggles,
            with the invite link, the one thing the founder needs next, on
            another tab under a sixty-word paragraph. Two steps instead, in
            the order they have to happen in.
          */}
          {shownView === "overview" && empty && (
            <Panel className="overview-fade order-1">
              <PanelHeader
                title="Two steps and this circle is live"
                subtitle="Everyone here will see how each portfolio moved, which companies are in it, how many shares of each, and what the whole thing is worth today. What anybody paid stays theirs."
              />

              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-foreground">
                  1. Pick what this circle sees
                </p>
                <ShareSheets communityId={communityId} onChanged={onShareChanged} />
              </div>

              {isAdmin ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    2. Send the link
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Anyone with the link can join. You can turn it off later,
                    and more settings live on the Members tab.
                  </p>
                  {inviteUrl ? (
                    <div className="card-sheen glass-well flex flex-wrap items-center gap-3 rounded-lg p-3">
                      <span className="min-w-0 flex-1 break-all text-sm text-foreground">
                        {inviteUrl}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => copyInviteLink(inviteUrl, "fresh")}
                      >
                        <Copy data-icon="inline-start" />
                        Copy
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      className="self-start"
                      disabled={inviteBusy}
                      onClick={createInvite}
                    >
                      <Link2 data-icon="inline-start" />
                      {inviteBusy ? "Making a link …" : "Create invite link"}
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Nobody else has shared a portfolio here yet. Yours will show
                  up as soon as you pick one above.
                </p>
              )}
            </Panel>
          )}

          {/*
            What changed since you last looked, from the copy of the circle
            that was already sitting in this browser. See
            `src/lib/circle-changes.ts` for why it never prints a number of
            shares and why a member who was not in the cached copy is
            skipped rather than announced.
          */}
          {shownView === "overview" && changes.length > 0 && (
            <Panel className="overview-fade order-0">
              <PanelHeader
                icon={<History className="h-4 w-4" />}
                title="Since you last looked"
                subtitle="What people bought and sold while you were away"
              />
              <ul className="flex flex-col gap-1.5">
                {changes.map((line) => (
                  <li
                    key={line}
                    className="text-sm leading-relaxed text-foreground"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {shownView === "overview" && !empty && (
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

          {shownView === "play" && hasLeague && (
            <Panel className="overview-fade order-3">
              <PanelHeader
                icon={<Sparkles className="h-4 w-4" />}
                title="Power animals"
                subtitle="How each portfolio is put together. Tap a row to open it up."
                actions={
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
                }
              />
              <div className="flex flex-col gap-2">
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
            </Panel>
          )}

          {/*
            One award per person, chosen by the clearest margin. Ten awards
            for six people meant several people held three, and two of them
            contradicted each other on the same grid. `circle-awards.ts`
            holds the rule and the reason.
          */}
          {shownView === "play" && achievements.length > 0 && (
            <Panel className="overview-fade order-2">
              <PanelHeader
                icon={<Award className="size-4" />}
                title="Who stands out"
                subtitle="One each, for whatever they are furthest ahead on"
              />
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
            </Panel>
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
          {shownView === "overview" && !empty && (
            <BelowFold className="order-1" reserve={465}>
              <CommunityTodayBoard
                members={membersWithBooks}
                onOpen={onOpenMember}
              />
            </BelowFold>
          )}
          {shownView === "overview" && sharedNames.length > 0 && (
            <BelowFold className="order-4" reserve={640}>
              <Panel className="overview-fade">
                <PanelHeader
                  icon={<Layers className="h-4 w-4" />}
                  iconTone="emerald"
                  title="Holdings you share"
                  subtitle="The companies more than one of you owns"
                />
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
              </Panel>
            </BelowFold>
          )}

          {shownView === "play" && communityThemeBreakdown.length > 0 && (
            <Panel className="overview-fade order-5">
              <PanelHeader
                icon={<PieChart className="h-4 w-4" />}
                title="What the circle owns"
                subtitle="Everyone's holdings added together and grouped by kind of business. This shows how the circle is put together, and is not a recommendation."
              />
              {/*
                The two bars are one reading, so they are one child of the
                panel rather than two: a panel spaces its own children at
                24/32, which between a bar and the bar it is compared with
                would read as two separate pictures.
              */}
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm text-muted-foreground">The circle</p>
                  <ThemeBar slices={communityThemeBreakdown} />
                </div>
                {yourThemeBreakdown.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-sm text-muted-foreground">You</p>
                    <ThemeBar slices={yourThemeBreakdown} />
                  </div>
                ) : null}
              </div>
              {gapLine ? (
                <p className="text-sm leading-relaxed text-foreground">
                  {gapLine}
                </p>
              ) : null}
              <SwatchLegend
                items={communityThemeBreakdown.map((t) => ({
                  key: t.theme,
                  label: t.label,
                  color: THEME_COLOR[t.theme],
                  value: themePctLabel(t.pct),
                }))}
              />
            </Panel>
          )}

          {shownView === "play" && (
            <Panel className="overview-fade order-6">
              <PanelHeader
                icon={<Lightbulb className="h-4 w-4" />}
                title="Circle facts"
                subtitle={
                  funFactsShuffle > 0
                    ? "These are shuffled. Reload the page for today's own set."
                    : "A new set every day"
                }
                actions={
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
                }
              />
              {communityFunFacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nobody has shared a portfolio yet.
                </p>
              ) : (
                <ItemGroup className="gap-0 has-data-[size=sm]:gap-0">
                  {communityFunFacts.map((fact, i) => (
                    <Fragment key={`${i}-${fact.slice(0, 24)}`}>
                      {i > 0 ? <ItemSeparator className="my-0" /> : null}
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
            </Panel>
          )}
        </div>
      )}

      {/*
        On an empty circle the toggles are step one of the start card above,
        so this copy of them would be the same control twice on one screen.
      */}
      <div className={shownView === "members" ? undefined : "hidden"}>
        <ShareSheets communityId={communityId} onChanged={onShareChanged} />
      </div>

      {shownView === "members" && members}

    </>
  );
}

