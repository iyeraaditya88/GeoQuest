import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpDown, Drill, Globe2, LocateFixed, MapPin, Search, Waves, X } from 'lucide-react';
import { flagUrl } from '../lib/data';
import { EARTH_R_KM, fmtCoord, fmtKm, journeyAt, searchPlaces, type Place } from '../lib/antipode';

export type AntipodeStage = 'pick' | 'dive' | 'result';

interface Props {
  stage: AntipodeStage;
  from: Place | null;
  to: Place | null;
  /** The dive pushes progress (0→1) here every frame; the HUD writes it straight to the DOM. */
  tick: MutableRefObject<(p: number) => void>;
  onPick: (lat: number, lng: number, name?: string) => void;
  onDig: () => void;
  onSkip: () => void;
  onDigBack: () => void;
  onAgain: () => void;
  onExplore: (cca3: string) => void;
  onExit: () => void;
}

// A few famous pairs to try: Madrid ↔ New Zealand, Hong Kong ↔ Bolivia/Argentina, Honolulu ↔ Botswana…
const QUICK: { name: string; lat: number; lng: number }[] = [
  { name: 'Madrid', lat: 40.4168, lng: -3.7038 },
  { name: 'Hong Kong', lat: 22.3193, lng: 114.1694 },
  { name: 'Shanghai', lat: 31.2304, lng: 121.4737 },
  { name: 'Honolulu', lat: 21.3069, lng: -157.8583 },
  { name: 'New York', lat: 40.7128, lng: -74.006 },
];

const spring = { type: 'spring', stiffness: 320, damping: 30 } as const;

export function AntipodeCard(p: Props) {
  return (
    <AnimatePresence mode="wait">
      {p.stage === 'dive' ? <DiveHud key="hud" {...p} /> : p.stage === 'result' ? <Result key="result" {...p} /> : <Picker key="pick" {...p} />}
    </AnimatePresence>
  );
}

function Header({ title, sub, onExit }: { title: string; sub: string; onExit: () => void }) {
  return (
    <header className="gc-head">
      <span className="gc-badge"><Drill size={15} /></span>
      <div className="gc-title"><b>{title}</b><span>{sub}</span></div>
      <span className="gc-spacer" />
      <button className="icon-btn" onClick={onExit} aria-label="Close antipode finder"><X size={17} /></button>
    </header>
  );
}

function PlaceRow({ place, tone }: { place: Place; tone: 'from' | 'to' }) {
  return (
    <div className={`ap-place ${tone}`}>
      {place.cca2 ? <img src={flagUrl(place.cca2, 80)} alt="" /> : <span className="ap-ocean"><Waves size={16} /></span>}
      <div>
        <b>{place.label}</b>
        <span>{fmtCoord(place.lat, place.lng)}{place.sub ? ` · ${place.sub}` : ''}</span>
      </div>
    </div>
  );
}

// ── 1. Pick a place ───────────────────────────────────────
function Picker({ from, onPick, onDig, onExit }: Props) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const hits = useMemo(() => searchPlaces(q), [q]);
  const input = useRef<HTMLInputElement>(null);

  const choose = (lat: number, lng: number, name?: string) => { onPick(lat, lng, name); setQ(''); setIdx(0); input.current?.blur(); };

  const useMyLocation = () => {
    if (!navigator.geolocation) { setLocError('Location isn’t available in this browser.'); return; }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); choose(pos.coords.latitude, pos.coords.longitude, 'Your location'); },
      () => { setLocating(false); setLocError('Couldn’t get your location — pick a place instead.'); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
  };

  // Enter digs (when nothing is being typed).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && from && !(e.target as HTMLElement)?.closest?.('input')) { e.preventDefault(); onDig(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [from, onDig]);

  return (
    <motion.div className="game-card antipode" initial={{ y: -30, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -20, opacity: 0, scale: 0.98 }} transition={spring}>
      <Header title="Antipode finder" sub="Pick a place — then dig straight through the Earth" onExit={onExit} />

      <div className="ap-explain">
        <span className="ap-explain-icon"><Globe2 size={15} /></span>
        <p>
          A place’s <b>antipode</b> is the point exactly opposite it on the globe — where you’d pop out if you
          dug a straight tunnel through the centre of the Earth. Flip north ↔ south, then go halfway round:
          <span className="ap-eg"> 40° N, 4° W → 40° S, 176° E</span>
        </p>
      </div>

      <div className="ap-search">
        <Search size={15} />
        <input
          ref={input}
          value={q}
          placeholder="Search a city or country…"
          onChange={(e) => { setQ(e.target.value); setIdx(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, hits.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
            if (e.key === 'Enter' && hits[idx]) { e.preventDefault(); choose(hits[idx].lat, hits[idx].lng, hits[idx].kind === 'city' ? hits[idx].name : undefined); }
            if (e.key === 'Escape') { e.stopPropagation(); setQ(''); input.current?.blur(); }
          }}
        />
        <AnimatePresence>
          {hits.length > 0 && (
            <motion.ul className="ap-hits" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
              {hits.map((h, i) => (
                <li key={`${h.name}-${h.lat}`} className={i === idx ? 'on' : ''} onMouseEnter={() => setIdx(i)} onMouseDown={(e) => { e.preventDefault(); choose(h.lat, h.lng, h.kind === 'city' ? h.name : undefined); }}>
                  {h.cca2 ? <img src={flagUrl(h.cca2, 80)} alt="" /> : <Globe2 size={16} />}
                  <b>{h.name}</b><span>{h.sub}</span>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>

      <div className="ap-quick">
        <button className="ap-chip loc" onClick={useMyLocation} disabled={locating}>
          <LocateFixed size={13} className={locating ? 'spin-slow' : ''} /> {locating ? 'Locating…' : 'My location'}
        </button>
        {QUICK.map((c) => <button key={c.name} className="ap-chip" onClick={() => choose(c.lat, c.lng, c.name)}>{c.name}</button>)}
      </div>
      {locError && <div className="ap-note">{locError}</div>}

      <AnimatePresence mode="wait" initial={false}>
        {from ? (
          <motion.div key={`${from.lat},${from.lng}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
            <PlaceRow place={from} tone="from" />
            <div className="ap-note">Click anywhere on the globe to fine-tune the spot.</div>
          </motion.div>
        ) : (
          <motion.div key="empty" className="ap-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <MapPin size={16} /> Click anywhere on the globe, or search above
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button className="primary ap-dig" disabled={!from} onClick={onDig} whileTap={from ? { scale: 0.98 } : undefined}>
        <Drill size={16} /> Dig to the antipode {from && <kbd>↵</kbd>}
      </motion.button>
    </motion.div>
  );
}

// ── 2. The dive: a live readout, written straight to the DOM every frame ──
function DiveHud({ from, tick, onSkip }: Props) {
  const depth = useRef<HTMLSpanElement>(null);
  const layer = useRef<HTMLSpanElement>(null);
  const temp = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLElement>(null);
  const status = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let lastLayer = '';
    tick.current = (p) => {
      const j = journeyAt(p);
      if (depth.current) depth.current.textContent = fmtKm(j.depth);
      if (temp.current) temp.current.textContent = `≈ ${j.tempC.toLocaleString('en-US')} °C`;
      if (bar.current) bar.current.style.transform = `scaleX(${p})`;
      const l = p >= 1 ? 'Surfacing' : j.layer;
      if (l !== lastLayer && layer.current) {
        lastLayer = l;
        layer.current.textContent = l;
        layer.current.dataset.layer = l;
      }
      if (status.current) status.current.textContent = p < 0.02 ? 'Breaking ground…' : p < 0.45 ? 'Going down…' : p < 0.55 ? 'Passing the centre of the Earth!' : p < 1 ? 'Climbing up the other side…' : 'Emerging…';
    };
    return () => { tick.current = () => {}; };
  }, [tick]);

  return (
    <motion.div className="dive-hud" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} transition={spring} role="status">
      <div className="dh-top">
        <span className="dh-status" ref={status}>Breaking ground…</span>
        <button className="dh-skip" onClick={onSkip}>Skip <kbd>Esc</kbd></button>
      </div>
      <div className="dh-main">
        <div className="dh-stat"><small>Depth</small><span ref={depth} className="dh-num">0 km</span></div>
        <div className="dh-stat"><small>Layer</small><span ref={layer} className="dh-layer" data-layer="Crust">Crust</span></div>
        <div className="dh-stat"><small>Temperature</small><span ref={temp} className="dh-num">≈ 15 °C</span></div>
      </div>
      <div className="dh-track">
        <span className="dh-end">{from?.cca2 ? <img src={flagUrl(from.cca2, 80)} alt="" /> : <MapPin size={12} />}</span>
        <div className="dh-bar"><i ref={bar} /><em className="dh-core" title="Centre of the Earth" /></div>
        <span className="dh-end to"><MapPin size={12} /></span>
      </div>
    </motion.div>
  );
}

// ── 3. Where you came out ─────────────────────────────────
function Result({ from, to, onDigBack, onAgain, onExplore, onExit }: Props) {
  if (!from || !to) return null;
  const land = !!to.cca3;
  return (
    <motion.div className="game-card antipode" initial={{ y: -30, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -20, opacity: 0, scale: 0.98 }} transition={spring}>
      <Header title="You came out in…" sub="The exact opposite side of the planet" onExit={onExit} />
      <PlaceRow place={from} tone="from" />
      <div className="ap-through">
        <span><ArrowUpDown size={13} /> {fmtKm(2 * EARTH_R_KM)} straight through the core</span>
        <span className="muted">· {fmtKm(Math.PI * EARTH_R_KM)} around the surface</span>
      </div>
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15, ...spring }}>
        <div className={`ap-badge ${land ? 'land' : 'sea'}`}>{land ? 'Land!' : 'Ocean'}</div>
        <PlaceRow place={to} tone="to" />
      </motion.div>
      <p className="ap-fact">
        {land
          ? 'Lucky dig! Only about 15% of the world’s land has land directly opposite it.'
          : 'Splash! Most places surface in the ocean — only about 15% of land has land on its far side.'}
      </p>
      <div className="ap-actions">
        <button className="ap-btn" onClick={onDigBack}><ArrowUpDown size={14} /> Dig back</button>
        <button className="ap-btn" onClick={onAgain}><MapPin size={14} /> Another place</button>
        {land && to.cca3 && <button className="ap-btn gold" onClick={() => onExplore(to.cca3!)}><Globe2 size={14} /> Explore {to.label.split(', ').pop()}</button>}
      </div>
    </motion.div>
  );
}
