import { describe, expect, it } from "vitest";
import { BOOK_ROOM_PATHS, PRIVATE_NOINDEX_PATHS } from "@/lib/seo-routes";
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
