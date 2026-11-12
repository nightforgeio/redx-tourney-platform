/* 404 page. Must be an external module: the CSP is script-src 'self', so an
   inline <script> would be blocked. */
import { mountShell, applyI18n } from '../shell.js';

await mountShell({ page: '', title: 'Page not found — RedX Gamerz' });
applyI18n(document);
