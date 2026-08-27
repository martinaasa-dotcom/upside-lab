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

const GOOGLE_BTN =
  "h-11 w-full gap-2.5 rounded-full text-base md:w-auto md:min-w-[17rem]";

type Props = {
  googleBusy: boolean;
  onGoogle: () => void;
  /** Invite screens start with the field open. The marketing page does not. */
  startWithEmail?: boolean;
  align?: "center" | "start";
  className?: string;
};

/**
 * Google first, email as the other door.
 *
 * The marketing hero cannot grow by a form: the sample card has to stay
 * cut by the fold. So the field stays behind "Use your email" there, and
 * only an invite (where the whole point is to act) opens it at once.
 */
export function SignInMethods({
  googleBusy,
  onGoogle,
  startWithEmail = false,
  align = "center",
  className,
}: Props) {
  const fieldId = useId();
  const [open, setOpen] = useState(startWithEmail);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [answer, setAnswer] = useState<Answer>({});

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
        className={GOOGLE_BTN}
      >
        {googleBusy ? <Spinner data-icon="inline-start" /> : <GoogleMark />}
        {googleBusy ? "Redirecting …" : "Continue with Google"}
      </Button>

      {answer.sent ? (
        <p
          className={cn(
            "max-w-sm text-sm text-muted-foreground",
            !start && "text-center"
          )}
          role="status"
        >
          {answer.sent}
        </p>
      ) : open ? (
        <form
          className={cn(
            "flex w-full flex-col gap-2",
            start ? "max-w-sm" : "max-w-sm md:max-w-[17rem]"
          )}
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
                {pending ? "Sending …" : "Email me a link"}
              </Button>
            </>
          )}
          {answer.error ? (
            <p className="text-sm text-loss" role="alert">
              {answer.error}
            </p>
          ) : null}
        </form>
      ) : (
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => setOpen(true)}
          className="h-auto px-2 py-1 text-sm font-normal text-muted-foreground hover:text-foreground"
        >
          No Google? Use your email.
        </Button>
      )}
    </div>
  );
}
