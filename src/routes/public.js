import { Router } from 'express';
import { aggregateLeaderboard } from '../services/scoring.js';

/**
 * Public read-only data used by the marketing surface (home page, about page).
 * Nothing here may leak: no room passwords, no emails, no phones, no password hashes.
 */
const router = Router();

function topN(db, tournamentId, n = 3) {
  const board = aggregateLeaderboard(db, tournamentId).slice(0, n);
  const ids = board.map((b) => b.user_id);
  if (!ids.length) return [];
  const users = db.prepare(
    `SELECT id, username, ff_ign FROM users WHERE id IN (${ids.map(() => '?').join(',')})`
  ).all(...ids);
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));
  return board.map((b, i) => ({
    rank: i + 1,
    user_id: b.user_id,
    username: byId[b.user_id]?.username ?? 'unknown',
    ff_ign: byId[b.user_id]?.ff_ign ?? null,
    total_points: b.total_points,
    total_kills: b.total_kills,
    matches_played: b.matches_played,
  }));
}

// Numbers the home page can honestly show. All counted from the ledger/results.
router.get('/stats', (req, res) => {
  const one = (sql) => req.db.prepare(sql).get().n;
  return res.json({
    stats: {
      players: one("SELECT COUNT(*) AS n FROM users WHERE role IN ('player','coadmin')"),
      tournaments: one('SELECT COUNT(*) AS n FROM tournaments'),
      completed: one("SELECT COUNT(*) AS n FROM tournaments WHERE status = 'completed'"),
      prizesDistributed: req.db.prepare(
        "SELECT COALESCE(SUM(amount),0) AS n FROM transactions WHERE type = 'prize_credit'"
      ).get().n,
      paidOut: req.db.prepare(
        "SELECT COALESCE(SUM(amount),0) AS n FROM transactions WHERE type = 'redeem_paid'"
      ).get().n,
      killsRecorded: req.db.prepare('SELECT COALESCE(SUM(kills),0) AS n FROM results').get().n,
    },
  });
});

// Live/upcoming events, ordered by what a player should act on next.
router.get('/upcoming', (req, res) => {
  const rows = req.db.prepare(
    `SELECT t.id, t.title, t.mode, t.format, t.status, t.max_slots, t.event_date, t.event_time,
            t.prize_pool, t.banner_url, t.announcement,
            (SELECT COUNT(*) FROM registrations r
              WHERE r.tournament_id = t.id AND r.status = 'approved') AS slots_filled
     FROM tournaments t
     WHERE t.status IN ('open','registration','ongoing')
     ORDER BY CASE t.status WHEN 'ongoing' THEN 0 WHEN 'registration' THEN 1 ELSE 2 END,
              t.id DESC
     LIMIT 12`
  ).all();
  return res.json({ tournaments: rows });
});

// Finished events with their podium — powers the "last results" strip.
router.get('/recent-results', (req, res) => {
  const events = req.db.prepare(
    `SELECT id, title, mode, format, event_date, event_time, prize_pool
     FROM tournaments WHERE status = 'completed'
     ORDER BY id DESC LIMIT 4`
  ).all();

  return res.json({
    events: events.map((t) => ({ ...t, podium: topN(req.db, t.id, 3) })),
  });
});

// The points table a player will be scored with. Not secret, and players ask for it.
router.get('/tournaments/:id/points', (req, res) => {
  const t = req.db.prepare(
    'SELECT id, mode, points_config_json FROM tournaments WHERE id = ?'
  ).get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  let config = {};
  try { config = JSON.parse(t.points_config_json || '{}'); } catch { config = {}; }
  return res.json({ mode: t.mode, points_config: config });
});

export default router;
