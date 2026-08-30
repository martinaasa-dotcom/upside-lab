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
import { aimOnPress, onRouteAim } from "@/lib/route-aim";

/*
 * These tests run in node, like the rest of this suite, so the two browser
 * pieces the function needs are stood up by hand: a window that keeps its
 * listeners so a stale one shows up as an extra call, and a row that
 * answers `contains` for its own children.
 */
type Handler = (e: { target?: unknown }) => void;

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
    fire(type: string, target?: unknown) {
      for (const fn of [...(on.get(type) ?? [])]) fn({ target });
    },
    live() {
      return [...on.values()].reduce((n, s) => n + s.size, 0);
    },
  };
}

const INNER = { id: "inner" };
const ELSEWHERE = { id: "elsewhere" };
const ROW = { contains: (n: unknown) => n === ROW || n === INNER };

function pressOn(over: Record<string, unknown> = {}) {
  return {
    currentTarget: ROW,
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...over,
  } as unknown as PointerEvent;
}

function heard() {
  const seen: (string | null)[] = [];
  const stop = onRouteAim((p) => seen.push(p));
  return { seen, stop };
}

describe("aimOnPress", () => {
  let win: ReturnType<typeof fakeWindow>;
  const realWindow = globalThis.window;

  beforeEach(() => {
    win = fakeWindow();
    (globalThis as { window?: unknown }).window = win;
  });
  afterEach(() => {
    (globalThis as { window?: unknown }).window = realWindow;
  });

  it("says where a plain press is going", () => {
    const { seen, stop } = heard();
    aimOnPress(pressOn(), "/communities/c0");
    expect(seen).toEqual(["/communities/c0"]);
    win.fire("pointerup", INNER);
    stop();
  });

  it("keeps the aim when the release lands on the row", () => {
    const { seen, stop } = heard();
    aimOnPress(pressOn(), "/communities/c0");
    win.fire("pointerup", INNER);
    expect(seen, "a release inside the row is a tap").toEqual([
      "/communities/c0",
    ]);
    stop();
  });

  it("calls the aim off when the press is dragged off the row", () => {
    const { seen, stop } = heard();
    aimOnPress(pressOn(), "/communities/c0");
    win.fire("pointerup", ELSEWHERE);
    expect(seen).toEqual(["/communities/c0", null]);
    stop();
  });

  it("calls the aim off when the browser claims the gesture", () => {
    // What a scroll actually fires once the browser takes the pointer.
    const { seen, stop } = heard();
    aimOnPress(pressOn(), "/communities/c0");
    win.fire("pointercancel");
    expect(seen).toEqual(["/communities/c0", null]);
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
    win.fire("pointerup", ELSEWHERE);
    expect(win.live(), "no listener outlives the press").toBe(0);
    win.fire("pointercancel");
    win.fire("pointerup", ELSEWHERE);
    expect(seen, "one press, one stand-down").toEqual([
      "/communities/c0",
      null,
    ]);
    stop();
  });
});
