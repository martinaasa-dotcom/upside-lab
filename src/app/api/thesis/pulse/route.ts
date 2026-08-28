import {
  beginBackgroundLlm,
  chatIsBusy,
  endBackgroundLlm,
} from "@/lib/ai/llm-slots";
import {
  STRUCTURED_PROVIDER_OPTIONS,
  buildAdvisorProviderChain,
  modelIdFor,
  withAdvisorFallback,
} from "@/lib/ai/model";
import type { ModelRun } from "@/lib/ai/model-label";
import { humanizeMargusTree, humanizeMargusText } from "@/lib/ai/humanize-copy";
import { MARGUS_PERSONA } from "@/lib/ai/margus-persona";
import { insightsPromptBlock } from "@/lib/book-insights";
import { fetchPulseContexts } from "@/lib/market/ticker-context";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { takeDurableRateLimit } from "@/lib/rate-limit-durable";
import { stampAdvisorUse } from "@/lib/advisor-use";
import {
  buildFallbackPulseCheck,
  formatMovePct,
  isBigPulseMove,
  isEmptyPulseCheck,
  pulseTickerKey,
  reconcilePulseCheck,
  type PulseCheck,
  type PulseCandidate,
  type PulseHeadline,
  type PulseReport,
} from "@/lib/thesis-pulse";
import {
  getCachedPulseCheck,
  getPulseCacheKey,
  setCachedPulseCheck,
  getCachedPulseSummary,
  setCachedPulseSummary,
} from "@/lib/thesis-pulse-server-cache";
import { pulseReportSchema } from "@/lib/thesis-pulse-schema";
import { generateObject } from "ai";
import { observeRoute } from "@/lib/observe-route";
import { pulsePostSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";
import { coinFromSymbol } from "@/lib/coins";
import { NO_VALUE, cashtag } from "@/lib/format";

export const maxDuration = 90;
export const runtime = "nodejs";

/**
 * Absolute deadline measured from handler start, so the news/earnings
 * context fetch above counts against it too. Leaves headroom under
 * maxDuration to still return JSON rather than being killed mid-flight.
 */
const LLM_BUDGET_MS = 70_000;

type Body = {
  candidates?: PulseCandidate[];
  convictions?: Record<string, { thesis?: string; level?: number }>;
  fearGreed?: { score?: number; rating?: string } | null;
  force?: boolean;
};

type CachedPulse = { check: PulseCheck; headlines: PulseHeadline[] };

function checksForCandidates(
  candidates: PulseCandidate[],
  cachedMap: Map<string, CachedPulse>,
  headlines: Record<string, PulseHeadline[]>
): PulseCheck[] {
  return candidates.map((c) => {
    const symbol = pulseTickerKey(c.ticker);
    const cached = cachedMap.get(symbol);
    if (cached && !isEmptyPulseCheck(cached.check)) {
      return reconcilePulseCheck(cached.check);
    }
    headlines[symbol] = headlines[symbol] ?? [];
    return reconcilePulseCheck(buildFallbackPulseCheck(c));
  });
}

function reuseCachedPulse(
  userId: string,
  candidates: PulseCandidate[],
  cachedMap: Map<string, CachedPulse>,
  headlines: Record<string, PulseHeadline[]>
) {
  const report: PulseReport = {
    summary: humanizeMargusText(getCachedPulseSummary(userId) ?? ""),
    checks: checksForCandidates(candidates, cachedMap, headlines),
    generatedAt: new Date().toISOString(),
  };
  return Response.json({ report, headlines, reused: true });
}

function newsBlock(headlines: PulseHeadline[]): string {
  if (headlines.length === 0) return "  (no recent headlines fetched)";
  return headlines
    .map(
      (h) =>
        `  · ${h.title} (${h.publisher}, ${h.publishedAt.slice(0, 10)})`
    )
    .join("\n");
}

function buildPrompt(
  candidates: PulseCandidate[],
  contexts: Awaited<ReturnType<typeof fetchPulseContexts>>,
  convictions: Body["convictions"],
  fearGreed: Body["fearGreed"]
): string {
  const fg =
    fearGreed?.score != null
      ? `Market mood: CNN Fear & Greed ${Math.round(fearGreed.score)} (${fearGreed.rating ?? NO_VALUE}).`
      : "Market mood: unknown.";

  const lines = candidates.map((c) => {
    const ctx = contexts[c.ticker.toUpperCase()];
    const conv = convictions?.[c.ticker.toUpperCase()];
    const move = formatMovePct(c.effectivePct);
    const bookPct = (c.bookPct * 100).toFixed(1);
    const roiPct = (c.roiPct * 100).toFixed(0);
    // With no thesis written, this ticker's answer is cached under the
    // shared "nothesis" key (getPulseCacheKey) and can be served to any
    // other holder of the same name in the same move bucket. So keep this
    // holder's own position size and lifetime return out of the prompt —
    // otherwise a generated line could echo one person's numbers to
    // another. A written thesis makes the key private again.
    const sharedAnswer = !conv?.thesis;
    const position =
      !c.inBook
        ? " · (lookup, not in the portfolio)"
        : sharedAnswer
          ? " · (in their portfolio)"
          : ` · ${bookPct}% of the portfolio · lifetime ROI ${roiPct}%`;
    const flag = isBigPulseMove(c.effectivePct)
      ? c.needsAttention
        ? " **NEEDS ATTENTION: down ≥5%**"
        : " **NEEDS ATTENTION: up ≥5%**"
      : "";
    const shown = coinFromSymbol(c.ticker);
    const name = shown
      ? `${shown.name} (${cashtag(c.ticker)})`
      : c.ticker;
    const parts = [
      `- **${name}** · spot $${c.price.toFixed(2)} · ${c.moveLabel} ${move}${flag}${position}`,
      conv?.thesis ? `  Thesis: ${conv.thesis}` : "",
      conv?.level ? `  How sure they are: ${conv.level}/5` : "",
      ctx?.sector ? `  Sector: ${ctx.sector}` : "",
      "  Recent headlines:",
      newsBlock(ctx?.news ?? []),
    ];
    if (ctx?.lastEarningsDate) {
      parts.push(
        `  Last earnings: ${ctx.lastEarningsDate}${ctx.daysSinceLastEarnings != null ? ` (${ctx.daysSinceLastEarnings}d ago)` : ""}${ctx.lastSurprisePct != null ? ` · surprise ${ctx.lastSurprisePct.toFixed(0)}%` : ""}`
      );
    }
    if (ctx?.nextEarningsDate && (ctx.daysUntilNextEarnings ?? 99) >= 0) {
      parts.push(
        `  Next earnings: ${ctx.nextEarningsDate} (in ${ctx.daysUntilNextEarnings}d)`
      );
    }
    return parts.filter(Boolean).join("\n");
  });

  return `${MARGUS_PERSONA}

## Task: Pulse
Martin uses this when a **big line moves hard**. He wants a factual read: where the price sits vs its recent range, and whether the stated reason still matches.

Primary job: **moves of 5% or more, up or down** (including pre-market / after-hours). Also covers other big book lines for context.

${fg}

${insightsPromptBlock(
    candidates
      .filter((c) => c.inBook)
      .map((c) => ({
        ticker: c.ticker,
        value: c.currentValue,
        todayPct: c.effectivePct,
      }))
  )}

### Action tags (internal codes, never print them as orders)
- **action** = \`add\` | \`hold\` | \`trim\` | \`sell\` | \`watch\`. These are tags for the app. Verdict and addLevel must describe price or thesis facts, never orders.
- **trim** and **sell** are opposites in spirit, don't blur them:
  - **trim** = the price is above its recent range. The reason they own it is **intact**. A run-up is the story working. Never mark Thesis watch just because the price went up.
  - **sell** = the reason they own it is actually **broken**. The facts no longer match that reason, not because it went up too much.
- **intact reason + red day** on a name they are very sure about (AI computer builders, chip makers, electricity for data centers, space, or any name whose multi-year story is unbroken): tag **add**, not hold. A quiet down day that didn't break the multi-year story is a price below the recent range, not a trim signal. This is about why they own it, not a fixed ticker list; apply it to whatever the user actually holds.
- If a line ran hard and the reason is still intact: tag **trim**, put the size in trimPct only, and set thesisStatus to **intact**. Not a warning. Never write that size into verdict.
- **addLevel**: always give a concrete, self-explanatory price fact when the reason is intact or action is add. Never write orders.
  - \`A level to think about: around $X\` when spot already looks like a dip (e.g. after a 5-10% drop).
  - Or \`A level to think about: around $X. Then another look if it drops to around $Y\` where Y is **realistic** (about 5-12% under spot, not fantasy). Spell out that Y is a second, lower level, never bare jargon like "stagger below".
  - Example RKLB around $80 after a 7% after-hours drop: \`A level to think about: around $80. Then another look if it drops to around $72\`, NOT "wait for $50". Never write "Add now".
- Use **hold** only when the price is inside a normal range and the reason is intact. Hold never pairs with a broken reason.
- Use **sell** only when thesisStatus is broken. Never use **trim** for a broken reason. Never use **hold** for a broken reason either: that's what puts an Inside recent range badge next to "Thesis broken".
- On a screen with multiple intact dips, **most** names should be tagged **add**, not all hold.

### thesisStatus: start from intact. Watch and broken have to be earned
- Write **thesisBreak** only if you can name a real, name-specific reason this holding would stop making sense. Otherwise leave it empty and still score intact / watch / broken from headlines.
- Then look at today's headlines and the move. **intact** unless those facts actually match that reason (watch) or show it already happened (broken).
- **intact**: the reason you own it hasn't changed. A normal red or green day, a name that ran, sector-wide noise, taking a little profit, or after-hours drift are NOT breaks. If you are trimming into strength, thesisStatus MUST be intact.
- **watch**: something on the break list is starting to show up (a soft quarter, a competitive wrinkle, a guidance nuance) but the core story still holds. A green day is not watch.
- **broken**: the actual reason you bought this is gone. Guidance genuinely cut, the staying power is disproven, fraud or a restatement, the multi-year story is over. This is rare. **broken must pair with action=sell, nothing else.** If you'd still hold it, the reason isn't broken, it's at most "watch".
- Do not mark watch or broken just because you mentioned a risk. The risk has to be happening now.

### Today's scan (verdict is the line they read first)
The app lists one line per name that moved. **Never reuse a sentence across tickers.** Verdict, moveReason, and situation bullets must each be unique in this report. A reader should know which company you mean without seeing the ticker.

If two names both ran, say why THIS one ran: the actual headline, the business (ads vs GPU cloud vs chips), the size of the move. Do not stamp "looks like a chase, not a new story" or "this is a dip, not a break" on a second name. Those lines are only allowed if they are true AND you have not already used them.

Name something specific: a headline, a customer, a product, a percent, a price.

For **each** ticker:
1. **situation**: 2-4 bullets, one short line each (under ~18 words), grounded in the headlines. No preamble bullet, no summary bullet, no paragraphs. Unique to this name.
2. **moveReason**: one sentence (cite headline when possible). Unique to this name. Do not end it with a period.
3. **thesisBreak**: one or two short sentences naming the actual thing that would kill why they own THIS name (a customer, a product, a filing, a launch). Use their "why they own it" note when they wrote one. Empty string if you cannot name something specific. Never a generic lost-customer / restatement / "quiet day is not that" line that could sit on every card.
4. **thesisStatus**: intact / watch / broken, scored against thesisBreak and today's facts. Default intact.
5. **action**: add / hold / trim / sell / watch per rules above.
6. **trimPct**: only when action=trim, choose 10, 15, 20, 25, 30 (% of position). Never set for sell.
7. **addLevel**: price trigger string (required for add; required for intact+down; empty for trim/sell).
8. **earningsNote**: if relevant; else empty string.
9. **verdict**: one sentence on why THIS name moved (headline, business, size of the move). A price or thesis fact, never an order. Unique in this report. Never write do not add, sell some, look to add, trim 10%, add the dip, keep an eye, or any percent of the position as something to do. The app already shows the range tag.

**summary**: one short sentence on the portfolio as a whole, you/your. Name the 5% movers (up or down) and whether any tag left Inside recent range. Do not recap one ticker's news. That belongs on the card. Do not start with "the sharp drop". Verdicts use the same voice. Never "the user" or "this person". Never we/us/our.

If the owner didn't write why they own it, still pick action and thesisStatus from headlines and today's prices. Never ask them to write a note. Never say you are guessing. Never say "tape".

Keep fields short. Use the headlines, don't invent news.

## Positions
${lines.join("\n\n")}`;
}

async function handlePOST(req: Request) {
  const startedAt = Date.now();
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const parsed = await parseJsonBody(req, pulsePostSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data as Body;
  const candidates = body.candidates ?? [];
  if (candidates.length === 0) {
    return Response.json(
      { error: "No pulse candidates supplied" },
      { status: 400 }
    );
  }

  const force = Boolean(body.force);
  const convictions = body.convictions ?? {};

  const cachedMap = new Map<string, CachedPulse>();
  const uncachedCandidates: PulseCandidate[] = [];

  for (const c of candidates) {
    const symbol = pulseTickerKey(c.ticker);
    const conv = convictions[symbol];
    const cacheKey = getPulseCacheKey(symbol, c.effectivePct, conv?.thesis, conv?.level);
    const cachedEntry = getCachedPulseCheck(cacheKey);
    if (cachedEntry && !isEmptyPulseCheck(cachedEntry.check)) {
      cachedMap.set(symbol, {
        check: cachedEntry.check,
        headlines: cachedEntry.headlines,
      });
    }
    if (!cachedEntry || force || isEmptyPulseCheck(cachedEntry?.check)) {
      uncachedCandidates.push(c);
    }
  }

  const headlines: Record<string, PulseHeadline[]> = {};
  for (const [symbol, cached] of cachedMap.entries()) {
    headlines[symbol] = cached.headlines;
  }

  if (uncachedCandidates.length === 0) {
    return reuseCachedPulse(auth.user.id, candidates, cachedMap, headlines);
  }

  const limit = await takeDurableRateLimit(`pulse:${auth.user.id}`, 12, 10 * 60_000);
  if (!limit.ok) {
    return reuseCachedPulse(auth.user.id, candidates, cachedMap, headlines);
  }

  const providerChain = buildAdvisorProviderChain({ reasoning: true });
  if (providerChain.length === 0) {
    return reuseCachedPulse(auth.user.id, candidates, cachedMap, headlines);
  }

  if (chatIsBusy() || !beginBackgroundLlm()) {
    return reuseCachedPulse(auth.user.id, candidates, cachedMap, headlines);
  }
  const heldSlot = true;
  stampAdvisorUse(auth.user.id);

  const uncachedTickers = uncachedCandidates.map((c) => pulseTickerKey(c.ticker));
  const contexts = await fetchPulseContexts(uncachedTickers, { force });
  for (const t of uncachedTickers) {
    headlines[t] = contexts[t]?.news ?? [];
  }

  try {
    const prompt = buildPrompt(
      uncachedCandidates,
      contexts,
      convictions,
      body.fearGreed ?? null
    );

    // The chain walks past a rate-limited provider, so the model that
    // answers is often not the one at its head. Recorded here as it
    // answers, because the eye on each card names it.
    let answeredBy: ModelRun | null = null;

    const { object } = await withAdvisorFallback(
      providerChain,
      (model, providerId, signal) => {
        answeredBy = {
          provider: providerId,
          model: modelIdFor(providerChain, providerId),
        };
        return generateObject({
          model,
          schema: pulseReportSchema,
          prompt,
          maxRetries: 1,
          abortSignal: signal ?? req.signal,
          providerOptions: STRUCTURED_PROVIDER_OPTIONS,
        });
      },
      { deadlineAt: startedAt + LLM_BUDGET_MS, signal: req.signal }
    );

    const modelChecks = (object.checks ?? []) as PulseCheck[];
    const newlyGeneratedMap = new Map<string, PulseCheck>();
    for (const check of modelChecks) {
      const key = pulseTickerKey(check.ticker);
      if (key) newlyGeneratedMap.set(key, check);
    }

    for (const candidate of uncachedCandidates) {
      const symbol = pulseTickerKey(candidate.ticker);
      const fromModel = newlyGeneratedMap.get(symbol);
      if (!fromModel) continue;
      const check = reconcilePulseCheck({
        ...fromModel,
        ticker: symbol,
        trimPct:
          fromModel.action === "trim" ? (fromModel.trimPct ?? null) : null,
      });

      const conv = convictions[symbol];
      const cacheKey = getPulseCacheKey(
        symbol,
        candidate.effectivePct,
        conv?.thesis,
        conv?.level
      );
      setCachedPulseCheck(
        cacheKey,
        check,
        headlines[symbol] ?? [],
        candidate.effectivePct
      );
      cachedMap.set(symbol, { check, headlines: headlines[symbol] ?? [] });
    }

    if (object.summary?.trim()) {
      setCachedPulseSummary(auth.user.id, object.summary);
    }

    const checks = checksForCandidates(candidates, cachedMap, headlines);

    const report: PulseReport = humanizeMargusTree({
      summary: object.summary || getCachedPulseSummary(auth.user.id) || "",
      checks,
      generatedAt: new Date().toISOString(),
      writtenBy: answeredBy,
    });

    return Response.json(
      {
        report,
        headlines,
        cachedCount: cachedMap.size - uncachedCandidates.length,
        freshCount: uncachedCandidates.length,
      },
      {
        headers: {
          // `private, no-store`: this response is per-user and the real
          // cache is the in-memory server one, not HTTP. The old header paired
          // `private` (shared caches must not store) with `s-maxage` (a
          // shared-cache-only directive), which contradicted itself.
          "Cache-Control": "private, no-store",
          "x-pulse-cache":
            cachedMap.size > uncachedCandidates.length ? "PARTIAL_HIT" : "MISS",
        },
      }
    );
  } catch (err) {
    console.error("Pulse report failed", err);
    return reuseCachedPulse(auth.user.id, candidates, cachedMap, headlines);
  } finally {
    if (heldSlot) endBackgroundLlm();
  }
}

export const POST = observeRoute(handlePOST, '/api/thesis/pulse');
