import { requireUser } from "@/lib/rbac";
import { Badge, Card } from "@/components/ui/card";
import { ProfileForms } from "@/components/profile-forms";
import { getPointsBreakdown } from "@/services/points-breakdown";
import { PointsBreakdownCard } from "@/components/points-breakdown-card";

export default async function ProfilePage() {
  const me = await requireUser();
  const breakdown = await getPointsBreakdown(String(me._id));

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold truncate">{me.username}</h1>
          <p className="text-muted-foreground text-sm truncate">@{me.userId}</p>
        </div>
        <Badge
          tone={
            me.role === "superadmin"
              ? "warning"
              : me.role === "admin"
                ? "accent"
                : "default"
          }
        >
          {me.role}
        </Badge>
      </header>

      <ProfileForms
        initial={{
          username: me.username,
          whatsapp: me.whatsapp,
          my11circleName: me.my11circleName,
          avatar: me.avatar ?? null,
          bio: me.bio ?? null,
          my11NameRequest: me.my11NameRequest
            ? {
                requested: me.my11NameRequest.requested,
                requestedAt: new Date(me.my11NameRequest.requestedAt).toISOString(),
                status: me.my11NameRequest.status,
                decidedAt: me.my11NameRequest.decidedAt
                  ? new Date(me.my11NameRequest.decidedAt).toISOString()
                  : null,
                deniedReason: me.my11NameRequest.deniedReason ?? null,
              }
            : null,
          my11NameChangeGraceUntil: me.my11NameChangeGraceUntil
            ? new Date(me.my11NameChangeGraceUntil).toISOString()
            : null,
        }}
      />

      <Card>
        <p className="text-sm text-muted-foreground">
          Your charts and results analytics have moved to the Analytics tab.
        </p>
      </Card>

      <PointsBreakdownCard
        breakdown={breakdown}
        title="Your points, source by source"
        subtitle="A full audit of where every point on your card came from."
        compact
      />
    </div>
  );
}
