/**
 * Zod schema for the Thesis Pulse report, kept out of lib/thesis-pulse.ts
 * so it never reaches the browser.
 *
 * PulsePage, OverviewDashboard, and Dashboard all import candidate/cache
 * helpers from lib/thesis-pulse.ts, so a top-level `import { z }` there put
 * all of zod into the client bundle for code only the API route runs.
 */

import { z } from "zod";

export const pulseReportSchema = z.object({
  summary: z
    .string()
    .describe(
      "One short sentence on the portfolio as a whole. Name the names that moved 5% or more, up or down, and whether any tag left Inside recent range. Do not recap one ticker's news. That belongs on the card. Do not start with the sharp drop."
    ),
  checks: z.array(
    z.object({
      ticker: z.string(),
      situation: z
        .array(z.string())
        .min(2)
        .max(4)
        .describe(
          "2-4 bullets explaining THIS ticker's situation, grounded in its headlines. One short line each, under about 18 words, no bullet longer than a single clause plus its consequence. Unique to this name: do not reuse a bullet from another ticker in this report. Plain English, no preamble, no trailing summary bullet."
        ),
      moveReason: z
        .string()
        .describe(
          "One sentence on what drove THIS name's move. Cite a headline when you have one. Must not match any other ticker's moveReason in this report."
        ),
      thesisStatus: z
        .enum(["intact", "watch", "broken"])
        .describe(
          "Be conservative. intact = the reason you own it hasn't changed, including a normal red day, a green day that ran, sector-wide weakness, or taking a little profit. A trim into strength is intact, never watch. watch = something in the story is worth tracking, not a price that went up. broken = the actual reason you bought this is gone (guidance genuinely cut, staying power gone, fraud/restatement). Rare, and must pair with action=sell, never hold/add/trim. If you'd still hold it, use watch."
        ),
      action: z
        .enum(["add", "hold", "trim", "sell", "watch"])
        .describe(
          "Internal tag, never an order. add = price down, intact reason. hold = in recent range, reason intact or watch, never broken. trim = price ran, intact reason. sell = the reason is broken. watch = picture unclear. Verdict and addLevel must describe price or thesis facts, never orders like Add now or Trim about 10%."
        ),
      trimPct: z
        .number()
        .min(5)
        .max(50)
        .nullable()
        .describe(
          "Required on every check. Only when action=trim: modeled percent of the position for a take-off check (e.g. 10, 15, 20). Null otherwise, including for sell. Never write 'trim 10%' as an order in verdict."
        ),
      addLevel: z
        .string()
        .describe(
          'Modeled add check, e.g. "A level to think about: around $X. Then another look if it drops to around $Y." Spell out that Y is a SECOND, lower level, never just "stagger below" jargon. Required when action=add or the reason is intact on a dip. Empty only for trim. Not greedy, Y within about 5-12% below spot. Never write Add now.'
        ),
      earningsNote: z
        .string()
        .describe(
          "Recent/upcoming earnings in plain English; empty string if not relevant."
        ),
      verdict: z
        .string()
        .describe(
          "One sentence tying action + addLevel/trimPct to why they own THIS name, as a price or thesis fact, never an order. Must not match any other ticker's verdict in this report. Name the company, the headline, or a concrete number. Never reuse a stock phrase like 'looks like a chase, not a new story' or 'this is a dip, not a break' on a second name. Never write do not add, sell some, look to add, or trim 10% as an instruction."
        ),
      thesisBreak: z
        .string()
        .describe(
          "One or two short sentences naming the actual thing that would kill why they own THIS name. Use their note, the sector, and headlines. Example: data-center bookings stall for two quarters. Empty if you cannot name something specific to this company or fund. Never a generic lost-customer / restatement / quiet-day line that could sit on every card."
        ),
    })
  ),
});
