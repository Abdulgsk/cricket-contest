import { requireUser } from "@/lib/rbac";
import { computeLeaderboard } from "@/services/scoring";
import { Card } from "@/components/ui/card";
import { AnalyticsCharts } from "@/components/analytics-charts";

export default async function AnalyticsPage() {
  await requireUser();
  const lb = await computeLeaderboard();
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground text-sm">League-wide insights & charts.</p>
      </header>
      <Card>
        <AnalyticsCharts data={lb.map((r) => ({
          name: r.username,
          total: r.totalPoints,
          bonus: r.bonusPoints,
          penalty: -r.penaltyPoints,
          predictions: r.predictionPoints,
        }))} />
      </Card>
    </div>
  );
}
