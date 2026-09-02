import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadDismissedAlertIds,
  loadToastedAlertIds,
  saveDismissedAlertIds,
  saveToastedAlertIds,
} from "@/lib/alert-dismiss";

/*
  This suite runs in node and there is no jsdom in the repo, so the store is
  a hand-rolled stand-in for the two calls the module actually makes.
*/
const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  (globalThis as { window?: unknown }).window = {};
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe("two lists that used to be one", () => {
  it("keeps a toast record out of what the room hides", () => {
    saveToastedAlertIds(new Set(["earn-$AAPL-2026-09-04"]));
    expect(loadToastedAlertIds().has("earn-$AAPL-2026-09-04")).toBe(true);
    expect(loadDismissedAlertIds().size).toBe(0);
  });

  it("keeps a dismissal out of what stops a toast repeating", () => {
    saveDismissedAlertIds(new Set(["decision-margin-heavy"]));
    expect(loadDismissedAlertIds().has("decision-margin-heavy")).toBe(true);
    expect(loadToastedAlertIds().size).toBe(0);
  });

  it("reads the old key as the toast list, which is what it held", () => {
    /*
      Every id in v1 was written by the effect that pops a toast, so it means
      "already shown", never "the reader waved this off". Reading it as a
      dismissal would leave the readers this fixes with the same empty room
      they have now, which is the one outcome worth writing a test about.
    */
    store.set(
      "upside-alerts-dismissed-v1",
      JSON.stringify(["earn-$NVDA-2026-09-04"])
    );
    expect(loadToastedAlertIds().has("earn-$NVDA-2026-09-04")).toBe(true);
    expect(loadDismissedAlertIds().size).toBe(0);
  });

  it("survives a key holding something that is not a list of strings", () => {
    store.set("upside-alerts-dismissed-v2", "{}");
    expect(loadDismissedAlertIds().size).toBe(0);
    store.set("upside-alerts-dismissed-v2", "not json");
    expect(loadDismissedAlertIds().size).toBe(0);
    store.set("upside-alerts-dismissed-v2", JSON.stringify(["a", 4, null]));
    expect([...loadDismissedAlertIds()]).toEqual(["a"]);
  });

  it("keeps both lists bounded", () => {
    const many = new Set(Array.from({ length: 260 }, (_, i) => `a${i}`));
    saveDismissedAlertIds(many);
    expect(loadDismissedAlertIds().size).toBe(200);
    // The cap keeps the most recent, since an old alert is the one least
    // likely to still be in the list the room is drawing from.
    expect(loadDismissedAlertIds().has("a259")).toBe(true);
    expect(loadDismissedAlertIds().has("a0")).toBe(false);
  });

  it("answers on a server, where there is no store at all", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(loadDismissedAlertIds().size).toBe(0);
    expect(loadToastedAlertIds().size).toBe(0);
    expect(() => saveDismissedAlertIds(new Set(["a"]))).not.toThrow();
  });
});

describe("the room draws the list a reader has not waved off", () => {
  /*
    The bug this replaces was one word: the room filtered on the set the
    toast effect writes, so an alert left the room in the same tick it
    arrived and never came back. A unit test cannot reach a room inside
    Dashboard, so the check is on the source, in the way this repo already
    checks that a cash write is a delta.
  */
  const source = readFileSync(
    join(process.cwd(), "src/components/Dashboard.tsx"),
    "utf8"
  );

  it("filters the alerts on dismissals and never on toasts", () => {
    const filter = source.match(/bookAlerts\.filter\(\([^)]*\) =>[^\n]*/)?.[0];
    expect(filter).toBeTruthy();
    expect(filter).toContain("dismissedAlertIds");
    expect(filter).not.toContain("alertToastsSent");
  });

  it("writes the dismissal list from a reader action, not from the toast", () => {
    const toastEffect = source.slice(
      source.indexOf("const fresh = bookAlerts.filter"),
      source.indexOf("for (const a of fresh) toast(")
    );
    expect(toastEffect).toContain("saveToastedAlertIds");
    expect(toastEffect).not.toContain("saveDismissedAlertIds");
    expect(source).toContain("const onDismissAlert");
  });

  it("sends a card about a company to that company", () => {
    // Not "const onOpenAlert", which also matches `onOpenAlerts`, the
    // callback that opens the room rather than one card in it.
    const at = source.indexOf("const onOpenAlert = ");
    expect(at).toBeGreaterThan(0);
    const opener = source.slice(at, at + 300);
    expect(opener).toContain("alert.ticker");
    expect(opener).toContain("onOpenPulse");
  });
});
