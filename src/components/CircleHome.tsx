"use client";

import { DailyDuelCard } from "@/components/DailyDuelCard";
import { PowerAnimalCard } from "@/components/CircleCards";
import { BelowFold } from "@/components/BelowFold";
import { CommunityTodayBoard } from "@/components/CommunityTodayBoard";
import { ShareSheets } from "@/components/ShareSheets";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import { Button } from "@/components/ui/button";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
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
  NO_VALUE,
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
  X,
} from "lucide-react";
import {
  Fragment,
  useState,
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

/**
 * A group that owns the same company and never says why.
 *
 * This whole product is about the reason you own something, and a circle
 * had nothing to talk about: the shared list was a name, some faces and a
 * percentage. Tapping one opens everybody's reason for it, side by side,
 * which is the one screen in the app where you can read somebody else's
 * thinking about a company you also own.
 */
export type SharedReason = { person: string; reason: string | null };

function SharedNameRow({
  ticker,
  people,
  todayPct,
  avatarByName,
  onOpen,
}: {
  ticker: string;
  people: string[];
  todayPct: number | null;
  avatarByName: Map<string, string>;
  onOpen: () => void;
}) {
  return (
    <Item asChild size="sm" className="px-0 hover:bg-hover">
      <button type="button" onClick={onOpen} className="cursor-pointer text-left">
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
      </button>
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
    <div className="flex h-3 overflow-hidden rounded-full bg-muted">
      {slices.map((t) => (
        <div
          key={t.theme}
          style={{
            width: `${Math.max(1.5, t.pct * 100)}%`,
            backgroundColor: THEME_COLOR[t.theme],
          }}
          title={`${t.label}: ${themePctLabel(t.pct)}`}
        />
      ))}
    </div>
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
  sharedReasons: Map<string, SharedReason[]>;
  youHold: Set<string>;
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
  sharedReasons,
  youHold,
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
  inviteBusy,
  inviteUrl,
  createInvite,
  copyInviteLink,
  onOpenMember,
  onOpenBestiary,
  onShareChanged,
  members,
}: CircleHomeProps) {
  const [openTicker, setOpenTicker] = useState<string | null>(null);
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

      <Segmented
        ariaLabel="Circle view"
        value={shownView}
        onChange={setView}
        options={[
          { id: "overview" as const, label: "Overview" },
          ...(hasLeague ? [{ id: "play" as const, label: "League" }] : []),
          { id: "members" as const, label: "Members" },
        ]}
      />

      {/*
        A circle says how a day went and never what anything is worth.

        The landing page promises exactly that, in as many words, and it is
        the reason anybody agrees to be in one. This card used to be three
        big cells reading Today, Total value and Cash, so the first screen
        of a family circle broadcast the pooled net worth of everybody in
        it, to the cent. A circle-wide cash figure also means nothing: six
        people's spare cash added together is not a fact about anybody.
      */}
      {!empty && (
        <WidgetErrorBoundary name="Circle totals">
          <Scoreboard cols={2}>
            <Score
              label="Today"
              value={
                overview.totals.todayPct != null
                  ? signedPercent(overview.totals.todayPct)
                  : NO_VALUE
              }
              sub="Everyone's portfolios together"
              tone={
                (overview.totals.todayPct ?? 0) > 0
                  ? "up"
                  : (overview.totals.todayPct ?? 0) < 0
                    ? "down"
                    : undefined
              }
            />
            <Score
              label="Sharing"
              value={String(membersWithBooks.length)}
              sub={
                membersWithBooks.length === 1
                  ? "portfolio in the circle"
                  : "portfolios in the circle"
              }
            />
          </Scoreboard>
        </WidgetErrorBoundary>
      )}

      {(shownView === "overview" || shownView === "play") && (
        <div className="flex flex-col gap-3">
          {/*
            A brand new circle used to open on three score cards reading
            n/a, $0.00 and $0.00, one sentence, and then the share toggles,
            with the invite link, the one thing the founder needs next, on
            another tab under a sixty-word paragraph. Two steps instead, in
            the order they have to happen in.
          */}
          {shownView === "overview" && empty && (
            <section className="overview-fade order-1 rounded-xl glass ring-1 ring-foreground/20 p-6">
              <h3 className="text-foreground">Two steps and this circle is live</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Everyone here will see how each portfolio moved, which
                companies are in it, and the reasons people wrote for owning
                them. Nobody sees what anything is worth.
              </p>

              <div className="mt-5 flex flex-col gap-2">
                <p className="text-sm font-semibold text-foreground">
                  1. Pick what this circle sees
                </p>
                <ShareSheets communityId={communityId} onChanged={onShareChanged} />
              </div>

              {isAdmin ? (
                <div className="mt-6 flex flex-col gap-2">
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
                <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
                  Nobody else has shared a portfolio here yet. Yours will show
                  up as soon as you pick one above.
                </p>
              )}
            </section>
          )}

          {/*
            What changed since you last looked, from the copy of the circle
            that was already sitting in this browser. See
            `src/lib/circle-changes.ts` for why it never prints a number of
            shares and why a member who was not in the cached copy is
            skipped rather than announced.
          */}
          {shownView === "overview" && changes.length > 0 && (
            <section className="overview-fade order-0 rounded-xl glass ring-1 ring-foreground/20 p-6">
              <div className="mb-3 flex items-center gap-2.5">
                <div className="card-sheen glass-well rounded-xl p-2 text-primary">
                  <History className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-foreground">Since you last looked</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    What people bought and sold while you were away
                  </p>
                </div>
              </div>
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
            </section>
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
            <section className="overview-fade order-3 rounded-xl glass ring-1 ring-foreground/20 p-6">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="card-sheen glass-well rounded-xl p-2 text-primary">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-foreground">Power animals</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      How each portfolio is put together. Tap a row to open it
                      up.
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
              <div className="flex flex-col gap-2">
                {membersWithBooks.map((m) => (
                  <PowerAnimalCard
                    key={m.id}
                    name={m.name}
                    isYou={m.isYou}
                    isPending={m.isPending}
                    todayPct={m.todayPct}
                    personality={m.personality}
                    onOpen={() => {
                      onOpenMember(m.id);
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          {/*
            One award per person, chosen by the clearest margin. Ten awards
            for six people meant several people held three, and two of them
            contradicted each other on the same grid. `circle-awards.ts`
            holds the rule and the reason.
          */}
          {shownView === "play" && achievements.length > 0 && (
            <section className="overview-fade order-2 rounded-xl glass ring-1 ring-foreground/20 p-6">
              <div className="mb-4 flex items-center gap-2.5">
                <div className="card-sheen glass-well rounded-lg p-2 text-muted-foreground">
                  <Award className="size-4" />
                </div>
                <div>
                  <h3 className="text-foreground">Who stands out</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    One each, for whatever they are furthest ahead on
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
              <section className="overview-fade rounded-xl glass ring-1 ring-foreground/20 p-6">
                <div className="mb-4 flex items-center gap-2.5">
                  <div className="rounded-xl bg-gain/15 p-2 text-gain">
                    <Layers className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-foreground">Holdings you share</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Tap a company to read why each person owns it
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
                        onOpen={() => setOpenTicker(row.ticker)}
                      />
                    </Fragment>
                  ))}
                </ItemGroup>
              </section>
            </BelowFold>
          )}

          {shownView === "play" && communityThemeBreakdown.length > 0 && (
            <section className="overview-fade order-5 rounded-xl glass ring-1 ring-foreground/20 p-6">
              <div className="mb-4 flex items-center gap-2.5">
                <div className="card-sheen glass-well rounded-xl p-2 text-primary">
                  <PieChart className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-foreground">What the circle owns</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Everyone&apos;s holdings added together and grouped by kind
                    of business. This shows how the circle is put together, and
                    is not a recommendation.
                  </p>
                </div>
              </div>
              <p className="mb-1.5 text-sm text-muted-foreground">The circle</p>
              <ThemeBar slices={communityThemeBreakdown} />
              {yourThemeBreakdown.length > 0 ? (
                <>
                  <p className="mb-1.5 mt-4 text-sm text-muted-foreground">You</p>
                  <ThemeBar slices={yourThemeBreakdown} />
                </>
              ) : null}
              {gapLine ? (
                <p className="mt-4 text-sm leading-relaxed text-foreground">
                  {gapLine}
                </p>
              ) : null}
              <SwatchLegend
                className="mt-4"
                items={communityThemeBreakdown.map((t) => ({
                  key: t.theme,
                  label: t.label,
                  color: THEME_COLOR[t.theme],
                  value: themePctLabel(t.pct),
                }))}
              />
            </section>
          )}

          {shownView === "play" && (
            <section className="overview-fade order-6 rounded-xl glass ring-1 ring-foreground/20 p-6">
              <div className="mb-4 flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="card-sheen glass-well rounded-xl p-2 text-primary">
                    <Lightbulb className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-foreground">Circle facts</h3>
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
            </section>
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

      {openTicker ? (
        <ReasonsSheet
          ticker={openTicker}
          reasons={sharedReasons.get(openTicker) ?? []}
          youHold={youHold.has(openTicker)}
          onClose={() => setOpenTicker(null)}
        />
      ) : null}
    </>
  );
}

/**
 * Everybody's reason for one company, side by side.
 *
 * A person who owns it and has not written a reason gets the nudge rather
 * than a blank: the reason field is the one piece of work this product asks
 * anybody to do, and the moment you notice it is missing is when you are
 * looking at three friends who did it.
 */
function ReasonsSheet({
  ticker,
  reasons,
  youHold,
  onClose,
}: {
  ticker: string;
  reasons: SharedReason[];
  youHold: boolean;
  onClose: () => void;
}) {
  const anyReason = reasons.some((r) => r.reason);
  return (
    <ViewportOverlay
      className="z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      onClose={onClose}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="scroll-host relative max-h-full w-full overflow-y-auto rounded-t-xl bg-popover p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] ring-1 ring-foreground/20 sm:max-w-md sm:rounded-xl sm:pb-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Why people own {cashtag(ticker)}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              In their own words. Only people who chose to share their reasons
              show up here.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
            className="touch-target shrink-0 sm:size-7"
          >
            <X />
          </Button>
        </div>
        <div className="flex flex-col gap-3">
          {reasons.map((r) => (
            <div
              key={r.person}
              className="card-sheen glass-well rounded-lg p-3.5"
            >
              <p className="text-sm font-semibold text-foreground">{r.person}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {r.reason ?? "Has not written a reason for this one yet."}
              </p>
            </div>
          ))}
          {!anyReason ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Nobody has written down why they own this one.
            </p>
          ) : null}
          {youHold ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              You own it too. Write your reason in Pulse and it shows up here.
            </p>
          ) : null}
        </div>
      </div>
    </ViewportOverlay>
  );
}
