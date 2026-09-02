import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HOLDING_COLUMNS } from "@/lib/supabase/tables";

/*
  A marketing page makes claims about code, and the code moves. Most of
  those claims are cheap to be wrong about. One kind is not: a promise that
  somebody will not see something. A reader acts on that immediately and
  irreversibly, by inviting a person, and finds out it was wrong afterwards.

  So the two privacy sentences on the landing are pinned to the code that
  has to be true for them. This is not a copy test; it fails when the
  behaviour changes, whichever side moves.
*/
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const landing = read("src/components/SignedOutLanding.tsx");

describe("what the page promises about who sees what", () => {
  it("never tells a reader a co-owner cannot see what they paid", () => {
    /*
      HOLDING_COLUMNS is what /api/portfolios sends to everybody on the
      owners list, and it carries buy_price, which is right: two people who
      own one portfolio are looking at one portfolio, and hiding the cost
      from one of them makes the gain unreadable for them. The page said the
      opposite for as long as this section existed.
    */
    expect(HOLDING_COLUMNS).toContain("buy_price");
    const coOwner = landing.slice(
      landing.indexOf("const CIRCLE_POINTS"),
      landing.indexOf("Or show a circle")
    );
    expect(coOwner).not.toMatch(/never what you paid/i);
    expect(coOwner).toMatch(/what each of you paid included/i);
  });

  it("keeps the cost promise on the circle, where the code makes it true", () => {
    const book = read("src/app/api/communities/[id]/book/route.ts");
    // Zeroed for every reader but the owner of the row (and a teacher
    // reading their own classroom).
    expect(book).toContain("buy_price: showAllCost || (classroom && own)");
    expect(book).toContain("? row.buy_price : 0");
    expect(landing).toMatch(/What you paid for it stays yours/i);
  });

  it("does not claim a circle hides what somebody holds, because it does not", () => {
    // Share counts are sent, so a member can work out what a portfolio is
    // worth. Saying otherwise would be the same mistake in the other
    // direction, and this section is the one place tempted to say it.
    const circle = landing.slice(
      landing.indexOf("Or show a circle"),
      landing.indexOf("Nobody is added for you")
    );
    expect(circle).not.toMatch(/nobody sees what you (own|hold)/i);
    expect(circle).toMatch(/sees what you hold/i);
  });

  it("only promises real prices because the quote path answers a stranger", () => {
    /*
      The landing and the look-around strip both say, in as many words,
      that the holdings are invented and the prices are not. That is a
      claim about `/api/quotes`, which has to answer a caller with no
      session for it to be true, and about the sample, which must hand the
      rooms shares and a buy price and never a price of its own. If either
      moved, the honest sentence would quietly become a lie on the one
      screen whose whole job is to be believed.
    */
    const quotes = read("src/app/api/quotes/route.ts");
    expect(quotes).not.toMatch(/requireAuthUser|getAuthUser/);
    const sample = read("src/lib/sample-portfolio.ts");
    const store = sample.slice(sample.indexOf("export function sampleDemoStore"));
    expect(store).not.toMatch(/\bprice\b(?!Price)/);
    expect(landing).toMatch(/holdings on this card are made up/i);
    expect(landing).toMatch(/prices are real/i);
    expect(read("src/components/SignInGate.tsx")).toMatch(
      /holdings are made up and the prices\s*\n?\s*are real/i
    );
  });

  it("keeps looking around off the network and out of anybody's account", () => {
    /*
      "Session-free, local, no writes" is what the button offers. The
      module behind it may talk to `localStorage` and nothing else: a fetch
      here would be a stranger's browser writing somewhere on the strength
      of a page they have not signed in to.
    */
    const sample = read("src/lib/sample-portfolio.ts");
    expect(sample).not.toMatch(/\bfetch\(/);
    expect(sample).not.toMatch(/from "@\/lib\/supabase/);
    expect(sample).not.toMatch(/XMLHttpRequest|navigator\.sendBeacon/);
  });

  it("says the data is in the EU only while the privacy page does", () => {
    /*
      The footer and the fourth trust line both state it as a fact a
      cautious reader can check, and the privacy page is where it is backed
      up. Asserted as the two things that have to be said rather than as
      the markup saying them: this matched "(EU-hosted)" inside a <strong>,
      and the legal pass rewrote the sentence to "on servers in the
      European Union", which is better prose and failed the check. An
      assertion pinned to today's markup fails on an improvement.
    */
    const privacy = read("src/app/privacy/page.tsx");
    expect(privacy).toMatch(/Supabase/);
    expect(privacy).toMatch(/European Union/);
    expect(read("src/lib/product.ts")).toMatch(/stored in the European Union/);
    expect(landing).toMatch(/stored\s*\n?\s*in the European Union/);
  });

  it("still says a session never joins anybody to anything", () => {
    // The rule migration 030 exists for. Cheap to restate, expensive to lose.
    expect(landing).toMatch(/Signing in never puts you in one/i);
    const ensure = read("src/lib/auth/ensure-profile.ts");
    expect(ensure).not.toMatch(/from\((?:.*)community_members(?:.*)\)[\s\S]{0,200}insert/);
  });
});
