import { loadCommunityListCache } from "@/lib/community-cache";

/** Fired when a kept-alive room is shown again. Pages sync URL / refresh. */
export const WORKSPACE_SHOW_EVENT = "upside:workspace-show";
/** Somebody pulled the page down and asked for new numbers. */
export const WORKSPACE_REFRESH_EVENT = "upside:workspace-refresh";
/** Fixed slot for the book dock. PortfolioTabs portals here so Circle
 * (and every other room) keeps the same bottom chrome, including sheets. */
export const WORKSPACE_DOCK_SLOT_ID = "workspace-dock";

const LAST_CIRCLE_KEY = "upside-last-circle-id";
const LAST_CIRCLE_EVENT = "upside:last-circle";

let activeRoom: string | null = null;

export function setActiveWorkspaceRoom(id: string | null) {
  activeRoom = id;
}

/** Hidden keep-alive rooms skip their pollers. Unset means the shell has not booted. */
export function isWorkspaceRoomActive(id: string): boolean {
  if (activeRoom == null) return true;
  return activeRoom === id;
}

/*
  A PULL ASKS THE ROOM THE FINGER IS IN, AND ONLY THAT ONE.

  Every room this shell has visited stays mounted and hidden, so a refresh
  broadcast to all of them would put four or five rooms' worth of fetches on
  the wire at once, against providers this app is deliberately on the free
  tier of. That is the same reason every poller in here already asks
  `isWorkspaceRoomActive` first, so this asks it in one place on their behalf.

  The room hands back whatever it is doing so the ring above it can stop when
  the work does rather than after a guessed number of milliseconds. Nothing
  hands anything back on Account or Admin, which have no figures that go
  stale, and `handled` is false there so the caller can fall back to asking
  the router for the page again.
*/
type WorkspaceRefreshDetail = { waitFor: (work: Promise<unknown>) => void };

export function requestWorkspaceRefresh(): Promise<{ handled: boolean }> {
  if (typeof window === "undefined") return Promise.resolve({ handled: false });
  const work: Promise<unknown>[] = [];
  window.dispatchEvent(
    new CustomEvent<WorkspaceRefreshDetail>(WORKSPACE_REFRESH_EVENT, {
      detail: { waitFor: (p) => work.push(p) },
    })
  );
  if (work.length === 0) return Promise.resolve({ handled: false });
  return Promise.allSettled(work).then(() => ({ handled: true }));
}

/**
 * Subscribe a room to the pull. `run` is called only while that room is the
 * one on screen, and whatever it returns is what the ring waits on.
 */
export function onWorkspaceRefresh(
  roomId: string,
  run: () => Promise<unknown>
): () => void {
  const handle = (event: Event) => {
    if (!isWorkspaceRoomActive(roomId)) return;
    const detail = (event as CustomEvent<WorkspaceRefreshDetail>).detail;
    if (!detail?.waitFor) return;
    detail.waitFor(
      Promise.resolve()
        .then(run)
        .catch(() => undefined)
    );
  };
  window.addEventListener(WORKSPACE_REFRESH_EVENT, handle);
  return () => window.removeEventListener(WORKSPACE_REFRESH_EVENT, handle);
}

export { workspaceRoomId } from "@/lib/workspace-paths";

export function saveLastCircleId(communityId: string) {
  if (typeof window === "undefined") return;
  const id = communityId.trim();
  if (!id) return;
  try {
    window.localStorage.setItem(LAST_CIRCLE_KEY, id);
    window.dispatchEvent(new Event(LAST_CIRCLE_EVENT));
  } catch {
    /* quota / private mode */
  }
}

export function loadLastCircleId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = window.localStorage.getItem(LAST_CIRCLE_KEY)?.trim();
    return id || null;
  } catch {
    return null;
  }
}

export function lastCircleEventName(): string {
  return LAST_CIRCLE_EVENT;
}

/** Circle dock: the circle you were just in, or the only one you have. */
export function circleHref(): string {
  if (typeof window === "undefined") return "/communities";
  try {
    const list = loadCommunityListCache();
    const last = loadLastCircleId();
    if (last && list?.some((c) => c.id === last)) return `/communities/${last}`;
    if (list?.length === 1 && list[0]) return `/communities/${list[0].id}`;
  } catch {
    /* ignore */
  }
  return "/communities";
}
