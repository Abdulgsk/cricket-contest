import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AuditLogsRedirect({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const params = new URLSearchParams();
  params.set("tab", "audit");
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val && (k === "category" || k === "action" || k === "actor" || k === "page")) {
      params.set(k, String(val));
    }
  }
  redirect(`/developer?${params.toString()}`);
}
