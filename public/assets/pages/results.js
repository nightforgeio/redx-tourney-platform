import { mountShell, showError } from '../shell.js';
import { api } from '../api.js';
import { applyI18n } from '../i18n.js';
import { skeleton, boardTable, pointsTable } from '../render.js';
import { esc, qs, timeText } from '../format.js';

const pick = document.getElementById('pick');
const box = document.getElementById('result');

mountShell({ page: 'nav.results', title: 'Results — RedX Gamerz' }).then(async () => {
  applyI18n();
  const t = qs('t');
  await fillPicker(t);
});

async function fillPicker(selected) {
  let tournaments = [];
  try {
    ({ tournaments } = await api('/api/tournaments'));
  } catch { /* empty */ }
  const options = tournaments.filter((x) => x.status === 'completed' || x.status === 'ongoing').map((x) =>
    `<option value="${x.id}"${selected && Number(selected) === Number(x.id) ? ' selected' : ''}>${esc(x.title)}</option>`).join('');
  pick.insertAdjacentHTML('beforeend', options);
  pick.addEventListener('change', () => {
    if (pick.value) location.href = `/results.html?t=${encodeURIComponent(pick.value)}`;
  });
  applyI18n(pick);
  if (selected) await load(selected);
}

async function load(id) {
  box.innerHTML = skeleton(5);
  try {
    const [{ tournament }, { matches, results }] = await Promise.all([
      api(`/api/tournaments/${encodeURIComponent(id)}`),
      api(`/api/results/tournament/${encodeURIComponent(id)}`),
    ]);

    // group results by match
    const grouped = {};
    results.forEach((r) => { (grouped[r.match_id] ||= []).push(r); });

    const sections = matches.map((m) => {
      const rows = (grouped[m.match_id] || []).map((r, i) => ({
        rank: i + 1, username: r.username, ff_ign: r.ff_ign,
        total_points: r.total_points, kills: r.kills, placement_points: r.placement_points, kill_points: r.kill_points,
      }));
      const status = m.status === 'done' ? 'done' : 'pending';
      return `<section class="section">
        <div class="head"><h2>${esc(m.name || `Match ${m.match_no}`)}</h2><span class="pill ${status === 'done' ? 'ok' : 'wait'}">${esc(status === 'done' ? 'Done' : 'Pending')}</span></div>
        ${rows.length ? boardTable(rows, ['pts', 'kills', 'placement', 'killpts']) : `<div class="empty">${esc('—')}</div>`}
      </section>`;
    }).join('');

    box.innerHTML = `<div class="panel mb2">
        <h1 class="mb0">${esc(tournament.title)}</h1>
        <div class="muted mt1">${esc(tournament.mode === 'br' ? 'BR' : 'CS')} · ${esc(tournament.format)} · ${esc(tournament.event_date || '')} ${tournament.event_time ? `· ${esc(timeText(tournament.event_time))}` : ''}</div>
      </div>${sections}`;
    applyI18n(box);
  } catch (e) { showError(e, box); }
}