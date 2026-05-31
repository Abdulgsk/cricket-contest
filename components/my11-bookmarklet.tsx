"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function My11Bookmarklet({
  bookmarklet,
  tokenConfigured,
}: {
  bookmarklet: string;
  tokenConfigured: boolean;
}) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = useState(false);

  // React strips `javascript:` hrefs for safety, so set it on the DOM node
  // directly after mount. This makes the link draggable to the bookmarks bar.
  useEffect(() => {
    if (linkRef.current && bookmarklet) {
      linkRef.current.setAttribute("href", bookmarklet);
    }
  }, [bookmarklet]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(bookmarklet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (!tokenConfigured) {
    return (
      <Card className="border-warning/40">
        <CardTitle className="mb-2">Capture with one tap (recommended)</CardTitle>
        <p className="text-sm text-warning">
          Set the <code>MY11_COOKIE_SYNC_TOKEN</code> environment variable (any
          random string) and redeploy to enable the one-tap capture bookmarklet.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle className="mb-2">Capture with one tap (works on mobile)</CardTitle>
      <p className="text-sm text-muted-foreground mb-3">
        This grabs your My11Circle session straight from your own logged-in
        browser — no extension, no OTP, works on phones and on the live site.
      </p>

      <div className="rounded-xl border border-border bg-muted/30 p-3 mb-4">
        <p className="text-sm font-medium mb-2">Desktop — drag this to your bookmarks bar:</p>
        {/* href is set imperatively in useEffect (React blocks javascript: hrefs) */}
        <a
          ref={linkRef}
          href="#"
          onClick={(e) => e.preventDefault()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground cursor-grab active:cursor-grabbing"
          draggable
        >
          📌 Sync My11 → Cricket
        </a>
        <p className="text-xs text-muted-foreground mt-2">
          Then: open my11circle.com, log in, click the bookmark.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-3 mb-4">
        <p className="text-sm font-medium mb-2">Mobile — copy &amp; create a bookmark:</p>
        <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
          <li>
            <Button size="sm" variant="outline" onClick={copy} className="mr-2">
              {copied ? "Copied!" : "Copy bookmarklet code"}
            </Button>
          </li>
          <li>In your phone browser, bookmark any page (e.g. this one).</li>
          <li>Edit that bookmark → replace its <strong>URL/address</strong> with the copied code → name it “Sync My11”.</li>
          <li>Open <strong>my11circle.com</strong> and log in.</li>
          <li>Open the “Sync My11” bookmark (type its name in the address bar, tap it).</li>
          <li>You’ll see a “✓ synced” alert. Done.</li>
        </ol>
      </div>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Show raw bookmarklet code</summary>
        <textarea
          readOnly
          value={bookmarklet}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-2 w-full h-24 rounded-lg border border-border bg-card p-2 font-mono text-[11px]"
        />
      </details>
    </Card>
  );
}
