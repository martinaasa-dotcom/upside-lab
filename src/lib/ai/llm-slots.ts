/**
 * In-process traffic cop for shared free-tier model quota.
 *
 * Chat answers a person who is waiting. Pulse and inbox notes can wait.
 * Forecast first-run is not a background job: the person is staring at
 * the sheet, so that route never takes this slot. This is per warm
 * instance, not a global lock, so it will not catch every overlap on
 * Vercel. It still stops the common case: one instance chewing a Pulse
 * sweep while someone is mid-reply.
 */

let chatUntil = 0;
let backgroundInFlight = 0;
let backgroundHeldSince = 0;

const DEFAULT_CHAT_HOLD_MS = 60_000;

/**
 * A held slot is released in a `finally`, which only runs if the request
 * that took it unwinds normally. A platform-level hard kill (the function
 * hits its own timeout, the isolate is torn down for memory) does not
 * unwind anything, and this flag lives on the warm instance rather than
 * per request, so a slot stuck this way stayed stuck for the rest of that
 * instance's life -- every later background job on it read "held" forever
 * and fell back, silently, which is exactly the failure
 * `sunday_letter_all_fallback` exists to catch and could not explain. No
 * legitimate hold runs anywhere near this long (the longest budget any
 * caller passes is under 90s), so a slot older than this is stale rather
 * than busy and is taken back.
 */
const MAX_HOLD_MS = 120_000;

export function markChatActive(ms = DEFAULT_CHAT_HOLD_MS) {
  chatUntil = ms <= 0 ? 0 : Date.now() + ms;
}

export function chatIsBusy(): boolean {
  return Date.now() < chatUntil;
}

/** True if this background job may call the model. Pair with endBackgroundLlm. */
export function beginBackgroundLlm(): boolean {
  if (chatIsBusy()) return false;
  if (
    backgroundInFlight >= 1 &&
    Date.now() - backgroundHeldSince < MAX_HOLD_MS
  ) {
    return false;
  }
  backgroundInFlight = 1;
  backgroundHeldSince = Date.now();
  return true;
}

export function endBackgroundLlm() {
  backgroundInFlight = 0;
  backgroundHeldSince = 0;
}
