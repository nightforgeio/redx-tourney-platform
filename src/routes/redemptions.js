import { Router } from 'express';
import { authRequired, requireRole } from '../middleware/auth.js';
import { redeemSchema } from '../lib/validation.js';
import { redeemLimiter } from '../middleware/rateLimit.js';
import { walletSummary, addTransaction } from '../services/wallet.js';
import { audit } from '../lib/db-helpers.js';

const router = Router();

// Player: create a redemption request (reserves amount immediately)
router.post('/redeem', authRequired, requireRole('player'), redeemLimiter, (req, res) => {
  const parsed = redeemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
  const { amount, payment_type, payment_number } = parsed.data;

  const summary = walletSummary(req.db, req.user.id);
  if (amount > summary.available) {
    return res.status(400).json({ error: `Insufficient balance. Available: ₹${summary.available}` });
  }

  const tx = req.db.transaction(() => {
    addTransaction(req.db, { userId: req.user.id, type: 'redeem_hold', amount, ref: 'redeem-reserve' });
    const info = req.db.prepare(
      'INSERT INTO redemptions (user_id, amount, payment_type, payment_number) VALUES (?, ?, ?, ?)'
    ).run(req.user.id, amount, payment_type, payment_number);
    return info.lastInsertRowid;
  });
  const id = tx();

  audit(req.db, req.user.id, 'redeem_request', `redemption:${id}`, { amount });
  return res.status(201).json({ ok: true, id, status: 'pending' });
});

// Admin: list redemption requests
router.get('/admin/redemptions', authRequired, requireRole('admin', 'coadmin'), (req, res) => {
  const rows = req.db.prepare(
    `SELECT red.id, red.amount, red.payment_type, red.payment_number, red.status, red.admin_ref, red.created_at,
            u.id AS user_id, u.username, u.email, u.phone
     FROM redemptions red JOIN users u ON u.id = red.user_id
     ORDER BY red.id DESC LIMIT 200`
  ).all();
  return res.json({ redemptions: rows });
});

// Admin: approve / reject / mark paid a redemption
router.patch('/admin/redemptions/:id', authRequired, requireRole('admin', 'coadmin'), (req, res) => {
  const status = req.body?.status;
  const adminRef = req.body?.admin_ref?.toString().slice(0, 100);

  if (!['approved', 'paid', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be approved, paid or rejected' });
  }
  if (status === 'paid' && !adminRef) {
    return res.status(400).json({ error: 'admin_ref is required when marking paid' });
  }

  const red = req.db.prepare('SELECT * FROM redemptions WHERE id = ?').get(req.params.id);
  if (!red) return res.status(404).json({ error: 'Redemption not found' });
  if (red.status === 'paid') return res.status(409).json({ error: 'Already paid' });

  const tx = req.db.transaction(() => {
    if (status === 'paid') {
      // Always release the hold first, then record the payout. Releasing is what
      // frees the reserved amount; recording paid is what moves it to "redeemed".
      addTransaction(req.db, { userId: red.user_id, type: 'redeem_release', amount: red.amount, ref: `redemption:${red.id}` });
      addTransaction(req.db, { userId: red.user_id, type: 'redeem_paid', amount: red.amount, ref: `redemption:${red.id}` });
    } else if (status === 'rejected') {
      addTransaction(req.db, { userId: red.user_id, type: 'redeem_rejected', amount: red.amount, ref: `redemption:${red.id}` });
    }
    req.db.prepare(
      'UPDATE redemptions SET status = ?, admin_ref = COALESCE(?, admin_ref) WHERE id = ?'
    ).run(status, adminRef ?? null, red.id);
  });
  tx();

  audit(req.db, req.user.id, 'redeem_update', `redemption:${red.id}`, { status, admin_ref: adminRef });
  return res.json({ ok: true });
});

export default router;