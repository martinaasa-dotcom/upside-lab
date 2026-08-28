/**
 * The sign-in page's points each have their own icon.
 *
 * `SIGNIN_POINTS` lives in `product.ts`, next to the rest of the copy, and
 * the icons that sit beside them live in `SignInGate.tsx`, because
 * `product.ts` is imported by the manifest and the metadata and has no
 * business pulling in an icon set. Two lists in two files, kept in step by
 * nothing.
 *
 * They fell out of step the first time a point was added: a third line
 * about Circle went into `product.ts` and the icon array stayed at two, so
 * the lookup fell through to its default and shipped a bell beside a
 * sentence about the people you share a portfolio with. Nothing failed,
 * which is why it reached production.
 *
 * The component keeps its fallback, since a missing icon should never
 * blank the sign-in page. This is what stops the fallback being what a
 * reader actually sees.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SIGNIN_POINTS } from "@/lib/product";

/**
 * The icon array as written, counted from source.
 *
 * Read rather than imported because `SignInGate` is a client component
 * pulling in the auth provider and the whole landing page, and none of
 * that needs to boot to count three entries in an array literal.
 */
function iconCount(): number {
  const src = readFileSync("src/components/SignInGate.tsx", "utf8");
  const m = src.match(/const SIGNIN_POINT_ICONS = \[([^\]]*)\] as const;/);
  expect(m, "SIGNIN_POINT_ICONS is written differently now").not.toBeNull();
  return m![1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean).length;
}

describe("the sign-in points and their icons", () => {
  it("has exactly one icon per point", () => {
    expect(iconCount()).toBe(SIGNIN_POINTS.length);
  });

  it("still has points to draw", () => {
    expect(SIGNIN_POINTS.length).toBeGreaterThan(1);
  });
});
