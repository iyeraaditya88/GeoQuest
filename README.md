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

## Hosting & accounts (Vercel)

The hosted site sits **entirely behind a sign-in** (`middleware.ts`). Accounts live in a private Vercel Blob store (`server/users.ts`); only password hashes are stored.

- **One-time setup:** connect a *private* Blob store to the project (Vercel → Storage → Create → Blob → Private → connect to this project), then open `https://<OWNER_SETUP_HOST>/setup`, the Vercel-protected address, and choose the owner password.
- **Adding people:** in the app, open **People** (sidebar footer), type a name, then **Create invite** and **Copy**, and send the link. They open it and choose their own password. Links are single-use and expire in 7 days. From the same panel you can issue a new link (which resets a forgotten password) or remove someone, which signs them out at once.
- Env (set already): `OWNER_SETUP_HOST` (protected address for setup) and `PUBLIC_HOST` (domain used in invite links). The session signing key is generated on first use and kept in the private store; set `SESSION_SECRET` to override.

**Live play with friends:** create a free app at [ably.com](https://ably.com), copy its API key (the root key, or one with publish, subscribe, presence and token-request rights), and add it in Vercel → Settings → Environment Variables as `ABLY_API_KEY`, then redeploy. The key stays on the server. Browsers get short-lived tokens that only reach the lobby, their own inbox, and matches they hold a signed ticket for. Until the key is set, **Play with friends** doesn't appear.

On the hosted site each user connects **their own** Anthropic key from Ask the Atlas. It's checked with Anthropic and kept encrypted in an httpOnly cookie in their browser, never stored on the server; the owner's key is never used. Locally (`npm run dev`) there's no login and the key lives in `.env` as before.

## Install as an app (PWA)

GeoQuest installs like a native app on phones, tablets and desktops: in Safari use **Share → Add to Home Screen**, in Chrome or Edge use **Install app**. It opens full-screen with its own icon, keeps clear of notches and home bars, and starts instantly on later visits. The service worker (`public/sw.js`) caches the app page, built assets, textures and map data, and never caches `/api` or the sign-in pages. The app icon is generated from real coastlines with `npx tsx scripts/make-icon.mts`; the sources are in `design/`.

## Features

### Explore
- **3D globe and flat atlas** (`F` morphs between them). Styles: **Satellite**, **Political** and **Day/Night**, a live view of where it is day and night right now, with city lights on the night side and a marker where the sun is overhead.
- **Rivers, lakes and mountains** (`N`): rivers drawn by importance, terrain relief shaded from real elevation data, range names lettered along each range, major peaks with elevations. Detail is revealed progressively as you zoom.
- **Country panel**: flag, capital, population, area, languages, currency, driving side, calling code, neighbours, longest river and highest peak, plus a GeoGuessr tab of tips. Selecting a country shows its states or provinces and main cities as you zoom in.
- **Ask the Atlas** (`A`): ask anything about a country or the world. Countries in the answer light up on the globe.
- **Antipode finder** (`P`): pick any place, then dig straight through the Earth's core and come out at its exact opposite point.

### Play
- **Play with friends**: live head-to-head for up to 6 players.
  - Pick friends who are online and a game, then send the challenge; they get a card with a 30-second timer to accept.
  - Everyone gets the same questions at the same moment, on a live scoreboard. Faster right answers score more.
  - At the end there's a podium and a rematch button. Recent matches and your record against each friend appear in the panel.
  - Works with every game below.
  - Locally there are no keys: open two windows at `?as=alice` and `?as=bob` and they play each other.
- **Map quiz** (`Q`): *Find it*, *Flags* and *GeoGuessr clues*, with streaks.
- **Street View challenge** (`G`): five GeoGuessr-style rounds on real street-level imagery from [Mapillary](https://www.mapillary.com) (falls back to [Panoramax](https://panoramax.fr)). Walk with `W`/`S`, look around with `A`/`D`, and pin your guess on the map.
- **Name the Top 5** (`T`): lenient spelling, judged by meaning when Claude is connected.
- **Capitals** (`C`): country ↔ capital, 10 a round.
- **Geo Trivia** (`I`): adaptive difficulty (Easy → Impossible). Two right in a row levels you up, a miss eases you down. It always shows questions you haven't seen yet. Questions live in `geography_trivia_bank.json`.

## Shortcuts

| Key | Action |
| --- | --- |
| `⌘K` or `/` | Search |
| `R` | Random country |
| `A` | Ask the Atlas |
| `P` | Antipode finder |
| `Q` / `G` / `T` / `C` / `I` | Map quiz / Street View / Top 5 / Capitals / Geo Trivia |
| `F` | Globe ↔ flat atlas |
| `N` | Rivers & mountains on/off |
| `Space` | Pause/resume rotation |
| `[` / `]` | Collapse / expand the sidebar |
| `?` | All shortcuts |
| `Esc` | Close / deselect |

## Data

- `src/data/countries.json`: a snapshot of REST Countries v3.1. `src/data/curated.ts`: hand-curated rivers, peaks and GeoGuessr tips.
- Borders, provinces, cities, rivers, lakes, ranges and peaks: [Natural Earth](https://www.naturalearthdata.com) (public domain).
- Earth textures: three-globe examples / NASA Blue Marble and Black Marble. Flags: flagcdn.com. Maps in Street View: OpenFreeMap.
- `geography_trivia_bank.json`: the Geo Trivia question bank (edit it to add questions).
