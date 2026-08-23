import { describe, expect, it } from "vitest";
import { idsFrom } from "@/lib/auth/sign-out-everyone";

/**
 * The dangerous case for a mass revocation is not an error, it is a quiet
 * zero: if the payload shape is not what the parser expects, the walk stops
 * on the first page and the run reports success having revoked nothing.
 * Somebody then tells their users everyone was signed out, and nobody was.
 */
describe("idsFrom", () => {
  it("reads ids out of a real admin-list page", () => {
    expect(
      idsFrom({
        users: [
          { id: "a1", email: "one@example.com" },
          { id: "b2", email: "two@example.com" },
        ],
      })
    ).toEqual(["a1", "b2"]);
  });

  it("returns nothing for every shape that is not a user list", () => {
    for (const payload of [
      null,
      undefined,
      {},
      { users: null },
      { users: {} },
      { users: "a1" },
      [],
      "users",
      42,
    ]) {
      expect(idsFrom(payload)).toEqual([]);
    }
  });

  it("skips entries with no usable id rather than passing junk on", () => {
    expect(
      idsFrom({
        users: [
          { id: "a1" },
          { id: "" },
          { id: null },
          { id: 7 },
          { email: "no-id@example.com" },
          { id: "b2" },
        ],
      })
    ).toEqual(["a1", "b2"]);
  });
});
