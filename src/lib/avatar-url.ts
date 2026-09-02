/**
 * Where a profile photo is allowed to come from.
 *
 * A profile photo is fetched by the browser of every person who can see the
 * profile, so whoever serves it learns each of their network addresses and
 * the moment they looked. With any https link accepted, a member of a circle
 * could point their photo at a server they run and keep a visitor log of
 * everybody who opened the member list, which is not something a member list
 * is supposed to tell them.
 *
 * The hosts below are the ones the app itself writes (the photo on somebody's
 * Google account) plus the one general-purpose photo service, keyed on an
 * address, that somebody who signed in by email link can use instead. Neither
 * is a member's own server. There is no upload here, so this is the whole
 * list, and it is deliberately short: a new entry is a new party learning who
 * reads the app.
 *
 * The content policy in `security-headers.ts` is built from the same list, so
 * a photo stored before this rule existed cannot be loaded either. Both ends
 * matter: the check keeps a new one out, the policy stops an old one.
 *
 * Relative imports here and in `security-headers.ts`, because next.config.ts
 * pulls that file in with its own loader, which does not read the `@/` alias.
 */
import { safeHttpUrl } from "./safe-url";

export const AVATAR_HOSTS = ["googleusercontent.com", "gravatar.com"] as const;

/** Every source expression these hosts need in a content policy. */
export function avatarImgSources(): string[] {
  return AVATAR_HOSTS.flatMap((host) => [
    `https://${host}`,
    `https://*.${host}`,
  ]);
}

function hostAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return AVATAR_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`)
  );
}

/**
 * The photo link to store, or null for anything that is not one.
 *
 * Https only, no credentials in it and no control characters, which is what
 * `safeHttpUrl` already says about every link this app renders, and then the
 * host has to be one of the few above.
 */
export function safeAvatarUrl(raw: string | null | undefined): string | null {
  const href = safeHttpUrl(raw, { httpsOnly: true });
  if (!href) return null;
  try {
    return hostAllowed(new URL(href).hostname) ? href : null;
  } catch {
    return null;
  }
}

/** What to tell somebody whose photo link was refused. */
export const AVATAR_HOST_MESSAGE =
  "Use the photo from your Google account, or a link from gravatar.com.";
