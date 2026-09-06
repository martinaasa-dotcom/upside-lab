/**
 * Request-body schemas for public API routes. Extra keys are allowed
 * (clients send leftover fields) but known fields are type-checked and
 * length-capped before any handler reads them.
 */
import { z } from "zod";
import {
  CHAT_MAX_IMAGE_CHARS,
  CHAT_MAX_MESSAGE_CHARS,
} from "@/lib/chat-limits";
import { CONVICTION_THESIS_MAX_CHARS } from "@/lib/conviction";

const id = z.string().trim().min(1).max(128);
const finite = z.coerce.number().finite();
const optionalFinite = finite.optional();
const nullableFinite = finite.nullable().optional();

/**
 * A number that arrived as a number. The coercing `finite` above is right
 * for a form field, where "12" is a twelve; it is wrong for a figure that
 * is printed straight into a prompt, where a `null` coerced to zero is a
 * loss of exactly 100% that nobody had.
 */
const num = z.number().finite();
const nullableNum = num.nullable();

/**
 * The shape `isPlausibleTicker` (`src/lib/ticker.ts`) puts on every path
 * that writes a holding, so a stored ticker always matches it. Read
 * case-insensitively: a row written before that check existed is still a
 * real holding, and refusing it would refuse the whole request it is in.
 */
const TICKER_RE = /^[A-Z0-9^=.][A-Z0-9.\-=]{0,23}$/i;
const ticker = z.string().trim().min(1).max(24).regex(TICKER_RE);

/** A ticker used as a record key: the same shape, without the trim. */
const tickerKey = z.string().min(1).max(24).regex(TICKER_RE);

/**
 * A watchlist entry, in the shape `sanitizeWatchlist` (`lib/lab-bundle.ts`)
 * already puts on one before it is stored. Shorter than a holding's ticker
 * and a different set of characters, so it is deliberately not the one
 * above: judging a watchlist by the holdings rule would refuse a name the
 * app itself wrote, and refuse the whole request it arrived in.
 */
const watchlistTicker = z.string().max(12).regex(/^[A-Z0-9.=^-]{1,12}$/i);

/**
 * One Pulse verdict the reader has already seen, stamped onto their note.
 * An unknown key is dropped rather than refused. The Lab save writes this
 * map into the row as it stands, so a leftover from an older build must
 * not be stored forever; but refusing it outright would be worse still,
 * because the browser treats a refused Lab save as a success, and the
 * reader's notes would then quietly stop syncing with nothing said.
 */
const pulseStampSchema = z.object({
  at: z.string().max(40).optional(),
  verdict: z.string().max(200).optional(),
  line: z.string().max(2000).optional(),
  action: z.string().max(24).optional(),
  thesisStatus: z.string().max(24).optional(),
});

/**
 * A conviction note as `setConviction` / `addPulseStamp` write it. Every
 * field is optional because a stamp can create the entry before the reader
 * has scored it, and anything outside these four is dropped on the way
 * past, for the reason above.
 */
export const convictionEntrySchema = z.object({
  level: z.number().int().min(1).max(5).optional(),
  thesis: z.string().max(CONVICTION_THESIS_MAX_CHARS).optional(),
  updatedAt: z.string().max(40).optional(),
  stamps: z.array(pulseStampSchema).max(16).optional(),
});

/**
 * Notes by ticker. Three routes take one and all three read this shape:
 * the Lab save writes it into the row, and Forecast and Pulse print the
 * level and the thesis straight into a prompt. A thesis is the reader's
 * own words going to a model, so its ceiling is the same one the editor
 * enforces rather than whatever fits in a request.
 */
export const convictionMapSchema = z.record(tickerKey, convictionEntrySchema);

export const holdingPostSchema = z.looseObject({
  portfolio_id: id,
  ticker: z.string().min(1).max(24),
  shares: finite,
  buy_price: finite,
  eoy_target: nullableFinite,
  target_call_pct: optionalFinite,
  stock_target_override: nullableFinite,
  sort_order: optionalFinite,
});

export const holdingPatchSchema = z.looseObject({
  id,
  ticker: z.string().min(1).max(24).optional(),
  shares: optionalFinite,
  buy_price: optionalFinite,
  eoy_target: nullableFinite,
  target_call_pct: optionalFinite,
  stock_target_override: nullableFinite,
  sort_order: optionalFinite,
});

export const holdingsImportSchema = z.looseObject({
  portfolio_id: id,
  cash: finite.nullable().optional(),
  replace: z.boolean().optional(),
  holdings: z.array(z.unknown()).max(500).optional(),
});

export const portfolioPostSchema = z.looseObject({
  name: z.string().min(1).max(120),
});

export const portfolioPatchSchema = z.looseObject({
  id,
  name: z.string().min(1).max(120).optional(),
  cash_balance: optionalFinite,
});

export const portfolioJoinSchema = z.looseObject({
  code: z.string().trim().min(12).max(256).optional(),
  token: z.string().trim().min(12).max(256).optional(),
});

export const portfolioInvitePostSchema = z.looseObject({
  email: z.string().trim().max(254).optional(),
  daysValid: optionalFinite,
});

export const portfolioOwnerPostSchema = z.looseObject({
  email: z.string().trim().min(3).max(254),
});

export const authMePatchSchema = z.looseObject({
  display_name: z.string().max(80).optional(),
  bio: z.string().max(280).nullable().optional(),
  avatar_url: z.string().max(500).nullable().optional(),
});

export const experienceTierPostSchema = z.looseObject({
  tier: z.enum(["novice", "investor", "advanced"]).optional(),
  knowsOptions: z.boolean().optional(),
  /**
   * Which walkthrough the reader has finished. Bounded rather than open so a
   * hostile client cannot park the row on a number no future version reaches
   * and opt itself out of every walkthrough there will ever be.
   */
  tourVersion: z.number().int().min(0).max(999).optional(),
});

/**
 * Adding another address that opens this account. `confirmed` is the reader
 * answering a "did you mean" question, so the address they typed goes through
 * as it stands rather than being corrected for them.
 */
export const accountAddressPostSchema = z.looseObject({
  email: z.string().max(254),
  confirmed: z.boolean().optional(),
});

/** Asking for a sign-in link. `confirmed` answers a "did you mean" question. */
export const emailLoginPostSchema = z.looseObject({
  email: z.string().max(254),
  confirmed: z.boolean().optional(),
  next: z.string().max(500).optional(),
});

export const accountAddressDeleteSchema = z.looseObject({
  id: z.string().uuid(),
});

export const weeklyNotePostSchema = z.looseObject({
  enabled: z.boolean().optional(),
  sunday: z.boolean().optional(),
});

export const labPutSchema = z.looseObject({
  conviction: convictionMapSchema.optional(),
  watchlist: z.array(z.string().max(12)).max(40).optional(),
  /*
    The price-plan edits, kept loose here and cleaned by `sanitizeLadders`
    on the way into the table: the shape is a map of tickers to a map of
    band ids, which a schema would have to restate and then drift from.
  */
  ladders: z.record(z.string().max(12), z.unknown()).optional(),
  updatedAt: z.string().max(40).optional(),
});

export const snapshotPostSchema = z.looseObject({
  action: z.enum(["create", "restore", "restore_sheet"]).optional(),
  snapshotId: id.optional(),
  id: id.optional(),
  portfolioId: id.optional(),
  label: z.string().max(120).optional(),
});

export const communityPostSchema = z.looseObject({
  name: z.string().trim().min(1).max(80),
  kind: z.string().max(32).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  startingCash: z.unknown().optional(),
  assignment: z.string().max(800).optional(),
  startPeriod: z.string().max(32).optional(),
});

export const communityPatchSchema = z.looseObject({
  name: z.string().max(80).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  autoApproveJoins: z.boolean().optional(),
  houseNote: z.string().max(800).optional(),
  classPlan: z.unknown().optional(),
  startPeriod: z.string().max(32).optional(),
  startingCash: z.unknown().optional(),
});

export const communityJoinPostSchema = z.looseObject({
  token: z.string().trim().min(12).max(128),
});

export const joinRequestPostSchema = z.looseObject({
  portfolioIds: z.array(z.string().max(128)).max(50).optional(),
});

export const joinRequestPatchSchema = z.looseObject({
  userId: id,
  decision: z.enum(["approve", "reject"]),
});

export const memberPatchSchema = z.looseObject({
  role: z.enum(["admin", "member"]),
});

export const duelPostSchema = z.looseObject({
  pick: z.enum(["a", "b"]),
});

export const communityInvitePostSchema = z.looseObject({
  email: z.string().max(2000).optional(),
  role: z.enum(["admin", "member"]).optional(),
  daysValid: z.union([z.string(), finite, z.null()]).optional(),
  /** Opt out of the 30-day default. A link that never ages out. */
  neverExpires: z.boolean().optional(),
});

export const communityInvitePatchSchema = z.looseObject({
  revoked: z.literal(true),
});

export const communitySheetsPostSchema = z.looseObject({
  portfolioId: id,
  shared: z.boolean().optional(),
});

export const feedbackPostSchema = z.looseObject({
  /**
   * The scheduled prompt is monthly. "weekly" is the name the old build
   * wrote, and an offline draft queued before the rename still replays
   * with it — keep accepting it.
   */
  kind: z.enum(["monthly", "weekly", "manual"]),
  feel: z.unknown().optional(),
  helped: z.unknown().optional(),
  blocked: z.unknown().optional(),
  change: z.unknown().optional(),
  changeNote: z.unknown().optional(),
  topic: z.unknown().optional(),
  body: z.unknown().optional(),
});

/*
 * A chat message as the ai SDK's `useChat` sends it: a role and a list of
 * parts. Text and file parts carry the size, so those two are bounded by
 * name; every other kind (a tool call, a reasoning trace, a step marker)
 * is only asked to say what it is, and the body cap bounds the rest. The
 * two bounded kinds are excluded from the catch-all, or a text part that
 * failed its bound would be accepted as an "other" part on the way past.
 * `content` is the older shape, a single string, still accepted.
 */
const textPartSchema = z.looseObject({
  type: z.literal("text"),
  text: z.string().max(CHAT_MAX_MESSAGE_CHARS),
});
/*
 * A picture the reader attached, and two bounds on it rather than one.
 * The address has to be a `data:` URL, so the only bytes a vision model
 * is ever handed are the ones that came up in this request: an ordinary
 * link would have the provider fetch something off the network on our
 * behalf, at an address whoever posted the body chose. And the media type
 * has to be an image, because that is the only kind of attachment Margus
 * is built to read. `fileToImagePart` (`lib/chat-images.ts`) builds every
 * one of these, and the tiny placeholder chat history keeps in place of a
 * stored screenshot is a `data:image/gif` too, so replayed turns pass.
 */
const filePartSchema = z.looseObject({
  type: z.literal("file"),
  mediaType: z.string().max(120).regex(/^image\//i),
  url: z.string().max(CHAT_MAX_IMAGE_CHARS).startsWith("data:"),
});
const otherPartSchema = z
  .looseObject({
    type: z.string().min(1).max(64),
    text: z.string().max(CHAT_MAX_MESSAGE_CHARS).optional(),
  })
  .refine((p) => p.type !== "text" && p.type !== "file");
const chatPartSchema = z.union([
  textPartSchema,
  filePartSchema,
  otherPartSchema,
]);

export const chatMessageSchema = z
  .looseObject({
    id: z.string().max(128).optional(),
    /*
     * A turn is the reader's or Margus's, and there is no third voice.
     * The ai SDK lays the messages from the body after the system prompt
     * this route builds, so a message posted as "system" would arrive
     * after Margus's own instructions and read as the later, winning word
     * on what he may say and which tools he may call. The browser never
     * sends one: `useChat` only ever holds user and assistant turns.
     */
    role: z.enum(["user", "assistant"]),
    content: z.string().max(CHAT_MAX_MESSAGE_CHARS).optional(),
    /*
     * Generous, because an assistant turn collects a part per tool call
     * and a screenshot import can write a whole portfolio in one, so the
     * count says nothing about the weight. What bounds the weight is the
     * per-part text ceiling above and the body cap around the lot.
     */
    parts: z.array(chatPartSchema).max(400).optional(),
  })
  .refine((m) => m.parts !== undefined || m.content !== undefined);

/*
 * The portfolio snapshot the browser sends with each turn. The prompt is
 * built from it verbatim, so every field is shaped here. Unknown keys are
 * dropped rather than refused: a cached Pulse check or a stored plan from
 * an older build may carry a field nobody reads any more, and a reader
 * should not lose Margus over a leftover in their own storage. Nothing
 * unshaped reaches the prompt either way.
 */
const chatHoldingSchema = z.object({
  ticker,
  shares: num,
  buyPrice: num,
  price: num,
  cost: num,
  value: num,
  roiPct: num,
  roiDollar: num,
  pctOfTotal: num,
  todayPct: nullableNum.optional(),
  portfolios: z.array(z.string().max(120)).max(20).optional(),
  marketState: z.string().max(24).nullable().optional(),
  preMarketPrice: nullableNum.optional(),
  preMarketChange: nullableNum.optional(),
  preMarketChangePercent: nullableNum.optional(),
  postMarketPrice: nullableNum.optional(),
  postMarketChange: nullableNum.optional(),
  postMarketChangePercent: nullableNum.optional(),
});

const chatCcRowSchema = z.object({
  ticker,
  spot: num,
  callPct: num,
  stockTarget: nullableNum.optional(),
  distance: nullableNum.optional(),
  nextStrike: nullableNum.optional(),
  contracts: num,
  yield2w: nullableNum.optional(),
  premium: nullableNum.optional(),
  expiration: z.string().max(40).nullable().optional(),
});

const chatTotalsSchema = z.object({
  cost: num,
  value: num,
  roiPct: num,
  roiDollar: num,
  yield2wAvg: num,
  premiumTotal: num,
});

const chatOtherPortfolioSchema = z.object({
  name: z.string().max(120),
  cashBalance: num,
  holdings: z
    .array(
      z.object({
        ticker,
        shares: num,
        buyPrice: num,
        callPct: num.optional(),
        stockTarget: nullableNum.optional(),
      })
    )
    .max(200),
});

/** The note Margus is shown: `Dashboard` trims it to level, thesis and stamps. */
const chatConvictionSchema = z.object({
  level: num.optional(),
  thesis: z.string().max(CONVICTION_THESIS_MAX_CHARS).optional(),
  stamps: z
    .array(
      z.object({
        at: z.string().max(40).optional(),
        line: z.string().max(2000).optional(),
        verdict: z.string().max(200).optional(),
      })
    )
    .max(16)
    .optional(),
});

/** A cached Pulse check. `situation` was one string before it was bullets. */
const chatPulseCheckSchema = z.object({
  ticker,
  situation: z
    .union([z.array(z.string().max(600)).max(8), z.string().max(2000)])
    .optional(),
  moveReason: z.string().max(1000).optional(),
  thesisStatus: z.string().max(24).optional(),
  earningsNote: z.string().max(1000).optional(),
  action: z.string().max(24).optional(),
  trimPct: nullableNum.optional(),
  addLevel: z.string().max(1000).optional(),
  verdict: z.string().max(1000).optional(),
  thesisBreak: z.string().max(1000).optional(),
});

const boundedRecord = <V extends z.ZodType>(value: V, max: number) =>
  z.record(tickerKey, value).refine((r) => Object.keys(r).length <= max);

const chatForecastPlanSchema = z.object({
  generalAdvice: z.string().max(4000).optional(),
  sectorRotation: z.string().max(4000).optional(),
  periods: z
    .array(
      z.object({
        label: z.string().max(120).optional(),
        theme: z.string().max(200).optional(),
        add: z.string().max(4000).optional(),
        trim: z.string().max(4000).optional(),
        notes: z.string().max(2000).optional(),
      })
    )
    .max(12)
    .optional(),
  eoyTargets: z
    .array(
      z.object({
        ticker,
        prices: z
          .record(z.string().max(4), num)
          .refine((p) => Object.keys(p).length <= 10),
        rationale: z.string().max(2000).optional(),
      })
    )
    .max(200)
    .optional(),
  generatedAt: z.string().max(40),
  portfolioId: z.string().max(128),
  portfolioName: z.string().max(120),
  stance: z.enum(["bearish", "base", "bullish"]).optional(),
  holdingsKey: z.string().max(8000).optional(),
  convictionKey: z.string().max(8000).optional(),
  fallback: z.boolean().optional(),
  writtenBy: z
    .object({
      provider: z.string().max(40).nullable().optional(),
      model: z.string().max(120).nullable().optional(),
    })
    .nullable()
    .optional(),
  reused: boundedRecord(z.string().max(40), 200).optional(),
});

export const ccContextSchema = z.object({
  portfolioName: z.string().max(120),
  cashBalance: num,
  holdings: z.array(chatHoldingSchema).max(200),
  rows: z.array(chatCcRowSchema).max(200),
  totals: chatTotalsSchema,
  otherPortfolios: z.array(chatOtherPortfolioSchema).max(20).optional(),
  adviseOnly: z.boolean().optional(),
  hideOptions: z.boolean().optional(),
  classroom: z.boolean().optional(),
  marketState: z.string().max(24).nullable().optional(),
  eurUsd: nullableNum.optional(),
  gbpUsd: nullableNum.optional(),
  watchlist: z.array(watchlistTicker).max(40).optional(),
  convictions: boundedRecord(chatConvictionSchema, 200).optional(),
  pulseByTicker: boundedRecord(chatPulseCheckSchema, 200).optional(),
  /*
   * A saved plan is decoration on the prompt and the message is the point,
   * so a stored plan from an older build that no longer fits this shape is
   * dropped rather than costing the reader the question they just typed.
   * Nothing unshaped reaches the prompt either way.
   */
  forecastPlan: chatForecastPlanSchema.nullable().optional().catch(null),
});

export const chatPostSchema = z.looseObject({
  messages: z.array(chatMessageSchema).max(40).optional(),
  ccContext: ccContextSchema.optional(),
});

/**
 * One row of the forecast grid, as `buildForecast` lays it out. The plan
 * builders read the ticker, the share count, the price, the value and
 * whether every year already has a target; the per-year maps ride along
 * bounded. A row without a ticker is a 400 here, where it used to reach
 * `r.ticker.toUpperCase()` in the route and come back as a 500.
 */
const forecastYearKey = z.string().max(4);
const forecastRowSchema = z.object({
  ticker,
  shares: finite,
  currentPrice: finite,
  currentValue: finite,
  eoyPrices: z.record(forecastYearKey, finite).optional(),
  eoyValues: z.record(forecastYearKey, finite).optional(),
  targetedYears: z.record(forecastYearKey, z.boolean()).optional(),
  gainPct: finite.nullable().optional(),
  hasTargets: z.boolean().optional(),
});

export const forecastPostSchema = z.looseObject({
  portfolioId: id,
  portfolioName: z.string().max(120).optional(),
  cashBalance: optionalFinite,
  forecast: z.looseObject({
    rows: z.array(forecastRowSchema).min(1).max(200),
    currentTotal: finite.optional(),
  }),
  convictions: convictionMapSchema.optional(),
});

export const pulsePostSchema = z.looseObject({
  candidates: z
    .array(
      z.looseObject({
        ticker: z.string().min(1).max(24),
        shares: optionalFinite,
        buyValue: optionalFinite,
        currentValue: optionalFinite,
        roiPct: optionalFinite,
        roiDollar: optionalFinite,
        todayDollar: optionalFinite,
        bookPct: optionalFinite,
        portfolios: z.array(z.string().max(80)).max(20).optional(),
        price: optionalFinite,
        regularPct: finite.nullable().optional(),
        extendedPct: finite.nullable().optional(),
        effectivePct: finite.nullable().optional(),
        moveLabel: z.string().max(80).optional(),
        moveSource: z.string().max(40).optional(),
        needsAttention: z.boolean().optional(),
        isBigMove: z.boolean().optional(),
        inBook: z.boolean().optional(),
      })
    )
    .min(1)
    .max(50),
  convictions: convictionMapSchema.optional(),
  fearGreed: z.unknown().nullable().optional(),
  force: z.boolean().optional(),
});

export const optionsScanPostSchema = z.looseObject({
  positions: z.array(z.unknown()).max(50).optional(),
});

export const trendsPostSchema = z.looseObject({
  tickers: z.array(z.string().max(24)).max(40).optional(),
  force: z.boolean().optional(),
});

export const navHistoryPostSchema = z.looseObject({
  assumed: z.boolean().optional(),
  cash: optionalFinite,
  positions: z
    .array(
      z.looseObject({
        ticker: z.string().max(24).optional(),
        shares: optionalFinite,
      })
    )
    .max(50)
    .optional(),
  includeSpy: z.boolean().optional(),
  portfolioIds: z.array(z.string().max(128)).max(50).optional(),
});

export const logErrorPostSchema = z.looseObject({
  message: z.string().trim().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  digest: z.string().max(200).optional(),
  path: z.string().max(500).optional(),
  context: z.unknown().optional(),
});

export const telemetryPostSchema = z.looseObject({
  event: z.literal("web_vital"),
  name: z.string().trim().min(1).max(40),
  value: finite,
  rating: z.string().max(40).optional(),
  id: z.string().max(120).optional(),
  navigationType: z.string().max(40).optional(),
  delta: optionalFinite,
  path: z.string().max(500).optional(),
});

export const demoLockPostSchema = z.looseObject({
  portfolios: z.array(z.unknown()).min(1).max(50),
  holdings: z.array(z.unknown()).max(500),
});

export const adminDeletePortfolioSchema = z.looseObject({
  portfolioId: id,
  confirm: z.literal("delete this portfolio"),
});

export const adminSignOutEveryoneSchema = z.looseObject({
  confirm: z.literal("sign out everyone"),
});
