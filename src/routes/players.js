import { Router } from 'express';
import { z } from 'zod';
import { authRequired } from '../middleware/auth.js';
import { registerSchema } from '../lib/validation.js';
import { walletSummary } from '../services/wallet.js';

const router = Router();

const updateProfileSchema = registerSchema.pick({ username: true, phone: true, ff_uid: true, ff_ign: true }).partial();

router.put('/profile', authRequired, (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });

  const cur = req.db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!cur) return res.status(404).json({ error: 'Account not found' });

  const data = parsed.data;
  if (data.username && data.username !== cur.username) {
    const clash = req.db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(data.username, req.user.id);
    if (clash) return res.status(409).json({ error: 'That username is taken' });
  }

  req.db.prepare(
    'UPDATE users SET username = COALESCE(?, username), phone = COALESCE(?, phone), ff_uid = COALESCE(?, ff_uid), ff_ign = COALESCE(?, ff_ign) WHERE id = ?'
  ).run(data.username ?? null, data.phone ?? null, data.ff_uid ?? null, data.ff_ign ?? null, req.user.id);

  const user = req.db.prepare(
    'SELECT id, username, email, phone, role, ff_uid, ff_ign, created_at FROM users WHERE id = ?'
  ).get(req.user.id);
  return res.json({ user });
});

router.get('/wallet', authRequired, (req, res) => {
  return res.json(walletSummary(req.db, req.user.id));
});

router.get('/tournaments', authRequired, (req, res) => {
  const rows = req.db.prepare(
    `SELECT t.id, t.title, t.mode, t.format, t.status, t.event_date, t.event_time, t.max_slots,
            (SELECT COUNT(*) FROM registrations r WHERE r.tournament_id = t.id AND r.status = 'approved') AS approved_count,
            r.status AS my_status
     FROM tournaments t
     LEFT JOIN registrations r ON r.tournament_id = t.id AND r.user_id = ?
     ORDER BY t.id DESC LIMIT 100`
  ).all(req.user.id);
  return res.json({ tournaments: rows });
});

router.get('/results', authRequired, (req, res) => {
  const rows = req.db.prepare(
    `SELECT t.title, t.mode, t.format, m.match_no, m.name, r.placement, r.kills,
            r.placement_points, r.kill_points, r.total_points, r.tournament_id
     FROM results r
     JOIN matches m ON m.id = r.match_id
     JOIN tournaments t ON t.id = r.tournament_id
     WHERE r.user_id = ?
     ORDER BY m.id DESC LIMIT 100`
  ).all(req.user.id);
  return res.json({ results: rows });
});

router.get('/redemptions', authRequired, (req, res) => {
  const rows = req.db.prepare(
    'SELECT * FROM redemptions WHERE user_id = ? ORDER BY id DESC LIMIT 100'
  ).all(req.user.id);
  return res.json({ redemptions: rows });
});

export default router;