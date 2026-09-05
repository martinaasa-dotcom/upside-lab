/**
 * A PRESS THAT TURNS INTO A SCROLL MUST NOT MOVE THE READER TO A ROOM.
 *
 * The dock aims on `pointerdown` because a cell is a hard target and it
 * has a marker to move on the same press. A row in a scrolling list is
 * neither: a finger landing on one and then moving is starting a scroll,
 * and the whole saving here is about 57ms, which is not worth flashing up
 * a circle nobody asked for.
 *
 * `click` looks like the answer and is not -- it runs in the same event as
 * the navigation, so React batches the two and the aim gets no head start
 * at all (measured: 514ms from a click, 457ms from the press). So the aim
 * goes out on the press and the release takes it back.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AIM_TAP_HOLD_MS, aimOnPress, onRouteAim } from "@/lib/route-aim";

/*
 * These tests run in node, like the rest of this suite, so the two browser
 * pieces the function needs are stood up by hand: a window that keeps its
 * listeners so a stale one shows up as an extra call, and a row that keeps
 * its click listener so the double-navigation guard can be exercised.
 */
type Handler = (e: Record<string, unknown>) => void;

function fakeWindow() {
  const on = new Map<string, Set<Handler>>();
  return {
    addEventListener(type: string, fn: Handler) {
      const set = on.get(type) ?? new Set<Handler>();
      set.add(fn);
      on.set(type, set);
    },
    removeEventListener(type: string, fn: Handler) {
      on.get(type)?.delete(fn);
    },
    fire(type: string, detail: Record<string, unknown> = {}) {
      for (const fn of [...(on.get(type) ?? [])]) fn(detail);
    },
    live() {
      return [...on.values()].reduce((n, s) => n + s.size, 0);
    },
  };
}

function fakeRow() {
  const on = new Map<string, Set<Handler>>();
  return {
    addEventListener(type: string, fn: Handler) {
      const set = on.get(type) ?? new Set<Handler>();
      set.add(fn);
      on.set(type, set);
    },
    removeEventListener(type: string, fn: Handler) {
      on.get(type)?.delete(fn);
    },
    /** Fire the anchor's own click; answers whether it was prevented. */
    click() {
      let prevented = false;
      const ev = {
        preventDefault() {
          prevented = true;
        },
      };
      for (const fn of [...(on.get("click") ?? [])]) fn(ev);
      return prevented;
    },
  };
}

let ROW = fakeRow();

function pressOn(over: Record<string, unknown> = {}) {
  return {
    currentTarget: ROW,
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    clientX: 100,
    clientY: 100,
    timeStamp: 1000,
    pointerId: 1,
    ...over,
  } as unknown as PointerEvent;
}

/* A release where the finger landed, a tap's length later. */
const TAP_UP = { clientX: 102, clientY: 101, timeStamp: 1120, pointerId: 1 };

function heard() {
  const seen: (string | null)[] = [];
  const stop = onRouteAim((p) => seen.push(p));
  return { seen, stop };
}

function navigator() {
  const went: string[] = [];
  return { went, go: (p: string) => went.push(p) };
}

describe("aimOnPress", () => {
  let win: ReturnType<typeof fakeWindow>;
  const realWindow = globalThis.window;

  beforeEach(() => {
    win = fakeWindow();
    ROW = fakeRow();
    (globalThis as { window?: unknown }).window = win;
  });
  afterEach(() => {
    (globalThis as { window?: unknown }).window = realWindow;
  });

  it("says where a plain press is going", () => {
    const { seen, stop } = heard();
    aimOnPress(pressOn(), "/communities/c0");
    expect(seen).toEqual(["/communities/c0"]);
    win.fire("pointerup", TAP_UP);
    stop();
  });

  it("takes a tap where it was going, without consulting the release's target", () => {
    /*
     * Aiming a circle from its row hides the list the row is in, so the
     * element under the release is the new room and the anchor's click
     * never comes. Measured in Chromium: mouse click on body, touch click
     * on the room, neither on the anchor. The tap has to be judged from
     * the press itself, and it is what navigates.
     */
    const { seen, stop } = heard();
    const nav = navigator();
    aimOnPress(pressOn(), "/communities/c0", nav.go);
    win.fire("pointerup", { ...TAP_UP, target: { id: "the new room" } });
    expect(nav.went).toEqual(["/communities/c0"]);
    expect(seen, "the aim stands; the router settles it").toEqual([
      "/communities/c0",
    ]);
    stop();
  });

  it("does not enter the room twice when the anchor's click still arrives", () => {
    const nav = navigator();
    aimOnPress(pressOn(), "/communities/c0", nav.go);
    win.fire("pointerup", TAP_UP);
    expect(ROW.click(), "the Link's click is stood down").toBe(true);
    expect(nav.went).toEqual(["/communities/c0"]);
  });

  it("leaves the click to the anchor when nothing was given to navigate with", () => {
    aimOnPress(pressOn(), "/communities/c0");
    win.fire("pointerup", TAP_UP);
    expect(ROW.click(), "no navigator, so the Link does the work").toBe(false);
  });

  it("calls the aim off when the finger wandered past the slop", () => {
    const { seen, stop } = heard();
    const nav = navigator();
    aimOnPress(pressOn(), "/communities/c0", nav.go);
    win.fire("pointermove", { clientX: 100, clientY: 124, pointerId: 1 });
    win.fire("pointerup", { clientX: 100, clientY: 124, timeStamp: 1200, pointerId: 1 });
    expect(seen).toEqual(["/communities/c0", null]);
    expect(nav.went, "a scroll is not a tap").toEqual([]);
    stop();
  });

  it("ignores movement inside the slop", () => {
    const nav = navigator();
    aimOnPress(pressOn(), "/communities/c0", nav.go);
    win.fire("pointermove", { clientX: 106, clientY: 104, pointerId: 1 });
    win.fire("pointerup", TAP_UP);
    expect(nav.went).toEqual(["/communities/c0"]);
  });

  it("calls the aim off when the press was held", () => {
    // A long press is asking for the browser's link preview, not the room.
    const { seen, stop } = heard();
    const nav = navigator();
    aimOnPress(pressOn(), "/communities/c0", nav.go);
    win.fire("pointerup", { ...TAP_UP, timeStamp: 1000 + AIM_TAP_HOLD_MS + 1 });
    expect(seen).toEqual(["/communities/c0", null]);
    expect(nav.went).toEqual([]);
    stop();
  });

  it("calls the aim off when the browser claims the gesture", () => {
    // What a scroll actually fires once the browser takes the pointer.
    const { seen, stop } = heard();
    const nav = navigator();
    aimOnPress(pressOn(), "/communities/c0", nav.go);
    win.fire("pointercancel", { pointerId: 1 });
    expect(seen).toEqual(["/communities/c0", null]);
    expect(nav.went).toEqual([]);
    stop();
  });

  it("is settled only by its own pointer", () => {
    const { seen, stop } = heard();
    const nav = navigator();
    aimOnPress(pressOn(), "/communities/c0", nav.go);
    win.fire("pointerup", { ...TAP_UP, pointerId: 7 });
    expect(nav.went, "a second finger lifting is not this press").toEqual([]);
    win.fire("pointerup", TAP_UP);
    expect(nav.went).toEqual(["/communities/c0"]);
    expect(seen).toEqual(["/communities/c0"]);
    stop();
  });

  it("refuses a press that opens somewhere other than this tab", () => {
    // A middle click or a held modifier opens the address in a new tab,
    // and moving this tab to a room it is not going to is the one way
    // this is worse than waiting.
    for (const over of [
      { button: 1 },
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { altKey: true },
    ]) {
      const { seen, stop } = heard();
      aimOnPress(pressOn(over), "/communities/c0");
      expect(seen, JSON.stringify(over)).toEqual([]);
      expect(win.live(), "a refused press listens for nothing").toBe(0);
      stop();
    }
  });

  it("stops listening once the press is settled", () => {
    const { seen, stop } = heard();
    aimOnPress(pressOn(), "/communities/c0");
    win.fire("pointermove", { clientX: 100, clientY: 140, pointerId: 1 });
    win.fire("pointerup", { clientX: 100, clientY: 140, timeStamp: 1200, pointerId: 1 });
    expect(win.live(), "no listener outlives the press").toBe(0);
    win.fire("pointercancel", { pointerId: 1 });
    win.fire("pointerup", TAP_UP);
    expect(seen, "one press, one stand-down").toEqual([
      "/communities/c0",
      null,
    ]);
    stop();
  });
});
