import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Eye, RotateCcw, Shapes, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { geoCentroid, geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { BY_CCA3, FEATURES, FEATURES_110, flagUrl } from '../lib/data';
import { TRIES, ZOOM, guessClue, matchGuess, nearbyCapitals, newShapeRound, shapePoints, stageClue, suggest } from '../lib/shapes';
import { track } from '../lib/analytics';
import { resultText, shapesShare } from '../lib/share';
import { ShareButton } from './ShareButton';

interface Props {
  /** Fly the globe to the answer (and highlight it) */
  onReveal: (cca3: string) => void;
  onExit: () => void;
}
type Status = 'playing' | 'solved' | 'revealed';
interface Turn { target: string; misses: number; guesses: { cca3: string; clue: string }[]; status: Status }

const W = 400, H = 260, PAD = 22;
const fresh = (target: string): Turn => ({ target, misses: 0, guesses: [], status: 'playing' });

/** Guess the Country: name it from its outline; every miss pulls the view back and adds a clue. */
export function ShapeGame({ onReveal, onExit }: Props) {
  const [targets, setTargets] = useState(newShapeRound);
  const [i, setI] = useState(0);
  const [turn, setTurn] = useState<Turn>(() => fresh(targets[0]));
  const [points, setPoints] = useState<number[]>([]);
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const finished = points.length >= targets.length;
  const t = BY_CCA3.get(turn.target)!;
  const over = turn.status !== 'playing';
  const options = useMemo(() => (over ? [] : suggest(text).filter((c) => !turn.guesses.some((g) => g.cca3 === c.cca3))), [text, over, turn.guesses]);

  useEffect(() => { if (window.matchMedia('(hover: hover)').matches) field.current?.focus(); }, [i]);

  const finish = (status: Status, misses: number) => {
    setTurn((tn) => ({ ...tn, status, misses }));
    setPoints((p) => [...p, shapePoints(misses, status === 'solved')]);
    onReveal(turn.target);
    if (status === 'solved' && misses <= 1) confetti({ particleCount: 80, spread: 70, origin: { y: 0.25 }, colors: ['#fde68a', '#34d399', '#7dd3fc'], disableForReducedMotion: true });
  };
  const guess = (raw: string) => {
    if (over) return;
    const c = matchGuess(raw) ?? suggest(raw, 1)[0] ?? null;
    if (!c) { setNote('Pick a country from the suggestions.'); return; }
    if (turn.guesses.some((g) => g.cca3 === c.cca3)) { setNote(`You’ve already tried ${c.name}.`); return; }
    setText(''); setNote(null);
    if (c.cca3 === turn.target) { finish('solved', turn.misses); return; }
    const misses = turn.misses + 1;
    const guesses = [...turn.guesses, { cca3: c.cca3, clue: guessClue(turn.target, c.cca3) }];
    if (misses >= TRIES) { setTurn((tn) => ({ ...tn, guesses })); finish('revealed', misses); return; }
    setTurn((tn) => ({ ...tn, misses, guesses }));
    field.current?.focus();
  };
  const next = () => {
    const n = i + 1;
    setI(n);
    if (n < targets.length) { setTurn(fresh(targets[n])); setText(''); setNote(null); }
  };
  const again = () => {
    const ts = newShapeRound();
    track('game', { g: 'shapes' });
    setTargets(ts); setI(0); setTurn(fresh(ts[0])); setPoints([]); setText(''); setNote(null);
  };
  const total = points.reduce((s, p) => s + p, 0);
  useEffect(() => { if (finished) track('score', { g: 'shapes', s: total, of: targets.length * TRIES }); }, [finished, total, targets.length]);

  return (
    <motion.div className="game-card shapes" initial={{ y: -30, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -20, opacity: 0, scale: 0.98 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
      <header className="gc-head">
        <span className="gc-badge sg-badge"><Shapes size={15} /></span>
        <div className="gc-title">
          <b>Guess the Country</b>
          <span>{finished ? 'Round complete' : `Country ${i + 1} of ${targets.length} · ${total} pts`}</span>
        </div>
        <span className="gc-spacer" />
        <button className="icon-btn" onClick={onExit} aria-label="Close game"><X size={17} /></button>
      </header>

      <AnimatePresence mode="wait">
        {!finished ? (
          <motion.div key={`${targets[0]}-${i}`} className="sg-body" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
            <ShapeMap target={turn.target} misses={over ? Math.max(turn.misses, 2) : turn.misses} reveal={over} />

            <div className="sg-tries" aria-label={`${TRIES - turn.misses} tries left`}>
              {Array.from({ length: TRIES }, (_, k) => <i key={k} className={k < turn.misses ? 'miss' : over && k === turn.misses && turn.status === 'solved' ? 'hit' : ''} />)}
              <span>{over ? '' : `${TRIES - turn.misses} ${TRIES - turn.misses === 1 ? 'try' : 'tries'} left · worth ${shapePoints(turn.misses, true)} pts`}</span>
            </div>

            {!over ? (
              <>
                <p className="sg-clue">{stageClue(turn.target, turn.misses)}</p>
                <form className="sg-guess" onSubmit={(e) => { e.preventDefault(); guess(text); }}>
                  <input ref={field} id="sg-input" value={text} onChange={(e) => { setText(e.target.value); setNote(null); }} placeholder="Type a country…" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="go" aria-label="Your guess" />
                  <button type="submit" className="sg-go" disabled={!text.trim()} aria-label="Guess"><ArrowRight size={17} /></button>
                </form>
                {options.length > 0 && (
                  <div className="sg-options" role="listbox" aria-label="Suggestions">
                    {options.map((c) => (
                      <button key={c.cca3} type="button" role="option" aria-selected={false} onClick={() => guess(c.name)}><img src={flagUrl(c.cca2, 80)} alt="" /> {c.name}</button>
                    ))}
                  </div>
                )}
                {note && <p className="sg-note">{note}</p>}
                <div className="sg-foot">
                  <button className="skip" onClick={() => finish('revealed', turn.misses)}><Eye size={13} /> Show me</button>
                </div>
              </>
            ) : (
              <div className={`sg-answer ${turn.status}`}>
                <img src={flagUrl(t.cca2, 160)} alt="" />
                <div>
                  <b>{turn.status === 'solved' ? `✓ ${t.name}` : t.name}</b>
                  <span>{turn.status === 'solved' ? `+${shapePoints(turn.misses, true)} pts${turn.misses === 0 ? ' — first look!' : ''}` : 'Have a look on the globe'}{t.capital[0] ? ` · Capital: ${t.capital[0]}` : ''}</span>
                </div>
                <button className="primary sm" onClick={next} autoFocus>{i + 1 >= targets.length ? 'See score' : 'Next'} <ArrowRight size={14} /></button>
              </div>
            )}

            {turn.guesses.length > 0 && (
              <ul className="sg-history">
                {[...turn.guesses].reverse().map((g) => {
                  const c = BY_CCA3.get(g.cca3);
                  return <li key={g.cca3}><span className="sg-x">✗ {c?.name}</span><span>{g.clue}</span></li>;
                })}
              </ul>
            )}
          </motion.div>
        ) : (
          <motion.div key="done" className="sg-done" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
            <span className="t5-score">{total}<small>/{targets.length * TRIES}</small></span>
            <span className="t5-verdict">{total >= 22 ? 'Map master!' : total >= 16 ? 'Sharp eye.' : total >= 9 ? 'Nicely done.' : 'Shapes are tricky — try another round!'}</span>
            <ul className="sg-recap">
              {targets.map((c, k) => {
                const ct = BY_CCA3.get(c);
                return <li key={c}><img src={flagUrl(ct?.cca2 ?? '', 80)} alt="" /><span>{ct?.name}</span><b className={points[k] ? '' : 'zero'}>{points[k] ?? 0}</b></li>;
              })}
            </ul>
            <div className="sg-done-actions">
              <ShareButton game="shapes" label="Share" className="share-sm" text={() => resultText('shapes', shapesShare(targets.map((_, k) => points[k] ?? 0), shapePoints(0, true)))} />
              <button className="primary sm" onClick={again} autoFocus><RotateCcw size={14} /> Play again</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── The map: the outline, then (as clues unlock) its surroundings, the coast and nearby capitals ──
const SHAPES = new Map<string, GeoJSON.Feature[]>();
for (const f of FEATURES) if (f.properties.cca3) SHAPES.set(f.properties.cca3, [...(SHAPES.get(f.properties.cca3) ?? []), f as unknown as GeoJSON.Feature]);
const CONTEXT = FEATURES_110 as unknown as (GeoJSON.Feature & { properties: { cca3: string | null } })[];

function ShapeMap({ target, misses, reveal }: { target: string; misses: number; reveal: boolean }) {
  const shape = useMemo<GeoJSON.FeatureCollection>(() => ({ type: 'FeatureCollection', features: SHAPES.get(target) ?? [] }), [target]);
  const center = useMemo(() => geoCentroid(shape), [shape]);
  // The scale that makes the country fill the frame (zoom 1).
  const fitScale = useMemo(() => geoOrthographic().rotate([-center[0], -center[1]]).clipAngle(90).fitExtent([[PAD, PAD], [W - PAD, H - PAD]], shape).scale(), [shape, center]);
  const want = fitScale / ZOOM[Math.min(misses, ZOOM.length - 1)];
  // Pull back smoothly to each new view. (Each country mounts a fresh map, so it starts close up.)
  const [scale, setScale] = useState(want);
  const from = useRef(want);
  useEffect(() => {
    const start = performance.now(), a = from.current, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || a === want) { from.current = want; setScale(want); return; }
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 700), e = 1 - (1 - k) ** 3;
      const s = a + (want - a) * e;
      from.current = s; setScale(s);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [want]);

  const proj = geoOrthographic().rotate([-center[0], -center[1]]).clipAngle(90).translate([W / 2, H / 2]).scale(scale);
  const path = geoPath(proj);
  const showContext = misses >= 1 || reveal;
  const showLand = misses >= 2 || reveal;
  const cities = misses >= 3 && !reveal ? nearbyCapitals(target) : [];

  return (
    <div className={`sg-map ${showContext ? 'wide' : ''}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="The mystery country’s outline">
        {showContext && <path d={path({ type: 'Sphere' }) ?? ''} className="sg-sea" />}
        {showContext && <path d={path(geoGraticule10()) ?? ''} className="sg-grid" />}
        {showContext && CONTEXT.filter((f) => f.properties.cca3 !== target).map((f, k) => <path key={k} d={path(f) ?? ''} className={showLand ? 'sg-land' : 'sg-near'} />)}
        <path d={path(shape) ?? ''} className="sg-target" />
        {cities.map((c) => {
          if (geoDistance([c.lng, c.lat], center) > Math.PI / 2 - 0.05) return null;
          const xy = proj([c.lng, c.lat]);
          if (!xy || xy[0] < 4 || xy[0] > W - 4 || xy[1] < 4 || xy[1] > H - 4) return null;
          return (
            <g key={c.city} className="sg-city">
              <circle cx={xy[0]} cy={xy[1]} r={3.2} />
              <text x={xy[0] + 6} y={xy[1] + 4}>{c.city}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
