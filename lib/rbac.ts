import { redirect } from "next/navigation";
import { getCurrentUser, getSession } from "@/lib/session";
import type { Role } from "@/lib/constants";

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireRole(...roles: Role[]) {
  const u = await requireUser();
  if (!roles.includes(u.role)) redirect("/");
  return u;
}

export async function isAdmin() {
  const s = await getSession();
  return s?.role === "admin" || s?.role === "superadmin";
}
