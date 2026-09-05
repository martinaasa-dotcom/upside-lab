/**
 * The shape of the written half of a company page. Server only, so zod
 * never reaches the browser (the same split `forecast-plan-schema.ts`
 * makes, for the same reason).
 *
 * Every claim carries a citation. That is the whole design of this schema
 * and it is not a nicety: this room exists because people cannot find
 * trustworthy information about a company, and answering that with a model
 * writing confident unsourced paragraphs would make the problem worse
 * rather than better. So a point the model wants to make must say which of
 * the things it was handed the point rests on, and `keepCitedPoints` in
 * `company-brief.ts` deletes any point whose citation does not resolve.
 *
 * The model is therefore not the author of the facts on this page. It is
 * the thing that reads a pile of figures and headlines somebody else
 * supplied and says which of them matter and why, which is the job people
 * actually cannot do for themselves.
 */
import { z } from "zod";

/**
 * What a point may lean on. Three kinds, and nothing else is accepted:
 *
 *   figure   one of the numbers this app fetched and is showing on screen,
 *            named by its reading id, so the reader can look up and see it
 *   article  one of the headlines handed over, by position in that list
 *   profile  the company's own description of what it does
 */
export const citationSchema = z.object({
  kind: z.enum(["figure", "article", "profile"]),
  /**
   * The reading id for a figure (`profit`, `growth`, `balance`, ...), or
   * the article's index in the list as it was given, as a string. Empty
   * for `profile`.
   */
  ref: z.string().max(40).default(""),
});

const pointSchema = z.object({
  /** One sentence. Plain words, no market slang, no dashes. */
  point: z.string().min(12).max(320),
  cite: citationSchema,
});

export const companyBriefSchema = z.object({
  /**
   * What the company sells and who pays for it, in two or three sentences
   * somebody with no background could repeat to a friend.
   */
  whatTheyDo: z.string().min(40).max(700),
  /** Where the money comes from, in one or two sentences. */
  howTheyMakeMoney: z.string().min(20).max(500),
  /** The one thing worth remembering, if the reader reads nothing else. */
  inOneLine: z.string().min(20).max(220),
  /** The case for owning it. Two to four points, each cited. */
  caseFor: z.array(pointSchema).min(1).max(4),
  /** The case against. Two to four points, each cited. */
  caseAgainst: z.array(pointSchema).min(1).max(4),
  /** Things that would change the picture, each cited. */
  watchFor: z.array(pointSchema).min(1).max(4),
  /**
   * A five-year price path, same years and the same rules as the Growth
   * room's, so the two cannot disagree about the same company. Allowed to
   * end below today's price, and nothing in this app moves it afterwards.
   */
  path: z
    .array(
      z.object({
        year: z.number().int(),
        price: z.number().positive(),
      })
    )
    .max(8)
    .default([]),
  /** One sentence on why the path goes the way it does. */
  pathReason: z.string().max(400).default(""),
});

export type CompanyBriefRaw = z.infer<typeof companyBriefSchema>;
