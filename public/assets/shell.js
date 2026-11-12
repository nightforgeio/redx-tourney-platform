/* Page shell: brand bar, nav, status bar, footer, toasts.
   Built in JS so every page gets the same chrome from one source, and so the
   nav can reflect the session (logged in vs out) without server templating. */
import { applyI18n, getLang, setLang, t, LANGS } from './i18n.js';
import { session, logout, forgetSession } from './api.js';
import { esc } from './format.js';

/* Brand mark. TODO(owner): replace with the real RedX Gamerz logo file from the
   channel owner. This is a drawn placeholder, not the owner's artwork. */
export const LOGO_SVG = `<svg viewBox="0 0 32 32" role="img" aria-hidden="true" focusable="false">
  <path d="M6 4h7.2l3.4 5.1L20.4 4H27l-7.1 10.6L27.6 28h-7.4l-3.9-6-3.9 6H5.6l7.5-11.9z" fill="#ff2e3e"/>
</svg>`;

export function toast(message, kind = 'ok') {
  let box = document.querySelector('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2600);
  setTimeout(() => el.remove(), 3000);
}

/* Errors from the API are shown in the reader's language. */
export function errorMessage(err) {
  if (!err) return t('msg.error');
  if (err.status === 0 || err.message === 'offline') return t('msg.offline');
  if (err.status === 401) return t('msg.needlogin');
  if (err.status === 403) return t('msg.norights');
  return err.message || t('msg.error');
}

export function showError(err, target) {
  toast(errorMessage(err), 'err');
  if (target) {
    target.innerHTML = `<div class="alert err">${esc(errorMessage(err))}</div>`;
  }
}

function navLinks(user, page) {
  const links = [
    ['/', 'nav.home'],
    ['/tournaments.html', 'nav.events'],
    ['/leaderboard.html', 'nav.board'],
    ['/results.html', 'nav.results'],
    ['/about.html', 'nav.about'],
  ];
  const items = links.map(([href, key]) =>
    `<a href="${href}"${page === key ? ' aria-current="page"' : ''}>${esc(t(key))}</a>`);

  if (user) {
    items.push(`<a href="/dashboard.html"${page === 'nav.dashboard' ? ' aria-current="page"' : ''}>${esc(t('nav.dashboard'))}</a>`);
    if (user.role === 'admin' || user.role === 'coadmin') {
      items.push(`<a href="/admin.html"${page === 'nav.admin' ? ' aria-current="page"' : ''}>${esc(t('nav.admin'))}</a>`);
    }
  } else {
    items.push(`<a href="/login.html"${page === 'nav.login' ? ' aria-current="page"' : ''}>${esc(t('nav.login'))}</a>`);
  }
  return items.join('');
}

function langToggle() {
  const cur = getLang();
  return `<div class="langtoggle" role="group" aria-label="भाषा / Language">${
    LANGS.map((l) => `<button type="button" data-lang="${l}" aria-pressed="${cur === l}">${l === 'hi' ? 'हिं' : 'EN'}</button>`).join('')
  }</div>`;
}

/* Draws the chrome, wires the language buttons and the logout action. */
export async function mountShell({ page = '', title = '' } = {}) {
  const user = await session().catch(() => null);
  if (title) document.title = title;

  const bar = document.createElement('header');
  bar.className = 'brandbar';
  bar.innerHTML = `<div class="inner">
      <a class="brand" href="/">${LOGO_SVG}<span class="name">RedX Gamerz</span></a>
      <div class="navspacer"></div>
      ${langToggle()}
      ${user ? `<button type="button" class="btn small ghost" id="shellLogout">${esc(t('nav.logout'))}</button>`
             : `<a class="btn small primary" href="/register.html">${esc(t('nav.register'))}</a>`}
    </div>
    <nav class="navrow"><div class="nav" aria-label="${esc(t('nav.home'))}">${navLinks(user, page)}</div></nav>`;

  const main = document.querySelector('main');
  document.body.insertBefore(bar, main);

  const foot = document.createElement('footer');
  foot.innerHTML = `<div class="wrap">
      <div class="row">
        <div>
          <div class="strong">RedX Gamerz</div>
          <div>${esc(t('foot.tag'))}</div>
        </div>
        <div>
          <a href="https://youtube.com/@redxgamerz" target="_blank" rel="noopener">${esc(t('foot.channel'))}</a>
        </div>
      </div>
      <p class="tiny mt2 mb0">${esc(t('foot.rules'))}</p>
    </div>`;
  document.body.appendChild(foot);

  bar.querySelectorAll('[data-lang]').forEach((b) => {
    b.addEventListener('click', () => {
      setLang(b.dataset.lang);
      bar.querySelectorAll('[data-lang]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.lang === b.dataset.lang)));
      document.querySelectorAll('.navrow .nav').forEach((n) => { n.innerHTML = navLinks(user, page); });
    });
  });

  const out = bar.querySelector('#shellLogout');
  if (out) {
    out.addEventListener('click', async () => {
      await logout();
      forgetSession();
      toast(t('a.logout.done'));
      setTimeout(() => { location.href = '/'; }, 600);
    });
  }

  /* Legal text is not decorative: the no-deposit rule is repeated in the footer. */
  const legal = document.createElement('div');
  legal.className = 'wrap tiny';
  return { user, legal };
}

/* Require a session for a page; sends the visitor to login and back. */
export async function requireUser(role = null) {
  const user = await session().catch(() => null);
  if (!user) {
    location.replace(`/login.html?next=${encodeURIComponent(location.pathname + location.search)}`);
    return null;
  }
  if (role && user.role !== role && !(role === 'staff' && (user.role === 'admin' || user.role === 'coadmin'))) {
    location.replace('/dashboard.html');
    return null;
  }
  return user;
}

export { applyI18n };