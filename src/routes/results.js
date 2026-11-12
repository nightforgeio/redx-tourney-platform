import { Router } from 'express';
import { aggregateLeaderboard } from '../services/scoring.js';

const router = Router();

/**
 * Public read-only results surface.
 * Admin writes (create match, submit results) live in the admin router so every
 * mutation sits behind one guarded namespace: /api/admin/*
 */

// Public: leaderboard for a tournament
router.get('/tournament/:tournamentId/leaderboard', (req, res) => {
  const rows = aggregateLeaderboard(req.db, req.params.tournamentId);
  const users = req.db.prepare(
    'SELECT id, username, ff_uid, ff_ign FROM users WHERE id IN (SELECT DISTINCT user_id FROM results WHERE tournament_id = ?)'
  ).all(req.params.tournamentId);
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));
  const board = rows.map((r, i) => ({ rank: i + 1, ...byId[r.user_id], ...r }));
  return res.json({ leaderboard: board });
});

// Public: matches + results for a tournament
router.get('/tournament/:tournamentId', (req, res) => {
  const matches = req.db.prepare(
    'SELECT * FROM matches WHERE tournament_id = ? ORDER BY match_no'
  ).all(req.params.tournamentId);
  const results = req.db.prepare(
    `SELECT r.id, r.match_id, r.user_id, r.placement, r.kills, r.placement_points, r.kill_points, r.total_points,
            u.username, u.ff_uid, u.ff_ign
     FROM results r JOIN users u ON u.id = r.user_id
     WHERE r.tournament_id = ? ORDER BY r.match_id, r.placement`
  ).all(req.params.tournamentId);
  return res.json({ matches, results });
});

export default router;