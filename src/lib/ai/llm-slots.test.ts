import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  beginBackgroundLlm,
  endBackgroundLlm,
  chatIsBusy,
  markChatActive,
} from "./llm-slots";

describe("beginBackgroundLlm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset any state a prior test left behind.
    endBackgroundLlm();
    markChatActive(0);
  });

  afterEach(() => {
    endBackgroundLlm();
    markChatActive(0);
    vi.useRealTimers();
  });

  it("refuses a second caller while the slot is genuinely in use", () => {
    expect(beginBackgroundLlm()).toBe(true);
    expect(beginBackgroundLlm()).toBe(false);
    endBackgroundLlm();
    expect(beginBackgroundLlm()).toBe(true);
  });

  it("refuses while chat holds the model", () => {
    markChatActive(1_000);
    expect(chatIsBusy()).toBe(true);
    expect(beginBackgroundLlm()).toBe(false);
  });

  it("takes back a slot a process crash left stuck, rather than jamming every background job forever", () => {
    expect(beginBackgroundLlm()).toBe(true);
    // The holder never calls endBackgroundLlm -- a hard kill of the
    // request that never reaches its own `finally`.
    vi.advanceTimersByTime(119_000);
    expect(beginBackgroundLlm()).toBe(false);
    vi.advanceTimersByTime(2_000);
    expect(beginBackgroundLlm()).toBe(true);
  });
});
