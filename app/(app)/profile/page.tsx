import { requireUser } from "@/lib/rbac";
import { Badge } from "@/components/ui/card";
import { ProfileForms } from "@/components/profile-forms";

export default async function ProfilePage() {
  const me = await requireUser();
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold truncate">{me.username}</h1>
          <p className="text-muted-foreground text-sm truncate">@{me.userId}</p>
        </div>
        <Badge tone={me.role === "superadmin" ? "warning" : me.role === "admin" ? "accent" : "default"}>
          {me.role}
        </Badge>
      </header>
      <ProfileForms
        initial={{
          username: me.username,
          whatsapp: me.whatsapp,
          my11circleName: me.my11circleName,
        }}
      />
    </div>
  );
}
