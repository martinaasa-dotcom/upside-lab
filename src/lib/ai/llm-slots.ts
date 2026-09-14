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

/** Opaque handle to one hold. Only the caller that received it may release it. */
export type BackgroundLlmSlot = number;

let nextSlotId = 1;
let heldSlot: BackgroundLlmSlot | null = null;
let heldSince = 0;

const DEFAULT_CHAT_HOLD_MS = 60_000;

/**
 * A held slot is released by its own holder calling `endBackgroundLlm`,
 * which only runs if that request unwinds normally. A platform-level hard
 * kill (the function hits its own timeout, the isolate is torn down for
 * memory) does not unwind anything, and the hold lives on the warm
 * instance rather than per request, so a slot stuck this way stayed stuck
 * for the rest of that instance's life -- every later background job on
 * it read "held" forever and fell back, silently, which is exactly the
 * failure `sunday_letter_all_fallback` exists to catch and could not
 * explain. No legitimate hold should run anywhere near this long, so a
 * slot older than this is treated as abandoned and taken back.
 *
 * This is a backstop for a crash, not a budget any caller should ever
 * plan around: it must stay comfortably above the slowest real hold this
 * process can produce, chosen generously rather than tuned tight, because
 * reclaiming a slot that is still genuinely in use is worse than waiting a
 * little longer for one that truly is stuck (see the ownership token
 * below for why reclaiming early is unsafe even then).
 */
const MAX_HOLD_MS = 5 * 60_000;

export function markChatActive(ms = DEFAULT_CHAT_HOLD_MS) {
  chatUntil = ms <= 0 ? 0 : Date.now() + ms;
}

export function chatIsBusy(): boolean {
  return Date.now() < chatUntil;
}

/**
 * Take the slot if free, returning a token the caller must hand back to
 * `endBackgroundLlm`. `null` means try again later.
 *
 * The token is what makes the crash backstop above safe. Without one, a
 * caller reclaiming an apparently-abandoned slot and a straggler that
 * turns out not to be dead after all can both believe they hold it; the
 * straggler's own `endBackgroundLlm()` would then release whoever the
 * *current* holder is, not itself, either freeing the slot while the new
 * holder is still mid-call or granting two callers the model at once,
 * which is the exact thing this file exists to prevent. Comparing the
 * token on release means a stale caller's release is a safe no-op instead
 * of stealing back a slot that has since been legitimately reissued.
 */
export function beginBackgroundLlm(): BackgroundLlmSlot | null {
  if (chatIsBusy()) return null;
  if (heldSlot !== null && Date.now() - heldSince < MAX_HOLD_MS) return null;
  const slot = nextSlotId++;
  heldSlot = slot;
  heldSince = Date.now();
  return slot;
}

/** Release a slot this caller received from `beginBackgroundLlm`. */
export function endBackgroundLlm(slot: BackgroundLlmSlot) {
  if (heldSlot === slot) {
    heldSlot = null;
    heldSince = 0;
  }
}
