import { ContestsView } from "@/components/contest/contests-view";
import { requireUser } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function ContestsPage() {
  const me = await requireUser();
  return <ContestsView meId={String(me._id)} meUsername={me.username} />;
}
