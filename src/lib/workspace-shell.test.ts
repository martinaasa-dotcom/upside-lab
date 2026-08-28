/**
 * The book is many paths and one room, and being shown again is not the
 * same question as which room is live.
 *
 * `WorkspaceShell` used to answer both in one layout effect keyed on
 * `[pathname, room]`: save the outgoing room's scroll, restore the
 * incoming one's, and fire WORKSPACE_SHOW_EVENT. That was correct while
 * the Dashboard wrote its own URLs with `history.pushState`, which
 * `usePathname` does not observe, so the effect only ever ran on a real
 * room change.
 *
 * With Home, Pulse, Lab, Growth, Alerts and every portfolio as real paths
 * in that same room, it would run on every tap on the dock: restoring the
 * offset saved the last time the book was left, and firing an event whose
 * handler re-reads the URL and reloads the book when its cache is not
 * fresh. A tap on a dock cell would cost a fetch, which is the opposite of
 * what splitting these pages was for.
 *
 * Source-text, like `dock-stability.test.ts`, because the bug is in which
 * dependency list the work sits in rather than in anything a render shows.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SHELL = readFileSync("src/components/WorkspaceShell.tsx", "utf8");

/** The body of each `useLayoutEffect(...)` with its dependency list. */
function layoutEffects(): { body: string; deps: string }[] {
  const out: { body: string; deps: string }[] = [];
  let from = 0;
  for (;;) {
    const start = SHELL.indexOf("useLayoutEffect(() => {", from);
    if (start === -1) break;
    const end = SHELL.indexOf("\n  }, [", start);
    if (end === -1) break;
    const depsEnd = SHELL.indexOf("]);", end);
    out.push({
      body: SHELL.slice(start, end),
      deps: SHELL.slice(end, depsEnd),
    });
    from = depsEnd;
  }
  return out;
}

describe("WorkspaceShell room effects", () => {
  it("never restores scroll or announces a show on a pathname alone", () => {
    for (const { body, deps } of layoutEffects()) {
      const touchesShow =
        body.includes("WORKSPACE_SHOW_EVENT") || body.includes("scrollTo");
      if (!touchesShow) continue;
      expect(
        deps,
        "scroll restore / show event must not run on every pathname"
      ).not.toMatch(/pathname/);
    }
  });

  it("guards the show effect on the room actually changing", () => {
    const showEffect = layoutEffects().find((e) =>
      e.body.includes("WORKSPACE_SHOW_EVENT")
    );
    expect(showEffect, "the shell still announces a shown room").toBeTruthy();
    expect(showEffect?.body).toMatch(/prev === room/);
  });

  it("still tracks the live room on every path", () => {
    // The gate every hidden room's poller reads. This one *must* see a
    // pathname change, so it is the effect that keeps that dependency.
    const roomEffect = layoutEffects().find((e) =>
      e.body.includes("setActiveWorkspaceRoom")
    );
    expect(roomEffect, "the shell still sets the active room").toBeTruthy();
    expect(roomEffect?.deps).toMatch(/pathname/);
  });
});
