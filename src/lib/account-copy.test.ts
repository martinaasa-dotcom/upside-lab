import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SUPPORTER_ASIDE,
  SUPPORTER_MONTHLY,
  SUPPORTER_OFFER,
  SUNDAY_LETTER_UTC_DAY,
  SUNDAY_LETTER_UTC_HOUR,
  describeAccountDeletion,
  holdingCountLabel,
  joinWords,
  nextSundayLetter,
  supporterButtonLabel,
  supporterIsActive,
  supporterThanks,
  tierChangeLine,
  tierOpensCoveredCalls,
  tierShowsLab,
  tierShowsRisk,
} from "@/lib/account-copy";
import { ACTIVE_STATUSES } from "@/lib/billing-status";
import { SIGNIN_PRICE_NOTE } from "@/lib/product";
import { EXPERIENCE_TIERS } from "@/lib/experience-tier";

describe("the supporter panel", () => {
  /*
    The sign-in page and this panel are two accounts of the same twelve
    euros, and product.ts says in as many words that they must stay in step.
    They had not: one said "supporter subscription", the other said "Upgrade
    to Pro". Pinning the figure is the half that matters, because a price
    quoted twice and differently is the one drift a reader can catch us on.
  */
  it("quotes the same price the sign-in page quotes", () => {
    expect(SIGNIN_PRICE_NOTE).toContain(SUPPORTER_MONTHLY);
    expect(SUPPORTER_OFFER).toContain(SUPPORTER_MONTHLY);
  });

  it("never calls it an upgrade, and never calls it Pro", () => {
    const words = [
      SUPPORTER_OFFER,
      SUPPORTER_ASIDE,
      supporterButtonLabel(true),
      supporterButtonLabel(false),
      supporterThanks({ since: "March 2026", nextCharge: "6 October" }),
    ].join(" ");
    expect(words).not.toMatch(/\bupgrade\b/i);
    expect(words).not.toMatch(/\bPro\b/);
  });

  /*
    The panel is not allowed to imply a feature. This is the claim the
    paragraph beside the old button was already making while the button
    contradicted it, so it is worth a test rather than a comment.
  */
  it("says outright that it adds nothing", () => {
    expect(SUPPORTER_OFFER.toLowerCase()).toContain("no features");
  });

  it("thanks a supporter with the facts the billing route returns", () => {
    const line = supporterThanks({
      since: "March 2026",
      nextCharge: "6 October",
    });
    expect(line).toContain("Thank you.");
    expect(line).toContain("March 2026");
    expect(line).toContain("6 October");
    expect(line).toContain(SUPPORTER_MONTHLY);
  });

  it("thanks a supporter even when neither date came back", () => {
    const line = supporterThanks({ since: null, nextCharge: null });
    expect(line).toContain("Thank you.");
    expect(line).toContain(SUPPORTER_MONTHLY);
  });

  /*
    The webhook mirror lags checkout, so a reader returning from Stripe sees
    a null status for a few seconds. Believing it put "Become a supporter"
    under a toast thanking them for becoming one.
  */
  it("treats a return from checkout as paid while the mirror catches up", () => {
    const args = { activeStatuses: ACTIVE_STATUSES };
    expect(supporterIsActive({ status: null, justPaid: true, ...args })).toBe(true);
    expect(supporterIsActive({ status: null, justPaid: false, ...args })).toBe(false);
    expect(supporterIsActive({ status: "active", justPaid: false, ...args })).toBe(true);
    expect(supporterIsActive({ status: "past_due", justPaid: false, ...args })).toBe(true);
    expect(supporterIsActive({ status: "canceled", justPaid: false, ...args })).toBe(false);
  });

  /*
    A cancellation that Stripe has already mirrored beats the query
    parameter, or somebody who cancelled and then opened an old bookmarked
    `?upgraded=1` link would be told they were still paying.
  */
  it("lets a mirrored cancellation win over a stale query parameter", () => {
    expect(
      supporterIsActive({
        status: "canceled",
        justPaid: true,
        activeStatuses: ACTIVE_STATUSES,
      })
    ).toBe(false);
  });
});

describe("what an experience level changes", () => {
  it("is derived from the gates, so it cannot describe the old arrangement", () => {
    /*
      Written when Lab was hidden from a novice and Risk from an investor,
      and asserting exactly that. Both gates are empty now, on the argument
      in experience-tier.ts that Lab is where a beginner finds out three
      holdings are most of their money, so the teaching room was being
      withheld from the reader the product is for.

      The point of the test survives the change and is the reason it is
      worth keeping: this sentence is read out of the gate rather than
      typed beside it, so it followed the gate when the gate moved.
    */
    for (const tier of ["novice", "investor", "advanced"] as const) {
      expect(tierShowsLab(tier), tier).toBe(true);
      expect(tierShowsRisk(tier), tier).toBe(true);
    }
  });

  it("gives every tier a line that names a room", () => {
    for (const tier of EXPERIENCE_TIERS) {
      const line = tierChangeLine(tier.id);
      expect(line.length).toBeGreaterThan(20);
      expect(line).toMatch(/Lab|room/);
    }
  });

  it("says something a beginner's answer actually changes", () => {
    /*
      With no room hidden from anybody, a line about which rooms you get is
      the same line three times, and a question whose answers read
      identically is worse than no question. What the answer still decides
      is whether the covered-call panel starts open, so that is what the
      beginner's line says.
    */
    const novice = tierChangeLine("novice");
    const investor = tierChangeLine("investor");
    expect(novice).not.toBe(investor);
    expect(novice).toContain("folded away");
    expect(investor).toContain("covered calls open");
    expect(tierOpensCoveredCalls("novice")).toBe(false);
    expect(tierOpensCoveredCalls("investor")).toBe(true);
  });
});

describe("the next Sunday letter", () => {
  /*
    The panel tells a reader when their next email lands. If the cron moves
    and this constant does not, the page states a wrong time as a fact,
    which is exactly the failure the whole repo keeps guarding against.
  */
  it("matches the schedule vercel.json gives the cron", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons: { path: string; schedule: string }[];
    };
    const sunday = config.crons.find(
      (c) => c.path === "/api/cron/sunday-note"
    );
    expect(sunday, "no unqualified sunday-note cron in vercel.json").toBeTruthy();
    const [minute, hour, , , weekday] = sunday!.schedule.split(" ");
    expect(minute).toBe("0");
    expect(Number(hour)).toBe(SUNDAY_LETTER_UTC_HOUR);
    expect(Number(weekday)).toBe(SUNDAY_LETTER_UTC_DAY);
  });

  it("finds the coming Sunday from a weekday", () => {
    // Wednesday 2 September 2026, 09:00 UTC.
    const next = nextSundayLetter(new Date("2026-09-02T09:00:00Z"));
    expect(next.toISOString()).toBe("2026-09-06T04:00:00.000Z");
  });

  it("finds next Sunday once this Sunday's letter has gone", () => {
    const next = nextSundayLetter(new Date("2026-09-06T05:00:00Z"));
    expect(next.toISOString()).toBe("2026-09-13T04:00:00.000Z");
  });

  it("still says today when the reader looks before the letter is written", () => {
    const next = nextSundayLetter(new Date("2026-09-06T01:00:00Z"));
    expect(next.toISOString()).toBe("2026-09-06T04:00:00.000Z");
  });
});

describe("what deleting an account would remove", () => {
  it("splits sole-owned portfolios from shared ones, the way the route does", () => {
    const out = describeAccountDeletion({
      portfolios: [
        { id: "a", name: "My portfolio", holdings: 6, owners: 1 },
        { id: "b", name: "Kids' fund", holdings: 2, owners: 1 },
        { id: "c", name: "Ours", holdings: 9, owners: 2 },
      ],
      circles: ["Upside Circle"],
      supporterActive: true,
    });
    expect(out.deletes).toEqual([
      { name: "My portfolio", holdings: 6 },
      { name: "Kids' fund", holdings: 2 },
    ]);
    expect(out.handsOver).toEqual(["Ours"]);
    expect(out.leaves).toEqual(["Upside Circle"]);
    expect(out.cancelsSupporter).toBe(true);
  });

  it("names an untitled portfolio rather than leaving a blank in the list", () => {
    const out = describeAccountDeletion({
      portfolios: [{ id: "a", name: "  ", holdings: 0, owners: 1 }],
      circles: [],
      supporterActive: false,
    });
    expect(out.deletes).toEqual([{ name: "Untitled portfolio", holdings: 0 }]);
  });

  it("says nothing about a subscription when there is none", () => {
    const out = describeAccountDeletion({
      portfolios: [],
      circles: [],
      supporterActive: false,
    });
    expect(out.cancelsSupporter).toBe(false);
    expect(out.deletes).toEqual([]);
    expect(out.handsOver).toEqual([]);
  });

  it("counts holdings in words a person uses", () => {
    expect(holdingCountLabel(0)).toBe("nothing in it yet");
    expect(holdingCountLabel(1)).toBe("1 holding");
    expect(holdingCountLabel(6)).toBe("6 holdings");
  });

  it("joins a list the way somebody would say it", () => {
    expect(joinWords([])).toBe("");
    expect(joinWords(["Upside Circle"])).toBe("Upside Circle");
    expect(joinWords(["A", "B"])).toBe("A and B");
    expect(joinWords(["A", "B", "C"])).toBe("A, B and C");
  });
});
