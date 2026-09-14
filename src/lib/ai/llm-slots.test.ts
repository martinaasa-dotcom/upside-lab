import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  beginBackgroundLlm,
  endBackgroundLlm,
  chatIsBusy,
  markChatActive,
} from "./llm-slots";

/**
 * Drain whatever this test file's own last case left held, whether or not
 * it released cleanly. A stray hold can't be stolen with a plain call
 * (that's the ownership guarantee under test), so force it stale first.
 */
function releaseAnyStrayHold() {
  markChatActive(0);
  vi.advanceTimersByTime(6 * 60_000);
  const slot = beginBackgroundLlm();
  if (slot != null) endBackgroundLlm(slot);
}

describe("beginBackgroundLlm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    releaseAnyStrayHold();
  });

  afterEach(() => {
    releaseAnyStrayHold();
    vi.useRealTimers();
  });

  it("refuses a second caller while the slot is genuinely in use", () => {
    const slot = beginBackgroundLlm();
    expect(slot).not.toBeNull();
    expect(beginBackgroundLlm()).toBeNull();
    endBackgroundLlm(slot!);
    const second = beginBackgroundLlm();
    expect(second).not.toBeNull();
    endBackgroundLlm(second!);
  });

  it("refuses while chat holds the model", () => {
    markChatActive(1_000);
    expect(chatIsBusy()).toBe(true);
    expect(beginBackgroundLlm()).toBeNull();
  });

  it("takes back a slot a process crash left stuck, rather than jamming every background job forever", () => {
    const first = beginBackgroundLlm();
    expect(first).not.toBeNull();
    // The holder never calls endBackgroundLlm -- a hard kill of the
    // request that never reaches its own `finally`.
    vi.advanceTimersByTime(5 * 60_000 - 1_000);
    expect(beginBackgroundLlm()).toBeNull();
    vi.advanceTimersByTime(2_000);
    expect(beginBackgroundLlm()).not.toBeNull();
  });

  it("ignores a release from a caller whose hold has already been reclaimed", () => {
    const stale = beginBackgroundLlm();
    expect(stale).not.toBeNull();
    // Time out the stale hold and let someone else legitimately take it.
    vi.advanceTimersByTime(5 * 60_000 + 1_000);
    const fresh = beginBackgroundLlm();
    expect(fresh).not.toBeNull();
    expect(fresh).not.toBe(stale);

    // The original, long-dead holder finally reaches its own `finally`
    // and releases the token it was handed. That must not tear down the
    // slot someone else is now legitimately holding -- a naive
    // "clear the flag" release would free it, or worse, let two callers
    // believe they hold the model at once.
    endBackgroundLlm(stale!);
    expect(beginBackgroundLlm()).toBeNull();

    // Only the actual current holder's own token releases it.
    endBackgroundLlm(fresh!);
    expect(beginBackgroundLlm()).not.toBeNull();
  });
});
