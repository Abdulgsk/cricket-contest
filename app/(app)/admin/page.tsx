import Link from "next/link";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { User } from "@/models/User";
import { Rivalry } from "@/models/Rivalry";
import { Card, Badge } from "@/components/ui/card";
import { AutomationTools } from "@/components/admin/automation-tools";
import { RegenerateFactsButton } from "@/components/admin/regenerate-facts-button";
import { RivalryWithdrawalQueue } from "@/components/admin/rivalry-withdrawal-queue";
import { My11NameChangeQueue } from "@/components/admin/my11-name-change-queue";
import { AdminOverviewTabs } from "@/components/admin/admin-overview-tabs";
import { BonusSettingsPanel } from "@/components/admin/bonus-settings-panel";
import { CivilWarSettingsPanel } from "@/components/admin/civil-war-settings-panel";
import { My11LiveSettingsPanel } from "@/components/admin/my11-live-settings-panel";
import { CIVIL_WAR_DEFAULTS } from "@/services/civil-war";
import { formatDate } from "@/lib/utils";
import { requireAdminAccess, userHasFeature } from "@/lib/rbac";
import { autoUpdateMatchStatuses } from "@/services/match-status";
import { getSettings } from "@/models/Settings";
import { getLatestFacts } from "@/services/facts";
import { BONUSES } from "@/lib/constants";

export default async function AdminHome() {
  const me = await requireAdminAccess();
  await connectDB();

  await autoUpdateMatchStatuses();
  const [total, users, pending, upcoming, live, completed, next3, withdrawalRequests, my11NameRequests, settings] = await Promise.all([
    Match.countDocuments(),
    User.countDocuments(),
    Match.countDocuments({ resultsEntered: false, status: { $ne: "upcoming" } }),
    Match.countDocuments({ status: "upcoming" }),
    Match.countDocuments({ status: "live" }),
    Match.countDocuments({ status: "completed" }),
    Match.find({ status: { $in: ["upcoming", "live"] } })
      .sort({ startTime: 1 })
      .limit(3)
      .lean(),
    Rivalry.find({
      withdrawalRequestedAt: { $ne: null },
      status: { $in: ["pending", "accepted"] },
    })
      .populate("matchId", "teamA teamB startTime")
      .populate("challengerId", "username")
      .populate("opponentId", "username")
      .populate("withdrawalRequestedBy", "username")
      .sort({ withdrawalRequestedAt: -1 })
      .limit(10)
      .lean(),
    User.find({ "my11NameRequest.status": "pending" })
      .select("username userId my11circleName my11NameRequest")
      .sort({ "my11NameRequest.requestedAt": -1 })
      .limit(20)
      .lean(),
    getSettings(),
  ]);

  // Latest AI-generated facts so admins can preview/verify regeneration here.
  const latestFacts = await getLatestFacts(20);

  const canEditBonus = userHasFeature(me, "bonus.manage");
  const canEditCivilWar = me.role === "superadmin" || userHasFeature(me, "civilwar.points.manage");
  const showCivilWarTab = me.role === "superadmin" || canEditCivilWar;
  const canApproveRivalryWithdrawals = userHasFeature(me, "rivalry.withdraw.approve");
  const canApproveMy11NameChange = userHasFeature(me, "users.manage");
  const canManageResults = userHasFeature(me, "results.manage");
  const canRunAutomations = userHasFeature(me, "automation.run");
  const canRegenerateFacts = userHasFeature(me, "facts.regenerate");
  const canSeeMatches =
    userHasFeature(me, "matches.manage") ||
    userHasFeature(me, "results.manage") ||
    userHasFeature(me, "match.lock.extend");
  // Plain users who only have specific features granted should see ONLY the
  // tabs that map to those features — not the general Overview / Operations /
  // Docs tabs that are meant for superadmins.
  const isAdminRole = me.role === "superadmin";

  const bonusTab = (
    <BonusSettingsPanel
      canEdit={canEditBonus}
      initialBonusConfig={{
        consistency: settings.bonusConfig?.consistency ?? BONUSES.CONSISTENCY,
        kingSlayer: settings.bonusConfig?.kingSlayer ?? BONUSES.KING_SLAYER,
        comeback: settings.bonusConfig?.comeback ?? BONUSES.COMEBACK,
        underdog: settings.bonusConfig?.underdog ?? BONUSES.UNDERDOG,
        matchDomination: settings.bonusConfig?.matchDomination ?? BONUSES.MATCH_DOMINATION,
        topperDefendsTop: settings.bonusConfig?.topperDefendsTop ?? BONUSES.TOPPER_DEFENDS_TOP,
        topperTopsMatch: settings.bonusConfig?.topperTopsMatch ?? BONUSES.TOPPER_TOPS_MATCH,
        captainTeamWin: settings.bonusConfig?.captainTeamWin ?? BONUSES.CAPTAIN_TEAM_WIN,
        leaderTopperBonus: settings.bonusConfig?.leaderTopperBonus ?? BONUSES.LEADER_TOPPER_BONUS,
        bounty: settings.bonusConfig?.bounty ?? BONUSES.BOUNTY,
        rivalry: settings.bonusConfig?.rivalry ?? BONUSES.RIVALRY,
        rivalryRevenge: settings.bonusConfig?.rivalryRevenge ?? 1,
      }}
      initialCustomBonuses={
        (settings.customBonuses ?? []).map((b) => ({
          id: b.id,
          name: b.name,
          points: b.points,
          basis: b.basis,
          action: (b as unknown as { action?: "add" | "deduct" }).action ?? "add",
          conditionLogic: (b as unknown as { conditionLogic?: "all" | "any" }).conditionLogic ?? "all",
          conditions:
            (b as unknown as {
              conditions?: Array<{ conditionType: string; conditionValue?: number }>;
              conditionType?: string;
              conditionValue?: number;
            }).conditions ??
            [
              {
                conditionType:
                  (b as unknown as { conditionType?: string }).conditionType ??
                  "fantasy_points_gte",
                conditionValue: (b as unknown as { conditionValue?: number }).conditionValue,
              },
            ],
          active: b.active,
        }))
      }
    />
  );

  const withdrawalRows = withdrawalRequests.map((r) => {
    const match = r.matchId as unknown as { teamA?: string; teamB?: string; startTime?: Date };
    const challenger = r.challengerId as unknown as { username?: string };
    const opponent = r.opponentId as unknown as { username?: string };
    const requester = r.withdrawalRequestedBy as unknown as { username?: string };
    return {
      rivalryId: String(r._id),
      matchLabel: match?.teamA && match?.teamB ? `${match.teamA} vs ${match.teamB}` : "Unknown match",
      challenger: challenger?.username ?? "—",
      opponent: opponent?.username ?? "—",
      requestedBy: requester?.username ?? "—",
      requestedAt: r.withdrawalRequestedAt ? String(r.withdrawalRequestedAt) : new Date().toISOString(),
      status: r.status,
    };
  });

  const my11NameRows = my11NameRequests.map((u) => ({
    userId: String(u._id),
    username: u.username,
    handle: u.userId,
    currentMy11Name: u.my11circleName ?? null,
    requested: u.my11NameRequest?.requested ?? "",
    requestedAt: u.my11NameRequest?.requestedAt
      ? new Date(u.my11NameRequest.requestedAt).toISOString()
      : new Date().toISOString(),
  }));

  const dashboardTab = (
    <div className="space-y-4">
      <Card className="border-border/70">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Operations Overview</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Review league health, approvals, and upcoming matches from one place.
            </p>
          </div>
          {canSeeMatches && (
            <Link href="/admin/matches" className="text-xs font-medium text-primary hover:underline">
              Open match operations
            </Link>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3 sm:p-4 border-border/70">
          <div className="text-[10px] sm:text-xs uppercase text-muted-foreground tracking-wider">Matches</div>
          <div className="text-2xl sm:text-3xl font-bold mt-1">{total}</div>
          <div className="text-[10px] sm:text-xs text-muted-foreground mt-1 leading-tight">
            {upcoming} up · {live} live · {completed} done
          </div>
        </Card>
        <Card className="p-3 sm:p-4 border-border/70">
          <div className="text-[10px] sm:text-xs uppercase text-muted-foreground tracking-wider">Players</div>
          <div className="text-2xl sm:text-3xl font-bold mt-1">{users}</div>
        </Card>
        {canManageResults && (
          <Card className="p-3 sm:p-4 border-border/70">
            <div className="text-[10px] sm:text-xs uppercase text-muted-foreground tracking-wider">Pending results</div>
            <div className="text-2xl sm:text-3xl font-bold mt-1 text-warning">{pending}</div>
            <Link href="/admin/matches" className="text-[10px] sm:text-xs text-pink-400 hover:underline mt-1 inline-block">
              Enter results →
            </Link>
          </Card>
        )}
        {canApproveRivalryWithdrawals && (
          <Card className="p-3 sm:p-4 border-border/70">
            <div className="text-[10px] sm:text-xs uppercase text-muted-foreground tracking-wider">Withdrawals</div>
            <div className="text-2xl sm:text-3xl font-bold mt-1 text-warning">{withdrawalRows.length}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">awaiting review</div>
          </Card>
        )}
      </div>

      <Card className="border-border/70">
        <h2 className="font-semibold mb-3 text-sm sm:text-base">Next up</h2>
        {next3.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No upcoming matches.{" "}
            <Link href="/admin/matches" className="text-pink-400 underline">
              Sync IPL matches
            </Link>{" "}
            to populate.
          </p>
        ) : (
          <div className="space-y-2">
            {next3.map((m) => (
              <Link
                key={String(m._id)}
                href={`/admin/matches/${String(m._id)}/result`}
                className="flex items-center justify-between gap-2 rounded-xl bg-muted/30 px-3 py-2 hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {m.teamA} vs {m.teamB}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{formatDate(m.startTime)}</div>
                </div>
                <Badge tone={m.status === "live" ? "danger" : "accent"}>{m.status}</Badge>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );

  const requestsTab = (
    <div className="space-y-4">
      {canApproveRivalryWithdrawals && <RivalryWithdrawalQueue rows={withdrawalRows} />}
      {canApproveMy11NameChange && <My11NameChangeQueue rows={my11NameRows} />}
    </div>
  );

  const toolsTab = (
    <div className="space-y-4">
      {canRunAutomations && <AutomationTools canForceComplete={me.role === "superadmin"} />}
      {me.role === "superadmin" && (
        <My11LiveSettingsPanel initial={settings.my11LiveRefreshSec ?? 30} />
      )}
      {canRegenerateFacts && (
        <Card className="border-border/70">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-sm sm:text-base">Dashboard storylines</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Regenerate &ldquo;Today&apos;s storylines&rdquo; from the most recently scored match.
              </p>
            </div>
            <RegenerateFactsButton />
          </div>
          {latestFacts.length > 0 && (
            <div className="mt-3 border-t border-border/40 pt-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                Latest facts ({latestFacts.length})
              </div>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {latestFacts.map((f) => (
                  <li key={String(f._id)} className="flex gap-2">
                    <span className="text-foreground/40 shrink-0">•</span>
                    <span>
                      <span className="text-foreground">{f.text}</span>
                      <span className="ml-1 opacity-60">({f.type}, score {f.score})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
      {!canRunAutomations && !canRegenerateFacts && me.role !== "superadmin" && (
        <Card className="border-border/70 text-sm text-muted-foreground">
          No operations tools are enabled for your account.
        </Card>
      )}
    </div>
  );

  const helpTab = (
    <Card className="border-border/70">
      <h2 className="font-semibold mb-3 text-sm sm:text-base">How automations work</h2>
      <div className="space-y-3 text-sm text-muted-foreground">
        <div>
          <div className="font-medium text-foreground">Refresh match statuses</div>
          <p>Moves matches from upcoming → live when start time passes. Live → completed only after results are entered.</p>
        </div>
        <div>
          <div className="font-medium text-foreground">Sync fixtures now</div>
          <p>Pulls latest IPL fixtures from Sportskeeda, adds missing matches, and updates upcoming fixtures safely.</p>
        </div>
        <div>
          <div className="font-medium text-foreground">Force complete</div>
          <p>Manually marks a match completed and locks predictions. Use when you confirm the match has ended.</p>
        </div>
        <div>
          <div className="font-medium text-foreground">Automatic on page load</div>
          <p>Admin and match pages refresh status automatically so dashboard values stay current.</p>
        </div>
      </div>
    </Card>
  );

  // For users with feature-only access (no admin/superadmin role), render a
  // personalized landing that lists only the tools they were granted — so they
  // never see an empty Overview / Operations dashboard meant for admins.
  const yourTools: Array<{ key: string; label: string; description: string; href: string; cta: string }> = [];
  if (canSeeMatches) {
    const opens: string[] = [];
    if (canManageResults) opens.push("enter and edit match results");
    if (userHasFeature(me, "matches.manage")) opens.push("manage fixtures and modes");
    if (userHasFeature(me, "match.lock.extend")) opens.push("extend prediction lock windows");
    yourTools.push({
      key: "matches",
      label: "Matches",
      description: opens.length
        ? `You can ${opens.join(", ")}.`
        : "Open the match operations page.",
      href: "/admin/matches",
      cta: "Open matches",
    });
  }
  if (canApproveMy11NameChange) {
    yourTools.push({
      key: "users",
      label: "Users",
      description: "Approve My11 name changes and review accounts.",
      href: "/admin/users",
      cta: "Open users",
    });
  }
  if (me.role === "superadmin" || canApproveMy11NameChange) {
    yourTools.push({
      key: "audit",
      label: "Audit log",
      description: "Review who did what across the league.",
      href: "/admin/audit-logs",
      cta: "Open audit log",
    });
  }

  const yourToolsTab = (
    <div className="space-y-4">
      <Card className="border-border/70 bg-gradient-to-br from-primary/8 via-card to-card">
        <h2 className="text-base font-semibold">Your tools</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Only the actions you&apos;ve been given access to are listed below. Ask an admin for more if you need them.
        </p>
      </Card>
      {yourTools.length === 0 ? (
        <Card className="border-border/70">
          <div className="text-sm text-muted-foreground">
            You have admin access but no specific tools have been enabled yet.
            Ask a superadmin to assign you features in <span className="font-medium text-foreground">Users → Permissions</span>.
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {yourTools.map((t) => (
            <Card key={t.key} className="border-border/70 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-sm">{t.label}</h3>
              </div>
              <p className="text-xs text-muted-foreground flex-1">{t.description}</p>
              <Link
                href={t.href}
                className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold w-fit"
              >
                {t.cta} →
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <AdminOverviewTabs
      tabs={[
        ...(isAdminRole ? [{ id: "dashboard", label: "Overview", content: dashboardTab }] : [{ id: "tools-landing", label: "Your tools", content: yourToolsTab }]),
        ...(canApproveRivalryWithdrawals || canApproveMy11NameChange
          ? [
              {
                id: "requests",
                label: "Approvals",
                badge: withdrawalRows.length + my11NameRows.length,
                content: requestsTab,
              },
            ]
          : []),
        ...(canEditBonus ? [{ id: "bonus", label: "Bonus Rules", content: bonusTab }] : []),
        ...(showCivilWarTab
          ? [
              {
                id: "civilwar",
                label: "Civil War",
                content: (
                  <CivilWarSettingsPanel
                    canEdit={canEditCivilWar}
                    initial={{
                      decisiveWin: settings.civilWarConfig?.decisiveWin ?? CIVIL_WAR_DEFAULTS.decisiveWin,
                      decisiveLoss: settings.civilWarConfig?.decisiveLoss ?? CIVIL_WAR_DEFAULTS.decisiveLoss,
                      splitWin: settings.civilWarConfig?.splitWin ?? CIVIL_WAR_DEFAULTS.splitWin,
                      splitLoss: settings.civilWarConfig?.splitLoss ?? CIVIL_WAR_DEFAULTS.splitLoss,
                      captainTeamWin: settings.bonusConfig?.captainTeamWin ?? BONUSES.CAPTAIN_TEAM_WIN,
                    }}
                  />
                ),
              },
            ]
          : []),
        ...(isAdminRole
          ? [
              { id: "tools", label: "Operations", content: toolsTab },
              { id: "help", label: "Docs", content: helpTab },
            ]
          : []),
      ]}
    />
  );
}
