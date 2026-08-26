import { describe, expect, it, vi } from "vitest";
import { phoneMenuRows, type PhoneMenuRow } from "@/lib/phone-menu";

const noop = () => {};

function chrome(over: Partial<Parameters<typeof phoneMenuRows>[1]> = {}) {
  return {
    signedIn: true,
    offerUpgrade: true,
    onUpgrade: noop,
    onFeedback: noop,
    ...over,
  };
}

describe("the phone bar's one overflow menu", () => {
  it("offers a signed-out reader nothing of its own", () => {
    const rows = phoneMenuRows(
      [{ id: "forecast", label: "Hide forecast", onSelect: noop }],
      chrome({ signedIn: false }),
    );
    expect(rows.map((r) => r.id)).toEqual(["forecast"]);
  });

  it("keeps the page's rows first, in the page's order", () => {
    const rows = phoneMenuRows(
      [
        { id: "invite", label: "Invite a partner", onSelect: noop },
        { id: "cc", label: "Show covered calls", onSelect: noop },
      ],
      chrome(),
    );
    expect(rows.map((r) => r.id)).toEqual([
      "invite",
      "cc",
      "upgrade",
      "feedback",
    ]);
  });

  it("rules off its own rows from the page's, and never opens on a rule", () => {
    const page: PhoneMenuRow[] = [
      { id: "cc", label: "Show covered calls", onSelect: noop },
    ];
    const withPage = phoneMenuRows(page, chrome());
    expect(withPage.find((r) => r.id === "upgrade")?.separated).toBe(true);
    expect(withPage.find((r) => r.id === "feedback")?.separated).toBeFalsy();

    const alone = phoneMenuRows<PhoneMenuRow>([], chrome());
    expect(alone[0]?.id).toBe("upgrade");
    expect(alone[0]?.separated).toBe(false);
  });

  it("drops Upgrade for a subscriber, and Feedback takes the rule", () => {
    const rows = phoneMenuRows<PhoneMenuRow>(
      [{ id: "cc", label: "Show covered calls", onSelect: noop }],
      chrome({ offerUpgrade: false }),
    );
    expect(rows.map((r) => r.id)).toEqual(["cc", "feedback"]);
    expect(rows[1]?.separated).toBe(true);
  });

  it("carries the page row through untouched, extras and all", () => {
    const onSelect = vi.fn();
    const rows = phoneMenuRows(
      [
        {
          id: "undo",
          label: "Undo Margus write",
          danger: true,
          disabled: true,
          onSelect,
        },
      ],
      chrome(),
    );
    const undo = rows[0] as {
      danger?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    };
    expect(undo.danger).toBe(true);
    expect(undo.disabled).toBe(true);
    undo.onSelect();
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("wires its own rows to the callers it was given", () => {
    const onUpgrade = vi.fn();
    const onFeedback = vi.fn();
    const rows = phoneMenuRows<PhoneMenuRow>(
      [],
      chrome({ onUpgrade, onFeedback }),
    );
    rows.find((r) => r.id === "upgrade")?.onSelect();
    rows.find((r) => r.id === "feedback")?.onSelect();
    expect(onUpgrade).toHaveBeenCalledOnce();
    expect(onFeedback).toHaveBeenCalledOnce();
  });
});
