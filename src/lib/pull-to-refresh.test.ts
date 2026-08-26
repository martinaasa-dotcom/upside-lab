/*
  Pull to refresh, held to the two things that make it worth having.

  THE FEEL, which is a curve and four numbers, and is the part somebody will
  want to change on a hunch six months from now. Written down here so that
  changing it is a decision rather than a nudge.

  AND THE COST, which is the part that cannot be seen on a screen and so has
  to be read off the source. Every touch listener in that component is
  passive, nothing in it calls `preventDefault`, and the ring it draws is
  never allowed to grow a `backdrop-filter`. A fixed element that filters its
  backdrop over moving content is the fault this repository already measured
  on the landing page at 42 repainted frames, and a pull is by definition
  content moving under something pinned to the window.

  Upside Arena has the same component and the same test. Fix both or neither.
*/
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PULL_CEILING,
  PULL_ARC_MS,
  PULL_MAX_WAIT_MS,
  PULL_MIN_VISIBLE_MS,
  PULL_RING_CIRCUMFERENCE,
  PULL_SETTLE_MS,
  PULL_SLOP,
  PULL_TRIGGER,
  pullArmed,
  pullDashOffset,
  pullIntent,
  pullOpacity,
  pullProgress,
  pullScale,
  pullTravel,
} from "@/lib/pull-to-refresh";

const COMPONENT = readFileSync("src/components/PullToRefresh.tsx", "utf8");
const CSS = readFileSync("src/app/globals.css", "utf8");
const PROVIDERS = readFileSync("src/components/Providers.tsx", "utf8");
const ROOMS = readFileSync("src/lib/workspace-rooms.ts", "utf8");

/* The file with its prose taken out: the notes name what must not be done. */
const CODE = COMPONENT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");

describe("the pull follows the finger and then resists it", () => {
  it("starts exactly one for one, so the page feels attached", () => {
    const step = 0.001;
    expect(pullTravel(step) / step).toBeCloseTo(1, 3);
  });

  it("never travels further than the ceiling, however hard anybody drags", () => {
    /* Taller than any phone, so no real drag ever reaches the asymptote. */
    for (const raw of [200, 400, 1000]) {
      expect(pullTravel(raw)).toBeLessThan(PULL_CEILING);
    }
    expect(pullTravel(1e6)).toBeLessThanOrEqual(PULL_CEILING);
  });

  it("only ever moves downward", () => {
    expect(pullTravel(0)).toBe(0);
    expect(pullTravel(-40)).toBe(0);
  });

  it("rises without a step in it", () => {
    let last = -1;
    for (let raw = 0; raw <= 300; raw += 1) {
      const travel = pullTravel(raw);
      expect(travel).toBeGreaterThanOrEqual(last);
      last = travel;
    }
  });

  it("arms at 84px of finger, which is a pull rather than a twitch", () => {
    expect(pullTravel(83)).toBeLessThan(PULL_TRIGGER);
    expect(pullTravel(85)).toBeGreaterThan(PULL_TRIGGER);
  });

  it("leaves give in the pull after it has armed", () => {
    expect(PULL_TRIGGER).toBeLessThan(PULL_CEILING * 0.75);
  });
});

describe("the ring says how far there is left to go", () => {
  it("is empty at rest and full exactly as the pull arms", () => {
    expect(pullProgress(0)).toBe(0);
    expect(pullProgress(PULL_TRIGGER)).toBe(1);
    expect(pullDashOffset(0)).toBeCloseTo(PULL_RING_CIRCUMFERENCE, 5);
    expect(pullDashOffset(1)).toBeCloseTo(0, 5);
  });

  it("cannot overfill when the pull carries on past the threshold", () => {
    expect(pullProgress(PULL_CEILING)).toBe(1);
    expect(pullArmed(PULL_TRIGGER)).toBe(true);
    expect(pullArmed(PULL_TRIGGER - 0.01)).toBe(false);
  });

  it("reaches full size and full opacity at the same instant it completes", () => {
    expect(pullScale(1)).toBeCloseTo(1, 6);
    expect(pullOpacity(1)).toBe(1);
  });

  it("is visible well before it is armed, and never larger than full", () => {
    expect(pullOpacity(0.4)).toBe(1);
    expect(pullOpacity(0)).toBe(0);
    expect(pullScale(2)).toBeCloseTo(1, 6);
  });
});

describe("which gesture this is, decided once", () => {
  it("says nothing inside the slop", () => {
    expect(pullIntent(0, 0)).toBe("wait");
    expect(pullIntent(PULL_SLOP - 1, PULL_SLOP - 1)).toBe("wait");
  });

  it("gives a sideways swipe back to the table under it", () => {
    expect(pullIntent(40, 8)).toBe("scroll");
  });

  it("gives an upward drag back to the page", () => {
    expect(pullIntent(0, -40)).toBe("scroll");
  });

  it("takes a downward drag", () => {
    expect(pullIntent(0, 40)).toBe("pull");
    expect(pullIntent(8, 40)).toBe("pull");
  });
});

describe("the ring changes character without a hard cut in it", () => {
  it("unwinds and closes faster than the page settles", () => {
    expect(PULL_ARC_MS).toBeLessThan(PULL_SETTLE_MS);
  });

  it("animates the dash offset only for that change, never per frame", () => {
    const perFrame = CODE.slice(CODE.indexOf("const draw ="), CODE.indexOf("const paint ="));
    expect(perFrame).toContain("strokeDashoffset");
    expect(
      perFrame,
      "a transition on the property a drag writes every frame fights the finger"
    ).not.toContain("transition");
  });
});

describe("the ring is shown for long enough to read and not forever", () => {
  it("outlasts a cached answer", () => {
    expect(PULL_MIN_VISIBLE_MS).toBeGreaterThanOrEqual(300);
  });

  it("gives up rather than turning for the rest of the session", () => {
    expect(PULL_MAX_WAIT_MS).toBeGreaterThan(PULL_MIN_VISIBLE_MS);
    expect(PULL_MAX_WAIT_MS).toBeLessThanOrEqual(15000);
  });
});

describe("what it costs when nobody is pulling", () => {
  it("never blocks a scroll", () => {
    expect(CODE, "a non-passive listener is a scroll waiting on us").toContain(
      "{ passive: true }"
    );
    expect(CODE).not.toMatch(/passive:\s*false/);
    expect(CODE).not.toContain("preventDefault");
  });

  it("attaches nothing on a device with no touch", () => {
    expect(CODE).toContain("any-pointer: coarse");
  });

  it("moves the page the finger is in, not the one the route names", () => {
    expect(CODE).toContain('closest("main")');
    expect(CODE, "a route check would pick the wrong room in Lab").not.toMatch(
      /usePathname|location\.pathname/
    );
  });

  it("stands down when a dialog owns the scroll", () => {
    expect(CODE).toContain("data-scroll-locked");
  });

  it("writes once a frame", () => {
    expect(CODE).toContain("requestAnimationFrame");
  });

  it("takes the compositor hint back off again", () => {
    expect(CODE).toContain('willChange = ""');
    expect(CSS, "a layer held all session for a gesture nobody is making")
      .not.toMatch(/\.ptr[^{]*\{[^}]*will-change/);
  });
});

describe("the ring is a ring on nothing", () => {
  const ptr = CSS.slice(CSS.indexOf(".ptr {"), CSS.indexOf(".ptr-arc"));

  it("is pinned to the window and filters nothing behind it", () => {
    expect(ptr).toContain("position: fixed");
    expect(ptr, "fixed plus a backdrop filter is the landing page fault")
      .not.toContain("backdrop-filter");
    expect(ptr).not.toContain("glass");
  });

  it("cannot swallow a tap along the top of the page", () => {
    expect(ptr).toContain("pointer-events: none");
  });

  it("does not turn for somebody who asked for less motion", () => {
    expect(CSS).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*\.ptr-ring\[data-working\]\s*\{\s*animation: none/
    );
    expect(CODE).toContain("prefers-reduced-motion");
  });
});

describe("the switch that made this necessary is still thrown", () => {
  it("keeps the bounce off", () => {
    expect(CSS).toContain("overscroll-behavior-y: none");
  });

  it("is mounted in the chrome, outside every room's own main", () => {
    expect(PROVIDERS).toContain("<PullToRefresh />");
    /* Its note in that file mentions `<main>`; the element is what counts. */
    const markup = PROVIDERS.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(
      markup,
      "a fixed ring inside a transformed main is re-parented"
    ).not.toContain("<main");
  });
});

/*
  THE ONE THING THIS APP HAS THAT ARENA DOES NOT: five rooms mounted at once.

  `WorkspaceShell` keeps every room this session has visited in the document
  behind a `hidden` attribute, so a refresh shouted at all of them would put
  four or five rooms' worth of fetches on the wire in one gesture, against
  providers this app is deliberately on the free tier of. Every poller in
  those rooms already asks `isWorkspaceRoomActive` before it fires, and the
  pull has to ask the same question or it undoes all of them at once.
*/
describe("a pull reaches the room the finger is in, and no other", () => {
  it("asks whether the room is on screen before running anything", () => {
    const bus = ROOMS.slice(ROOMS.indexOf("export function onWorkspaceRefresh"));
    expect(bus).toContain("isWorkspaceRoomActive(roomId)");
    expect(
      bus.indexOf("isWorkspaceRoomActive(roomId)"),
      "the check has to come before the work, not after it"
    ).toBeLessThan(bus.indexOf("detail.waitFor"));
  });

  it("says when nothing answered, so the ring is never a lie", () => {
    expect(ROOMS).toContain("handled: false");
    expect(
      COMPONENT,
      "a room with nothing to refetch still owes the reader a real answer"
    ).toContain("router.refresh()");
  });

  it("waits on the room rather than on a guessed number of milliseconds", () => {
    expect(ROOMS).toContain("Promise.allSettled(work)");
  });
});
