import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOOK_ROOM_PATHS,
  PRIVATE_NOINDEX_PATHS,
  PUBLIC_INDEX_PATHS,
} from "@/lib/seo-routes";
import { workspaceRoomId } from "@/lib/workspace-paths";

describe("workspaceRoomId", () => {
  it("maps book aliases onto the keep-alive book pane", () => {
    for (const path of BOOK_ROOM_PATHS) {
      expect(workspaceRoomId(path)).toBe("book");
      if (path !== "/") expect(workspaceRoomId(`${path}/`)).toBe("book");
    }
  });

  it("does not cache join flows", () => {
    expect(workspaceRoomId("/communities/join")).toBeNull();
    expect(workspaceRoomId("/communities/join?token=abc")).toBeNull();
    expect(workspaceRoomId("/account/join")).toBeNull();
  });

  it("keeps circle, fund, and account rooms distinct", () => {
    expect(workspaceRoomId("/communities")).toBe("communities");
    expect(workspaceRoomId("/communities/abc")).toBe("community:abc");
    expect(workspaceRoomId("/upside-portfolio")).toBe("fund");
    expect(workspaceRoomId("/account")).toBe("account");
    expect(workspaceRoomId("/admin")).toBe("admin");
  });

  it("keeps /margus in the book, because Margus is a panel over Home", () => {
    // A room of its own would be a second Dashboard with its own pollers,
    // for a chat that floats over the one already mounted.
    expect(workspaceRoomId("/margus")).toBe("book");
    expect(workspaceRoomId("/margus/")).toBe("book");
  });
});

describe("private noindex paths", () => {
  it("covers the authenticated rooms crawlers must skip", () => {
    expect(PRIVATE_NOINDEX_PATHS).toEqual(
      expect.arrayContaining(["/lab", "/margus", "/account", "/auth"])
    );
  });

  it("names no path the proxy answers before any page runs", () => {
    // `/dashboard` and `/forecast` are 308s in `src/proxy.ts` and have no
    // page. A header or a robots line for them describes a response nobody
    // receives, and the book alias list would keep a room alive for it.
    for (const path of ["/dashboard", "/forecast"]) {
      expect(PRIVATE_NOINDEX_PATHS).not.toContain(path);
      expect(BOOK_ROOM_PATHS).not.toContain(path);
    }
  });
});

describe("every room a reader can reach is on one list or the other", () => {
  /*
    AGENTS.md says a new path goes into PRIVATE_NOINDEX_PATHS in the same
    commit that creates it, and that rule had nothing behind it but
    remembering. A page in neither list gets no X-Robots-Tag and no
    robots.txt line, which for an authenticated room means a crawler is
    free to index it and offer somebody's sign-in as a search result.

    Reading the directory rather than a third list, for the reason
    `cron-heartbeat.test.ts` reads vercel.json: a check that keeps its own
    copy of the answer is a copy that can drift.
  */
  const roomDirs = readdirSync(join(process.cwd(), "src/app"), {
    withFileTypes: true,
  })
    .filter((e) => e.isDirectory() && e.name !== "api")
    // A route group or a dynamic segment is not a path of its own.
    .filter((e) => !e.name.startsWith("(") && !e.name.startsWith("["))
    .map((e) => `/${e.name}`)
    .sort();

  it("finds the rooms, so a passing run means something", () => {
    expect(roomDirs).toEqual(expect.arrayContaining(["/account", "/pulse"]));
    expect(roomDirs.length).toBeGreaterThan(8);
  });

  it("leaves none of them undeclared", () => {
    const declared = new Set<string>([
      ...PUBLIC_INDEX_PATHS,
      ...PRIVATE_NOINDEX_PATHS,
    ]);
    expect(roomDirs.filter((p) => !declared.has(p))).toEqual([]);
  });

  it("declares nothing that has no page and no children", () => {
    /*
      The reverse drift. `/dashboard` and `/forecast` are covered above as
      proxy answers; this catches a room that was deleted while its entry
      stayed, which would put a robots line in front of a 404.
    */
    const known = new Set(roomDirs);
    const claimed = [...PRIVATE_NOINDEX_PATHS, ...PUBLIC_INDEX_PATHS].filter(
      (p) => p !== "/"
    );
    expect(claimed.filter((p) => !known.has(p))).toEqual([]);
  });
});
