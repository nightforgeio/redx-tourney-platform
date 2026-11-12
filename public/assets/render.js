/* Shared render partials, used by the public pages, the player dashboard and the
   admin panel. Everything returns an HTML string; callers insert it. */
import { esc, rupees, dateParts, timeText, pill, modeLabel, formatLabel, meterClass } from './format.js';
import { t } from './i18n.js';

export function skeleton(rows = 3) {
  return `<div class="panel">${Array.from({ length: rows }, () => '<div class="skeleton"></div>').join('')}</div>`;
}

/* An event row: date block, title, mode/format, slots or prize, status. */
export function eventRow(ev) {
  const d = dateParts(ev.event_date);
  const filled = Number(ev.slots_filled ?? ev.approved_count ?? 0);
  const max = Number(ev.max_slots ?? 0);
  const showSlots = ['open', 'registration', 'ongoing'].includes(ev.status);
  const right = showSlots && max
    ? `<div class="num">${filled}/${max}</div><div class="tiny muted">${esc(t('home.slots'))}</div>`
    : ev.prize_pool
      ? `<div class="money num">${esc(rupees(ev.prize_pool))}</div><div class="tiny muted">${esc(t('home.prize'))}</div>`
      : pill(ev.status ?? 'open');
  return `<a class="event" href="/tournament.html?id=${encodeURIComponent(ev.id)}">
    <div class="when">${d ? `<span class="d num">${esc(d.day)}</span><span class="m">${esc(d.month)}</span>` : `<span class="m">${esc(t('ev.soon'))}</span>`}</div>
    <div class="mid">
      <span class="t">${esc(ev.title)}</span>
      <span class="s">${esc(modeLabel(ev.mode))} · ${esc(formatLabel(ev.format))}${ev.event_time ? ` · ${esc(timeText(ev.event_time))}` : ''}</span>
    </div>
    <div class="right">${right}</div>
  </a>`;
}

/* Scoreboard table. Numbers are right-aligned and tabular. `cols` decides which
   columns to show so the same table serves public, player and admin views. */
export function boardTable(rows, cols = ['pts', 'kills', 'matches']) {
  if (!rows?.length) return `<div class="empty">${esc(t('t.boardnone'))}</div>`;
  const head = [
    `<th scope="col">#</th>`,
    `<th scope="col">${esc(t('t.player'))}</th>`,
    cols.includes('pts') ? `<th scope="col" class="r">${esc(t('t.points'))}</th>` : '',
    cols.includes('kills') ? `<th scope="col" class="r">${esc(t('home.kills'))}</th>` : '',
    cols.includes('matches') ? `<th scope="col" class="r">${esc(t('t.matches'))}</th>` : '',
    cols.includes('placement') ? `<th scope="col" class="r">${esc(t('t.placement'))}</th>` : '',
    cols.includes('killpts') ? `<th scope="col" class="r">${esc(t('t.killpt'))}</th>` : '',
  ].join('');
  const body = rows.map((r) => `<tr${r.rank === 1 ? ' class="p1"' : ''}>
      <td class="rank num">${esc(r.rank ?? '')}</td>
      <td><span class="who">${esc(r.username ?? '')}</span>${r.ff_ign ? `<span class="ign">${esc(r.ff_ign)}</span>` : ''}</td>
      ${cols.includes('pts') ? `<td class="r pts">${esc(r.total_points ?? 0)}</td>` : ''}
      ${cols.includes('kills') ? `<td class="r">${esc(r.total_kills ?? r.kills ?? 0)}</td>` : ''}
      ${cols.includes('matches') ? `<td class="r muted">${esc(r.matches_played ?? '')}</td>` : ''}
      ${cols.includes('placement') ? `<td class="r muted">${esc(r.placement_points ?? 0)}</td>` : ''}
      ${cols.includes('killpts') ? `<td class="r muted">${esc(r.kill_points ?? 0)}</td>` : ''}
    </tr>`).join('');
  return `<div class="tablewrap"><table class="board"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/* The room ticket — the one memorable element. Locks itself when the viewer is
   not an approved participant, so the same component is safe on any page. */
export function roomTicket(room, { locked = false, note = '' } = {}) {
  if (locked) {
    return `<div class="ticket locked">
      <div class="t-head"><span class="kicker">${esc(t('t.room'))}</span><span class="pill">${esc(t('t.roomlocked'))}</span></div>
      <div class="t-body"><div class="creds">
        <div class="cred"><div class="k">${esc(t('t.roomid'))}</div><div class="v">••••••</div></div>
        <div class="cred"><div class="k">${esc(t('t.roompw'))}</div><div class="v">••••••</div></div>
      </div>${note ? `<p class="small muted mt2 mb0">${esc(note)}</p>` : ''}</div>
    </div>`;
  }
  return `<div class="ticket">
    <div class="t-head"><span class="kicker">${esc(t('t.room'))}</span>
      <button type="button" class="btn small" data-copy='${esc(JSON.stringify(`Room ID: ${room.room_id} | Password: ${room.password}`))}'>${esc(t('t.copy'))}</button>
    </div>
    <div class="t-body"><div class="creds">
      <div class="cred"><div class="k">${esc(t('t.roomid'))}</div><div class="v num">${esc(room.room_id)}</div></div>
      <div class="cred"><div class="k">${esc(t('t.roompw'))}</div><div class="v num">${esc(room.password)}</div></div>
    </div></div>
  </div>`;
}

/* Copy buttons are delegated: one listener handles every ticket on the page. */
export function wireCopy(root = document) {
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const text = btn.dataset.copy;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    const old = btn.textContent;
    btn.textContent = t('t.copied');
    btn.classList.add('justcopied');
    setTimeout(() => { btn.textContent = old; btn.classList.remove('justcopied'); }, 1600);
  });
}

/* Points table from a tournament's config. Renders real values, so players can
   see exactly how a kill and a placement are scored. */
export function pointsTable(mode, config) {
  if (!config) return `<div class="empty">${esc(t('t.boardnone'))}</div>`;
  if (mode === 'br') {
    const rows = (config.placement ?? []).map((p, i) =>
      `<tr><td class="num">#${i + 1}</td><td class="r pts">${esc(p)}</td></tr>`).join('');
    return `<div class="tablewrap"><table class="board">
      <thead><tr><th scope="col">${esc(t('t.placement'))}</th><th scope="col" class="r">${esc(t('t.points'))}</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p class="small muted mt1 mb0">${esc(t('t.killpt'))}: <span class="num">+${esc(config.kill ?? 0)}</span></p>`;
  }
  return `<div class="tablewrap"><table class="board"><tbody>
      <tr><td>${esc(t('t.win'))}</td><td class="r pts">${esc(config.win ?? 0)}</td></tr>
      <tr><td>${esc(t('t.lose'))}</td><td class="r pts">${esc(config.lose ?? 0)}</td></tr>
      <tr><td>${esc(t('t.killpt'))}</td><td class="r pts">${esc(config.kill ?? 0)}</td></tr>
    </tbody></table></div>`;
}

export function meter(filled, max) {
  if (!max) return '';
  const pct = Math.min(100, Math.round((filled / max) * 100));
  return `<div class="meter ${meterClass(filled, max)}" role="img" aria-label="${filled}/${max}">
    <i style="width:${pct}%"></i></div>`;
}