"use client";

// TEMPORARY preview route for comparing landing variants. Delete before merge.
import { SignedOutLanding, type LandingVariant } from "@/components/SignedOutLanding";
import { PAGE_FRAME_CLASS } from "@/lib/page-shell";
import { cn } from "@/lib/format";
import { useEffect, useState } from "react";

export default function LandingPreview() {
  const [v, setV] = useState<LandingVariant>("hybrid");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("v");
    if (q === "product" || q === "editorial" || q === "tour" || q === "hybrid") setV(q);
  }, []);
  return (
    <div className={cn(PAGE_FRAME_CLASS, "landing-field overflow-x-clip overflow-y-auto")}>
      <SignedOutLanding
        variant={v}
        busy={false}
        err={null}
        minAge={16}
        onSignIn={() => {}}
      />
    </div>
  );
}
