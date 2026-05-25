"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import * as React from "react";

/**
 * Back button that uses browser history when possible, falling back to the
 * provided `fallbackHref` (e.g. when the user landed here from a fresh tab).
 */
export function BackButton({
  fallbackHref = "/dashboard",
  className = "",
  label = "Back",
}: {
  fallbackHref?: string;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = React.useState(false);

  React.useEffect(() => {
    // history.length > 1 isn't perfectly reliable across browsers, but it's
    // the best signal short of tracking referrer ourselves. Worst case we
    // just navigate to the fallback.
    setCanGoBack(typeof window !== "undefined" && window.history.length > 1);
  }, []);

  const base =
    "inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground shrink-0";

  if (!canGoBack) {
    return (
      <Link href={fallbackHref} className={`${base} ${className}`}>
        ← {label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className={`${base} ${className}`}
    >
      ← {label}
    </button>
  );
}
