/**
 * A CHART THAT DRAWS ITSELF IN SHOULD DO IT WHERE SOMEBODY CAN SEE IT.
 *
 * Every arrival animation in this app (a line drawing in, a bar growing, a
 * gauge's marker travelling to its reading) starts the moment its element
 * mounts. For anything below the fold that is the same as not animating at
 * all: measured on Home at 1440x900, the three market gauges had finished
 * sweeping before a reader could scroll to them, and so had the year's
 * chart. Holding a whole panel was tried first and is not enough: that
 * panel's top edge is on screen while its gauges are 140px under the fold,
 * and the gauges mount later anyway, when the market reading arrives.
 *
 * So one watcher for the whole app finds every element carrying an arrival
 * class as it mounts, and holds the ones a reader cannot see on their
 * first frame (`data-await-view`, motion.css) until they scroll into view.
 * Four rules keep it from ever costing a reader anything:
 *
 *  - It is decided on the client, a frame after mount, and only for an
 *    element that is genuinely out of sight. Nothing is paused in the
 *    server's markup, so a page with scripts off, or one still hydrating,
 *    animates exactly as it always did.
 *  - Only the decorative arrival classes are held. A figure is printed in
 *    full from the first frame; what waits is a bar's growth, a line's
 *    draw, a marker's travel.
 *  - Once seen, an element is released for good. Scrolling away and back
 *    replays nothing.
 *  - It watches for added nodes only, never text or attributes, so a quote
 *    poll that rewrites forty prices costs it nothing.
 *
 * A hidden room's elements measure as nothing and are held; the moment the
 * room is shown the observer finds them on screen and they play, which is a
 * room's charts arriving with the room.
 */

/** Every class whose animation is an arrival, and so worth holding. */
export const ARRIVAL_SELECTOR = [
  ".sweep-in",
  ".grow-out",
  ".grow-up",
  ".grow-down",
  ".wave-in",
  ".line-reveal",
  ".line-draw",
  ".bar-reveal",
  ".overview-bar",
  ".progress-fill",
  ".spark-wash",
  ".dot-arrive",
  ".chart-now-dot",
  ".live-dot",
].join(",");

/**
 * The element to measure for an arrival: its nearest ancestor that is not
 * itself an arrival.
 *
 * NEVER THE ARRIVAL ITSELF, AND THAT IS THE WHOLE BUG THIS FIXES. A held
 * element sits on its first frame, and the first frame of a line drawing in
 * is a clip of `inset(0 100% 0 0)`, of a bar growing is `scale(0)`, of a dot
 * arriving is `scale(0)`. Chrome's IntersectionObserver measures the target
 * after its clip and transform, so a held line is a box of no width that
 * can never be reported on screen, and is therefore never released: every
 * chart line on Home, in the market reading and on the Fund card stayed
 * invisible for good, with only its end dot drawn. The parent is laid out
 * where the line will be and is never clipped or scaled by the arrival, so
 * it says truthfully whether the reader can see the place the line is.
 */
export function measuredFor(el: Element): Element {
  let at = el.parentElement;
  while (at && at.matches(ARRIVAL_SELECTOR)) at = at.parentElement;
  return at ?? el;
}

/**
 * Start watching. Returns the function that stops it. Safe to call where
 * there is no `IntersectionObserver` or `MutationObserver`: it does
 * nothing, and everything animates on mount as it always did.
 */
export function watchArrivals(within?: Element): () => void {
  if (
    typeof window === "undefined" ||
    typeof IntersectionObserver === "undefined" ||
    typeof MutationObserver === "undefined" ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ) {
    return () => {};
  }
  const root = within ?? document.body;

  /*
    Arrivals are grouped by the element they are measured on (see
    `measuredFor`). The first report on that element decides whether its
    arrivals are held; any later one can only release them. Judging off the
    observer rather than off a rect read at mount matters: a section mounts
    where it will not stay, because the panels above it are still arriving,
    and a rect read in that moment put Home's gauges on screen when they
    settled 110px under the fold.
  */
  type Group = { judged: boolean; released: boolean; members: Set<Element> };
  const groups = new Map<Element, Group>();
  const placed = new WeakSet<Element>();

  const release = (box: Element, group: Group) => {
    group.released = true;
    for (const el of group.members) el.removeAttribute("data-await-view");
    group.members.clear();
    seen.unobserve(box);
    groups.delete(box);
  };

  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const group = groups.get(entry.target);
        if (!group) continue;
        if (entry.isIntersecting) {
          release(entry.target, group);
          continue;
        }
        if (!group.judged) {
          group.judged = true;
          for (const el of group.members) el.setAttribute("data-await-view", "");
        }
      }
      armFailsafe();
    },
    /* Released once a little of it has cleared the bottom of the screen,
       so the motion happens where the eye already is. */
    { rootMargin: "0px 0px -8% 0px" }
  );

  /*
    A SECOND WITNESS, SO A HELD CHART CAN NEVER BE LOST FOR GOOD.

    The observer was the only thing that could release an arrival, and when
    it misjudged one, nothing else ever looked again. While anything is
    held, a slow sweep reads where each measured element actually is and
    releases any that are on screen. It costs one rect read per held group
    every second and a half, and stops itself the moment nothing is held.
  */
  let failsafe: number | null = null;
  const sweep = () => {
    failsafe = null;
    const bottom = window.innerHeight * 0.92;
    for (const [box, group] of groups) {
      if (!group.judged) continue;
      const r = box.getBoundingClientRect();
      const shown = r.width > 0 && r.height > 0 && r.top < bottom && r.bottom > 0;
      if (shown) release(box, group);
    }
    armFailsafe();
  };
  function armFailsafe() {
    if (failsafe !== null) return;
    const anyHeld = [...groups.values()].some((g) => g.judged && !g.released);
    if (anyHeld) failsafe = window.setTimeout(sweep, 1500);
  }

  const consider = (el: Element) => {
    if (placed.has(el)) return;
    placed.add(el);
    /*
      Never on the signed-out landing. Holding a bar there until it is
      scrolled to is a scroll reveal, and that page does not have them
      (landing-paint.test.ts): its life is in what a reader presses.
    */
    if (el.closest(".landing-field")) return;
    const box = measuredFor(el);
    const group = groups.get(box);
    if (group) {
      group.members.add(el);
      // Joining a group that is already held: hold this one with it.
      if (group.judged) el.setAttribute("data-await-view", "");
      return;
    }
    groups.set(box, { judged: false, released: false, members: new Set([el]) });
    seen.observe(box);
  };

  const scan = (node: Node) => {
    if (!(node instanceof Element)) return;
    if (node.matches(ARRIVAL_SELECTOR)) consider(node);
    for (const el of node.querySelectorAll(ARRIVAL_SELECTOR)) consider(el);
  };

  scan(root);
  const added = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) scan(node);
    }
  });
  added.observe(root, { childList: true, subtree: true });

  return () => {
    added.disconnect();
    seen.disconnect();
    if (failsafe !== null) window.clearTimeout(failsafe);
    for (const group of groups.values()) {
      for (const el of group.members) el.removeAttribute("data-await-view");
    }
    groups.clear();
  };
}
