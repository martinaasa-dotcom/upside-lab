/**
 * What the app says while it is opening.
 *
 * These are quiet on purpose. This is the room a reader waits in before
 * they find out whether they lost money today, and it used to show one of
 * forty jokes about exactly that: "Checking if you're rich yet", "Reassuring
 * your losses", "Recalculating how rich you feel", "Bribing the server with
 * imaginary money", plus market slang the persona bans outright. On the
 * morning somebody opens this after a bad week, a gag about their money is
 * the app laughing at them.
 *
 * They also have to match what came before. The session-resume shell says
 * "Opening your portfolio ..." so the app arrives underneath something that
 * never moved (see AGENTS.md); replacing that with a joke one frame later
 * undoes the whole point of it.
 *
 * So: a handful of true lines saying what is actually happening. Humour, if
 * any, belongs in Margus's own voice, where a person is talking to you.
 * A space before the trailing ellipsis reads cleaner than jamming it
 * against the last word.
 */
const LOADING_MESSAGES = [
  "Opening your portfolio …",
  "Getting today's prices …",
  "Adding up what you own …",
  "Nearly there …",
];

/** Stable SSR + first paint. Random line swaps in after mount. */
export const DEFAULT_LOADING_MESSAGE = LOADING_MESSAGES[0]!;

export function pickLoadingMessage(): string {
  return LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)]!;
}
