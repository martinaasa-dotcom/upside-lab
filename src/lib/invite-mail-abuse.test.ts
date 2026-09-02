import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { communityInviteCopy } from "@/lib/email-letter";

/*
  Anyone signed in can create a circle and is then its admin, and one call
  to the invites route mails up to twenty addresses that never asked for
  anything, from the same domain the sign-in links and the Sunday letter go
  out from. Two things made that worth doing at scale: nothing counted the
  messages, and the subject line was the circle's name.
*/
const route = readFileSync(
  join(process.cwd(), "src/app/api/communities/[id]/invites/route.ts"),
  "utf8"
);

const PHISH = "URGENT: your Upside Lab account is suspended";

describe("the subject carries nothing anybody typed", () => {
  it("says what the message is, in the product's own words", () => {
    const circle = communityInviteCopy({
      name: PHISH,
      url: "https://upsidelab.app/x",
      classroom: false,
    });
    expect(circle.subject).toBe(
      "You have been invited to a circle on Upside Lab"
    );
    expect(circle.subject).not.toContain("URGENT");
  });

  it("says class where it is a class", () => {
    expect(
      communityInviteCopy({ name: "Y11 Economics", url: "u", classroom: true })
        .subject
    ).toBe("You have been invited to a class on Upside Lab");
  });

  it("still names the circle in the body, escaped", () => {
    /*
      The name belongs in the message. What it must not do is appear in an
      inbox list, where a sentence beside a familiar sender reads as the
      product speaking rather than as somebody's chosen label.
    */
    const copy = communityInviteCopy({
      name: '<b>Kitchen table</b>',
      url: "https://upsidelab.app/x",
      classroom: false,
    });
    expect(copy.text).toContain("Kitchen table");
    expect(copy.html).toContain("&lt;b&gt;Kitchen table&lt;/b&gt;");
    expect(copy.html).not.toContain("<b>Kitchen table</b>");
  });

  it("uses no dash as a clause break, like every other letter", () => {
    const copy = communityInviteCopy({ name: "A", url: "u", classroom: false });
    expect(copy.subject).not.toMatch(/[—–]/);
    expect(copy.text).not.toMatch(/[—–]/);
  });
});

describe("the mail is counted", () => {
  it("bounds it per account and per circle, both", () => {
    // Neither one account nor one circle is the way round it.
    expect(route).toContain("`invite-mail:user:${auth.user.id}`");
    expect(route).toContain("`invite-mail:circle:${id}`");
  });

  it("charges by the envelope, not by the request", () => {
    // Twenty addresses in one call is twenty messages sent.
    expect(route).toContain("takeDurableRateLimitWeighted");
    expect(route).toContain("const cost = allow.emails.length;");
  });

  it("counts before anything is sent", () => {
    const block = route.slice(route.indexOf("if (allow.emails.length > 0"));
    const charge = block.indexOf("takeDurableRateLimitWeighted");
    const send = block.indexOf("await sendNoteEmail(");
    expect(charge).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(charge);
  });

  it("hands back the link rather than losing the reader's work", () => {
    /*
      The invite row is already written by this point, so a refusal that
      dropped the token would be the route destroying something the caller
      just made. It answers 429 with the link in it.
    */
    const refusal = route.slice(route.indexOf("if (!bill.ok)"));
    expect(refusal.slice(0, 600)).toContain("token,");
    expect(refusal.slice(0, 600)).toContain("path,");
    expect(refusal.slice(0, 600)).toContain("Retry-After");
  });

  it("says so in a sentence, not a status", () => {
    expect(route).toContain("That is a lot of invites for one day");
  });
});
