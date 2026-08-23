/**
 * One letterhead for every Upside Lab inbox note.
 *
 * The palette is the app's own, converted from the oklch tokens in
 * globals.css to sRGB hex because mail clients don't understand oklch:
 *   --background oklch(0 0 0)          -> #000000
 *   --card       oklch(0.205 0 0)      -> #171717
 *   --muted      oklch(0.269 0 0)      -> #262626
 *   --foreground oklch(0.985 0 0)      -> #fafafa
 *   --muted-foreground oklch(0.708 0 0)-> #a1a1a1
 *   --primary    oklch(0.8 0.09 90)    -> #d4bc79
 *   --gain       oklch(0.696 0.17 162) -> #00bc7d
 *   --loss       oklch(0.645 0.246 16) -> #ff2056
 * Keep them in step with globals.css; if a token moves, re-convert rather
 * than eyeballing a near-enough hex.
 *
 * System fonts only — mail clients strip web fonts. Money uses the mono
 * stack so columns of numbers line up the way they do in the app.
 */

export const EMAIL = {
  app: "#000000",
  card: "#171717",
  well: "#262626",
  cream: "#fafafa",
  muted: "#a1a1a1",
  gold: "#d4bc79",
  gain: "#00bc7d",
  loss: "#ff2056",
  line: "#262626",
  cardLine: "#333333",
  sans: "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif",
  mono: "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace",
  lockup: "https://upsidelab.app/icons/email-lockup.png?v=3",
  origin: "https://upsidelab.app",
} as const;

export function escapeEmail(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function emailKicker(text: string): string {
  return `<p style="margin:0;font-family:${EMAIL.sans};font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${EMAIL.gold}">${escapeEmail(text)}</p>`;
}

export function emailHairline(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:32px 0 0 0">
  <tr><td style="height:1px;background:${EMAIL.line};font-size:0;line-height:0">&nbsp;</td></tr>
</table>`;
}

export function emailSection(title: string, inner: string): string {
  return `${emailHairline()}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0 0 0">
  <tr><td>${emailKicker(title)}</td></tr>
  <tr><td style="padding:14px 0 0 0">${inner}</td></tr>
</table>`;
}

/** A raised box so the week hero, Margus, and each notice sit apart. */
export function emailCard(inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:20px 0 0 0;background:${EMAIL.card};border:1px solid ${EMAIL.cardLine};border-radius:14px">
  <tr><td style="padding:22px 20px">${inner}</td></tr>
</table>`;
}

export function emailButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:36px 0 0 0">
  <tr>
    <td bgcolor="${EMAIL.gold}" style="border-radius:8px">
      <a href="${escapeEmail(href)}" style="display:inline-block;padding:13px 22px;font-family:${EMAIL.sans};font-size:14px;letter-spacing:0.01em;font-weight:600;color:#0a0a0a;text-decoration:none">${escapeEmail(label)}</a>
    </td>
  </tr>
</table>`;
}

export function emailAccountFooter(): string {
  return `<p style="margin:36px 0 0 0;font-family:${EMAIL.sans};font-size:12px;line-height:1.6;color:${EMAIL.muted}">One email a week, on Sunday. Turn it off any time in <a href="${EMAIL.origin}/account" style="color:${EMAIL.gold};text-decoration:underline">Account</a>.</p>`;
}

export function emailPreheader(preview: string): string {
  const pad = "&#847;&zwnj;&nbsp;".repeat(80);
  return `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeEmail(preview)}${pad}</div>`;
}

export function wrapEmailLetter(input: {
  title: string;
  preview: string;
  dateLine?: string;
  body: string;
  footer?: string;
  hideOpener?: boolean;
  /**
   * Set the date on the lockup's own line, right-aligned, with a hairline
   * under the pair. A stacked lockup, date and then a large card left the
   * top of the letter reading as three unrelated things with air between
   * them; as a masthead it is one band, and the hairline is the same rule
   * that separates every section below it.
   */
  mastheadDate?: boolean;
}): string {
  const masthead = Boolean(input.mastheadDate && input.dateLine);
  const opener =
    input.hideOpener || !input.preview
      ? ""
      : `<p style="margin:20px 0 0 0;font-family:${EMAIL.sans};font-size:17px;line-height:1.45;color:${EMAIL.cream}">${escapeEmail(input.preview)}</p>`;
  const date =
    input.dateLine && !masthead
      ? `<p style="margin:${opener ? "10px" : "14px"} 0 0 0;font-family:${EMAIL.sans};font-size:13px;line-height:1.4;letter-spacing:0.02em;color:${EMAIL.muted}">${escapeEmail(input.dateLine)}</p>`
      : "";
  const lockup = `<img src="${EMAIL.lockup}" width="240" height="44" alt="Upside Lab" style="display:block;border:0" />`;
  const head = masthead
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%">
              <tr>
                <td style="vertical-align:middle">${lockup}</td>
                <td style="vertical-align:middle;text-align:right;font-family:${EMAIL.sans};font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:${EMAIL.muted}">${escapeEmail(input.dateLine ?? "")}</td>
              </tr>
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:18px 0 0 0">
              <tr><td style="height:1px;background:${EMAIL.line};font-size:0;line-height:0">&nbsp;</td></tr>
            </table>`
    : lockup;
  const footer = input.footer ?? "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<title>${escapeEmail(input.title)}</title>
<style>
  :root { color-scheme: dark; }
  html, body { margin:0 !important; padding:0 !important; background:${EMAIL.app} !important; width:100% !important; }
</style>
</head>
<body style="margin:0;padding:0;width:100%;background:${EMAIL.app};color:${EMAIL.cream}" bgcolor="${EMAIL.app}">
${emailPreheader(input.preview)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${EMAIL.app}" style="width:100%;background:${EMAIL.app}">
  <tr>
    <td align="center" style="padding:0;background:${EMAIL.app}" bgcolor="${EMAIL.app}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:${EMAIL.app}">
        <tr>
          <td style="height:3px;background:${EMAIL.gold};font-size:0;line-height:0">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:${masthead ? "34px" : "44px"} 28px 56px 28px;background:${EMAIL.app}">
            ${head}
            ${opener}
            ${date}
            ${input.body}
            ${footer}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function fallbackNoteHtml(text: string): string {
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const last = blocks[blocks.length - 1];
  const body = blocks
    .map((block, i) => {
      const muted =
        block === last &&
        (/Turn these notes off/i.test(block) || /one-time note/i.test(block));
      const style = muted
        ? `margin:28px 0 0 0;font-family:${EMAIL.sans};font-size:12px;line-height:1.5;color:${EMAIL.muted}`
        : i === 0
          ? `margin:36px 0 0 0;font-family:${EMAIL.sans};font-size:20px;line-height:1.45;font-weight:400;color:${EMAIL.cream}`
          : `margin:16px 0 0 0;font-family:${EMAIL.sans};font-size:16px;line-height:1.55;color:${EMAIL.cream}`;
      return `<p style="${style}">${escapeEmail(block).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
  const preview = blocks[0] ?? "Upside Lab";
  return wrapEmailLetter({
    title: "Upside Lab",
    preview,
    body,
    hideOpener: true,
  });
}

export function communityInviteCopy(input: {
  name: string;
  url: string;
  classroom: boolean;
}): { subject: string; text: string; html: string } {
  const name = input.name.trim() || (input.classroom ? "a class" : "a Circle");
  const subject = `Join ${name}`;
  const lead = input.classroom
    ? `You've been invited into ${name}. Sign in with Google and you get a paper portfolio to work from.`
    : `You've been invited into ${name}. Sign in with Google and pick which portfolios to share. Today's prices only.`;
  const text = [
    lead,
    input.url,
    "If you didn't expect this, ignore it.",
  ].join("\n\n");
  const html = wrapEmailLetter({
    title: subject,
    preview: lead,
    hideOpener: true,
    body: `${emailKicker("Invite")}
<div style="height:18px;font-size:0;line-height:0">&nbsp;</div>
<p style="margin:0;font-family:${EMAIL.sans};font-size:26px;line-height:1.25;font-weight:400;letter-spacing:-0.02em;color:${EMAIL.cream}">Join ${escapeEmail(name)}</p>
<p style="margin:22px 0 0 0;font-family:${EMAIL.sans};font-size:17px;line-height:1.55;color:${EMAIL.cream}">${escapeEmail(lead)}</p>
${emailButton(input.url, "Open the invite")}
<p style="margin:28px 0 0 0;font-family:${EMAIL.sans};font-size:12px;line-height:1.5;color:${EMAIL.muted}">If you didn't expect this, ignore it.</p>`,
  });
  return { subject, text, html };
}

export function emptyBookNudgeHtml(text: string): string {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const preview = blocks[0] ?? "Your portfolio is still empty";
  const bodyBlocks = blocks.filter(
    (b) =>
      !/^https?:\/\//i.test(b) &&
      !/one-time note/i.test(b) &&
      b !== preview
  );
  const prose = bodyBlocks
    .map(
      (block, i) =>
        `<p style="margin:${i === 0 ? "22px" : "16px"} 0 0 0;font-family:${EMAIL.sans};font-size:17px;line-height:1.55;color:${EMAIL.cream}">${escapeEmail(block)}</p>`
    )
    .join("");
  return wrapEmailLetter({
    title: preview,
    preview,
    hideOpener: true,
    body: `${emailKicker("A note")}
<div style="height:18px;font-size:0;line-height:0">&nbsp;</div>
<p style="margin:0;font-family:${EMAIL.sans};font-size:26px;line-height:1.25;font-weight:400;letter-spacing:-0.02em;color:${EMAIL.cream}">${escapeEmail(preview)}</p>
${prose}
${emailButton(EMAIL.origin, "Open Upside Lab")}
<p style="margin:28px 0 0 0;font-family:${EMAIL.sans};font-size:12px;line-height:1.5;color:${EMAIL.muted}">This is a one-time note. The Sunday email starts once there are names in your portfolio. Turn it off in <a href="${EMAIL.origin}/account" style="color:${EMAIL.gold};text-decoration:underline">Account</a>.</p>`,
  });
}
