import { describe, expect, it } from "vitest";
import { plainError } from "@/lib/plain-error";

const FALLBACK = "Couldn't load that. Try again.";

describe("plainError", () => {
  /**
   * The file's own docstring promises that "X required" never reaches a
   * toast or a banner. It only half did: the guard matched a single
   * snake_case token, so every multi-word variant a route actually returns
   * walked through to the reader. "Sign in required" is the one that hurt
   * most, because it is what every route says once a session lapses and it
   * rendered as six red words on an otherwise empty Fund page.
   */
  it("never shows a developer 'required' key to a reader", () => {
    for (const raw of [
      "portfolio_id required",
      "id required",
      "userId and decision required",
      "portfolioId and forecast snapshot required",
      "shares required",
      "A ticker is required.",
    ]) {
      expect(plainError(raw, FALLBACK)).not.toMatch(/required/i);
    }
  });

  it("turns a lapsed session into an instruction, not the raw phrase", () => {
    expect(plainError("Sign in required", FALLBACK)).toBe(
      "You're signed out. Sign in again to see this."
    );
    expect(
      plainError("Sign in required to load your portfolio", FALLBACK)
    ).toBe("You're signed out. Sign in again to see your portfolio.");
  });

  it("keeps the mapped wording for keys that end in 'required'", () => {
    // These are in KNOWN and must win over the blanket rule below it.
    expect(plainError("token required", FALLBACK)).toBe(
      "That invite link is missing a code."
    );
    expect(plainError("Invite code required", FALLBACK)).toBe(
      "Paste an invite code first."
    );
    expect(plainError("name required", FALLBACK)).toBe("Give it a name first.");
  });

  it("still routes database and driver text to the fallback", () => {
    for (const raw of [
      'duplicate key value violates unique constraint "portfell_holdings_pkey"',
      "new row violates row-level security policy",
      "PGRST116: JSON object requested",
      "fetch failed",
    ]) {
      expect(plainError(raw, FALLBACK)).toBe(FALLBACK);
    }
  });

  it("passes through a sentence written for a person", () => {
    const written = "That ticker doesn't look like a real symbol.";
    expect(plainError(written, FALLBACK)).toBe(written);
  });

  /*
    An error is a bad moment to introduce the company. "That action is not
    one we recognize" answers the reader's problem by talking about us, and
    this is the sentence somebody meets when something has just failed,
    which is exactly when the shortest true answer is the kind one.
  */
  it("says what happened without talking about us", () => {
    for (const raw of ["Unknown action", "Unrecognized ticker"]) {
      const out = plainError(raw, FALLBACK);
      expect(out).not.toMatch(/\bwe\b|\bus\b|\bour\b/i);
      expect(out).not.toBe(raw);
    }
    expect(plainError("Unknown action", FALLBACK)).toBe(
      "That did not work. Try again."
    );
  });

  /* The one scheduled email is called the Sunday letter everywhere. */
  it("calls the Sunday letter the Sunday letter", () => {
    expect(plainError("sunday required", FALLBACK)).toBe(
      "Pick whether you want the Sunday letter."
    );
  });
});
