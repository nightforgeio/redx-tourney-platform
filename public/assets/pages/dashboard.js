import { mountShell, requireUser, toast, showError } from '../shell.js';
import { api, forgetSession } from '../api.js';
import { applyI18n, t, getLang } from '../i18n.js';
import { skeleton, eventRow, boardTable, wireCopy } from '../render.js';
import { esc, rupees, dateText, timeText, pill } from '../format.js';

let user = null;

const TABS = ['overview', 'profile', 'tournaments', 'results', 'wallet'];
const sections = Object.fromEntries(TABS.map((k) => [k, document.getElementById(`tab-${k}`)]));

await mountShell({ page: 'nav.dashboard', title: 'My account — RedX Gamerz' });
user = await requireUser();
applyI18n();
wireCopy();

const hash = location.hash.replace('#', '');
switchTab(TABS.includes(hash) ? hash : 'overview');

document.querySelectorAll('.tabs a').forEach((a) => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab(a.dataset.tab);
    location.hash = a.dataset.tab;
  });
});

async function switchTab(name) {
  TABS.forEach((k) => { sections[k].hidden = k !== name; });
  document.querySelectorAll('.tabs a').forEach((a) => {
    a.toggleAttribute('aria-current', a.dataset.tab === name);
  });
  document.getElementById('dashTitle').textContent = t(`a.${name === 'wallet' ? 'wallet' : name === 'tournaments' ? 'mytourneys' : name === 'results' ? 'myresults' : name === 'profile' ? 'profile' : 'overview'}`);

  if (name === 'overview' && !sections.overview.dataset.loaded) { sections.overview.dataset.loaded = '1'; loadOverview(); }
  if (name === 'profile' && !sections.profile.dataset.loaded) { sections.profile.dataset.loaded = '1'; loadProfile(); }
  if (name === 'tournaments' && !sections.tournaments.dataset.loaded) { sections.tournaments.dataset.loaded = '1'; loadMyTournaments(); }
  if (name === 'results' && !sections.results.dataset.loaded) { sections.results.dataset.loaded = '1'; loadMyResults(); }
  if (name === 'wallet' && !sections.wallet.dataset.loaded) { sections.wallet.dataset.loaded = '1'; loadWallet(); }
}

async function loadOverview() {
  const el = sections.overview;
  el.innerHTML = skeleton(5);
  try {
    const [prof, tournaments, wallet] = await Promise.all([
      api('/api/auth/me'),
      api('/api/player/tournaments'),
      api('/api/player/wallet'),
    ]);
    const approved = tournaments.tournaments.filter((x) => x.my_status === 'approved');
    el.innerHTML = `
      <div class="grid three">
        <div class="panel stat"><span class="v num">${esc(rupees(wallet.available))}</span><span class="k" data-t="w.balance"></span></div>
        <div class="panel stat"><span class="v num">${approved.length}</span><span class="k" data-t="a.mytourneys"></span></div>
        <div class="panel stat"><span class="v num">${esc(rupees(wallet.totalEarned))}</span><span class="k" data-t="w.earned"></span></div>
      </div>
      <div class="section">
        <div class="head"><h2 data-t="a.mytourneys"></h2><a class="small" href="#tournaments">→</a></div>
        <div class="events">${approved.length ? approved.map(eventRow).join('') : `<div class="empty" data-t="ev.none"></div>`}</div>
      </div>`;
    applyI18n(el);
  } catch (e) { showError(e, el); }
}

async function loadProfile() {
  const el = sections.profile;
  el.innerHTML = skeleton(4);
  try {
    const { user: u } = await api('/api/auth/me');
    el.innerHTML = `<div class="panel" style="max-width:560px">
      <h2 class="mt0" data-t="a.profile"></h2>
      <form class="form mt2" id="profileForm">
        <div class="field"><label for="pfUsername" data-t="f.username"></label><input id="pfUsername" value="${esc(u.username)}" maxlength="24"></div>
        <div class="field"><label data-t="f.email"></label><input value="${esc(u.email)}" disabled></div>
        <div class="field"><label for="pfPhone" data-t="f.phone"></label><input id="pfPhone" type="tel" value="${esc(u.phone || '')}"></div>
        <div class="field"><label for="pfUid" data-t="f.uid"></label><input id="pfUid" value="${esc(u.ff_uid || '')}" maxlength="20"></div>
        <div class="field"><label for="pfIgn" data-t="f.ign"></label><input id="pfIgn" value="${esc(u.ff_ign || '')}" maxlength="30"></div>
        <button class="btn primary" type="submit" data-t="a.save"></button>
      </form>
    </div>`;
    applyI18n(el);
    document.getElementById('profileForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('[type="submit"]');
      btn.disabled = true;
      try {
        await api('/api/player/profile', { method: 'PUT', body: {
          username: document.getElementById('pfUsername').value.trim(),
          phone: document.getElementById('pfPhone').value.trim(),
          ff_uid: document.getElementById('pfUid').value.trim(),
          ff_ign: document.getElementById('pfIgn').value.trim(),
        } });
        toast(t('a.saved'));
      } catch (err) { showError(err); } finally { btn.disabled = false; }
    });
  } catch (e) { showError(e, el); }
}

async function loadMyTournaments() {
  const el = sections.tournaments;
  el.innerHTML = skeleton(4);
  try {
    const { tournaments } = await api('/api/player/tournaments');
    const withStatus = tournaments.map((x) => `<div class="event">
      <div class="mid"><a class="t" href="/tournament.html?id=${x.id}">${esc(x.title)}</a><span class="s">${esc(modeLabel(x.mode))} · ${esc(formatLabel(x.format))}</span></div>
      <div class="right">${x.my_status ? pill(x.my_status) : pill('none')}</div>
    </div>`);
    el.innerHTML = `<div class="events">${withStatus.length ? withStatus.join('') : `<div class="empty" data-t="ev.none"></div>`}</div>`;
    applyI18n(el);
  } catch (e) { showError(e, el); }
}

async function loadMyResults() {
  const el = sections.results;
  el.innerHTML = skeleton(4);
  try {
    const { results } = await api('/api/player/results');
    if (!results.length) { el.innerHTML = `<div class="empty" data-t="t.boardnone"></div>`; applyI18n(el); return; }
    const rows = results.map((r) => `<tr>
      <td><a class="who" href="/results.html?t=${r.tournament_id}">${esc(r.title)}</a><span class="ign">${esc(r.name || `Match ${r.match_no}`)}</span></td>
      <td class="r">${esc(r.placement ?? '—')}</td>
      <td class="r">${esc(r.kills ?? 0)}</td>
      <td class="r muted">${esc(r.placement_points ?? 0)}</td>
      <td class="r muted">${esc(r.kill_points ?? 0)}</td>
      <td class="r pts">${esc(r.total_points ?? 0)}</td>
    </tr>`).join('');
    el.innerHTML = `<div class="tablewrap"><table class="board">
      <thead><tr><th data-t="t.player"></th><th class="r" data-t="t.placement"></th><th class="r" data-t="home.kills"></th><th class="r" data-t="t.placement.pts"></th><th class="r" data-t="t.killpt"></th><th class="r" data-t="t.pts"></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
    applyI18n(el);
  } catch (e) { showError(e, el); }
}

async function loadWallet() {
  const el = sections.wallet;
  el.innerHTML = skeleton(5);
  try {
    const [wallet, redemptions] = await Promise.all([api('/api/player/wallet'), api('/api/player/redemptions')]);
    const txs = wallet.transactions || [];
    const led = txs.map((tx) => {
      const kind = tx.type === 'prize_credit' || tx.type === 'admin_adjust' ? 'credit' : 'debit';
      const amt = kind === 'credit' ? `+${rupees(tx.amount)}` : `−${rupees(tx.amount)}`;
      return `<div class="led"><div class="what"><span class="t">${esc(txLabel(tx.type))}</span><span class="d">${esc(tx.ref || '')} · ${esc(tx.created_at || '')}</span></div>
        <div class="amt ${kind}">${esc(amt)}</div></div>`;
    }).join('') || `<div class="empty" data-t="w.ledgernone"></div>`;

    const reqs = redemptions.redemptions.map((r) => `<div class="led">
      <div class="what"><span class="t">${esc(rupees(r.amount))} · ${esc(r.payment_number)}</span><span class="d">${esc(r.created_at || '')} ${r.admin_ref ? `· ref: ${esc(r.admin_ref)}` : ''}</span></div>
      <div class="amt">${pill(r.status)}</div>
    </div>`).join('') || `<div class="empty" data-t="w.nonereq"></div>`;

    el.innerHTML = `
      <div class="grid three">
        <div class="panel stat"><span class="v money num">${esc(rupees(wallet.available))}</span><span class="k" data-t="w.balance"></span></div>
        <div class="panel stat"><span class="v credit num">${esc(rupees(wallet.totalEarned))}</span><span class="k" data-t="w.earned"></span></div>
        <div class="panel stat"><span class="v num">${esc(rupees(wallet.pendingRedemption))}</span><span class="k" data-t="w.pending"></span></div>
      </div>

      <div class="grid split mt2">
        <div class="panel">
          <h2 class="mt0" data-t="w.redeem.title"></h2>
          <p class="small muted" data-t="w.redeem.body"></p>
          <form class="form mt2" id="redeemForm">
            <div class="field">
              <label for="reAmount" data-t="f.amount"></label>
              <input id="reAmount" type="number" min="1" max="${wallet.available}" step="1" placeholder="500" required>
            </div>
            <div class="field">
              <label for="reType" data-t="f.type"></label>
              <select id="reType">
                <option value="upi">UPI</option>
                <option value="phone">Phone</option>
              </select>
            </div>
            <div class="field">
              <label for="reNumber" data-t="f.number"></label>
              <input id="reNumber" placeholder="example@upi" required>
            </div>
            <p class="tiny muted mb0" data-t="w.agreeterms"></p>
            <button class="btn primary" type="submit" data-t="w.redeem.ask"></button>
          </form>
        </div>
        <div>
          <h3 data-t="w.requests"></h3>
          <div class="ledger mt1">${reqs}</div>
        </div>
      </div>

      <div class="section mt2">
        <div class="head"><h2 data-t="w.ledger"></h2></div>
        <div class="ledger">${led}</div>
      </div>`;
    applyI18n(el);

    document.getElementById('redeemForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = Number(document.getElementById('reAmount').value);
      if (!amount || amount < 1) { showError({ message: 'err.amount' }); return; }
      if (amount > wallet.available) { showError({ message: t('err.amount') }); return; }
      const btn = e.target.querySelector('[type="submit"]');
      btn.disabled = true;
      try {
        await api('/api/redeem', { method: 'POST', body: {
          amount,
          payment_type: document.getElementById('reType').value,
          payment_number: document.getElementById('reNumber').value.trim(),
        } });
        toast(t('w.redeem.ask'), 'ok');
        delete sections.wallet.dataset.loaded;
        switchTab('wallet');
      } catch (err) { showError(err); } finally { btn.disabled = false; }
    });
  } catch (e) { showError(e, el); }
}

function txLabel(type) {
  return ({ prize_credit: 'Prize credit', admin_adjust: 'Admin adjustment', redeem_hold: 'Withdrawal hold', redeem_release: 'Hold released', redeem_paid: 'Paid out', redeem_rejected: 'Hold returned', })[type] || type;
}

function modeLabel(m) { return m === 'br' ? 'BR' : 'CS'; }
function formatLabel(f) { return ({ solo: 'Solo', duo: 'Duo', squad: 'Squad' })[f] || f; }