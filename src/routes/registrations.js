import { Router } from 'express';
import { authRequired, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/db-helpers.js';

const router = Router();

router.use(authRequired);

// Admin: list registrations for a tournament
router.get('/tournament/:tournamentId', requireRole('admin', 'coadmin'), (req, res) => {
  const rows = req.db.prepare(
    `SELECT r.id, r.status, r.created_at, r.user_id, u.username, u.email, u.phone, u.ff_uid, u.ff_ign
     FROM registrations r
     JOIN users u ON u.id = r.user_id
     WHERE r.tournament_id = ?
     ORDER BY r.id`
  ).all(req.params.tournamentId);
  return res.json({ registrations: rows });
});

// Admin: accept/reject a registration
router.patch('/:id', requireRole('admin', 'coadmin'), (req, res) => {
  const status = req.body?.status;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be approved or rejected' });
  }
  const reg = req.db.prepare('SELECT * FROM registrations WHERE id = ?').get(req.params.id);
  if (!reg) return res.status(404).json({ error: 'Registration not found' });

  if (status === 'approved') {
    const t = req.db.prepare('SELECT * FROM tournaments WHERE id = ?').get(reg.tournament_id);
    if (t && t.max_slots > 0) {
      const approved = req.db.prepare(
        "SELECT COUNT(*) AS n FROM registrations WHERE tournament_id = ? AND status = 'approved'"
      ).get(t.id).n;
      if (approved >= t.max_slots) {
        return res.status(400).json({ error: 'Tournament is full — cannot approve more' });
      }
    }
  }

  req.db.prepare('UPDATE registrations SET status = ? WHERE id = ?').run(status, reg.id);
  audit(req.db, req.user.id, 'registration_update', `registration:${reg.id}`, { status, tournament: reg.tournament_id });
  return res.json({ ok: true });
});

export default router;