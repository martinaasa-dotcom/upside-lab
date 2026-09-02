/**
 * The loading screen is the one a person waits on to find out whether they
 * lost money today, and for a long time it opened with a joke about it.
 *
 * The pool held forty lines, and among them "Checking if you're rich yet",
 * "Recalculating how rich you feel", "Loading, and unlike your portfolio,
 * this won't take forever", "Buffering your financial destiny",
 * "Consulting the financial oracles" and "Double-checking you didn't buy
 * the dip by accident", which is market slang in the one file the
 * model-output scrubber never sees. There was also a run about lost keys,
 * couch cushions and turning the house upside down, which tells somebody
 * opening their savings that it has been mislaid.
 *
 * The rule that replaced them is not "no humour anywhere": Margus is
 * allowed to be warm and funny in his own voice. It is that this screen
 * says what the app is doing and nothing else. This test is what keeps it
 * that way, since the pool is exactly the kind of list a passing hand adds
 * one more line to.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOADING_MESSAGE,
  pickLoadingMessage,
} from "@/lib/loading-messages";

/** Every line the pool can hand out, gathered by asking it enough times. */
function allMessages(): string[] {
  const seen = new Set<string>();
  for (let i = 0; i < 4000; i += 1) seen.add(pickLoadingMessage());
  return [...seen];
}

describe("the loading screen keeps a straight face", () => {
  it("opens on the same line the session shell already painted", () => {
    expect(DEFAULT_LOADING_MESSAGE).toBe("Opening your portfolio …");
  });

  it("says nothing about the reader's money, luck, or fate", () => {
    const banned = [
      /rich/i,
      /empire/i,
      /flex/i,
      /destiny/i,
      /oracle/i,
      /market gods/i,
      /buy the dip/i,
      /spreadsheet/i,
      /excuse/i,
      /bribing/i,
      /keys/i,
      /couch/i,
      /pockets/i,
      /losses/i,
      /gains/i,
    ];
    for (const line of allMessages()) {
      for (const bad of banned) expect(line).not.toMatch(bad);
    }
  });

  it("writes every line the same way, with a spaced ellipsis", () => {
    for (const line of allMessages()) {
      expect(line.endsWith(" …")).toBe(true);
      expect(line).not.toMatch(/\.\.\./);
      // No em or en dash, same as everywhere else a person reads.
      expect(line).not.toMatch(/[–—]/);
    }
  });

  it("stays a short list, so it reads as one voice rather than a bit", () => {
    const lines = allMessages();
    expect(lines.length).toBeGreaterThan(3);
    expect(lines.length).toBeLessThanOrEqual(8);
  });
});
