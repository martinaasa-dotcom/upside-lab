/**
 * THE MEMBERS TAB IS CALLED "MEMBERS" AND CARRIES NO NUMBER.
 *
 * It has now been wrong twice for the same reason. First the number was
 * how many people were waiting to join, so a circle of fourteen opened on
 * a tab reading "Members · 1" and every reader took that for the roster.
 * Then it was the roster, which is true and still costs more than it is
 * worth: the tab sits in a segmented control whose cells share one row,
 * so every character in the longest label narrows all of them, and
 * "Members · 15" was clipped against its own pill at 390px with the count
 * half cut off. A count of the people in a circle is not something a
 * reader needs while deciding which tab to press, and it is already
 * printed on the page that tab opens.
 *
 * So the tab says one word and the count moves to the page: this line
 * sits under the Members heading, where there is a whole row for it and
 * the waiting can be said in words rather than squeezed into a badge.
 */
export function membersCountLine(memberCount: number, waitingToJoin: number) {
  const people =
    memberCount === 1 ? "1 person" : `${memberCount} people`;
  const base = memberCount > 0 ? people : "Nobody yet";
  if (waitingToJoin <= 0) return base;
  const waiting =
    waitingToJoin === 1 ? "1 waiting to join" : `${waitingToJoin} waiting to join`;
  return `${base}, ${waiting}`;
}
