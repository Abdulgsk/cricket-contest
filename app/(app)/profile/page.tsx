import { requireUser } from "@/lib/rbac";
import { Card, Badge } from "@/components/ui/card";
import { ProfileForms } from "@/components/profile-forms";

export default async function ProfilePage() {
  const me = await requireUser();
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{me.username}</h1>
          <p className="text-muted-foreground text-sm">@{me.userId}</p>
        </div>
        <Badge tone={me.role === "superadmin" ? "warning" : me.role === "admin" ? "accent" : "default"}>
          {me.role}
        </Badge>
      </header>
      <ProfileForms initial={{ username: me.username, whatsapp: me.whatsapp }} />
      <Card>
        <p className="text-xs text-muted-foreground">
          🔐 Per league policy, passwords are stored as plain text in the database. Use a unique password.
        </p>
      </Card>
    </div>
  );
}
