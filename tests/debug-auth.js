process.env.DATA_DIR = '/tmp/dbg2-redx';
process.env.JWT_SECRET = 't';
process.env.NODE_ENV = 'test';

import fs from 'node:fs';
fs.rmSync('/tmp/dbg2-redx', { recursive: true, force: true });

const { createApp } = await import('/root/redx-platform/src/app.js');
const { openDb, migrate } = await import('/root/redx-platform/src/db/db.js');
const bcrypt = (await import('bcryptjs')).default;

const d = openDb();
migrate(d);
d.prepare('INSERT INTO users (username,email,password_hash,role) VALUES (?,?,?,?)')
  .run('redxadmin', 'admin@test.local', bcrypt.hashSync('adminpass123', 4), 'admin');
console.log('DB row:', JSON.stringify(d.prepare('SELECT id, username, role FROM users').all()));
d.close();

const app = createApp();
const s = app.listen(0);
const base = 'http://127.0.0.1:' + s.address().port;

let cookie = '';
async function req(m, u, b) {
  const h = { 'content-type': 'application/json' };
  if (cookie) h.cookie = cookie;
  const r = await fetch(base + u, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined });
  const sc = r.headers.getSetCookie?.() || [];
  if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
  let data = null;
  try { data = await r.json(); } catch { /* none */ }
  return { status: r.status, data, setCookie: sc };
}

const login = await req('POST', '/api/auth/login', { identifier: 'redxadmin', password: 'adminpass123' });
console.log('LOGIN:', JSON.stringify(login));
console.log('COOKIE:', cookie);

// decode the jwt payload manually
if (cookie.startsWith('redx_token=')) {
  const token = cookie.split('=')[1];
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  console.log('JWT PAYLOAD:', JSON.stringify(payload));
}

const me = await req('GET', '/api/auth/me');
console.log('ME:', JSON.stringify(me));

const stats = await req('GET', '/api/admin/stats');
console.log('STATS:', JSON.stringify(stats));

s.close();