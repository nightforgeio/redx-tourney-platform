import { openDb } from '../db/db.js';

let sharedDb = null;

export function db() {
  if (!sharedDb) sharedDb = openDb();
  return sharedDb;
}

export function withDb(req, res, next) {
  req.db = db();
  next();
}

export function audit(db, adminId, action, target, details) {
  db.prepare(
    'INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, ?, ?, ?)'
  ).run(adminId ?? null, action, target ?? null, details ? JSON.stringify(details) : null);
}