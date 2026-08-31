/**
 * The page shell decides what to build from a memory of where sections
 * landed last time, so these hold the two things that make that safe:
 * every doubtful answer is "render the whole page", and the fold is read
 * against the reader's own screen and their own scroll position.
 */
import { describe, expect, it } from "vitest";
import {
  allOpen,
  bucketHeight,
  foldKey,
  foldRoute,
  openIndexes,
  readFold,
  writeFold,
  type SectionBox,
} from "@/lib/auto-fold";

const boxes = (...pairs: [number, number][]): SectionBox[] =>
  pairs.map(([top, height]) => ({ top, height }));

describe("foldRoute", () => {
  it("folds a dynamic segment into one pattern", () => {
    // Two portfolios are one layout and must share a memory.
    expect(foldRoute("/portfolio/retirement")).toBe("/portfolio/:slug");
    expect(foldRoute("/portfolio/kids")).toBe("/portfolio/:slug");
    expect(foldRoute("/communities/abc123")).toBe("/communities/:id");
  });

  it("keeps the book's pages apart", () => {
    /*
     * `/` and `/pulse` are one keep-alive room and two completely
     * different layouts, which is why this cannot key on
     * `workspaceRoomId` -- that answers "book" for both.
     */
    expect(foldRoute("/")).toBe("/");
    expect(foldRoute("/pulse")).not.toBe(foldRoute("/"));
    expect(foldRoute("/lab")).not.toBe(foldRoute("/growth"));
    expect(foldRoute("/communities")).not.toBe(foldRoute("/communities/x"));
  });

  it("ignores a query and a trailing slash", () => {
    expect(foldRoute("/pulse/")).toBe("/pulse");
    expect(foldRoute("/pulse?x=1")).toBe("/pulse");
  });
});

describe("the key is per device shape", () => {
  it("buckets the height, so browser chrome does not invalidate it", () => {
    // The address bar growing and shrinking moves innerHeight by tens of
    // pixels on a phone; the layout it measured is still true.
    expect(bucketHeight(844)).toBe(bucketHeight(812));
    expect(bucketHeight(800)).not.toBe(bucketHeight(1000));
  });

  it("separates a phone from a laptop", () => {
    expect(foldKey("/pulse", 800)).not.toBe(foldKey("/pulse", 1200));
  });
});

describe("readFold refuses anything doubtful", () => {
  const good = writeFold(boxes([0, 300], [320, 500]));

  it("round-trips a layout it wrote", () => {
    expect(readFold(good)).toEqual(boxes([0, 300], [320, 500]));
  });

  it("answers null for junk, and null means render the page whole", () => {
    for (const raw of [
      null,
      "",
      "not json",
      "[]",
      '{"v":1}',
      '{"v":999,"n":1,"boxes":[{"top":0,"height":1}]}',
      '{"v":1,"n":2,"boxes":[{"top":0,"height":1}]}',
      '{"v":1,"n":1,"boxes":[{"top":-5,"height":1}]}',
      '{"v":1,"n":1,"boxes":[{"top":0,"height":"tall"}]}',
      '{"v":1,"n":1,"boxes":[{"top":null,"height":1}]}',
    ]) {
      expect(readFold(raw), JSON.stringify(raw)).toBeNull();
    }
  });

  it("does not demand the section count still match", () => {
    /*
     * Sections are conditional, so a room that ends up with nine of them
     * often renders two first. Insisting on an exact match would throw
     * the memory away on exactly the render it exists to help. Offsets
     * are positional, so the caller slices.
     */
    expect(readFold(good, null)).not.toBeNull();
    expect(readFold(good)?.length).toBe(2);
  });

  it("still lets a caller insist on a match", () => {
    expect(readFold(good, 2)).not.toBeNull();
    expect(readFold(good, 3)).toBeNull();
  });
});

describe("openIndexes", () => {
  const page = boxes([0, 400], [420, 400], [840, 400], [1260, 400], [1680, 900]);

  it("builds what is on screen and one screen more", () => {
    const open = openIndexes(page, { scrollY: 0, viewportHeight: 800 });
    // fold at 800, lead reaches 1600
    expect([...open].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    expect(open.has(4)).toBe(false);
  });

  it("reads the fold from where the reader actually is", () => {
    /*
     * A reload restores the reader's offset and the shell restores a
     * room's, so the fold is very often not at the top of the document.
     */
    const open = openIndexes(page, { scrollY: 1600, viewportHeight: 800 });
    expect(open.has(4)).toBe(true);
    expect(open.has(1)).toBe(true); // within one screen behind
  });

  it("keeps the first section open whatever the arithmetic says", () => {
    // A corrupted store must never be able to present an empty screen.
    const open = openIndexes(boxes([9999, 100]), {
      scrollY: 0,
      viewportHeight: 800,
    });
    expect(open.has(0)).toBe(true);
  });

  it("is a taller screen's answer on a taller screen", () => {
    const short = openIndexes(page, { scrollY: 0, viewportHeight: 400 });
    const tall = openIndexes(page, { scrollY: 0, viewportHeight: 1200 });
    expect(tall.size).toBeGreaterThan(short.size);
  });

  it("never asks for a section that is not there", () => {
    const open = openIndexes(page.slice(0, 2), {
      scrollY: 0,
      viewportHeight: 800,
    });
    for (const i of open) expect(i).toBeLessThan(2);
  });
});

describe("allOpen", () => {
  it("is every index, which is what every failure falls back to", () => {
    expect([...allOpen(3)]).toEqual([0, 1, 2]);
    expect(allOpen(0).size).toBe(0);
  });
});
