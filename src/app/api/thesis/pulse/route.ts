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
  candidateRange,
  rangeWindowWords,
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
  isSharedPulseKey,
  setCachedPulseCheck,
  getCachedPulseSummary,
  setCachedPulseSummary,
} from "@/lib/thesis-pulse-server-cache";
import { pulseReportSchema } from "@/lib/thesis-pulse-schema";
import { moodLine, safeMoveLabel } from "@/lib/pulse-shared-prompt";
import { generateObject } from "ai";
import { observeRoute } from "@/lib/observe-route";
import { pulsePostSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";
import { coinFromSymbol } from "@/lib/coins";
import { cashtag } from "@/lib/format";
import { serverAnchorPrices } from "@/lib/forecast-ticker-cache-store";

export const maxDuration = 90;
export const runtime = "nodejs";

/**
 * Absolute deadline measured from handler start, so the news/earnings
 * context fetch above counts against it too. Leaves headroom under
 * maxDuration to still return JSON rather than being killed mid-flight.
 */
const LLM_BUDGET_MS = 70_000;

/**
 * How far the price a shared Pulse answer was reasoned from may sit from
 * the market's own before that answer is kept to the reader who asked.
 *
 * Not a validation bound: a reader holding a slightly stale price is
 * ordinary, and they are served their own answer either way. This is the
 * gate on what becomes everybody's, and it is the same figure the forecast
 * cache uses for the same reason.
 */
const PUBLISHABLE_PRICE_DRIFT = 0.02;

type Body = {
  candidates?: PulseCandidate[];
  convictions?: Record<string, { thesis?: string; level?: number }>;
  fearGreed?: { score?: number; rating?: string } | null;
  force?: boolean;
};

type CachedPulse = {
  check: PulseCheck;
  headlines: PulseHeadline[];
  /** Carried from the cache entry so the mark can name the right run. */
  writtenBy?: { provider: string; model: string } | null;
  checkedAt?: string;
};

function checksForCandidates(
  candidates: PulseCandidate[],
  cachedMap: Map<string, CachedPulse>,
  headlines: Record<string, PulseHeadline[]>
): PulseCheck[] {
  return candidates.map((c) => {
    const symbol = pulseTickerKey(c.ticker);
    const cached = cachedMap.get(symbol);
    if (cached && !isEmptyPulseCheck(cached.check)) {
      return reconcilePulseCheck({
        ...cached.check,
        writtenBy: cached.writtenBy ?? cached.check.writtenBy ?? null,
        checkedAt: cached.checkedAt ?? cached.check.checkedAt,
      });
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
  // Built from the score alone. See `pulse-shared-prompt.ts`: this line sits
  // above every company in the request, including ones cached under the
  // shared key and handed to other readers, so no word in it may be the
  // caller's.
  const fg = moodLine(fearGreed);

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
    // The range is measured from the closes the quote carries
    // (`recentRange`), and it is handed over as numbers because the model
    // is asked to tag a price against a range. It used to be asked that
    // with no high and no low anywhere in the prompt, and the app printed
    // the answer as "Below recent range" all the same.
    const range = candidateRange(c);
    const rangeLine = range
      ? ` · ${rangeWindowWords(range.days)} low $${range.low.toFixed(2)} · high $${range.high.toFixed(2)}`
      : " · (no measured range for this one)";
    const parts = [
      `- **${name}** · today's price $${c.price.toFixed(2)}${rangeLine} · ${safeMoveLabel(c.moveLabel)} ${move}${flag}${position}`,
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

  /*
    No house market view goes in this prompt.

    Two bullets used to sit in the action-tag section telling the model that
    a red day on a chip maker, an AI computer builder or a data-centre power
    company was an "add" rather than a hold, and that on a screen of intact
    dips most names should be tagged "add". Both were a house opinion about
    which businesses are worth buying into weakness, and the reader never
    saw it as one: the add tag renders as the badge "Below recent range",
    which is a claim about the measured low and high printed on the same
    card. A name sitting mid-range on an ordinary red day was labelled as
    being below a range it was not below.

    AGENTS.md forbids a house view in a persona or a prompt, for the same
    reason it forbids per-ticker baselines: it reaches every reader,
    including one whose whole portfolio is an index fund. This was one in
    the surface where it is hardest to see, because the output is rendered
    as a measurement. If a red day on an intact name deserves a distinct
    reading it belongs in thesisStatus, which is not rendered as a
    statement about the range.
  */
  return `${MARGUS_PERSONA}

## Task: Pulse
The reader opens this when something they own has moved a lot in one day. What they want is a factual read: where the price sits against its recent range, and whether the reason they own it still matches what the company is doing.

Primary job: **moves of 5% or more, up or down** (including pre-market and after-hours). Larger holdings are also covered, for context.

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

### The range is measured, not yours to guess
Every position below carries a low and a high taken from its own closing prices over the window named beside them. Those two numbers are printed on the card next to today's price, so the tag you choose has to agree with them: **add** means today's price is near the low end, **trim** means it is near the high end, **hold** means it is somewhere in the middle. A position whose line says there is no measured range gets **hold** or **watch**, never a range tag, because the reader has no low and high on screen to check it against.

### Action tags (internal codes, never print them as orders)
- **action** = \`add\` | \`hold\` | \`trim\` | \`sell\` | \`watch\`. These are tags for the app. Verdict and addLevel must describe price or thesis facts, never orders.
- **trim** and **sell** are opposites in spirit, don't blur them:
  - **trim** = the price is above its recent range. The reason they own it is **intact**. A run-up is the story working. Never mark Thesis watch just because the price went up.
  - **sell** = the reason they own it is actually **broken**. The facts no longer match that reason, not because it went up too much.
- If a line ran hard and the reason is still intact: tag **trim**, put the size in trimPct only, and set thesisStatus to **intact**. Not a warning. Never write that size into verdict.
- **addLevel**: always give a concrete, self-explanatory price fact when the reason is intact or action is add. Never write orders.
  - \`A level to think about: around $X\` when spot already looks like a dip (e.g. after a 5-10% drop).
  - Or \`A level to think about: around $X. Then another look if it drops to around $Y\` where Y is **realistic** (about 5-12% under spot, not fantasy). Spell out that Y is a second, lower level, never bare jargon like "stagger below".
  - Example RKLB around $80 after a 7% after-hours drop: \`A level to think about: around $80. Then another look if it drops to around $72\`, NOT "wait for $50". Never write "Add now".
- Use **hold** only when the price is inside a normal range and the reason is intact. Hold never pairs with a broken reason.
- Use **sell** only when thesisStatus is broken. Never use **trim** for a broken reason. Never use **hold** for a broken reason either: that's what puts an Inside recent range badge next to "Thesis broken".

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

### How every field here is written
These cards are the app's plainest writing after the Sunday letter, and they are read by people who have never worked in finance. Short does not mean clipped: a fragment that saves four words and costs the reader the meaning is the worst trade on this screen.
- Whole sentences with an ordinary subject and verb. "No news came out of the company today" is a sentence. "Nothing came out of the company today" is a riddle. "Down more than a typical day. The stated reason is a separate fact." is two labels, not two sentences.
- Say the fact first and what it means second, in that order, in the words somebody would use out loud.
- Name what you are pointing at. Never let "the stated reason", "the setup", "the read" or "the move" stand alone as an abstraction: write "the reason you own it", "the price", "the company".
- Every card in one report answers the same questions in the same order, because the reader is comparing them down the page. Vary the wording, never the shape.

For **each** ticker:
1. **situation**: 2-4 bullets, one plain sentence each (under ~18 words), grounded in the headlines. No preamble bullet, no summary bullet, no paragraphs. Unique to this name.
2. **moveReason**: one complete sentence saying why the price moved, citing the headline when there is one. Unique to this name. Do not end it with a period.
3. **thesisBreak**: one or two short sentences naming the actual thing that would kill why they own THIS name (a customer, a product, a filing, a launch). Use their "why they own it" note when they wrote one. Empty string if you cannot name something specific. Never a generic lost-customer / restatement / "quiet day is not that" line that could sit on every card.
4. **thesisStatus**: intact / watch / broken, scored against thesisBreak and today's facts. Default intact.
5. **action**: add / hold / trim / sell / watch per rules above.
6. **trimPct**: only when action=trim, choose 10, 15, 20, 25, 30 (% of position). Never set for sell.
7. **addLevel**: price trigger string (required for add; required for intact+down; empty for trim/sell).
8. **earningsNote**: if relevant; else empty string.
9. **verdict**: one sentence on why THIS name moved (headline, business, size of the move). A price or thesis fact, never an order. Unique in this report. Never write do not add, sell some, look to add, trim 10%, add the dip, keep an eye, or any percent of the position as something to do. The app already shows the range tag.

**summary**: one short sentence on the portfolio as a whole, you/your. Name the 5% movers (up or down) and whether any tag left Inside recent range. Do not recap one ticker's news. That belongs on the card. Do not start with "the sharp drop". Verdicts use the same voice. Never "the user" or "this person". Never we/us/our.

If the owner didn't write why they own it, still pick action and thesisStatus from headlines and today's prices. Never ask them to write a note. Never say you are guessing. Never say "tape".

Keep every field to the length above, and keep every one of them a sentence a person would say out loud. Use the headlines, don't invent news.

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
        writtenBy: cachedEntry.writtenBy,
        checkedAt: new Date(cachedEntry.cachedAt).toISOString(),
      });
    }
    /*
      `force` exists so a reader can re-ask about their own company, and on
      a shared key it is a write into the answer every other holder of that
      company is about to be given. So it re-asks only where the answer is
      this reader's own. A stale shared entry still ages out on its own.
    */
    const mayForce = force && !isSharedPulseKey(cacheKey);
    if (!cachedEntry || mayForce || isEmptyPulseCheck(cachedEntry?.check)) {
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
    // answers, because the mark on each card names it.
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

    /*
      Asked once, for the whole batch, and only for the names that could be
      written to a shared key. fetchQuotesWithFallback single-flights an
      identical set, so this is one provider round trip at most.
    */
    const serverPrices = await serverAnchorPrices(
      uncachedCandidates.map((c) => pulseTickerKey(c.ticker))
    );

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
      /*
        A shared answer is only written when the numbers behind it were the
        market's, not the caller's.

        `price`, `rangeLow` and `rangeHigh` all arrive in the request body
        and are printed into the prompt as the facts the model reasons
        against: "today's price $X, 30 day low $Y, high $Z". A caller can
        state a price that puts a company at the bottom of a range it is
        nowhere near, and under the shared `:nothesis` key that answer is
        served to every other holder of the company in the same move bucket
        for up to four hours. The earlier pass took the two text fields out
        of the caller's hands for exactly this reason and left the numbers,
        which are the part the tag is actually derived from.

        Correcting them is the wrong fix: they are one consistent set with
        the reader's own screen, and a reader holding a slightly stale price
        is ordinary rather than hostile. So the reader is served their own
        answer either way, and only a run whose price agrees with the
        market's is allowed to become everybody's. This is the same rule the
        forecast cache uses, and the same tolerance.
      */
      const trusted = serverPrices[symbol];
      const priceAgrees =
        typeof trusted === "number" &&
        trusted > 0 &&
        Math.abs(candidate.price - trusted) / trusted <= PUBLISHABLE_PRICE_DRIFT;
      if (!isSharedPulseKey(cacheKey) || priceAgrees) {
        setCachedPulseCheck(
          cacheKey,
          check,
          headlines[symbol] ?? [],
          candidate.effectivePct,
          answeredBy
        );
      }
      cachedMap.set(symbol, {
        check,
        headlines: headlines[symbol] ?? [],
        writtenBy: answeredBy,
        checkedAt: new Date().toISOString(),
      });
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
