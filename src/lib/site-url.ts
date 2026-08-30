import { PRODUCT_DOMAIN } from "@/lib/product";

/**
 * Canonical public origin. Default is upsidelab.app.
 *
 * UPSIDE_CANONICAL_HOST wins over NEXT_PUBLIC_SITE_URL so OG tags, sitemap,
 * OpenRouter referer, and the 301 target cannot disagree. www. is stripped.
 * A known legacy host in either env falls back to the apex, never advertised.
 *
 * Redirects stay off until one of those envs is set. Shipping a 301 onto a
 * parking page took the live alias down once; do not set them until the
 * domain's nameservers point at this project.
 *
 * Reserved TLDs (.test, .example, .invalid, .localhost) are ignored, same as
 * localhost. GitHub Actions sets NEXT_PUBLIC_SITE_URL=https://ci.upsidelab.test.
 */

const LEGACY_HOSTS = new Set([
  "upside-upthink-solutions.vercel.app",
  "upside-git-main-upthink-solutions.vercel.app",
  "upside-upthink1.vercel.app",
  "upside-git-main-upthink1.vercel.app",
  "portfolio.vercel.app",
  "www.upsidelab.app",
]);

/** Hostname only: no scheme, path, port, or trailing slash. */
export function normalizeHostname(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .split("/")[0]
    .split(":")[0]
    .toLowerCase();
}

export function isLegacyHost(hostname: string): boolean {
  const h = normalizeHostname(hostname);
  if (LEGACY_HOSTS.has(h)) return true;
  if (h === `www.${PRODUCT_DOMAIN}`) return true;
  if (h.startsWith("portfolio-") && h.endsWith(".vercel.app")) return true;
  return false;
}

export function isLocalHost(hostname: string): boolean {
  const h = normalizeHostname(hostname);
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "[::1]" ||
    h.endsWith(".local")
  );
}

/** Live app host, including the www alias that 301s to the apex. */
export function isCanonicalAppHost(hostname: string): boolean {
  const h = normalizeHostname(hostname);
  return h === PRODUCT_DOMAIN || h === `www.${PRODUCT_DOMAIN}`;
}

/** RFC 2606 / 6761 names. CI sets NEXT_PUBLIC_SITE_URL to *.test; never advertise it. */
export function isNonPublicHost(hostname: string): boolean {
  if (isLocalHost(hostname)) return true;
  const h = normalizeHostname(hostname);
  return (
    h.endsWith(".test") ||
    h.endsWith(".example") ||
    h.endsWith(".invalid") ||
    h.endsWith(".localhost")
  );
}

function apex(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

function explicitCanonicalInput(): string | null {
  const raw =
    process.env.UPSIDE_CANONICAL_HOST?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    null;
  return raw;
}

/**
 * Host to 301 toward, or null when redirects must stay off.
 * Shared by the proxy so OG/sitemap and the live 301 cannot drift.
 */
export function redirectTarget(): string | null {
  const raw = explicitCanonicalInput();
  if (!raw) return null;
  const h = apex(normalizeHostname(raw));
  if (!h || isNonPublicHost(h)) return null;
  if (isLegacyHost(h)) return PRODUCT_DOMAIN;
  return h;
}

function host(): string {
  return redirectTarget() ?? PRODUCT_DOMAIN;
}

export function siteUrl(): string {
  return `https://${host()}`;
}

/**
 * Any *.vercel.app host that is not a known production alias.
 * Previews must keep working; production aliases are in LEGACY_HOSTS.
 */
export function isVercelPreviewHost(hostname: string): boolean {
  const h = normalizeHostname(hostname);
  if (!h.endsWith(".vercel.app")) return false;
  if (isLegacyHost(h)) return false;
  if (h === host()) return false;
  return true;
}

/**
 * Post-login `?next=` must stay on this origin. A scheme, protocol-relative
 * URL, or backslash lands on home instead of sending the session elsewhere.
 */
export function safeInternalPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return "/";
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return "/";
  if (trimmed.includes("\\")) return "/";
  if (trimmed.includes("://")) return "/";
  return trimmed;
}

/** Path + query to send back to after Google sign-in. Never the callback itself. */
export function currentInternalNext(): string {
  if (typeof window === "undefined") return "/";
  const path = `${window.location.pathname}${window.location.search}`;
  if (path.startsWith("/auth/")) return "/";
  return safeInternalPath(path);
}
