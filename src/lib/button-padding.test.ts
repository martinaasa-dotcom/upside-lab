/**
 * A button's label sits in the middle of the surface that lights up under
 * the pointer, and vertical padding on a fixed-height button is what breaks
 * that.
 *
 * The alert card on Home carried `-ml-2 mt-auto self-start pt-3` on its
 * "Open Pulse on $NASA" button. `size="sm"` is `h-7`, so with border-box
 * sizing the 12px of top padding came out of the 28px box rather than being
 * added to it: the content area shrank to 16px, `items-center` centred the
 * label in that, and the label ended up 6px below the centre of the hover
 * fill. Hovering it drew a pill with 17px of air above the words and 10px
 * below, which is what "hovering pulse is not centered" is.
 *
 * The gap the padding was buying belongs to a wrapper, where it spaces the
 * button without being inside it. Every legitimate vertical padding on a
 * Button in this app pairs with `h-auto`, which lets the box grow instead of
 * eating itself, and is symmetric, so the label stays centred either way.
 *
 * Asserted against the source: the fault is a class typed at a call site,
 * and a render would only show it to somebody with a pointer on the button.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
      continue;
    }
    if (path.endsWith(".tsx") && !path.includes(".test.")) out.push(path);
  }
  return out;
}

/** `py-2.5`, `pt-3`, `sm:pb-1` ... on a className. */
const VERTICAL_PAD = /(?:^|:)p[tby]-/;

type Offender = { file: string; line: number; className: string };

/**
 * Every `className` on a `<Button` in the tree, with the line it starts on.
 * The opening tag is read to its `>`; a className is the first string
 * literal after `className=`, which is every one of them in this app.
 */
function buttonClassNames(file: string): Offender[] {
  const text = readFileSync(file, "utf8");
  const found: Offender[] = [];
  const opens = /<Button\b/g;
  let open: RegExpExecArray | null;
  while ((open = opens.exec(text))) {
    const end = text.indexOf(">", open.index);
    if (end < 0) continue;
    const tag = text.slice(open.index, end);
    const cls = /className="([^"]*)"/.exec(tag);
    if (!cls) continue;
    found.push({
      file,
      line: text.slice(0, open.index).split("\n").length,
      className: cls[1],
    });
  }
  return found;
}

describe("button padding", () => {
  const buttons = sourceFiles("src").flatMap(buttonClassNames);

  it("finds the buttons it is meant to be reading", () => {
    expect(buttons.length).toBeGreaterThan(20);
  });

  it("never pads a button vertically without letting it grow", () => {
    const offenders = buttons.filter((b) => {
      const parts = b.className.split(/\s+/);
      if (!parts.some((p) => VERTICAL_PAD.test(p))) return false;
      return !parts.includes("h-auto");
    });
    expect(
      offenders.map((o) => `${o.file}:${o.line} ${o.className}`)
    ).toEqual([]);
  });

  it("pads a button by the same amount top and bottom", () => {
    const offenders = buttons.filter((b) => {
      const parts = b.className.split(/\s+/);
      const top = parts.filter((p) => /(?:^|:)pt-/.test(p));
      const bottom = parts.filter((p) => /(?:^|:)pb-/.test(p));
      return top.length !== bottom.length;
    });
    expect(
      offenders.map((o) => `${o.file}:${o.line} ${o.className}`)
    ).toEqual([]);
  });
});
