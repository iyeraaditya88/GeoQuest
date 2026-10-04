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

The hosted site (`npm run build` → Vercel, with `api/index.ts` as the API function) sits **entirely behind a sign-in** (`middleware.ts`). Accounts are created by the owner; there is no sign-up.

1. Create a login (the password is typed locally and only its hash is printed):
   ```bash
   npm run user:add -- alice --secret   # --secret also prints a SESSION_SECRET (needed once)
   ```
2. In Vercel → project → Settings → Environment Variables (Production), set:
   - `SESSION_SECRET`: the generated secret (changing it signs everyone out)
   - `GEOQUEST_USERS`: the printed entries, comma-separated (`alice:scrypt:…,bob:scrypt:…`)
3. Redeploy. To add or remove someone, edit `GEOQUEST_USERS` and redeploy.

On the hosted site each user connects **their own** Anthropic key from Ask the Atlas. It's checked with Anthropic and kept encrypted in an httpOnly cookie in their browser, never stored on the server; the owner's key is never used. Locally (`npm run dev`) there's no login and the key lives in `.env` as before.

## Features

### Explore
- **3D globe and flat atlas** (`F` morphs between them). Styles: **Satellite**, **Political** and **Day/Night**, a live view of where it is day and night right now, with city lights on the night side and a marker where the sun is overhead.
- **Rivers, lakes and mountains** (`N`): rivers drawn by importance, terrain relief shaded from real elevation data, range names lettered along each range, major peaks with elevations. Detail is revealed progressively as you zoom.
- **Country panel**: flag, capital, population, area, languages, currency, driving side, calling code, neighbours, longest river and highest peak, plus a GeoGuessr tab of tips. Selecting a country shows its states or provinces and main cities as you zoom in.
- **Ask the Atlas** (`A`): ask anything about a country or the world. Countries in the answer light up on the globe.
- **Antipode finder** (`P`): pick any place, then dig straight through the Earth's core and come out at its exact opposite point.

### Play
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
