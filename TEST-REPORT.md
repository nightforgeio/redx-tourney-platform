# Test report — RedX Gamerz tournament platform

Run: `cd /root/redx-platform && npm test`
Result: **161 / 161 passing** (real HTTP requests against a temp SQLite DB; no mocks).

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
### Security headers + liveness (13)
- CSP present with `default-src 'self'`, `script-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`
- `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` set
- HSTS **absent outside production** (local http preview must not be pinned)
- HTML ships `Cache-Control: must-revalidate` (never a stale shell)
- `/health` returns JSON with `ok:true` + `db:'ok'` + uptime (real DB query, not just a live process)
### Static assets + honest 404s (8)
- missing `.js` asset → real 404, and the body is **not** the SPA shell
- self-hosted font `/fonts/mukta-400-devanagari.woff2` → 200 with `max-age=604800`
- CSS ships `max-age=3600`
- unknown path → 404 **branded** page (carries its own external module script)
- unknown `.html` page → same branded 404 (no soft-200 shell)
- 404 is `Cache-Control: no-store`
- `robots.txt` is a real file (not the shell) with a `Sitemap:` line
- `sitemap.xml` is valid XML with ≥5 `<loc>`; `manifest.webmanifest` parses as JSON
### SEO + a11y markup, per page (10 × 8 = 80)
For each of index, about, tournaments, tournament, leaderboard, results, login,
register, dashboard, admin:
- `rel="canonical"`, `og:title` + `twitter:card`
- skip link → `#main`, `<main id="main">` landmark, `<noscript>` notice
- `rel="manifest"` linked
- **zero inline `<script>` bodies** — the CSP `script-src 'self'` cannot be bypassed
- private pages (admin/dashboard/login/register) carry `noindex`; home stays indexable

## Bugs found and fixed during testing
1. **Admin/registration/results routes never ran `authRequired`** → every admin call returned 403 even with a valid session. Fixed by adding `authRequired` before `requireRole`.
2. **Redemption payout double-counted the hold** → the held amount was released only when the request skipped `approved`, so a normal approve→paid flow left funds permanently locked. Fixed: `paid` always writes `redeem_release` then `redeem_paid`.
3. **Duplicate-credit guard ran after the pool check** → a second publish with different numbers returned 400 instead of the correct 409. Fixed: idempotency check runs first.
4. **Express 5 rejects `app.get('*')`** → server crashed at boot. Fixed with a named regex fallback.
5. **`better-sqlite3` cannot build on this device** → no prebuilt binary, no compiler toolchain. Replaced with Node's built-in `node:sqlite` behind a thin adapter (zero deps, deploys the same on Render).
6. **Live audit (post-deploy) — every asset 404 was a soft 200** → the SPA catch-all answered `missing.js` with `200 text/html`, which breaks the browser with a MIME error and makes search engines index junk URLs. Fixed with a real 404 for asset extensions.
7. **`/health`, `robots.txt`, `sitemap.xml`, `manifest.webmanifest` were phantom files** → all four silently served the SPA shell with status 200. Now real responses (JSON probe backed by `SELECT 1`; real static files).
8. **No security headers at all** → added CSP, nosniff, frame-ancestors/DENY, Referrer-Policy, COOP, Permissions-Policy, prod-only HSTS.
9. **`.skiplink` referenced the undefined token `var(--font-display)`** → the token is `--display`, so the skip link fell back to an unintended font. Found while writing the regression tests.
10. **Branded 404 was served without any cache directive** → `sendFile` for the fallback bypasses `express.static`'s `setHeaders`, so error pages could be cached. Now explicit `Cache-Control: no-store`.
11. **GitHub PAT was embedded in `.git/config` remote URL** → would leak on any repo copy. Removed; auth now flows through a credential helper.

## Not yet covered (front-end phases)
- UI behaviour, responsive layout, motion, accessibility
- session expiry UX, rate-limit UX
- Playwright/DOM-level checks
