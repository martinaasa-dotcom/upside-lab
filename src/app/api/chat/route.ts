import {
  buildCcSystemPrompt,
  buildCcAdvisorTools,
  type CcChatContext,
} from "@/lib/ai/cc-advisor";
import { markChatActive } from "@/lib/ai/llm-slots";
import {
  buildAdvisorProviderChain,
  invalidateStreamingProvider,
  isTransientAdvisorFailure,
  markProviderUnhealthy,
  pickStreamingProvider,
  rememberStreamingProvider,
} from "@/lib/ai/model";
import { fetchPulseContexts } from "@/lib/market/ticker-context";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { rateLimitJson } from "@/lib/rate-limit";
import {
  takeDurableRateLimit,
  takeDurableRateLimitWeighted,
} from "@/lib/rate-limit-durable";
import {
  CHAT_BYTE_BUDGET_KB,
  CHAT_BYTE_WINDOW_MS,
  CHAT_MAX_BODY_BYTES,
} from "@/lib/chat-limits";
import { stampAdvisorUse } from "@/lib/advisor-use";
import { isRecord } from "@/lib/unknown";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type TextStreamPart,
  type ToolSet,
  type UIMessage,
} from "ai";
import { observeRoute } from "@/lib/observe-route";
import { chatPostSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";
import { screenshotImportFallbackCopy } from "@/lib/screenshot-import-copy";
import { peekUntilUseful } from "@/lib/ai/stream-leak";

export const maxDuration = 120;

const FALLBACK_CHAT_TEXT = "That did not go through. Send it again.";
const FALLBACK_SCREENSHOT_TEXT = screenshotImportFallbackCopy().lines.join("\n");

type StreamPart = { type: string };

function messagesHaveImages(messages: UIMessage[]): boolean {
  return messages.some((m) =>
    (m.parts ?? []).some(
      (p) =>
        p.type === "file" &&
        "mediaType" in p &&
        typeof p.mediaType === "string" &&
        p.mediaType.startsWith("image/")
    )
  );
}

function fallbackChatResponse(vision = false): Response {
  const id = "text-fallback";
  const delta = vision ? FALLBACK_SCREENSHOT_TEXT : FALLBACK_CHAT_TEXT;
  const stream = createUIMessageStream({
    execute({ writer }) {
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta });
      writer.write({ type: "text-end", id });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

const USEFUL_PART = new Set([
  "text-delta",
  "reasoning-delta",
  "tool-call",
  "tool-input-start",
  "tool-call-streaming-start",
  "tool-input-delta",
]);

function replayParts(
  prefix: StreamPart[],
  iterator: AsyncIterator<StreamPart>
): ReadableStream<TextStreamPart<ToolSet>> {
  return new ReadableStream({
    async start(controller) {
      try {
        for (const part of prefix) {
          controller.enqueue(part as TextStreamPart<ToolSet>);
        }
        while (true) {
          const step = await iterator.next();
          if (step.done) break;
          controller.enqueue(step.value as TextStreamPart<ToolSet>);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

async function handlePOST(req: Request) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const limit = await takeDurableRateLimit(`chat:${auth.user.id}`, 30, 5 * 60_000);
  if (!limit.ok) {
    return rateLimitJson(
      limit,
      "You're sending messages faster than Margus can keep up. Give it a few seconds."
    );
  }
  stampAdvisorUse(auth.user.id);
  markChatActive();

  try {
    // A chat turn carries screenshots, so it needs its own body budget
    // rather than the 1 MB every other route gets. The browser compresses
    // to a smaller number still, so the two cannot drift: `chat-limits.ts`.
    const parsed = await parseJsonBody(req, chatPostSchema, {
      maxBytes: CHAT_MAX_BODY_BYTES,
    });
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    // Charged by what the turn weighs, not by the fact that it happened.
    // Counting turns cannot tell a one-line question from a megabyte of
    // image, and the model is billed for the difference.
    const weight = await takeDurableRateLimitWeighted(
      `chat-kb:${auth.user.id}`,
      CHAT_BYTE_BUDGET_KB,
      CHAT_BYTE_WINDOW_MS,
      Math.max(1, Math.ceil(parsed.bytes / 1024))
    );
    if (!weight.ok) {
      return rateLimitJson(
        weight,
        "That is a lot of pictures at once. Give Margus a few minutes to catch up."
      );
    }
    const messages = Array.isArray(body.messages)
      ? (body.messages as UIMessage[])
      : [];
    const ccContext = (
      isRecord(body.ccContext)
        ? body.ccContext
        : {
            portfolioName: "Portfolio",
            cashBalance: 0,
            holdings: [],
            rows: [],
            totals: {
              cost: 0,
              value: 0,
              roiPct: 0,
              roiDollar: 0,
              yield2wAvg: 0,
              premiumTotal: 0,
            },
          }
    ) as CcChatContext;

    const vision = messagesHaveImages(messages);
    const adviseOnly = Boolean(ccContext.adviseOnly);
    const calendarTickers = [
      ...ccContext.holdings.map((h) => h.ticker),
      ...(ccContext.watchlist ?? []),
    ]
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 16);
    if (calendarTickers.length > 0) {
      try {
        const contexts = await fetchPulseContexts(calendarTickers);
        ccContext.earnings = calendarTickers.map((ticker) => {
          const ctx = contexts[ticker];
          return {
            ticker,
            lastDate: ctx?.lastEarningsDate ?? null,
            daysSinceLast: ctx?.daysSinceLastEarnings ?? null,
            nextDate: ctx?.nextEarningsDate ?? null,
            daysUntilNext: ctx?.daysUntilNextEarnings ?? null,
            nextIsEstimate: ctx?.nextIsEstimate,
          };
        });
      } catch (err) {
        console.error("[chat] earnings calendar failed", err);
      }
    }
    const tools = adviseOnly
      ? undefined
      : buildCcAdvisorTools(
          {
            eurUsd: ccContext.eurUsd ?? null,
            gbpUsd: ccContext.gbpUsd ?? null,
          },
          { hideOptions: Boolean(ccContext.hideOptions) }
        );

    const providerChain = buildAdvisorProviderChain({
      vision,
      speaking: true,
    });
    if (providerChain.length === 0) {
      return fallbackChatResponse(vision);
    }
    const cacheKey = vision ? "chat:vision" : "chat:text";
    const modelMessages = await convertToModelMessages(messages, { tools });
    const tried = new Set<string>();

    while (tried.size < providerChain.length) {
      let provider;
      try {
        provider = pickStreamingProvider(providerChain, cacheKey);
      } catch (err) {
        console.error("[chat] no streaming provider available", err);
        break;
      }
      if (tried.has(provider.id)) break;
      tried.add(provider.id);

      try {
        const result = streamText({
          model: provider.model,
          system: buildCcSystemPrompt(ccContext),
          messages: modelMessages,
          tools,
          providerOptions: {
            openrouter: {
              reasoning: { effort: "low", max_tokens: vision ? 400 : 128 },
            },
            openai: { reasoningEffort: "low" },
          },
          ...(vision && !adviseOnly ? { toolChoice: "required" as const } : {}),
          stopWhen: stepCountIs(adviseOnly ? 3 : vision ? 8 : 6),
          maxRetries: 1,
          abortSignal: req.signal,
          onError: ({ error }) => {
            console.error(`[chat] provider "${provider.id}" stream error`, error);
            invalidateStreamingProvider(cacheKey);
            if (isTransientAdvisorFailure(error)) {
              markProviderUnhealthy(provider.id);
            }
          },
        });

        const peeked = await peekUntilUseful(result.fullStream, USEFUL_PART);
        if (!peeked.ok) {
          if (peeked.reason === "leak") {
            /*
              Not an unhealthy provider, so it is not marked as one: the
              model answered, it just narrated its own reasoning first, and
              it will answer the next question perfectly well. Measured at
              about one plain question in six on the free tier. Try the next
              provider rather than showing somebody the inside of the prompt.
            */
            console.error(`[chat] provider "${provider.id}" leaked its reasoning`);
            invalidateStreamingProvider(cacheKey);
            continue;
          }
          console.error(`[chat] provider "${provider.id}" died before the first token`);
          invalidateStreamingProvider(cacheKey);
          markProviderUnhealthy(provider.id);
          continue;
        }

        rememberStreamingProvider(cacheKey, provider);
        return createUIMessageStreamResponse({
          stream: toUIMessageStream({
            stream: replayParts(peeked.prefix, peeked.iterator),
            tools,
            onError: () =>
              vision ? FALLBACK_SCREENSHOT_TEXT : FALLBACK_CHAT_TEXT,
          }),
          /*
           * Which model is about to write the reply, named on the response
           * that carries it. The eye beside Margus reads these back, so it
           * can say who answered rather than "a language model". It has to
           * be a header: the chain picks a provider per request and walks
           * past a rate-limited one, so the client cannot know from a
           * config which model it is really talking to.
           */
          headers: {
            "x-model-provider": provider.id,
            "x-model-id": provider.modelId,
          },
        });
      } catch (err) {
        console.error(`[chat] provider "${provider.id}" failed to start`, err);
        invalidateStreamingProvider(cacheKey);
        markProviderUnhealthy(provider.id);
        if (req.signal.aborted) throw err;
      }
    }

    return fallbackChatResponse(vision);
  } catch (err) {
    console.error("[chat]", err);
    return fallbackChatResponse();
  }
}

export const POST = observeRoute(handlePOST, '/api/chat');
