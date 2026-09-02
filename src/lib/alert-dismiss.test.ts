import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LAPSE_MS,
  loadAlertSeen,
  loadDismissedAlertIds,
  loadToastedAlertIds,
  reviseAlertMemory,
  saveAlertSeen,
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
    /*
      The end anchor moved deliberately: the effect no longer toasts every
      fresh alert, since three of the four kinds are calm facts and a toast
      is a medium that vanishes. It is a loop with a tone check in it now,
      so the marker is the loop's own brace.
    */
    const start = source.indexOf("const fresh = bookAlerts.filter");
    const end = source.indexOf("for (const a of fresh) {");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const toastEffect = source.slice(start, end);
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

describe("a dismissal keys on the condition, not on the calendar", () => {
  /*
    The choice recorded here, because there were two on offer: bucket the
    id by month, or forget the dismissal once the condition itself has been
    gone for a while. This is the second. A loan that stays large is one
    piece of news however many months pass, and a price level crossed twice
    is genuinely two, so absence is the thing worth measuring. The lapse
    exists so a price hovering either side of a level over one afternoon
    does not resurrect a card the reader has already waved off.
  */
  const now = 1_800_000_000_000;

  it("records when a condition was first true, and does not restamp it", () => {
    const first = reviseAlertMemory({
      seen: {},
      dismissed: new Set(),
      toasted: new Set(),
      liveIds: ["decision-margin-heavy"],
      now,
    });
    expect(first.seen["decision-margin-heavy"]!.first).toBe(now);
    expect(first.changed).toBe(true);

    const later = reviseAlertMemory({
      seen: first.seen,
      dismissed: new Set(),
      toasted: new Set(),
      liveIds: ["decision-margin-heavy"],
      now: now + 5 * 86_400_000,
    });
    expect(later.seen["decision-margin-heavy"]!.first).toBe(now);
    expect(later.seen["decision-margin-heavy"]!.last).toBe(
      now + 5 * 86_400_000
    );
  });

  it("keeps a dismissal for as long as the condition is still true", () => {
    const out = reviseAlertMemory({
      seen: { "strike-target-$AAPL": { first: now, last: now } },
      dismissed: new Set(["strike-target-$AAPL"]),
      toasted: new Set(["strike-target-$AAPL"]),
      liveIds: ["strike-target-$AAPL"],
      now: now + 400 * 86_400_000,
    });
    expect(out.dismissed.has("strike-target-$AAPL")).toBe(true);
  });

  it("forgets it once the condition has been gone longer than the lapse", () => {
    const out = reviseAlertMemory({
      seen: { "strike-target-$AAPL": { first: now, last: now } },
      dismissed: new Set(["strike-target-$AAPL"]),
      toasted: new Set(["strike-target-$AAPL"]),
      liveIds: [],
      now: now + LAPSE_MS + 1000,
    });
    expect(out.dismissed.size).toBe(0);
    expect(out.toasted.size).toBe(0);
    expect(out.seen["strike-target-$AAPL"]).toBeUndefined();
    expect(out.changed).toBe(true);
  });

  it("holds on through a condition flickering for an afternoon", () => {
    const out = reviseAlertMemory({
      seen: { "strike-target-$AAPL": { first: now, last: now } },
      dismissed: new Set(["strike-target-$AAPL"]),
      toasted: new Set(),
      liveIds: [],
      now: now + 6 * 3600_000,
    });
    expect(out.dismissed.has("strike-target-$AAPL")).toBe(true);
    expect(out.changed).toBe(false);
  });

  it("says nothing changed when nothing did, so nothing is written", () => {
    const out = reviseAlertMemory({
      seen: { a: { first: now, last: now } },
      dismissed: new Set(),
      toasted: new Set(),
      liveIds: ["a"],
      now: now + 60_000,
    });
    expect(out.changed).toBe(false);
  });

  it("round-trips through the store and survives junk in it", () => {
    saveAlertSeen({ a: { first: 1, last: 2 } });
    expect(loadAlertSeen()).toEqual({ a: { first: 1, last: 2 } });
    store.set("upside-alerts-seen-v1", "not json");
    expect(loadAlertSeen()).toEqual({});
    store.set("upside-alerts-seen-v1", JSON.stringify({ a: { first: "x" } }));
    expect(loadAlertSeen()).toEqual({});
  });
});

describe("the page has a door on both breakpoints", () => {
  /*
    A claim about behaviour is pinned to the code rather than asserted as
    copy. This page used to be reachable only by typing the address: the
    phone's bell was never wired up, neither dock has a cell for it, and
    the one card on Home that could route there is below `md` and only
    routes when the featured alert is not about cash. What it has instead
    is a row in the one overflow menu the chrome already carries, which is
    both the phone's More menu and the laptop's View menu, so no dock cell
    was spent and no portfolio name lost 44px of the phone's top bar.
  */
  const source = readFileSync(
    join(process.cwd(), "src/components/Dashboard.tsx"),
    "utf8"
  );

  it("puts a row in the menu that both breakpoints draw", () => {
    const menu = source.slice(
      source.indexOf("const viewMenuItems"),
      source.indexOf("// Account-scoped actions")
    );
    expect(menu).toContain('id: "alerts"');
    expect(menu).toContain("Worth a look");
    expect(menu).toContain("onOpenAlerts()");
    // The phone's overflow menu and the laptop's View menu, one list.
    expect(source).toContain("mobileMenuItems={viewMenuItems}");
    expect(source).toContain("items={viewMenuItems}");
  });

  it("spends no dock cell on it, since the news dot already points there", () => {
    expect(source).toContain("alertCount={activeAlerts.length}");
  });
});
