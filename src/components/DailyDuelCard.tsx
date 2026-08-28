"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import {
  loadCommunityDuelCache,
  loadStickyDuelPick,
  saveCommunityDuelCache,
  saveStickyDuelPick,
  type CommunityDuelCache,
} from "@/lib/community-cache";
import { Swords } from "lucide-react";
import { cn, percent, cashtag } from "@/lib/format";
import { SPLIT_COPY, SPLIT_ROW } from "@/components/ui/Panel";
import {
  currentDuelSessionKey,
  duelCanSettle,
  duelResultLine,
  duelSessionCopy,
  duelSessionLabel,
  duelStats,
  getOrCreateTodaysDuel,
  loadDuelHistory,
  makeDuelPick,
  pickTodaysDuel,
  resolvePendingOutcome,
  type DuelPick,
  type DuelRecord,
} from "@/lib/daily-duel";

/** What the server sees: no local history, so nothing played yet. */
const EMPTY_DUEL_STATS = duelStats([]);

type Props = {
  tickers: Array<{ ticker: string; todayPct: number | null }>;
  compact?: boolean;
  /** When set, today's pair and picks are shared with the circle. */
  communityId?: string;
  /** Cached duel from the parent layout effect, so the first paint has the pick. */
  initialDuel?: CommunityDuelCache | null;
};

type CommunityDuel = CommunityDuelCache;

function readCachedDuel(
  communityId: string | undefined,
  sessionKey: string,
  initialDuel: CommunityDuelCache | null | undefined
): CommunityDuel | null {
  if (!communityId) return initialDuel ?? null;
  if (initialDuel && initialDuel.dayKey === sessionKey) return initialDuel;
  const cached = loadCommunityDuelCache(communityId, sessionKey);
  if (cached) return cached;
  const sticky = loadStickyDuelPick(communityId, sessionKey);
  if (!sticky) return initialDuel ?? null;
  return {
    dayKey: sessionKey,
    pair: initialDuel?.pair ?? null,
    myPick: sticky,
    counts: initialDuel?.counts ?? { a: 0, b: 0 },
    settled: false,
    pickCount: initialDuel?.pickCount ?? 0,
  };
}

/** Pick who finishes the next US cash session higher. Never the previous day. */
export function DailyDuelCard({
  tickers,
  communityId,
  initialDuel = null,
}: Props) {
  const sessionKey = currentDuelSessionKey();
  const tickerList = useMemo(() => tickers.map((t) => t.ticker), [tickers]);
  const tickerKey = useMemo(() => tickerList.join("|"), [tickerList]);
  const pctByTicker = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const t of tickers) map[t.ticker] = t.todayPct;
    return map;
  }, [tickers]);

  const [record, setRecord] = useState<DuelRecord | null>(null);
  const [community, setCommunity] = useHydratedCache<CommunityDuel | null>(
    () => readCachedDuel(communityId, sessionKey, initialDuel),
    initialDuel && initialDuel.dayKey === sessionKey ? initialDuel : null
  );

  function commitCommunity(
    next:
      | CommunityDuel
      | null
      | ((prev: CommunityDuel | null) => CommunityDuel | null)
  ) {
    setCommunity((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      if (communityId && resolved) {
        saveCommunityDuelCache(communityId, resolved);
        if (resolved.myPick) {
          saveStickyDuelPick(communityId, resolved.dayKey, resolved.myPick);
        }
      }
      return resolved;
    });
  }

  const [stats, setStats] = useHydratedCache(
    () => duelStats(loadDuelHistory()),
    EMPTY_DUEL_STATS
  );
  const [canSettle, setCanSettle] = useState(false);

  useLayoutEffect(() => {
    if (communityId) return;
    setRecord(getOrCreateTodaysDuel(tickerList, sessionKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on tickerKey, not the array identity
  }, [communityId, sessionKey, tickerKey]);

  useLayoutEffect(() => {
    if (!communityId) return;
    const cached = readCachedDuel(communityId, sessionKey, initialDuel);
    if (cached) setCommunity(cached);
  }, [communityId, sessionKey, initialDuel, setCommunity]);

  useEffect(() => {
    if (!communityId) return;
    const ctrl = new AbortController();
    void fetch(`/api/communities/${communityId}/duel`, {
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: CommunityDuel | null) => {
        if (ctrl.signal.aborted || !data) return;
        commitCommunity((prev) => {
          const keepPick =
            prev?.myPick &&
            !data.myPick &&
            data.dayKey === sessionKey;
          return keepPick ? { ...data, myPick: prev.myPick } : data;
        });
      })
      .catch(() => {
        /* keep whatever we have */
      });
    return () => {
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- commitCommunity is local
  }, [communityId, sessionKey]);

  useEffect(() => {
    const tick = () => setCanSettle(duelCanSettle(sessionKey));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [sessionKey]);

  useEffect(() => {
    if (communityId) return;
    if (!record || record.pick == null || record.outcome !== "pending") return;
    if (!canSettle) return;
    const updated = resolvePendingOutcome(sessionKey, pctByTicker);
    if (updated && updated.outcome !== "pending") {
      setRecord(updated);
      setStats(duelStats(loadDuelHistory()));
    }
  }, [communityId, record, pctByTicker, sessionKey, canSettle, setStats]);

  const instantPair = useMemo(
    () => pickTodaysDuel(tickerList, sessionKey, communityId ?? ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on tickerKey, not the array identity
    [sessionKey, communityId, tickerKey]
  );
  const pair = communityId
    ? community?.pair ?? instantPair
    : record
      ? { a: record.tickerA, b: record.tickerB }
      : instantPair;
  const myPick = communityId
    ? (community?.myPick ?? null)
    : (record?.pick ?? null);
  const sessionWhen = duelSessionLabel(sessionKey);
  const sessionLine = communityId
    ? `The circle's pick. ${duelSessionCopy(sessionKey)}`
    : `Tap who you think finishes ${sessionWhen === "today" ? "today's" : `${sessionWhen}'s`} US session higher.`;

  if (!pair) {
    return (
      <section
        className={cn(
          "card-sheen glass min-h-[13.5rem] rounded-xl p-6 ring-1 ring-foreground/20"
        )}
      >
        <div className="mb-3 flex items-center gap-2.5">
          <div className="card-sheen glass-well rounded-xl p-2 text-primary">
            <Swords className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-foreground">Daily Duel</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{sessionLine}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-[5.5rem] glass-well rounded-lg" />
          <div className="h-[5.5rem] glass-well rounded-lg" />
        </div>
      </section>
    );
  }

  function pick(choice: DuelPick) {
    if (communityId) {
      if (community?.myPick) return;
      const previous = community;
      const optimistic: CommunityDuel = previous
        ? {
            ...previous,
            myPick: choice,
            pickCount: previous.pickCount + 1,
            counts: {
              ...previous.counts,
              [choice]: previous.counts[choice] + 1,
            },
          }
        : {
            dayKey: sessionKey,
            pair,
            myPick: choice,
            counts: { a: choice === "a" ? 1 : 0, b: choice === "b" ? 1 : 0 },
            settled: false,
            pickCount: 1,
          };
      commitCommunity(optimistic);
      void fetch(`/api/communities/${communityId}/duel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pick: choice }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then(() =>
          fetch(`/api/communities/${communityId}/duel`, { cache: "no-store" })
        )
        .then((r) => (r && r.ok ? r.json() : null))
        .then((data: CommunityDuel | null) => {
          if (!data) return;
          commitCommunity((prev) => {
            const keepPick =
              prev?.myPick && !data.myPick && data.dayKey === sessionKey;
            return keepPick ? { ...data, myPick: prev.myPick } : data;
          });
        })
        .catch(() => {
          if (previous) commitCommunity(previous);
          else setCommunity(null);
        });
      return;
    }
    const updated = makeDuelPick(sessionKey, choice, pctByTicker);
    if (updated) {
      setRecord(updated);
      setStats(duelStats(loadDuelHistory()));
    }
  }

  const decided = communityId
    ? Boolean(community?.settled && myPick && canSettle)
    : Boolean(record && record.pick != null && record.outcome !== "pending");
  const resultLine =
    !communityId && record && decided ? duelResultLine(record) : null;
  const waitingOnClose = myPick != null && !decided;
  const closeWhen =
    sessionWhen === "today"
      ? "the US close today, at 16:00 New York time"
      : `the US close ${sessionWhen}, at 16:00 New York time`;

  const communityLine = communityId
    ? myPick == null
      ? "Same matchup for everyone here. One tap locks it."
      : waitingOnClose
        ? `${community?.pickCount ?? 1} ${(community?.pickCount ?? 1) === 1 ? "person has" : "people have"} picked. Results come after ${closeWhen}.`
        : communityVoteLine(community, pair)
    : null;

  return (
    <section
      className={cn(
        "card-sheen glass min-h-[13.5rem] rounded-xl p-6 ring-1 ring-foreground/20"
      )}
    >
      <div className={cn("mb-3", SPLIT_ROW, "sm:items-center")}>
        <div className={cn(SPLIT_COPY, "flex items-center gap-2.5")}>
          <div className="card-sheen glass-well rounded-xl p-2 text-primary">
            <Swords className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-foreground">Daily Duel</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{sessionLine}</p>
          </div>
        </div>
        {communityId && (community?.pickCount ?? 0) > 0 ? (
          <p className="shrink-0 text-sm text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">
              {community?.pickCount ?? 0}
            </span>
            {(community?.pickCount ?? 0) === 1 ? " pick" : " picks"}
          </p>
        ) : (
          !communityId &&
          stats.totalPlayed > 0 && (
            <div className="text-right">
              <p className="text-sm text-muted-foreground">
                Record
              </p>
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {stats.totalCorrect}/{stats.totalPlayed}
                <span className="ml-1.5 font-normal text-muted-foreground">
                  ({percent(stats.accuracyPct ?? 0, 0)})
                </span>
              </p>
              {stats.currentStreak >= 2 && (
                <p className="text-sm text-caution">
                  {stats.currentStreak} in a row
                </p>
              )}
            </div>
          )
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(["a", "b"] as const).map((side) => {
          const ticker = side === "a" ? pair.a : pair.b;
          const pct = decided
            ? communityId
              ? (pctByTicker[ticker] ?? null)
              : side === "a"
                ? record?.revealedPctA ?? null
                : record?.revealedPctB ?? null
            : null;
          const isPick = myPick === side;
          const isWinner =
            decided &&
            pct != null &&
            (side === "a"
              ? (pctByTicker[pair.a] ?? 0) >= (pctByTicker[pair.b] ?? 0)
              : (pctByTicker[pair.b] ?? 0) >= (pctByTicker[pair.a] ?? 0));
          const localWinner =
            !communityId &&
            decided &&
            record?.revealedPctA != null &&
            record?.revealedPctB != null &&
            (side === "a"
              ? record.revealedPctA >= record.revealedPctB
              : record.revealedPctB >= record.revealedPctA);
          const win = communityId ? isWinner : localWinner;
          return (
            <button
              key={side}
              type="button"
              disabled={myPick != null}
              onClick={() => pick(side)}
              className={cn(
                "touch-target flex h-full flex-col items-center justify-center rounded-xl border px-4 py-4 text-center transition",
                myPick == null
                  ? "veil-hover border-border bg-muted hover:scale-[1.02] hover:border-ring/40 active:scale-[0.98]"
                  : win
                    ? "border-gain/50 bg-gain/10"
                    : waitingOnClose && isPick
                      ? "border-border bg-muted"
                      : "border-border bg-muted opacity-70",
                isPick && "ring-2 ring-ring/60"
              )}
            >
              <p className="text-lg font-semibold text-foreground">
                {cashtag(ticker)}
              </p>
              {isPick && (
                <p className="mt-1 text-sm font-medium text-primary">
                  Your pick
                </p>
              )}
              {communityId &&
                decided &&
                community &&
                community.counts[side] > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {community.counts[side]} vote
                  {community.counts[side] === 1 ? "" : "s"}
                </p>
              )}
              {waitingOnClose && isPick && !communityId && (
                <p className="mt-2 text-sm text-muted-foreground">Locked. No peek</p>
              )}
              {pct != null && (
                <p
                  className={cn(
                    "mt-2 text-lg font-semibold tabular-nums",
                    pct > 0
                      ? "text-gain"
                      : pct < 0
                        ? "text-loss"
                        : "text-muted-foreground"
                  )}
                >
                  {percent(pct)}
                </p>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-center text-sm leading-relaxed text-muted-foreground">
        {communityId
          ? communityLine
          : myPick == null
            ? "One tap locks your pick in. You cannot change it afterwards, and there is no running percentage until the US market closes."
            : waitingOnClose
              ? `Your pick is locked in. Results come after ${closeWhen}.`
              : resultLine}
      </p>
    </section>
  );
}

function communityVoteLine(
  community: CommunityDuel | null,
  pair: { a: string; b: string }
): string {
  if (!community) return "Locked in.";
  const a = community.counts.a;
  const b = community.counts.b;
  const namesA = community.names?.a?.join(", ");
  const namesB = community.names?.b?.join(", ");
  const split = `${cashtag(pair.a)} ${a} · ${cashtag(pair.b)} ${b}`;
  if (namesA || namesB) {
    const bits = [
      namesA ? `${cashtag(pair.a)}: ${namesA}` : null,
      namesB ? `${cashtag(pair.b)}: ${namesB}` : null,
    ].filter(Boolean);
    return `${split}. ${bits.join(". ")}`;
  }
  return split;
}
