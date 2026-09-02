import { describe, expect, it } from "vitest";

import {
  ADDRESS_MESSAGES,
  MAX_LINKED_ADDRESSES,
  addressOutcomeIsGood,
  decideClaim,
  hashLinkToken,
  isAddressOutcome,
  linkUrl,
  maskAddress,
  mintLinkToken,
  type ClaimFacts,
} from "@/lib/auth/account-addresses";
import { normalizeAddress, readEmail, suggestDomain } from "@/lib/auth/email-address";
import { googleEmailFromIdToken, readIdTokenClaims } from "@/lib/auth/id-token";

const ME = "11111111-1111-4111-8111-111111111111";
const THEM = "22222222-2222-4222-8222-222222222222";

function facts(over: Partial<ClaimFacts> = {}): ClaimFacts {
  return {
    me: ME,
    email: "second@gmail.com",
    primaryEmail: "first@upthink.ee",
    linked: null,
    loginAccount: null,
    neverUsed: false,
    linkedCount: 0,
    ...over,
  };
}

describe("who may claim an address", () => {
  it("lets a free address through", () => {
    expect(decideClaim(facts())).toEqual({ kind: "ok" });
  });

  it("treats the address the account already signs in with as done", () => {
    expect(decideClaim(facts({ email: "first@upthink.ee" }))).toEqual({
      kind: "already",
    });
  });

  it("ignores the case of the primary address", () => {
    expect(
      decideClaim(facts({ email: "first@upthink.ee", primaryEmail: "First@Upthink.ee" }))
    ).toEqual({ kind: "already" });
  });

  it("says nothing needs doing when this account already confirmed it", () => {
    expect(
      decideClaim(facts({ linked: { account: ME, verified: true } }))
    ).toEqual({ kind: "already" });
  });

  it("lets an unconfirmed row of my own be sent again", () => {
    expect(
      decideClaim(facts({ linked: { account: ME, verified: false } }))
    ).toEqual({ kind: "ok" });
  });

  it("refuses an address already on somebody else's account", () => {
    expect(decideClaim(facts({ linked: { account: THEM, verified: true } }))).toEqual({
      kind: "refuse",
      code: "linked-elsewhere",
    });
  });

  it("refuses an address whose own account has been used", () => {
    expect(
      decideClaim(facts({ loginAccount: THEM, neverUsed: false }))
    ).toEqual({ kind: "refuse", code: "has-data" });
  });

  it("adopts an account that has never been used", () => {
    expect(decideClaim(facts({ loginAccount: THEM, neverUsed: true }))).toEqual({
      kind: "adopt",
      account: THEM,
    });
  });

  it("does not adopt this account's own login", () => {
    expect(decideClaim(facts({ loginAccount: ME, neverUsed: true }))).toEqual({
      kind: "ok",
    });
  });

  it("refuses once the account is full", () => {
    expect(decideClaim(facts({ linkedCount: MAX_LINKED_ADDRESSES }))).toEqual({
      kind: "refuse",
      code: "limit",
    });
  });

  /*
    The order these two are checked in is the point. Somebody at the limit
    asking for an address that was never going to be allowed should hear the
    real reason, not be sent away to make space for it first.
  */
  it("names the account, not the limit, when both would refuse", () => {
    expect(
      decideClaim(
        facts({
          loginAccount: THEM,
          neverUsed: false,
          linkedCount: MAX_LINKED_ADDRESSES,
        })
      )
    ).toEqual({ kind: "refuse", code: "has-data" });
  });

  it("still lets a full account resend its own pending confirmation", () => {
    expect(
      decideClaim(
        facts({
          linked: { account: ME, verified: false },
          linkedCount: MAX_LINKED_ADDRESSES,
        })
      )
    ).toEqual({ kind: "ok" });
  });
});

describe("the confirmation token", () => {
  it("stores a digest and never the token", () => {
    const minted = mintLinkToken();
    expect(minted.hash).toBe(hashLinkToken(minted.token));
    expect(minted.hash).not.toContain(minted.token);
    expect(minted.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("lasts an hour", () => {
    const now = new Date("2026-08-23T10:00:00.000Z");
    expect(mintLinkToken(now).expiresAt).toBe("2026-08-23T11:00:00.000Z");
  });

  it("survives a round trip through a query string", () => {
    const minted = mintLinkToken();
    const url = new URL(linkUrl("https://upsidelab.app", minted.token));
    expect(url.pathname).toBe("/auth/link");
    expect(url.searchParams.get("token")).toBe(minted.token);
  });
});

describe("every outcome has a sentence", () => {
  it("answers to the word the Google handshake carries back", () => {
    for (const outcome of Object.keys(ADDRESS_MESSAGES)) {
      expect(isAddressOutcome(outcome)).toBe(true);
    }
    expect(isAddressOutcome("whatever")).toBe(false);
    expect(isAddressOutcome(null)).toBe(false);
  });

  it("does not read a refusal as good news", () => {
    expect(addressOutcomeIsGood("linked")).toBe(true);
    expect(addressOutcomeIsGood("already")).toBe(true);
    expect(addressOutcomeIsGood("has-data")).toBe(false);
    expect(addressOutcomeIsGood("limit")).toBe(false);
  });

  it("says the limit out loud rather than leaving a number in the code", () => {
    expect(ADDRESS_MESSAGES.limit).toContain(String(MAX_LINKED_ADDRESSES));
  });
});

describe("reading a typed address", () => {
  it("tidies what a paste drags along", () => {
    expect(normalizeAddress("  <MAILTO:Someone@Gmail.com>  ")).toBe(
      "someone@gmail.com"
    );
  });

  it("refuses a name that can never receive", () => {
    expect(readEmail("me@example.com").kind).toBe("unreachable");
    expect(readEmail("noreply@gmail.com").kind).toBe("unreachable");
    expect(readEmail("no-at-sign").kind).toBe("unreachable");
  });

  it("asks about a near miss rather than correcting it", () => {
    const verdict = readEmail("me@gmial.com");
    expect(verdict.kind).toBe("check");
    if (verdict.kind === "check") expect(verdict.suggestion).toBe("me@gmail.com");
  });

  it("leaves a real domain alone", () => {
    expect(readEmail("me@upthink.ee").kind).toBe("ok");
    expect(suggestDomain("gmail.com")).toBeUndefined();
  });

  /* A coin toss presented as help is worse than saying nothing. */
  it("suggests nothing for a short name one edit from something famous", () => {
    expect(suggestDomain("we.com")).toBeUndefined();
  });
});

describe("the address on a Google identity token", () => {
  const CLIENT = "client-id.apps.googleusercontent.com";

  function token(claims: Record<string, unknown>): string {
    const part = (value: unknown) =>
      Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
    return `${part({ alg: "RS256" })}.${part(claims)}.signature`;
  }

  const good = {
    iss: "https://accounts.google.com",
    aud: CLIENT,
    exp: Math.floor(Date.parse("2026-08-23T12:00:00.000Z") / 1000),
    email: "Someone@Gmail.com",
    email_verified: true,
  };

  const now = new Date("2026-08-23T11:00:00.000Z");

  it("reads a confirmed address", () => {
    expect(googleEmailFromIdToken(token(good), CLIENT, now)).toBe("someone@gmail.com");
  });

  it("refuses a token issued for another app", () => {
    expect(googleEmailFromIdToken(token(good), "someone-else", now)).toBeNull();
  });

  it("refuses a token issued by somebody else", () => {
    expect(
      googleEmailFromIdToken(token({ ...good, iss: "https://evil.example" }), CLIENT, now)
    ).toBeNull();
  });

  it("refuses an expired token", () => {
    const later = new Date("2026-08-23T13:00:00.000Z");
    expect(googleEmailFromIdToken(token(good), CLIENT, later)).toBeNull();
  });

  it("refuses an address Google has not confirmed", () => {
    expect(
      googleEmailFromIdToken(token({ ...good, email_verified: false }), CLIENT, now)
    ).toBeNull();
  });

  it("refuses anything that is not a token", () => {
    expect(readIdTokenClaims("not.a")).toBeNull();
    expect(googleEmailFromIdToken("not.a.jwt", CLIENT, now)).toBeNull();
    expect(googleEmailFromIdToken(token(good), undefined, now)).toBeNull();
  });
});

describe("naming an account on a page behind no sign-in", () => {
  /*
    Every page in this feature has to say which account a link opens, or the
    reader is agreeing to something nobody described. None of them is behind a
    session, so the mailbox goes and the domain stays: enough for the person it
    is meant for to recognise, not enough for anybody else to learn.
  */
  it("keeps a couple of letters and the whole domain", () => {
    expect(maskAddress("martin.aasa@upthink.ee")).toBe("ma...@upthink.ee");
    expect(maskAddress("amandalucas400@gmail.com")).toBe("am...@gmail.com");
  });

  it("gives a very short mailbox away less, not more", () => {
    expect(maskAddress("ab@x.com")).toBe("a...@x.com");
    expect(maskAddress("a@x.com")).toBe("a...@x.com");
  });

  it("says nothing at all about something that is not an address", () => {
    expect(maskAddress("")).toBe("...");
    expect(maskAddress("nothing")).toBe("...");
    expect(maskAddress("@x.com")).toBe("...");
  });

  it("has a sentence for the pace refusal, like every other outcome", () => {
    expect(isAddressOutcome("slow-down")).toBe(true);
    expect(ADDRESS_MESSAGES["slow-down"]).toMatch(/tomorrow/);
    expect(addressOutcomeIsGood("slow-down")).toBe(false);
  });
});
