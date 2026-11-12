import { mountShell, showError } from '../shell.js';
import { api } from '../api.js';
import { applyI18n } from '../i18n.js';
import { skeleton, boardTable } from '../render.js';
import { esc, qs } from '../format.js';

const pick = document.getElementById('pick');
const board = document.getElementById('board');

mountShell({ page: 'nav.board', title: 'Leaderboard — RedX Gamerz' }).then(async () => {
  applyI18n();
  const t = qs('t');
  await fillPicker(t);
});

async function fillPicker(selected) {
  let tournaments = [];
  try {
    ({ tournaments } = await api('/api/tournaments'));
  } catch { /* list may be empty */ }
  const options = tournaments.filter((x) => x.status !== 'draft').map((x) =>
    `<option value="${x.id}"${selected && Number(selected) === Number(x.id) ? ' selected' : ''}>${esc(x.title)}</option>`).join('');
  pick.insertAdjacentHTML('beforeend', options);
  pick.addEventListener('change', () => {
    if (pick.value) location.href = `/leaderboard.html?t=${encodeURIComponent(pick.value)}`;
  });
  applyI18n(pick);
  if (selected) await loadBoard(selected);
}

async function loadBoard(id) {
  board.innerHTML = skeleton(4);
  try {
    const { leaderboard } = await api(`/api/results/tournament/${encodeURIComponent(id)}/leaderboard`);
    board.innerHTML = boardTable(leaderboard, ['pts', 'kills', 'matches']);
    applyI18n(board);
  } catch (e) { showError(e, board); }
}