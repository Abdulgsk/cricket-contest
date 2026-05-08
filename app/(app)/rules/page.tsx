import { Card } from "@/components/ui/card";
import { RANK_POINTS, PENALTIES, BONUSES, MAX_BONUS_PER_MATCH, PREDICTION_POINTS } from "@/lib/constants";

export default function RulesPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-3xl font-bold">📜 League Rules</h1>
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
        <h2 className="font-semibold mb-3">🎁 Bonuses (max {MAX_BONUS_PER_MATCH}/match)</h2>
        <ul className="text-sm space-y-2">
          <li className="flex justify-between"><span>Consistency · 3 consecutive Top 5</span><span className="text-success">+{BONUSES.CONSISTENCY}</span></li>
          <li className="flex justify-between"><span>King Slayer · finish above #1</span><span className="text-success">+{BONUSES.KING_SLAYER}</span></li>
          <li className="flex justify-between"><span>Comeback · climb 4+ positions</span><span className="text-success">+{BONUSES.COMEBACK}</span></li>

          <li className="flex justify-between"><span>Underdog · ranked 10–13 finish Top 2</span><span className="text-success">+{BONUSES.UNDERDOG}</span></li>
          <li className="flex justify-between"><span>Match Domination · win by 100+ FP</span><span className="text-success">+{BONUSES.MATCH_DOMINATION}</span></li>
          <li className="flex justify-between"><span>Bounty · beat the bounty holder</span><span className="text-success">+{BONUSES.BOUNTY}</span></li>
        </ul>
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">🔮 Prediction Points</h2>
        <ul className="text-sm space-y-2">
          <li className="flex justify-between"><span>Correct Match Winner</span><span className="text-success">+{PREDICTION_POINTS.WINNER}</span></li>
          <li className="flex justify-between"><span>Correct Top Batter</span><span className="text-success">+{PREDICTION_POINTS.TOP_BATTER}</span></li>
          <li className="flex justify-between"><span>Correct Top Bowler</span><span className="text-success">+{PREDICTION_POINTS.TOP_BOWLER}</span></li>
          <li className="flex justify-between font-semibold"><span>All three correct (bonus)</span><span className="text-success">+{PREDICTION_POINTS.ALL_THREE_BONUS}</span></li>
        </ul>
        <p className="text-xs text-muted-foreground mt-3">
          🔒 Predictions lock instantly on submit. Choices stay hidden — even from admins — until the
          match starts. Admins can only RESET predictions (not view them) before match start.
        </p>
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">⚡ Special Match Modes</h2>
        <ul className="text-sm space-y-1.5 text-muted-foreground">
          <li><strong className="text-foreground">2× Points:</strong> all rank points doubled.</li>
          <li><strong className="text-foreground">No Bonus:</strong> bonuses disabled this match.</li>
          <li><strong className="text-foreground">Chaos Match:</strong> bonus rules apply with extra drama.</li>
          <li><strong className="text-foreground">Prediction Madness:</strong> prediction points apply with extra weight.</li>
        </ul>
      </Card>
    </div>
  );
}
