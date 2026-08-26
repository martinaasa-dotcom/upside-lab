/**
 * Margus floats over the page, so he takes the overlay material, and the
 * accent in his corner means send rather than close.
 *
 * Two bugs, one screen, both reported off a phone. The panel carried
 * `glass`, which is the *card* material: a 2% white veil at a 6px blur,
 * built to sit over the ambient field and let the black through. Pinned
 * over the forecast chart and the holdings table it let the page through
 * instead, and the two sets of words interleaved. Every other surface in
 * the app that sits over content already takes the heavy fill, and
 * `AnalyticsConsentBanner` records the same fix being made once before.
 *
 * The second is what the gold was pointing at. The launcher kept the
 * accent fill in both states and only swapped its glyph, so with the panel
 * open the loudest pixel on the screen was *close* -- a thumb's width from
 * a send button that stays neutral until there is something to send. The
 * one saturated thing in reach did the opposite of what a thumb reaching
 * for it expected.
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

  it("spends the accent on send, not on close", () => {
    expect(
      SOURCE,
      "the launcher drops the accent while the panel is open"
    ).toMatch(/variant=\{open \? "(?:secondary|outline|ghost)" : "default"\}/);
  });

  it("keeps the accent on send once there is something to send", () => {
    const send = SOURCE.slice(SOURCE.indexOf('aria-label="Send"') - 240);
    expect(
      send.slice(0, 240),
      "the send button stays the default (accent) variant"
    ).not.toMatch(/variant="(?:secondary|outline|ghost)"/);
  });
});
