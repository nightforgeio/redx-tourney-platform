import { Router } from 'express';
import { authRequired, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/db-helpers.js';
import { coadminSchema, matchResultSchema } from '../lib/validation.js';
import { walletSummary, addTransaction } from '../services/wallet.js';
import { validatePointsConfig, computeResultPoints } from '../services/scoring.js';

const router = Router();

// Every admin route requires a valid session first, then a role check.
router.use(authRequired);

// ---- Dashboard stats ----
router.get('/stats', requireRole('admin', 'coadmin'), (req, res) => {
  const one = (sql, ...args) => req.db.prepare(sql).get(...args);
  const stats = {
    players: one('SELECT COUNT(*) AS n FROM users WHERE role IN (\'player\',\'coadmin\')').n,
    totalTournaments: one('SELECT COUNT(*) AS n FROM tournaments').n,
    activeTournaments: one("SELECT COUNT(*) AS n FROM tournaments WHERE status IN ('open','registration','ongoing')").n,
    completedTournaments: one("SELECT COUNT(*) AS n FROM tournaments WHERE status = 'completed'").n,
    totalRegistrations: one('SELECT COUNT(*) AS n FROM registrations').n,
    approvedRegistrations: one("SELECT COUNT(*) AS n FROM registrations WHERE status = 'approved'").n,
    totalPrizesDistributed: one("SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE type = 'prize_credit'").s,
    pendingRedemptions: one("SELECT COUNT(*) AS n FROM redemptions WHERE status IN ('pending','approved')").n,
    totalPaidOut: one("SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE type = 'redeem_paid'").s,
  };
  return res.json({ stats });
});

// ---- Admin: list all tournaments ----
router.get('/tournaments', requireRole('admin', 'coadmin'), (req, res) => {
  const rows = req.db.prepare('SELECT * FROM tournaments ORDER BY id DESC LIMIT 200').all();
  return res.json({ tournaments: rows });
});

// ---- Admin: update tournament (status, announcement, points config, pool) ----
router.patch('/tournaments/:id', requireRole('admin', 'coadmin'), (req, res) => {
  const t = req.db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Tournament not found' });

  const body = req.body || {};
  const fields = [];

  if (body.status !== undefined) {
    const allowed = ['draft', 'open', 'registration', 'ongoing', 'completed', 'cancelled'];
    if (!allowed.includes(body.status)) return res.status(400).json({ error: 'Invalid status' });
    fields.push(['status', body.status]);
  }
  if (body.announcement !== undefined) {
    fields.push(['announcement', String(body.announcement).slice(0, 2000)]);
  }
  if (body.prize_pool !== undefined) {
    const pool = Number(body.prize_pool);
    if (!Number.isInteger(pool) || pool < 0) return res.status(400).json({ error: 'prize_pool must be a non-negative integer' });
    fields.push(['prize_pool', pool]);
  }
  if (body.points_config !== undefined) {
    const check = validatePointsConfig(t.mode, body.points_config);
    if (!check.ok) return res.status(400).json({ error: check.error });
    fields.push(['points_config_json', JSON.stringify(body.points_config)]);
  }
  if (body.banner_url !== undefined) fields.push(['banner_url', String(body.banner_url).slice(0, 500) || null]);
  if (body.event_date !== undefined) fields.push(['event_date', body.event_date || null]);
  if (body.event_time !== undefined) fields.push(['event_time', body.event_time || null]);
  if (body.title !== undefined) fields.push(['title', String(body.title).slice(0, 80)]);

  if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  const sets = fields.map(([k]) => `${k} = ?`).join(', ');
  req.db.prepare(`UPDATE tournaments SET ${sets} WHERE id = ?`).run(...fields.map(([, v]) => v), t.id);
  audit(req.db, req.user.id, 'tournament_update', `tournament:${t.id}`, { fields: fields.map(([k]) => k) });
  return res.json({ ok: true });
});

// ---- Admin: list players ----
router.get('/players', requireRole('admin', 'coadmin'), (req, res) => {
  const rows = req.db.prepare(
    'SELECT id, username, email, phone, role, ff_uid, ff_ign, created_at FROM users ORDER BY id'
  ).all();
  return res.json({ players: rows });
});

// ---- Admin: grant/revoke co-admin (admin only, max 2) ----
router.post('/coadmins', requireRole('admin'), (req, res) => {
  const parsed = coadminSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  const { user_id, grant } = parsed.data;

  const target = req.db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'admin') return res.status(400).json({ error: 'Cannot change the main admin' });

  if (grant) {
    const coadmins = req.db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'coadmin'").get().n;
    if (coadmins >= 2) return res.status(400).json({ error: 'Limit reached: maximum 2 co-admins allowed' });
    req.db.prepare("UPDATE users SET role = 'coadmin' WHERE id = ?").run(user_id);
  } else {
    req.db.prepare("UPDATE users SET role = 'player' WHERE id = ?").run(user_id);
  }
  audit(req.db, req.user.id, 'coadmin_update', `user:${user_id}`, { grant });
  return res.json({ ok: true });
});

// ---- Admin: wallet view for a player ----
router.get('/players/:id/wallet', requireRole('admin', 'coadmin'), (req, res) => {
  const user = req.db.prepare('SELECT id, username FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Player not found' });
  return res.json({ player: user, wallet: walletSummary(req.db, user.id) });
});

// ---- Admin: adjust player wallet (ledger entry + audit) ----
router.post('/players/:id/wallet/adjust', requireRole('admin', 'coadmin'), (req, res) => {
  const amount = Number(req.body?.amount);
  const note = String(req.body?.note || '').slice(0, 200);
  if (!Number.isInteger(amount) || amount === 0) {
    return res.status(400).json({ error: 'amount must be a non-zero integer (₹)' });
  }
  const user = req.db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Player not found' });

  const tx = req.db.transaction(() => {
    addTransaction(req.db, { userId: user.id, type: 'admin_adjust', amount, ref: note || 'admin-adjust' });
    audit(req.db, req.user.id, 'wallet_adjust', `user:${user.id}`, { amount, note });
  });
  tx();
  return res.json({ ok: true, wallet: walletSummary(req.db, user.id) });
});

// ---- Admin: publish prize distribution for a completed tournament (idempotent) ----
router.post('/tournaments/:id/distribute-prizes', requireRole('admin', 'coadmin'), (req, res) => {
  const t = req.db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Tournament not found' });

  // Idempotency guard runs first: publishing twice must never credit twice,
  // regardless of what the second request's numbers look like.
  const duplicate = req.db.prepare(
    "SELECT COUNT(*) AS n FROM transactions WHERE type = 'prize_credit' AND tournament_id = ?"
  ).get(t.id).n;
  if (duplicate > 0) {
    return res.status(409).json({ error: 'Prizes already distributed for this tournament (duplicate credit blocked)' });
  }

  if (t.status !== 'completed') {
    return res.status(400).json({ error: 'Set tournament to completed before distributing prizes' });
  }

  const distribution = req.body?.distribution;
  if (!Array.isArray(distribution) || distribution.length === 0) {
    return res.status(400).json({ error: 'distribution must be an array of {user_id, amount}' });
  }
  const total = distribution.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  if (total > t.prize_pool) {
    return res.status(400).json({ error: `Total distribution ₹${total} exceeds prize pool ₹${t.prize_pool}` });
  }
  if (t.prize_pool > 0 && total !== t.prize_pool) {
    return res.status(400).json({ error: `Total distribution ₹${total} does not match prize pool ₹${t.prize_pool}. Adjust pool or distribution.` });
  }
  for (const d of distribution) {
    if (!Number.isInteger(Number(d.amount)) || Number(d.amount) <= 0) {
      return res.status(400).json({ error: 'Each prize amount must be a positive integer' });
    }
    const u = req.db.prepare('SELECT id FROM users WHERE id = ?').get(Number(d.user_id));
    if (!u) return res.status(400).json({ error: `User ${d.user_id} not found` });
  }

  const tx = req.db.transaction(() => {
    for (const d of distribution) {
      const uid = Number(d.user_id);
      const amount = Number(d.amount);
      const already = req.db.prepare(
        "SELECT id FROM transactions WHERE type = 'prize_credit' AND tournament_id = ? AND user_id = ?"
      ).get(t.id, uid);
      if (already) continue; // per-user guard inside tx
      addTransaction(req.db, { userId: uid, type: 'prize_credit', amount, ref: `prize:tournament:${t.id}`, tournamentId: t.id });
    }
    audit(req.db, req.user.id, 'prizes_distributed', `tournament:${t.id}`, { total, count: distribution.length });
  });
  tx();
  return res.json({ ok: true, totalDistributed: total });
});

// ---- Admin: matches + result entry ----
router.post('/tournaments/:tournamentId/matches', requireRole('admin', 'coadmin'), (req, res) => {
  const matchNo = Number(req.body?.match_no);
  const name = String(req.body?.name || '').slice(0, 80) || `Match ${matchNo}`;
  if (!Number.isInteger(matchNo) || matchNo < 1) {
    return res.status(400).json({ error: 'match_no must be a positive integer' });
  }
  const t = req.db.prepare('SELECT id FROM tournaments WHERE id = ?').get(req.params.tournamentId);
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  try {
    const info = req.db.prepare(
      'INSERT INTO matches (tournament_id, match_no, name) VALUES (?, ?, ?)'
    ).run(t.id, matchNo, name);
    audit(req.db, req.user.id, 'match_create', `tournament:${t.id}`, { match_no: matchNo });
    return res.status(201).json({ ok: true, id: info.lastInsertRowid });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'That match number already exists' });
    }
    throw e;
  }
});

router.get('/tournaments/:tournamentId/matches', requireRole('admin', 'coadmin'), (req, res) => {
  const rows = req.db.prepare(
    'SELECT * FROM matches WHERE tournament_id = ? ORDER BY match_no'
  ).all(req.params.tournamentId);
  return res.json({ matches: rows });
});

// Submit/update results for a match. Points come from the tournament's config
// (BR placement table + kill points, or CS win/lose + kill points).
router.put('/matches/:matchId/results', requireRole('admin', 'coadmin'), (req, res) => {
  const parsed = matchResultSchema.safeParse({ match_id: req.params.matchId, rows: req.body?.rows });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });

  const match = req.db.prepare('SELECT * FROM matches WHERE id = ?').get(parsed.data.match_id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  const t = req.db.prepare('SELECT * FROM tournaments WHERE id = ?').get(match.tournament_id);
  const config = JSON.parse(t.points_config_json);

  const upsert = req.db.prepare(
    `INSERT INTO results (match_id, tournament_id, user_id, placement, kills, placement_points, kill_points, total_points)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(match_id, user_id) DO UPDATE SET
       placement = excluded.placement, kills = excluded.kills,
       placement_points = excluded.placement_points, kill_points = excluded.kill_points,
       total_points = excluded.total_points`
  );

  const tx = req.db.transaction(() => {
    for (const row of parsed.data.rows) {
      const points = computeResultPoints(t.mode, config, { placement: row.placement, kills: row.kills });
      upsert.run(match.id, t.id, row.user_id, row.placement ?? null, row.kills, points.placementPoints, points.killPoints, points.total);
    }
    req.db.prepare("UPDATE matches SET status = 'done' WHERE id = ?").run(match.id);
    audit(req.db, req.user.id, 'results_submit', `match:${match.id}`, { rows: parsed.data.rows.length });
  });
  tx();
  return res.json({ ok: true });
});

// ---- Admin: audit log ----
router.get('/audit', requireRole('admin', 'coadmin'), (req, res) => {
  const rows = req.db.prepare(
    'SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200'
  ).all();
  return res.json({ auditLogs: rows });
});

// ---- Admin: overview for panel ----
router.get('/overview', requireRole('admin', 'coadmin'), (req, res) => {
  const tournaments = req.db.prepare('SELECT * FROM tournaments ORDER BY id DESC LIMIT 50').all();
  const recentRedemptions = req.db.prepare(
    'SELECT red.*, u.username FROM redemptions red JOIN users u ON u.id = red.user_id ORDER BY red.id DESC LIMIT 20'
  ).all();
  return res.json({ tournaments, recentRedemptions });
});

export default router;