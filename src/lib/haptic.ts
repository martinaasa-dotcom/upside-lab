/**
 * The smallest physical answer a phone can give to a choice.
 *
 * Where a phone has a vibration motor and lets a page use it (Android
 * does; iOS has no vibration API and simply gets nothing), changing a
 * choice in a row of options gives one very short tick under the finger,
 * the way a native segmented control does. Pull to refresh already does
 * this at its threshold, at the same strength.
 *
 * Only on a coarse pointer, so a laptop with a touchscreen driven by a
 * mouse never buzzes, and never on a press that changed nothing.
 */
export function hapticTick(pattern: number | number[] = 8): void {
  if (typeof navigator === "undefined" || typeof window === "undefined") return;
  try {
    if (!window.matchMedia?.("(pointer: coarse)").matches) return;
    navigator.vibrate?.(pattern);
  } catch {
    /* a phone that would rather not */
  }
}
