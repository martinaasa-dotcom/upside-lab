"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { isActiveSubscription } from "@/lib/billing-status";
import { plainError } from "@/lib/plain-error";

/**
 * Drop into /account. One button, two destinations depending on
 * `subscriptionStatus`: Checkout for somebody who is not paying, the billing
 * portal for anyone with an active/trialing/past_due subscription. past_due
 * counts as subscribed so the destination is the portal (fix the card),
 * never a second Checkout session.
 *
 * The word on it comes from the caller. It used to say "Upgrade", which is
 * the one word that means more features, over a paragraph explaining that
 * there are no more features; `supporterButtonLabel` in `account-copy.ts`
 * writes it now, and `outline` rather than the filled accent because a
 * request for money is not the most important thing on a settings page.
 */
export function UpgradeButton({
  subscriptionStatus,
  label,
}: {
  subscriptionStatus: string | null;
  label: string;
}) {
  const [loading, setLoading] = useState(false);
  const isSubscribed = isActiveSubscription(subscriptionStatus);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch(isSubscribed ? "/api/billing/portal" : "/api/billing/checkout", {
        method: "POST",
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        toast.error(plainError(data.error, "Couldn't open billing right now."));
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error("Couldn't reach billing right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={loading}>
      {loading ? "One sec…" : label}
    </Button>
  );
}
