/**
 * Wallet service — server-side only. Never trust client values.
 *
 * Ledger model: every balance-affecting event is a row in `transactions`.
 * Available balance = prize credits + admin adjustments − redeem holds (pending/approved).
 * The balance is never stored; it is computed by summing the ledger (single source of truth).
 */

export function walletSummary(db, userId) {
  const rows = db.prepare(
    'SELECT type, SUM(amount) AS total FROM transactions WHERE user_id = ? GROUP BY type'
  ).all(userId);

  const byType = Object.fromEntries(rows.map((r) => [r.type, r.total]));

  const credited = (byType.prize_credit ?? 0) + (byType.admin_adjust ?? 0);
  const held = (byType.redeem_hold ?? 0) - (byType.redeem_release ?? 0) - (byType.redeem_rejected ?? 0);
  const paid = byType.redeem_paid ?? 0;

  const available = credited - held - paid;

  const transactions = db.prepare(
    'SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 200'
  ).all(userId);

  return {
    available,
    totalEarned: byType.prize_credit ?? 0,
    totalRedeemed: paid,
    pendingRedemption: held,
    transactions,
  };
}

export function addTransaction(db, { userId, type, amount, ref, tournamentId }) {
  const info = db.prepare(
    'INSERT INTO transactions (user_id, type, amount, ref, tournament_id) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, type, amount, ref ?? null, tournamentId ?? null);
  return info.lastInsertRowid;
}
