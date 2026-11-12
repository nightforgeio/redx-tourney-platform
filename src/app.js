import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withDb } from './lib/db-helpers.js';
import { apiLimiter } from './middleware/rateLimit.js';

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

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  app.use(apiLimiter);
  app.use(withDb);

  app.use('/api/auth', authRoutes);
  app.use('/api/player', playerRoutes);
  app.use('/api/tournaments', tournamentRoutes);
  app.use('/api/registrations', registrationRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/results', resultRoutes);
  app.use('/api', redeemRoutes);
  app.use('/api/admin', adminRoutes);
  // Mounted last among API routers so its literal paths never shadow the others.
  app.use('/api/public', publicRoutes);

  // API 404 must come before the SPA catch-all
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  app.use(express.static(publicDir));

  // SPA fallback (Express 5: named wildcard). Only when the SPA shell exists;
  // during backend-only development it returns a plain 200 so the API stays usable.
  const indexHtml = path.join(publicDir, 'index.html');
  app.get(/^(?!\/api\/).*/, (req, res) => {
    if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
    return res.status(200).json({ ok: true, service: 'redx-tourney-platform', note: 'front-end not built yet' });
  });

  // central error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}