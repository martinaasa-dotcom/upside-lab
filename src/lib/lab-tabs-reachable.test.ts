import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const lab = readFileSync(
  join(process.cwd(), "src/components/LabSheet.tsx"),
  "utf8"
);
const labTabs = readFileSync(
  join(process.cwd(), "src/lib/lab-tabs.ts"),
  "utf8"
);
const dashboard = readFileSync(
  join(process.cwd(), "src/components/Dashboard.tsx"),
  "utf8"
);
const aboutYou = readFileSync(
  join(process.cwd(), "src/components/tour/AboutYouScreen.tsx"),
  "utf8"
);

/*
 * Lab's tab row is the only way into Research and the Playbook, and on a
 * phone it used to hide both.
 *
 * There were two rows written out by hand, `sm:hidden` for the phone and
 * `hidden sm:block` for everything else, and every affordance that says a
 * row keeps going had been put on the wider one: the scroll listener, the
 * edge-fade mask, and the ref that keeps the chosen tab on screen. The
 * phone row had none of them, and the phone row is the one that always
 * overflows. Measured at 390px it was 488px of tabs in a 311px window
 * breaking within two pixels of a tab boundary, so a reader saw four
 * complete tabs and nothing at all to suggest two more existed.
 */
describe("every Lab tab can be reached on a phone", () => {
  it("draws one tab row component rather than two written out by hand", () => {
    expect(lab).toMatch(/function LabTabRow\(/);
    // Exactly one place builds tab buttons, so the two breakpoints cannot
    // drift apart in what they offer again.
    const tablists = lab.match(/role="tablist"/g) ?? [];
    expect(tablists).toHaveLength(1);
    const tabButtons = lab.match(/role="tab"/g) ?? [];
    expect(tabButtons).toHaveLength(1);
  });

  it("wraps the phone row instead of scrolling tabs out of sight", () => {
    /*
     * Wrapping is what makes every tab visible without a reader having to
     * discover a sideways scroll. The fade stays for the wider row, which
     * has room to lay the tabs out in one line and where a scroller is the
     * right answer.
     */
    const phoneRow = lab.slice(
      lab.indexOf("<LabTabRow"),
      lab.indexOf("</div>", lab.indexOf("<LabTabRow"))
    );
    expect(phoneRow).toMatch(/className="flex-wrap sm:hidden"/);
  });

  it("keeps the overflow fade and the measurement inside the component", () => {
    const component = lab.slice(
      lab.indexOf("function LabTabRow("),
      lab.indexOf("const INTENT_TO_TAB")
    );
    expect(component.length).toBeGreaterThan(0);
    // Its own ref and its own state. Both rows are in the document at every
    // width and the hidden one measures zero, so a shared ref would have one
    // breakpoint deciding the other's fade.
    expect(component).toMatch(/const scrollRef = useRef/);
    expect(component).toMatch(/const \[overflow, setOverflow\] = useState/);
    expect(component).toMatch(/mask-image:linear-gradient/);
    // And it scrolls the chosen tab into view, which the phone row never did.
    expect(component).toMatch(/scrollIntoView/);
  });

  it("offers every Lab deep link in the command palette", () => {
    /*
     * Adding a Lab tab with a deep link is three edits -- the `LabDeepLink`
     * type, `INTENT_TO_TAB`, and the palette -- and AGENTS.md records that
     * the first two fail loudly while the third fails silently. That is how
     * the Playbook shipped unfindable by name in the one place a reader
     * goes to look for a room by name.
     *
     * `INTENT_TO_TAB` is the list of deep links, keyed by the type, so a
     * new one cannot be added without appearing here. Each must reach the
     * palette, which is the only thing that calls `setLabIntent`.
     */
    const block = lab.slice(
      lab.indexOf("const INTENT_TO_TAB"),
      lab.indexOf("};", lab.indexOf("const INTENT_TO_TAB"))
    );
    const links = [...block.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]!);
    expect(links.length, "no Lab deep links found").toBeGreaterThan(0);
    for (const link of links) {
      expect(
        dashboard,
        `"${link}" is a Lab deep link with no way into it from the command ` +
          `palette, which is where a reader looks for a room by name`
      ).toContain(`setLabIntent("${link}")`);
    }
  });

  it("offers Research and the Playbook at all", () => {
    /*
     * The two tabs the phone row used to hide. If either leaves the list
     * this test should be changed deliberately, not silently.
     *
     * Read from `lab-tabs.ts` rather than from the room, because the row is
     * drawn twice: Lab draws it, and the walkthrough draws a preview of it.
     * The walkthrough used to hand-type its own copy, which had drifted to
     * four tabs with the first one misnamed, so both now read one list.
     */
    expect(labTabs).toMatch(/\{ id: "lookup", label: "Research" \}/);
    expect(labTabs).toMatch(/\{ id: "playbook", label: "Playbook" \}/);
  });

  it("has the walkthrough read that same list rather than its own", () => {
    /*
     * `AboutYouScreen` previews the app as the reader's two answers leave
     * it. It imports `DOCK_TABS` from the real bar so the rooms cannot
     * drift, and beside that it had a hand-typed `LAB_VIEWS` which had:
     * "Allocation" for a tab the product calls "The mix", and no Research
     * or Playbook at all.
     */
    expect(aboutYou).toMatch(/LAB_TABS/);
    expect(
      aboutYou,
      "the walkthrough is hand-typing Lab's tabs again"
    ).not.toMatch(/const LAB_VIEWS/);
  });
});
