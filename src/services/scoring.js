/**
 * Scoring service — supports BR and CS with per-tournament configurable points tables.
 *
 * Config shapes (stored in tournaments.points_config_json):
 *  BR: { placement: [5,4,3,2,1,...], kill: 1 }   // placement[i] = points for (i+1)th place
 *  CS: { win: 3, lose: 0, kill: 1 }              // per match outcome + kills
 *
 * New match/tournament = new config; admin sets it live.
 */

export function defaultPointsConfig(mode) {
  return mode === 'br'
    ? { placement: [15, 12, 10, 8, 6, 4, 3, 2, 1, 1, 0, 0], kill: 1 }
    : { win: 3, lose: 0, kill: 1 };
}

export function validatePointsConfig(mode, config) {
  if (!config || typeof config !== 'object') return { ok: false, error: 'Points config required' };
  if (mode === 'br') {
    if (!Array.isArray(config.placement) || config.placement.length < 1) {
      return { ok: false, error: 'BR config needs a placement points array' };
    }
    if (config.placement.some((n) => !Number.isInteger(n) || n < 0)) {
      return { ok: false, error: 'Placement points must be non-negative integers' };
    }
    if (!Number.isInteger(config.kill) || config.kill < 0) {
      return { ok: false, error: 'Kill points must be a non-negative integer' };
    }
  } else {
    for (const k of ['win', 'lose', 'kill']) {
      if (!Number.isInteger(config[k]) || config[k] < 0) {
        return { ok: false, error: `${k} points must be a non-negative integer` };
      }
    }
  }
  return { ok: true };
}

export function computeResultPoints(mode, config, { placement, kills }) {
  const killsNum = Number(kills) || 0;
  if (mode === 'br') {
    const placementPoints = placement ? (config.placement[placement - 1] ?? 0) : 0;
    return {
      placementPoints,
      killPoints: killsNum * config.kill,
      total: placementPoints + killsNum * config.kill,
    };
  }
  // CS: placement 1 = win, else lose
  const outcomePoints = placement === 1 ? config.win : config.lose;
  return {
    placementPoints: outcomePoints,
    killPoints: killsNum * config.kill,
    total: outcomePoints + killsNum * config.kill,
  };
}

export function aggregateLeaderboard(db, tournamentId) {
  const rows = db.prepare(
    `SELECT user_id,
            COUNT(*) AS matches_played,
            SUM(kills) AS total_kills,
            SUM(placement_points) AS placement_points,
            SUM(kill_points) AS kill_points,
            SUM(total_points) AS total_points
     FROM results
     WHERE tournament_id = ?
     GROUP BY user_id
     ORDER BY total_points DESC, total_kills DESC`
  ).all(tournamentId);
  return rows;
}