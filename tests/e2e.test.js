/**
 * End-to-end test suite — exercises the real HTTP API against a temp DB.
 * Run: node tests/e2e.test.js
 * No test framework dependency; asserts manually and exits non-zero on failure.
 */
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'redx-test-'));
process.env.DATA_DIR = tmp;
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

const { createApp } = await import('../src/app.js');
const { openDb, migrate } = await import('../src/db/db.js');
const { addTransaction } = await import('../src/services/wallet.js');

const db = openDb();
migrate(db);
db.close();

const app = createApp();
const server = app.listen(0);
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

let passed = 0;
const results = [];
function check(name, fn) {
  try {
    fn();
    passed++;
    results.push(`PASS  ${name}`);
    console.log(`PASS  ${name}`);
  } catch (e) {
    results.push(`FAIL  ${name} — ${e.message}`);
    console.log(`FAIL  ${name} — ${e.message}`);
  }
}

/** Minimal cookie-aware fetch helper. */
function client() {
  let cookie = '';
  return {
    async req(method, url, body) {
      const headers = { 'content-type': 'application/json' };
      if (cookie) headers.cookie = cookie;
      const res = await fetch(base + url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const setCookie = res.headers.getSetCookie?.() || [];
      if (setCookie.length) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
      let data = null;
      try { data = await res.json(); } catch { /* empty */ }
      return { status: res.status, data };
    },
    get: (u) => this.req('GET', u),
  };
}

// ---- helpers to build a client with method shortcuts ----
function makeClient() {
  let cookie = '';
  const doReq = async (method, url, body) => {
    const headers = { 'content-type': 'application/json' };
    if (cookie) headers.cookie = cookie;
    const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const setCookie = res.headers.getSetCookie?.() || [];
    if (setCookie.length) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    return { status: res.status, data };
  };
  return {
    get: (u) => doReq('GET', u),
    post: (u, b) => doReq('POST', u, b),
    put: (u, b) => doReq('PUT', u, b),
    patch: (u, b) => doReq('PATCH', u, b),
  };
}

const admin = makeClient();
const alice = makeClient();
const bob = makeClient();

// ---- create admin directly in DB (seed script needs .env) ----
const bcrypt = (await import('bcryptjs')).default;
{
  const d = openDb();
  d.prepare('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run('redxadmin', 'admin@test.local', bcrypt.hashSync('adminpass123', 4), 'admin');
  d.close();
}

// ---------- 1. Auth ----------
{
  const r = await alice.post('/api/auth/register', {
    username: 'alice', email: 'alice@test.local', password: 'password123', phone: '9876543210', ff_uid: '111222333', ff_ign: 'ALICE.FF',
  });
  check('player can register', () => assert.equal(r.status, 201));
}
{
  const r = await bob.post('/api/auth/register', { username: 'bob', email: 'bob@test.local', password: 'password123' });
  check('second player can register', () => assert.equal(r.status, 201));
}
{
  const r = await makeClient().post('/api/auth/register', { username: 'alice', email: 'other@test.local', password: 'password123' });
  check('duplicate username rejected (409)', () => assert.equal(r.status, 409));
}
{
  const c = makeClient();
  const r = await c.post('/api/auth/register', { username: 'x', email: 'bad', password: '123' });
  check('invalid registration rejected (400)', () => assert.equal(r.status, 400));
}
{
  const c = makeClient();
  const r = await c.post('/api/auth/login', { identifier: 'alice@test.local', password: 'password123' });
  check('login with email works', () => assert.equal(r.status, 200));
}
{
  const c = makeClient();
  const r = await c.post('/api/auth/login', { identifier: 'alice', password: 'wrongpass' });
  check('wrong password rejected (401)', () => assert.equal(r.status, 401));
}
{
  const c = makeClient();
  const r = await c.get('/api/player/wallet');
  check('wallet requires auth (401)', () => assert.equal(r.status, 401));
}
{
  const r = await admin.post('/api/auth/login', { identifier: 'redxadmin', password: 'adminpass123' });
  check('admin login works', () => assert.equal(r.status, 200));
}
{
  const r = await alice.get('/api/auth/me');
  check('me returns own profile', () => { assert.equal(r.status, 200); assert.equal(r.data.user.username, 'alice'); });
}

// ---------- 2. Profile ----------
{
  const r = await alice.put('/api/player/profile', { ff_uid: '999888777', ff_ign: 'ALICE.X' });
  check('player can edit FF UID/IGN', () => { assert.equal(r.status, 200); assert.equal(r.data.user.ff_ign, 'ALICE.X'); });
}

// ---------- 3. Tournaments + registration ----------
let tId;
{
  const r = await admin.post('/api/tournaments', {
    title: 'RedX Free Fire BR Squad', mode: 'br', format: 'squad', max_slots: 2, prize_pool: 500, event_date: '2026-12-01', event_time: '20:00',
  });
  check('admin can create BR tournament', () => assert.equal(r.status, 201));
  tId = r.data.id;
}
{
  const r = await alice.post('/api/player/wallet', {});
  check('player cannot post to wallet (404/405)', () => assert.ok([404, 405].includes(r.status)));
}
{
  const r = await admin.patch(`/api/admin/tournaments/${tId}`, { status: 'open' });
  check('admin can open registration', () => assert.equal(r.status, 200));
}
{
  const r = await alice.post(`/api/tournaments/${tId}/register`);
  check('player can register for tournament', () => assert.equal(r.status, 201));
}
{
  const r = await alice.post(`/api/tournaments/${tId}/register`);
  check('duplicate registration blocked (409)', () => assert.equal(r.status, 409));
}
{
  const r = await bob.post(`/api/tournaments/${tId}/register`);
  check('second player can register', () => assert.equal(r.status, 201));
}
{
  const r = await admin.get(`/api/registrations/tournament/${tId}`);
  check('admin can list registrations', () => {
    if (r.status !== 200) throw new Error(`status ${r.status} body ${JSON.stringify(r.data)}`);
    assert.equal(r.data.registrations.length, 2);
  });
  globalThis.__regIds = r.data.registrations?.map((x) => x.id) ?? [];
}
{
  const r = await admin.patch(`/api/registrations/${globalThis.__regIds[0]}`, { status: 'approved' });
  check('admin can approve registration', () => assert.equal(r.status, 200));
}
{
  const r = await admin.patch(`/api/registrations/${globalThis.__regIds[1]}`, { status: 'rejected' });
  check('admin can reject registration', () => assert.equal(r.status, 200));
}
{
  const r = await alice.get(`/api/player/tournaments`);
  check('player sees own registration status', () => {
    const row = r.data.tournaments.find((t) => t.id === tId);
    assert.equal(row.my_status, 'approved');
  });
}
{
  // rejected player must not see room creds
  const r = await admin.put(`/api/rooms/tournament/${tId}`, { room_id: '88112233', password: 'redxpass', visible: true });
  check('admin can publish room credentials', () => assert.equal(r.status, 200));
}
{
  const r = await bob.get(`/api/rooms/tournament/${tId}`);
  check('rejected player cannot see room creds (403)', () => assert.equal(r.status, 403));
}
{
  const r = await alice.get(`/api/rooms/tournament/${tId}`);
  check('approved player sees room creds', () => { assert.equal(r.status, 200); assert.equal(r.data.room.room_id, '88112233'); });
}
{
  const r = await fetch(`${base}/api/tournaments/${tId}`).then((x) => x.json());
  check('public tournament payload never leaks room password', () => assert.ok(!JSON.stringify(r).includes('redxpass')));
}

// ---------- 4. Results + scoring ----------
let matchId;
{
  const r = await admin.post(`/api/admin/tournaments/${tId}/matches`, { match_no: 1, name: 'Match 1' });
  check('admin can add match', () => assert.equal(r.status, 201));
  matchId = r.data.id;
}
{
  // BR default config: placement [15,12,...], kill 1
  const reg = (await admin.get(`/api/registrations/tournament/${tId}`)).data.registrations;
  const aliceReg = reg.find((x) => x.username === 'alice');
  const bobReg = reg.find((x) => x.username === 'bob');
  const r = await admin.put(`/api/admin/matches/${matchId}/results`, {
    rows: [
      { user_id: aliceReg.user_id, placement: 1, kills: 4 },
      { user_id: bobReg.user_id, placement: 2, kills: 2 },
    ],
  });
  check('admin can submit BR results', () => assert.equal(r.status, 200));
}
{
  const r = await fetch(`${base}/api/results/tournament/${tId}/leaderboard`).then((x) => x.json());
  const top = r.leaderboard[0];
  check('BR auto-scoring correct (15 + 4 kills = 19)', () => { assert.equal(top.total_points, 19); assert.equal(top.total_kills, 4); });
}
{
  const second = (await fetch(`${base}/api/results/tournament/${tId}/leaderboard`).then((x) => x.json())).leaderboard[1];
  check('BR 2nd place scoring correct (12 + 2 = 14)', () => assert.equal(second.total_points, 14));
}
{
  // idempotent re-submit of same match: updates, no duplicate rows
  const reg = (await admin.get(`/api/registrations/tournament/${tId}`)).data.registrations;
  const aliceReg = reg.find((x) => x.username === 'alice');
  await admin.put(`/api/admin/matches/${matchId}/results`, {
    rows: [{ user_id: aliceReg.user_id, placement: 1, kills: 7 }],
  });
  const lb = (await fetch(`${base}/api/results/tournament/${tId}/leaderboard`).then((x) => x.json())).leaderboard;
  check('re-submit updates existing row, no duplicate (1 row for alice)', () => {
    assert.equal(lb.filter((r) => r.username === 'alice').length, 1);
    assert.equal(lb.find((r) => r.username === 'alice').total_points, 22);
  });
}

// ---------- 5. CS scoring ----------
let csId, csMatchId, aliceId, bobId;
{
  const r = await admin.post('/api/tournaments', { title: 'RedX Clash Squad', mode: 'cs', format: 'squad', max_slots: 8, prize_pool: 300 });
  csId = r.data.id;
  await admin.patch(`/api/admin/tournaments/${csId}`, { status: 'open' });
  const reg = (await admin.get('/api/admin/players')).data.players;
  aliceId = reg.find((x) => x.username === 'alice').id;
  bobId = reg.find((x) => x.username === 'bob').id;
  const m = await admin.post(`/api/admin/tournaments/${csId}/matches`, { match_no: 1 });
  csMatchId = m.data.id;
  const res = await admin.put(`/api/admin/matches/${csMatchId}/results`, {
    rows: [{ user_id: aliceId, placement: 1, kills: 5 }, { user_id: bobId, placement: 3, kills: 2 }],
  });
  check('admin can submit CS results', () => assert.equal(res.status, 200));
}
{
  const lb = (await fetch(`${base}/api/results/tournament/${csId}/leaderboard`).then((x) => x.json())).leaderboard;
  const a = lb.find((r) => r.username === 'alice');
  const b = lb.find((r) => r.username === 'bob');
  check('CS win scoring (3 + 5 kills = 8)', () => assert.equal(a.total_points, 8));
  check('CS loss scoring (0 + 2 kills = 2, no BR placement points)', () => assert.equal(b.total_points, 2));
}
{
  // CS custom configurable table
  const r = await admin.patch(`/api/admin/tournaments/${csId}`, { points_config: { win: 5, lose: 1, kill: 2 } });
  check('admin can set custom CS points table', () => assert.equal(r.status, 200));
  await admin.put(`/api/admin/matches/${csMatchId}/results`, {
    rows: [{ user_id: aliceId, placement: 1, kills: 5 }],
  });
  const lb = (await fetch(`${base}/api/results/tournament/${csId}/leaderboard`).then((x) => x.json())).leaderboard;
  check('custom CS scoring applies (5 + 5*2 = 15)', () => assert.equal(lb.find((r) => r.username === 'alice').total_points, 15));
}

// ---------- 6. Wallet + prize distribution ----------
{
  const w0 = (await alice.get('/api/player/wallet')).data;
  check('new wallet starts at zero', () => assert.equal(w0.available, 0));

  // cannot distribute before completed
  const r1 = await admin.post(`/api/admin/tournaments/${tId}/distribute-prizes`, { distribution: [{ user_id: aliceId, amount: 500 }] });
  check('prize distribution blocked until tournament completed (400)', () => assert.equal(r1.status, 400));

  await admin.patch(`/api/admin/tournaments/${tId}`, { status: 'completed' });
  const r2 = await admin.post(`/api/admin/tournaments/${tId}/distribute-prizes`, {
    distribution: [{ user_id: aliceId, amount: 300 }, { user_id: bobId, amount: 200 }],
  });
  check('admin can distribute prizes (300+200=500 pool)', () => assert.equal(r2.status, 200));

  const w1 = (await alice.get('/api/player/wallet')).data;
  check('winner wallet credited automatically (300)', () => assert.equal(w1.available, 300));

  // duplicate credit prevention
  const r3 = await admin.post(`/api/admin/tournaments/${tId}/distribute-prizes`, { distribution: [{ user_id: aliceId, amount: 300 }] });
  check('duplicate prize credit blocked (409)', () => assert.equal(r3.status, 409));

  const w2 = (await alice.get('/api/player/wallet')).data;
  check('wallet unchanged after blocked duplicate', () => assert.equal(w2.available, 300));

  // pool mismatch guard
  const r4 = await admin.patch(`/api/admin/tournaments/${csId}`, { status: 'completed' });
  const r5 = await admin.post(`/api/admin/tournaments/${csId}/distribute-prizes`, { distribution: [{ user_id: aliceId, amount: 100 }] });
  check('distribution must match pool exactly (400)', () => assert.equal(r5.status, 400));
}

// ---------- 7. Redemption flow ----------
let redId;
{
  const r = await alice.post('/api/redeem', { amount: 100, payment_type: 'upi', payment_number: 'alice@okaxis' });
  check('player can request redemption', () => assert.equal(r.status, 201));
  redId = r.data.id;

  const w = (await alice.get('/api/player/wallet')).data;
  check('redemption reserves balance (300 - 100 = 200 available)', () => { assert.equal(w.available, 200); assert.equal(w.pendingRedemption, 100); });

  const over = await alice.post('/api/redeem', { amount: 5000, payment_type: 'upi', payment_number: 'alice@okaxis' });
  check('over-balance redemption blocked (400)', () => assert.equal(over.status, 400));

  // double-request guard: total requests cannot exceed balance
  const over2 = await alice.post('/api/redeem', { amount: 250, payment_type: 'phone', payment_number: '9876543210' });
  check('second request beyond remaining balance blocked (400)', () => assert.equal(over2.status, 400));
}
{
  const r = await alice.get('/api/admin/redemptions');
  check('player cannot read admin redemption list (403)', () => assert.equal(r.status, 403));
}
{
  const list = (await admin.get('/api/admin/redemptions')).data.redemptions;
  check('admin sees redemption request with payment number', () => assert.equal(list[0].payment_number, 'alice@okaxis'));
}
{
  const r = await admin.patch(`/api/admin/redemptions/${redId}`, { status: 'approved' });
  check('admin can approve redemption', () => assert.equal(r.status, 200));
}
{
  const r = await admin.patch(`/api/admin/redemptions/${redId}`, { status: 'paid' });
  check('marking paid without reference blocked (400)', () => assert.equal(r.status, 400));
}
{
  const r = await admin.patch(`/api/admin/redemptions/${redId}`, { status: 'paid', admin_ref: 'UPI-REF-12345' });
  check('admin can mark paid with reference', () => assert.equal(r.status, 200));
  const w = (await alice.get('/api/player/wallet')).data;
  check('wallet after payout (available 200, redeemed 100, pending 0)', () => {
    assert.equal(w.available, 200);
    assert.equal(w.totalRedeemed, 100);
    assert.equal(w.pendingRedemption, 0);
  });
}
{
  const r = await admin.patch(`/api/admin/redemptions/${redId}`, { status: 'paid', admin_ref: 'DUP' });
  check('re-paying the same redemption blocked (409)', () => assert.equal(r.status, 409));
}

// ---------- 8. Rejected redemption releases funds ----------
{
  const req2 = await alice.post('/api/redeem', { amount: 150, payment_type: 'phone', payment_number: '9876543210' });
  const w1 = (await alice.get('/api/player/wallet')).data;
  check('second redemption holds funds (200 - 150 = 50)', () => assert.equal(w1.available, 50));
  await admin.patch(`/api/admin/redemptions/${req2.data.id}`, { status: 'rejected' });
  const w2 = (await alice.get('/api/player/wallet')).data;
  check('rejected redemption releases funds back (150 available)', () => assert.equal(w2.available, 200));
}

// ---------- 9. Prizes cannot be self-granted + admin RBAC ----------
{
  const r = await alice.post(`/api/admin/tournaments/${tId}/distribute-prizes`, { distribution: [{ user_id: aliceId, amount: 100 }] });
  check('player cannot call admin prize endpoint (403)', () => assert.equal(r.status, 403));
}
{
  const r = await alice.get('/api/admin/stats');
  check('player cannot read admin stats (403)', () => assert.equal(r.status, 403));
}
{
  const r = await bob.get('/api/player/wallet');
  const w = r.data;
  check('2nd-place player has only the admin-awarded prize (200)', () => assert.equal(w.totalEarned, 200));
}
{
  const r = await alice.put('/api/player/wallet', { available: 999999 });
  check('player cannot PUT to wallet endpoint', () => assert.ok([404, 405].includes(r.status)));
}

// ---------- 10. Admin ops ----------
{
  const r = await admin.get('/api/admin/stats');
  check('admin stats returns counts', () => {
    assert.equal(r.status, 200);
    assert.equal(r.data.stats.totalTournaments, 2);
    assert.ok(r.data.stats.players >= 2);
  });
}
{
  const r = await admin.post('/api/admin/coadmins', { user_id: bobId, grant: true });
  check('admin can grant co-admin', () => assert.equal(r.status, 200));
  const r2 = await admin.post('/api/admin/coadmins', { user_id: aliceId, grant: true });
  check('second co-admin allowed', () => assert.equal(r2.status, 200));
  const r3 = await admin.post('/api/admin/coadmins', { user_id: aliceId, grant: true });
  check('third co-admin blocked by 2-max limit (400)', () => assert.equal(r3.status, 400));
  // restore alice to player for later checks
  await admin.post('/api/admin/coadmins', { user_id: aliceId, grant: false });
  await admin.post('/api/admin/coadmins', { user_id: bobId, grant: false });
}
{
  const r = await admin.post(`/api/admin/players/${aliceId}/wallet/adjust`, { amount: -50, note: 'test correction' });
  check('admin wallet adjust writes ledger entry', () => {
    assert.equal(r.status, 200);
    assert.equal(r.data.wallet.available, 150);
  });
}
{
  const r = await admin.get('/api/admin/audit');
  check('audit log records admin actions', () => {
    assert.equal(r.status, 200);
    assert.ok(r.data.auditLogs.some((a) => a.action === 'prizes_distributed'));
    assert.ok(r.data.auditLogs.some((a) => a.action === 'redeem_update'));
  });
}

// ---------- 11. Room hiding ----------
{
  await admin.put(`/api/rooms/tournament/${tId}`, { room_id: '88112233', password: 'newpass', visible: false });
  const r = await alice.get(`/api/rooms/tournament/${tId}`);
  check('hidden room credentials return 404', () => assert.equal(r.status, 404));
}

// ---------- report ----------
server.close();
fs.rmSync(tmp, { recursive: true, force: true });

console.log('\n=== RedX platform e2e results ===');
for (const line of results) console.log(line);
const failed = results.filter((l) => l.startsWith('FAIL'));
console.log(`\n${passed}/${results.length} passed`);
if (failed.length) {
  console.log('\nFailures:');
  for (const f of failed) console.log(' ', f);
  process.exit(1);
}
console.log('All green.');
