import bcrypt from 'bcryptjs';
import { openDb, migrate } from './db.js';
import { env } from '../config.js';

const db = openDb();
migrate(db);

const existing = db.prepare('SELECT id FROM users WHERE role = \'admin\'').get();
if (existing) {
  console.log(`Admin already exists (user id ${existing.id}). Nothing to do.`);
  db.close();
  process.exit(0);
}

if (env.admin.password === 'change-me') {
  console.error('ERROR: set ADMIN_PASSWORD in .env before seeding the admin.');
  process.exit(1);
}

const hash = bcrypt.hashSync(env.admin.password, 10);
const info = db.prepare(
  'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, \'admin\')'
).run(env.admin.username, env.admin.email, hash);

console.log(`Admin created: ${env.admin.username} (id ${info.lastInsertRowid})`);
db.close();