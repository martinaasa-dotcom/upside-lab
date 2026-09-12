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
      "Groq",
      "NVIDIA",
      "Cerebras",
    ]) {
      expect(privacy).toContain(party);
    }
    /*
      Naming a provider the app sends nothing to is as wrong as failing to
      name one it does. Gemini's key was deleted and its leg removed, so it
      must not stand in a list of where a reader's data goes.
    */
    expect(privacy).not.toContain("Gemini");
  });

  it("names every model provider the chain can actually call", () => {
    /*
     * The list above is a list of names, so it catches a provider being
     * taken OFF the page and cannot catch one being added to the chain and
     * never put on it. That is the direction that matters here: the page is
     * a legal document about where a reader's data goes, and a new leg in
     * `model.ts` that nobody thought to name leaves it quietly untrue.
     *
     * It has happened once already in a neighbouring file. AGENTS.md
     * records that adding the NVIDIA leg broke `weekly-letter-prose.test.ts`
     * because that test cleared three provider keys and there were now
     * four, and it only surfaced on a machine that happened to have the new
     * key set.
     *
     * So the legs are read out of `model.ts` itself. A key with no name
     * here fails rather than passing, which is what makes the next provider
     * somebody adds arrive as a decision about the privacy page instead of
     * as silence.
     */
    const model = readFileSync(
      join(process.cwd(), "src/lib/ai/model.ts"),
      "utf8"
    );
    const NAME_FOR_KEY: Record<string, string> = {
      GROQ_API_KEY: "Groq",
      NVIDIA_API_KEY: "NVIDIA",
      OPENROUTER_API_KEY: "OpenRouter",
      CEREBRAS_API_KEY: "Cerebras",
    };
    const keys = [
      ...new Set(
        [...model.matchAll(/hasKey\("([A-Z0-9_]+_API_KEY)"\)/g)].map(
          (m) => m[1]!
        )
      ),
    ];
    expect(keys.length, "no provider legs found in model.ts").toBeGreaterThan(0);
    for (const key of keys) {
      const name = NAME_FOR_KEY[key];
      expect(
        name,
        `${key} is a provider leg with no name in this test. Add the ` +
          `provider to the privacy page's roll call and to NAME_FOR_KEY.`
      ).toBeTruthy();
      expect(
        privacy,
        `${key} is a leg in model.ts but ${name} is not named on the ` +
          `privacy page, which says where a reader's data goes`
      ).toContain(name!);
    }
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
