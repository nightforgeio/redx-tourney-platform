import { mountShell, toast, showError } from '../shell.js';
import { api, session } from '../api.js';
import { applyI18n } from '../i18n.js';
import { skeleton, boardTable, roomTicket, wireCopy, pointsTable, meter } from '../render.js';
import { esc, rupees, dateText, timeText, modeLabel, formatLabel, pill, startCountdown, qs } from '../format.js';

const id = qs('id');
const tourney = document.getElementById('tourney');
const roomEl = document.getElementById('room');
const boardEl = document.getElementById('board');
const matchesEl = document.getElementById('matches');
const pointsEl = document.getElementById('points');

let me = null;
let tournament = null;

mountShell({ page: 'nav.events', title: 'Tournament — RedX Gamerz' }).then(async (shell) => {
  me = shell.user;
  applyI18n();
  wireCopy();
  if (!id) { location.replace('/tournaments.html'); return; }
  await load();
});

async function load() {
  tourney.innerHTML = skeleton(3);
  try {
    const [{ tournament: t }, { points_config }] = await Promise.all([
      api(`/api/tournaments/${encodeURIComponent(id)}`),
      api(`/api/public/tournaments/${encodeURIComponent(id)}/points`).catch(() => ({ points_config: null })),
    ]);
    tournament = t;

    const filled = Number(t.slots_filled ?? 0);
    const max = Number(t.max_slots ?? 0);
    const statusK = `s.${t.status}`;

    tourney.innerHTML = `<div class="panel nextevent">
      <div class="kicker">${esc(modeLabel(t.mode))} · ${esc(formatLabel(t.format))} · ${esc(pill(t.status))}</div>
      <h1>${esc(t.title)}</h1>
      ${t.announcement ? `<p class="muted">${esc(t.announcement)}</p>` : ''}
      ${max ? meter(filled, max) : ''}
      <div class="metarow">
        <div class="stat"><span class="v num">${filled}/${max || '∞'}</span><span class="k" data-t="home.slots"></span></div>
        <div class="stat"><span class="v money num">${esc(rupees(t.prize_pool))}</span><span class="k" data-t="home.prize"></span></div>
        <div class="stat"><span class="v">${esc(dateText(t.event_date))}</span><span class="k" data-t="t.date"></span></div>
        ${t.event_time ? `<div class="stat"><span class="v num">${esc(timeText(t.event_time))}</span><span class="k" data-t="t.time"></span></div>` : ''}
      </div>
      <div class="btnrow" id="actionRow"></div>
    </div>`;
    applyI18n(tourney);
    startCountdown(t.event_date, t.event_time, tourney.querySelector('.num'));

    await renderAction();
    await Promise.all([loadRoom(), loadBoard(), loadMatches(), loadPoints()]);
  } catch (e) { showError(e, tourney); }
}

async function renderAction() {
  const row = document.getElementById('actionRow');
  if (!row) return;
  const canRegister = ['open', 'registration'].includes(tournament.status);
  const full = tournament.max_slots > 0 && Number(tournament.slots_filled) >= Number(tournament.max_slots);

  let statusText = '';
  if (me) {
    const { tournaments } = await api('/api/player/tournaments').catch(() => ({ tournaments: [] }));
    const mine = tournaments.find((x) => Number(x.id) === Number(id));
    if (mine?.my_status === 'approved') statusText = pill('approved');
    else if (mine?.my_status === 'pending') statusText = pill('pending');
    else if (mine?.my_status === 'rejected') statusText = pill('rejected');
  }

  if (me && statusText) {
    row.innerHTML = `<span class="pill ok">${esc(t('t.registered'))}</span> ${statusText}
      <a class="btn primary" href="/tournament.html?id=${encodeURIComponent(id)}">${esc(t('home.goticket'))}</a>`;
  } else if (!canRegister) {
    row.innerHTML = `<span class="pill no">${esc(t('t.closed'))}</span>`;
  } else if (full && statusText !== '<span class="pill ok">Approved</span>') {
    row.innerHTML = `<span class="pill no">${esc(t('t.full'))}</span>`;
  } else if (!me) {
    row.innerHTML = `<a class="btn primary" href="/login.html?next=${encodeURIComponent(`/tournament.html?id=${id}`)}">${esc(t('t.register'))}</a>`;
  } else {
    row.innerHTML = `<button type="button" class="btn primary" id="registerBtn">${esc(t('t.register'))}</button>`;
    document.getElementById('registerBtn').addEventListener('click', register);
  }
}

async function register() {
  const btn = document.getElementById('registerBtn');
  btn.disabled = true;
  try {
    await api(`/api/tournaments/${encodeURIComponent(id)}/register`, { method: 'POST' });
    toast(t('t.pending'), 'ok');
    await renderAction();
  } catch (e) { showError(e); } finally { btn.disabled = false; }
}

async function loadRoom() {
  roomEl.innerHTML = skeleton(2);
  try {
    const isApproved = me && (me.role === 'admin' || me.role === 'coadmin');
    if (!isApproved && me) {
      const { tournaments } = await api('/api/player/tournaments').catch(() => ({ tournaments: [] }));
      const mine = tournaments.find((x) => Number(x.id) === Number(id));
      isApproved = mine?.my_status === 'approved';
    }
    if (!me) {
      roomEl.innerHTML = roomTicket(null, { locked: true, note: t('t.roomneed') });
      applyI18n(roomEl);
      return;
    }
    if (!isApproved) {
      roomEl.innerHTML = roomTicket(null, { locked: true, note: t('t.roomneed') });
      applyI18n(roomEl);
      return;
    }
    const { room } = await api(`/api/rooms/tournament/${encodeURIComponent(id)}`);
    if (!room) {
      roomEl.innerHTML = `<div class="empty">${esc(t('t.roomnone'))}</div>`;
      return;
    }
    roomEl.innerHTML = roomTicket(room);
  } catch (e) {
    if (e.status === 403 || e.status === 404) {
      roomEl.innerHTML = `<div class="empty">${esc(t('t.roomnone'))}</div>`;
    } else { showError(e, roomEl); }
  }
}

async function loadBoard() {
  boardEl.innerHTML = skeleton(3);
  try {
    const { leaderboard } = await api(`/api/results/tournament/${encodeURIComponent(id)}/leaderboard`);
    boardEl.innerHTML = boardTable(leaderboard, ['pts', 'kills', 'matches']);
    applyI18n(boardEl);
  } catch (e) { showError(e, boardEl); }
}

async function loadMatches() {
  matchesEl.innerHTML = skeleton(2);
  try {
    const { matches } = await api(`/api/results/tournament/${encodeURIComponent(id)}`);
    if (!matches.length) {
      matchesEl.innerHTML = `<div class="empty" data-t="t.matchesnone"></div>`;
      applyI18n(matchesEl);
      return;
    }
    matchesEl.innerHTML = `<div class="events">${matches.map((m) => `
      <a class="event" href="/results.html?t=${encodeURIComponent(id)}">
        <div class="mid"><span class="t">${esc(m.name || `Match ${m.match_no}`)}</span><span class="s">M${esc(m.match_no)}</span></div>
        <div class="right">${m.status === 'done' ? pill('done') : pill('pending')}</div>
      </a>`).join('')}</div>`;
    applyI18n(matchesEl);
  } catch (e) { showError(e, matchesEl); }
}

async function loadPoints() {
  pointsEl.innerHTML = skeleton(2);
  try {
    const { mode, points_config } = await api(`/api/public/tournaments/${encodeURIComponent(id)}/points`).catch(() => ({ mode: 'br', points_config: null }));
    pointsEl.innerHTML = pointsTable(mode, points_config);
    applyI18n(pointsEl);
  } catch (e) { showError(e, pointsEl); }
}