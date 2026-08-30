/**
 * WHERE A PAGE'S SECTIONS START IS SOMETHING ONLY THE BROWSER KNOWS, SO
 * THE PAGE MEASURES ITSELF ONCE AND REMEMBERS.
 *
 * `BelowFold` withholds the mount of a section, which is the larger half
 * of what a room costs: traced on a circle at 4x CPU, the JS to build it
 * was 530ms against 232ms of layout and paint. What it cannot do is place
 * itself. React has to decide what to render **before** the browser has
 * laid anything out, so "does this section start below the fold" has no
 * answer at render time, which is why every use of it so far has been a
 * person reading an offset off a measurement and typing it into a file.
 *
 * That does not survive contact with a growing app: a page added next
 * month gets nothing, a section that moves down the page keeps rendering
 * eagerly, and every `reserve` is a hand-typed pixel guess for one device.
 *
 * The way out is the only one there is: measure once and remember. A room
 * renders whole the first time it is ever seen at a given size, records
 * where each of its top-level sections actually landed, and on the next
 * visit starts the ones past the fold closed, with the remembered height
 * held open underneath them. It is self-tuning per device, it re-learns
 * when the window changes shape, and a page written later gets it without
 * anybody remembering this file exists.
 *
 * Everything here is pure so it can be tested without a browser.
 */

/** Bump to discard every remembered layout at once. */
export const FOLD_SCHEMA = 1;

/**
 * How far past the fold still counts as "coming". One whole screen, the
 * same lead `BelowFold` uses, in units of the reader's own screen rather
 * than pixels: by the time a section could be looked at it has been
 * mounted for a screen's worth of scrolling.
 */
export const FOLD_LEAD_SCREENS = 1;

/** Where a section actually landed, in document coordinates. */
export type SectionBox = { top: number; height: number };

type Stored = {
  v: number;
  /** Guards against a page whose section count has changed since. */
  n: number;
  boxes: SectionBox[];
};

/**
 * Heights are bucketed so that the browser chrome growing and shrinking
 * as you scroll -- which moves `innerHeight` by tens of pixels on a phone
 * -- does not throw away a layout that is still true.
 */
export function bucketHeight(viewportHeight: number): number {
  return Math.max(1, Math.round(viewportHeight / 100)) * 100;
}

/**
 * The route pattern, not the address. `/portfolio/retirement` and
 * `/portfolio/kids` are one layout and must share a memory; `/` and
 * `/pulse` are two layouts inside one keep-alive room and must not.
 * That last point is why this cannot key on `workspaceRoomId`, which
 * answers "book" for both.
 */
export function foldRoute(pathname: string): string {
  const path = (pathname.split("?")[0] ?? pathname).replace(/\/+$/, "") || "/";
  const dynamic: [RegExp, string][] = [
    [/^\/portfolio\/[^/]+$/, "/portfolio/:slug"],
    [/^\/communities\/[^/]+$/, "/communities/:id"],
  ];
  for (const [re, pattern] of dynamic) if (re.test(path)) return pattern;
  return path;
}

export function foldKey(pathname: string, viewportHeight: number): string {
  return `upside-fold:${foldRoute(pathname)}@${bucketHeight(viewportHeight)}`;
}

export function writeFold(boxes: SectionBox[]): string {
  const stored: Stored = {
    v: FOLD_SCHEMA,
    n: boxes.length,
    boxes: boxes.map((b) => ({
      top: Math.round(b.top),
      height: Math.round(b.height),
    })),
  };
  return JSON.stringify(stored);
}

/**
 * Anything the slightest bit off answers null, and null means render the
 * page whole. Every failure of this feature has to land on the behaviour
 * it replaced -- a wrong answer here is a blank page, and there is no
 * saving worth that.
 *
 * `count` is deliberately NOT required to match. A page's section count
 * changes while it loads, because sections are conditional and a room
 * that ends up with nine of them often renders two first; demanding an
 * exact match would throw the memory away on exactly the render it was
 * meant to help. Offsets are positional, so a short list is read as far
 * as it goes and the caller slices. Pass a number to insist on a match
 * where a caller does want that.
 */
export function readFold(
  raw: string | null,
  count: number | null = null
): SectionBox[] | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const s = parsed as Partial<Stored>;
  if (s.v !== FOLD_SCHEMA) return null;
  if (!Array.isArray(s.boxes)) return null;
  if (s.n !== s.boxes.length) return null;
  if (count !== null && s.boxes.length !== count) return null;
  for (const b of s.boxes) {
    if (!b || typeof b.top !== "number" || typeof b.height !== "number") {
      return null;
    }
    if (!Number.isFinite(b.top) || !Number.isFinite(b.height)) return null;
    if (b.top < 0 || b.height < 0) return null;
  }
  return s.boxes;
}

/**
 * Which sections have to exist in the first render.
 *
 * `scrollY` rather than zero because a reload restores the reader's
 * offset and the shell restores a room's, so the fold is very often not
 * at the top of the document.
 */
export function openIndexes(
  boxes: SectionBox[],
  view: { scrollY: number; viewportHeight: number }
): Set<number> {
  const lead = view.viewportHeight * FOLD_LEAD_SCREENS;
  const from = view.scrollY - lead;
  const to = view.scrollY + view.viewportHeight + lead;
  const open = new Set<number>();
  /*
   * The first section is open whatever the arithmetic says. It is the
   * top of the page, so it is always the right answer, and it means a
   * corrupted store can never present an empty screen.
   */
  open.add(0);
  boxes.forEach((b, i) => {
    if (b.top + b.height >= from && b.top <= to) open.add(i);
  });
  return open;
}

/** Every index, for the cases where nothing may be withheld. */
export function allOpen(count: number): Set<number> {
  return new Set(Array.from({ length: count }, (_, i) => i));
}
