import { mountShell, showError } from '../shell.js';
import { api } from '../api.js';
import { applyI18n } from '../i18n.js';
import { eventRow, skeleton } from '../render.js';

mountShell({ page: 'nav.events', title: 'Tournaments — RedX Gamerz' }).then(() => {
  applyI18n();
  load();
});

const box = document.getElementById('events');

async function load() {
  box.innerHTML = skeleton(6);
  try {
    const { tournaments } = await api('/api/tournaments');
    box.innerHTML = tournaments.length ? tournaments.map(eventRow).join('') : `<div class="empty" data-t="ev.none"></div>`;
    applyI18n(box);
  } catch (e) { showError(e, box); }
}