/**
 * THE NUMBER BESIDE "MEMBERS" IS HOW MANY MEMBERS THERE ARE.
 *
 * It used to be the number of people waiting to join, and only an admin
 * saw it, so a circle of fourteen people opened on a tab reading
 * "Members · 1". A count beside a noun is read as the count of that noun;
 * nobody reads it as "one thing to do about members". The count is the
 * roster now, the same figure the list page prints as "14 people", and
 * the request waiting on the admin is said in words.
 */
export function membersTabLabel(memberCount: number, waitingToJoin: number) {
  const base = memberCount > 0 ? `Members · ${memberCount}` : "Members";
  if (waitingToJoin <= 0) return base;
  return `${base}, ${waitingToJoin} waiting`;
}
