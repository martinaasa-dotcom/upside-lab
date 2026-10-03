import { describe, expect, it } from "vitest";

import {
  THUMB_LAG_MS,
  THUMB_MS,
  sameRect,
  thumbRest,
  thumbTravel,
  thumbTravelMs,
} from "@/lib/slide-thumb";

function parse(transform: string) {
  const m = transform.match(
    /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+), ([-\d.e]+)\)/
  );
  if (!m) throw new Error(`unparsed ${transform}`);
  return { x: +m[1], y: +m[2], sx: +m[3], sy: +m[4] };
}

describe("the selection thumb", () => {
  const a = { x: 3, y: 3, w: 80, h: 32 };
  const b = { x: 87, y: 3, w: 120, h: 32 };

  it("rests at exactly its own size", () => {
    expect(thumbRest(b)).toEqual({
      width: "120px",
      height: "32px",
      transform: "translate(87px, 3px) scale(1, 1)",
    });
  });

  it("starts where it was and ends where it is going, unscaled", () => {
    const frames = thumbTravel(a, b);
    const first = parse(String(frames[0].transform));
    const last = parse(String(frames.at(-1)!.transform));
    expect(first.x).toBeCloseTo(a.x, 5);
    expect(first.sx * b.w).toBeCloseTo(a.w, 5);
    expect(last).toEqual({ x: b.x, y: b.y, sx: 1, sy: 1 });
    expect(frames.at(-1)!.offset).toBe(1);
  });

  it("stretches in flight, leading edge first", () => {
    const frames = thumbTravel(a, b).map((f) => parse(String(f.transform)));
    const widest = Math.max(...frames.map((f) => f.sx * b.w));
    expect(widest).toBeGreaterThan(b.w);
    // The right edge (leading, moving right) is never behind the left.
    for (const f of frames) expect(f.sx).toBeGreaterThan(0);
  });

  it("keeps offsets ascending and inside 0 to 1", () => {
    const offsets = thumbTravel(b, a).map((f) => Number(f.offset));
    for (let i = 1; i < offsets.length; i += 1) {
      expect(offsets[i]).toBeGreaterThanOrEqual(offsets[i - 1]);
    }
    expect(offsets[0]).toBe(0);
    expect(offsets.at(-1)).toBe(1);
  });

  it("moves between rows on both axes", () => {
    const below = { x: 3, y: 41, w: 80, h: 32 };
    const frames = thumbTravel(b, below).map((f) => parse(String(f.transform)));
    expect(frames[0].y).toBeCloseTo(b.y, 5);
    expect(frames.at(-1)!.y).toBe(below.y);
  });

  it("counts the trailing edge in the flight", () => {
    expect(thumbTravelMs()).toBe(THUMB_MS + THUMB_LAG_MS);
  });

  it("treats sub-pixel noise as the same place", () => {
    expect(sameRect(a, { ...a, x: a.x + 0.2 })).toBe(true);
    expect(sameRect(a, b)).toBe(false);
    expect(sameRect(null, a)).toBe(false);
  });
});
