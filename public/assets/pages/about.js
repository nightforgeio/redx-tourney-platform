import { mountShell } from '../shell.js';
import { applyI18n } from '../i18n.js';

mountShell({ page: 'nav.about', title: 'About — RedX Gamerz' }).then(() => {
  applyI18n();
});