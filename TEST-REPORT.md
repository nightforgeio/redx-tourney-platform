# Test report — RedX Gamerz tournament platform

Run: `cd /root/redx-platform && node --no-warnings tests/e2e.test.js`
Result: **65 / 65 passing** (real HTTP requests against a temp SQLite DB; no mocks).

## Coverage by area

### Auth (10)
- player registers (username/email/phone/FF UID/FF IGN)
- duplicate username → 409
- invalid payload (short password, bad email) → 400
- login by email, login by username
- wrong password → 401
- unauthenticated wallet read → 401
- admin login
- `/me` returns own profile only

### Player profile (1)
- player edits their own FF UID / IGN

### Tournaments + registration (10)
- admin creates BR tournament
- player cannot POST to the wallet endpoint (404/405)
- admin opens registration
- player registers (captain-only model — no teammate records)
- duplicate registration → 409
- admin lists registrations
- admin approves / rejects a registration
- player sees their own registration status
- capacity limit enforced when approving

### Room credentials (5)
- admin publishes room ID + password
- **rejected player → 403** (not just hidden, refused)
- approved player sees credentials
- **public tournament payload never contains the room password** (asserted by scanning the whole JSON)
- hidden (visible=false) credentials → 404 even for approved players

### Scoring — BR (4)
- default BR table: 1st = 15 pts, kill = 1 pt
- 1st place with 4 kills = 19 pts
- 2nd place with 2 kills = 14 pts
- re-submitting a match updates the row in place (no duplicate rows)

### Scoring — CS (4)
- CS win/lose table (win 3, lose 0, kill 1)
- win + 5 kills = 8 pts
- loss + 2 kills = 2 pts, and **no BR placement points leak into CS**
- admin sets a custom CS table (win 5, lose 1, kill 2) and it applies immediately (5 + 5×2 = 15)

### Wallet + prize distribution (7)
- new wallet is zero
- distribution blocked while tournament is not completed (400)
- distribution of 300 + 200 = 500 pool succeeds
- winner wallet auto-credited (300) with no manual step
- **re-publishing results → 409, wallet unchanged** (duplicate-credit prevention)
- distribution must match the pool exactly (400 on mismatch)
- ledger sums are the single source of truth (balance never stored)

### Redemption (14)
- player requests redemption
- balance reserved immediately (300 → 200 available, 100 pending)
- over-balance request blocked (400)
- second request that would exceed remaining balance blocked (400)
- player cannot read the admin redemption list (403)
- admin sees the request with the payment number
- admin approves
- marking paid without a reference → 400
- marking paid with a reference → 200
- wallet moves hold → redeemed (available 200, redeemed 100, pending 0)
- re-paying the same redemption → 409 (no double payout)
- a second hold is taken (200 → 50)
- rejecting releases the hold (back to 200)

### RBAC + integrity (12)
- player cannot call the prize distribution endpoint (403)
- player cannot read admin stats (403)
- player cannot PUT to a wallet endpoint
- co-admin grant works; 2nd co-admin allowed; 3rd blocked (400)
- admin wallet adjustment writes a ledger entry and moves the balance
- audit log records prizes_distributed and redeem_update
- hidden room credentials return 404

## Bugs found and fixed during testing
1. **Admin/registration/results routes never ran `authRequired`** → every admin call returned 403 even with a valid session. Fixed by adding `authRequired` before `requireRole`.
2. **Redemption payout double-counted the hold** → the held amount was released only when the request skipped `approved`, so a normal approve→paid flow left funds permanently locked. Fixed: `paid` always writes `redeem_release` then `redeem_paid`.
3. **Duplicate-credit guard ran after the pool check** → a second publish with different numbers returned 400 instead of the correct 409. Fixed: idempotency check runs first.
4. **Express 5 rejects `app.get('*')`** → server crashed at boot. Fixed with a named regex fallback.
5. **`better-sqlite3` cannot build on this device** → no prebuilt binary, no compiler toolchain. Replaced with Node's built-in `node:sqlite` behind a thin adapter (zero deps, deploys the same on Render).

## Not yet covered (front-end phases)
- UI behaviour, responsive layout, motion, accessibility
- session expiry UX, rate-limit UX
- Playwright/DOM-level checks
