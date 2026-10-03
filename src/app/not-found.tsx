import { MessageLine, MessageScreen } from "@/components/MessageScreen";
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
    <MessageScreen
      eyebrow="404"
      title={<>This page isn&apos;t here</>}
      actions={
        <>
          <Button asChild>
            <Link href="/">Open Upside Lab</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/research">Look up a company</Link>
          </Button>
        </>
      }
      foot={
        <>
          Sent here by a link?{" "}
          <a
            href={`mailto:${PRODUCT_SUPPORT_EMAIL}`}
            className="underline hover:text-foreground"
          >
            {PRODUCT_SUPPORT_EMAIL}
          </a>
        </>
      }
    >
      {/*
        Written for both people who land here: a reader with an account,
        and a stranger who followed a public research link.
      */}
      <MessageLine>
        The link may be old or have a typo. If you have an account, everything
        in it is where you left it.
      </MessageLine>
    </MessageScreen>
  );
}
