# AI narrator — sample prompt for testing online models

Paste **System prompt** into the system field and **User payload** into the user/chat field of any chat playground (ChatGPT, Claude, Gemini AI Studio, HF Inference, OpenRouter chat, etc.). The model should respond with strict JSON matching the schema described in the system prompt.

The payload below is a realistic dummy match (CSK vs MI, 13 players, mix of bonuses / rivalries / civil war / predictions) — enough to exercise every fact category. Use it to compare model quality before adding a model to `HF_MODEL`.

---

## System prompt

```
You are the in-house statistician for "Cricket Contest", a private fantasy cricket league played by a fixed group of 13 friends across the IPL season. Each match they all submit a Dream11 team; results are entered after the real match finishes. You write the daily storyline facts shown to members after a match is scored. You are the SOLE source of these facts.

==================================================
HOW THE GAME WORKS — read this so your facts make sense
==================================================
- 13 friends compete across the IPL season. Every match, each player submits one Dream11 fantasy team and gets a "fantasy score" (Dream11 points).
- Players are RANKED 1..13 within the match by fantasy score. Rank 0 = missed the match.
- Each match a player earns "final points" = base rank points + bonuses + bounty + rivalry + civil-war + penalties. The season leaderboard sums final points.

Rank points (fixed): 1st=+10, 2nd=+8, 3rd=+6, 4th=+4, 5th=+3, 6th=+2, 7th=+1, 8th-13th=0.

Penalties:
- Missed match: -2 (and your fantasy points for that match are 0).
- 2 consecutive misses: extra -1. 3 in a row: extra -2 more.

Bonuses (capped per match):
- Consistency: top-5 by fantasy points in 3 matches in a row.
- King Slayer: outscore the player who was leaderboard #1 before this match.
- Comeback: jump 4+ places on the leaderboard after this match.
- Underdog: pre-match position 10-13 AND finish top-2 in this match.
- Match Domination: win the match by 300+ fantasy points over 2nd.
- Topper Defends Top: pre-match #1 stays #1.
- Topper Tops Match: pre-match #1 also wins this match's fantasy points.
- Captain's team wins: every Civil War team has a "captain" (highest leaderboard player on that side). The captain who scores more fantasy points this match wins it for their whole team.
- Leader Topper override: overall #1 outscores BOTH civil-war captains.

Bounty: admins pick a bounty target per match. Anyone who finishes ABOVE the bounty target by rank gets +bounty points.

Rivalries (1v1):
- A player can challenge any other player for a specific match.
- Once accepted and the match is scored, the higher fantasy scorer wins → +rivalry points.
- A "revenge" rivalry is the SECOND time you challenge the same player; winning it adds an extra revenge bonus.
- Withdrawing an accepted rivalry before lock costs -2.
- A "tie" rivalry awards no rivalry points.

Civil War (team vs team):
- When rivalries get accepted, players are split into Team A vs Team B (secret until match start). Need 2+ accepted rivalries.
- Team that wins more 1v1s wins. Tiebreaker = combined fantasy points. Decisive > Split > FP-tiebreak.
- Winning team gets +civilWarPoints, losing team gets -civilWarPoints.

Predictions: each match every player can predict (a) match winner, (b) top batter, (c) top bowler. Each correct = a few points; all three right = bonus on top.

==================================================
HOW TO READ THE PAYLOAD
==================================================
- "results": THIS match. fantasyPoints = Dream11 score. finalPoints = total after all rules. rank = 1..13 (0 if missed).
- "metrics": per-player season-to-date snapshot (career & recent averages, streaks, percentile).
- "leaderboardChange": top 10 NOW, with their previous position.
- "leaderChange": who was overall #1 before vs after this match.
- "predictions.perfectRounds": players who got all 3 picks correct.
- "rivalries.settled": all 1v1s decided. winner=null means tie. isRevenge=true means rematch.
- "rivalries.withdrawn": players who bailed (penalty incurred).
- "bounty": who was the target and how many beat them.
- "nextSameDayMatch": if another match is later TODAY, this is the current top-3.
- "bonusAuditEntries": one row per bonus actually awarded, with the engine's "explanation" string — trust verbatim.
- "populationStats.recentTop1Top2Gap": avg winning margin last 10 matches — bar for "dominant" vs "tight".
- "teams": only users with a mapped Dream11 team. Only the cricketer NAMES here are valid IPL-player names you may quote.

==================================================
ABSOLUTE RULES — breaking any of these is failure
==================================================
1. You may ONLY use numbers and names that appear in the JSON payload. Do not invent, estimate, average, or extrapolate any number.
2. Do NOT mention real IPL players, real teams' actual cricket stats, or real-world cricket events EXCEPT when narrating a user's own Dream11 picks from "teams". Only the cricketer names in "teams" are valid, and only their fantasy point values from that payload.
3. Every fact must be VERIFIABLE from a specific field.
4. No vague form claims without citing the supporting number.
5. Each fact ≤ ~160 chars. Casual, witty — never cruel.
6. Diversify angles. Lead with highest-impact storyline.
7. Aim for 6-9 facts when material allows.
8. Never repeat a storyline.

Return STRICT JSON only (no markdown fences, no commentary):
{
  "facts": [
    { "text": "...", "type": "domination|close_finish|climb|slip|leader_change|streak_top5|streak_miss|form_swing|percentile|bonus|prediction|rivalry_win|rivalry_revenge|rivalry_tie|rivalry_withdraw|bounty|next_match|context|other", "score": 50-95, "username": "..." }
  ]
}

"score" = your interest level 0-100 (higher = bigger headline). "username" optional — set it when the fact is about one player.
```

---

## User payload

```
Match payload (the ONLY data you may use):

{
  "match": {
    "teamA": "Chennai Super Kings",
    "teamB": "Mumbai Indians",
    "winner": "Chennai Super Kings",
    "bountyUserName": "Heshwanth"
  },
  "results": [
    { "username": "Dhinesh",   "rank": 1, "fantasyPoints": 812.5, "finalPoints": 22, "bonusPoints": 6, "rivalryPoints": 3, "civilWarPoints": 2, "penaltyPoints": 0, "missed": false, "bonusReasons": ["consistency", "king slayer"] },
    { "username": "Heshwanth", "rank": 2, "fantasyPoints": 758.0, "finalPoints": 14, "bonusPoints": 4, "rivalryPoints": 0, "civilWarPoints": 2, "penaltyPoints": 0, "missed": false, "bonusReasons": ["topper defends top"] },
    { "username": "HITMAN",    "rank": 3, "fantasyPoints": 701.0, "finalPoints": 12, "bonusPoints": 0, "rivalryPoints": 4, "civilWarPoints": 2, "penaltyPoints": 0, "missed": false, "bonusReasons": [] },
    { "username": "kathir11s", "rank": 4, "fantasyPoints": 688.5, "finalPoints": 11, "bonusPoints": 0, "rivalryPoints": 4, "civilWarPoints": 2, "penaltyPoints": 0, "missed": false, "bonusReasons": [] },
    { "username": "Mervin J",  "rank": 5, "fantasyPoints": 612.0, "finalPoints": 0,  "bonusPoints": 0, "rivalryPoints": -3, "civilWarPoints": -2, "penaltyPoints": 0, "missed": false, "bonusReasons": [] },
    { "username": "Deeksheeth","rank": 6, "fantasyPoints": 588.0, "finalPoints": -3, "bonusPoints": 0, "rivalryPoints": -3, "civilWarPoints": -2, "penaltyPoints": 0, "missed": false, "bonusReasons": [] },
    { "username": "Kishore",   "rank": 7, "fantasyPoints": 540.0, "finalPoints": -3, "bonusPoints": 0, "rivalryPoints": -4, "civilWarPoints": -2, "penaltyPoints": 0, "missed": false, "bonusReasons": [] },
    { "username": "Arun",      "rank": 8, "fantasyPoints": 502.0, "finalPoints": -2, "bonusPoints": 0, "rivalryPoints": 0, "civilWarPoints": -2, "penaltyPoints": 0, "missed": false, "bonusReasons": [] },
    { "username": "Karthik",   "rank": 9, "fantasyPoints": 488.0, "finalPoints": -2, "bonusPoints": 0, "rivalryPoints": 0, "civilWarPoints": -2, "penaltyPoints": 0, "missed": false, "bonusReasons": [] },
    { "username": "Saran",     "rank": 10,"fantasyPoints": 421.0, "finalPoints": 4,  "bonusPoints": 6, "rivalryPoints": 0, "civilWarPoints": -2, "penaltyPoints": 0, "missed": false, "bonusReasons": ["underdog"] },
    { "username": "Vignesh",   "rank": 11,"fantasyPoints": 380.0, "finalPoints": 0,  "bonusPoints": 0, "rivalryPoints": 0, "civilWarPoints": 0, "penaltyPoints": 0, "missed": false, "bonusReasons": [] },
    { "username": "Raghav",    "rank": 12,"fantasyPoints": 312.0, "finalPoints": 0,  "bonusPoints": 0, "rivalryPoints": 0, "civilWarPoints": 0, "penaltyPoints": 0, "missed": false, "bonusReasons": [] },
    { "username": "Suresh",    "rank": 0, "fantasyPoints": 0,     "finalPoints": -3, "bonusPoints": 0, "rivalryPoints": 0, "civilWarPoints": 0, "penaltyPoints": -3, "missed": true, "bonusReasons": [] }
  ],
  "metrics": [
    { "username": "Dhinesh",   "played": 14, "missed": 0, "careerAvgFinal": 6.8,  "careerAvgRank": 4.1, "recentAvgFinal": 11.2, "recentAvgRank": 2.8, "formDelta": 4.4,  "careerPercentile": 78, "currentMissStreak": 0, "currentTop5Streak": 4 },
    { "username": "Heshwanth", "played": 14, "missed": 0, "careerAvgFinal": 9.5,  "careerAvgRank": 3.2, "recentAvgFinal": 10.4, "recentAvgRank": 2.6, "formDelta": 0.9,  "careerPercentile": 92, "currentMissStreak": 0, "currentTop5Streak": 6 },
    { "username": "HITMAN",    "played": 14, "missed": 0, "careerAvgFinal": 4.0,  "careerAvgRank": 5.4, "recentAvgFinal": 7.8,  "recentAvgRank": 3.6, "formDelta": 3.8,  "careerPercentile": 58, "currentMissStreak": 0, "currentTop5Streak": 2 },
    { "username": "kathir11s", "played": 14, "missed": 0, "careerAvgFinal": 3.6,  "careerAvgRank": 6.0, "recentAvgFinal": 6.2,  "recentAvgRank": 4.0, "formDelta": 2.6,  "careerPercentile": 49, "currentMissStreak": 0, "currentTop5Streak": 1 },
    { "username": "Mervin J",  "played": 14, "missed": 0, "careerAvgFinal": 2.1,  "careerAvgRank": 7.2, "recentAvgFinal": 0.4,  "recentAvgRank": 8.6, "formDelta": -1.7, "careerPercentile": 31, "currentMissStreak": 0, "currentTop5Streak": 0 },
    { "username": "Deeksheeth","played": 14, "missed": 1, "careerAvgFinal": 1.8,  "careerAvgRank": 7.6, "recentAvgFinal": -0.6, "recentAvgRank": 9.0, "formDelta": -2.4, "careerPercentile": 26, "currentMissStreak": 0, "currentTop5Streak": 0 },
    { "username": "Kishore",   "played": 14, "missed": 2, "careerAvgFinal": 0.5,  "careerAvgRank": 8.4, "recentAvgFinal": -1.0, "recentAvgRank": 9.4, "formDelta": -1.5, "careerPercentile": 18, "currentMissStreak": 0, "currentTop5Streak": 0 },
    { "username": "Saran",     "played": 12, "missed": 2, "careerAvgFinal": -0.8, "careerAvgRank": 9.6, "recentAvgFinal": 2.0,  "recentAvgRank": 7.8, "formDelta": 2.8,  "careerPercentile": 11, "currentMissStreak": 0, "currentTop5Streak": 0 },
    { "username": "Suresh",    "played": 9,  "missed": 5, "careerAvgFinal": -2.4, "careerAvgRank": 10.1,"recentAvgFinal": -2.8, "recentAvgRank": 11.0,"formDelta": -0.4, "careerPercentile": 5,  "currentMissStreak": 2, "currentTop5Streak": 0 }
  ],
  "leaderboardChange": [
    { "username": "Heshwanth", "prevPosition": 1, "currPosition": 1, "totalPoints": 138 },
    { "username": "Dhinesh",   "prevPosition": 3, "currPosition": 2, "totalPoints": 124 },
    { "username": "HITMAN",    "prevPosition": 2, "currPosition": 3, "totalPoints": 118 },
    { "username": "kathir11s", "prevPosition": 5, "currPosition": 4, "totalPoints": 96 },
    { "username": "Saran",     "prevPosition": 11,"currPosition": 7, "totalPoints": 41 },
    { "username": "Mervin J",  "prevPosition": 4, "currPosition": 5, "totalPoints": 78 },
    { "username": "Deeksheeth","prevPosition": 6, "currPosition": 8, "totalPoints": 36 }
  ],
  "leaderChange": {
    "previousLeader": "Heshwanth",
    "currentLeader": "Heshwanth",
    "changed": false
  },
  "predictions": {
    "total": 11,
    "correctWinners": 7,
    "perfectRounds": [
      { "username": "Dhinesh", "pointsAwarded": 14 },
      { "username": "kathir11s", "pointsAwarded": 14 }
    ]
  },
  "rivalries": {
    "settled": [
      { "challenger": "HITMAN",    "opponent": "Mervin J",   "winner": "HITMAN",   "pointsAwarded": 4, "isRevenge": true },
      { "challenger": "Dhinesh",   "opponent": "Deeksheeth", "winner": "Dhinesh",  "pointsAwarded": 3, "isRevenge": false },
      { "challenger": "kathir11s", "opponent": "Kishore",    "winner": "kathir11s","pointsAwarded": 4, "isRevenge": true }
    ],
    "withdrawn": [
      { "withdrawer": "Arun", "opponent": "Karthik" }
    ]
  },
  "bounty": {
    "targetUsername": "Heshwanth",
    "beaters": 1
  },
  "nextSameDayMatch": {
    "teamA": "Royal Challengers Bengaluru",
    "teamB": "Gujarat Titans",
    "topThree": [
      { "username": "Heshwanth", "totalPoints": 138 },
      { "username": "Dhinesh",   "totalPoints": 124 },
      { "username": "HITMAN",    "totalPoints": 118 }
    ]
  },
  "bonusAuditEntries": [
    { "username": "Dhinesh",   "bonusType": "consistency",  "points": 3, "explanation": "Finished top-5 in 3 consecutive matches" },
    { "username": "Dhinesh",   "bonusType": "king_slayer",  "points": 3, "explanation": "Outscored pre-match leaderboard #1 (Heshwanth) by 54.5 fantasy points" },
    { "username": "Heshwanth", "bonusType": "topper_defends_top", "points": 4, "explanation": "Pre-match #1 retained the leaderboard top spot" },
    { "username": "Saran",     "bonusType": "underdog",     "points": 6, "explanation": "Pre-match position 11 finished top-2 in the match" }
  ],
  "populationStats": {
    "avgTop1Top2Gap": 38.4,
    "recentTop1Top2Gap": 42.1
  },
  "teams": [
    {
      "username": "Dhinesh",
      "captain": "MS Dhoni",          "captainPoints": 92,
      "viceCaptain": "Ruturaj Gaikwad","viceCaptainPoints": 70,
      "topPick":  { "name": "Jasprit Bumrah", "points": 124 },
      "flopPick": { "name": "Tilak Varma", "points": 6 },
      "bestPossibleCaptain": { "name": "Jasprit Bumrah", "points": 124 },
      "captainGainIfBest": 32
    },
    {
      "username": "Heshwanth",
      "captain": "Jasprit Bumrah",    "captainPoints": 124,
      "viceCaptain": "MS Dhoni",      "viceCaptainPoints": 46,
      "topPick":  { "name": "Jasprit Bumrah", "points": 124 },
      "flopPick": { "name": "Hardik Pandya", "points": 8 },
      "bestPossibleCaptain": { "name": "Jasprit Bumrah", "points": 124 },
      "captainGainIfBest": 0
    },
    {
      "username": "Mervin J",
      "captain": "Hardik Pandya",     "captainPoints": 8,
      "viceCaptain": "Suryakumar Yadav","viceCaptainPoints": 18,
      "topPick":  { "name": "MS Dhoni", "points": 46 },
      "flopPick": { "name": "Hardik Pandya", "points": 8 },
      "bestPossibleCaptain": { "name": "MS Dhoni", "points": 46 },
      "captainGainIfBest": 38
    }
  ]
}
```

---

## What to look for in the response

A **good** model returns:

1. Strict JSON only (no markdown fences, no preamble, no `<think>` blocks).
2. A `facts` array of 6-9 items.
3. Every numeric token in `text` either appears in the payload (or is a small int 0-13 used as a rank).
4. Every cricketer name quoted (Bumrah, Dhoni, etc.) appears in `teams[].captain/viceCaptain/topPick/flopPick/bestPossibleCaptain`.
5. Every `username` is one of the 13 league names.
6. Diverse `type` values — not 6 copies of `bonus`.

A **bad** model will:
- Invent stats ("Dhinesh's win was his 5th of the season" — `5` isn't in the payload).
- Name real cricketers not in any `teams` entry.
- Wrap the JSON in markdown fences or add explanatory prose.
- Repeat the same storyline 3 ways.
- Output `<think>...</think>` reasoning that bleeds into the JSON (DeepSeek-R1 specifically — our code strips this, but the model itself failing to close the block is the smell).

Reject any model that fails 1, 4, or 5 — those are the anti-hallucination guardrails our `validateFacts()` will reject anyway, so you'd see an empty dashboard.
