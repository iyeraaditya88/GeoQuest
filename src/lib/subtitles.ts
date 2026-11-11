// Live subtitles for the narration: a script split into sentences, and when each sentence starts
// in its recording (found from the pauses George leaves between sentences — see scripts/narrate.mts).

/** Split a script into sentences, without breaking on initials ("T. E. Lawrence"). */
export function splitSentences(text: string): string[] {
  const parts = text.trim().split(/(?<=[.?!])\s+(?=[A-Z0-9"“‘'])/);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length && /(^|\s)[A-Z]\.$/.test(out[out.length - 1])) out[out.length - 1] += ` ${p}`;
    else out.push(p);
  }
  return out;
}

export interface Pause { at: number; len: number } // seconds: where speech resumes, and how long the silence was

/**
 * When each sentence starts (ms). Sentence breaks are matched, in order, to the pauses in the
 * recording: long pauses near where the text says a break should fall (by its share of the
 * characters) win over the shorter comma pauses inside long sentences. Missing pauses fall back
 * to that estimate.
 */
export function alignCues(sentences: string[], pauses: Pause[], totalSec: number): number[] {
  const chars = sentences.map((s) => s.length + 2);
  const sum = chars.reduce((a, b) => a + b, 0);
  const expect: number[] = [];
  let acc = 0;
  for (let k = 0; k < sentences.length - 1; k++) { acc += chars[k]; expect.push((acc / sum) * totalSec); }
  const B = expect.length, P = pauses.length;
  if (!B) return [0];
  const SIGMA = Math.max(2.5, totalSec * 0.07);
  const score = (b: number, p: number) => pauses[p].len * Math.exp(-(((pauses[p].at - expect[b]) / SIGMA) ** 2));
  // best[b][p]: the best total for breaks 0..b with break b on pause p (pauses used in order).
  const best = Array.from({ length: B }, () => new Array<number>(P).fill(-Infinity));
  const from = Array.from({ length: B }, () => new Array<number>(P).fill(-1));
  for (let b = 0; b < B; b++) {
    let runMax = -Infinity, runArg = -1;
    for (let p = 0; p < P; p++) {
      if (b === 0) { best[0][p] = score(0, p); continue; }
      if (p > 0 && best[b - 1][p - 1] > runMax) { runMax = best[b - 1][p - 1]; runArg = p - 1; }
      if (runArg >= 0) { best[b][p] = runMax + score(b, p); from[b][p] = runArg; }
    }
  }
  let end = -1, top = -Infinity;
  for (let p = 0; p < P; p++) if (best[B - 1][p] > top) { top = best[B - 1][p]; end = p; }
  const at = expect.slice();
  if (end >= 0 && top > 0.05) {
    for (let b = B - 1, p = end; b >= 0 && p >= 0; p = from[b][p], b--) at[b] = pauses[p].at;
  }
  return [0, ...at.map((s) => Math.round(s * 1000 - 60))];
}

/** Which sentence is being spoken at `ms`. */
export function lineAt(cues: number[], ms: number) {
  let k = 0;
  while (k + 1 < cues.length && cues[k + 1] <= ms) k++;
  return k;
}
