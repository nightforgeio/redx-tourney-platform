import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { registerSchema, loginSchema } from '../lib/validation.js';
import { authRequired, setAuthCookie, clearAuthCookie, signToken } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { audit } from '../lib/db-helpers.js';

const router = Router();

router.post('/register', authLimiter, (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
  }
  const { username, email, phone, password, ff_uid, ff_ign } = parsed.data;

  const exists = req.db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (exists) return res.status(409).json({ error: 'Username or email already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const info = req.db.prepare(
    'INSERT INTO users (username, email, phone, password_hash, ff_uid, ff_ign) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(username, email, phone || null, hash, ff_uid || null, ff_ign || null);

  const user = { id: info.lastInsertRowid, role: 'player' };
  setAuthCookie(res, signToken(user));
  audit(req.db, user.id, 'player_register', `user:${user.id}`, { username, email });
  return res.status(201).json({ ok: true, user: { id: user.id, username, email, role: 'player' } });
});

router.post('/login', authLimiter, (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const { identifier, password } = parsed.data;
  const user = req.db.prepare(
    'SELECT * FROM users WHERE email = ? OR username = ?'
  ).get(identifier, identifier);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Wrong email/username or password' });
  }

  setAuthCookie(res, signToken(user));
  return res.json({ ok: true, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
});

router.post('/logout', authRequired, (req, res) => {
  clearAuthCookie(res);
  return res.json({ ok: true });
});

router.get('/me', authRequired, (req, res) => {
  const user = req.db.prepare(
    'SELECT id, username, email, phone, role, ff_uid, ff_ign, created_at FROM users WHERE id = ?'
  ).get(req.user.id);
  if (!user) return res.status(401).json({ error: 'Account not found' });
  return res.json({ user });
});

export default router;