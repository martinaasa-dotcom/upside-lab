"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/format";
import { currentInternalNext } from "@/lib/site-url";
import { useId, useState } from "react";

type Answer = {
  error?: string;
  sent?: string;
  suggestion?: string;
  typed?: string;
};

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-0.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

const DOOR_BTN =
  "h-11 w-full gap-2.5 rounded-full text-base md:w-auto md:min-w-[17rem]";

type Props = {
  googleBusy: boolean;
  onGoogle: () => void;
  /**
   * Whatever went wrong with the Google handshake, drawn under the button
   * it belongs to.
   *
   * It used to be printed by the page instead, which put it about 140px
   * below the button, under two unrelated grey captions. A red sentence
   * that far from the thing it is about is one a reader has to work out.
   */
  error?: string | null;
  /** Invite screens start with the field open. The marketing page does not. */
  startWithEmail?: boolean;
  align?: "center" | "start";
  className?: string;
};

/**
 * Google first, email as the other door.
 *
 * Both doors look like doors. The email one used to be a ghost button in
 * 14px muted text, the same size and colour as the price caption 10px
 * under it, so somebody without a Google account scanned two grey lines
 * and saw one button. Plenty of the older beginners this product is for do
 * not have Google. It is an outline button on the same shape as the Google
 * one now, and once it opens there is a way back to Google, which there
 * was not.
 *
 * The marketing hero cannot grow by a form: the sample card has to stay
 * cut by the fold. So the field stays behind the second button there, and
 * only an invite (where the whole point is to act) opens it at once.
 */
export function SignInMethods({
  googleBusy,
  onGoogle,
  error = null,
  startWithEmail = false,
  align = "center",
  className,
}: Props) {
  const fieldId = useId();
  const [open, setOpen] = useState(startWithEmail);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [answer, setAnswer] = useState<Answer>({});
  /**
   * The address the link actually went to, kept here rather than read back
   * off the server's answer.
   *
   * The sent message used to say "Check that inbox", which names no inbox.
   * A person who has just typed an address wants to see the address, both
   * because they may have mistyped it and because "that inbox" is the
   * vaguest possible way to end a flow whose next step happens somewhere
   * else entirely.
   */
  const [sentTo, setSentTo] = useState<string | null>(null);

  const asked =
    answer.suggestion && answer.typed
      ? { suggestion: answer.suggestion, typed: answer.typed }
      : null;

  async function send(email: string, confirmed: boolean) {
    setPending(true);
    setAnswer({});
    try {
      const res = await fetch("/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          confirmed,
          next: currentInternalNext(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Answer;
      setAnswer(data);
      if (data.sent) setSentTo(email);
      if (data.typed) setTyped(data.typed);
    } catch {
      setAnswer({ error: "We could not send that. Try once more." });
    } finally {
      setPending(false);
    }
  }

  const busy = googleBusy || pending;
  const start = align === "start";

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-3.5",
        start ? "items-stretch md:items-start" : "items-center",
        className
      )}
    >
      <Button
        type="button"
        size="lg"
        disabled={busy}
        onClick={onGoogle}
        className={DOOR_BTN}
      >
        {googleBusy ? <Spinner data-icon="inline-start" /> : <GoogleMark />}
        {googleBusy ? "Redirecting …" : "Continue with Google"}
      </Button>

      {error ? (
        <p
          className={cn(
            "max-w-sm text-sm text-loss",
            !start && "text-center"
          )}
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {answer.sent ? (
        <p
          className={cn(
            "max-w-sm text-sm leading-relaxed text-muted-foreground",
            !start && "text-center"
          )}
          role="status"
        >
          {sentTo
            ? `We sent a sign-in link to ${sentTo}. It lasts one hour and works once.`
            : answer.sent}
        </p>
      ) : open ? (
        <div
          className={cn(
            "flex w-full flex-col gap-2",
            start ? "max-w-sm" : "max-w-sm md:max-w-[17rem]"
          )}
        >
          <form
            className="flex w-full flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(typed, false);
            }}
          >
            {asked ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  You typed {asked.typed}. Did you mean {asked.suggestion}?
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void send(asked.suggestion, true)}
                  >
                    Use {asked.suggestion}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void send(asked.typed, true)}
                  >
                    Keep {asked.typed}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Label htmlFor={fieldId} className="sr-only">
                  Email
                </Label>
                <Input
                  id={fieldId}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="Email"
                  value={typed}
                  disabled={busy}
                  onChange={(e) => setTyped(e.target.value)}
                  className="h-11 rounded-full px-4"
                />
                <Button
                  type="submit"
                  variant="outline"
                  size="lg"
                  disabled={busy || !typed.trim()}
                  className="h-11 w-full rounded-full text-base"
                >
                  {pending ? <Spinner data-icon="inline-start" /> : null}
                  {pending ? "Sending …" : "Send me a sign-in link"}
                </Button>
              </>
            )}
            {answer.error ? (
              <p className="text-sm text-loss" role="alert">
                {answer.error}
              </p>
            ) : null}
          </form>
          {startWithEmail ? null : (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setOpen(false)}
              className="h-auto self-center px-2 py-1 text-sm font-normal text-muted-foreground hover:text-foreground"
            >
              Use Google instead
            </Button>
          )}
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={busy}
          onClick={() => setOpen(true)}
          className={DOOR_BTN}
        >
          Sign in with email
        </Button>
      )}
    </div>
  );
}
