/**
 * Zod schema for the Forecast plan, kept in its own module so it never
 * reaches the browser.
 *
 * lib/forecast-plan.ts is imported by ForecastPanel (a client component)
 * for its storage helpers and types. When the schema lived there too, the
 * `import { z } from "zod"` at the top of that module dragged all of zod
 * into the client bundle, even though nothing in the browser ever
 * validates with it. Only the API route needs this.
 *
 * `ForecastPlan` still derives from this schema via a type-only import, so
 * there's one source of truth and zero runtime cost.
 */

import { z } from "zod";

const yearPriceSchema = z.object({
  2026: z.number().positive(),
  2027: z.number().positive(),
  2028: z.number().positive(),
  2029: z.number().positive(),
  2030: z.number().positive(),
});

export const forecastPlanSchema = z.object({
  generalAdvice: z
    .string()
    .describe(
      "2-4 short sentences of portfolio-level advice (size, concentration, cash). Plain spoken English. No em dashes. No stacked jargon slogans."
    ),
  sectorRotation: z
    .string()
    .describe(
      "Where money might move from one group of similar stocks to another over the next quarter and year, tied to this portfolio. Plain speech, no em dashes."
    ),
  periods: z
    .array(
      z.object({
        label: z
          .string()
          .describe(
            'Horizon label, e.g. "Next quarter (Q4 2026)", "2027", "2028-2029"'
          ),
        theme: z.string().describe("Short memorable theme name for the period"),
        add: z
          .string()
          .describe(
            'Bullet list, semicolon-separated. ONE name or group per item: "TICKER (current% -> target%): why + trigger" or "data-center power (~0% to 5%): why". Never pack two tickers with a slash into one item. Never empty; say "Hold, no add" if nothing. Never say sleeve.'
          ),
        trim: z
          .string()
          .describe(
            'Bullet list, semicolon-separated. ONE ticker per item: "TICKER (current% -> target%): why + trigger". Never pack two tickers with a slash into one item. Never empty; say "Hold, no trim" if nothing.'
          ),
        notes: z
          .string()
          .optional()
          .describe(
            "Optional ONE short context line only, do NOT repeat add/trim tickers here"
          ),
      })
    )
    .min(2)
    .max(6),
  eoyTargets: z
    .array(
      z.object({
        ticker: z
          .string()
          .describe("Exact ticker as listed in holdings (keep exchange suffix)"),
        prices: yearPriceSchema.describe(
          "NON-LINEAR EOY prices 2026-2030. Forbidden: equal steps / flat CAGR. Crypto needs a winter year; AI computer builders can rip with a quieter year as slower-up, not a collapse."
        ),
        rationale: z
          .string()
          .optional()
          .describe(
            "One human sentence: why this company + how the path wiggles (strong stretch / real drop / quiet year). No em dashes. Never say overridden, rejected, calibrated, or portfolio-aligned."
          ),
      })
    )
    .describe(
      "EOY SP for EVERY holding, all years 2026-2030. Big-bet AI computer builders / chip makers / electricity for data centers / crypto magnitudes. Never paste spot across years. Never draw a straight line."
    ),
});
