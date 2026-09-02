import type { Metadata } from "next";
import {
  OG_IMAGE_HEIGHT,
  OG_IMAGE_PATH,
  OG_IMAGE_WIDTH,
} from "@/lib/seo-routes";
import {
  PRODUCT_BLURB,
  PRODUCT_NAME,
  PRODUCT_SENTENCE,
  SIGNIN_WHO,
} from "@/lib/product";
import { siteUrl } from "@/lib/site-url";

export const SITE_DESCRIPTION = `${PRODUCT_SENTENCE} ${PRODUCT_BLURB}`;

export const LOGIN_DESCRIPTION = `Sign in with Google, or a link we send to your email. ${SIGNIN_WHO}`;

export const COMMUNITIES_DESCRIPTION =
  "Compare portfolios with people you know. Join a circle, or start one.";

export const OG_IMAGE = {
  url: OG_IMAGE_PATH,
  width: OG_IMAGE_WIDTH,
  height: OG_IMAGE_HEIGHT,
  alt: PRODUCT_NAME,
} as const;

export const PRIVATE_ROBOTS = {
  index: false,
  follow: false,
  googleBot: {
    index: false,
    follow: false,
    noimageindex: true,
  },
} as const;

export const PUBLIC_ROBOTS = {
  index: true,
  follow: true,
} as const;

export function canonicalUrl(path: string): string {
  const base = siteUrl();
  if (path === "/") return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function socialTags(title: string, description: string, url: string) {
  return {
    openGraph: {
      title,
      description,
      url,
      siteName: PRODUCT_NAME,
      locale: "en_US",
      type: "website" as const,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image" as const,
      title,
      description,
      images: [OG_IMAGE_PATH],
    },
  };
}

export function publicPageMetadata(opts: {
  title: string | { absolute: string };
  description: string;
  path: string;
  ogTitle?: string;
}): Metadata {
  const url = canonicalUrl(opts.path);
  const ogTitle =
    opts.ogTitle ??
    (typeof opts.title === "string" ? opts.title : opts.title.absolute);
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    robots: PUBLIC_ROBOTS,
    ...socialTags(ogTitle, opts.description, url),
  };
}

/** Generic product card plus noindex. Never leak a signed-in view. */
export function privatePageMetadata(): Metadata {
  const url = siteUrl();
  return {
    title: { absolute: PRODUCT_NAME },
    description: SITE_DESCRIPTION,
    alternates: { canonical: url },
    robots: PRIVATE_ROBOTS,
    ...socialTags(PRODUCT_NAME, SITE_DESCRIPTION, url),
  };
}

export const HOME_METADATA = publicPageMetadata({
  title: { absolute: PRODUCT_NAME },
  description: SITE_DESCRIPTION,
  path: "/",
  ogTitle: PRODUCT_NAME,
});

export const LOGIN_METADATA = publicPageMetadata({
  title: "Sign in",
  description: LOGIN_DESCRIPTION,
  path: "/login",
  ogTitle: `Sign in to ${PRODUCT_NAME}`,
});

/*
  The room is Circle on the dock, in the walkthrough and on the landing, so
  the tab title and the share card say the same word. The path and the
  constant keep the old name: the URL is in links already sent, and the
  identifier is not something a reader sees.
*/
export const COMMUNITIES_METADATA = publicPageMetadata({
  title: "Circle",
  description: COMMUNITIES_DESCRIPTION,
  path: "/communities",
  ogTitle: `Circle · ${PRODUCT_NAME}`,
});
