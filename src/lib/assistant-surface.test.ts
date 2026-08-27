/**
 * Margus floats over the page, so he takes the overlay material, and the
 * round launcher is gone while the panel is open.
 *
 * Two bugs, one screen, both reported off a phone. The panel carried
 * `glass`, which is the *card* material: a 2% white veil at a 6px blur,
 * built to sit over the ambient field and let the black through. Pinned
 * over the forecast chart and the holdings table it let the page through
 * instead, and the two sets of words interleaved. Every other surface in
 * the app that sits over content already takes the heavy fill, and
 * `AnalyticsConsentBanner` records the same fix being made once before.
 *
 * The second is two dismisses in the same corner. The launcher stayed on
 * screen and swapped its glyph to an X, so close lived twice: once on the
 * header and once as the loudest pixel a thumb's width from send. Gold
 * still means open. Dismiss is the header X alone.
 *
 * Asserted against the source: both are a class and a prop at a call site
 * rather than anything a render would show, and the material only differs
 * once a real backdrop is behind it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CHAT = "src/components/CcAdvisorChat.tsx";
const SOURCE = readFileSync(CHAT, "utf8");

/**
 * Every `className` value in the file, string and template literal alike.
 *
 * Scanning the whole source would read the prose above each fix, which
 * names `glass` in order to say it is the wrong answer. What is being
 * asserted is what ships to the browser, so only the class lists count.
 */
function classNames(source: string): string[] {
  return [
    ...source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g),
  ].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
}

describe("assistant surfaces", () => {
  it("floats on the overlay material, never the card veil", () => {
    const carded = classNames(SOURCE).filter((c) =>
      /(?:^|\s)glass(?:$|\s)/.test(c)
    );
    expect(
      carded,
      "a bare `glass` class in the assistant: the card veil is for surfaces " +
        "laid out in the field, and this panel is pinned over the page"
    ).toEqual([]);
  });

  it("frosts the panel itself", () => {
    expect(
      classNames(SOURCE).some(
        (c) => c.includes("glass-overlay") && c.includes("flex-col")
      ),
      "the open panel carries glass-overlay"
    ).toBe(true);
  });

  it("hides the launcher while the panel is open", () => {
    expect(
      SOURCE,
      "the round launcher is not in the tree while the panel is open"
    ).toMatch(/\{!open && \(/);
    expect(SOURCE).not.toMatch(
      /aria-label=\{open \? "Close Assistant Margus"/
    );
    expect(SOURCE).toMatch(/aria-label="Close Margus"/);
    expect(SOURCE).toMatch(/aria-label="Open Assistant Margus"/);
  });

  it("never asks which portfolio", () => {
    expect(SOURCE).not.toMatch(/Which portfolio/);
    expect(SOURCE).not.toMatch(/Do my portfolios/);
    expect(SOURCE).not.toMatch(/Open a portfolio to apply/);
    expect(SOURCE).not.toMatch(/Chat for /);
  });

  it("lifts the open panel by the measured dock, at every width", () => {
    expect(
      SOURCE,
      "the open overlay reads --dock-clearance so it sits above the bar"
    ).toMatch(/margus-open[\s\S]{0,400}--dock-clearance/);
    expect(SOURCE, "no leftover lg:bottom override on the open overlay").not.toMatch(
      /open[\s\S]{0,80}lg:bottom/
    );
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css, "keyboard drops the dock lift").toMatch(
      /html\[data-keyboard="open"\] \.margus-open/
    );
  });

  it("keeps the accent on send once there is something to send", () => {
    const send = SOURCE.slice(SOURCE.indexOf('aria-label="Send"') - 240);
    expect(
      send.slice(0, 240),
      "the send button stays the default (accent) variant"
    ).not.toMatch(/variant="(?:secondary|outline|ghost)"/);
  });
});

describe("screenshot picker", () => {
  const DASH = readFileSync("src/components/Dashboard.tsx", "utf8");
  const PICKER = readFileSync("src/lib/use-screenshot-picker.ts", "utf8");

  it("never mounts a file input on the dashboard or inside Margus markup", () => {
    expect(DASH).not.toMatch(/type="file"/);
    expect(SOURCE).not.toMatch(/type="file"/);
  });

  it("only opens from a tap, never from a lifecycle hook", () => {
    expect(PICKER).not.toMatch(/useEffect/);
    expect(PICKER).toMatch(/tabIndex: -1/);
    expect(SOURCE).not.toMatch(/useEffect\([\s\S]{0,400}?\.click\(\)/);
    expect(DASH).not.toMatch(/useEffect\([\s\S]{0,400}?\.click\(\)/);
  });
});
