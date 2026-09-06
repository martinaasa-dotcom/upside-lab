import type { SupabaseClient } from "@supabase/supabase-js";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

export const CLASSROOM_KIND = "classroom" as const;
export const CIRCLE_KIND = "circle" as const;
export type CommunityKind = typeof CIRCLE_KIND | typeof CLASSROOM_KIND;

export const DEFAULT_STARTING_CASH = 100_000;
export const MIN_STARTING_CASH = 1_000;
export const MAX_STARTING_CASH = 10_000_000;

export const DEFAULT_CLASS_ASSIGNMENT =
  "Week 1: pick up to 5 companies and write down why for each one. The Sunday letter is the summary you hand in.";

export const CLASS_PERIOD_KINDS = ["open", "buy", "closed", "fix"] as const;
export type ClassPeriodKind = (typeof CLASS_PERIOD_KINDS)[number];
export type ClassAction = "buy" | "sell" | "adjust" | "cash";

export type ClassPeriod = {
  id: string;
  kind: ClassPeriodKind;
  startsAt: string;
  endsAt: string | null;
};

export type ClassPlan = {
  purpose?: string;
  periods: ClassPeriod[];
};

export type ClassroomTrade = {
  kind: ClassPeriodKind;
  canBuy: boolean;
  canSell: boolean;
  canAdjust: boolean;
  canCash: boolean;
  purpose: string | null;
  until: string | null;
  label: string;
  message: string;
  studentLocked: boolean;
};

const KIND_LABEL: Record<ClassPeriodKind, string> = {
  open: "Anything goes",
  buy: "Buy week",
  closed: "Closed",
  fix: "Sell and move",
};

const KIND_MESSAGE: Record<ClassPeriodKind, string> = {
  open: "You can buy, sell, and move money.",
  buy: "You can add companies. You cannot sell yet.",
  closed: "The teacher closed the portfolio. You can look, you cannot buy or sell.",
  fix: "You can sell and move money. You cannot add new companies.",
};

export function classPeriodLabel(kind: ClassPeriodKind): string {
  return KIND_LABEL[kind];
}

export function emptyClassPlan(): ClassPlan {
  return { periods: [] };
}

function isKind(v: unknown): v is ClassPeriodKind {
  return CLASS_PERIOD_KINDS.includes(v as ClassPeriodKind);
}

function isIso(v: unknown): v is string {
  return typeof v === "string" && Number.isFinite(Date.parse(v));
}

export function parseClassPlan(raw: unknown, now = new Date()): ClassPlan {
  if (!raw || typeof raw !== "object") return emptyClassPlan();
  const o = raw as { purpose?: unknown; periods?: unknown };
  const purpose =
    typeof o.purpose === "string" ? o.purpose.trim().slice(0, 800) : "";
  const rows = Array.isArray(o.periods) ? o.periods : [];
  const periods: ClassPeriod[] = [];
  for (const row of rows.slice(0, 24)) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (!isKind(r.kind) || !isIso(r.startsAt)) continue;
    const endsAt = r.endsAt == null || r.endsAt === "" ? null : String(r.endsAt);
    if (endsAt && !isIso(endsAt)) continue;
    if (endsAt && Date.parse(endsAt) <= Date.parse(String(r.startsAt))) continue;
    periods.push({
      id:
        typeof r.id === "string" && r.id.trim()
          ? r.id.trim().slice(0, 80)
          : crypto.randomUUID(),
      kind: r.kind,
      startsAt: new Date(String(r.startsAt)).toISOString(),
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    });
  }
  const t = now.getTime();
  const live = periods.filter((p) => !p.endsAt || Date.parse(p.endsAt) > t);
  live.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return { purpose: purpose || undefined, periods: live.slice(-24) };
}

export function resolveClassroomTrade(
  plan: ClassPlan,
  now = new Date(),
  purposeFallback?: string | null
): ClassroomTrade {
  const t = now.getTime();
  const live = plan.periods.filter((p) => {
    const start = Date.parse(p.startsAt);
    const end = p.endsAt ? Date.parse(p.endsAt) : null;
    return start <= t && (end == null || t < end);
  });
  live.sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  const current = live[0];
  const kind = current?.kind ?? "open";
  const purpose = (plan.purpose?.trim() || purposeFallback?.trim() || "") || null;
  return {
    kind,
    canBuy: kind === "open" || kind === "buy",
    canSell: kind === "open" || kind === "fix",
    canAdjust: kind !== "closed",
    canCash: kind !== "closed",
    purpose,
    until: current?.endsAt ?? null,
    label: KIND_LABEL[kind],
    message: KIND_MESSAGE[kind],
    studentLocked: kind !== "open",
  };
}

export function startPeriodNow(
  plan: ClassPlan,
  kind: ClassPeriodKind,
  now = new Date()
): ClassPlan {
  const current = resolveClassroomTrade(plan, now);
  if (current.kind === kind) return plan;
  const iso = now.toISOString();
  const t = now.getTime();
  const periods = plan.periods.map((p) => {
    const start = Date.parse(p.startsAt);
    const end = p.endsAt ? Date.parse(p.endsAt) : null;
    const covers = start <= t && (end == null || t < end);
    if (!covers) return p;
    return { ...p, endsAt: iso };
  });
  periods.push({
    id: crypto.randomUUID(),
    kind,
    startsAt: iso,
    endsAt: null,
  });
  return parseClassPlan({ ...plan, periods }, now);
}

export function allowClassAction(
  trade: ClassroomTrade,
  action: ClassAction
): boolean {
  if (action === "buy") return trade.canBuy;
  if (action === "sell") return trade.canSell;
  if (action === "adjust") return trade.canAdjust;
  return trade.canCash;
}

export function classActionError(trade: ClassroomTrade): string {
  return trade.message;
}

export function classifyHoldingWrite(opts: {
  isNew: boolean;
  isDelete: boolean;
  existingShares?: number;
  nextShares?: number;
  tickerChanged?: boolean;
}): ClassAction {
  if (opts.isDelete) return "sell";
  if (opts.isNew) return "buy";
  const prev = opts.existingShares ?? 0;
  const next = opts.nextShares ?? prev;
  if (next > prev) return "buy";
  if (next < prev) return "sell";
  return "adjust";
}

/** Renaming a ticker is selling one name and buying another. */
export function holdingWriteActions(opts: {
  isNew: boolean;
  isDelete: boolean;
  existingShares?: number;
  nextShares?: number;
  tickerChanged?: boolean;
}): ClassAction[] {
  if (opts.tickerChanged && !opts.isNew && !opts.isDelete) {
    return ["buy", "sell"];
  }
  return [classifyHoldingWrite(opts)];
}

export function classifyImportWrite(opts: {
  cash: boolean;
  replace: boolean;
  rows: { ticker: string; shares: number }[];
  existing: { ticker: string; shares: number }[];
}): ClassAction[] {
  const needs = new Set<ClassAction>();
  if (opts.cash) needs.add("cash");
  const have = new Map(
    opts.existing.map((h) => [h.ticker.trim().toUpperCase(), h.shares])
  );
  const keep = new Set<string>();
  for (const row of opts.rows) {
    const ticker = row.ticker.trim().toUpperCase();
    if (!ticker) continue;
    keep.add(ticker);
    const prev = have.get(ticker);
    if (prev == null) needs.add("buy");
    else if (row.shares > prev) needs.add("buy");
    else if (row.shares < prev) needs.add("sell");
    else needs.add("adjust");
  }
  if (opts.replace) {
    for (const ticker of have.keys()) {
      if (!keep.has(ticker)) needs.add("sell");
    }
  }
  return [...needs];
}

export function isClassroomKind(kind: unknown): boolean {
  return kind === CLASSROOM_KIND;
}

export function isClassroomSheet(p: {
  classroom_community_id?: string | null;
}): boolean {
  return Boolean(p.classroom_community_id);
}

/** Real books only. Class sheets never count as the personal book. */
export function realBookPortfolios<
  T extends { classroom_community_id?: string | null },
>(portfolios: T[]): T[] {
  return portfolios.filter((p) => !isClassroomSheet(p));
}

/**
 * Book the dashboard, Pulse, Forecast, and weekday notes should use.
 * A real sheet wins. If the account only has class homework, that paper
 * sheet is the book. The site never moves real money either way.
 */
export function ownedBookPortfolios<
  T extends { classroom_community_id?: string | null },
>(portfolios: T[]): T[] {
  const real = realBookPortfolios(portfolios);
  return real.length ? real : portfolios.filter(isClassroomSheet);
}

/** True when this account has a class and no real book and no circle. */
export function isPaperClassOnly(
  portfolios: { classroom_community_id?: string | null }[],
  communities: { kind?: string | null }[] = []
): boolean {
  if (portfolios.some((p) => !isClassroomSheet(p))) return false;
  if (communities.some((c) => c.kind && !isClassroomKind(c.kind))) return false;
  return (
    portfolios.some(isClassroomSheet) ||
    communities.some((c) => isClassroomKind(c.kind))
  );
}

export function parseStartingCash(raw: unknown): number | null {
  const n =
    typeof raw === "number"
      ? raw
      : Number(String(raw).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < MIN_STARTING_CASH || rounded > MAX_STARTING_CASH) return null;
  return rounded;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "sheet";
}

function sheetLabel(displayName: string | null, email: string | null, className: string) {
  const fromName = displayName?.trim().split(/\s+/)[0];
  const fromEmail = email?.split("@")[0]?.trim();
  const first = fromName || fromEmail || "Student";
  return `${first} · ${className}`.slice(0, 80);
}

async function uniqueSlug(
  supabase: SupabaseClient,
  name: string
): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let suffix = 1;
  for (;;) {
    const { data } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!data) return slug;
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
}

export async function provisionClassroomSheet(
  supabase: SupabaseClient,
  opts: { communityId: string; userId: string }
): Promise<{ ok: true; portfolioId: string } | { ok: false; error: string }> {
  const { data: community, error: cErr } = await supabase
    .from(PORTFELL_TABLES.communities)
    .select("id, name, kind, starting_cash")
    .eq("id", opts.communityId)
    .maybeSingle();
  if (cErr) return { ok: false, error: cErr.message };
  if (!community) return { ok: false, error: "Not found" };
  if (!isClassroomKind((community as { kind?: string }).kind)) {
    return { ok: false, error: "Not a class" };
  }

  const { data: membership } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .select("user_id")
    .eq("community_id", opts.communityId)
    .eq("user_id", opts.userId)
    .maybeSingle();
  if (!membership) return { ok: false, error: "Not a member" };

  const { data: existing } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("id, name")
    .eq("classroom_community_id", opts.communityId)
    .eq("owner_id", opts.userId)
    .maybeSingle();

  const startingCash = parseStartingCash(
    (community as { starting_cash?: unknown }).starting_cash
  ) ?? DEFAULT_STARTING_CASH;

  let portfolioId = (existing as { id?: string } | null)?.id ?? null;
  let label = (existing as { name?: string } | null)?.name ?? null;

  if (!portfolioId) {
    const { data: profile } = await supabase
      .from(PORTFELL_TABLES.profiles)
      .select("display_name, email")
      .eq("id", opts.userId)
      .maybeSingle();
    const name = sheetLabel(
      (profile as { display_name?: string | null } | null)?.display_name ?? null,
      (profile as { email?: string | null } | null)?.email ?? null,
      (community as { name: string }).name
    );
    const slug = await uniqueSlug(supabase, name);
    const { data: owned } = await supabase
      .from(PORTFELL_TABLES.portfolioOwners)
      .select("portfolio_id")
      .eq("user_id", opts.userId);
    const sortOrder = ((owned ?? []) as unknown[]).length + 1;

    const { data: created, error: pErr } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .insert({
        name,
        slug,
        sort_order: sortOrder,
        cash_balance: startingCash,
        owner_id: opts.userId,
        classroom_community_id: opts.communityId,
      })
      .select("id, name")
      .single();
    if (pErr || !created) {
      if (pErr && /duplicate|unique/i.test(pErr.message)) {
        const { data: raced } = await supabase
          .from(PORTFELL_TABLES.portfolios)
          .select("id, name")
          .eq("classroom_community_id", opts.communityId)
          .eq("owner_id", opts.userId)
          .maybeSingle();
        if (raced) {
          portfolioId = (raced as { id: string }).id;
          label = (raced as { name: string }).name;
        } else {
          return { ok: false, error: pErr.message };
        }
      } else {
        return { ok: false, error: pErr?.message ?? "Couldn't make the paper portfolio." };
      }
    } else {
      portfolioId = (created as { id: string }).id;
      label = (created as { name: string }).name;
    }

    const { error: oErr } = await supabase
      .from(PORTFELL_TABLES.portfolioOwners)
      .insert({ portfolio_id: portfolioId, user_id: opts.userId });
    if (oErr && !/duplicate|unique/i.test(oErr.message)) {
      return { ok: false, error: oErr.message };
    }
  }

  const { error: pinErr } = await supabase
    .from(PORTFELL_TABLES.communityPortfolios)
    .insert({
      community_id: opts.communityId,
      portfolio_id: portfolioId,
      label,
    });
  if (pinErr && !/duplicate|unique/i.test(pinErr.message)) {
    return { ok: false, error: pinErr.message };
  }

  return { ok: true, portfolioId };
}
