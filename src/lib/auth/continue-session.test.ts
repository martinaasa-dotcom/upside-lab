import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  continueCookieOptions,
  openContinue,
  sealContinue,
} from "@/lib/auth/continue-session";

/*
  What the question between proving an address and being signed in with it
  carries between the two requests.

  It is a cookie rather than a form field because a value in the page is a
  value the page can be made to hand over, and it is signed because a cookie is
  not proof of anything: a neighbour on a shared parent domain can write one,
  and an unsigned one naming an account would be a sign-in anybody could hand
  to anybody.
*/

const KEY = "SUPABASE_SERVICE_ROLE_KEY";
const before = process.env[KEY];

const PASS = {
  address: "second@x.com",
  primaryEmail: "martin@upthink.ee",
  next: "/pulse",
};

beforeEach(() => {
  process.env[KEY] = "a-service-role-key";
});

afterEach(() => {
  if (before === undefined) delete process.env[KEY];
  else process.env[KEY] = before;
});

describe("the continue pass", () => {
  it("comes back saying what it was sealed with", () => {
    const opened = openContinue(sealContinue(PASS)!);

    expect(opened?.address).toBe("second@x.com");
    expect(opened?.primaryEmail).toBe("martin@upthink.ee");
    expect(opened?.next).toBe("/pulse");
    expect(opened?.loginToken).toBeUndefined();
  });

  it("carries an email sign-in token when that is the road taken", () => {
    const opened = openContinue(sealContinue({ ...PASS, loginToken: "tok" })!);
    expect(opened?.loginToken).toBe("tok");
  });

  it("refuses a body somebody edited", () => {
    const sealed = sealContinue(PASS)!;
    const [body, signature] = sealed.split(".");

    const swapped = Buffer.from(
      JSON.stringify({ ...PASS, primaryEmail: "thief@x.com", exp: Date.now() + 60_000 }),
      "utf8"
    ).toString("base64url");

    expect(body).toBeTruthy();
    expect(openContinue(`${swapped}.${signature}`)).toBeNull();
  });

  it("refuses one with no signature at all", () => {
    const sealed = sealContinue(PASS)!;
    expect(openContinue(sealed.split(".")[0]!)).toBeNull();
    expect(openContinue("")).toBeNull();
    expect(openContinue(undefined)).toBeNull();
  });

  it("runs out, so a shared laptop forgets the question", () => {
    const sealed = sealContinue(PASS, 0)!;

    expect(openContinue(sealed, 60_000)).not.toBeNull();
    expect(openContinue(sealed, 60 * 60_000)).toBeNull();
  });

  it("sends nobody off this site afterwards", () => {
    const sealed = sealContinue({ ...PASS, next: "https://evil.example/" })!;
    expect(openContinue(sealed)?.next).toBe("/");
  });

  it("seals and opens nothing at all without a key", () => {
    // Every road into the question is service-role only, so this cannot come
    // up in practice. It must still fail closed rather than sign a pass
    // anybody could forge.
    delete process.env[KEY];
    expect(sealContinue(PASS)).toBeNull();
    expect(openContinue("anything.at-all")).toBeNull();
  });

  it("is not readable from script and does not follow a link off site", () => {
    const opts = continueCookieOptions(true);
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.secure).toBe(true);
  });
});
