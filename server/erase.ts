// "Delete my account": everything kept about a player, gone — their places, favourites, last-seen,
// reminder devices, Daily and Geo Wordle results and streak, game progress (the mystery rank), and
// their visits in Activity. Their name stays only
// in other players' match history, and feedback they sent stays with the owner (the privacy page
// says so).
import { readFile } from 'node:fs/promises';
import { blobEnabled, deleteBlobs, listBlobPaths, writeLocalFile } from './storage.js';

async function editLocal<T>(file: string, fn: (all: T) => void) {
  let all: T;
  try { all = JSON.parse(await readFile(file, 'utf8')) as T; } catch { return; } // nothing stored
  fn(all);
  await writeLocalFile(file, JSON.stringify(all));
}

export async function eraseUserData(user: string) {
  if (blobEnabled()) {
    const fixed = [`places/${user}.json`, `prefs/${user}.json`, `seen/${user}.json`, `streak/${user}.json`, `push/${user}.json`, `progress/${user}.json`];
    const [daily, wordle, visits] = await Promise.all([listBlobPaths('daily/'), listBlobPaths('wordle/'), listBlobPaths('analytics/')]);
    const theirs = [
      ...[...daily, ...wordle].filter((p) => p.endsWith(`/${user}.json`)), // daily|wordle/<date>/<user>.json
      ...visits.filter((p) => p.split('/')[2] === user), // analytics/<day>/<user>/<sid>.json
    ];
    try { await deleteBlobs([...fixed, ...theirs]); }
    catch { for (const p of [...fixed, ...theirs]) await deleteBlobs([p]).catch(() => null); } // one by one, skipping any that aren't there
    return;
  }
  const env = process.env;
  await editLocal<Record<string, unknown>>(env.GQ_PLACES_FILE ?? '.places.local.json', (all) => { delete all[user]; });
  await editLocal<Record<string, unknown>>(env.GQ_PREFS_FILE ?? '.prefs.local.json', (all) => { delete all[user]; });
  await editLocal<Record<string, unknown>>(env.GQ_PUSH_FILE ?? '.push.local.json', (all) => { delete all[user]; });
  await editLocal<{ results?: Record<string, unknown>; streaks?: Record<string, unknown> }>(env.GQ_DAILY_FILE ?? '.daily.local.json', (d) => {
    for (const k of Object.keys(d.results ?? {})) if (k.endsWith(`/${user}`)) delete d.results![k];
    delete d.streaks?.[user];
  });
  await editLocal<{ results?: Record<string, unknown> }>(env.GQ_WORDLE_FILE ?? '.wordle.local.json', (d) => {
    for (const k of Object.keys(d.results ?? {})) if (k.endsWith(`/${user}`)) delete d.results![k];
  });
  await editLocal<Record<string, { user?: string }>>(env.GQ_ANALYTICS_FILE ?? '.analytics.local.json', (all) => {
    for (const [sid, s] of Object.entries(all)) if (s.user === user) delete all[sid];
  });
}
