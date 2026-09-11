import type { DeckState } from "@/lib/recall-deck";

/**
 * Where the recall deck's schedule is kept.
 *
 * Lifted out of `RecallCardPanel` when a second surface needed to read it:
 * the panel asks the questions and the learning record says how many have
 * been answered, and two copies of a storage key is how two surfaces come
 * to disagree about the same reader.
 *
 * Keyed per account, so two people sharing one browser do not mark each
 * other's cards. A reader with no session gets the unkeyed deck.
 */
const KEY_PREFIX = "upside-recall-deck-v1";

export function deckStorageKey(userId: string | null | undefined): string {
  return userId ? `${KEY_PREFIX}:${userId}` : KEY_PREFIX;
}

export function loadDeck(userId: string | null | undefined): DeckState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(deckStorageKey(userId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as DeckState)
      : {};
  } catch {
    return {};
  }
}

export function saveDeck(
  userId: string | null | undefined,
  state: DeckState
): void {
  try {
    window.localStorage.setItem(deckStorageKey(userId), JSON.stringify(state));
  } catch {
    // A reader with storage switched off simply gets the question again.
  }
}
