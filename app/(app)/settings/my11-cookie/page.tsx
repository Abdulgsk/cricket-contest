import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireUser, userCan } from "@/lib/rbac";
import { env } from "@/lib/env";
import { Card, CardTitle } from "@/components/ui/card";
import { NoAccessCard } from "@/components/no-access-card";
import { My11CookieCapture } from "@/components/my11-cookie-capture";
import { My11Bookmarklet } from "@/components/my11-bookmarklet";
import { getMy11CookieStatusAction } from "@/actions/my11-cookie";

export const dynamic = "force-dynamic";

function buildBookmarklet(endpoint: string, token: string): string {
  // Runs on a my11circle.com tab: reads the (non-HttpOnly) session cookies,
  // and POSTs them to our endpoint. The request to my11 never happens here —
  // we only read what the browser already stored, so there's no "Channel
  // blocked" and no cross-origin cookie access.
  const code = `(async()=>{try{var N=["SSID","SSIDuser","NA_VISITOR","sameSiteNoneSupported","device.info.cookie"];var J=document.cookie.split("; ").map(function(s){var i=s.indexOf("=");return{name:s.slice(0,i),value:s.slice(i+1)}}).filter(function(c){return N.indexOf(c.name)>=0});if(!J.some(function(c){return c.name==="SSID"})){alert("No SSID cookie found. Open my11circle.com and log in first, then tap this again.");return}var r=await fetch(${JSON.stringify(endpoint)},{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+${JSON.stringify(token)}},body:JSON.stringify({cookies:J})});var d=await r.json().catch(function(){return{}});alert(d.ok?(d.loggedIn?"\\u2713 My11 session synced and verified!":"Synced, but my11 says not logged in. Make sure you're fully logged in."):"Failed: "+(d.error||r.status))}catch(e){alert("Error: "+e.message)}})()`;
  return "javascript:" + encodeURIComponent(code);
}

export default async function My11CookieSettingsPage() {
  const me = await requireUser();
  if (!userCan(me, "my11.cookie.capture")) {
    return (
      <div className="max-w-2xl mx-auto">
        <NoAccessCard
          feature="my11.cookie.capture"
          title="My11 session capture"
          hint="Ask a superadmin to grant the 'Capture My11 session' feature."
        />
      </div>
    );
  }
  const status = await getMy11CookieStatusAction();
  if (!status.ok) redirect("/dashboard");

  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const endpoint = host ? `${proto}://${host}/api/admin/my11-cookie` : "";
  const token = env.MY11_COOKIE_SYNC_TOKEN;
  const bookmarklet = token && endpoint ? buildBookmarklet(endpoint, token) : "";

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">My11Circle session</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Capture the My11Circle session so the app can fetch live leaderboards,
          teams and verify names — for everyone, from any device.
        </p>
      </div>
      <Card>
        <CardTitle className="mb-3">Current status</CardTitle>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Cookie present</dt>
          <dd>{status.hasCookie ? "Yes" : "No"}</dd>
          <dt className="text-muted-foreground">My11 reports logged in</dt>
          <dd className={status.loggedIn ? "text-success" : "text-warning"}>
            {status.loggedIn ? "Yes" : "No"}
          </dd>
          <dt className="text-muted-foreground">Saved at</dt>
          <dd suppressHydrationWarning>
            {status.ageMs != null
              ? new Date(Date.now() - status.ageMs).toLocaleString()
              : "—"}
          </dd>
          <dt className="text-muted-foreground">Local expiry</dt>
          <dd suppressHydrationWarning>
            {status.expiresAt ? new Date(status.expiresAt).toLocaleString() : "—"}
          </dd>
        </dl>
      </Card>
      <My11Bookmarklet bookmarklet={bookmarklet} tokenConfigured={Boolean(token)} />
      <My11CookieCapture pendingPhone={status.pendingPhone} />
    </div>
  );
}
