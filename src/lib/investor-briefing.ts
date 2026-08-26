import type { CoveredCallRow } from "@/lib/types";
import type { OverviewModel } from "@/lib/overview";
import type { UpsideAlert } from "@/lib/alerts";
import { todayKeyInTz } from "@/lib/timezone";
import { hashSeed, mulberry32, pick } from "@/lib/seeded-rng";

export type BriefingLink =
  | { type: "pulse" }
  | { type: "sheet"; portfolioId: string; focus?: "covered-calls" }
  | { type: "compound" };

export type BriefingItem = {
  id: string;
  kind: "action" | "watch" | "play";
  title: string;
  detail: string;
  ticker?: string;
  link?: BriefingLink;
  cta?: string;
};

/** Plain-English labels. "action/watch/play" are codes, not UI. */
export const BRIEFING_KIND_LABEL: Record<BriefingItem["kind"], string> = {
  action: "Alert",
  watch: "Context",
  play: "What's missing",
};

export const BRIEFING_PULSE_CTA = "Open Pulse";

function money(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function sheetMostCash(model: OverviewModel): string | undefined {
  const sorted = [...model.sheets].sort(
    (a, b) => b.portfolio.cash_balance - a.portfolio.cash_balance
  );
  return sorted[0]?.portfolio.id;
}

/** Which sheet actually holds the covered-call premium being modeled, so
 * the briefing card can take the viewer straight to it instead of just
 * quoting a book-wide number with nowhere to go. */
function sheetMostCcPremium(rows: CoveredCallRow[]): string | undefined {
  const byPortfolio = new Map<string, number>();
  for (const r of rows) {
    const id = r.holding.portfolio_id;
    if (!id) continue;
    byPortfolio.set(id, (byPortfolio.get(id) ?? 0) + (r.premium ?? 0));
  }
  let best: string | undefined;
  let bestPremium = -Infinity;
  for (const [id, premium] of byPortfolio) {
    if (premium > bestPremium) {
      bestPremium = premium;
      best = id;
    }
  }
  return best;
}

/**
 * Daily glance: today's $, real alerts, then one play.
 * Pulse is a top-level tab, so the CTA follows `canReachPulse`, not Lab.
 */
export function buildInvestorBriefing(input: {
  model: OverviewModel;
  activeAlerts: UpsideAlert[];
  coveredCallRows: CoveredCallRow[];
  dayKey?: string;
  hideOptions?: boolean;
  canReachPulse?: boolean;
}): BriefingItem[] {
  const dayKey = input.dayKey ?? todayKeyInTz();
  const { model, activeAlerts, coveredCallRows } = input;
  // Hide unless the caller explicitly opted the viewer in. Forgetting to
  // pass this used to leak covered-call pep talks onto Home.
  const hideOptions = input.hideOptions !== false;
  const canReachPulse = input.canReachPulse ?? true;
  const items: BriefingItem[] = [];

  const today$ = model.totals.todayDollar;
  const todayPct = model.totals.todayPct;
  const dayRng = mulberry32(
    hashSeed(`upside-briefing-day|${dayKey}|${Math.round(today$)}`)
  );

  // Deliberately does NOT restate today's dollar figure. It's already the
  // second cell of the scoreboard directly above this card, and before
  // this the same number appeared three times on one screen. What a
  // briefing owes you is the read on the number, not the number again.
  const swing = todayPct == null ? null : Math.abs(todayPct);
  const dayTitle =
    todayPct == null
      ? "Prices are still coming in"
      : swing! < 0.005
        ? "Quiet day"
        : swing! < 0.02
          ? "Normal day"
          : today$ >= 0
            ? "Up day, larger than usual"
            : "Down day, larger than usual";
  const dayDetail =
    todayPct == null
      ? "Quotes are still settling. Give it a minute, or come back later."
      : swing! < 0.005
        ? "Barely moved. Most days look like this."
        : swing! < 0.02
          ? pick(dayRng, [
              "A normal wobble relative to a typical session.",
              "Small moves vs a typical day.",
            ])
          : hideOptions
            ? pick(dayRng, [
                "Larger than a typical session. Pulse lists which names moved, and whether the stated reason still matches.",
                "Larger than a typical session. The question is whether the reason you own a name changed, or just the price.",
              ])
            : pick(dayRng, [
                "Larger than a typical session. Pulse lists which names moved, and whether the stated reason still matches.",
                "Larger than a typical session. Covered-call numbers also move on days like this.",
              ]);

  items.push({
    id: `day-${dayKey}`,
    kind: "watch",
    title: dayTitle,
    detail: dayDetail,
    link: canReachPulse ? { type: "pulse" } : undefined,
    cta: canReachPulse ? BRIEFING_PULSE_CTA : undefined,
  });

  for (const alert of activeAlerts.slice(0, 3)) {
    items.push({
      id: `alert-${alert.id}`,
      kind: "action",
      title: alert.title,
      detail: alert.detail,
      ticker: alert.ticker,
    });
  }

  if (!hideOptions) {
    const openPrem = coveredCallRows.reduce((s, r) => s + (r.premium ?? 0), 0);
    if (openPrem > 0) {
      const rng = mulberry32(
        hashSeed(`upside-briefing-cc|${Math.round(openPrem)}`)
      );
      const ccSheetId = sheetMostCcPremium(coveredCallRows);
      items.push({
        id: `cc-season-${dayKey}`,
        kind: "watch",
        title: `About $${money(openPrem)} in call premium on paper`,
        detail: pick(rng, [
          "From the strikes you set. Not in the account yet. Those strikes sit against today's prices.",
          "What those calls would be worth at expiry. On paper, not banked.",
        ]),
        link: ccSheetId
          ? { type: "sheet", portfolioId: ccSheetId, focus: "covered-calls" }
          : undefined,
        cta: ccSheetId ? "Open covered calls" : undefined,
      });
    }
  }

  if (model.totals.cash > 5_000) {
    const rng = mulberry32(hashSeed(`upside-briefing-cash|${Math.round(model.totals.cash)}`));
    items.push({
      id: "dry-powder",
      kind: "watch",
      title: `$${money(model.totals.cash)} sitting in cash`,
      detail: pick(rng, [
        "This is cash, not stocks.",
        "Not invested in any name.",
        "Unspent cash in this portfolio.",
      ]),
      link: sheetMostCash(model)
        ? { type: "sheet", portfolioId: sheetMostCash(model)! }
        : { type: "compound" },
      cta: sheetMostCash(model) ? "Open your portfolio" : "Open Compound",
    });
  }

  // No rotating "play" cards. Those invented work. Alerts and the day
  // read are enough. Today itself now owns the morning stack.
  const seen = new Set<string>();
  const out: BriefingItem[] = [];
  for (const kind of ["action", "watch"] as const) {
    for (const it of items.filter((i) => i.kind === kind)) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      out.push(it);
      if (out.length >= 2) return out;
    }
  }
  return out;
}
