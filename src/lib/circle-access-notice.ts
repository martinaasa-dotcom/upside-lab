/**
 * WHO ARRIVED, SAID LOUDLY ENOUGH THAT AN ADMIN NOTICES.
 *
 * Somebody asking to join a circle used to be a single digit in a badge
 * beside the circle's name, which is the smallest thing on the screen and
 * says nothing about who or when. It is now a card at the top of the
 * circle, and it has two things to say rather than one.
 *
 * A request still waiting is work: it names the people and carries the
 * two buttons, so the answer never costs a trip to another tab. Somebody
 * who has already arrived is news: a circle that lets people straight in
 * (which is what public means now) would otherwise grow behind its
 * admin's back, and "three people joined this week" is the sentence that
 * stops that being a surprise.
 *
 * The news half is dated rather than dismissed one person at a time: it
 * remembers the newest arrival the reader has already been told about,
 * so marking it read is one press and a returning reader is never shown
 * the same arrival twice.
 */

export const JOINED_RECENTLY_DAYS = 14;

export type JoinedPerson = {
  userId: string;
  name: string;
  joinedAt: string;
};

export type AccessNoticeInput = {
  /** Everyone in the circle, with the day each of them joined. */
  members: { user_id: string; joined_at: string; is_you?: boolean }[];
  nameOf: (userId: string) => string;
  /** The newest arrival this reader has already seen, as an ISO stamp. */
  seenThrough: string | null;
  now: number;
};

export type AccessNotice = {
  joined: JoinedPerson[];
  /** Pass this back to `seenThrough` when the reader marks it read. */
  newest: string | null;
};

/**
 * Arrivals inside the window that this reader has not been told about,
 * newest first. You are never news to yourself.
 */
export function recentArrivals({
  members,
  nameOf,
  seenThrough,
  now,
}: AccessNoticeInput): AccessNotice {
  const floor = now - JOINED_RECENTLY_DAYS * 24 * 60 * 60 * 1000;
  const seen = seenThrough ? Date.parse(seenThrough) : NaN;
  const joined: JoinedPerson[] = [];
  for (const m of members) {
    if (m.is_you) continue;
    const at = Date.parse(m.joined_at);
    if (!Number.isFinite(at)) continue;
    if (at < floor) continue;
    if (Number.isFinite(seen) && at <= seen) continue;
    joined.push({ userId: m.user_id, name: nameOf(m.user_id), joinedAt: m.joined_at });
  }
  joined.sort((a, b) => Date.parse(b.joinedAt) - Date.parse(a.joinedAt));
  return { joined, newest: joined[0]?.joinedAt ?? null };
}

/** "Anu and Rasmus joined." — names, never a bare count. */
export function arrivalsLine(joined: JoinedPerson[]) {
  const names = joined.map((p) => p.name);
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} joined.`;
  if (names.length === 2) return `${names[0]} and ${names[1]} joined.`;
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} and ${rest} ${rest === 1 ? "other" : "others"} joined.`;
}

/** "2 people are waiting to join." */
export function waitingLine(count: number) {
  if (count === 1) return "1 person is waiting to join.";
  return `${count} people are waiting to join.`;
}

const SEEN_KEY_PREFIX = "upside-circle-arrivals-seen:";

export function arrivalsSeenKey(communityId: string) {
  return `${SEEN_KEY_PREFIX}${communityId}`;
}
