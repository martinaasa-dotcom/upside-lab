/** Shared Resend send. Key stays in env. Never hardcode it. */

import { fallbackNoteHtml } from "@/lib/email-letter";
import { Resend } from "resend";

const DEFAULT_FROM = "Upside Lab <notes@upsidelab.app>";

export function noteEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendNoteEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  /**
   * Same key -> the provider sends once. Resend holds these for 24h, which
   * covers every slot and retry of one Sunday letter. Pass a key for any
   * mail a scheduler can attempt more than once; leave it off for mail a
   * person triggered, where a second one is a second intention.
   */
  idempotencyKey?: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim() || DEFAULT_FROM;
  if (!key) return false;
  const resend = new Resend(key);
  const { error } = await resend.emails.send(
    {
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? fallbackNoteHtml(input.text),
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      headers: {
        "List-Unsubscribe": "<https://upsidelab.app/account>",
        // Gmail treats this as the message's identity. Random means every
        // send is its own entity -- which is right for mail a person asked
        // for, and is why three copies of one Sunday letter stacked up as
        // three separate rows. Keyed mail reuses the key, so a duplicate
        // that ever does get out lands as the same message, not a new one.
        "X-Entity-Ref-ID": input.idempotencyKey ?? crypto.randomUUID(),
      },
    },
    input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined
  );
  return !error;
}
