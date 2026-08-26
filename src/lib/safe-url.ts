/**
 * Absolute http(s) URL, or null. Anything rendered into href or src has
 * to pass through here: a news link from Yahoo, a markdown link from
 * Margus, or a photo URL somebody typed. javascript:, data:, and
 * protocol-relative strings never come back as a URL.
 */
export function safeHttpUrl(
  raw: string | null | undefined,
  opts?: { httpsOnly?: boolean }
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol === "https:") return url.href;
  if (!opts?.httpsOnly && url.protocol === "http:") return url.href;
  return null;
}
