"use client";

import { AuthProvider } from "@/components/AuthProvider";
import { AnalyticsConsentBanner } from "@/components/AnalyticsConsentBanner";
import { FeedbackHost } from "@/components/FeedbackHost";
import { OfflineBanner } from "@/components/OfflineBanner";
import { OfflineRuntime } from "@/components/OfflineRuntime";
import { PullToRefresh } from "@/components/PullToRefresh";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useVisualViewportVars } from "@/lib/use-visual-viewport";
import type { ReactNode } from "react";

/**
 * Root-level providers, mounted ONCE in the root layout instead of per-page.
 * AuthProvider used to be wrapped separately inside every page.tsx (/,
 * /account, /admin, /upside-portfolio, /communities, /communities/[id],
 * /communities/join, /account/join) -- since each is its own top-level App
 * Router segment, navigating between them (even client-side via next/link)
 * remounted AuthProvider from scratch every time, re-running a fresh
 * supabase.auth.getUser() round-trip + /api/auth/me profile fetch on every
 * single page change across the whole app. Mounted here above {children}
 * instead, it survives navigation and only ever runs that check once per
 * visit.
 */
function VisualViewportVars() {
  useVisualViewportVars();
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <TooltipProvider>
        <VisualViewportVars />
        <OfflineRuntime />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <OfflineBanner />
        <AnalyticsConsentBanner />
        {/*
          Pull the page down for new numbers.

          Mounted here rather than inside a room because it belongs to the
          chrome: it is the same gesture everywhere, it moves whichever
          `<main>` the finger is actually in, and its ring has to sit outside
          that element's transform to stay put while the page travels under
          it.
        */}
        <PullToRefresh />
        <FeedbackHost>
          <WorkspaceShell>{children}</WorkspaceShell>
        </FeedbackHost>
        <Toaster />
      </TooltipProvider>
    </AuthProvider>
  );
}
