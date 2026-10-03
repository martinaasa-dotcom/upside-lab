import type { ReactNode } from "react";

import { UpsideLogo } from "@/components/UpsideLogo";
import { cn } from "@/lib/format";

/**
 * The one shape for a page that says a single thing: a 404, an error, an
 * email link landing, an invite being opened.
 *
 * There were six of these and five layouts. The 404 sat in the room's
 * ambient field with a centred mark; the error screen had the same column
 * on bare black; the two email-link pages were left-aligned under a blurred
 * header bar the legal pages used to have; the two join pages each picked a
 * different size of logo. Nothing about any one of them was wrong, and
 * together they read as screens from four different versions of the app,
 * which is exactly what a reader meets on the way in from a mail or a link.
 *
 * So: `page-frame` for the field every room stands in, the mark, an
 * optional eyebrow (the 404's number), one heading, the body (a sentence or
 * two at the sentence size, and whatever form or status the page needs),
 * the actions, then any footnote. The body block arrives with the app's own
 * `wave-in`, the same entrance a card makes everywhere else.
 */
export function MessageScreen({
  eyebrow,
  title,
  children,
  actions,
  foot,
  className,
}: {
  /** A short label over the heading, set in the figure face. */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** The sentence or two, and anything else that belongs under the heading. */
  children?: ReactNode;
  /** Buttons, in a centred row. */
  actions?: ReactNode;
  /** A last line under the actions, such as where to write in. */
  foot?: ReactNode;
  className?: string;
}) {
  return (
    <main
      id="main"
      className={cn(
        "page-frame flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 py-16 text-center text-foreground",
        className
      )}
    >
      <UpsideLogo variant="icon" />

      <div className="wave-in flex w-full max-w-md flex-col gap-3">
        {eyebrow ? (
          <p className="font-mono text-sm tabular-nums tracking-[0.2em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          {title}
        </h1>
        {children}
      </div>

      {actions ? (
        <div
          className="wave-in flex flex-wrap items-center justify-center gap-2"
          style={{ ["--i" as string]: 4 }}
        >
          {actions}
        </div>
      ) : null}

      {foot ? (
        <div className="text-sm leading-relaxed text-muted-foreground">
          {foot}
        </div>
      ) : null}
    </main>
  );
}

/** A sentence under the heading, at the sentence size and in the quiet colour. */
export function MessageLine({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "loss";
}) {
  return (
    <p
      className={cn(
        "text-sm leading-relaxed",
        tone === "loss" ? "text-loss" : "text-muted-foreground"
      )}
    >
      {children}
    </p>
  );
}
