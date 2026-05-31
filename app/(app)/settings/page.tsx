import { redirect } from "next/navigation";
import { requireUser, userCan } from "@/lib/rbac";

export default async function SettingsIndexPage() {
  const me = await requireUser();
  if (userCan(me, "my11.cookie.capture")) redirect("/settings/my11-cookie");
  redirect("/dashboard");
}
