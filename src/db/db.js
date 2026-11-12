/**
 * Database layer — thin adapter over Node's built-in `node:sqlite` (node:sqlite).
 *
 * Why built-in instead of better-sqlite3:
 *  - zero native compilation (better-sqlite3 needs node-gyp + a prebuilt binary
 *    that does not exist for this exact runtime on this device);
 *  - zero extra dependency, so it also deploys cleanly on Render;
 *  - API is synchronous like better-sqlite3, so the data-access style stays simple.
 *
 * The adapter exposes a small better-sqlite3-like surface (prepare/run/get/all,
 * exec, pragma, transaction) so the rest of the codebase never changes.
 * DatabaseSync already returns the idiomatic result shapes, so this stays thin.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config.js';

class Statement {
  constructor(stmt) {
    this.stmt = stmt;
  }
  run(...params) {
    const r = this.stmt.run(...params);
    return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
  }
  get(...params) {
    return this.stmt.get(...params);
  }
  all(...params) {
    return this.stmt.all(...params);
  }
}

class Db {
  constructor(file) {
    this.raw = new DatabaseSync(file);
  }
  prepare(sql) {
    return new Statement(this.raw.prepare(sql));
  }
  exec(sql) {
    this.raw.exec(sql);
  }
  pragma(expr) {
    // node:sqlite has no pragma() helper; WAL/foreign_keys are plain statements.
    try {
      this.raw.exec(`PRAGMA ${expr};`);
    } catch {
      /* pragma may be unsupported in some builds — safe to ignore */
    }
  }
  transaction(fn) {
    // better-sqlite3-style transaction wrapper: returns a callable that runs
    // fn inside BEGIN/COMMIT and rolls back on error. Synchronous by design.
    return (...args) => {
      this.raw.exec('BEGIN');
      try {
        const result = fn(...args);
        this.raw.exec('COMMIT');
        return result;
      } catch (e) {
        try { this.raw.exec('ROLLBACK'); } catch { /* already rolled back */ }
        throw e;
      }
    };
  }
  close() {
    this.raw.close();
  }
}

export function openDb() {
  fs.mkdirSync(env.dataDir, { recursive: true });
  const dbPath = path.join(env.dataDir, 'redx.db');
  const db = new Db(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player','admin','coadmin')),
  ff_uid TEXT,
  ff_ign TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  banner_url TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('br','cs')),
  format TEXT NOT NULL CHECK (format IN ('solo','duo','squad')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','registration','ongoing','completed','cancelled')),
  max_slots INTEGER NOT NULL DEFAULT 0 CHECK (max_slots >= 0),
  event_date TEXT,
  event_time TEXT,
  points_config_json TEXT NOT NULL DEFAULT '{}',
  prize_pool INTEGER NOT NULL DEFAULT 0 CHECK (prize_pool >= 0),
  announcement TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tournament_id, user_id)
);

CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL UNIQUE REFERENCES tournaments(id) ON DELETE CASCADE,
  room_id TEXT,
  password TEXT,
  visible INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  match_no INTEGER NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tournament_id, match_no)
);

CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  placement INTEGER,
  kills INTEGER NOT NULL DEFAULT 0,
  placement_points INTEGER NOT NULL DEFAULT 0,
  kill_points INTEGER NOT NULL DEFAULT 0,
  total_points INTEGER NOT NULL DEFAULT 0,
  UNIQUE (match_id, user_id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('prize_credit','redeem_hold','redeem_release','redeem_paid','redeem_rejected','admin_adjust')),
  amount INTEGER NOT NULL,
  ref TEXT,
  tournament_id INTEGER REFERENCES tournaments(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  payment_type TEXT NOT NULL CHECK (payment_type IN ('upi','phone')),
  payment_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','rejected')),
  admin_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  target TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reg_tourney ON registrations(tournament_id);
CREATE INDEX IF NOT EXISTS idx_reg_user ON registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_res_tourney ON results(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_redem_user ON redemptions(user_id);
`;

export function migrate(db) {
  db.exec(SCHEMA);
}

export { SCHEMA };