/**
 * The client and the server used to disagree about how big a chat turn may
 * be, and the reader was the one who found out: an ordinary broker
 * screenshot was compressed to something the browser was happy with and
 * the server refused, with "That request was too big." and nothing else.
 */
import { describe, expect, it } from "vitest";
import {
  CHAT_BYTE_BUDGET_KB,
  CHAT_BYTE_WINDOW_MS,
  CHAT_MAX_BODY_BYTES,
  CHAT_MAX_IMAGE_CHARS,
} from "@/lib/chat-limits";

describe("the chat size budget", () => {
  it("lets an image through with room for the conversation beside it", () => {
    expect(CHAT_MAX_IMAGE_CHARS).toBeLessThan(CHAT_MAX_BODY_BYTES);
    // Two images and a conversation still have to fit, which is what makes
    // "paste both screenshots" work.
    expect(CHAT_MAX_IMAGE_CHARS * 2).toBeLessThan(CHAT_MAX_BODY_BYTES);
  });

  it("stays under the platform's own request body limit", () => {
    // Vercel will not carry a function request body past about 4.5 MB, so
    // a server cap above that is a promise the runtime breaks first.
    expect(CHAT_MAX_BODY_BYTES).toBeLessThan(4_500_000);
  });

  it("leaves an ordinary text conversation nowhere near the cost budget", () => {
    // A turn with forty short messages is a few kilobytes. Forty of those
    // should not come close to the window's budget.
    const ordinaryTurnKb = 8;
    expect(ordinaryTurnKb * 40).toBeLessThan(CHAT_BYTE_BUDGET_KB / 10);
  });

  it("still allows several screenshots in a window", () => {
    const perImageKb = Math.ceil(CHAT_MAX_IMAGE_CHARS / 1024);
    expect(Math.floor(CHAT_BYTE_BUDGET_KB / perImageKb)).toBeGreaterThanOrEqual(4);
  });

  it("charges against a window short enough to recover from", () => {
    expect(CHAT_BYTE_WINDOW_MS).toBeLessThanOrEqual(10 * 60_000);
  });
});
