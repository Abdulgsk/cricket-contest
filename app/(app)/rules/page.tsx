import { Card } from "@/components/ui/card";
import { RANK_POINTS, PENALTIES, BONUSES, MAX_BONUS_PER_MATCH, PREDICTION_POINTS } from "@/lib/constants";

export default function RulesPage() {
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
        <h2 className="font-semibold mb-3">🎁 Bonuses (max {MAX_BONUS_PER_MATCH}/match)</h2>
        <ul className="text-sm space-y-2">
          <li className="flex justify-between"><span>Consistency · 3 consecutive Top 5</span><span className="text-success">+{BONUSES.CONSISTENCY}</span></li>
          <li className="flex justify-between"><span>King Slayer · finish above #1</span><span className="text-success">+{BONUSES.KING_SLAYER}</span></li>
          <li className="flex justify-between"><span>Comeback · climb 4+ positions</span><span className="text-success">+{BONUSES.COMEBACK}</span></li>

          <li className="flex justify-between"><span>Underdog · ranked 10–13 finish Top 2</span><span className="text-success">+{BONUSES.UNDERDOG}</span></li>
          <li className="flex justify-between"><span>Match Domination · win by 300+ FP</span><span className="text-success">+{BONUSES.MATCH_DOMINATION}</span></li>
        </ul>
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">🎯 Bounty (separate from bonuses)</h2>
        <p className="text-sm text-muted-foreground">
          Bounty is selected per match by admin. If no player is selected, that match has no bounty.
          Any non-missed player who finishes above the selected bounty holder gets <span className="text-success">+{BONUSES.BOUNTY}</span> bounty points.
          These points are added to final score, but they are tracked separately from bonus points.
        </p>
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">⚔️ Rivalry (1v1 challenges)</h2>
        <p className="text-sm text-muted-foreground mb-3">
          The <strong>Rivalry</strong> tab lets you challenge another player head-to-head for a
          specific match. Simple rules in plain language:
        </p>
        <ul className="text-sm space-y-2 list-disc pl-5">
          <li>
            You pick today’s match, pick a player and hit <strong>Challenge</strong>. They get a
            notification and must accept before the match starts.
          </li>
          <li>
            Each player can only be in <strong>one</strong> challenge per match (as challenger or
            opponent). The dropdown automatically hides players who already have a challenge for
            that match. ⭐ Recommended players are the ones with no rivalry yet today.
          </li>
          <li>
            If multiple people challenge the same opponent, the moment they accept one challenge
            the others are auto-declined and those challengers get a notification to try someone
            else.
          </li>
          <li>
            <strong>Win condition:</strong> if your challenge was accepted, whoever finishes with a
            better rank in that match wins <span className="text-success">+{BONUSES.RIVALRY}</span>{" "}
            rivalry points. If both miss or finish at the same rank, it’s a tie — no points
            awarded.
          </li>
          <li>
            <strong>Withdrawing:</strong> either player can cancel a pending or accepted challenge
            <em> any time before the match starts</em>. Withdrawing costs the canceller{" "}
            <span className="text-danger">−2</span> points and the other player is notified. You
            will be asked to confirm before withdrawal.
          </li>
          <li>
            <strong>Locking:</strong> once the match starts, the rivalry is locked — no
            withdrawals, no new challenges for that match. The result is settled automatically
            when match results are entered.
          </li>
          <li>
            All rivalry points and any −2 withdrawal penalties are reflected on the leaderboard and
            on each player’s profile breakdown.
          </li>
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
          ✏️ Predictions are editable until match start (and while admin has not manually locked the
          match). Choices stay hidden — even from admins — until the match is completed. Admins can only
          reset predictions before match start; they still cannot view hidden choices.
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
