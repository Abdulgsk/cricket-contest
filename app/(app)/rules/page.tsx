import { Card } from "@/components/ui/card";
import { RANK_POINTS, PENALTIES, BONUSES, MAX_BONUS_PER_MATCH, PREDICTION_POINTS } from "@/lib/constants";
import { connectDB } from "@/lib/db";
import { getSettings } from "@/models/Settings";

export default async function RulesPage() {
  await connectDB();
  const settings = await getSettings();
  const bonusConfig = {
    consistency: settings.bonusConfig?.consistency ?? BONUSES.CONSISTENCY,
    kingSlayer: settings.bonusConfig?.kingSlayer ?? BONUSES.KING_SLAYER,
    comeback: settings.bonusConfig?.comeback ?? BONUSES.COMEBACK,
    underdog: settings.bonusConfig?.underdog ?? BONUSES.UNDERDOG,
    matchDomination: settings.bonusConfig?.matchDomination ?? BONUSES.MATCH_DOMINATION,
    bounty: settings.bonusConfig?.bounty ?? BONUSES.BOUNTY,
    rivalry: settings.bonusConfig?.rivalry ?? BONUSES.RIVALRY,
    rivalryRevenge: settings.bonusConfig?.rivalryRevenge ?? 1,
    maxBonusPerMatch: settings.bonusConfig?.maxBonusPerMatch ?? MAX_BONUS_PER_MATCH,
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
        <p className="text-xs text-muted-foreground mb-3">
          Maximum bonus points allowed per match: {bonusConfig.maxBonusPerMatch}
        </p>
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
                <span className="text-muted-foreground"> (based on {b.basis})</span>
              </span>
              <span className="text-success">+{b.points}</span>
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
