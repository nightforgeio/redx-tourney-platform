import { mountShell, toast, showError } from '../shell.js';
import { api } from '../api.js';
import { applyI18n } from '../i18n.js';
import { eventRow, boardTable, skeleton, wireCopy, meter } from '../render.js';
import { esc, rupees, dateText, timeText, modeLabel, formatLabel, pill, countdownText, startCountdown, qs } from '../format.js';

mountShell({ page: 'nav.home', title: 'RedX Gamerz — Free Fire tournaments' }).then(() => {
  applyI18n();
  wireCopy();
  load();
});

const next = document.getElementById('next');
const up = document.getElementById('upcoming');
const board = document.getElementById('board');
const last = document.getElementById('lastresult');
const stats = document.getElementById('stats');

async function load() {
  await Promise.all([loadNext(), loadUpcoming(), loadBoard(), loadLast(), loadStats()]);
}

async function loadNext() {
  next.innerHTML = skeleton(2);
  try {
    const { tournaments } = await api('/api/public/upcoming');
    const live = tournaments.find((t) => t.status === 'ongoing') || tournaments[0];
    if (!live) {
      next.innerHTML = `<div class="panel nextevent">
        <div class="kicker">${esc(t('home.next'))}</div>
        <h1 data-t="home.nolive"></h1>
        <p class="muted" data-t="home.nolive.body"></p>
        <div class="btnrow mt2"><a class="btn primary" href="/tournaments.html" data-t="nav.events"></a></div>
      </div>`;
      applyI18n(next);
      return;
    }
    const filled = Number(live.slots_filled ?? 0);
    const max = Number(live.max_slots ?? 0);
    next.innerHTML = `<div class="panel nextevent">
      <div class="kicker"><span class="dot live"></span>${esc(t('home.next'))} · <span class="num">${esc(countdownText(live.event_date, live.event_time))}</span></div>
      <h1>${esc(live.title)}</h1>
      <div class="muted">${esc(modeLabel(live.mode))} · ${esc(formatLabel(live.format))} · ${esc(dateText(live.event_date))} ${live.event_time ? `· ${esc(timeText(live.event_time))}` : ''}</div>
      ${max ? meter(filled, max) : ''}
      <div class="metarow">
        <div class="stat"><span class="v num">${filled}/${max || '∞'}</span><span class="k" data-t="home.slots"></span></div>
        <div class="stat"><span class="v money num">${esc(rupees(live.prize_pool))}</span><span class="k" data-t="home.prize"></span></div>
        <div class="stat"><span class="v">${esc(t('home.free'))}</span><span class="k" data-t="home.entry"></span></div>
      </div>
      <div class="btnrow">
        <a class="btn primary" href="/tournament.html?id=${encodeURIComponent(live.id)}" data-t="home.register"></a>
      </div>
    </div>`;
    applyI18n(next);
    startCountdown(live.event_date, live.event_time, next.querySelector('.num'));
  } catch (e) {
    showError(e, next);
  }
}

async function loadUpcoming() {
  up.innerHTML = skeleton(3);
  try {
    const { tournaments } = await api('/api/public/upcoming');
    up.innerHTML = tournaments.length ? tournaments.map(eventRow).join('') : `<div class="empty" data-t="ev.none"></div>`;
    applyI18n(up);
  } catch (e) { showError(e, up); }
}

/* Home board: most recent finished event, if any. */
async function loadBoard() {
  board.innerHTML = skeleton(4);
  try {
    const { events } = await api('/api/public/recent-results');
    const latest = events[0];
    if (!latest || !latest.podium.length) {
      board.innerHTML = `<div class="empty" data-t="home.board.none"></div>`;
      applyI18n(board);
      return;
    }
    board.innerHTML = `<div class="head"><a class="small" href="/leaderboard.html?t=${encodeURIComponent(latest.id)}">${esc(t('t.board'))}</a></div>` +
      boardTable(latest.podium, ['pts', 'kills', 'matches']);
    applyI18n(board);
  } catch (e) { showError(e, board); }
}

async function loadLast() {
  last.innerHTML = skeleton(3);
  try {
    const { events } = await api('/api/public/recent-results');
    const ev = events[0];
    if (!ev) {
      last.innerHTML = `<div class="empty" data-t="home.results.none"></div>`;
      applyI18n(last);
      return;
    }
    const podium = ev.podium.map((p) => {
      return `<div class="led"><div class="what"><span class="t"><span class="rank num ${p.rank === 1 ? 'p1' : ''}">#${p.rank}</span> ${esc(p.username)}</span><span class="d">${esc(p.total_points)} pts</span></div></div>`;
    }).join('');
    last.innerHTML = `<a class="event" href="/results.html?t=${encodeURIComponent(ev.id)}">
      <div class="mid"><span class="t">${esc(ev.title)}</span><span class="s">${esc(dateText(ev.event_date))}</span></div>
    </a><div class="panel mt1"><div class="ledger">${podium}</div></div>`;
    applyI18n(last);
  } catch (e) { showError(e, last); }
}

async function loadStats() {
  stats.innerHTML = skeleton(4);
  try {
    const { stats: s } = await api('/api/public/stats');
    stats.innerHTML = [
      [s.players, 'home.players'], [s.tournaments, 'home.events'],
      [rupees(s.prizesDistributed), 'home.prizes'], [s.killsRecorded, 'home.kills'],
    ].map(([v, k]) => `<div class="stat center"><span class="v num">${esc(v)}</span><span class="k" data-t="${k}"></span></div>`).join('');
    applyI18n(stats);
  } catch (e) { showError(e, stats); }
}