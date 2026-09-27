/**
 * A PICKER OPENED OVER THE PAGE MUST LEAVE THE PAGE WHERE IT WAS.
 *
 * The retirement room's tappable words open a bottom sheet on a phone, and
 * every change made in one used to leave the reader somewhere further down
 * the page than they started. Nothing in this app asked for that; three
 * things the platform does on its own add up to it, all on iPhone Safari:
 *
 * 1. Radix hands focus back to the word that opened the sheet with a plain
 *    `focus()` (react-dialog's `onCloseAutoFocus`), and WebKit scrolls a
 *    focused element into view whether or not it was already visible.
 * 2. Radix focuses the first control inside the sheet as it opens. When that
 *    control is a money field the keyboard comes up, and WebKit scrolls the
 *    page under a fixed sheet to make room for it, then leaves it there.
 * 3. While the sheet is open the page underneath re-renders with the new
 *    plan, and Safari has no scroll anchoring, so anything above the reader
 *    that changed height moves them.
 *
 * The first two are answered where the sheet is built (`focusWithoutScroll`
 * and not auto-focusing a field). This file is the backstop for all three:
 * it remembers where the page was when the picker opened and puts it back
 * when the picker closes, for a few frames, because the focus restore and
 * the scroll-lock teardown land on different frames.
 */

/** How many frames after closing the position is held. */
export const HOLD_FRAMES = 4;

export type ScrollHost = {
  readonly scrollX: number;
  readonly scrollY: number;
  scrollTo(x: number, y: number): void;
  requestAnimationFrame(cb: () => void): number;
};

/**
 * Where the page is, and a function that puts it back. Call the first when
 * a picker opens and the second when it closes.
 *
 * The restore only writes when the page has actually moved, so a picker
 * opened and closed without incident costs nothing. It holds for a handful
 * of frames, which is far shorter than anybody can start a scroll after
 * pressing Done, so a move inside that window is the platform's and not
 * the reader's. Use it only over a picker that locks the page while open
 * (a sheet); over one that does not (a popover), the reader may have
 * scrolled on purpose and putting them back would be the jump again.
 */
export function pinScroll(host: ScrollHost): () => void {
  const x = host.scrollX;
  const y = host.scrollY;
  return () => {
    let frames = 0;
    const hold = () => {
      if (Math.abs(host.scrollY - y) > 1 || Math.abs(host.scrollX - x) > 1) host.scrollTo(x, y);
      frames += 1;
      if (frames < HOLD_FRAMES) host.requestAnimationFrame(hold);
    };
    hold();
  };
}

/**
 * Focus without moving the page. `preventScroll` is honoured by every
 * browser this app supports; the pin above covers any that ignore it.
 */
export function focusWithoutScroll(el: HTMLElement | null | undefined): void {
  if (!el) return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}
