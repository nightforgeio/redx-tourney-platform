# RedX Gamerz — UI design plan (doctrine §2, two passes)

## Pass 1 — proposal

**Subject line (§1)**
- Product: a tournament command centre for a Free Fire event organiser and the players entering his events.
- Audience: Indian Free Fire players on Android phones, mostly on mobile data, reading Hindi and English mixed; plus one admin and up to two co-admins running events live.
- Main job of the UI: get a player from "saw the video" to "registered" in under a minute, then hand them the room ID the moment it is published — and let the admin run a whole event without leaving one screen.

**Direction: the stream overlay, not the SaaS dashboard.**
The real world here is a Free Fire tournament stream: OBS overlay bars, a scoreboard with huge tabular numbers, an elimination feed, a lobby ticket with a room ID and a countdown. That world supplies the materials. Not a fintech app with rounded cards.

**Colour** (7 values; red is the brand, gold and green carry meaning, never decoration)
- `#07090F` ink — page ground
- `#0F1524` panel — surfaces
- `#1C2536` line — borders and dividers
- `#FF2E3E` red — RedX mark, primary action, live state
- `#FFC53D` gold — prize money only
- `#3DDC97` green — wallet-credit only
- `#E6EAF2` text / `#8D97AB` muted

**Type**
- Display + all numerals: **Rajdhani** 600/700 — a condensed technical face from broadcast/sports graphics. Tabular numerals, so scoreboard columns line up.
- Body + UI text: **Mukta** 400/500/600 — a Devanagari-first text face; Hindi is a first-class script here, not a fallback.
- Both subsets self-hosted (`public/fonts/`), Latin + Latin-ext + Devanagari.

**Layout** — mobile-first single column; a thin persistent status bar on top; wide screens get a two-column utility split. Every scoreboard is a real table with sticky header and right-aligned numerals.

**Alignment**: left-aligned prose, numerals right-aligned in tables, titles one-line where possible.

**Wireframe (phone, home)**
```
┌─────────────────────────────┐
│ X  RedX Gamerz    [हिं|EN]  │  brand bar + language toggle
│ ● LIVE — Squad BR · 22:00   │  status bar (only if something is live)
├─────────────────────────────┤
│ NEXT EVENT · 22:00 tonight  │
│ Free Fire India Squad BR    │  the one big thing: date, mode, slots, prize
│ 78/100 slots    ₹1,000      │
│ [ Room ID पाने के लिए रजिस्टर ]│
├─────────────────────────────┤
│ PLAYER                         │  language toggle rewrites everything
│ 1  TQG.KAIZEN   312 pts  41k │  scoreboard rows, tabular numerals
│ 2  ...                        │
├─────────────────────────────┤
│ LAST EVENT RESULT             │
│ #1 name  #2 name  #3 name     │
├─────────────────────────────┤
│ कैसे काम करता है  →  4 steps   │  real sequence, so numbering is honest
└─────────────────────────────┘
```

**Principles**
- One memorable element: the **room ticket** — when credentials are published the approved player sees a lobby-ticket block containing room ID, password and a copy button, styled like a broadcast lobby card. Everything else stays quiet.
- Numbers are big and tabular; scoreboard columns never jitter.
- Borders carry information (slots filled, live/pending), never decoration.
- Hindi and English are both written by hand, never machine-translated on the fly, and the choice is remembered.
- Red is spent only on the brand mark, the primary action and live state.

## Pass 2 — anti-slop review against the brief (what changed and why)

1. **Type changed: Sora + Manrope → Rajdhani + Mukta.** PLAN.md proposed Sora. Sora has no Devanagari coverage at all, so every Hindi string would silently fall back to a random system font and the two languages would look like two different products. Mukta is Devanagari-first and Rajdhani covers Devanagari too, so the pairing holds in both scripts. Verified by fetching both subsets from Google Fonts and confirming the `devanagari` unicode-range is present.
2. **Colour: dropped lime/cyan.** The brief §9 asked for "lime green or electric cyan" accents; the brand is a red X and §3 of the doctrine flags "near-black + one bright acid accent" as a default tell. Resolution: keep the brief's dark direction (players expect it, the owner's channel is dark), but the accent is the owner's red `#FF2E3E`, and gold/green are reserved for prize money and wallet credit so they carry meaning instead of decorating.
3. **Kept dark, but killed the flat "cards on black".** Structure comes from a broadcast overlay instead: a status bar, scoreboard rows, and a lobby ticket. Panels are square-ish (6px) with hairline borders; only player-facing cards get a soft radius. No card grid is used as the homepage.
4. **Not the hero + three cards + CTA stack.** The homepage opens with the single next event and a countdown, because that is the only thing a player came for. The "how it works" numbering is a genuine 4-step sequence, so numbering is earned.
5. **No decorative chrome.** No ALL-CAPS tracked eyebrow above every heading, no middle-dot joined labels, no monospace for small labels, no arrow appended to every link. The only uppercase text is short real labels (LIVE, ROOM ID) where broadcast convention genuinely applies.
6. **Icons are inline SVG, no emoji.** Emoji would render differently on every Android skin.
7. **Motion per §6.** One page-load moment only: the status bar and the next-event block reveal. Motion that answers an action (copy room ID → confirm, redeem → status change) is allowed. No fade-up on every section.
8. **Copy is written for this business.** Real Hindi and English lines about registering, room ID, kills scoring and UPI payout. No "Welcome to", "Elevate", "seamless", "cutting-edge", "unleash". Brand logo is a hand-drawn SVG "X" as a placeholder until the owner supplies the real asset, marked `TODO(owner)` in the source.

## Build order
Static, server-served multi-page HTML + ES modules, no bundler (§ YAGNI, and a real URL per page is better for a YouTube channel's traffic than a client router):
1. `public/fonts/` self-hosted subsets + `fonts.css`
2. `public/assets/app.css` — tokens, base, components
3. `public/assets/app.js` — API client, i18n, brand bar, toasts, formatting
4. public pages: home → tournaments → tournament detail → leaderboard → results → about → login → register
5. player dashboard: overview, profile, my tournaments, my results, wallet, redeem, history
6. admin panel: overview, players, tournaments, registrations, rooms, results entry, prize distribution, wallet, redemptions, audit
7. detector pass → audit → polish → phone screenshots
