"use client";

import { useAuth } from "@/components/AuthProvider";
import { supabaseIsConfigured } from "@/lib/supabase/env";
import { useEffect } from "react";

/**
 * Marks the root element while a public page is read by somebody with no
 * session, which is what keeps the cookie question off it.
 *
 * `SignInGate` sets the same mark on the landing, for the reason
 * `AnalyticsConsentBanner` records: a dialog about performance measurement
 * is the wrong first thing for a stranger to meet. A public company page
 * is the same situation and more so, since it is a page somebody arrived
 * at from a search result or a friend's link and has not decided anything
 * about the product yet. It rendered the banner over the first screen of
 * the company, which is exactly the popup these pages must not have.
 *
 * Deferred, not dropped: nothing is measured meanwhile, and the question
 * is asked once there is an account, in the walkthrough and in Account.
 */
export function SignedOutMark() {
  const { user } = useAuth();
  const needsAuth = supabaseIsConfigured();
  useEffect(() => {
    const root = document.documentElement;
    if (needsAuth && !user) root.setAttribute("data-signed-out", "");
    else root.removeAttribute("data-signed-out");
    return () => root.removeAttribute("data-signed-out");
  }, [needsAuth, user]);
  return null;
}
