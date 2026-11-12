/* Formatting helpers. Money is always ₹ with Indian digit grouping; numbers in
   tables are tabular so columns never jitter. */
import { getLang, t } from './i18n.js';

const ESC_MAP = {
  '\u0026': '\u0026amp;',   // &
  '\u003C': '\u0026lt;',    // <
  '\u003E': '\u0026gt;',    // >
  '\u0022': '\u0026quot;',  // "
  '\u0027': '\u0026#39;',   // '
};
export function esc(s) {
  return String(s ?? '').replace(/[\u0026\u003C\u003E\u0022\u0027]/g, (c) => ESC_MAP[c]);
}
export function rupees(n) {
  return `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
}
export function modeLabel(m) { return m === 'br' ? 'BR' : m === 'cs' ? 'CS' : String(m ?? '').toUpperCase(); }
export function formatLabel(f) {
  return ({ solo: 'Solo', duo: 'Duo', squad: 'Squad' })[f] ?? String(f ?? '');
}

const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  hi: ['जन', 'फ़र', 'मार्च', 'अप्रै', 'मई', 'जून', 'जुल', 'अग', 'सित', 'अक्ट', 'नव', 'दिस'],
};
export function dateParts(iso) {
  if (!iso) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const m = MONTHS[getLang()][d.getMonth()];
  return { day: String(d.getDate()), month: m, full: `${d.getDate()} ${m} ${d.getFullYear()}` };
}
export function dateText(iso) { return dateParts(iso)?.full ?? '—'; }
export function timeText(hhmm) { return hhmm ? String(hhmm).slice(0, 5) : '—'; }

export function statusClass(s) {
  return ({
    approved: 'ok', completed: 'ok', paid: 'ok', done: 'ok',
    rejected: 'no', cancelled: 'no',
    pending: 'wait', registration: 'wait',
    ongoing: 'live',
    open: '', draft: '',
  })[s] ?? '';
}
export function statusLabel(s) {
  const k = `s.${s}`;
  const v = t(k);
  return v === k ? String(s ?? '') : v;
}
export function pill(s) {
  return `<span class="pill ${statusClass(s)}">${esc(statusLabel(s))}</span>`;
}

export function countdownText(iso, hhmm) {
  if (!iso) return '—';
  const target = new Date(`${String(iso).slice(0, 10)}T${hhmm ? String(hhmm).slice(0, 5) : '00:00'}:00`);
  if (Number.isNaN(target.getTime())) return '—';
  const diff = target.getTime() - Date.now();
  const hi = getLang() === 'hi';
  if (diff <= 0) return hi ? 'शुरू हो चुका' : 'started';
  const mins = Math.floor(diff / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return hi ? `${d} दिन ${h} घंटे बाकी` : `${d}d ${h}h left`;
  if (h > 0) return hi ? `${h} घंटे ${m} मिनट बाकी` : `${h}h ${m}m left`;
  return hi ? `${m} मिनट बाकी` : `${m}m left`;
}
export function startCountdown(iso, hhmm, el) {
  if (!el) return () => {};
  const tick = () => { el.textContent = countdownText(iso, hhmm); };
  tick();
  const id = setInterval(tick, 20000);
  return () => clearInterval(id);
}

export function qs(name) {
  return new URLSearchParams(location.search).get(name);
}
/* Slot meter state: red until nearly full, gold when filling, muted when full. */
export function meterClass(filled, max) {
  if (!max) return '';
  if (filled >= max) return 'full';
  return filled / max >= 0.8 ? 'high' : '';
}