"use client";

import { isAbortError } from "@/lib/abort";
import { isBestDaysRead, type BestDaysRead } from "@/lib/market-temperature";
import { useEffect, useState } from "react";

/*
  THE ONE READ IN THIS ROOM THAT ONLY A READER WHO SCROLLS TO IT PAYS FOR.

  The ten-year figure used to ride on the sentiment snapshot, which every
  reader fetches from Home on a poll, and measured that made the payload 24%
  larger for something one Lab tab draws. It has its own route now, and this
  component is the whole reason that is affordable: `BelowFold` withholds the
  mount, so the fetch does not happen at all until the section is about a
  screen away. A reader who opens the Playbook and reads the ladder never
  asks for it.

  Nothing while it is in flight, and nothing if it never arrives. A skeleton
  would promise a section that a provider having a bad minute cannot
  deliver, and the room reads correctly without it: the ladder, the recovery
  gap and the ideas are all still there, and none of them is about this.
*/
export function BestDaysSection({
  children,
}: {
  /** The panel wrapper, given the read once there is one. */
  children: (read: BestDaysRead) => React.ReactNode;
}) {
  const [read, setRead] = useState<BestDaysRead | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/market/best-days", {
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const data: unknown = await res.json();
        if (ctrl.signal.aborted) return;
        const next = (data as { bestDays?: unknown }).bestDays;
        if (isBestDaysRead(next)) setRead(next);
      } catch (err) {
        if (isAbortError(err)) return;
      }
    })();
    return () => ctrl.abort();
  }, []);

  if (!read) return null;
  return <>{children(read)}</>;
}
