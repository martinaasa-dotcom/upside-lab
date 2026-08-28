"use client";

import { Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CARD, Panel, PanelHeader } from "@/components/ui/Panel";
import {
  ADDRESS_MESSAGES,
  addressOutcomeIsGood,
  isAddressOutcome,
} from "@/lib/auth/account-addresses";
import { cn } from "@/lib/format";
import { PRODUCT_NAME } from "@/lib/product";

/*
  Every way into one account, on one screen.

  A person has one Upside Lab account, one set of portfolios and one seat in
  every circle they joined, and often more than one mailbox: the address they
  signed up with on a laptop, and the Google account their phone is signed in
  to. Without this they make a second account, which is a second set of empty
  portfolios and a circle nobody is in.

  Two ways to add one, because the two mailboxes people actually have arrive
  differently. A Google account proves itself in the handshake and is added on
  the spot. Anything else is sent a link, and nothing is joined until somebody
  opens it.
*/

type LinkedAddress = {
  id: string;
  email: string;
  verified: boolean;
  addedAt: string;
};

type AddressList = {
  primaryEmail: string | null;
  addresses: LinkedAddress[];
  canSend: boolean;
  googleEnabled: boolean;
  max: number;
};

type Answer = {
  error?: string;
  sent?: string;
  note?: string;
  /*
    A spelling worth asking about before anything is sent, and the address as
    it was typed, so the form can offer both and correct nobody by surprise.
  */
  suggestion?: string;
  typed?: string;
};

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5a4.7 4.7 0 0 1-2 3.1l3.2 2.5c1.9-1.7 3-4.3 3-7.3 0-.7-.1-1.4-.2-2z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 5-.9 6.7-2.3l-3.2-2.5c-.9.6-2 1-3.5 1a6 6 0 0 1-5.7-4.1l-3.3 2.6A10 10 0 0 0 12 22z"
      />
      <path fill="#FBBC05" d="M6.3 14.1a6 6 0 0 1 0-3.8L3 7.7a10 10 0 0 0 0 8.6z" />
      <path
        fill="#4285F4"
        d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3 7.7l3.3 2.6A6 6 0 0 1 12 6.1z"
      />
    </svg>
  );
}

const ROW = cn(CARD, "flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2");

export function SignInAddresses() {
  const router = useRouter();
  const fieldId = useId();
  const [list, setList] = useState<AddressList | null>(null);
  const [typed, setTyped] = useState("");
  const [answer, setAnswer] = useState<Answer>({});
  const [pending, setPending] = useState(false);
  /*
    The word the Google handshake came back with. It travels as a redirect and
    can only carry a word, so the sentence is looked up here from the same map
    the form's answers come from.
  */
  const [handshake, setHandshake] = useState<{ good: boolean; message: string } | null>(
    null
  );

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/account/addresses", { signal, cache: "no-store" });
      if (!res.ok) return;
      setList((await res.json()) as AddressList);
    } catch {
      /* offline, or the reader left. The panel simply does not appear. */
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get("address");
    if (!isAddressOutcome(outcome)) return;
    setHandshake({
      good: addressOutcomeIsGood(outcome),
      message: ADDRESS_MESSAGES[outcome],
    });
    router.replace("/account", { scroll: false });
  }, [router]);

  async function send(email: string, confirmed: boolean) {
    setPending(true);
    setHandshake(null);
    try {
      const res = await fetch("/api/account/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, confirmed }),
      });
      const data = (await res.json().catch(() => ({}))) as Answer;
      setAnswer(data);
      if (data.sent || data.note) {
        setTyped("");
        await load();
        return;
      }
      /*
        The field goes back to holding the address the server read, so a
        refusal leaves something to correct rather than the reader retyping
        the whole thing. It matters most after a "did you mean", where the
        address they just pressed is not the one still in the box.
      */
      if (data.typed) setTyped(data.typed);
    } catch {
      setAnswer({ error: ADDRESS_MESSAGES.failed });
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    setHandshake(null);
    setAnswer({});
    try {
      await fetch("/api/account/addresses", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await load();
    } catch {
      setAnswer({ error: ADDRESS_MESSAGES.failed });
    }
  }

  // Nothing to say until we know what is on the account.
  if (!list?.primaryEmail) return null;

  const full = list.addresses.length >= list.max;
  const asked =
    answer.suggestion && answer.typed
      ? { suggestion: answer.suggestion, typed: answer.typed }
      : null;

  return (
    <Panel>
      <PanelHeader
        title="Ways to sign in"
        subtitle="Every address here opens this account, with the same portfolios and the same circles. Nothing new is made."
      />

      <div className="flex flex-col gap-2">
        <div className={ROW}>
          <span className="min-w-0 flex-1 truncate font-mono text-sm">
            {list.primaryEmail}
          </span>
          <Badge variant="outline">Main</Badge>
        </div>

        {list.addresses.map((address) => (
          <div key={address.id} className={ROW}>
            <span className="min-w-0 flex-1 truncate font-mono text-sm">
              {address.email}
            </span>

            {address.verified ? (
              <Badge variant="outline">Signs in</Badge>
            ) : (
              <Badge variant="warning">Waiting</Badge>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void remove(address.id)}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>

      {handshake ? (
        <p
          role="status"
          className={cn(
            "text-sm",
            handshake.good ? "text-muted-foreground" : "text-loss"
          )}
        >
          {handshake.message}
        </p>
      ) : null}

      {list.googleEnabled ? (
        <div>
          <Button asChild variant="outline" className="gap-2.5">
            <a href="/auth/google?intent=link&next=/account">
              <GoogleGlyph />
              Connect a Google account
            </a>
          </Button>
        </div>
      ) : null}

      {/*
        The same "did you mean" question the address field would want anywhere
        else, for the same reason: one letter out and the link goes to somebody
        else's mailbox, and plenty of real domains sit one letter from a
        famous one.
      */}
      {asked ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            You typed {asked.typed}. Did you mean {asked.suggestion}?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={pending}
              onClick={() => void send(asked.suggestion, true)}
            >
              <Mail data-icon="inline-start" />
              Send to {asked.suggestion}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => void send(asked.typed, true)}
            >
              No, {asked.typed} is right
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="flex max-w-md flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!typed.trim() || pending) return;
            void send(typed, false);
          }}
        >
          <Label htmlFor={fieldId}>Add another address</Label>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id={fieldId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="you@gmail.com"
              aria-invalid={Boolean(answer.error) || undefined}
              aria-describedby={answer.error ? "address-error" : undefined}
              className="sm:flex-1"
            />
            <Button
              type="submit"
              variant="outline"
              disabled={pending || full || !list.canSend}
              className="shrink-0"
            >
              {pending ? "Sending" : "Send a link"}
            </Button>
          </div>

          {full ? (
            <p className="text-sm text-muted-foreground">{ADDRESS_MESSAGES.limit}</p>
          ) : !list.canSend ? (
            <p className="text-sm text-muted-foreground">{ADDRESS_MESSAGES["no-mail"]}</p>
          ) : null}
        </form>
      )}

      {answer.error ? (
        <p id="address-error" role="alert" className="text-sm text-loss">
          {answer.error}
        </p>
      ) : null}

      {answer.note ? (
        <p role="status" className="text-sm text-muted-foreground">
          {answer.note}
        </p>
      ) : null}

      {answer.sent ? (
        <p role="status" className="text-sm text-muted-foreground">
          {answer.sent}
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        You sign in with Google, so every address here is one you can use to
        sign in to Google. Removing an address closes that way in and changes
        nothing else about your {PRODUCT_NAME} account.
      </p>
    </Panel>
  );
}
