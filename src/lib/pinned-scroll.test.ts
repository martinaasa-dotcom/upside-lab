import { describe, expect, it } from "vitest";
import { HOLD_FRAMES, pinScroll, type ScrollHost } from "@/lib/pinned-scroll";

/*
  A page that a sheet, a focus restore or a keyboard can move, and a queue
  of frames run by hand, because this suite runs in node.
*/
function fakeHost(start: number) {
  const frames: Array<() => void> = [];
  const writes: number[] = [];
  const host: ScrollHost & { y: number } = {
    y: start,
    get scrollX() {
      return 0;
    },
    get scrollY() {
      return this.y;
    },
    scrollTo(_x, y) {
      writes.push(y);
      this.y = y;
    },
    requestAnimationFrame(cb) {
      frames.push(cb);
      return frames.length;
    },
  };
  const runFrame = () => frames.shift()?.();
  return { host, writes, frames, runFrame };
}

describe("pinScroll", () => {
  it("puts the page back where it was when the picker opened", () => {
    const { host, writes } = fakeHost(400);
    const restore = pinScroll(host);
    host.y = 978; // what the old sheet did on close
    restore();
    expect(host.y).toBe(400);
    expect(writes).toEqual([400]);
  });

  it("holds the spot against a jump that lands a frame later", () => {
    const { host, runFrame } = fakeHost(400);
    const restore = pinScroll(host);
    restore();
    host.y = 620; // the focus restore, one frame on
    runFrame();
    expect(host.y).toBe(400);
  });

  it("writes nothing when nothing moved", () => {
    const { host, writes, runFrame } = fakeHost(250);
    pinScroll(host)();
    for (let i = 0; i < HOLD_FRAMES; i++) runFrame();
    expect(writes).toEqual([]);
  });

  it("stops holding after a few frames", () => {
    const { host, frames, runFrame } = fakeHost(100);
    pinScroll(host)();
    for (let i = 0; i < HOLD_FRAMES + 2; i++) runFrame();
    expect(frames.length).toBe(0);
  });
});
