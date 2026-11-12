# RedX Gamerz — Free Fire Tournament Management Platform

Tournament management for Free Fire (BR + CS): registration, room credentials, results, automatic prize wallet, manual redemption. Built for the RedX Gamerz brand.

## Stack
- Node.js 22 + Express 5
- SQLite via better-sqlite3 (file DB, zero external service)
- JWT httpOnly-cookie auth + bcrypt
- Zod validation, express-rate-limit

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
- Start: `npm run migrate && npm start`
- Set env vars (`JWT_SECRET`, `ADMIN_*`, `DATA_DIR` point to a mounted disk for DB persistence).

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
