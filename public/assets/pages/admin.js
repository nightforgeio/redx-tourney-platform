/* Admin panel — RedX Gamerz tournament platform.
   Tabs: overview, tournaments, registrations, matches/results, redemptions,
   players, audit. Every mutation sits behind the /api/admin and related
   guarded routes; this script only wires the screen. */
import { mountShell, requireUser, toast, showError } from '../shell.js';
import { api } from '../api.js';
import { applyI18n, t } from '../i18n.js';
import { skeleton, wireCopy } from '../render.js';
import { esc, rupees, dateText, pill, modeLabel, formatLabel } from '../format.js';

let user = null;
let tournamentsCache = null;

const TABS = ['overview', 'tournaments', 'registrations', 'matches', 'redemptions', 'players', 'audit'];
const sections = Object.fromEntries(TABS.map((k) => [k, document.getElementById(`tab-${k}`)]));

await mountShell({ page: 'nav.admin', title: 'Admin — RedX Gamerz' });
user = await requireUser('staff');
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

function switchTab(name) {
  TABS.forEach((k) => { sections[k].hidden = k !== name; });
  document.querySelectorAll('.tabs a').forEach((a) => {
    a.toggleAttribute('aria-current', a.dataset.tab === name);
  });
  document.getElementById('adminTitle').textContent = t(`ad.${name}`);
  if (!sections[name].dataset.loaded) {
    sections[name].dataset.loaded = '1';
    ({ overview: loadOverview, tournaments: loadTournaments, registrations: loadRegistrations,
       matches: loadMatches, redemptions: loadRedemptions, players: loadPlayers,
       audit: loadAudit })[name]();
  }
}

async function getTournaments(force = false) {
  if (!tournamentsCache || force) {
    const data = await api('/api/admin/tournaments');
    tournamentsCache = data.tournaments || [];
  }
  return tournamentsCache;
}

async function withSkeleton(el, fn) {
  el.innerHTML = skeleton(4);
  try { await fn(); } catch (e) { showError(e, el); }
}

function statusLabel(s) {
  const k = `s.${s}`;
  const v = t(k);
  return v === k ? String(s ?? '') : v;
}

/* ================= Overview ================= */

async function loadOverview() {
  const el = sections.overview;
  await withSkeleton(el, async () => {
    const [stats, overview] = await Promise.all([api('/api/admin/stats'), api('/api/admin/overview')]);
    const s = stats.stats;
    el.innerHTML = `
      <div class="grid three">
        <div class="panel stat"><span class="v num">${esc(s.players)}</span><span class="k" data-t="ad.s.players"></span></div>
        <div class="panel stat"><span class="v num">${esc(s.totalTournaments)}</span><span class="k" data-t="ad.s.tournaments"></span></div>
        <div class="panel stat"><span class="v num">${esc(s.activeTournaments)}</span><span class="k" data-t="ad.s.active"></span></div>
        <div class="panel stat"><span class="v num">${esc(s.completedTournaments)}</span><span class="k" data-t="ad.s.completed"></span></div>
        <div class="panel stat"><span class="v num">${esc(s.totalRegistrations)}</span><span class="k" data-t="ad.s.regs"></span></div>
        <div class="panel stat"><span class="v num">${esc(s.approvedRegistrations)}</span><span class="k" data-t="ad.s.approved"></span></div>
        <div class="panel stat"><span class="v money num">${esc(rupees(s.totalPrizesDistributed))}</span><span class="k" data-t="ad.s.prizes"></span></div>
        <div class="panel stat"><span class="v num">${esc(s.pendingRedemptions)}</span><span class="k" data-t="ad.s.pendingredemps"></span></div>
        <div class="panel stat"><span class="v credit num">${esc(rupees(s.totalPaidOut))}</span><span class="k" data-t="ad.s.paidout"></span></div>
      </div>
      <div class="section mt2">
        <div class="head"><h2 data-t="ad.recent.redemps"></h2><a class="small" href="#redemptions">→</a></div>
        <div class="ledger">${overview.recentRedemptions.length ? overview.recentRedemptions.map((r) => `
          <div class="led">
            <div class="what"><span class="t">${esc(rupees(r.amount))} · ${esc(r.username)}</span><span class="d">${esc(r.payment_type)} ${esc(r.payment_number)} · ${esc(dateText(r.created_at))}</span></div>
            <div class="amt">${pill(r.status)}</div>
          </div>`).join('') : `<div class="empty" data-t="ad.none"></div>`}</div>
      </div>`;
    applyI18n(el);
  });
}

/* ================= Tournaments ================= */

async function loadTournaments() {
  const el = sections.tournaments;
  await withSkeleton(el, async () => {
    const tournaments = await getTournaments(true);
    el.innerHTML = `
      <div class="panel mb2">
        <h2 class="mt0" data-t="ad.create"></h2>
        <form class="form two mt1" id="createTourneyForm">
          <div class="field full"><label for="ctTitle" data-t="f.title"></label><input id="ctTitle" maxlength="80" required placeholder="Free Fire India Squad BR"></div>
          <div class="field"><label for="ctMode" data-t="f.mode"></label><select id="ctMode"><option value="br">BR</option><option value="cs">CS</option></select></div>
          <div class="field"><label for="ctFormat" data-t="f.format"></label><select id="ctFormat"><option value="solo">Solo</option><option value="duo">Duo</option><option value="squad" selected>Squad</option></select></div>
          <div class="field"><label for="ctSlots" data-t="f.maxslots"></label><input id="ctSlots" type="number" min="0" value="100"></div>
          <div class="field"><label for="ctPool" data-t="f.pool"></label><input id="ctPool" type="number" min="0" step="1" value="0"></div>
          <div class="field"><label for="ctDate" data-t="f.date"></label><input id="ctDate" type="date"></div>
          <div class="field"><label for="ctTime" data-t="f.time"></label><input id="ctTime" type="time"></div>
          <div class="field full"><label for="ctAnn" data-t="f.announce"></label><textarea id="ctAnn" maxlength="2000"></textarea></div>
          <div class="field full"><label for="ctBanner" data-t="f.banner"></label><input id="ctBanner" type="url" placeholder="https://…"></div>
          <div class="full"><button class="btn primary" type="submit" data-t="ad.create.btn"></button></div>
        </form>
      </div>
      <div class="head"><h2 data-t="ad.list.tournaments"></h2></div>
      <div class="events" id="adminTourneyList">${tournaments.map(tourneyCard).join('') || `<div class="empty" data-t="ev.none"></div>`}</div>`;
    applyI18n(el);
    wireTourneyForms(el);
  });
}

function tourneyCard(ev) {
  return `<div class="event" data-tid="${ev.id}" style="align-items:flex-start">
    <div class="when"><span class="d num">${esc(ev.id)}</span><span class="m">${esc(modeLabel(ev.mode))}</span></div>
    <div class="mid">
      <span class="t">${esc(ev.title)}</span>
      <span class="s">${esc(formatLabel(ev.format))} · ${esc(dateText(ev.event_date))} · ${esc(rupees(ev.prize_pool))} · ${esc(ev.max_slots)}</span>
      <div class="mt1" id="tourneyActions${ev.id}"></div>
    </div>
    <div class="right">${pill(ev.status)}</div>
  </div>`;
}

function wireTourneyForms(root) {
  document.getElementById('createTourneyForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await api('/api/tournaments', { method: 'POST', body: {
        title: document.getElementById('ctTitle').value.trim(),
        mode: document.getElementById('ctMode').value,
        format: document.getElementById('ctFormat').value,
        max_slots: Number(document.getElementById('ctSlots').value),
        prize_pool: Number(document.getElementById('ctPool').value),
        event_date: document.getElementById('ctDate').value || '',
        event_time: document.getElementById('ctTime').value || '',
        announcement: document.getElementById('ctAnn').value.trim(),
        banner_url: document.getElementById('ctBanner').value.trim(),
      } });
      toast(t('ad.saved'));
      tournamentsCache = null;
      delete sections.tournaments.dataset.loaded;
      switchTab('tournaments');
    } catch (err) { showError(err); } finally { btn.disabled = false; }
  });

  document.getElementById('adminTourneyList')?.querySelectorAll('.event[data-tid]').forEach((row) => {
    const id = row.dataset.tid;
    const box = document.getElementById(`tourneyActions${id}`);
    box.innerHTML = `<button class="btn small" data-act="open">${esc(t('ad.edit'))}</button>`;
    box.querySelector('[data-act="open"]').addEventListener('click', () => openTourneyEditor(id, box, row));
  });
}

async function openTourneyEditor(id, box, row) {
  const [all, regs] = await Promise.all([
    api('/api/admin/tournaments'),
    api(`/api/registrations/tournament/${id}`).catch(() => ({ registrations: [] })),
  ]);
  const t = all.tournaments.find((x) => String(x.id) === String(id));
  if (!t) return;
  const approved = (regs.registrations || []).filter((r) => r.status === 'approved');

  box.innerHTML = `
    <div class="panel" style="margin-top:8px;max-width:720px">
      <div class="kv">
        <dt data-t="t.status"></dt><dd>${pill(t.status)}</dd>
        <dt data-t="t.prize"></dt><dd class="money">${esc(rupees(t.prize_pool))}</dd>
        <dt data-t="t.slots"></dt><dd>${esc(approved.length)}/${esc(t.max_slots)}</dd>
      </div>

      <div class="grid two mt2">
        <div class="panel" style="margin:0">
          <h3 class="mt0" data-t="ad.status.set"></h3>
          <div class="btnrow">
            ${['draft','open','registration','ongoing','completed','cancelled'].map((s) =>
              `<button type="button" class="btn small ${s === t.status ? 'primary' : 'ghost'}" data-newstatus="${s}">${esc(statusLabel(s))}</button>`).join('')}
          </div>
          <p class="tiny muted mt1 mb0" data-t="ad.status.hint"></p>
        </div>

        <div class="panel" style="margin:0">
          <h3 class="mt0" data-t="ad.room.title"></h3>
          <form class="form" id="roomForm${id}">
            <div class="field"><label for="roomId${id}" data-t="t.roomid"></label><input id="roomId${id}" maxlength="50" required placeholder="123456789"></div>
            <div class="field"><label for="roomPw${id}" data-t="t.roompw"></label><input id="roomPw${id}" maxlength="50" required placeholder="••••••"></div>
            <label class="tiny" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="roomVis${id}" style="width:auto;min-height:auto" checked> <span data-t="ad.room.visible"></span></label>
            <button class="btn small primary" type="submit" data-t="ad.save.room"></button>
          </form>
        </div>
      </div>

      <div class="panel mt2" style="margin-top:14px">
        <h3 class="mt0" data-t="ad.announce.set"></h3>
        <form class="form" id="annForm${id}">
          <textarea id="annText${id}" maxlength="2000">${esc(t.announcement || '')}</textarea>
          <button class="btn small" type="submit" data-t="ad.save.announce"></button>
        </form>
      </div>

      <div class="panel mt2" style="margin-top:14px">
        <h3 class="mt0" data-t="ad.distribute"></h3>
        ${t.status !== 'completed'
          ? `<p class="small muted mb0" data-t="ad.distribute.closed"></p>`
          : Number(t.prize_pool) <= 0
            ? `<p class="small muted mb0" data-t="ad.distribute.nopool"></p>`
            : `<form class="form" id="distForm${id}">
                <div class="ledger" id="distRows${id}">
                  ${approved.length ? approved.map((p) => `
                    <div class="led">
                      <div class="what"><span class="t">${esc(p.username)}</span><span class="d">${esc(p.ff_ign || '')}</span></div>
                      <div class="amt"><input type="number" min="1" step="1" data-uid="${p.user_id}" placeholder="₹" style="width:110px;min-height:36px;text-align:right"></div>
                    </div>`).join('') : `<div class="empty" data-t="ad.none.approved"></div>`}
                </div>
                <p class="tiny muted mb0" data-t="ad.distribute.hint"></p>
                <button class="btn small primary" type="submit" data-t="ad.distribute.btn"></button>
              </form>`}
      </div>
    </div>`;

  applyI18n(box);

  box.querySelectorAll('[data-newstatus]').forEach((b) => {
    b.addEventListener('click', () => setStatus(id, b.dataset.newstatus));
  });

  box.querySelector(`#roomForm${id}`).addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await api(`/api/rooms/tournament/${id}`, { method: 'PUT', body: {
        room_id: document.getElementById(`roomId${id}`).value.trim(),
        password: document.getElementById(`roomPw${id}`).value.trim(),
        visible: document.getElementById(`roomVis${id}`).checked,
      } });
      toast(t('ad.saved'));
    } catch (err) { showError(err); } finally { btn.disabled = false; }
  });

  box.querySelector(`#annForm${id}`).addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await api(`/api/admin/tournaments/${id}`, { method: 'PATCH', body: { announcement: document.getElementById(`annText${id}`).value.trim() } });
      toast(t('ad.saved'));
    } catch (err) { showError(err); } finally { btn.disabled = false; }
  });

  box.querySelector(`#distForm${id}`)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('[type="submit"]');
    const rows = [...document.querySelectorAll(`#distRows${id} input[data-uid]`)]
      .map((i) => ({ user_id: Number(i.dataset.uid), amount: Number(i.value) }))
      .filter((r) => r.amount > 0);
    if (!rows.length) { showError({ message: t('err.amount') }); return; }
    btn.disabled = true;
    try {
      await api(`/api/admin/tournaments/${id}/distribute-prizes`, { method: 'POST', body: { distribution: rows } });
      toast(t('ad.distributed.ok'));
      tournamentsCache = null;
      delete sections.tournaments.dataset.loaded;
      switchTab('tournaments');
    } catch (err) { showError(err); } finally { btn.disabled = false; }
  });
}

async function setStatus(id, status) {
  const msg = t('ad.confirm.status').replace('{status}', statusLabel(status));
  if (!window.confirm(msg)) return;
  try {
    await api(`/api/admin/tournaments/${id}`, { method: 'PATCH', body: { status } });
    toast(t('ad.saved'));
    tournamentsCache = null;
    delete sections.tournaments.dataset.loaded;
    switchTab('tournaments');
  } catch (err) { showError(err); }
}

/* ================= Registrations ================= */

async function loadRegistrations() {
  const el = sections.registrations;
  await withSkeleton(el, async () => {
    const tournaments = await getTournaments();
    el.innerHTML = `
      <div class="panel mb2">
        <div class="field"><label for="regTourney" data-t="ad.select.tourney"></label>
          <select id="regTourney">${tournaments.map((x) => `<option value="${x.id}">#${x.id} — ${esc(x.title)} (${esc(modeLabel(x.mode))})</option>`).join('')}</select>
        </div>
      </div>
      <div id="regList"></div>`;
    applyI18n(el);
    document.getElementById('regTourney').addEventListener('change', (e) => loadRegList(e.target.value));
    if (tournaments.length) loadRegList(tournaments[0].id);
  });
}

async function loadRegList(tid) {
  const el = document.getElementById('regList');
  el.innerHTML = skeleton(4);
  try {
    const { registrations } = await api(`/api/registrations/tournament/${tid}`);
    if (!registrations.length) { el.innerHTML = `<div class="empty" data-t="ad.none.regs"></div>`; applyI18n(el); return; }
    el.innerHTML = `<div class="tablewrap"><table class="board">
      <thead><tr><th data-t="t.player"></th><th data-t="f.email"></th><th class="r" data-t="f.phone"></th><th data-t="ad.ff"></th><th data-t="t.status"></th><th></th></tr></thead>
      <tbody>${registrations.map((r) => `<tr>
        <td><span class="who">${esc(r.username)}</span><span class="ign">${esc(r.ff_ign || '')}</span></td>
        <td class="muted">${esc(r.email)}</td>
        <td class="r muted">${esc(r.phone || '—')}</td>
        <td class="muted mono-id">${esc(r.ff_uid || '—')}</td>
        <td>${pill(r.status)}</td>
        <td class="r">${r.status === 'pending' ? `
          <div class="btnrow" style="justify-content:flex-end">
            <button class="btn small ok" data-regact="approved" data-regid="${r.id}">${esc(t('ad.approve'))}</button>
            <button class="btn small danger" data-regact="rejected" data-regid="${r.id}">${esc(t('ad.reject'))}</button>
          </div>` : ''}</td>
      </tr>`).join('')}</tbody></table></div>`;
    applyI18n(el);
    el.querySelectorAll('[data-regact]').forEach((b) => {
      b.addEventListener('click', async () => {
        try {
          await api(`/api/registrations/${b.dataset.regid}`, { method: 'PATCH', body: { status: b.dataset.regact } });
          toast(t('ad.saved'));
          loadRegList(tid);
        } catch (err) { showError(err); }
      });
    });
  } catch (e) { showError(e, el); }
}

/* ================= Matches / Results ================= */

async function loadMatches() {
  const el = sections.matches;
  await withSkeleton(el, async () => {
    const tournaments = await getTournaments();
    el.innerHTML = `
      <div class="panel mb2">
        <div class="field"><label for="matchTourney" data-t="ad.select.tourney"></label>
          <select id="matchTourney">${tournaments.map((x) => `<option value="${x.id}">#${x.id} — ${esc(x.title)}</option>`).join('')}</select>
        </div>
        <div class="panel mt2" style="margin-bottom:0">
          <h3 class="mt0" data-t="ad.match.create"></h3>
          <form class="form two" id="createMatchForm">
            <div class="field"><label for="matchNo" data-t="f.match.no"></label><input id="matchNo" type="number" min="1" required></div>
            <div class="field"><label for="matchName" data-t="f.match"></label><input id="matchName" placeholder="Match 1" maxlength="80"></div>
            <div class="full"><button class="btn small primary" type="submit" data-t="ad.match.add"></button></div>
          </form>
        </div>
      </div>
      <div id="matchList"></div>`;
    applyI18n(el);
    const sel = document.getElementById('matchTourney');
    sel.addEventListener('change', () => loadMatchList(sel.value));
    document.getElementById('createMatchForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('[type="submit"]');
      btn.disabled = true;
      try {
        const no = Number(document.getElementById('matchNo').value);
        await api(`/api/admin/tournaments/${sel.value}/matches`, { method: 'POST', body: {
          match_no: no,
          name: document.getElementById('matchName').value.trim() || `Match ${no}`,
        } });
        toast(t('ad.saved'));
        loadMatchList(sel.value);
      } catch (err) { showError(err); } finally { btn.disabled = false; }
    });
    if (tournaments.length) loadMatchList(tournaments[0].id);
  });
}

async function loadMatchList(tid) {
  const el = document.getElementById('matchList');
  el.innerHTML = skeleton(3);
  try {
    const [{ matches }, regs] = await Promise.all([
      api(`/api/admin/tournaments/${tid}/matches`),
      api(`/api/registrations/tournament/${tid}`).catch(() => ({ registrations: [] })),
    ]);
    const approved = (regs.registrations || []).filter((r) => r.status === 'approved');
    if (!matches.length) { el.innerHTML = `<div class="empty" data-t="t.matchesnone"></div>`; applyI18n(el); return; }
    el.innerHTML = `<div class="events">${matches.map((m) => `
      <div class="panel" style="margin:0">
        <div class="head" style="margin-bottom:8px">
          <div><span class="strong mono-id">M${esc(m.match_no)}</span> <span class="muted">${esc(m.name || '')}</span></div>
          ${pill(m.status)}
        </div>
        <button class="btn small" data-openresults="${m.id}" data-mno="${m.match_no}">${esc(t('ad.match.enter'))}</button>
        <div id="resultsBox${m.id}"></div>
      </div>`).join('')}</div>`;
    applyI18n(el);
    el.querySelectorAll('[data-openresults]').forEach((b) => {
      b.addEventListener('click', () => openResultsEditor(b.dataset.openresults, b.dataset.mno, tid, approved, b));
    });
  } catch (e) { showError(e, el); }
}

function openResultsEditor(matchId, matchNo, tid, approved, btn) {
  const box = document.getElementById(`resultsBox${matchId}`);
  if (box.dataset.open) { box.dataset.open = ''; box.innerHTML = ''; return; }
  box.dataset.open = '1';
  box.innerHTML = `
    <form class="form mt1" id="resultsForm${matchId}">
      <div class="ledger" id="resRows${matchId}"></div>
      <div class="btnrow">
        <button type="button" class="btn small ghost" data-addrow="${matchId}">+ ${esc(t('ad.row.add'))}</button>
        <button type="submit" class="btn small primary" data-t="ad.match.submit"></button>
      </div>
    </form>`;
  applyI18n(box);
  const addRow = () => {
    const host = document.getElementById(`resRows${matchId}`);
    const row = document.createElement('div');
    row.className = 'led';
    row.style.flexWrap = 'wrap';
    row.innerHTML = `
      <div class="what" style="flex:1;min-width:140px">
        <select data-uid style="min-height:36px">${approved.length ? approved.map((p) => `<option value="${p.user_id}">${esc(p.username)}${p.ff_ign ? ` (${esc(p.ff_ign)})` : ''}</option>`).join('') : ''}</select>
      </div>
      <div style="display:flex;gap:8px">
        <input type="number" data-place min="1" placeholder="${esc(t('t.placement'))}" style="width:92px;min-height:36px">
        <input type="number" data-kills min="0" max="999" value="0" placeholder="${esc(t('home.kills'))}" style="width:84px;min-height:36px">
      </div>`;
    if (!approved.length) { row.innerHTML = `<div class="empty" style="padding:10px" data-t="ad.none.approved"></div>`; applyI18n(row); }
    host.appendChild(row);
  };
  addRow();
  box.querySelector(`[data-addrow="${matchId}"]`).addEventListener('click', addRow);
  box.querySelector(`#resultsForm${matchId}`).addEventListener('submit', async (e) => {
    e.preventDefault();
    const rows = [...box.querySelectorAll('#resRows' + matchId + ' [data-uid]')].map((s) => {
      const row = s.closest('.led');
      return {
        user_id: Number(s.value),
        placement: Number(row.querySelector('[data-place]').value) || null,
        kills: Number(row.querySelector('[data-kills]').value) || 0,
      };
    }).filter((r) => r.user_id);
    if (!rows.length) { showError({ message: t('err.required') }); return; }
    const btn2 = e.target.querySelector('[type="submit"]');
    btn2.disabled = true;
    try {
      await api(`/api/admin/matches/${matchId}/results`, { method: 'PUT', body: { rows } });
      toast(t('ad.saved'));
      box.dataset.open = '';
      box.innerHTML = '';
      loadMatchList(tid);
    } catch (err) { showError(err); } finally { btn2.disabled = false; }
  });
}

/* ================= Redemptions ================= */

async function loadRedemptions() {
  const el = sections.redemptions;
  await withSkeleton(el, async () => {
    const { redemptions } = await api('/api/admin/redemptions');
    const pending = redemptions.filter((r) => r.status === 'pending');
    if (!redemptions.length) { el.innerHTML = `<div class="empty" data-t="ad.none.redemps"></div>`; applyI18n(el); return; }
    el.innerHTML = `
      ${pending.length ? `<div class="alert info mb2"><strong>${esc(pending.length)}</strong> <span data-t="ad.pending.redemps"></span></div>` : ''}
      <div class="tablewrap"><table class="board">
        <thead><tr><th data-t="t.player"></th><th class="r" data-t="w.balance"></th><th data-t="ad.payto"></th><th data-t="t.status"></th><th data-t="ad.ref"></th><th></th></tr></thead>
        <tbody>${redemptions.map((r) => `<tr>
          <td><span class="who">${esc(r.username)}</span><span class="ign">${esc(r.email)}</span></td>
          <td class="r money">${esc(rupees(r.amount))}</td>
          <td class="muted">${esc(r.payment_type)} · ${esc(r.payment_number)}</td>
          <td>${pill(r.status)}</td>
          <td class="muted mono-id">${esc(r.admin_ref || '—')}</td>
          <td class="r">
            ${r.status === 'pending' ? `<div class="btnrow" style="justify-content:flex-end">
                <button class="btn small" data-redact="approved" data-redid="${r.id}">${esc(t('ad.approve'))}</button>
                <button class="btn small danger" data-redact="rejected" data-redid="${r.id}">${esc(t('ad.reject'))}</button>
              </div>` : ''}
            ${r.status === 'approved' ? `<button class="btn small primary" data-redact="paid" data-redid="${r.id}">${esc(t('ad.markpaid'))}</button>` : ''}
          </td>
        </tr>`).join('')}</tbody></table></div>`;
    applyI18n(el);
    el.querySelectorAll('[data-redact]').forEach((b) => {
      b.addEventListener('click', async () => {
        const act = b.dataset.redact;
        let body = { status: act };
        if (act === 'paid') {
          const ref = window.prompt(t('ad.ref.prompt'), `UPI-${b.dataset.redid}`);
          if (!ref) return;
          body.admin_ref = ref.trim();
        }
        try {
          await api(`/api/admin/redemptions/${b.dataset.redid}`, { method: 'PATCH', body });
          toast(t('ad.saved'));
          delete sections.redemptions.dataset.loaded;
          switchTab('redemptions');
        } catch (err) { showError(err); }
      });
    });
  });
}

/* ================= Players ================= */

async function loadPlayers() {
  const el = sections.players;
  await withSkeleton(el, async () => {
    const { players } = await api('/api/admin/players');
    if (!players.length) { el.innerHTML = `<div class="empty" data-t="ad.none.players"></div>`; applyI18n(el); return; }
    el.innerHTML = `
      <div class="tablewrap"><table class="board">
        <thead><tr><th data-t="t.player"></th><th data-t="f.email"></th><th class="r" data-t="f.phone"></th><th data-t="ad.ff"></th><th data-t="t.status"></th><th></th></tr></thead>
        <tbody>${players.map((p) => `<tr>
          <td><span class="who">${esc(p.username)}</span></td>
          <td class="muted">${esc(p.email)}</td>
          <td class="r muted">${esc(p.phone || '—')}</td>
          <td class="muted mono-id">${esc(p.ff_uid || '—')} ${p.ff_ign ? `· ${esc(p.ff_ign)}` : ''}</td>
          <td>${pill(p.role)}</td>
          <td class="r">
            <button class="btn small" data-wallet="${p.id}">${esc(t('ad.wallet'))}</button>
            ${user.role === 'admin' && p.role !== 'admin' ? `
              <button class="btn small ${p.role === 'coadmin' ? 'danger' : 'ghost'}" data-coadmin="${p.id}" data-grant="${p.role === 'coadmin' ? 'false' : 'true'}">
                ${p.role === 'coadmin' ? esc(t('ad.revoke')) : esc(t('ad.grant'))}
              </button>` : ''}
          </td>
        </tr>`).join('')}</tbody></table></div>`;
    applyI18n(el);

    el.querySelectorAll('[data-wallet]').forEach((b) => {
      b.addEventListener('click', async () => {
        const pid = b.dataset.wallet;
        let data;
        try { data = await api(`/api/admin/players/${pid}/wallet`); } catch (err) { showError(err); return; }
        const w = data.wallet;
        const ref = window.prompt(`${t('ad.wallet.adjust')}\n${t('ad.wallet.balance')}: ₹${w.available}`, '0');
        if (ref === null) return;
        const amount = Number(ref);
        if (!amount || !Number.isInteger(amount)) { showError({ message: t('err.amount') }); return; }
        try {
          await api(`/api/admin/players/${pid}/wallet/adjust`, { method: 'POST', body: { amount, note: t('ad.wallet.manual') } });
          toast(t('ad.saved'));
        } catch (err) { showError(err); }
      });
    });

    el.querySelectorAll('[data-coadmin]').forEach((b) => {
      b.addEventListener('click', async () => {
        const grant = b.dataset.grant === 'true';
        if (!window.confirm(grant ? t('ad.confirm.grant') : t('ad.confirm.revoke'))) return;
        try {
          await api('/api/admin/coadmins', { method: 'POST', body: { user_id: Number(b.dataset.coadmin), grant } });
          toast(t('ad.saved'));
          delete sections.players.dataset.loaded;
          switchTab('players');
        } catch (err) { showError(err); }
      });
    });
  });
}

/* ================= Audit ================= */

async function loadAudit() {
  const el = sections.audit;
  await withSkeleton(el, async () => {
    const { auditLogs } = await api('/api/admin/audit');
    if (!auditLogs.length) { el.innerHTML = `<div class="empty" data-t="ad.none.audit"></div>`; applyI18n(el); return; }
    el.innerHTML = `<div class="tablewrap"><table class="board">
      <thead><tr><th data-t="ad.audit.time"></th><th data-t="ad.audit.admin"></th><th data-t="ad.audit.action"></th><th data-t="ad.audit.target"></th><th data-t="ad.audit.details"></th></tr></thead>
      <tbody>${auditLogs.map((a) => `<tr>
        <td class="muted nowrap">${esc(dateText(a.created_at))}</td>
        <td class="muted">${esc(a.admin_id ?? '—')}</td>
        <td><span class="pill">${esc(a.action)}</span></td>
        <td class="muted mono-id">${esc(a.target || '—')}</td>
        <td class="muted small">${esc(a.details || '')}</td>
      </tr>`).join('')}</tbody></table></div>`;
    applyI18n(el);
  });
}