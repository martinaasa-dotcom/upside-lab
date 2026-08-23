import { UpsideLogo } from "@/components/UpsideLogo";
import { Button } from "@/components/ui/button";
import { PRODUCT_SUPPORT_EMAIL } from "@/lib/product";
import Link from "next/link";

/**
 * The 404 every unmatched URL lands on.
 *
 * Without this file Next serves its own built-in page, and two things went
 * wrong with it. It is unbranded scaffolding ("404 / This page could not be
 * found"), which is the last thing a stranger arriving from a forum link
 * should meet. Worse, the built-in UI reads `prefers-color-scheme` and
 * deliberately ignores the app's theme, so on a machine set to light it
 * rendered as a **white** page in an app that is true black end to end. It
 * looked less like a missing page than a broken one.
 *
 * A root `not-found.tsx` catches every unmatched URL for the whole app and
 * renders inside the root layout, so it inherits `.dark`, the fonts and the
 * tokens for free. Next injects `noindex` on anything serving a 404 status,
 * so there is no metadata to add here.
 *
 * Shaped like `error.tsx` on purpose: the two are the only screens in the
 * app that a person reaches by accident, and they should feel like the same
 * place. A server component, because nothing here needs the client.
 */
export default function NotFound() {
  return (
    <div className="page-frame flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 py-16 text-center text-foreground">
      <UpsideLogo variant="icon" />

      <div className="flex max-w-md flex-col gap-3">
        {/*
          * Mono, because it is a number, and quiet, because the sentence
          * under it is the part that helps. A giant "404" is decoration for
          * everyone who already knows what a 404 is and no help at all to
          * everyone who does not.
          */}
        <p className="font-mono text-sm tabular-nums tracking-[0.2em] text-muted-foreground">
          404
        </p>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          This page isn&apos;t here
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The link may be old, or it may have a typo in it. Nothing is wrong
          with your account, and your holdings are exactly where you left
          them.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild>
          <Link href="/">Go to my portfolio</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/communities">Open Circle</Link>
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Landed here from a link someone sent you? Tell us at{" "}
        <a
          href={`mailto:${PRODUCT_SUPPORT_EMAIL}`}
          className="underline hover:text-foreground"
        >
          {PRODUCT_SUPPORT_EMAIL}
        </a>
        .
      </p>
    </div>
  );
}
