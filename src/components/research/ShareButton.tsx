"use client";

import { Button } from "@/components/ui/button";
import { companyHref } from "@/lib/company/client";
import { cashtag } from "@/lib/format";
import { siteUrl } from "@/lib/site-url";
import { Check, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Send this company to somebody.
 *
 * The page is public, so the link works for whoever it is sent to, with no
 * account and no sign-in in front of it. On a phone this opens the
 * device's own share sheet, which already knows the reader's chats and
 * contacts and is the one sharing surface people trust; anywhere without
 * one it copies the link and says so.
 *
 * The address is always the canonical one, never the window's: a link
 * copied off a preview deployment or a tab still carrying a query string
 * would otherwise go out as an address that only works for the sender.
 */
export function shareUrlFor(ticker: string): string {
  return `${siteUrl()}${companyHref(ticker)}`;
}

/**
 * The one sentence that travels with the link. Plain, no verdict, and no
 * figure, because a share sheet message is read later than it is written
 * and a price in it would be wrong by the time it is opened.
 */
export function shareTextFor(ticker: string, name?: string | null): string {
  const who = name?.trim() ? `${name.trim()} (${cashtag(ticker)})` : cashtag(ticker);
  return `${who}: what it does, what it looks worth and both sides of the argument, in plain English.`;
}

export function ShareButton({
  ticker,
  name,
  size = "sm",
  variant = "outline",
  className,
}: {
  ticker: string;
  name?: string | null;
  size?: "sm" | "default";
  variant?: "outline" | "ghost" | "default";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onShare = async () => {
    const url = shareUrlFor(ticker);
    const title = name?.trim() ? `${name.trim()} on Upside Lab` : `${cashtag(ticker)} on Upside Lab`;
    const text = shareTextFor(ticker, name);
    const nav = navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
      canShare?: (data: ShareData) => boolean;
    };
    if (typeof nav.share === "function" && (!nav.canShare || nav.canShare({ url }))) {
      try {
        await nav.share({ title, text, url });
        return;
      } catch (err) {
        // Closing the sheet is a decision, not a failure.
        if (err instanceof DOMException && err.name === "AbortError") return;
        /* anything else falls through to copying */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // A browser that refuses the clipboard still shows the address, which
      // the reader can copy by hand.
      window.prompt("Copy this link", url);
      return;
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2400);
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={() => void onShare()}
      aria-label={copied ? "Link copied" : `Share ${cashtag(ticker)}`}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Share2 className="h-3.5 w-3.5" aria-hidden />
      )}
      <span aria-live="polite">{copied ? "Link copied" : "Share"}</span>
    </Button>
  );
}
