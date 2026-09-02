import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/*
  There is no adding somebody to a portfolio. There is only inviting them.

  POST /api/portfolios/[id]/owners used to look an address up and, when it
  found an account, write the ownership row on the spot. Two things followed
  and neither was intended.

  It told any signed-in caller whether an address has an Upside Lab account.
  A 404 saying "No Upside Lab profile for that email yet" meant no and a 200
  meant yes, so one portfolio of your own plus a list of addresses enumerates
  the product's users. The path is not a tight one, so nothing meaningful
  rate-limited it.

  And the person named became a co-owner of a stranger's portfolio without
  being asked: somebody else's holdings appear in their account, and the
  caller can remove them again before they notice, because the caller is the
  creator and the removal guard only protects creators.

  Removing the branch is what fixes it. Papering over the difference would
  leave the consent half untouched.
*/

const ROOT = path.resolve(__dirname, "../..");

/**
 * Source with its comments removed.
 *
 * Every one of these checks is about what the code does, and the comments
 * beside it necessarily quote the thing being forbidden in order to explain
 * why it is forbidden. Reading the raw file would make the explanation fail
 * the test, which teaches the next person to delete the explanation.
 */
function code(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}
const OWNERS = code("src/app/api/portfolios/[id]/owners/route.ts");
const OWNERSHIP = code("src/lib/auth/ownership.ts");
const MODAL = code("src/components/InvitePartnerModal.tsx");

describe("a co-owner joins by accepting, never by being added", () => {
  it("has no direct add left to call", () => {
    expect(
      OWNERSHIP.includes("export async function addCoOwnerToPortfolio"),
      `addCoOwnerToPortfolio is back. It writes an ownership row for an ` +
        `address that never agreed to anything, and its two answers say ` +
        `whether that address has an account.`
    ).toBe(false);
  });

  it("does not say whether an address has an account", () => {
    expect(
      OWNERS.includes("No Upside Lab profile for that email"),
      `The route distinguishes an address with an account from one without, ` +
        `which is an enumeration oracle for anybody with one portfolio.`
    ).toBe(false);
    expect(OWNERS).not.toContain("addCoOwnerToPortfolio");
  });

  it("points the caller at the invite instead", () => {
    expect(OWNERS).toContain("Send them an invite instead");
  });

  it("leaves the modal with one road in", () => {
    /*
      The modal used to try the add and fall back to an invite on a 404,
      which is what turned the status difference into a usable oracle from
      the product's own UI.
    */
    expect(
      MODAL.includes('add.status !== 404'),
      `The modal still branches on the 404 that used to mean "no account".`
    ).toBe(false);
    expect(MODAL).toContain("/invites");
  });
});
