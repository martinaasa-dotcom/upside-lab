"use client";

import type { CommunityJoinRequest, CommunityMember } from "@/components/community-types";
import { Button } from "@/components/ui/button";
import {
  arrivalsLine,
  arrivalsSeenKey,
  recentArrivals,
  waitingLine,
} from "@/lib/circle-access-notice";
import { UserCheck, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/**
 * The card at the top of a circle that says who arrived.
 *
 * It replaces a badge carrying a single digit beside the circle's name,
 * which is the smallest thing on the screen and never said who, or when,
 * or gave anywhere to answer. See `circle-access-notice.ts` for why there
 * are two halves and why the news half is dated rather than dismissed.
 */
export function CircleAccessNotice({
  communityId,
  isAdmin,
  members,
  joinRequests,
  joinDecisionBusyId,
  profileName,
  decideJoinRequest,
  onOpenMembers,
}: {
  communityId: string;
  isAdmin: boolean;
  members: CommunityMember[];
  joinRequests: CommunityJoinRequest[];
  joinDecisionBusyId: string | null;
  profileName: (id: string) => string;
  decideJoinRequest: (
    userId: string,
    decision: "approve" | "reject"
  ) => Promise<void>;
  onOpenMembers: () => void;
}) {
  /*
    Read once on mount rather than during render: a stamp in localStorage
    is per browser, so a server render has nothing to say about it and
    reading it in the render body would disagree with the markup that
    arrived. Null until read, which shows nothing, which is the right
    thing for the one frame it lasts.
  */
  const [seenThrough, setSeenThrough] = useState<string | null | undefined>(
    undefined
  );
  useEffect(() => {
    try {
      setSeenThrough(window.localStorage.getItem(arrivalsSeenKey(communityId)));
    } catch {
      setSeenThrough(null);
    }
  }, [communityId]);

  const arrivals = useMemo(
    () =>
      recentArrivals({
        members,
        nameOf: profileName,
        seenThrough: seenThrough ?? null,
        now: Date.now(),
      }),
    [members, profileName, seenThrough]
  );

  const waiting = isAdmin ? joinRequests : [];
  const showArrivals = seenThrough !== undefined && arrivals.joined.length > 0;
  if (waiting.length === 0 && !showArrivals) return null;

  function markArrivalsRead() {
    const newest = arrivals.newest;
    setSeenThrough(newest);
    if (!newest) return;
    try {
      window.localStorage.setItem(arrivalsSeenKey(communityId), newest);
    } catch {
      /* a browser that refuses to remember just tells them again */
    }
  }

  return (
    <section className="card-sheen glass flex flex-col gap-4 rounded-xl p-4 ring-1 ring-foreground/20 sm:p-5">
      {waiting.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-base font-semibold text-foreground">
            <UserCheck className="size-4 shrink-0 text-primary" />
            {waitingLine(waiting.length)}
          </p>
          <ul className="flex flex-col gap-2">
            {waiting.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">
                    {r.profile?.display_name ?? r.profile?.email ?? "Someone"}
                  </span>
                  {r.profile?.email ? (
                    <span className="truncate text-sm text-muted-foreground">
                      {r.profile.email}
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={joinDecisionBusyId === r.user_id}
                    onClick={() => void decideJoinRequest(r.user_id, "approve")}
                  >
                    Let them in
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={joinDecisionBusyId === r.user_id}
                    onClick={() => void decideJoinRequest(r.user_id, "reject")}
                  >
                    Decline
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showArrivals && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-2 text-base font-semibold text-foreground">
            <UserPlus className="size-4 shrink-0 text-primary" />
            {arrivalsLine(arrivals.joined)}
          </p>
          <span className="flex shrink-0 items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onOpenMembers}>
              See who
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={markArrivalsRead}
            >
              Got it
            </Button>
          </span>
        </div>
      )}
    </section>
  );
}
