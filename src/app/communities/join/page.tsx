"use client";

import { track } from "@vercel/analytics";
import { SignInGate } from "@/components/SignInGate";
import { JOIN_COMMUNITY_INVITE } from "@/lib/invite-landing";
import { rememberJoinedCommunity } from "@/lib/community-cache";
import { plainError } from "@/lib/plain-error";
import { UpsideLogo } from "@/components/UpsideLogo";
import { Button } from "@/components/ui/button";
import { saveLastCircleId } from "@/lib/workspace-rooms";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function JoinInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token")?.trim() ?? "";
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(
    token ? "Opening your invite …" : null
  );

  useEffect(() => {
    if (!token) {
      setError("That invite link is missing a code. Ask them to send it again.");
      return;
    }
    const ctrl = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/communities/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          signal: ctrl.signal,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            plainError(data.error, "Couldn't join. Try the link again.")
          );
        }
        if (ctrl.signal.aborted) return;
        track("community_invite_redeemed");
        const classroom = data.kind === "classroom";
        const communityId =
          typeof data.communityId === "string" ? data.communityId : "";
        const label = typeof data.name === "string" ? data.name : null;
        if (communityId) {
          rememberJoinedCommunity({
            id: communityId,
            name: label || (classroom ? "Class" : "Circle"),
            role: "member",
            kind: classroom ? "classroom" : "circle",
          });
          if (!classroom) saveLastCircleId(communityId);
        } else {
          throw new Error("Couldn't join. Try the link again.");
        }
        setStatus(
          classroom
            ? label
              ? `You're in ${label}. Opening the class …`
              : "You're in the class. Opening it …"
            : label
              ? `You're in ${label}. Opening the circle …`
              : "You're in. Opening the circle …"
        );
        router.replace(`/communities/${communityId}`);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setStatus(null);
        setError(
          e instanceof Error ? e.message : "Couldn't join. Try the link again."
        );
      }
    })();
    return () => {
      ctrl.abort();
    };
  }, [token, router]);

  return (
    <SignInGate invite={JOIN_COMMUNITY_INVITE}>
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-foreground">
        <UpsideLogo variant="mark" className="h-10 w-10" />
        <div className="flex flex-col w-full max-w-sm gap-2 text-center">
          <h1 className="text-2xl font-semibold text-foreground">Join with an invite</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            A friend or a teacher sent this. Sign in if you
            haven&apos;t yet. Then we put you in the circle or the class.
          </p>
          {error ? (
            <>
              <p className="text-sm text-loss">{error}</p>
              <Button asChild className="mt-2 w-full">
                <Link href="/">Go to Upside Lab</Link>
              </Button>
            </>
          ) : status ? (
            <p className="text-sm text-muted-foreground">{status}</p>
          ) : null}
        </div>
      </div>
    </SignInGate>
  );
}

export default function JoinCommunityPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-background text-muted-foreground">
          Loading …
        </div>
      }
    >
      <JoinInner />
    </Suspense>
  );
}
