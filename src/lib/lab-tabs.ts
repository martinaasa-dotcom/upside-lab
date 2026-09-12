/**
 * Lab's tabs, in the order Lab draws them.
 *
 * Here rather than inside `LabSheet` because two places draw this row and
 * only one of them was reading it. The walkthrough shows a preview of the
 * app as the reader's two answers leave it, and it imports `DOCK_TABS`
 * from the real bar so the rooms cannot drift -- then hand-typed Lab's own
 * tabs beside it, and they had. That list called the first tab
 * "Allocation", a word the product does not use anywhere and deliberately
 * renamed to "The mix", and it stopped at four tabs, so a reader was shown
 * a Lab with no Research and no Playbook on the one screen that promises
 * to show them their app. Those are the same two tabs a phone could not
 * reach until recently, hidden again in the place a beginner meets first.
 *
 * A module of its own rather than an export from `LabSheet`, because the
 * walkthrough would otherwise pull the whole room, every panel it mounts
 * and every chart under them into its own bundle to read six labels.
 */
export type LabTab =
  | "alloc"
  | "risk"
  | "trends"
  | "seasonality"
  | "lookup"
  | "playbook";

/** One flat row: what you hold, how risky it is, and when it tends to move. */
/*
  The mix stays first, and the company lookup goes last.

  Lab's other four tabs are all whole-portfolio tools and one of them has
  to be what Lab opens on. Putting the lookup first made it look like the
  default and then visibly not be it: a reader lands on Lab, sees "Look up
  a company" at the left of the row, and the highlight is two tabs along.
  Last is where a tool that is about something other than your own
  portfolio belongs anyway.
*/
export const LAB_TABS: { id: LabTab; label: string }[] = [
  { id: "alloc", label: "The mix" },
  { id: "risk", label: "Risk" },
  { id: "trends", label: "Trends" },
  { id: "seasonality", label: "Seasonality" },
  { id: "lookup", label: "Research" },
  /*
    Playbook is last because it is the only tab that is not about a
    holding at all, not even one the reader is weighing up. The other five
    all start from a company: four from the ones already owned and Research
    from one being considered. This one starts from nothing, which makes it
    the furthest thing in Lab from "the mix" and therefore the end of the
    row. It is also the one tab that has something to say to an account
    with no holdings in it yet, which is why it never hides.
  */
  { id: "playbook", label: "Playbook" },
];
