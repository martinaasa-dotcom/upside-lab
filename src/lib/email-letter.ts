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

import { MARK_ASSET_VERSION } from "@/lib/brand/mark-version";

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
  lockup: `https://upsidelab.app/icons/email-lockup.png?v=${MARK_ASSET_VERSION}`,
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

/**
 * The line at the foot of the letter.
 *
 * With a link that stops the letter by itself when there is one, and the
 * account page otherwise. The difference matters to the reader who has
 * stopped using Upside Lab: sending them to a sign-in to turn off mail they
 * no longer want is how a message gets marked as spam instead.
 */
export function emailAccountFooter(unsubscribeUrl?: string): string {
  const off = unsubscribeUrl
    ? `<a href="${unsubscribeUrl}" style="color:${EMAIL.gold};text-decoration:underline">Stop it here</a>, or turn it off any time in <a href="${EMAIL.origin}/account" style="color:${EMAIL.gold};text-decoration:underline">Account</a>.`
    : `Turn it off any time in <a href="${EMAIL.origin}/account" style="color:${EMAIL.gold};text-decoration:underline">Account</a>.`;

  return `<p style="margin:36px 0 0 0;font-family:${EMAIL.sans};font-size:12px;line-height:1.6;color:${EMAIL.muted}">One email a week, on Sunday. ${off}</p>`;
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
  /*
    The subject carries no text anybody typed, and that is the whole of why
    it is worded this way.

    A circle's name is its creator's to choose, anyone signed in can make
    one, and it was going straight into the subject line as `Join <name>`.
    A circle called "URGENT: your Upside Lab account is suspended" is a
    phishing subject, sent from the address this product's sign-in links and
    Sunday letters come from, to twenty strangers a call. Trimming the name
    does not help: the abuse is the sentence, not the characters in it.

    So the subject says what the message is, and the name is in the body,
    where it is escaped and where nobody's inbox list shows it. A recipient
    who does not recognise the sender learns less from the subject than
    before, and that is the correct trade for a message sent to an address
    that never asked for it.
  */
  const subject = input.classroom
    ? "You have been invited to a class on Upside Lab"
    : "You have been invited to a circle on Upside Lab";
  const lead = input.classroom
    ? `You've been invited into ${name}. Sign in and you get a paper portfolio to work from.`
    : `You've been invited into ${name}. Sign in and pick which portfolios to share. Today's prices only.`;
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

/**
 * Sent to an address somebody has asked to add to their account.
 *
 * The one letter this app sends that can land in a mailbox whose owner has
 * never heard of Upside Lab, so ignoring it has to be a real answer, and it
 * is: nothing is joined until the link is opened.
 *
 * The account is named by the address it signs in with, never by the name on
 * the profile. A name is typed by whoever asked and can be made to say
 * anything, including something that sounds like it came from us. An address
 * cannot: it is the one thing about the asking account that had to be proved.
 */
export function confirmAddressCopy(input: {
  url: string;
  requestedBy: string | null;
}): { subject: string; text: string; html: string } {
  const subject = "Confirm this address for Upside Lab";
  const asker = input.requestedBy
    ? `The Upside Lab account at ${input.requestedBy}`
    : "An Upside Lab account";
  const lead = `${asker} asked to sign in with this address as well. Confirm it and both addresses open that same account, with the same portfolios and the same circles.`;
  const ignore =
    "If you were not expecting this, ignore it. Nothing is joined unless the link is opened.";
  const text = [lead, input.url, "The link lasts one hour and works once.", ignore].join(
    "\n\n"
  );
  const html = wrapEmailLetter({
    title: subject,
    preview: lead,
    hideOpener: true,
    body: `${emailKicker("Your account")}
<div style="height:18px;font-size:0;line-height:0">&nbsp;</div>
<p style="margin:0;font-family:${EMAIL.sans};font-size:26px;line-height:1.25;font-weight:400;letter-spacing:-0.02em;color:${EMAIL.cream}">Confirm this address</p>
<p style="margin:22px 0 0 0;font-family:${EMAIL.sans};font-size:17px;line-height:1.55;color:${EMAIL.cream}">${escapeEmail(lead)}</p>
${emailButton(input.url, "Confirm this address")}
<p style="margin:28px 0 0 0;font-family:${EMAIL.sans};font-size:12px;line-height:1.5;color:${EMAIL.muted}">The link lasts one hour and works once. ${escapeEmail(ignore)}</p>`,
  });
  return { subject, text, html };
}

/**
 * Sent to the address an account already signs in with, once a second address
 * has been confirmed on it.
 *
 * The whole feature turns on somebody proving they hold a mailbox, and that
 * proof happens in the mailbox being added, which the owner of the account may
 * never look at. So the account's own address is told afterwards. If it was
 * not them who asked, this letter is the only thing that would ever say so,
 * and it names the one step that takes it back again.
 */
export function addressConnectedCopy(input: {
  address: string;
  accountUrl: string;
}): { subject: string; text: string; html: string } {
  const subject = "A second address now opens your Upside Lab account";
  const lead = `${input.address} was confirmed a moment ago, so it signs in to this account as well. Both addresses land in the same place, with the same portfolios and the same circles.`;
  const undo =
    "If that was not you, open My account, take the address off under your sign-in addresses, and it stops working straight away.";
  const text = [lead, input.accountUrl, undo].join("\n\n");
  const html = wrapEmailLetter({
    title: subject,
    preview: lead,
    hideOpener: true,
    body: `${emailKicker("Your account")}
<div style="height:18px;font-size:0;line-height:0">&nbsp;</div>
<p style="margin:0;font-family:${EMAIL.sans};font-size:26px;line-height:1.25;font-weight:400;letter-spacing:-0.02em;color:${EMAIL.cream}">A second address was connected</p>
<p style="margin:22px 0 0 0;font-family:${EMAIL.sans};font-size:17px;line-height:1.55;color:${EMAIL.cream}">${escapeEmail(lead)}</p>
${emailButton(input.accountUrl, "Open my account")}
<p style="margin:28px 0 0 0;font-family:${EMAIL.sans};font-size:12px;line-height:1.5;color:${EMAIL.muted}">${escapeEmail(undo)}</p>`,
  });
  return { subject, text, html };
}

/**
 * Sent to an address somebody asked for and could not have.
 *
 * The screen they asked from is told the same thing whether an address is free
 * or already spoken for, because a signed-in reader who can type any address
 * in the world and be told which ones have accounts here has been handed a way
 * of asking about strangers. The refusal still has to go somewhere, so it goes
 * to the mailbox it is actually about, which is also the one place it is news.
 */
export function addressNotConnectedCopy(input: {
  requestedBy: string | null;
  support: string;
}): { subject: string; text: string; html: string } {
  const subject = "Somebody asked to connect this address to Upside Lab";
  const asker = input.requestedBy
    ? `The Upside Lab account at ${input.requestedBy}`
    : "An Upside Lab account";
  const lead = `${asker} asked to sign in with this address as well. It was not connected, because this address already reaches an Upside Lab account of its own. Nothing about either account changed and nobody was let in.`;
  const nothing = `There is nothing for you to do. If you were expecting this and want the two joined, write to ${input.support} and a person will look at it.`;
  const text = [lead, nothing].join("\n\n");
  const html = wrapEmailLetter({
    title: subject,
    preview: lead,
    hideOpener: true,
    body: `${emailKicker("Your account")}
<div style="height:18px;font-size:0;line-height:0">&nbsp;</div>
<p style="margin:0;font-family:${EMAIL.sans};font-size:26px;line-height:1.25;font-weight:400;letter-spacing:-0.02em;color:${EMAIL.cream}">This address was not connected</p>
<p style="margin:22px 0 0 0;font-family:${EMAIL.sans};font-size:17px;line-height:1.55;color:${EMAIL.cream}">${escapeEmail(lead)}</p>
<p style="margin:28px 0 0 0;font-family:${EMAIL.sans};font-size:12px;line-height:1.5;color:${EMAIL.muted}">${escapeEmail(nothing)}</p>`,
  });
  return { subject, text, html };
}

/**
 * Sent when somebody asks to sign in without Google.
 *
 * The link opens a page. It does not sign them in on its own, because mail
 * scanners fetch every URL they see and a fetch is not a decision. The
 * button on that page is.
 */
export function signInLinkCopy(input: { url: string }): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = "Sign in to Upside Lab";
  const lead =
    "Here is your sign-in link for Upside Lab. Open it, then press Sign in on the page. That is the step that actually opens the account.";
  const ignore =
    "If you did not ask for this, ignore it. Nobody is signed in unless that button is pressed.";
  const text = [lead, input.url, "The link lasts one hour and works once.", ignore].join(
    "\n\n"
  );
  const html = wrapEmailLetter({
    title: subject,
    preview: lead,
    hideOpener: true,
    body: `${emailKicker("Your account")}
<div style="height:18px;font-size:0;line-height:0">&nbsp;</div>
<p style="margin:0;font-family:${EMAIL.sans};font-size:26px;line-height:1.25;font-weight:400;letter-spacing:-0.02em;color:${EMAIL.cream}">Sign in to Upside Lab</p>
<p style="margin:22px 0 0 0;font-family:${EMAIL.sans};font-size:17px;line-height:1.55;color:${EMAIL.cream}">${escapeEmail(lead)}</p>
${emailButton(input.url, "Open the sign-in page")}
<p style="margin:28px 0 0 0;font-family:${EMAIL.sans};font-size:12px;line-height:1.5;color:${EMAIL.muted}">The link lasts one hour and works once. ${escapeEmail(ignore)}</p>`,
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
