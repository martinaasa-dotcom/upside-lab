/**
 * Browser security headers for upsidelab.app.
 *
 * Static headers (HSTS, frame denial, nosniff, …) live in next.config.ts so
 * they cover every response, including static files that skip proxy.ts.
 *
 * CSP is set in proxy.ts, not next.config. Two CSP headers are AND'd by
 * the browser, so a second copy here would only make the policy stricter
 * in surprising ways.
 */

import { avatarImgSources } from "./avatar-url";

export const STATIC_SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin-allow-popups",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

function supabaseConnectSrc(): string[] {
  const raw =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  if (!raw) {
    return ["https://*.supabase.co", "wss://*.supabase.co"];
  }
  try {
    const origin = new URL(raw).origin;
    const host = new URL(raw).host;
    return [origin, `wss://${host}`];
  } catch {
    return ["https://*.supabase.co", "wss://*.supabase.co"];
  }
}

/**
 * CSP for the prerendered app shell.
 *
 * A per-request script nonce cannot work here. The home HTML is ISR /
 * CDN-cached (`x-nextjs-prerender`), and Next.js only stamps nonces onto
 * dynamically rendered markup. Live was shipping a fresh nonce in the
 * header against cached inline Flight scripts with no nonce, so the
 * browser blocked hydration and the splash never left.
 *
 * `'unsafe-inline'` is required for those two Next.js Flight scripts.
 * A nonce in script-src would ignore `'unsafe-inline'` (CSP spec).
 * `'strict-dynamic'` stays off: Vercel Analytics injects same-origin
 * scripts at runtime without a nonce.
 */
export function buildContentSecurityPolicy(): string {
  const isDev = process.env.NODE_ENV !== "production";
  const isPreview = process.env.VERCEL_ENV === "preview";
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    "https://va.vercel-scripts.com",
    ...(isDev ? ["'unsafe-eval'"] : []),
  ];
  const connectSrc = [
    "'self'",
    ...supabaseConnectSrc(),
    "https://va.vercel-scripts.com",
    "https://vitals.vercel-insights.com",
    ...(isPreview ? ["https://vercel.live", "wss://ws-us3.pusher.com"] : []),
    ...(isDev
      ? [
          "http://localhost:*",
          "http://127.0.0.1:*",
          "ws://localhost:*",
          "ws://127.0.0.1:*",
        ]
      : []),
  ];

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    /*
      Named hosts rather than every https host there is. A profile photo is
      the one image in this app that comes from somewhere else, and a photo
      link a member chose is a request every other member's browser makes:
      see avatar-url.ts. `https:` here would keep loading the ones stored
      before that rule existed.
    */
    `img-src 'self' data: blob: ${avatarImgSources().join(" ")}`,
    "font-src 'self'",
    `connect-src ${connectSrc.join(" ")}`,
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}
