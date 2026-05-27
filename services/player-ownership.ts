import { connectDB } from "@/lib/db";
import { Player, type IPlayer } from "@/models/Player";
import { UserMatchTeam } from "@/models/UserMatchTeam";
import { User } from "@/models/User";

export interface PlayerSearchResult {
  id: string;
  my11Id: number;
  name: string;
  dName: string;
  role?: string;
  roleName?: string;
  teamId?: number | null;
  teamName?: string;
  imgURL?: string;
}

export interface PlayerOwnerEntry {
  userId: string;
  username: string;
  handle: string;
  avatar: string | null;
  avatarColor: string | null;
  isCaptain: boolean;
  isViceCaptain: boolean;
  /** Most recent fantasy points contribution from this player on this team. */
  points: number;
}

export interface PlayerOwnershipResult {
  player: PlayerSearchResult;
  ownership: {
    holders: PlayerOwnerEntry[];
    captains: PlayerOwnerEntry[];
    viceCaptains: PlayerOwnerEntry[];
    /** App users who have a team mapped but did NOT pick this player. */
    skippedCount: number;
    totalMappedTeams: number;
  };
  /** When the underlying team data was last refreshed. Helpful for "live" UX. */
  refreshedAt: number;
}

function projectPlayer(p: IPlayer): PlayerSearchResult {
  return {
    id: String(p._id),
    my11Id: p.my11Id,
    name: p.name,
    dName: p.dName || p.name,
    role: p.role,
    roleName: p.roleName,
    teamId: p.teamId ?? null,
    teamName: p.teamName,
    imgURL: p.imgURL,
  };
}

/**
 * Typeahead search across the master Player directory. Restricted to the
 * teams that participate in the given match when `matchId` is provided —
 * which surfaces only the squad currently relevant to the contest the user
 * is viewing.
 */
export async function searchPlayersForMatch(args: {
  matchId: string;
  query: string;
  limit?: number;
}): Promise<PlayerSearchResult[]> {
  const { matchId, query, limit = 12 } = args;
  await connectDB();
  const teams = await UserMatchTeam.find({ matchId }).select("players.id").lean();
  const ids = new Set<number>();
  for (const t of teams) {
    for (const pl of t.players ?? []) ids.add(pl.id);
  }
  if (ids.size === 0) return [];

  const q = (query ?? "").trim();
  const filter: Record<string, unknown> = { my11Id: { $in: Array.from(ids) } };
  if (q.length > 0) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(escaped, "i");
    filter.$or = [{ dName: rx }, { name: rx }, { sName: rx }];
  }
  const docs = await Player.find(filter)
    .sort({ dName: 1 })
    .limit(Math.max(1, Math.min(50, limit)))
    .lean();
  return docs.map((d) => projectPlayer(d as IPlayer));
}

/**
 * Resolve who in the friend group has the given player on their my11 team
 * for this match, and flag captain / vice-captain ownership. Reads always
 * hit the DB so the result reflects the latest refresh — impact-player
 * swaps surface automatically next time `getRefreshedUserMatchTeam` runs.
 */
export async function getPlayerOwnership(args: {
  matchId: string;
  my11Id: number;
}): Promise<PlayerOwnershipResult | null> {
  const { matchId, my11Id } = args;
  await connectDB();

  const player = await Player.findOne({ my11Id }).lean<IPlayer | null>();
  if (!player) return null;

  const allTeams = await UserMatchTeam.find({ matchId })
    .select("userId players captainIds viceCaptainIds fetchedAt")
    .lean();
  const totalMappedTeams = allTeams.length;

  const owningTeams = allTeams.filter((t) =>
    (t.players ?? []).some((p) => p.id === my11Id)
  );

  const userIds = owningTeams.map((t) => t.userId);
  const users = await User.find({ _id: { $in: userIds } })
    .select("username userId avatar avatarColor")
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const holders: PlayerOwnerEntry[] = [];
  let latestFetchedAt = 0;

  for (const t of owningTeams) {
    const u = userMap.get(String(t.userId));
    if (!u) continue;
    const pl = (t.players ?? []).find((p) => p.id === my11Id);
    const isCaptain = (t.captainIds ?? []).includes(my11Id);
    const isViceCaptain = (t.viceCaptainIds ?? []).includes(my11Id);
    const fetchedAt = t.fetchedAt ? new Date(t.fetchedAt).getTime() : 0;
    if (fetchedAt > latestFetchedAt) latestFetchedAt = fetchedAt;
    holders.push({
      userId: String(t.userId),
      username: u.username,
      handle: u.userId,
      avatar: u.avatar ?? null,
      avatarColor: u.avatarColor ?? null,
      isCaptain,
      isViceCaptain,
      points: pl?.points ?? 0,
    });
  }

  holders.sort((a, b) => {
    // Captains first, then vice-captains, then regular owners alpha.
    if (a.isCaptain !== b.isCaptain) return a.isCaptain ? -1 : 1;
    if (a.isViceCaptain !== b.isViceCaptain) return a.isViceCaptain ? -1 : 1;
    return a.username.localeCompare(b.username);
  });

  return {
    player: projectPlayer(player),
    ownership: {
      holders,
      captains: holders.filter((h) => h.isCaptain),
      viceCaptains: holders.filter((h) => h.isViceCaptain),
      skippedCount: Math.max(0, totalMappedTeams - holders.length),
      totalMappedTeams,
    },
    refreshedAt: latestFetchedAt,
  };
}
