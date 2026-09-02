/**
 * One word for the room, everywhere a reader can see it.
 *
 * The same screen serves two things: a circle of friends and family, and a
 * paper class. The tables, the routes and the types all call both of them a
 * "community", which is fine for a column name and wrong on a screen: the
 * product has never called it that out loud, and a student leaving a class
 * was being asked "Leave this community?".
 *
 * So the noun comes from here and nowhere else. `reader-copy.test.ts` fails
 * on the word "community" in the markup of any circle or class screen, which
 * is what stops it drifting back one string at a time.
 */

export type RoomKind = "circle" | "classroom" | string | null | undefined;

/** "circle" or "class", lower case, for the middle of a sentence. */
export function roomNoun(kind: RoomKind): "circle" | "class" {
  return kind === "classroom" ? "class" : "circle";
}

/** "Circle" or "Class", for the start of a sentence or a heading. */
export function RoomNoun(kind: RoomKind): "Circle" | "Class" {
  return kind === "classroom" ? "Class" : "Circle";
}

/** "this circle" / "this class". */
export function thisRoom(kind: RoomKind): string {
  return `this ${roomNoun(kind)}`;
}

/**
 * "the Aasa family" when there is a name, "this circle" when there is not.
 * Used by the leave and delete questions, which read badly as
 * "Leave this circle?" when the reader can see the name at the top.
 */
export function namedRoom(kind: RoomKind, name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  return trimmed ? trimmed : thisRoom(kind);
}
