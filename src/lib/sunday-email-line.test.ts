import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { SUNDAY_EMAIL_LINE } from "@/lib/product";

/*
  One description of the Sunday email, printed word for word wherever it
  appears.

  There used to be three, and they disagreed about what the product does.
  SUNDAY_EMAIL_LINE was written to end that, the walkthrough and the landing
  page were changed to print it, and Account was missed: it kept a sentence
  of its own promising that "nothing else lands in your inbox", which is not
  true, because an account that signs up and adds nothing gets a reminder
  about a week later.

  So the constant existed and nothing held anybody to it. This does. A
  surface may add its own second sentence about its own context, which is
  why the check is that the constant appears rather than that nothing else
  does; what it forbids is a second, hand-written description of the same
  email.
*/

const ROOT = path.resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Phrases that only ever appeared in a hand-written description of this
 * email. Each is here because it was actually found in one, so the list
 * cannot rot into a guess about what somebody might write.
 */
const HAND_WRITTEN = [
  "nothing else lands in your inbox",
  "One email a week.",
  "one email a week,",
];

describe("the Sunday email is described in one place", () => {
  it("is printed from the constant wherever it is described", () => {
    for (const file of walk(ROOT)) {
      const src = readFileSync(file, "utf8");
      for (const phrase of HAND_WRITTEN) {
        if (!src.includes(phrase)) continue;
        const rel = path.relative(ROOT, file);
        expect(
          src.includes("SUNDAY_EMAIL_LINE"),
          `src/${rel} describes the Sunday email in its own words ` +
            `("${phrase}") instead of printing SUNDAY_EMAIL_LINE. Three ` +
            `descriptions of one email is what that constant exists to ` +
            `prevent, and the one Account carried was also untrue.`
        ).toBe(true);
      }
    }
  });

  it("does not itself promise that no other mail arrives", () => {
    /*
      One reminder does arrive, from /api/cron/empty-book-nudge, to somebody
      who signed up and added nothing. The constant must not deny it, and a
      surface that wants to mention it adds its own clause.
    */
    expect(SUNDAY_EMAIL_LINE.toLowerCase()).not.toContain("nothing else");
    expect(SUNDAY_EMAIL_LINE.toLowerCase()).not.toContain("only email");
  });
});
