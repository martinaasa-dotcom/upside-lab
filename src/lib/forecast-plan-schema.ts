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
import { FORECAST_YEARS } from "@/lib/forecast";

/*
  Built from FORECAST_YEARS rather than typed out, and that is not tidiness.
  The years the panel draws move every January; these did not. Left as
  literals, the first of January would have the model reasoning a path to a
  year that has already ended while the app displayed a year the model was
  never asked about, so the last column would be gap-filled for every
  holding and the first would be thrown away. Nothing fails, and every
  forecast in the product is quietly one year short.

  Deliberately an object with named keys rather than `z.record`: this schema
  is turned into JSON schema for structured output, and a record becomes
  `additionalProperties`, which does not tell a model which five years to
  answer with.
*/
const YEAR_SPAN = `${FORECAST_YEARS[0]}-${FORECAST_YEARS[FORECAST_YEARS.length - 1]}`;

const yearPriceSchema = z.object(
  Object.fromEntries(
    FORECAST_YEARS.map((year) => [String(year), z.number().positive()])
  ) as Record<string, z.ZodNumber>
);

export const forecastPlanSchema = z.object({
  generalAdvice: z
    .string()
    .describe(
      "2-4 short sentences on portfolio-level mix (size, concentration, cash). Facts only, never orders. Plain spoken English. No em dashes. No stacked jargon slogans."
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
            `Horizon label, e.g. "Next quarter (Q4 ${FORECAST_YEARS[0]})", "${FORECAST_YEARS[1]}", "${FORECAST_YEARS[2]}-${FORECAST_YEARS[3]}"`
          ),
        theme: z.string().describe("Short memorable theme name for the period"),
        add: z
          .string()
          .describe(
            'Bullet list, semicolon-separated. ONE name or group per item: "TICKER (current% -> target%): why + condition" or "data-center power (~0% to 5%): why". Never pack two tickers with a slash into one item. Never empty; say "No mix change" if the modeled mix is unchanged. Never say sleeve. Never write buy, sell, add, or trim as an order.'
          ),
        trim: z
          .string()
          .describe(
            'Bullet list, semicolon-separated. ONE ticker per item: "TICKER (current% -> target%): why + condition". Never pack two tickers with a slash into one item. Never empty; say "No mix change" if the modeled mix is unchanged. Never write buy, sell, add, or trim as an order.'
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
          `NON-LINEAR EOY prices ${YEAR_SPAN}. Forbidden: equal steps / flat CAGR. Crypto needs a winter year; AI computer builders can rip with a quieter year as slower-up, not a collapse.`
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
      `EOY SP for EVERY holding, all years ${YEAR_SPAN}. Big-bet AI computer builders / chip makers / electricity for data centers / crypto magnitudes. Never paste spot across years. Never draw a straight line.`
    ),
});
