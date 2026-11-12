import { Router } from 'express';
import { authRequired, requireRole } from '../middleware/auth.js';
import { roomSchema } from '../lib/validation.js';
import { audit } from '../lib/db-helpers.js';

const router = Router();

// Player: get room credentials for a tournament they are approved in
router.get('/tournament/:tournamentId', authRequired, requireRole('player'), (req, res) => {
  const reg = req.db.prepare(
    "SELECT id FROM registrations WHERE tournament_id = ? AND user_id = ? AND status = 'approved'"
  ).get(req.params.tournamentId, req.user.id);
  if (!reg) return res.status(403).json({ error: 'Only approved participants can see room credentials' });

  const room = req.db.prepare('SELECT * FROM rooms WHERE tournament_id = ?').get(req.params.tournamentId);
  if (!room || !room.visible || !room.room_id) {
    return res.status(404).json({ error: 'Room credentials are not published yet' });
  }
  return res.json({ room: { room_id: room.room_id, password: room.password, updated_at: room.updated_at } });
});

// Admin: set/publish/update room credentials
router.put('/tournament/:tournamentId', authRequired, requireRole('admin', 'coadmin'), (req, res) => {
  const parsed = roomSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });

  const t = req.db.prepare('SELECT id FROM tournaments WHERE id = ?').get(req.params.tournamentId);
  if (!t) return res.status(404).json({ error: 'Tournament not found' });

  const { room_id, password, visible } = parsed.data;
  const existing = req.db.prepare('SELECT id FROM rooms WHERE tournament_id = ?').get(t.id);
  if (existing) {
    req.db.prepare(
      'UPDATE rooms SET room_id = ?, password = ?, visible = ?, updated_at = datetime(\'now\') WHERE tournament_id = ?'
    ).run(room_id, password, visible ? 1 : 0, t.id);
  } else {
    req.db.prepare(
      'INSERT INTO rooms (tournament_id, room_id, password, visible) VALUES (?, ?, ?, ?)'
    ).run(t.id, room_id, password, visible ? 1 : 0);
  }
  audit(req.db, req.user.id, 'room_update', `tournament:${t.id}`, { visible: !!visible });
  return res.json({ ok: true });
});

export default router;