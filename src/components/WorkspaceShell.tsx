"use client";

import {
  loadCommunityListCache,
  prefetchCommunityList,
} from "@/lib/community-cache";
import { WelcomeTourGate } from "@/components/WelcomeTourGate";
import {
  GROWTH_PATH,
  LAB_PATH,
  PORTFOLIO_PATH,
  PULSE_PATH,
} from "@/lib/book-routes";
import {
  WORKSPACE_SHOW_EVENT,
  WORKSPACE_DOCK_SLOT_ID,
  setActiveWorkspaceRoom,
  workspaceRoomId,
} from "@/lib/workspace-rooms";
import { AIM_GIVES_UP_MS, onRouteAim } from "@/lib/route-aim";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const MAX_COMMUNITY_ROOMS = 4;

/*
 * ONE NAMED LOADER PER ROOM, USED BOTH TO RENDER IT AND TO WARM IT.
 *
 * The warm below only works if the module it asks for is the module
 * `dynamic` will ask for. Written as two separate `import()` expressions
 * the bundler is free to give them different chunk groups, and measured on
 * the real build it did: the idle warm ran and the first tap on a room
 * still fetched that room's chunk. Referencing one loader from both places
 * removes the question. Dashboard's tab panels have the same pattern for
 * the same reason.
 */
const loadBookRoom = () =>
  import("@/components/workspace-rooms").then((m) => m.BookRoom);
const loadFundRoom = () =>
  import("@/components/workspace-rooms").then((m) => m.FundRoom);
const loadCommunitiesList = () =>
  import("@/components/CommunitiesList").then((m) => m.CommunitiesList);
const loadCommunityView = () =>
  import("@/components/CommunityView").then((m) => m.CommunityView);
const loadAccountPage = () =>
  import("@/components/AccountPage").then((m) => m.AccountPage);
const loadAdminPage = () =>
  import("@/components/AdminPage").then((m) => m.AdminPage);

const BookRoom = dynamic(loadBookRoom, { ssr: true });
const FundRoom = dynamic(loadFundRoom, { ssr: true });
const CommunitiesList = dynamic(loadCommunitiesList, { ssr: true });
const CommunityView = dynamic(loadCommunityView, { ssr: true });
const AccountPage = dynamic(loadAccountPage, { ssr: true });
const AdminPage = dynamic(loadAdminPage, { ssr: true });

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
  /*
    THE ROOM CHANGES ON THE PRESS, FOR THE SAME REASON THE BOOK'S TABS DO.

    `Dashboard` already refuses to wait for the router before showing the
    tab a press asked for, because `<Link>` navigates inside a transition
    and a transition holds the old screen until the new one is completely
    built. It only ever accepted a bet on a book path, though, since a
    book path is all it can draw -- so every press that leaves the book
    (Circle, the Fund, Account) still waited out the whole commit.

    Measured on the real app at 4x CPU, diffing painted frames above the
    dock so the marker's own movement cannot be mistaken for the page
    answering: tapping a book tab changed the content in 111-275ms, and
    tapping Circle changed nothing for 274-441ms. The gap is the part of
    the commit the book skips and the shell did not.

    Reading the aim here mounts the room on the press and lets it show its
    own loading state, which is the answer the reader asked for. The
    router's URL is still what settles it. The bet loses the same three
    ways it loses in the book -- the room answers with somewhere else,
    nothing answers within `AIM_GIVES_UP_MS`, or the press never became a
    navigation -- and losing costs a room the reader is about to leave.
  */
  const [aimedPath, setAimedPath] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = onRouteAim((path) => {
      if (timer) clearTimeout(timer);
      if (path === null) {
        setAimedPath(null);
        return;
      }
      /*
       * Only a path this shell can actually draw. A press heading for a
       * page with no room of its own (`/privacy`, a join link) would
       * otherwise blank whichever room is on screen and put `children`
       * there, which is a worse answer than waiting.
       */
      if (!workspaceRoomId(path)) return;
      setAimedPath(path);
      timer = setTimeout(() => setAimedPath(null), AIM_GIVES_UP_MS);
    });
    return () => {
      stop();
      if (timer) clearTimeout(timer);
    };
  }, []);
  /* The router answered. Whatever it answered with is the truth from here. */
  useEffect(() => {
    setAimedPath(null);
  }, [pathname]);

  const shownPath = aimedPath ?? pathname;
  const room = workspaceRoomId(shownPath);
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
  }, [shownPath, room]);

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
      /*
       * The book's own paths were never in this list. They are separate
       * routes -- `/pulse`, `/lab`, `/growth`, `/portfolio` -- and the dock
       * links them, so `<Link prefetch>` covers them once the dock is on
       * screen; asking again here is free (an address already in the cache
       * is a no-op) and covers the window before the dock has rendered.
       */
      for (const path of [
        "/",
        PULSE_PATH,
        LAB_PATH,
        GROWTH_PATH,
        PORTFOLIO_PATH,
      ]) {
        router.prefetch(path);
      }
      router.prefetch("/communities");
      router.prefetch("/upside-portfolio");
      router.prefetch("/account");
      const list = loadCommunityListCache();
      if (list?.[0]) router.prefetch(`/communities/${list[0].id}`);
      if (list?.length) prefetchCommunityList(list);
      void loadBookRoom();
      void loadFundRoom();
      void loadCommunitiesList();
      void loadCommunityView();
      void loadAccountPage();
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
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
