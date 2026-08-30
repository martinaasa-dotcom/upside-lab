import type { Metadata, Viewport } from "next";
import { Archivo, Geist, Geist_Mono } from "next/font/google";
import { AmbientDither } from "@/components/AmbientDither";
import { ConsentedAnalytics } from "@/components/ConsentedAnalytics";
import { Providers } from "@/components/Providers";
import { WebVitals } from "@/components/WebVitals";
import { MARK_ASSET_VERSION } from "@/lib/brand/mark-version";
import { PRODUCT_NAME } from "@/lib/product";
import {
  OG_IMAGE,
  PUBLIC_ROBOTS,
  SITE_DESCRIPTION,
} from "@/lib/site-metadata";
import { OG_IMAGE_PATH } from "@/lib/seo-routes";
import { SESSION_HINT_SCRIPT } from "@/lib/session-hint";
import { siteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

/**
 * The display face — headings and the wordmark only. Body copy and every
 * figure stay on Geist/Geist Mono, so the two faces divide by job rather
 * than competing.
 *
 * Archivo is a grotesque built to hold up across sizes, which is what this
 * app needs: `font-heading` lands anywhere from a 14px ticker cell to a
 * 24px hero, and a face with real display-only proportions would fall apart
 * at the small end. Against Geist's rounder, wider neo-grotesque it reads
 * as tighter and more set — enough separation to be a pair, not enough to
 * look like two unrelated fonts on one page.
 *
 * `--font-display` rather than `--font-heading`: the latter is a Tailwind
 * theme key in globals.css that generates the `font-heading` utility, and
 * pointing next/font at the same name would have the two definitions
 * fight.
 */
const archivo = Archivo({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: PRODUCT_NAME,
    template: `%s · ${PRODUCT_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: PRODUCT_NAME,
  manifest: "/manifest.webmanifest",
  robots: PUBLIC_ROBOTS,
  alternates: {
    canonical: siteUrl(),
  },
  appleWebApp: {
    capable: true,
    title: PRODUCT_NAME,
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  /*
    Cache-busted on every icon change, because a favicon is one of the few
    things a browser will hold on to past a deploy and a stale one outlives
    the rebrand that replaced it.

    The Apple entry is the 180 square and nothing else. iOS draws its own
    squircle over whatever it is given, so the file it is given must be
    full-bleed, opaque and not already rounded; the 192 that used to sit
    alongside it is a PWA icon with its own rounded corners, and iOS picking
    that one is how an icon ends up rounded twice. See docs/BRAND_MARK.md.
  */
  icons: {
    icon: [
      { url: `/favicon.svg?v=${MARK_ASSET_VERSION}`, type: "image/svg+xml" },
      {
        url: `/icons/icon-16.png?v=${MARK_ASSET_VERSION}`,
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: `/icons/icon-32.png?v=${MARK_ASSET_VERSION}`,
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: `/icons/icon-48.png?v=${MARK_ASSET_VERSION}`,
        sizes: "48x48",
        type: "image/png",
      },
      {
        url: `/icons/icon-192.png?v=${MARK_ASSET_VERSION}`,
        sizes: "192x192",
        type: "image/png",
      },
      { url: `/favicon.ico?v=${MARK_ASSET_VERSION}`, sizes: "16x16 32x32" },
    ],
    shortcut: `/favicon.svg?v=${MARK_ASSET_VERSION}`,
    apple: [
      {
        url: `/apple-touch-icon.png?v=${MARK_ASSET_VERSION}`,
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  openGraph: {
    title: PRODUCT_NAME,
    description: SITE_DESCRIPTION,
    siteName: PRODUCT_NAME,
    locale: "en_US",
    type: "website",
    url: siteUrl(),
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: PRODUCT_NAME,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE_PATH],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    /*
      `suppressHydrationWarning`: the inline script below writes
      `data-session` onto this element before React sees it, so the
      attribute the server rendered and the one the browser has do not
      match. That is the point of it, and it is the arrangement every
      script that prevents a flash before hydration uses.
    */
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "dark font-sans",
        geist.variable,
        geistMono.variable,
        archivo.variable
      )}
      data-timezone="Europe/Tallinn"
    >
      <head>
        {/*
          In the head and synchronous, so it has run before the body is
          parsed and nothing of the wrong page is ever painted.

          It marks the root element with what this browser last knew about
          the session, which is how a reader who is signed in stops being
          shown the signed-out landing for the length of a cold bundle
          download. `globals.css` spends the mark, and
          `src/lib/session-hint.ts` explains why the answer comes from the
          browser rather than from the session cookie, which would make
          every route in the product dynamic. The app's CSP keeps
          `'unsafe-inline'` in `script-src` for Next's own Flight scripts,
          so this one runs too.
        */}
        <script dangerouslySetInnerHTML={{ __html: SESSION_HINT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <AmbientDither />
        <Providers>{children}</Providers>
        <WebVitals />
        <ConsentedAnalytics />
      </body>
    </html>
  );
}
