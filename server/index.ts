// Tiny API server: streams Claude answers to the globe UI.
// Credentials: ANTHROPIC_API_KEY from the environment / .env, or a key the user
// pastes into the app (validated, then saved to .env on this machine only).
import 'dotenv/config';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import countries from '../src/data/countries.json' with { type: 'json' };
import { CURATED } from '../src/data/curated';

const ENV_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');

const app = express();
app.use(express.json({ limit: '256kb' }));

const byCca3 = new Map((countries as { cca3: string }[]).map((c) => [c.cca3, c]));

let client: Anthropic | null = null;
let keySource: 'env' | 'app' | null = null;
let aiReady: boolean | null = null;

async function verify(c: Anthropic) {
  await c.models.retrieve('claude-opus-5-5');
}

async function checkAi() {
  if (aiReady !== null) return aiReady;
  try {
    const c = new Anthropic();
    await verify(c);
    client = c;
    keySource = 'env';
    aiReady = true;
  } catch (err) {
    console.warn('[geoquest] Claude unavailable — offline mode until a key is added:', (err as Error).message);
    aiReady = false;
  }
  return aiReady;
}

// Persist a variable in .env (gitignored, readable only by this user).
async function setEnvVar(name: string, value: string | null) {
  let text = '';
  try { text = await readFile(ENV_PATH, 'utf8'); } catch { /* no .env yet */ }
  const lines = text.split('\n').filter((l) => l.trim() && !l.startsWith(`${name}=`));
  if (value) lines.push(`${name}=${value}`);
  await writeFile(ENV_PATH, lines.join('\n') + '\n', 'utf8');
  await chmod(ENV_PATH, 0o600);
}
const saveKeyToEnv = (key: string | null) => setEnvVar('ANTHROPIC_API_KEY', key);

// ── Mapillary (street-level imagery for the Street View challenge) ──
// Mapillary *client* tokens are designed to be used in the browser, so the app
// can read it back; we keep it in .env so it survives restarts.
app.get('/api/mapillary', (_req, res) => {
  res.json({ token: process.env.MAPILLARY_TOKEN || null });
});

app.post('/api/mapillary', async (req, res) => {
  const token = String((req.body as { token?: string })?.token ?? '').trim();
  if (!/^MLY\|\d+\|[0-9a-f]{16,}$/i.test(token)) {
    res.status(400).json({ error: 'That doesn’t look like a Mapillary client token (it starts with MLY|).' });
    return;
  }
  try {
    // The viewer reads images through the Graph API, so check exactly that
    // (a public image), not just that the token is syntactically accepted.
    const url = `https://graph.mapillary.com/500609427720893?access_token=${encodeURIComponent(token)}&fields=id`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) {
      const body = (await r.json().catch(() => ({}))) as { error?: { code?: number } };
      res.status(400).json({
        error: body.error?.code === 100 || r.status === 401 || r.status === 403
          ? 'This token can’t read images. In the Mapillary dashboard, make sure the app has Read access, and copy the Client Token (not the Client Secret).'
          : `Mapillary returned ${r.status} — try again in a moment.`,
      });
      return;
    }
  } catch {
    res.status(400).json({ error: 'Couldn’t reach Mapillary to check the token — try again.' });
    return;
  }
  process.env.MAPILLARY_TOKEN = token;
  try { await setEnvVar('MAPILLARY_TOKEN', token); } catch (err) { console.warn('[geoquest] could not save Mapillary token:', err); }
  res.json({ token });
});

app.delete('/api/mapillary', async (_req, res) => {
  delete process.env.MAPILLARY_TOKEN;
  try { await setEnvVar('MAPILLARY_TOKEN', null); } catch { /* ignore */ }
  res.json({ token: null });
});

app.get('/api/health', async (_req, res) => {
  res.json({ ai: await checkAi(), source: keySource });
});

app.post('/api/key', async (req, res) => {
  const key = String((req.body as { key?: string })?.key ?? '').trim();
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) {
    res.status(400).json({ error: 'That doesn’t look like an Anthropic API key (it should start with sk-ant-).' });
    return;
  }
  const c = new Anthropic({ apiKey: key });
  try {
    await verify(c);
  } catch (err) {
    const msg = err instanceof Anthropic.AuthenticationError ? 'Anthropic rejected this key.'
      : err instanceof Anthropic.PermissionDeniedError ? 'This key doesn’t have access to Claude Opus 5.5.'
        : 'Couldn’t reach Anthropic to check the key — try again.';
    res.status(400).json({ error: msg });
    return;
  }
  client = c;
  keySource = 'app';
  aiReady = true;
  process.env.ANTHROPIC_API_KEY = key;
  try { await saveKeyToEnv(key); } catch (err) { console.warn('[geoquest] could not save key to .env:', err); }
  res.json({ ai: true, source: keySource });
});

app.delete('/api/key', async (_req, res) => {
  client = null;
  keySource = null;
  aiReady = false;
  delete process.env.ANTHROPIC_API_KEY;
  try { await saveKeyToEnv(null); } catch { /* ignore */ }
  res.json({ ai: false, source: null });
});

const SYSTEM = `You are the Atlas inside GeoQuest, an interactive 3D globe for learning geography trivia and getting better at GeoGuessr.

Scope:
- You can answer ANY question the user asks — geography or not (science, history, sport, culture, current events, everyday questions). Be genuinely helpful first.
- When it's natural, add a light geographic angle (where something happened, where it comes from), but never force it.
- Use web search for recent events, live facts, or anything you are unsure about; otherwise answer from knowledge.

Style:
- Accurate and enthusiastic. If a figure is approximate or disputed, say so briefly.
- Keep answers tight: usually 2–6 short sentences or a compact markdown list. Use **bold** for the key answer.
- For geography answers, add one memorable hook or a GeoGuessr clue when useful (script, road lines, bollards, plates, vegetation, architecture, driving side).
- Use markdown lists and bold only; no headings, no tables.

Map control:
- If your answer names specific countries the user would benefit from seeing on the globe, end with ONE final line exactly in the form:
MAP: ISO3,ISO3,ISO3
using ISO 3166-1 alpha-3 codes (max 20). Omit the line when no countries are relevant.`;

interface AskBody {
  messages: { role: 'user' | 'assistant'; content: string }[];
  country?: string | null;
}

app.post('/api/ask', async (req, res) => {
  const { messages, country } = req.body as AskBody;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages required' });
    return;
  }
  if (!(await checkAi()) || !client) {
    res.status(503).json({ error: 'AI not configured' });
    return;
  }
  const ai = client;

  // Ground the model in the selected country's dataset entry.
  const ctx = country && byCca3.get(country)
    ? `\n\nThe user currently has this country selected on the globe (use it when they say "it", "here", "this country"):\n${JSON.stringify({ ...byCca3.get(country), curated: CURATED[country] ?? null })}`
    : '\n\nNo country is selected; the user may be asking about the whole world or about anything at all.';

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  let aborted = false;
  let current: { abort: () => void } | null = null;
  req.on('close', () => { aborted = true; current?.abort(); });

  try {
    const convo: Anthropic.Beta.BetaMessageParam[] = messages.slice(-12).map((m) => ({ role: m.role, content: m.content }));
    // Server-side web search can pause long turns; resume a few times.
    for (let turn = 0; turn < 4 && !aborted; turn++) {
      const stream = ai.beta.messages.stream({
        model: 'claude-opus-5-5',
        max_tokens: 6000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system: SYSTEM + ctx,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
        messages: convo,
      });
      current = stream;
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') res.write(event.delta.text);
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === 'refusal') {
        res.write('\n\nSorry — I can’t help with that one. Try another question!');
        break;
      }
      if (final.stop_reason !== 'pause_turn') break;
      convo.push({ role: 'assistant', content: final.content });
    }
    res.end();
  } catch (err) {
    if (aborted) return;
    if (err instanceof Anthropic.AuthenticationError) { aiReady = false; client = null; keySource = null; }
    const msg = err instanceof Anthropic.RateLimitError
      ? 'The Atlas is a bit busy — try again in a moment.'
      : err instanceof Anthropic.AuthenticationError
        ? 'Your Anthropic key was rejected — reconnect it from the Atlas header.'
        : err instanceof Anthropic.APIError
          ? `The Atlas hit an error (${err.status ?? 'network'}).`
          : 'The Atlas lost its connection.';
    console.error('[geoquest] ask failed:', err);
    if (!res.headersSent) res.status(502).json({ error: msg });
    else res.end(`\n\n_${msg}_`);
  }
});

// ── Lenient answer matching for "Name the Top 5" ─────────────
// Fuzzy matching happens in the browser; this is the fallback for answers that are
// semantically right but spelled/phrased differently ("the big river in Egypt").
app.post('/api/match', async (req, res) => {
  const { guess, options, question } = req.body as { guess?: string; options?: string[]; question?: string };
  if (!guess || !Array.isArray(options) || !options.length) { res.status(400).json({ error: 'guess and options required' }); return; }
  if (!(await checkAi()) || !client) { res.json({ match: null }); return; }
  try {
    const msg = await client.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 1500,
      output_config: { effort: 'low' },
      system: 'You grade answers in a geography trivia game. Be lenient about spelling, abbreviations, alternative or historical names and translations, but do not accept a genuinely different place. Reply with ONLY the exact matching option text, or NONE.',
      messages: [{
        role: 'user',
        content: `Question: ${String(question ?? '').slice(0, 200)}\nOptions:\n${options.slice(0, 10).map((o) => `- ${String(o).slice(0, 80)}`).join('\n')}\nPlayer answered: "${String(guess).slice(0, 80)}"\nWhich option did the player mean?`,
      }],
    });
    if (msg.stop_reason === 'refusal') { res.json({ match: null }); return; }
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    const match = options.find((o) => o.toLowerCase() === text.toLowerCase()) ?? null;
    res.json({ match });
  } catch (err) {
    console.warn('[geoquest] match failed:', (err as Error).message);
    res.json({ match: null });
  }
});

const PORT = Number(process.env.PORT ?? 8787);
// Localhost only: this server holds your API key.
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[geoquest] API on http://127.0.0.1:${PORT}`);
  void checkAi().then((ok) => console.log(`[geoquest] Claude ${ok ? 'connected ✓' : 'not configured — add a key from the app'}`));
});
