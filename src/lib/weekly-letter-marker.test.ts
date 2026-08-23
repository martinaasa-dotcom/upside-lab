import { describe, expect, it } from "vitest";
import { profileIdsByMailbox } from "@/lib/note-cron";
import {
  AASA_ALIAS_EMAIL,
  AASA_PRIMARY_EMAIL,
  connectedEmailsFor,
} from "@/lib/auth/identity";

/**
 * The sent-marker is the only thing standing between one Sunday letter and
 * three of them, because the 04:20 and 04:40 slots re-send anybody whose
 * marker is null. These tests pin the key it is written with.
 */
describe("profileIdsByMailbox", () => {
  it("finds a profile whose stored email is not lower-cased", () => {
    // Google hands back whatever the account was created with. The old
    // marker write matched `.in("email", [...])` against this column, and a
    // capital letter was enough to update zero rows and mail twice more.
    const stored = "Martin.Aasa@upthink.ee";
    const byMailbox = profileIdsByMailbox([{ id: "u1", email: stored }]);

    expect(byMailbox.get(AASA_PRIMARY_EMAIL)).toEqual(["u1"]);
    // The address list the old code compared against never contained the
    // stored spelling -- that is the whole bug, in one assertion.
    expect(connectedEmailsFor(stored)).not.toContain(stored);
  });

  it("stamps every login that shares one mailbox, not just the first", () => {
    // Martin's two Google accounts are one reader. Leaving either row
    // unstamped leaves a row that mails him again at 04:20.
    const byMailbox = profileIdsByMailbox([
      { id: "primary", email: AASA_PRIMARY_EMAIL },
      { id: "alias", email: AASA_ALIAS_EMAIL },
    ]);

    expect(byMailbox.get(AASA_PRIMARY_EMAIL)).toEqual(["primary", "alias"]);
    expect(byMailbox.has(AASA_ALIAS_EMAIL)).toBe(false);
  });

  it("shrugs off padding and casing rather than opening a second mailbox", () => {
    const byMailbox = profileIdsByMailbox([
      { id: "u1", email: "  READER@Example.com " },
      { id: "u2", email: "reader@example.com" },
    ]);

    expect([...byMailbox.keys()]).toEqual(["reader@example.com"]);
    expect(byMailbox.get("reader@example.com")).toEqual(["u1", "u2"]);
  });

  it("skips rows with nothing to mail", () => {
    const byMailbox = profileIdsByMailbox([
      { id: "u1", email: null },
      { id: "u2", email: "" },
      { id: "u3", email: "real@example.com" },
    ]);

    expect([...byMailbox.keys()]).toEqual(["real@example.com"]);
  });
});
