/**
 * `/margus` is Home with Margus open, and the address says so only while
 * the panel is.
 *
 * There is no Margus room. The chat floats over whichever page is showing,
 * so the address names the page underneath and adds that the panel should
 * be open on arrival; until it meant that, a reader following the link
 * landed on Home with the panel shut. The pure half (`isMargusPath`,
 * `tabIdFromPath`, `workspaceRoomId`) is tested beside those functions.
 * This is the wiring, read off the source like `dock-stability.test.ts`,
 * because each piece of it lives in a different file and the failure of
 * any one of them is silent: the panel simply does not open, or the
 * address simply stays wrong.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CHAT = readFileSync("src/components/CcAdvisorChat.tsx", "utf8");
const MODALS = readFileSync("src/components/DashboardModals.tsx", "utf8");
const DASHBOARD = readFileSync("src/components/Dashboard.tsx", "utf8");

describe("the panel opens on arrival", () => {
  it("starts open from the address, not from a signal it mounted with", () => {
    /*
     * `expandSignal` deliberately ignores the value it mounts with, and on
     * a cold deep link the panel mounts long after the address was read.
     * So the address has to be the initial state.
     */
    expect(CHAT).toMatch(/useState\(addressed\)/);
  });

  it("also answers the address changing under a mounted panel", () => {
    // Back and Forward into `/margus`, in the same paint as the room.
    expect(CHAT).toMatch(
      /useLayoutEffect\(\(\) => \{\s*if \(addressed\) setOpen\(true\);\s*\}, \[addressed\]\)/
    );
  });

  it("is handed the address by the book, which is the only reader of it", () => {
    expect(DASHBOARD).toMatch(/const onMargus = isMargusPath\(pathname\)/);
    expect(DASHBOARD).toMatch(/margusAddressed=\{onMargus\}/);
    expect(MODALS).toMatch(/addressed=\{margusAddressed\}/);
  });
});

describe("closing puts the address back", () => {
  it("reports a change and never the value it mounted with", () => {
    /*
     * The panel remounts whenever the chat's portfolio changes, and a
     * mount report of `false` would rewrite the address of a reader who
     * never touched the panel.
     */
    expect(CHAT).toMatch(/const reportedOpen = useRef\(open\)/);
    expect(CHAT).toMatch(
      /if \(reportedOpen\.current === open\) return;\s*reportedOpen\.current = open;\s*onOpenChangeRef\.current\?\.\(open\)/
    );
    expect(MODALS).toMatch(/onOpenChange=\{onMargusOpenChange\}/);
  });

  it("replaces rather than pushes, and leaves the scroll alone", () => {
    /*
     * A panel the reader just shut is not somewhere Back should return
     * them to, and the room underneath has not changed, so a close that
     * sent the page to the top would read as a reload.
     */
    const start = DASHBOARD.indexOf("const onMargusOpenChange");
    // Up to and including the `});` that closes the replace call itself,
    // since `{ scroll: false })` is the first `})` after the opening line.
    const replaceAt = DASHBOARD.indexOf("router.replace", start);
    const handler = DASHBOARD.slice(
      start,
      DASHBOARD.indexOf("});", replaceAt) + 3
    );
    expect(handler).toMatch(/if \(open \|\| !onMargus\) return;/);
    expect(handler).toMatch(/router\.replace\("\/", \{ scroll: false \}\)/);
    expect(handler).not.toMatch(/router\.push/);
  });

  it("never writes the address itself", () => {
    // Opening the panel from a button does not push `/margus`: the address
    // is answered, not announced, so Back keeps meaning the last room.
    expect(DASHBOARD).not.toMatch(/router\.(push|replace)\(MARGUS_PATH/);
    expect(DASHBOARD).not.toMatch(/router\.(push|replace)\("\/margus"/);
    expect(CHAT).not.toMatch(/history\.(pushState|replaceState)/);
  });
});
