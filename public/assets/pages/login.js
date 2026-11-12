import { mountShell, showError } from '../shell.js';
import { api, forgetSession } from '../api.js';
import { applyI18n, t } from '../i18n.js';
import { qs } from '../format.js';

const form = document.getElementById('form');
const alertBox = document.getElementById('alert');

mountShell({ page: 'nav.login', title: 'Log in — RedX Gamerz' }).then(() => {
  applyI18n();
  form.addEventListener('submit', onSubmit);
});

async function onSubmit(e) {
  e.preventDefault();
  const identifier = form.identifier.value.trim();
  const password = form.password.value;
  if (!identifier || !password) {
    showError({ message: 'err.required' }, alertBox);
    return;
  }
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  btn.textContent = t('msg.loading');
  try {
    await api('/api/auth/login', { method: 'POST', body: { identifier, password } });
    forgetSession();
    const next = qs('next');
    location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard.html';
  } catch (err) {
    showError(err, alertBox);
  } finally {
    btn.disabled = false;
    btn.textContent = t('a.login');
  }
}