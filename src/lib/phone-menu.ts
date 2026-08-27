/**
 * What goes in the phone bar's one overflow menu.
 *
 * The phone's top bar has room for the brand mark, the page's title, one
 * real button and the account avatar. Measured on the production build at
 * 390px, every icon button in that row is 44px wide (the `(pointer:
 * coarse)` floor in `globals.css`), so a bar carrying four of them plus an
 * avatar spends 224px of a 358px line and the title, which is the one part
 * that says where the reader is, gets what is left: nothing. It truncated
 * to a single letter.
 *
 * So everything that is not the page's one action is a row in here. The
 * page supplies its own rows and the bar appends Feedback below a rule,
 * so a page never has to remember it exists. Upgrade lives on Account:
 * Pro unlocks nothing, and asking from every screen reads as a catch.
 *
 * Pure, and separate from the bar, because the ordering and the rule are
 * the part worth testing.
 */
export type PhoneMenuRow = {
  id: string;
  label: string;
  /** Draw a rule above this row. */
  separated?: boolean;
  onSelect: () => void;
};

export type PhoneChrome = {
  /** No rows at all for a signed-out reader: Feedback does nothing there. */
  signedIn: boolean;
  /**
   * Kept so a screen that really wants the ask (Account) can still pass
   * it. The phone bar always sends false.
   */
  offerUpgrade: boolean;
  onUpgrade: () => void;
  onFeedback: () => void;
};

export function phoneMenuRows<T extends PhoneMenuRow>(
  pageRows: readonly T[],
  chrome: PhoneChrome,
): (T | PhoneMenuRow)[] {
  const rows: (T | PhoneMenuRow)[] = [...pageRows];
  if (!chrome.signedIn) return rows;

  const own: PhoneMenuRow[] = [];
  if (chrome.offerUpgrade) {
    own.push({
      id: "upgrade",
      label: "Upgrade to Pro",
      onSelect: chrome.onUpgrade,
    });
  }
  own.push({ id: "feedback", label: "Feedback", onSelect: chrome.onFeedback });

  /*
   * The rule goes above the first of the bar's own rows, and only when the
   * page put something above it. A menu that opens on a rule has a rule
   * separating nothing from something.
   */
  own[0] = { ...own[0], separated: rows.length > 0 };
  return [...rows, ...own];
}
