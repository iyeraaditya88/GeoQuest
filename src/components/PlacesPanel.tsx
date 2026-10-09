import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Globe2, Loader2, LocateFixed, MapPin, Pencil, Search, Trash2, X } from 'lucide-react';
import { flagUrl } from '../lib/data';
import { describePlace, fmtKm, searchPlaces } from '../lib/antipode';
import { KINDS, kindOf, kmBetween, newPlaceId, usePlaces, type MyPlace, type PlaceKind } from '../lib/places';
import { Click } from '../lib/touch';
import { track } from '../lib/analytics';

const spring = { type: 'spring' as const, stiffness: 320, damping: 30 };
type Draft = { id?: string; lat: number; lng: number; name: string; kind: PlaceKind; note: string };

interface Props {
  /** A point picked on the globe (or null) — opens the editor for a new pin there */
  picked: { lat: number; lng: number; n: number } | null;
  /** A pin tapped on the globe — show that place */
  focus: { id: string; n: number } | null;
  onFly: (lat: number, lng: number) => void;
  /** A new pin being named (shown on the globe until it's saved or dropped) */
  onDraft: (p: { lat: number; lng: number } | null) => void;
  onExit: () => void;
}

/** "My places": pin home, friends and favourite spots on the globe — private to you. */
export function PlacesPanel({ picked, focus, onFly, onDraft, onExit }: Props) {
  const { places, home, put, remove } = usePlaces();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const startNew = (lat: number, lng: number, name?: string) => {
    setError(null);
    // A first pin is most likely home; after that, a favourite.
    setDraft({ lat, lng, name: name ?? '', kind: home ? 'favorite' : 'home', note: '' });
    onFly(lat, lng);
  };
  useEffect(() => { if (picked) startNew(picked.lat, picked.lng); }, [picked?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const p = focus && places.find((x) => x.id === focus.id);
    if (p) { setDraft({ id: p.id, lat: p.lat, lng: p.lng, name: p.name, kind: p.kind, note: p.note ?? '' }); onFly(p.lat, p.lng); }
  }, [focus?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!draft || busy) return;
    const k = kindOf(draft.kind);
    const p: MyPlace = { id: draft.id ?? newPlaceId(), lat: draft.lat, lng: draft.lng, kind: draft.kind, name: draft.name.trim() || k.label, ...(draft.note.trim() ? { note: draft.note.trim() } : {}), at: Date.now() };
    setBusy(true); setError(null);
    try { await put(p); if (!draft.id) track('place', { k: p.kind }); setDraft(null); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };
  const del = async (id: string) => {
    setConfirm(null);
    try { await remove(id); if (draft?.id === id) setDraft(null); } catch (e) { setError((e as Error).message); }
  };

  useEffect(() => { onDraft(draft && !draft.id ? { lat: draft.lat, lng: draft.lng } : null); }, [draft?.id, draft?.lat, draft?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onDraft(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => [...places].sort((a, b) => Number(b.kind === 'home') - Number(a.kind === 'home') || b.at - a.at), [places]);

  return (
    <motion.div className="game-card places" initial={{ y: -30, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -20, opacity: 0, scale: 0.98 }} transition={spring}>
      <header className="gc-head">
        {draft ? <button className="icon-btn" onClick={() => setDraft(null)} aria-label="Back to my places"><ArrowLeft size={17} /></button> : <span className="gc-badge"><MapPin size={16} /></span>}
        <div className="gc-title">
          <b>{draft ? (draft.id ? 'Edit place' : 'New pin') : 'My places'}</b>
          <span>{draft ? describePlace(draft.lat, draft.lng).label : 'Pin the places that matter to you'}</span>
        </div>
        <span className="gc-spacer" />
        <button className="icon-btn" onClick={onExit} aria-label="Close My places"><X size={17} /></button>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        {draft ? (
          <motion.div key="edit" className="pl-edit" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
            <div className="pl-kinds" role="radiogroup" aria-label="What kind of place">
              {KINDS.map((k) => (
                <button key={k.id} role="radio" aria-checked={draft.kind === k.id} className={draft.kind === k.id ? 'on' : ''} onClick={() => setDraft({ ...draft, kind: k.id })} title={k.hint}>
                  <span>{k.emoji}</span>{k.label}
                </button>
              ))}
            </div>
            <label className="pl-field"><span>Name</span>
              <input value={draft.name} maxLength={60} placeholder={kindOf(draft.kind).id === 'friend' ? 'e.g. Snehil’s place' : kindOf(draft.kind).hint}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') void save(); }} autoFocus />
            </label>
            <label className="pl-field"><span>Note <em>optional</em></span>
              <textarea value={draft.note} maxLength={200} rows={2} placeholder="A memory, why it matters, when you’re going…"
                onChange={(e) => setDraft({ ...draft, note: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
            </label>
            {home && home.id !== draft.id && <p className="pl-dist">{fmtKm(kmBetween(home, draft))} from {home.name}</p>}
            {draft.kind === 'home' && home && home.id !== draft.id && <p className="pl-dist">This becomes your Home — {home.name} turns into a Favourite.</p>}
            {error && <p className="pp-error">{error}</p>}
            <div className="pl-actions">
              {draft.id && (confirm === draft.id
                ? <button className="pl-del sure" onClick={() => void del(draft.id!)}>Delete it</button>
                : <button className="pl-del" onClick={() => setConfirm(draft.id!)} aria-label="Delete place"><Trash2 size={15} /></button>)}
              <button className="primary" onClick={() => void save()} disabled={busy}>{busy ? <Loader2 size={15} className="spin" /> : <MapPin size={15} />} {draft.id ? 'Save' : 'Pin it'}</button>
            </div>
            <p className="pl-private">Only you can see your places.</p>
          </motion.div>
        ) : (
          <motion.div key="list" className="pl-list-wrap" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.18 }}>
            <Finder onPick={startNew} />
            <p className="pl-hint"><MapPin size={13} /> …or {Click.toLowerCase()} anywhere on the globe to drop a pin.</p>
            {sorted.length ? (
              <ul className="pl-list">
                {sorted.map((p) => {
                  const k = kindOf(p.kind);
                  const where = describePlace(p.lat, p.lng);
                  return (
                    <li key={p.id}>
                      <button className="pl-row" onClick={() => onFly(p.lat, p.lng)} title="Fly there">
                        <span className={`pl-emoji k-${p.kind}`}>{k.emoji}</span>
                        <span className="pl-text">
                          <b>{p.name}</b>
                          <span>{where.label}{home && home.id !== p.id ? ` · ${fmtKm(kmBetween(home, p))} away` : ''}</span>
                          {p.note && <em>{p.note}</em>}
                        </span>
                      </button>
                      <button className="icon-btn" onClick={() => setDraft({ id: p.id, lat: p.lat, lng: p.lng, name: p.name, kind: p.kind, note: p.note ?? '' })} aria-label={`Edit ${p.name}`}><Pencil size={14} /></button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="pl-empty">
                <span>🏠 👋 ⭐ 📸</span>
                <p>Start with <b>home</b> — then the people and places you love. They’ll stay on your globe.</p>
              </div>
            )}
            {error && <p className="pp-error">{error}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** Search a city or country (or use my location) to drop a pin there. */
function Finder({ onPick }: { onPick: (lat: number, lng: number, name?: string) => void }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const hits = useMemo(() => searchPlaces(q), [q]);
  const input = useRef<HTMLInputElement>(null);
  const choose = (lat: number, lng: number, name?: string) => { onPick(lat, lng, name); setQ(''); setIdx(0); input.current?.blur(); };
  const here = () => {
    if (!navigator.geolocation) { setLocError('Location isn’t available in this browser.'); return; }
    setLocating(true); setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); choose(pos.coords.latitude, pos.coords.longitude); },
      () => { setLocating(false); setLocError('Couldn’t get your location — search or tap the globe instead.'); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };
  return (
    <>
      <div className="pl-find">
        <div className="ap-search">
          <Search size={15} />
          <input ref={input} value={q} placeholder="Search a city or country…" aria-label="Search a place to pin"
            onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, hits.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              if (e.key === 'Enter' && hits[idx]) { e.preventDefault(); choose(hits[idx].lat, hits[idx].lng, hits[idx].kind === 'city' ? hits[idx].name : undefined); }
              if (e.key === 'Escape') { setQ(''); input.current?.blur(); }
            }} />
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
        <button className="ap-chip loc" onClick={here} disabled={locating} title="Pin where I am now">
          <LocateFixed size={13} className={locating ? 'spin-slow' : ''} /> {locating ? 'Locating…' : 'Here'}
        </button>
      </div>
      {locError && <div className="ap-note">{locError}</div>}
    </>
  );
}
