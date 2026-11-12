# RedX Gamerz — Free Fire Tournament Management Platform

Tournament management for Free Fire (BR + CS): registration, room credentials, results, automatic prize wallet, manual redemption. Built for the RedX Gamerz brand.

## Stack
- Node.js 22 + Express 5
- SQLite via Node's built-in `node:sqlite` (file DB, zero external service, zero native build)
- JWT httpOnly-cookie auth + bcrypt
- Zod validation, express-rate-limit
- Security headers hand-rolled (`src/middleware/security.js`) — keeps the dependency list at 7

## Local dev
```bash
npm install
npm run migrate
npm run seed:admin   # create the first admin from .env values
npm run dev          # http://127.0.0.1:3000
```

## Env
Copy `.env.example` to `.env` and set a strong `JWT_SECRET` + admin credentials.

## Deploy (Render)
- Build: `npm install`
- Start: `npm run migrate && npm run seed:admin && npm start`
- Set env vars (`JWT_SECRET`, `ADMIN_*`, `DATA_DIR`).

### Persistence caveat (current live setup)
Render's free tier refuses to attach a disk without a payment card (API returns
`402 Payment Required`), so the live service runs with `DATA_DIR=./data` on
instance-local storage. **All data resets on every redeploy.** To make it durable,
add a card, then attach the `redx-data` disk at `/var/data` and set `DATA_DIR=/var/data`
(see `render.yaml`).

## Security posture (measured, not assumed)
- CSP is `script-src 'self'` with **no** `'unsafe-inline'` for scripts: every page
  loads exactly one external module script and there are zero inline scripts
  (enforced by a regression test across all 10 pages).
- `style-src` needs `'unsafe-inline'` because `admin.js`/`render.js` set inline
  `style` attributes. Documented tradeoff; removing it needs a refactor to classes.
- HSTS is sent only when `NODE_ENV=production` (pinning https on a local http
  preview would break loopback testing).
- Unknown paths return a real 404 (branded page, `Cache-Control: no-store`);
  missing assets return a plain-text 404 so a broken `<script src>` never gets HTML.

## Structure
```
src/
  server.js          # app entry
  app.js             # express app + middleware
  db/
    migrate.js       # schema migrations (run at boot + manually)
    seed-admin.js
  middleware/        # auth, requireRole, rate limits, errors
  routes/            # auth, players, tournaments, rooms, results, wallet, redemptions, admin
  services/          # wallet, scoring, ledger logic (server-side only)
  lib/               # utils
public/              # static front-end (player + admin)
```

## Rules
- Never expose room passwords publicly; approved participants only.
- Wallet is server-side only; no client trust.
- Prize credits are idempotent (DB unique constraint prevents duplicate credit).
- Redemptions reserve balance on request; actual transfer stays manual.
