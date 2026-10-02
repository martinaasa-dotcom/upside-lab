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
    The first report on an element decides whether it is held; every later
    one can only release it. Judging off the observer rather than off a rect
    read at mount matters: a section mounts where it will not stay, because
    the panels above it are still arriving, and a rect read in that moment
    put Home's gauges on screen when they settled 110px under the fold.
  */
  const judged = new WeakSet<Element>();
  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target;
        if (!judged.has(el)) {
          judged.add(el);
          if (entry.isIntersecting) {
            seen.unobserve(el);
          } else {
            el.setAttribute("data-await-view", "");
          }
          continue;
        }
        if (!entry.isIntersecting) continue;
        el.removeAttribute("data-await-view");
        seen.unobserve(el);
      }
    },
    /* Released once a little of it has cleared the bottom of the screen,
       so the motion happens where the eye already is. */
    { rootMargin: "0px 0px -8% 0px" }
  );

  const consider = (el: Element) => {
    if (judged.has(el)) return;
    /*
      Never on the signed-out landing. Holding a bar there until it is
      scrolled to is a scroll reveal, and that page does not have them
      (landing-paint.test.ts): its life is in what a reader presses.
    */
    if (el.closest(".landing-field")) return;
    seen.observe(el);
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
  };
}
