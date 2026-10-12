# Security notes

How GeoQuest protects players and the owner's accounts, and what to keep in place.

## Accounts and sessions
- Passwords: scrypt with a random salt each, compared in constant time; unknown usernames take the same time (no hint who exists). Wrong-password message is the same either way.
- Sign-in pauses after repeated wrong passwords — per network and per account.
- Sessions: HMAC-signed, 30 days, `HttpOnly; Secure; SameSite=Lax` cookies. Resetting a password or removing someone signs their old sessions out at once.
- Invite, group and game links store only a fingerprint (SHA-256) of their token; they expire and can be revoked.
- Owner setup only works through the Vercel-protected address, and only while there is no owner.
- Reserved usernames (guest, admin, geoquest, support…) can't be taken by new accounts.

## Every API request
- Everything under `/api` needs a signed-in account except a short list of guest routes (`GUEST_OK` in `server/routes/auth.ts`).
- Owner-only: people, group links, Activity, the feedback inbox.
- Writes must come from this site (Origin check) on top of SameSite cookies.
- Inputs are validated and trimmed on the server; bodies are capped at 256 KB; server errors never reveal internals.
- Push reminders only ever call the browsers' push services (Google, Mozilla, Apple, Microsoft) — never an address a client supplies.

## Cost and abuse limits
- Ask the Atlas (owner's Claude key, Haiku 5.5 only): guests 5 questions a day; accounts 150 a day; each request sends at most the last 10 turns, trimmed to 16k characters, with at most 2 web searches per turn.
- Open sign-ups: at most 100 new accounts a day.
- Feedback 6/hour, analytics and other writes rate-limited; share pictures only for Dailies that exist.
- These limits live in each server instance (best effort). On top, a **Vercel Firewall rule** ("Rate limit costly API writes", active since Oct 2026) allows each IP 30 POSTs a minute to `/api/(ask|match|login|signup|feedback|analytics|group/join|invite/accept|invites/signup)`, enforced at Vercel's edge (429 beyond that; resets each minute). Change it in Vercel → geoquest → Firewall.
- **Keep a monthly spend limit on the Anthropic key** (console.anthropic.com → Limits): the hard backstop.

## Browser
- Strict Content-Security-Policy (no inline scripts), HSTS, no framing, no MIME sniffing, a tight Permissions-Policy.
- Everything inserted as HTML is escaped; Atlas answers are rendered as text (no links or HTML from the model).

## Data
- Private Vercel Blob store; nothing is publicly readable. Analytics keep 90 days, store a rough city/country (never the IP address).
- Secrets live only in Vercel environment variables (and a gitignored `.env` locally). The Mapillary token in `src/config.ts` is a public client token by design.
- `npm audit`: 0 known vulnerabilities (keep it that way: run it before releases).
