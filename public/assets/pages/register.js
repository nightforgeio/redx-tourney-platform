import { mountShell, showError } from '../shell.js';
import { api, forgetSession } from '../api.js';
import { applyI18n, t } from '../i18n.js';
import { qs } from '../format.js';

const form = document.getElementById('form');
const alertBox = document.getElementById('alert');

mountShell({ page: 'nav.register', title: 'Register — RedX Gamerz' }).then(() => {
  applyI18n();
  form.addEventListener('submit', onSubmit);
});

async function onSubmit(e) {
  e.preventDefault();
  const body = {
    username: form.username.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
    password: form.password.value,
    ff_uid: form.ff_uid.value.trim(),
    ff_ign: form.ff_ign.value.trim(),
  };
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  btn.textContent = t('msg.loading');
  try {
    await api('/api/auth/register', { method: 'POST', body });
    forgetSession();
    const next = qs('next');
    location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard.html';
  } catch (err) {
    showError(err, alertBox);
  } finally {
    btn.disabled = false;
    btn.textContent = t('nav.register');
  }
}