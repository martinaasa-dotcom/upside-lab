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

  useLayoutEffect(() => {
    const prev = prevRoomRef.current;
    if (prev && prev !== room) {
      scrollRef.current.set(prev, window.scrollY);
    }
    prevRoomRef.current = room;
    setActiveWorkspaceRoom(room);
    if (!room) return;
    window.scrollTo(0, scrollRef.current.get(room) ?? 0);
    window.dispatchEvent(new Event(WORKSPACE_SHOW_EVENT));
  }, [pathname, room]);

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
