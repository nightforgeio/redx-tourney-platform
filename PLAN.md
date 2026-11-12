# RedX Gamerz — Free Fire Tournament Management Platform

> Master plan — agreed with Jay (owner/manager) before any code.

## 0. Context (from interview answers)

- Owner: Jay manages the platform; the **brand** is **RedX Gamerz** (YouTube: youtube.com/@redxgamerz, 2.59K subs, 983 videos, runs "Free Fire India free tournament with real money" events).
- This is the client's brand, not Jay's own brand. All brand assets (logo, handle) come from RedX Gamerz. No fabrication — owner assets stay TODO(owner).
- Hosting: Render (free tier) — real production deployment, ready to go live.
- Admin model: Jay = admin; can grant admin power to 2 co-admins.
- Money: INR; payment number = UPI ID or phone number; no KYC for now.
- Teams: Captain registers solo (no teammate invite flow).
- Scoring: decided live per event — admin sets points table per match (new match = new points table + new registrations).
- Auth: email + phone + username + password. Phone optional at register but used as payment number later.
- Public pages: Home, upcoming tournaments, tournament details, leaderboard, results, about, login, register.

## 1. Subject line (design doctrine §1)

- Product: tournament management platform for Free Fire (BR + CS) with automatic prize wallet and manual payout redeem.
- Audience: Indian Free Fire players (mobile-first, Hindi/English mix) and one admin (Jay) plus up to 2 co-admins.
- Main job: players register → get room credentials → see results → wallet auto-credits → redeem to UPI/phone.

## 2. Design direction (two-pass plan)

### Pass 1 — proposal
- **Brand read:** RedX Gamerz = red "X" themed gaming channel. Dark esports vibe but must NOT be generic.
- **Colors (4–6 hex):**
  - `#05070D` body bg (near-black with blue undertone)
  - `#0C1322` surface (dark navy)
  - `#FF3B3B` accent red (RedX) — used sparingly, one memorable element
  - `#E8ECF4` ink (light text)
  - `#8A94A6` muted text
  - `#1E2A40` borders
  - `#10B981` success/credits (only for wallet-positive states)
- **Type:** display = "Sora" (geometric, gaming-tech feel), body = "Manrope" (clean, readable). Sora for headings/numbers, Manrope for everything else.
- **Layout:** mobile-first single column; cards for tournament rows; scoreboard tables with strong numbers; admin = dense utility layout. Accent red used ONLY for the "X" brand mark and primary CTAs + kill/rank highlight.
- **Principles:** feels like an esports command center, not a fintech app; red X brand mark is the memorable element; wallet area looks like a "ledger" (rows, not cards); numbers are big and tabular.

### Pass 2 — anti-slop review (doctrine §3)
- ❌ Generic dark + acid accent (template default) → we keep dark but pick **red** (RedX brand), not lime/cyan; avoid purple-blue gradients entirely.
- ❌ Same rounded card everywhere → mix: panels with sharp corners for admin tables; rounded only for player-facing cards.
- ❌ Stock phrases → copy will be real event copy (Free Fire India tournament voice).
- ❌ Emoji icons → use inline SVG icons only.
- ❌ Hero + 3 cards + CTA default → home page leads with the next live tournament + countdown, not a generic hero.

## 3. Architecture (tech choices + why)

- **Backend:** Node.js 22 + Express (minimal deps: express, bcryptjs, jsonwebtoken, zod, svelte? no — no frontend framework; plain EJS? no — SPA served by Express static + API).
- **Database:** SQLite (better-sqlite3) — file DB on Render, zero external service, easy backups; migrate later to Postgres if scale demands.
- **Auth:** JWT httpOnly cookies + bcrypt hashing; separate admin role; co-admin role (2 max).
- **Wallet:** server-side only; stored in SQLite with `transactions` ledger (immutable-ish append-only); prize credit = transaction rows; duplicate-credit prevented by unique (tournament_id, player_id, type) constraint on prize credits.
- **Scoring:** per-match config from admin (BR: placement pts table + kill pts; CS: configurable match outcomes + scoring) — new match = new table.
- **Room credentials:** room_id + house stored on tournament; only shown to players with approved registration; never in public API.
- **Rate limiting:** express-rate-limit on auth + redeem endpoints.

## 4. Data model (migrations)

- `users` (id, username unique, email unique, phone, password_hash, role[player/admin/coadmin], ff_uid, ff_ign, created_at)
- `tournaments` (id, title, banner_url, mode[br/cs], format[solo/duo/squad], status[draft/open/registration/ongoing/completed/cancelled], max_slots, date, time, points_config_json, prize_pool, announcement)
- `registrations` (id, tournament_id, user_id, status[pending/approved/rejected], created_at) — UNIQUE(tournament_id, user_id)
- `rooms` (id, tournament_id, room_id, password, updated_at)
- `matches` (id, tournament_id, name, status)
- `results` (id, match_id, tournament_id, user_id, placement, kills, placement_points, kill_points, total_points) — UNIQUE(match_id, user_id) with auto totals
- `transactions` (id, user_id, type[prize_credit/redeem_hold/redeem_release/redeem_paid/redeem_rejected/admin_adjust], amount, ref, created_at)
- `redemptions` (id, user_id, amount, payment_type[upi/phone], payment_number, status[pending/approved/paid/rejected], admin_ref, created_at) — reserve on create
- `audit_logs` (id, admin_id, action, target, details, created_at)

## 5. Pages & features

- Public: Home (next tournament countdown, recent winners), Tournaments list/detail, Leaderboard, Results, About (RedX brand), Login, Register.
- Player dashboard: overview, profile (edit FF UID/IGN), my tournaments, my results, wallet (balance/earnings/redeemed/pending), redeem form, transaction history.
- Admin panel: stats, players, tournaments (CRUD + start/pause/cancel), registrations (accept/reject), rooms (set/publish/hide), results entry (per match), prize distribution, wallet (view/force adjust with audit), redemptions (verify → approve/reject → mark paid with ref), announcements, settings + audit log viewer.
- Roles: admin + co-admin (2 max, set by admin).

## 6. Build order (phases)

1. **Fundamentals:** scaffold Express + SQLite migrations + auth (register/login/logout, session, RBAC).
2. **Player core:** profile edit (FF UID/IGN), public tournament browse, register (captain-only, status queue).
3. **Tournament admin:** CRUD, approval flow, rooms.
4. **Results & scoring:** per-match points config, auto calculation (UNIQUE guard), publish.
5. **Wallet & redeem:** auto-credit on publish (idempotent), reserve-on-redeem, ledger, admin redemption dashboard with payment confirm + ref.
6. **Admin panel full:** stats, audit logs, co-admin grant.
7. **UI/UX:** design tokens, mobile-first pages, motion pass, audit.
8. **Hardening:** rate limits, input validation, backups, error handling.
9. **Deploy:** Render (DB file + backups), env secrets, go-live only with Jay's explicit say-so.

## 7. Deliverables

- Complete app (Player + Admin + Public), DB migrations, setup/deploy README, test report, feature list, limitations list.

## 8. Rules locked in

- No betting/deposits; entry free by default; paid entry needs owner + legal approval. (From brief §3.)
- Never expose room creds publicly; only approved participants.
- Wallet is server-side only; players cannot modify.
- Duplicate prize credit prevented by DB unique constraint.
- No secrets in frontend/GitHub; everything in `.env` (never committed).
