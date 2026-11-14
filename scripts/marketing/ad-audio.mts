// The promo ad's sound: George's voiceover (a couple of takes) and a scored instrumental, from
// ElevenLabs. Costs credits — run only when that's been agreed. Never re-makes a file that exists.
//
//   npx tsx scripts/marketing/ad-audio.mts [vo|music|all]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

if (existsSync('.env')) process.loadEnvFile('.env'); // (the key stays in the environment; never printed)
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error('Add ELEVENLABS_API_KEY to .env first.'); process.exit(1); }
const API = 'https://api.elevenlabs.io/v1', VOICE = 'JBFqnCBsd6RMkjVDRZzb'; // George, as in the app
const OUT = join('marketing', 'ad', 'audio');
mkdirSync(OUT, { recursive: true });

export const VO = 'The whole world… is your game board. Every day, a new challenge. Guess the country in six. Chase a thief across the globe. And watch history unfold, narrated, on the map. GeoQuest. Play free, at playgeoquest dot app.';
// Two reads: George as in the app (warm, measured), and a brighter, more upbeat one for an advert.
const TAKES = {
  'vo-warm': { stability: 0.55, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true, speed: 0.95 },
  'vo-bright': { stability: 0.42, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true, speed: 1.02 },
};
const MUSIC = [
  'Premium tech product advert score, modern uplifting electronic, 112 BPM, instrumental, no vocals.',
  '0-3s: airy ambient pad with a rising whoosh and riser. At 3s: a confident drop with punchy kick, pulsing synth bass and bright plucked arpeggio.',
  '3-25s: steady driving groove with light percussion, small lifts every 5 seconds, energetic but leaving room for a voiceover.',
  '25-30s: a final swell and a clean, satisfying ending hit on the last beat. Polished, cinematic, optimistic, like an Apple or Google product launch.',
].join(' ');

const what = process.argv[2] ?? 'all';
let used = 0;
if (what === 'vo' || what === 'all') {
  for (const [name, settings] of Object.entries(TAKES)) {
    const file = join(OUT, `${name}.mp3`);
    if (existsSync(file)) continue;
    const r = await fetch(`${API}/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: VO, model_id: 'eleven_multilingual_v2', voice_settings: settings }),
    });
    if (!r.ok) { console.error(`${name}: ElevenLabs ${r.status} ${(await r.text()).slice(0, 200)}`); continue; }
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    used += VO.length;
    console.log(`${name}: ${VO.length} characters`);
  }
}
if (what === 'music' || what === 'all') {
  for (const name of ['music-a', 'music-b']) {
    const file = join(OUT, `${name}.mp3`);
    if (existsSync(file)) continue;
    const r = await fetch(`${API}/music?output_format=mp3_44100_192`, {
      method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ prompt: MUSIC, music_length_ms: 30000, force_instrumental: true }),
    });
    if (!r.ok) { console.error(`${name}: ElevenLabs ${r.status} ${(await r.text()).slice(0, 300)}`); break; }
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    console.log(`${name}: 30 s of music`);
  }
}
console.log(`voiceover characters used this run: ${used}`);
