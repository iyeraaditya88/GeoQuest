// Narration, recorded once with ElevenLabs (see narration/voice.md).
//
//   npx tsx scripts/narrate.mts --audition            the same paragraph in a few calm voices → narration/audition/
//   npx tsx scripts/narrate.mts --sample <voiceId> [prefix]   every clip (or those starting with prefix) in narration/scripts/sample.json → narration/sample/
//   npx tsx scripts/narrate.mts --record <set>        narration/scripts/<set>.json → narration/out/ (+ manifest.json)
//   npx tsx scripts/narrate.mts --upload              narration/out + sounds → the public narration Blob store
//   npx tsx scripts/narrate.mts --sfx                 the sound effects in narration/sfx.json → narration/sfx/
//
// Needs ELEVENLABS_API_KEY in .env (read here at run time, never printed). Files land in folders
// that git ignores; nothing is uploaded yet.
import 'dotenv/config';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { alignCues, splitSentences, type Pause } from '../src/lib/subtitles.ts';

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error('Add ELEVENLABS_API_KEY to .env first (and keep it out of chat).'); process.exit(1); }
const API = 'https://api.elevenlabs.io/v1';
const MODEL = 'eleven_multilingual_v2';
// Calm and unhurried: steady, a touch slower than conversation.
const VOICE = 'JBFqnCBsd6RMkjVDRZzb'; // George, chosen at the audition
// A touch slower again after recording, pitch kept (ffmpeg atempo): 0.94 (0.92 felt a tad slow, 0.86 stretched).
const TEMPO = 0.94;
const SETTINGS = { stability: 0.62, similarity_boost: 0.78, style: 0.12, use_speaker_boost: true, speed: 0.84 };

async function speak(voiceId: string, text: string): Promise<Buffer> {
  const r = await fetch(`${API}/text-to-speech/${voiceId}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY!, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: SETTINGS }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

interface Voice { voice_id: string; name: string; category?: string; labels?: Record<string, string>; description?: string }
async function voices(): Promise<Voice[]> {
  const r = await fetch(`${API}/voices`, { headers: { 'xi-api-key': KEY! } });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return ((await r.json()) as { voices: Voice[] }).voices;
}

/** The silences in a clip (where speech resumes, and for how long it paused), for the subtitles. */
function pauses(file: string): Pause[] {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'silencedetect=noise=-38dB:d=0.18', '-f', 'null', '-'], { encoding: 'utf8' });
  return [...r.stderr.matchAll(/silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/g)].map((m) => ({ at: +m[1], len: +m[2] }));
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const mode = process.argv[2];

if (mode === '--audition') {
  const scripts = JSON.parse(await readFile('narration/scripts/sample.json', 'utf8')) as Record<string, string>;
  const text = scripts['voyage:magellan-elcano:intro'];
  // The calm, story-telling voices first (by the labels ElevenLabs gives them).
  const score = (v: Voice) => {
    const l = `${Object.values(v.labels ?? {}).join(' ')} ${v.description ?? ''}`.toLowerCase();
    return (/calm|sooth|warm|gentle|relax/.test(l) ? 3 : 0) + (/narrat|audiobook|story|documentar/.test(l) ? 2 : 0) + (/middle|old/.test(l) ? 1 : 0);
  };
  const pick = (await voices()).sort((a, b) => score(b) - score(a)).slice(0, 4);
  await mkdir('narration/audition', { recursive: true });
  for (const v of pick) {
    const file = `narration/audition/${slug(v.name)}.mp3`;
    await writeFile(file, await speak(v.voice_id, text));
    console.log(`${file}  ·  ${v.name} (${v.voice_id})  ·  ${Object.values(v.labels ?? {}).join(', ')}`);
  }
} else if (mode === '--sample') {
  const voiceId = process.argv[3];
  const only = process.argv[4]; // optional id prefix, e.g. ww2: to re-record just those
  if (!voiceId) { console.error('Usage: --sample <voiceId>  (from the audition list)'); process.exit(1); }
  const scripts = JSON.parse(await readFile('narration/scripts/sample.json', 'utf8')) as Record<string, string>;
  await mkdir('narration/sample', { recursive: true });
  for (const [id, text] of Object.entries(scripts)) {
    if (only && !id.startsWith(only)) continue;
    const file = `narration/sample/${slug(id)}.mp3`;
    await writeFile(file, await speak(voiceId, text));
    console.log(file);
  }
} else if (mode === '--record') {
  // The real thing: every clip in narration/scripts/<set>.json, in the chosen voice → narration/out/.
  // Files are named by a hash of voice + settings + text, so a re-run only records lines that changed.
  const set = process.argv[3], voiceId = process.argv[4] ?? VOICE;
  if (!set) { console.error('Usage: --record <wars|battles|voyages> [voiceId]'); process.exit(1); }
  const scripts = JSON.parse(await readFile(`narration/scripts/${set}.json`, 'utf8')) as Record<string, { text: string; bed?: string; hit?: string; cams?: Record<string, unknown>; marks?: Record<string, unknown> }>;
  await mkdir('narration/out', { recursive: true });
  const mPath = 'narration/out/manifest.json';
  const manifest: Record<string, { file: string; ms: number; lines?: string[]; cues?: number[]; bed?: string; hit?: string; cams?: Record<string, unknown>; marks?: Record<string, unknown> }> = existsSync(mPath) ? JSON.parse(await readFile(mPath, 'utf8')) : {};
  await mkdir('narration/out/raw', { recursive: true });
  let made = 0, chars = 0;
  for (const [id, c] of Object.entries(scripts)) {
    const h = createHash('sha1').update(JSON.stringify([voiceId, MODEL, SETTINGS, c.text])).digest('hex').slice(0, 10);
    const raw = `narration/out/raw/${slug(id)}-${h}.mp3`; // as ElevenLabs made it (the paid part, kept)
    const file = `${slug(id)}-${h}-t${Math.round(TEMPO * 100)}.mp3`;
    if (!existsSync(raw)) {
      await writeFile(raw, await speak(voiceId, c.text));
      made++; chars += c.text.length;
    }
    if (!existsSync(`narration/out/${file}`)) {
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', raw, '-filter:a', `atempo=${TEMPO}`, '-ac', '1', '-b:a', '64k', `narration/out/${file}`]);
    }
    const bytes = (await readFile(`narration/out/${file}`)).length;
    const ms = Math.round((bytes * 8) / 64); // 64 kbps CBR
    const lines = splitSentences(c.text);
    const cues = alignCues(lines, pauses(`narration/out/${file}`), ms / 1000);
    manifest[id] = { file, ms, lines, cues, ...(c.bed && { bed: c.bed }), ...(c.hit && { hit: c.hit }), ...(c.cams && { cams: c.cams }), ...(c.marks && { marks: c.marks }) }; // cams: where the camera goes, by sentence; marks: what appears
    process.stdout.write('.');
  }
  await writeFile(mPath, JSON.stringify(manifest, null, 1) + '\n');
  console.log(`\n${set}: ${Object.keys(scripts).length} clips, ${made} recorded (${chars} chars)`);
} else if (mode === '--upload') {
  // Everything in narration/out (+ the sounds) → the public narration Blob store, which the site
  // serves at /narration/ (a rewrite in vercel.json). Clips are named by their content, so they
  // never change once uploaded (cached for a year); the manifest is re-sent each time (short cache).
  const token = process.env.NARRATE_BLOB_READ_WRITE_TOKEN;
  if (!token) { console.error('Add NARRATE_BLOB_READ_WRITE_TOKEN to .env first (from the narration-blob store page; keep it out of chat).'); process.exit(1); }
  const { list, put } = await import('@vercel/blob');
  const have = new Set<string>();
  let cursor: string | undefined;
  do { const r = await list({ prefix: 'narration/', cursor, token }); r.blobs.forEach((b) => have.add(b.pathname)); cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
  const manifest = JSON.parse(await readFile('narration/out/manifest.json', 'utf8')) as Record<string, { file: string; bed?: string; hit?: string }>;
  const files = new Map<string, string>(); // pathname → local file
  for (const c of Object.values(manifest)) {
    files.set(`narration/${c.file}`, `narration/out/${c.file}`);
    for (const s of [c.bed, c.hit]) if (s) files.set(`narration/sfx/${s}.mp3`, `narration/sfx/${s}.mp3`);
  }
  let sent = 0, host = '';
  for (const [pathname, local] of files) {
    if (have.has(pathname)) continue;
    const r = await put(pathname, await readFile(local), { access: 'public', token, contentType: 'audio/mpeg', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 31_536_000 });
    host = new URL(r.url).host; sent++;
    process.stdout.write('.');
  }
  const r = await put('narration/manifest.json', JSON.stringify(manifest), { access: 'public', token, contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 300 });
  host ||= new URL(r.url).host;
  console.log(`\n${sent} new files (${files.size - sent} already there) + manifest → https://${host}/narration/`);
} else if (mode === '--sfx') {
  // Sound effects, described in narration/sfx.json: beds loop under the voice, one-shots don't.
  const list = JSON.parse(await readFile('narration/sfx.json', 'utf8')) as Record<string, { text: string; seconds: number; loop: boolean }>;
  await mkdir('narration/sfx', { recursive: true });
  const only = process.argv[3]?.split(','); // optional: just these ids
  for (const [id, s] of Object.entries(list)) {
    if (only && !only.includes(id)) continue;
    const r = await fetch(`${API}/sound-generation?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': KEY!, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: s.text, duration_seconds: s.seconds, prompt_influence: 0.45, loop: s.loop, model_id: 'eleven_text_to_sound_v2' }),
    });
    if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
    await writeFile(`narration/sfx/${id}.mp3`, Buffer.from(await r.arrayBuffer()));
    console.log(`narration/sfx/${id}.mp3`);
  }
} else {
  console.error('Usage: npx tsx scripts/narrate.mts --audition | --sample <voiceId> [prefix] | --sfx');
  process.exit(1);
}
