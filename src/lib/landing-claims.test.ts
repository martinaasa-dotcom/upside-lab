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

  it("still says a session never joins anybody to anything", () => {
    // The rule migration 030 exists for. Cheap to restate, expensive to lose.
    expect(landing).toMatch(/Signing in never puts you in one/i);
    const ensure = read("src/lib/auth/ensure-profile.ts");
    expect(ensure).not.toMatch(/from\((?:.*)community_members(?:.*)\)[\s\S]{0,200}insert/);
  });
});
