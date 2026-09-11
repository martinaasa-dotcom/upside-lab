/**
 * `CirclePicker` reads "my circles" from this file, and it mounts more
 * than once per reader: `AppHeader` renders the phone and desktop title
 * rows at all times and CSS-hides one rather than unmounting it, so one
 * circle room is already two live pickers, and up to `MAX_COMMUNITY_ROOMS`
 * kept-alive rooms can each have their own pair. Without a single-flight
 * guard that is up to eight identical `/api/communities` requests for one
 * answer, on the same free-tier account this app is built around
 * everywhere else. This file holds that guarantee, and the fan-out that
 * makes it safe to share: every subscriber hears the one answer, not just
 * whichever caller happened to trigger the fetch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityListRow } from "@/lib/community-cache";

let calls = 0;
let responseRows: CommunityListRow[] = [];

vi.stubGlobal(
  "fetch",
  vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    // Only the shared list endpoint is what this file measures. A refresh
    // also fires `prefetchCommunityList`, which fans out per-row reads
    // (`/api/communities/<id>`, its `/book`, its `/duel`, its `/sheets`) —
    // real, fire-and-forget traffic that is not part of what single-flight
    // promises here, so it must not be counted as a second "list" call.
    if (url === "/api/communities") {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new Response(JSON.stringify({ communities: responseRows }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  })
);

const {
  loadCommunityListCache,
  publishCommunityList,
  refreshCommunityListOnce,
  subscribeCommunityList,
} = await import("@/lib/community-cache");

const ROWS: CommunityListRow[] = [
  { id: "a", name: "The Aasa family", role: "admin" },
  { id: "b", name: "Book club", role: "member" },
];

const unsubs: Array<() => void> = [];

beforeEach(() => {
  calls = 0;
  responseRows = ROWS;
});

afterEach(() => {
  while (unsubs.length) unsubs.pop()?.();
});

describe("the shared circles list", () => {
  it("costs one request however many pickers ask for it at once", async () => {
    await Promise.all([
      refreshCommunityListOnce(),
      refreshCommunityListOnce(),
      refreshCommunityListOnce(),
    ]);
    expect(calls).toBe(1);
    expect(loadCommunityListCache()).toEqual(ROWS);
  });

  it("hands the answer to every subscriber, not just whoever asked", async () => {
    const seenByFirst: CommunityListRow[][] = [];
    const seenBySecond: CommunityListRow[][] = [];
    unsubs.push(subscribeCommunityList((rows) => seenByFirst.push(rows)));
    unsubs.push(subscribeCommunityList((rows) => seenBySecond.push(rows)));
    await refreshCommunityListOnce();
    expect(seenByFirst).toEqual([ROWS]);
    expect(seenBySecond).toEqual([ROWS]);
  });

  it("is not a cache — a refresh after the first settles is a real request", async () => {
    await refreshCommunityListOnce();
    await refreshCommunityListOnce();
    expect(calls).toBe(2);
  });

  it("an unsubscribed listener hears nothing further", async () => {
    const seen: CommunityListRow[][] = [];
    const unsubscribe = subscribeCommunityList((rows) => seen.push(rows));
    unsubscribe();
    await refreshCommunityListOnce();
    expect(seen).toEqual([]);
  });

  it("publishing directly reaches subscribers and the cache without a fetch", () => {
    const seen: CommunityListRow[][] = [];
    unsubs.push(subscribeCommunityList((rows) => seen.push(rows)));
    const callsBefore = calls;
    const fresh: CommunityListRow[] = [
      { id: "c", name: "Just joined", role: "member" },
    ];
    publishCommunityList(fresh);
    expect(seen).toEqual([fresh]);
    expect(loadCommunityListCache()).toEqual(fresh);
    expect(calls).toBe(callsBefore);
  });
});
