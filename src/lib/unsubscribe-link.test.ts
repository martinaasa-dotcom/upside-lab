import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

/*
  Stopping the Sunday letter from inside the Sunday letter.

  The link used to go to /account, which is behind a sign-in, so the reader it
  is written for, somebody who has stopped using Upside Lab and wants the mail
  to stop, was asked to sign back into the account they had left. What they
  press instead is the button that says spam, and one of those is charged
  against the domain every other message goes out from.
*/

vi.stubEnv("UNSUBSCRIBE_SECRET", "a secret for the test");

const { unsubscribeUrlFor, profileFromUnsubscribe } = await import(
  "@/lib/unsubscribe-link"
);

const MARTIN = "aaaaaaaa-0000-0000-0000-000000000001";
const AMANDA = "bbbbbbbb-0000-0000-0000-000000000002";

beforeEach(() => {
  vi.stubEnv("UNSUBSCRIBE_SECRET", "a secret for the test");
});

function paramsOf(url: string) {
  return new URL(url).searchParams;
}

describe("the link at the foot of the letter", () => {
  it("carries who it is for and proof of it", () => {
    const url = unsubscribeUrlFor(MARTIN);
    expect(url).toContain("/api/unsubscribe");
    expect(paramsOf(url as string).get("p")).toBe(MARTIN);
    expect(paramsOf(url as string).get("s")).toBeTruthy();
  });

  it("is the same link every week, so an old letter still works", () => {
    // No expiry, deliberately. A two year old letter is exactly the one
    // somebody is most likely to unsubscribe from.
    expect(unsubscribeUrlFor(MARTIN)).toBe(unsubscribeUrlFor(MARTIN));
  });

  it("comes back to the reader it was made for", () => {
    const params = paramsOf(unsubscribeUrlFor(MARTIN) as string);
    expect(profileFromUnsubscribe(params.get("p"), params.get("s"))).toBe(MARTIN);
  });

  it("will not stop somebody else's letter", () => {
    const params = paramsOf(unsubscribeUrlFor(MARTIN) as string);
    expect(profileFromUnsubscribe(AMANDA, params.get("s"))).toBeNull();
  });

  it("refuses a signature that has been edited, or is missing", () => {
    const signature = paramsOf(unsubscribeUrlFor(MARTIN) as string).get("s") as string;
    const edited = `${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;

    expect(profileFromUnsubscribe(MARTIN, edited)).toBeNull();
    expect(profileFromUnsubscribe(MARTIN, null)).toBeNull();
    expect(profileFromUnsubscribe(null, signature)).toBeNull();
  });

  it("signs nothing when there is no key to sign with", () => {
    // An unset variable must never be what opens something: a link anybody
    // could forge would let a stranger stop a stranger's letter.
    vi.stubEnv("UNSUBSCRIBE_SECRET", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(unsubscribeUrlFor(MARTIN)).toBeNull();
    expect(profileFromUnsubscribe(MARTIN, "anything")).toBeNull();
  });
});

describe("what the mail and the endpoint do with it", () => {
  const route = readFileSync("src/app/api/unsubscribe/route.ts", "utf8");
  const send = readFileSync("src/lib/send-note.ts", "utf8");

  it("tells a mail client it may do it without asking", () => {
    expect(send).toContain('"List-Unsubscribe-Post": "List-Unsubscribe=One-Click"');
  });

  it("makes that claim only beside a link we signed", () => {
    // The fallback is the account page, which is a sign-in. A one-click
    // header on it is a button that appears to work and does not.
    expect(send).toContain("...(input.unsubscribeUrl");
  });

  it("changes nothing on a GET", () => {
    /*
      Scanners, previewers and corporate gateways fetch every URL in a
      message before anybody reads it. An unsubscribe that fires on a fetch
      unsubscribes people who never asked.
    */
    const get = route.slice(
      route.indexOf("async function handleGET"),
      route.indexOf("async function handlePOST")
    );

    expect(get).not.toContain("update(");
    expect(get).toContain("actionFor(");
  });

  it("turns off the letter and nothing else", () => {
    const post = route.slice(route.indexOf("async function handlePOST"));
    expect(post).toContain("note_sunday: false");
    // Not the account, not the portfolios, not anything else on the row.
    expect(post).not.toContain("delete(");
  });

  it("turns it off for every profile with that mailbox", () => {
    // One person can have more than one row. Turning off the row the link
    // named would leave the letter arriving from the other one, which reads
    // as an unsubscribe that did not work.
    expect(route).toContain('ilike("email"');
  });

  it("matches the address as a value, never as a pattern", () => {
    // ILIKE reads `%` and `_` as wildcards, so an address carrying either
    // would switch the letter off for strangers. The pattern the route
    // sends has to have been through the escaper.
    const post = route.slice(route.indexOf("async function handlePOST"));
    expect(post).toContain("escapeLike(");
    expect(post).toContain('ilike("email", pattern)');
  });

  it("builds the form's target rather than echoing the address bar", () => {
    expect(route).toContain("new URLSearchParams({ p: id, s: signature })");
  });
});
