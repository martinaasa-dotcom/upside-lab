"use client";

import {
  loadCommunityListCache,
  prefetchCommunityList,
} from "@/lib/community-cache";
import { WelcomeTourGate } from "@/components/WelcomeTourGate";
import {
  WORKSPACE_SHOW_EVENT,
  WORKSPACE_DOCK_SLOT_ID,
  setActiveWorkspaceRoom,
  workspaceRoomId,
} from "@/lib/workspace-rooms";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";

const MAX_COMMUNITY_ROOMS = 4;

const BookRoom = dynamic(
  () => import("@/components/workspace-rooms").then((m) => m.BookRoom),
  { ssr: true }
);
const FundRoom = dynamic(
  () => import("@/components/workspace-rooms").then((m) => m.FundRoom),
  { ssr: true }
);
const CommunitiesList = dynamic(
  () =>
    import("@/components/CommunitiesList").then((m) => m.CommunitiesList),
  { ssr: true }
);
const CommunityView = dynamic(
  () => import("@/components/CommunityView").then((m) => m.CommunityView),
  { ssr: true }
);
const AccountPage = dynamic(
  () => import("@/components/AccountPage").then((m) => m.AccountPage),
  { ssr: true }
);
const AdminPage = dynamic(
  () => import("@/components/AdminPage").then((m) => m.AdminPage),
  { ssr: true }
);

function pruneCommunityRooms(mounted: Set<string>, keep: string) {
  const keys = [...mounted].filter((k) => k.startsWith("community:"));
  for (const key of keys) {
    if (keys.length <= MAX_COMMUNITY_ROOMS) break;
    if (key === keep) continue;
    mounted.delete(key);
    keys.splice(keys.indexOf(key), 1);
  }
}

function Room({
  on,
  children,
}: {
  on: boolean;
  children: ReactNode;
}) {
  return (
    <div hidden={!on} inert={!on} aria-hidden={!on}>
      {children}
    </div>
  );
}

/**
 * Keep visited rooms mounted. Circle → Overview used to unmount the whole
 * Dashboard and rebuild it, which is why the jump felt slow even with a
 * warm cache. Hidden panes stay inert; the live one is already painted.
 */
export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const room = workspaceRoomId(pathname);
  const mountedRef = useRef<Set<string>>(new Set());
  const prevRoomRef = useRef<string | null>(null);
  const scrollRef = useRef(new Map<string, number>());

  if (room) {
    mountedRef.current.add(room);
    // Keep the book (and its dock) mounted so Circle does not swap the
    // bottom chrome. Hidden rooms stay inert; the dock portals out.
    mountedRef.current.add("book");
    pruneCommunityRooms(mountedRef.current, room);
  }

  const mounted = mountedRef.current;

  /*
    WHICH ROOM IS LIVE IS A QUESTION EVERY PATH ANSWERS. BEING SHOWN AGAIN
    IS NOT, AND THE TWO USED TO SHARE AN EFFECT.

    The book is many paths and one room now: `/`, `/pulse`, `/lab`,
    `/growth`, `/alerts` and every `/portfolio/<slug>`. Walking between
    them changes `pathname` and does not change `room`, and the room is
    never hidden in between, so there is nothing to restore and nothing to
    tell. Saying it anyway would restore the offset saved the last time the
    book was left, dropping a reader who tapped Pulse somewhere down the
    middle of it, and would fire WORKSPACE_SHOW_EVENT, whose handler
    re-reads the URL and reloads the book when its cache is not fresh --
    turning every tap on the dock into a fetch.

    None of that could happen while the Dashboard wrote its own URLs with
    `history.pushState`, which `usePathname` does not observe, so this
    effect only ever ran on a real room change and looked correct. It stays
    correct only while the guard below is here. `workspace-shell.test.ts`
    fails if it goes.
  */
  useLayoutEffect(() => {
    setActiveWorkspaceRoom(room);
  }, [pathname, room]);

  useLayoutEffect(() => {
    const prev = prevRoomRef.current;
    if (prev === room) return;
    if (prev) scrollRef.current.set(prev, window.scrollY);
    prevRoomRef.current = room;
    if (!room) return;
    window.scrollTo(0, scrollRef.current.get(room) ?? 0);
    window.dispatchEvent(new Event(WORKSPACE_SHOW_EVENT));
  }, [room]);

  useEffect(() => {
    const warm = () => {
      router.prefetch("/communities");
      router.prefetch("/upside-portfolio");
      router.prefetch("/account");
      const list = loadCommunityListCache();
      if (list?.[0]) router.prefetch(`/communities/${list[0].id}`);
      if (list?.length) prefetchCommunityList(list);
      void import("@/components/workspace-rooms");
      void import("@/components/CommunitiesList");
      void import("@/components/CommunityView");
    };
    const w = window as Window & {
      requestIdleCallback?: (
        cb: () => void,
        o?: { timeout: number }
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(warm, { timeout: 2500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(warm, 800);
    return () => window.clearTimeout(id);
  }, [router]);

  if (!room) return children;

  return (
    <>
      {mounted.has("book") && (
        <Room on={room === "book"}>
          <BookRoom />
        </Room>
      )}
      {mounted.has("fund") && (
        <Room on={room === "fund"}>
          <FundRoom />
        </Room>
      )}
      {mounted.has("communities") && (
        <Room on={room === "communities"}>
          <CommunitiesList />
        </Room>
      )}
      {[...mounted]
        .filter((key) => key.startsWith("community:"))
        .map((key) => {
          const id = key.slice("community:".length);
          return (
            <Room key={key} on={room === key}>
              <CommunityView communityId={id} />
            </Room>
          );
        })}
      {mounted.has("account") && (
        <Room on={room === "account"}>
          <AccountPage />
        </Room>
      )}
      {mounted.has("admin") && (
        <Room on={room === "admin"}>
          <AdminPage />
        </Room>
      )}
      <div id={WORKSPACE_DOCK_SLOT_ID} />
      <WelcomeTourGate />
    </>
  );
}
