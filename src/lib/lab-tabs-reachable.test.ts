import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const lab = readFileSync(
  join(process.cwd(), "src/components/LabSheet.tsx"),
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

  it("offers Research and the Playbook at all", () => {
    // The two tabs the phone row used to hide. If either leaves TABS this
    // test should be changed deliberately, not silently.
    expect(lab).toMatch(/\{ id: "lookup", label: "Research" \}/);
    expect(lab).toMatch(/\{ id: "playbook", label: "Playbook" \}/);
  });
});
