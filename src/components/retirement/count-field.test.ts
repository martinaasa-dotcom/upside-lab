/**
 * `clampCountDraft` is the one piece of `CountField` that can be tested
 * without a browser: what a finished draft resolves to on blur.
 *
 * It used to run on every keystroke instead of only at the end, which
 * broke the exact thing select-on-focus was added to fix. Selecting the
 * old value on focus means the first keystroke of a replacement often
 * types a digit that is, on its own, below the field's minimum — typing
 * "45" over a 16-minimum age passes through "4". Clamping "4" up to 16
 * immediately, mid-edit, meant the next keystroke landed on "16" instead
 * of "4" and the field settled on the wrong number. The fix is that this
 * function is only ever called once editing is finished; these are the
 * cases that would have failed under the old every-keystroke version.
 */
import { describe, expect, it } from "vitest";
import { clampCountDraft } from "@/components/retirement/fields";

describe("a count field's finished draft clamps once, not per keystroke", () => {
  it("keeps a value already inside the range", () => {
    expect(clampCountDraft("45", 16, 90)).toBe(45);
  });

  it("clamps a finished value below the minimum, not an intermediate one", () => {
    // The regression: "4" is below the 16 minimum, but it is a digit
    // typed on the way to "45", never the reader's intended final answer.
    expect(clampCountDraft("4", 16, 90)).toBe(16);
    expect(clampCountDraft("45", 16, 90)).toBe(45);
  });

  it("clamps a finished value above the maximum", () => {
    expect(clampCountDraft("165", 16, 90)).toBe(90);
  });

  it("strips anything that is not a digit", () => {
    expect(clampCountDraft("4a5", 0, 120)).toBe(45);
    expect(clampCountDraft("-5", 0, 120)).toBe(5);
  });

  it("falls back to the minimum for an empty or all-stripped draft", () => {
    expect(clampCountDraft("", 16, 90)).toBe(16);
    expect(clampCountDraft("abc", 16, 90)).toBe(16);
  });

  it("never returns a value outside [min, max]", () => {
    for (const raw of ["0", "16", "45", "90", "9999", "-1", ""]) {
      const n = clampCountDraft(raw, 16, 90);
      expect(n).toBeGreaterThanOrEqual(16);
      expect(n).toBeLessThanOrEqual(90);
    }
  });
});
