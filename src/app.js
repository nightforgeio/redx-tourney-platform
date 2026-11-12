import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withDb } from './lib/db-helpers.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { securityHeaders } from './middleware/security.js';
import authRoutes from './routes/auth.js';
import playerRoutes from './routes/players.js';
import tournamentRoutes from './routes/tournaments.js';
import registrationRoutes from './routes/registrations.js';
import roomRoutes from './routes/rooms.js';
import resultRoutes from './routes/results.js';
import redeemRoutes from './routes/redemptions.js';
import adminRoutes from './routes/admin.js';
import publicRoutes from './routes/public.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

// Real asset requests (scripts, styles, images, fonts, machine-readable files).
// These must never receive the SPA shell: a broken <script src> that returns HTML
// makes the browser fail with a confusing MIME error, and search engines read
// every missing asset as a soft 200. Unknown *pages* (.html or no extension) are
// served the branded 404 instead, because that is what a lost visitor needs.
const ASSET_RE = /\.(?:js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|json|xml|txt|webmanifest)$/i;

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(securityHeaders);
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  app.use(apiLimiter);
  app.use(withDb);

  // Liveness probe: Render (and any uptime monitor) gets JSON, not the SPA shell.
  // Confirms the DB handle is actually working, not just that the process booted.
  app.get('/health', (req, res) => {
    try {
      const row = req.db.prepare('SELECT 1 AS ok').get();
      return res.json({
        ok: row?.ok === 1,
        db: row?.ok === 1 ? 'ok' : 'error',
        service: 'redx-tourney-platform',
        uptime: Math.round(process.uptime()),
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'db unavailable' });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/player', playerRoutes);
  app.use('/api/tournaments', tournamentRoutes);
  app.use('/api/registrations', registrationRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/results', resultRoutes);
  app.use('/api', redeemRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/public', publicRoutes);

  // API 404 must come before the SPA catch-all
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // Hashed-by-nature assets that change rarely get a long cache; HTML never does.
  app.use(express.static(publicDir, {
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      if (/\.(?:woff2?|svg|png|jpe?g|webp|ico)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      } else if (/\.(?:css|js)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      }
    },
  }));

  // Missing asset -> honest, non-HTML 404. Prevents soft-404s (every missing file
  // scoring a 200) and the confusing "HTML returned for a .js request" MIME error.
  app.use((req, res, next) => {
    if (ASSET_RE.test(req.path)) {
      return res.status(404).type('text/plain').send('Not found');
    }
    return next();
  });

  // Anything left is a genuinely missing page. There is no client-side router, so
  // every real page is an explicit .html file; answering with the SPA shell here
  // would be a soft 200. Serve the branded 404 page instead, with a real 404 status.
  app.use((req, res) => {
    const notFound = path.join(publicDir, '404.html');
    // Error responses must never be cached, and this route bypasses express.static,
    // so set it here explicitly.
    res.setHeader('Cache-Control', 'no-store');
    if (fs.existsSync(notFound)) return res.status(404).sendFile(notFound);
    return res.status(404).type('text/plain').send('Not found');
  });

  // central error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}
