"use client";

import { Button } from "@/components/ui/button";
import { companyHref, companySignInHref } from "@/lib/company/client";
import { loadLastUser } from "@/lib/last-session";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Whether this browser was signed in the last time it opened the app.
 *
 * A research page is cached for everybody and the server cannot know who
 * is reading it, so the one thing that can is the browser's own record of
 * its last session, the same record the root element's session hint reads.
 * It starts false on the server and on the first render and is corrected
 * in an effect, so the cached HTML is the signed-out version for every
 * reader and nothing disagrees at hydration.
 */
export function useMaybeSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    setSignedIn(Boolean(loadLastUser()));
  }, []);
  return signedIn;
}

/**
 * The way from a public page into the app, worded for whoever is reading.
 *
 * Somebody with no account is asked once, plainly, and taken through the
 * sign-in to this company's own room rather than to a home screen
 * (`companySignInHref`). Somebody already signed in is taken straight to
 * the room. Both are ordinary links: no dialog, nothing that covers the
 * page, nothing that appears on a timer, because the page is the thing they
 * came for and the invitation is earned by it rather than standing in
 * front of it.
 */
export function AppLink({
  ticker,
  children,
  signedIn: signedInLabel,
  variant = "default",
  size = "default",
  className,
}: {
  /** The company, or none for a link to the app as a whole. */
  ticker?: string | null;
  /** What the link says to somebody without an account. */
  children: ReactNode;
  /** What it says to somebody signed in. Defaults to the same words. */
  signedIn?: ReactNode;
  variant?: "default" | "outline" | "ghost" | "link";
  size?: "default" | "sm";
  className?: string;
}) {
  const signedIn = useMaybeSignedIn();
  const href = ticker
    ? signedIn
      ? companyHref(ticker)
      : companySignInHref(ticker)
    : signedIn
      ? "/"
      : "/login";
  return (
    <Button asChild variant={variant} size={size} className={className}>
      <Link href={href} prefetch={false}>
        {signedIn && signedInLabel ? signedInLabel : children}
      </Link>
    </Button>
  );
}
