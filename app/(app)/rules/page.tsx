import { Card } from "@/components/ui/card";
import { RANK_POINTS, PENALTIES, BONUSES, PREDICTION_POINTS } from "@/lib/constants";
import { connectDB } from "@/lib/db";
import { getSettings } from "@/models/Settings";

function customConditionText(conditionType: string, conditionValue?: number) {
  switch (conditionType) {
    case "fantasy_points_gte":
      return `fantasy points >= ${conditionValue ?? 0}`;
    case "fantasy_points_lte":
      return `fantasy points <= ${conditionValue ?? 0}`;
    case "rank_lte":
      return `match rank <= ${conditionValue ?? 0}`;
    case "rank_gte":
      return `match rank >= ${conditionValue ?? 0}`;
    case "leaderboard_climb_gte":
      return `leaderboard climb >= ${conditionValue ?? 0}`;
    case "leaderboard_drop_gte":
      return `leaderboard drop >= ${conditionValue ?? 0}`;
    case "pre_match_table_pos_lte":
      return `pre-match table position <= ${conditionValue ?? 0}`;
    case "pre_match_table_pos_gte":
      return `pre-match table position >= ${conditionValue ?? 0}`;
    case "post_match_table_pos_lte":
      return `post-match table position <= ${conditionValue ?? 0}`;
    case "post_match_table_pos_gte":
      return `post-match table position >= ${conditionValue ?? 0}`;
    case "beat_pre_match_leader_fp":
      return "score more fantasy points than pre-match leaderboard #1";
    case "top_n_by_fantasy_points":
      return `finish in top ${conditionValue ?? 1} by fantasy points`;
    case "bottom_n_by_fantasy_points":
      return `finish in bottom ${conditionValue ?? 1} by fantasy points`;
    case "missed_match":
      return "miss this match";
    case "played_match":
      return "submit this match";
    default:
      return "configured condition";
  }
}

function customRuleText(rule: {
  conditions?: Array<{ conditionType?: string; conditionValue?: number }>;
  conditionLogic?: "all" | "any";
  conditionType?: string;
  conditionValue?: number;
}) {
  const conditions = rule.conditions?.length
    ? rule.conditions
    : [{ conditionType: rule.conditionType, conditionValue: rule.conditionValue }];
  const joiner = (rule.conditionLogic ?? "all") === "any" ? " OR " : " AND ";
  return conditions
    .map((c) => customConditionText(c.conditionType ?? "fantasy_points_gte", c.conditionValue))
    .join(joiner);
}

export default async function RulesPage() {
  await connectDB();
  const settings = await getSettings();
  const bonusConfig = {
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
  };
  const civilWarConfig = {
    decisiveWin: settings.civilWarConfig?.decisiveWin ?? 2,
    decisiveLoss: settings.civilWarConfig?.decisiveLoss ?? 2,
    splitWin: settings.civilWarConfig?.splitWin ?? 1,
    splitLoss: settings.civilWarConfig?.splitLoss ?? 1,
  };
  const customBonuses = (settings.customBonuses ?? []).filter((b) => b.active);
  const allThreeSubtotal =
    PREDICTION_POINTS.WINNER +
    PREDICTION_POINTS.TOP_BATTER +
    PREDICTION_POINTS.TOP_BOWLER;
  const perfectPredictionPoints =
    PREDICTION_POINTS.WINNER +
    PREDICTION_POINTS.TOP_BATTER +
    PREDICTION_POINTS.TOP_BOWLER +
    PREDICTION_POINTS.ALL_THREE_BONUS;

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">📜 League Rules</h1>
        <p className="text-muted-foreground text-sm">The full ruleset for the 13-friend Dream11 league.</p>
      </header>

      <Card>
        <h2 className="font-semibold mb-3">🏆 Match Rank Points</h2>
        <table className="w-full text-sm">
          <tbody>
            {Object.entries(RANK_POINTS).map(([rank, pts]) => (
              <tr key={rank} className="border-t border-border/40">
                <td className="py-1.5">{rank === "1" ? "1st" : rank === "2" ? "2nd" : rank === "3" ? "3rd" : `${rank}th`}</td>
                <td className="py-1.5 text-right text-success font-semibold">+{pts}</td>
              </tr>
            ))}
            <tr className="border-t border-border/40">
              <td className="py-1.5">8th – 13th</td>
              <td className="py-1.5 text-right text-muted-foreground">0</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">💀 Penalties</h2>
        <ul className="text-sm space-y-2">
          <li className="flex justify-between"><span>Missed match</span><span className="text-danger">{PENALTIES.MISSED_MATCH}</span></li>
          <li className="flex justify-between"><span>2 consecutive misses (extra)</span><span className="text-danger">{PENALTIES.TWO_CONSECUTIVE_MISSES_EXTRA}</span></li>
          <li className="flex justify-between"><span>3 consecutive misses (extra)</span><span className="text-danger">{PENALTIES.THREE_CONSECUTIVE_MISSES_EXTRA}</span></li>
        </ul>
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">🎁 Bonuses</h2>
        <ul className="text-sm space-y-2">
          <li className="flex justify-between">
            <span>
              Finish in top 5 by fantasy points for 3 matches in a row
              <span className="text-muted-foreground"> (based only on fantasy points in each match)</span>
            </span>
            <span className="text-success">+{bonusConfig.consistency}</span>
          </li>
          <li className="flex justify-between">
            <span>
              Score more fantasy points than the player who was #1 on leaderboard before this match
              <span className="text-muted-foreground"> (based on leaderboard #1 before match + fantasy points in this match)</span>
            </span>
            <span className="text-success">+{bonusConfig.kingSlayer}</span>
          </li>
          <li className="flex justify-between">
            <span>
              Move up 4 or more places after this match
              <span className="text-muted-foreground"> (based on leaderboard position change)</span>
            </span>
            <span className="text-success">+{bonusConfig.comeback}</span>
          </li>
          <li className="flex justify-between">
            <span>
              If you were 10th-13th overall, finish top 2 in this match
              <span className="text-muted-foreground"> (based on leaderboard before match + this match rank)</span>
            </span>
            <span className="text-success">+{bonusConfig.underdog}</span>
          </li>
          <li className="flex justify-between">
            <span>
              Win the match by 300+ fantasy points over 2nd place
              <span className="text-muted-foreground"> (based on fantasy points in this match)</span>
            </span>
            <span className="text-success">+{bonusConfig.matchDomination}</span>
          </li>
          {customBonuses.map((b) => (
            <li key={b.id} className="flex justify-between">
              <span>
                {b.name}
                <span className="text-muted-foreground"> ({customRuleText(b)}; {b.basis})</span>
              </span>
              <span className={
                ((b as unknown as { action?: "add" | "deduct" }).action ?? "add") === "deduct"
                  ? "text-danger"
                  : "text-success"
              }>
                {((b as unknown as { action?: "add" | "deduct" }).action ?? "add") === "deduct" ? "-" : "+"}
                {b.points}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">🎯 Bounty (separate from bonuses)</h2>
        <p className="text-sm text-muted-foreground">
          Bounty is selected per match by admin. If no player is selected, that match has no bounty.
          Any non-missed player who finishes above the selected bounty holder gets <span className="text-success">+{bonusConfig.bounty}</span> bounty points.
        </p>
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">⚔️ Rivalry challenges</h2>
        <ul className="text-sm space-y-2 list-disc pl-5">
          <li>You can challenge another player for a specific match.</li>
          <li>You can keep multiple challenges open in the same match.</li>
          <li>When one challenge is accepted, the others for that same match are withdrawn without penalty.</li>
          <li>You can challenge the same player at most twice in your lifetime: the first challenge and one revenge match.</li>
          <li>If you win a revenge match, you get an extra <span className="text-success">+{bonusConfig.rivalryRevenge}</span> on top of <span className="text-success">+{bonusConfig.rivalry}</span>.</li>
          <li>Withdrawals before lock cost <span className="text-danger">−2</span>; a separate admin approval request is available for no-penalty withdrawals.</li>
        </ul>
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">🛡️ Civil War — team vs team</h2>
        <p className="text-sm mb-3">
          Think of every match like a playground game. Whenever two players
          accept a rivalry, the game puts them on <strong>opposite</strong>{" "}
          teams — Team A or Team B. As more rivalries get accepted for the
          same match, both teams fill up. The teams stay <strong>secret</strong>{" "}
          until the match starts — you only find out who&apos;s on your side
          (and who you&apos;re up against) at start time.
        </p>
        <p className="text-sm mb-3">
          After the match, we tally two things for each team:
        </p>
        <ul className="text-sm space-y-2 list-disc pl-5 mb-3">
          <li>How many 1v1 rivalries the team won.</li>
          <li>The total fantasy points the team earned together.</li>
        </ul>
        <p className="text-sm mb-2">Then everyone on the winning team gets points, and everyone on the losing team loses points:</p>
        <ul className="text-sm space-y-2 list-disc pl-5 mb-3">
          <li>
            <strong>Decisive win</strong> — your team wins on BOTH (more 1v1 wins AND more fantasy points):{" "}
            <span className="text-success">+{civilWarConfig.decisiveWin}</span> for the winners,{" "}
            <span className="text-danger">−{civilWarConfig.decisiveLoss}</span> for the losers.
          </li>
          <li>
            <strong>Split win</strong> — your team won more 1v1s but the other team had more fantasy points:{" "}
            <span className="text-success">+{civilWarConfig.splitWin}</span> for the 1v1 winners,{" "}
            <span className="text-danger">−{civilWarConfig.splitLoss}</span> for the losers.
            <span className="block text-xs text-muted-foreground mt-1">
              1v1 wins are the primary metric — a team that only leads on fantasy points doesn&apos;t win a split.
            </span>
          </li>
          <li>
            <strong>FP tiebreak</strong> — 1v1 wins are tied, so combined fantasy points decide:{" "}
            <span className="text-success">+{civilWarConfig.splitWin}</span> for the FP leader,{" "}
            <span className="text-danger">−{civilWarConfig.splitLoss}</span> for the other team.
          </li>
          <li>
            <strong>Draw</strong> — 1v1 wins AND fantasy points are both tied. Nobody gains or loses points (<span className="text-muted-foreground">0 / 0</span>).
          </li>
          <li>
            <strong>Captain&apos;s team wins</strong> — every Civil War has two
            captains: the highest-ranked leaderboard player on each side.
            (Only captains can rename their team.) Whichever captain scores more
            fantasy points this match, every member of that team (captain too)
            gets{" "}
            <span className="text-success">+{bonusConfig.captainTeamWin}</span>.
            The losing team is <em>not</em> deducted points for this rule.
          </li>
        </ul>
        <p className="text-xs text-muted-foreground">
          A match needs at least 2 accepted rivalries to run a Civil War. If a
          rivalry ends in a tie, it doesn&apos;t count toward winners — but its
          players&apos; fantasy points still count for their team. If you miss
          the match, your fantasy points are 0 and you automatically lose your
          1v1.
        </p>
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">👑 Leader Bonus</h2>
        <p className="text-sm mb-3">
          Four rules reward the players who lead the overall leaderboard or
          their Civil War side.
        </p>
        <ul className="text-sm space-y-3 list-disc pl-5">
          <li>
            <strong>Topper defends the throne</strong> — if the pre-match
            leaderboard #1 stays #1 after this match scores:{" "}
            <span className="text-success">+{bonusConfig.topperDefendsTop}</span>.
          </li>
          <li>
            <strong>Topper tops the match</strong> — if the pre-match
            leaderboard #1 also finishes #1 by fantasy points in this match:{" "}
            <span className="text-success">+{bonusConfig.topperTopsMatch}</span>.
          </li>
          <li>
            <strong>Leader topper override</strong> — if the overall
            leaderboard&apos;s #1 is <em>not</em> in this match&apos;s Civil War
            and still scores more fantasy points than BOTH captains, they get{" "}
            <span className="text-success">+{bonusConfig.leaderTopperBonus}</span>{" "}
            for stamping authority over the captains.
          </li>
        </ul>
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">🔮 Prediction Points</h2>
        <ul className="text-sm space-y-2">
          <li className="flex justify-between"><span>Correct Match Winner</span><span className="text-success">+{PREDICTION_POINTS.WINNER}</span></li>
          <li className="flex justify-between"><span>Correct Top Batter</span><span className="text-success">+{PREDICTION_POINTS.TOP_BATTER}</span></li>
          <li className="flex justify-between"><span>Correct Top Bowler</span><span className="text-success">+{PREDICTION_POINTS.TOP_BOWLER}</span></li>
          <li className="flex justify-between border-t border-border/40 pt-2">
            <span>All 3 correct picks subtotal</span>
            <span className="text-success">+{allThreeSubtotal}</span>
          </li>
          <li className="flex justify-between font-semibold"><span>All 3 correct bonus (extra)</span><span className="text-success">+{PREDICTION_POINTS.ALL_THREE_BONUS}</span></li>
          <li className="flex justify-between border-t border-border/40 pt-2 font-semibold">
            <span>Perfect prediction total</span>
            <span className="text-success">+{perfectPredictionPoints}</span>
          </li>
        </ul>
        <p className="text-xs text-muted-foreground mt-3">
          The full prediction total is 12 when all three picks are correct.
        </p>
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">⚡ Special Match Modes</h2>
        <ul className="text-sm space-y-2 text-muted-foreground">
          <li>
            <strong className="text-foreground">2× Points:</strong> Doubles base rank points only.
            Example: if rank points are +5, this mode makes it +10 for that match.
          </li>
          <li>
            <strong className="text-foreground">No Bonus:</strong> Disables all bonus calculations for
            that match. Penalties and base points still apply normally.
          </li>
          <li>
            <strong className="text-foreground">Chaos Match:</strong> All awarded bonuses are doubled,
            and the per-match bonus cap is also doubled.
          </li>
          <li>
            <strong className="text-foreground">Prediction Madness:</strong> Final prediction points for
            that match are multiplied by 2 after normal prediction scoring.
          </li>
        </ul>
      </Card>
    </div>
  );
}
