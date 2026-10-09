# GeoQuest

An interactive 3D globe for learning geography, playing geography games and levelling up at GeoGuessr.

## Run it

```bash
npm install
cp .env.example .env   # then paste your Anthropic API key into .env (optional)
npm run dev            # http://localhost:5173
```

`npm run dev` starts two things: the Vite web app on :5173 and a small API server on 127.0.0.1:8787 that streams answers from Claude (with web search for current events) and grades fuzzy game answers.

No key yet? Open **Ask the Atlas → Connect Claude** and paste your key. The server checks it with Anthropic and saves it to this project's `.env` (gitignored, readable only by you); the browser never stores it. Without a key, the Atlas still answers data questions offline (capitals, populations, borders, superlatives, driving side, landlocked countries, languages).

## Checks

```bash
npm test            # unit + API + live-match tests (Vitest)
npm run typecheck   # app and server
npm run check       # typecheck, lint and tests together — run before pushing
```

The API tests start the real server in hosted mode against temporary files: sign-in, invites, session revocation, cross-site blocking, live-play tickets, favourites, input validation and rate limits. `npm run build && npx vite preview` serves the production build with the same security headers as Vercel (from `vercel.json`).

## Code layout

- `src/` — the app (React + three.js). `components/` are UI; `lib/` holds the logic (data, map layers, games, live play) and is unit-tested.
- `server/` — the API (Express). `app.ts` wires it together; `routes/` has auth, live play and AI; `users.ts`, `matches.ts`, `prefs.ts` are the stores; `storage.ts` wraps private Blob storage; `session.ts` signs sessions and seals keys (Web Crypto, shared with `middleware.ts`).
- `api/index.ts` runs the server as a Vercel function; `middleware.ts` puts the whole site behind sign-in.

## Security

- **Sign-in:** every page and API call needs a signed session cookie (HttpOnly, Secure, SameSite=Lax, 30 days). Passwords are scrypt-hashed; invite links are single-use and stored only as hashes. Re-inviting someone (a password reset) signs out all their old sessions.
- **Requests:** writes from other sites are refused (Origin check). Inputs are validated and size-limited; sign-in and API calls are rate-limited. Server errors never reveal internals.
- **Browser:** a Content-Security-Policy allows scripts only from this site (`'unsafe-eval'` is needed by MapillaryJS), no framing, and no plugins; plus `nosniff`, HSTS, a strict referrer policy and a Permissions-Policy.
- **Keys:** the owner's Anthropic key (`ANTHROPIC_API_KEY` in Vercel) serves every player, server-side only — it never reaches a browser. Every call uses Claude Haiku 5.5 (no fallbacks to other models), with a per-player cap of 40 questions per 10 minutes and 150 a day. Without that variable, players can connect their own key, encrypted (AES-GCM) into an HttpOnly cookie, never stored on the server. Live-play tokens only reach the lobby, your own inbox, and matches you hold a signed ticket for.
- **Data:** account changes use conditional writes, so two changes at once can't undo each other and a failed read can never wipe the accounts.

## Hosting & accounts (Vercel)

The hosted site sits **entirely behind a sign-in** (`middleware.ts`). Accounts live in a private Vercel Blob store (`server/users.ts`); only password hashes are stored.

- **One-time setup:** connect a *private* Blob store to the project (Vercel → Storage → Create → Blob → Private → connect to this project), then open `https://<OWNER_SETUP_HOST>/setup`, the Vercel-protected address, and choose the owner password.
- **Adding people:** in the app, open **People** (sidebar footer), type a name, then **Create invite** and **Copy**, and send the link. They open it and choose their own password. Links are single-use and expire in 7 days. From the same panel you can issue a new link (which resets a forgotten password) or remove someone, which signs them out at once.
- Env (set already): `OWNER_SETUP_HOST` (protected address for setup) and `PUBLIC_HOST` (domain used in invite links). The session signing key is generated on first use and kept in the private store; set `SESSION_SECRET` to override.

**Live play with friends:** create a free app at [ably.com](https://ably.com), copy its API key (the root key, or one with publish, subscribe, presence and token-request rights), and add it in Vercel → Settings → Environment Variables as `ABLY_API_KEY`, then redeploy. The key stays on the server. Browsers get short-lived tokens that only reach the lobby, their own inbox, and matches they hold a signed ticket for. Until the key is set, **Play with friends** doesn't appear.

On the hosted site, set `ANTHROPIC_API_KEY` in Vercel (Settings → Environment Variables) and redeploy: everyone then uses the Atlas without being asked for a key, on Claude Haiku 5.5 only. Without it, each user can connect **their own** key from Ask the Atlas (encrypted in an httpOnly cookie in their browser, never stored on the server). Locally (`npm run dev`) there's no login and the key lives in `.env` as before.

## Install as an app (PWA)

GeoQuest installs like a native app on phones, tablets and desktops: in Safari use **Share → Add to Home Screen**, in Chrome or Edge use **Install app**. It opens full-screen with its own icon, keeps clear of notches and home bars, and starts instantly on later visits. The service worker (`public/sw.js`) caches the app page, built assets, textures and map data, and never caches `/api` or the sign-in pages. The app icon is generated from real coastlines with `npx tsx scripts/make-icon.mts`; the sources are in `design/`.

## Features

### Explore
- **3D globe and flat atlas**. Styles: **Satellite**, **Political** and **Day/Night**, a live view of where it is day and night right now, with city lights on the night side and a marker where the sun is overhead.
- **Rivers, lakes and mountains**: rivers drawn by importance, terrain relief shaded from real elevation data, range names lettered along each range, major peaks with elevations. Detail is revealed progressively as you zoom.
- **Country panel**: flag, capital, population, area, languages, currency, driving side, calling code, neighbours, longest river and highest peak, plus a GeoGuessr tab of tips. Selecting a country shows its states or provinces and main cities as you zoom in.
- **Ask the Atlas**: ask anything about a country or the world. Countries in the answer light up on the globe.
- **Antipode finder**: pick any place, then dig straight through the Earth's core and come out at its exact opposite point.

### Play
- **Play with friends**: live head-to-head for up to 6 players.
  - Pick friends who are online and a game, then send the challenge; they get a card with a 30-second timer to accept.
  - Everyone gets the same questions at the same moment, on a live scoreboard. Faster right answers score more.
  - At the end there's a podium and a rematch button. Recent matches and your record against each friend appear in the panel.
  - Works with every game below.
  - Locally there are no keys: open two windows at `?as=alice` and `?as=bob` and they play each other.
- **Map quiz**: *Find it*, *Flags* and *GeoGuessr clues*, with streaks.
- **Street View challenge**: five GeoGuessr-style rounds on real street-level imagery from [Mapillary](https://www.mapillary.com) (falls back to [Panoramax](https://panoramax.fr)). Drag to look around, tap the road to step (double-tap to go further, or hold the arrows), and pin your guess on the map.
- **Name the Top 5**: lenient spelling, judged by meaning when Claude is connected.
- **Capitals**: country ↔ capital, 10 a round.
- **Geo Trivia**: adaptive difficulty (Easy → Impossible). Two right in a row levels you up, a miss eases you down. It always shows questions you haven't seen yet. Questions live in `geography_trivia_bank.json`.

## Keyboard

`⌘K` (or `Ctrl+K`, or `/`) opens search, and `Esc` closes whatever is open. There are no other shortcuts.

## Data

- `src/data/countries.json`: a snapshot of REST Countries v3.1. `src/data/curated.ts`: hand-curated rivers, peaks and GeoGuessr tips.
- Borders, provinces, cities, rivers, lakes, ranges and peaks: [Natural Earth](https://www.naturalearthdata.com) (public domain).
- Earth textures: three-globe examples / NASA Blue Marble and Black Marble. Flags: flagcdn.com. Maps in Street View: OpenFreeMap.
- `geography_trivia_bank.json`: the Geo Trivia question bank (edit it to add questions).
