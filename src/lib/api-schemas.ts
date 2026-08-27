/**
 * Request-body schemas for public API routes. Extra keys are allowed
 * (clients send leftover fields) but known fields are type-checked and
 * length-capped before any handler reads them.
 */
import { z } from "zod";

const id = z.string().trim().min(1).max(128);
const finite = z.coerce.number().finite();
const optionalFinite = finite.optional();
const nullableFinite = finite.nullable().optional();

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
  conviction: z.record(z.string().max(24), z.unknown()).optional(),
  watchlist: z.array(z.string().max(12)).max(40).optional(),
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

export const chatPostSchema = z.looseObject({
  messages: z.array(z.unknown()).max(40).optional(),
  ccContext: z.unknown().optional(),
});

export const forecastPostSchema = z.looseObject({
  portfolioId: id,
  portfolioName: z.string().max(80).optional(),
  cashBalance: optionalFinite,
  forecast: z.looseObject({
    rows: z.array(z.unknown()).min(1).max(200),
  }),
  convictions: z.record(z.string().max(24), z.unknown()).optional(),
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
  convictions: z.record(z.string().max(24), z.unknown()).optional(),
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

/** Catch-all for mutation bodies that are objects with unknown extra keys. */
export const jsonObjectSchema = z.looseObject({});
