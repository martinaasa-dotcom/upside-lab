import { describe, expect, it, vi } from "vitest";
import type { LanguageModel } from "ai";
import { withAdvisorFallback } from "@/lib/ai/model";

const dummy = {} as LanguageModel;

describe("withAdvisorFallback", () => {
  it("logs when every provider in the chain fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      withAdvisorFallback(
        [
          { id: "openrouter", model: dummy, modelId: "some/model:free" },
          { id: "nvidia", model: dummy, modelId: "nvidia/nemotron-3-super-120b-a12b" },
        ],
        async () => {
          throw new Error("provider down");
        }
      )
    ).rejects.toThrow("provider down");

    const joined = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(joined).toContain("advisor chain exhausted");
    expect(joined).toContain("openrouter");
    expect(joined).toContain("nvidia");
    spy.mockRestore();
  });
});
