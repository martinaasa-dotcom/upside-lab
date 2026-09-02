/**
 * A circle invite link exists exactly once, in the response that made it,
 * because only its hash is stored. An admin who needs to share one again
 * makes a new link, and `renewedExpiry` decides how long that one lives.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_INVITE_DAYS,
  inviteAdminStatus,
  renewedExpiry,
} from "@/lib/community-invite-admin";

const NOW = Date.parse("2026-09-01T12:00:00.000Z");
const DAY = 86400000;

describe("renewedExpiry", () => {
  it("keeps a date that has not passed", () => {
    // Replacing a link must not quietly shorten or lengthen what the admin
    // chose when they made the first one.
    const later = new Date(NOW + 5 * DAY).toISOString();

    expect(renewedExpiry(later, NOW)).toBe(later);
  });

  it("keeps a link that never expires never expiring", () => {
    expect(renewedExpiry(null, NOW)).toBeNull();
  });

  it("gives a fresh lifetime when the old link had already run out", () => {
    // A new link born expired is not a link.
    const past = new Date(NOW - DAY).toISOString();

    const renewed = renewedExpiry(past, NOW);

    expect(renewed).toBe(
      new Date(NOW + DEFAULT_INVITE_DAYS * DAY).toISOString()
    );
  });

  it("gives a fresh lifetime when the stored date is not a date", () => {
    expect(renewedExpiry("not a date", NOW)).toBe(
      new Date(NOW + DEFAULT_INVITE_DAYS * DAY).toISOString()
    );
  });
});

describe("inviteAdminStatus", () => {
  it("reads retired, expired and live apart", () => {
    expect(
      inviteAdminStatus(
        { revoked_at: "2026-08-01T00:00:00.000Z", expires_at: null },
        NOW
      )
    ).toBe("retired");
    expect(
      inviteAdminStatus(
        { revoked_at: null, expires_at: new Date(NOW - DAY).toISOString() },
        NOW
      )
    ).toBe("expired");
    expect(inviteAdminStatus({ revoked_at: null, expires_at: null }, NOW)).toBe(
      "live"
    );
  });
});
