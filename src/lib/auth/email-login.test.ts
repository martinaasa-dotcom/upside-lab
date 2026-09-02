import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { hashLinkToken, mintLinkToken } from "@/lib/auth/account-addresses";
import { normalizeAddress, readEmail } from "@/lib/auth/email-address";
import { EMAIL_LOGIN_SENT, emailLoginNext, emailLoginUrl } from "@/lib/auth/email-login";
import { signInLinkCopy } from "@/lib/email-letter";

describe("email sign-in links", () => {
  it("plants the token on our own sign-in page", () => {
    const minted = mintLinkToken();
    expect(emailLoginUrl("https://upsidelab.app", minted.token)).toBe(
      `https://upsidelab.app/auth/email?token=${encodeURIComponent(minted.token)}`
    );
    expect(hashLinkToken(minted.token)).toHaveLength(64);
  });

  it("drops a next path that would land back in /auth/", () => {
    expect(emailLoginNext("/auth/email?token=abc")).toBe("/");
    expect(emailLoginNext("/communities/join?token=xyz")).toBe(
      "/communities/join?token=xyz"
    );
    expect(emailLoginNext("https://evil.example/")).toBe("/");
  });

  it("keeps a plus-tag, which ProtonMail treats as a real mailbox", () => {
    const raw = "Kaur.Palang+upsidelab@protonmail.com";
    expect(normalizeAddress(raw)).toBe("kaur.palang+upsidelab@protonmail.com");
    expect(readEmail(raw).kind).toBe("ok");
  });

  it("says the same thing whether the address is new or not", () => {
    expect(EMAIL_LOGIN_SENT).toMatch(/Check that inbox/);
    expect(EMAIL_LOGIN_SENT).not.toMatch(/\u2014|\u2013/);
  });

  it("tells them to press the button, and that ignoring it does nothing", () => {
    const copy = signInLinkCopy({ url: "https://upsidelab.app/auth/email?token=x" });
    expect(copy.subject).toBe("Sign in to Upside Lab");
    expect(copy.text).toMatch(/press Sign in/);
    expect(copy.text).toMatch(/ignore it/i);
    expect(copy.html).toMatch(/Open the sign-in page/);
    expect(copy.text).not.toMatch(/\u2014|\u2013/);
    expect(copy.html).not.toMatch(/\u2014|\u2013/);
  });

  it("does not sign anyone in until the button is pressed", () => {
    const page = readFileSync(
      join(process.cwd(), "src/app/auth/email/page.tsx"),
      "utf8"
    );
    const complete = readFileSync(
      join(process.cwd(), "src/app/auth/email/complete/route.ts"),
      "utf8"
    );
    expect(page).toMatch(/method="post"/);
    expect(page).not.toMatch(/consumeEmailLogin/);
    expect(complete).toMatch(/export const POST/);
    expect(complete).not.toMatch(/export const GET/);
  });

  it("names the mailbox the link opens, read without being spent", () => {
    /*
      The page used to say "press the button to open your account" and name
      nothing, so a link forwarded, mis-sent or opened on a machine somebody
      else uses looked exactly like the right one. It peeks now, which is a
      read rather than a spend, and prints the address masked because it is
      behind no sign-in.
    */
    const page = readFileSync(
      join(process.cwd(), "src/app/auth/email/page.tsx"),
      "utf8"
    );

    expect(page).toMatch(/emailLoginTarget/);
    expect(page).toMatch(/maskAddress/);
  });
});
