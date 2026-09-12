import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const gate = readFileSync(
  join(process.cwd(), "src/components/SignInGate.tsx"),
  "utf8"
);
const fundRoute = readFileSync(
  join(process.cwd(), "src/app/api/upside-portfolio/route.ts"),
  "utf8"
);

/*
  THE GATE GIVES THE REASON THAT APPLIES TO THE ROOM.

  One sentence used to cover all three gated rooms: "a circle is other
  people, and the Fund and your account settings are about you, so there is
  nothing to show somebody who has not signed in yet."

  Two thirds right. A circle is other people and Account is about you. The
  Fund is neither: `loadFundPayload` is built once for everybody and
  nothing in it is keyed to the person asking, so every signed-in viewer
  matches the same rows. "There is nothing to show" was therefore false for
  it as well -- there is a whole curated fund behind that gate, and a
  visitor told otherwise has been handed a reason not to sign in rather
  than a reason to.
*/
describe("the sign-in gate says why this room needs an account", () => {
  it("does not tell a visitor the Fund is about them", () => {
    expect(
      gate,
      "the Fund is one portfolio shared by every viewer, not the reader's own"
    ).not.toMatch(/the Fund and your account\s+settings are about you/);
  });

  it("says what the Fund is instead of saying there is nothing there", () => {
    const reason = gate.slice(
      gate.indexOf("function gateReason"),
      gate.indexOf("export function SignInGate")
    );
    expect(reason.length).toBeGreaterThan(0);
    const fundArm = reason.slice(
      reason.indexOf('"/upside-portfolio"'),
      reason.indexOf('"/communities"')
    );
    expect(fundArm).toMatch(/Upside Fund/);
    expect(
      fundArm,
      "the Fund's gate should invite, not dismiss: there is a whole fund behind it"
    ).not.toMatch(/nothing to show/);
  });

  it("keeps the claim true: the Fund really is the same for everybody", () => {
    /*
     * The copy says "the same for everybody who opens it". That is a claim
     * about the route, so it is checked against the route: the payload is
     * built once and nothing in it is keyed to the caller. If the Fund ever
     * becomes per-reader, this fails and the sentence has to change with it.
     */
    expect(fundRoute).toMatch(/async function loadFundPayload\(/);
    expect(
      fundRoute,
      "loadFundPayload now takes the caller, so the Fund may no longer be the same for everybody"
    ).toMatch(/async function loadFundPayload\(\s*supabase: AppSupabaseClient,?\s*\)/);
  });

  it("still gives a circle and an account their own true reason", () => {
    const reason = gate.slice(
      gate.indexOf("function gateReason"),
      gate.indexOf("export function SignInGate")
    );
    expect(reason).toMatch(/A circle is other people/);
    expect(reason).toMatch(/Your account settings are about you/);
  });
});
