/**
 * The two legal pages say things about the code, and the code moves.
 *
 * `test-invariants.ts` already checks that they name the operator and the
 * product. What it never checked is the part that goes stale on its own:
 * which cookies exist, which outside companies touch the data, what the
 * paid plan is called, and where the data is kept. Every assertion below
 * is a fact somebody can check by opening the file it names, and it fails
 * here first rather than in front of a regulator.
 *
 * Deliberately assertions about the rules rather than the sentences.
 * Wording is meant to be edited; a claim that the app sets no cookie of
 * its own is not.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const terms = read("src/app/terms/page.tsx");
const privacy = read("src/app/privacy/page.tsx");

describe("the terms say what the paid plan really is", () => {
  it("calls it the supporter plan, the way the rest of the app does", () => {
    expect(terms).toMatch(/supporter plan/);
  });

  /*
    "Unlock" is on the list of words that read as generated, and it was
    also the wrong word: nothing is behind a lock. The plan buys the reader
    nothing at all, and saying so plainly is the whole point of the
    paragraph.
  */
  it("does not promise or deny an unlock", () => {
    expect(terms).not.toMatch(/unlock/i);
    expect(terms).toMatch(/gets you nothing extra/);
  });

  it("still covers Stripe, cancelling, the 14 days, and VAT", () => {
    expect(terms).toMatch(/Stripe/);
    expect(terms).toMatch(/end of the month you have already paid for/);
    expect(terms).toMatch(/14 days/);
    expect(terms).toMatch(/One Stop Shop/);
  });

  /*
    The section was one 200-word paragraph covering five different
    questions. A reader looking for the cancellation rule had to read the
    VAT rule to find it.
  */
  it("breaks that section into paragraphs rather than one block", () => {
    const section = terms.slice(terms.indexOf("4. The supporter plan"));
    const upToNext = section.slice(0, section.indexOf("5. Classroom"));
    expect(upToNext.match(/<p>/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  /*
    "Total loss of principal" is the phrase a prospectus uses. The same
    fact in words a grandma reads is that you can lose the money you put
    in.
  */
  it("says you can lose your money without saying principal", () => {
    expect(terms).not.toMatch(/principal/i);
    expect(terms).toMatch(/lose\s+some or all of the money you put in/);
  });
});

describe("the privacy policy matches what the code does", () => {
  it("says plainly that the data is kept in the EU", () => {
    expect(privacy).toMatch(/European Union/);
  });

  /*
    Two cookies, both ours, both short of anything that follows a person:
    Supabase's sign-in cookie, and the ten-minute one written before the
    browser leaves for Google so the trip back can be checked
    (`googleOAuthCookieOptions`, src/lib/auth/google-oauth.ts). The page
    used to say the Supabase one was the only cookie the app sets, which
    stopped being true when the sign-in handshake moved onto our own
    domain.
  */
  it("describes both of its own cookies, and the Secure flag on them", () => {
    expect(privacy).toMatch(/two cookies of its own/);
    expect(privacy).toMatch(/ten minutes/);
    expect(privacy).toMatch(/encrypted connection/);
    expect(privacy).not.toMatch(/the only cookie this app sets/);
  });

  it("names every outside company that actually touches the data", () => {
    for (const party of [
      "Supabase",
      "Vercel",
      "Stripe",
      "Resend",
      "Google",
      "Cloudflare",
      "Yahoo Finance",
      "Twelve Data",
      "Finnhub",
      "OpenRouter",
      "Gemini",
      "Cerebras",
    ]) {
      expect(privacy).toContain(party);
    }
    // Naming a provider the app does not send anything to is as wrong as
    // failing to name one it does. Groq was removed from the chain because
    // the key available for it is a paid-tier one, so it must not be listed
    // among the places a reader's data goes.
    expect(privacy).not.toContain("Groq");
  });

  it("names both kinds of mail the app sends on its own", () => {
    expect(privacy).toMatch(/Sunday letter/);
    expect(privacy).toMatch(/if your portfolio is still empty/);
    expect(privacy).not.toMatch(/Sunday email/);
  });

  it("says what deleting an account actually removes", () => {
    for (const gone of [
      /any\s+portfolio you solely own/,
      /your circle\s+memberships/,
      /extra addresses you connected/,
      /sign-in credential/,
    ]) {
      expect(privacy).toMatch(gone);
    }
  });
});

describe("neither page reads as generated", () => {
  it("carries no em or en dash a reader could meet", () => {
    for (const page of [terms, privacy]) {
      expect(page).not.toMatch(/[–—]/);
      expect(page).not.toMatch(/&mdash;|&ndash;/);
    }
  });

  it("never calls a company a name", () => {
    for (const page of [terms, privacy]) {
      expect(page).not.toMatch(/the names you hold|read the names/);
    }
  });
});
