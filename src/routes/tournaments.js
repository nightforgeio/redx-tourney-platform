import { Router } from 'express';
import { tournamentSchema } from '../lib/validation.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/db-helpers.js';
import { defaultPointsConfig } from '../services/scoring.js';

const router = Router();

// Public: list tournaments (with public info only)
router.get('/', (req, res) => {
  const rows = req.db.prepare(
    `SELECT id, title, banner_url, mode, format, status, max_slots, event_date, event_time, prize_pool, announcement, created_at,
            (SELECT COUNT(*) FROM registrations r WHERE r.tournament_id = tournaments.id AND r.status = 'approved') AS slots_filled
     FROM tournaments
     ORDER BY id DESC LIMIT 100`
  ).all();
  return res.json({ tournaments: rows });
});

router.get('/:id', (req, res) => {
  const t = req.db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  const { points_config_json, ...publicT } = t;
  publicT.slots_filled = req.db.prepare(
    "SELECT COUNT(*) AS n FROM registrations WHERE tournament_id = ? AND status = 'approved'"
  ).get(t.id).n;
  delete publicT.points_config_json;
  return res.json({ tournament: publicT });
});

// Player: register for a tournament (captain-only for duo/squad)
router.post('/:id/register', authRequired, requireRole('player', 'admin', 'coadmin'), (req, res) => {
  const t = req.db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  if (!['open', 'registration'].includes(t.status)) {
    return res.status(400).json({ error: `Registrations are closed for this tournament (${t.status})` });
  }
  const existing = req.db.prepare(
    'SELECT id FROM registrations WHERE tournament_id = ? AND user_id = ?'
  ).get(t.id, req.user.id);
  if (existing) return res.status(409).json({ error: 'You are already registered' });

  const approved = req.db.prepare(
    "SELECT COUNT(*) AS n FROM registrations WHERE tournament_id = ? AND status = 'approved'"
  ).get(t.id).n;
  if (t.max_slots > 0 && approved >= t.max_slots) {
    return res.status(400).json({ error: 'Tournament is full' });
  }

  req.db.prepare(
    'INSERT INTO registrations (tournament_id, user_id) VALUES (?, ?)'
  ).run(t.id, req.user.id);
  audit(req.db, req.user.id, 'tournament_register', `tournament:${t.id}`, { user: req.user.id });
  return res.status(201).json({ ok: true, status: 'pending' });
});

// Admin: create tournament
router.post('/', authRequired, requireRole('admin', 'coadmin'), (req, res) => {
  const parsed = tournamentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });

  const data = parsed.data;
  const pointsConfig = data.mode === 'br' ? defaultPointsConfig('br') : defaultPointsConfig('cs');
  const info = req.db.prepare(
    `INSERT INTO tournaments (title, banner_url, mode, format, status, max_slots, event_date, event_time, points_config_json, prize_pool, announcement)
     VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`
  ).run(data.title, data.banner_url || null, data.mode, data.format, data.max_slots, data.event_date || null, data.event_time || null, JSON.stringify(pointsConfig), data.prize_pool, data.announcement || null);

  audit(req.db, req.user.id, 'tournament_create', `tournament:${info.lastInsertRowid}`, { title: data.title, mode: data.mode });
  return res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

export default router;