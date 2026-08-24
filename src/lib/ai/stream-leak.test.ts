import { describe, expect, it } from "vitest";
import { peekUntilUseful, LEAK_SNIFF_CHARS } from "@/lib/ai/stream-leak";

const USEFUL = new Set(["text-delta", "tool-call"]);

type Part = { type: string; text?: string };

async function* parts(...ps: Part[]) {
  for (const p of ps) yield p;
}

/** Cut a string into small deltas, the way a provider actually sends it. */
function words(s: string): Part[] {
  return s.split(" ").map((w) => ({ type: "text-delta", text: w + " " }));
}

/* Captured from a live free model on 2026-08-24, asked to explain a covered call. */
const LEAKED =
  "The user asks: \"Explain what a covered call is.\" " +
  "We must follow policy: we cannot guarantee outcomes, cannot give " +
  "personalized investment advice. We must not mention policy. " +
  "Make sure no em dashes. Use periods, commas. No banned words.";

const GOOD =
  "A covered call is when you already own at least a hundred shares of a " +
  "company and you sell someone else the right to buy them from you at a " +
  "set price before a set date. You keep the money they pay you for that " +
  "right, whatever happens next. Always your call.";

describe("reading the head of a stream before the reader sees it", () => {
  it("stops an answer that starts by narrating its own reasoning", async () => {
    const r = await peekUntilUseful(parts(...words(LEAKED)), USEFUL);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("leak");
  });

  it("lets a real answer through, and keeps every part of it", async () => {
    const all = words(GOOD);
    const r = await peekUntilUseful(parts(...all), USEFUL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // Whatever was pulled to judge is still in the prefix, then the rest.
    let seen = r.prefix.map((p) => (p as Part).text ?? "").join("");
    for (;;) {
      const step = await r.iterator.next();
      if (step.done) break;
      seen += (step.value as Part).text ?? "";
    }
    expect(seen).toBe(all.map((p) => p.text).join(""));
  });

  it("reads enough to judge and not the whole answer", async () => {
    const r = await peekUntilUseful(parts(...words(GOOD)), USEFUL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const buffered = r.prefix.map((p) => (p as Part).text ?? "").join("");
    expect(buffered.length).toBeGreaterThanOrEqual(LEAK_SNIFF_CHARS);
    expect(buffered.length).toBeLessThan(GOOD.length + 40);
  });

  it("sends a tool call straight through without waiting for prose", async () => {
    const r = await peekUntilUseful(
      parts({ type: "tool-call" }, ...words(GOOD)),
      USEFUL
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.prefix).toHaveLength(1);
  });

  it("treats a provider error as death, not as a leak", async () => {
    const r = await peekUntilUseful(parts({ type: "error" }), USEFUL);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("died");
  });

  it("does not hang on an answer shorter than the sniff window", async () => {
    const r = await peekUntilUseful(parts(...words("Yes. Always your call.")), USEFUL);
    expect(r.ok).toBe(true);
  });
});
