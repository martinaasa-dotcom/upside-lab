/**
 * The root element declares no overflow, so a menu hung off the chrome
 * opens where the reader is looking.
 *
 * `html` carried `overflow-x: clip` beside `body`'s, which reads as
 * belt-and-braces and is not. Setting either axis makes the root a scroll
 * container, and Floating UI, which positions every Radix menu, select,
 * popover and tooltip in this app, asks exactly that question before it
 * places one: when the root is an overflow element it works in document
 * coordinates instead of viewport ones. For anything laid out in the page
 * the two agree and nothing looks wrong, which is why this survived so
 * long. For the chrome they do not agree at all, because the chrome is the
 * one thing that stays put while the page moves: the phone's top bar is
 * `sticky top-0` and the desktop header is `md:fixed`, so both sit at the
 * top of the screen while their place in the document stays at the top of
 * the page. The gap between those two is the scroll offset, and the menu
 * was drawn that far above where it belonged.
 *
 * Measured on the running app at 390x844, scrolled 186px down: the top
 * bar's overflow menu opened at viewport y -132 instead of 54, entirely
 * above the top of the screen. It was open, and focused, and invisible. A
 * reader taps the three dots next to their avatar, sees nothing, taps
 * again and closes it. Nothing about that says which of the two taps did
 * what, so it reads as a button that does nothing at all. Every menu
 * anchored to the chrome had it, on both breakpoints, and only while the
 * page was scrolled, which is what made it look intermittent.
 *
 * Asserted against the source because the bug is one declaration in a
 * stylesheet, and because the symptom is a coordinate no unit test would
 * ever compute.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CSS = readFileSync("src/app/globals.css", "utf8");

/** The top-level `html { ... }` block, comments stripped. */
function rootRule(): string {
  const match = CSS.match(/(?:^|\n)html\s*\{([\s\S]*?)\n\}/);
  if (!match) throw new Error("no top-level html rule in globals.css");
  return match[1].replace(/\/\*[\s\S]*?\*\//g, "");
}

/** The top-level `body { ... }` block, comments stripped. */
function bodyRule(): string {
  const match = CSS.match(/(?:^|\n)body\s*\{([\s\S]*?)\n\}/);
  if (!match) throw new Error("no top-level body rule in globals.css");
  return match[1].replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("root overflow", () => {
  it("declares no overflow on html", () => {
    expect(
      rootRule(),
      "an overflow on the root makes it a scroll container, and every popper anchored to the sticky or fixed chrome is then drawn one scroll offset above where it belongs",
    ).not.toMatch(/(^|\s)overflow(-x|-y)?\s*:/);
  });

  it("still clips sideways, on body", () => {
    /*
     * The protection does not go away with the rule above it: with nothing
     * set on the root, the viewport takes its overflow from `body`
     * instead, so the page still cannot be dragged sideways. Measured at
     * 360, 390, 430, 500 and 1280 wide: no horizontal overflow anywhere,
     * and `window.scrollX` stays 0 after asking it to scroll to 400.
     */
    expect(bodyRule()).toMatch(/overflow-x\s*:\s*clip/);
  });
});
