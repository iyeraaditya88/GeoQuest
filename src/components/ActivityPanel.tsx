import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, BarChart3, Bell, ChevronDown, Loader2, Monitor, RotateCw, Smartphone, Tablet, X } from 'lucide-react';
import { api } from '../lib/api';
import { BY_CCA3, fmtInt } from '../lib/data';

type Data = Record<string, string | number>;
type Event = [at: number, name: string, data?: Data];
interface Place { city?: string; region?: string; country?: string }
interface Session { sid: string; user: string; start: number; last: number; active: number; device: string; os: string; browser: string; pwa: boolean; place?: Place; events: Event[] }

/** 🇮🇳 from "IN" */
const flag = (cc?: string) => (cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '');
/** "Bengaluru, IN" — roughly where a visit came from (city-level; mobile data can show the operator's hub city) */
const placeLabel = (p?: Place) => (p ? [p.city, p.country].filter(Boolean).join(', ') : '');
interface Person { name: string; role: string; status: string; createdAt: number; lastLogin: number | null }

const RANGES = [{ days: 1, label: 'Today' }, { days: 7, label: '7 days' }, { days: 30, label: '30 days' }] as const;
const GAME_NAMES: Record<string, string> = { daily: 'Daily challenge', quiz: 'Map quiz', street: 'Street View', duel: 'Duel', capitals: 'Capitals', trivia: 'Geo Trivia', top5: 'Top 5', antipode: 'Antipode' };

const dur = (sec: number) => {
  const m = Math.round(sec / 60);
  return sec < 60 ? `${Math.round(sec)}s` : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim();
};
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 2 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const when = (t: number) => new Date(t).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const country = (c: unknown) => BY_CCA3.get(String(c))?.name ?? String(c);
const DeviceIcon = ({ d }: { d: string }) => (d === 'phone' ? <Smartphone size={13} /> : d === 'tablet' ? <Tablet size={13} /> : <Monitor size={13} />);

/** One line for an event in a visit's timeline. */
function describe([, name, d = {}]: Event) {
  switch (name) {
    case 'country': return `Opened ${country(d.c)}`;
    case 'feature': return `Looked at ${d.n}`;
    case 'game': return `Started ${GAME_NAMES[d.g] ?? d.g}${d.m && d.m !== 'find' ? ` (${d.m})` : ''}`;
    case 'score': return `Finished ${GAME_NAMES[d.g] ?? d.g}: ${fmtInt(Number(d.s))}${d.of ? ` / ${fmtInt(Number(d.of))}` : ' pts'}`;
    case 'match': return `Live ${GAME_NAMES[d.g] ?? d.g} match: #${d.r} of ${d.n}`;
    case 'ask': return 'Asked Claude a question';
    case 'search': return 'Searched';
    case 'crash': return `Error in ${d.w}`;
    case 'open': return d.w === 'games' ? 'Opened the Play menu' : `Opened ${d.w}`;
    case 'launch': return `Picked ${GAME_NAMES[d.g] ?? (d.g === 'duel' ? 'Duel' : d.g)} from the Play menu`;
    default: return name;
  }
}

/** Notify me (on my phone) when someone new joins, or a guest is exploring. */
function AlertSwitches() {
  const [s, setS] = useState<{ signups: boolean; guests: boolean; devices: number } | null>(null);
  useEffect(() => { api('/api/alerts').then((r) => (r.ok ? r.json() : null)).then((d) => d && setS(d)).catch(() => null); }, []);
  if (!s) return null;
  const flip = (k: 'signups' | 'guests') => {
    const next = { ...s, [k]: !s[k] };
    setS(next);
    void api('/api/alerts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [k]: next[k] }) })
      .then((r) => { if (!r.ok) setS(s); }).catch(() => setS(s));
  };
  return (
    <div className="ac-alerts">
      <span className="ac-alerts-label"><Bell size={13} /> Notify me</span>
      <button className={s.signups ? 'on' : ''} aria-pressed={s.signups} onClick={() => flip('signups')}>New players</button>
      <button className={s.guests ? 'on' : ''} aria-pressed={s.guests} onClick={() => flip('guests')}>Guest visits</button>
      {!s.devices && <span className="ac-alerts-hint">Turn on the morning reminder (🔔) on your phone to get these.</span>}
    </div>
  );
}

/** Owner-only: who used GeoQuest, for how long, and what they did. */
export function ActivityPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [days, setDays] = useState<number>(7);
  const [withMe, setWithMe] = useState(false);
  const [data, setData] = useState<{ sessions: Session[]; me: string; people: Person[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [who, setWho] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = (d = days) => {
    setLoading(true); setError(null);
    api(`/api/analytics?days=${d}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? 'Couldn’t load activity.'); setData(j); })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (open) load(); }, [open, days]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const view = useMemo(() => {
    if (!data) return null;
    // Range filtering for "Today" is by calendar day; the server returns whole days.
    const since = days === 1 ? new Date().setHours(0, 0, 0, 0) : Date.now() - days * 86400_000;
    const all = data.sessions.filter((s) => s.start >= since && (withMe || s.user !== data.me));
    const sessions = who ? all.filter((s) => s.user === who) : all;

    const players = new Map<string, { name: string; visits: number; active: number; last: number; devices: Set<string>; games: Record<string, number> }>();
    for (const s of all) {
      const p = players.get(s.user) ?? { name: s.user, visits: 0, active: 0, last: 0, devices: new Set(), games: {} };
      p.visits++; p.active += s.active; p.last = Math.max(p.last, s.last); p.devices.add(s.device);
      for (const [, n, d] of s.events) if (n === 'game' && d?.g) p.games[d.g] = (p.games[d.g] ?? 0) + 1;
      players.set(s.user, p);
    }
    const ranked = [...players.values()].sort((a, b) => b.active - a.active);
    const maxActive = Math.max(1, ...ranked.map((p) => p.active));

    const games: Record<string, { plays: number; best: number }> = {};
    const countries: Record<string, number> = {};
    const places: Record<string, { n: number; cc?: string }> = {};
    for (const s of sessions) {
      const label = s.place?.city ?? (s.place?.country ? new Intl.DisplayNames(undefined, { type: 'region' }).of(s.place.country) : undefined);
      if (label) { const k = `${label}|${s.place?.country ?? ''}`; (places[k] ??= { n: 0, cc: s.place?.country }).n++; }
    }
    const crashes: { user: string; at: number; d: Data }[] = [];
    for (const s of sessions) for (const [at, n, d] of s.events) {
      if (n === 'game' && d?.g) (games[d.g] ??= { plays: 0, best: 0 }).plays++;
      if (n === 'score' && d?.g) { const g = (games[d.g] ??= { plays: 0, best: 0 }); g.best = Math.max(g.best, Number(d.s) || 0); }
      if (n === 'country' && d?.c) countries[d.c] = (countries[d.c] ?? 0) + 1;
      if (n === 'crash') crashes.push({ user: s.user, at: s.start + at * 1000, d: d ?? {} });
    }
    const total = sessions.reduce((t, s) => t + s.active, 0);
    const absent = data.people.filter((p) => p.status === 'active' && !players.has(p.name) && (withMe || p.name !== data.me)).map((p) => p.name);
    return {
      sessions, ranked, maxActive, total, absent, crashes,
      players: new Set(sessions.map((s) => s.user)).size,
      games: Object.entries(games).sort((a, b) => b[1].plays - a[1].plays),
      countries: Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 10),
      places: Object.entries(places).sort((a, b) => b[1].n - a[1].n).slice(0, 12).map(([k, v]) => ({ name: k.split('|')[0], ...v })),
    };
  }, [data, days, withMe, who]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="people-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.section className="people activity" role="dialog" aria-label="Activity" onClick={(e) => e.stopPropagation()}
            initial={{ y: 16, scale: 0.98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 10, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
            <header className="gc-head">
              <span className="gc-badge"><BarChart3 size={16} /></span>
              <div className="gc-title"><b>Activity</b><span>Who’s been playing, for how long, and what they did</span></div>
              <span className="gc-spacer" />
              <button className="icon-btn" onClick={() => load()} aria-label="Refresh" disabled={loading}>{loading ? <Loader2 size={16} className="spin" /> : <RotateCw size={16} />}</button>
              <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={17} /></button>
            </header>

            <div className="ac-controls">
              <div className="gc-level" role="radiogroup" aria-label="Period">
                {RANGES.map((r) => <button key={r.days} role="radio" aria-checked={days === r.days} className={days === r.days ? 'on' : ''} onClick={() => { setDays(r.days); setWho(null); }}>{r.label}</button>)}
              </div>
              <label className="ac-me"><input type="checkbox" checked={withMe} onChange={(e) => setWithMe(e.target.checked)} /> Include me</label>
            </div>

            <AlertSwitches />

            {error && <p className="pp-error">{error}</p>}
            {!view && !error && <div className="ac-empty"><Loader2 size={18} className="spin" /></div>}

            {view && (
              <>
                <div className="ac-tiles">
                  <div><b>{view.players}</b><span>{view.players === 1 ? 'player' : 'players'}</span></div>
                  <div><b>{view.sessions.length}</b><span>{view.sessions.length === 1 ? 'visit' : 'visits'}</span></div>
                  <div><b>{dur(view.total)}</b><span>time in app</span></div>
                  <div><b>{view.sessions.length ? dur(view.total / view.sessions.length) : '—'}</b><span>avg visit</span></div>
                </div>

                <div className="fr-label">Players{who && <button className="ac-clear" onClick={() => setWho(null)}>Show everyone</button>}</div>
                {view.ranked.length ? (
                  <ul className="ac-players">
                    {view.ranked.map((p) => {
                      const fav = Object.entries(p.games).sort((a, b) => b[1] - a[1])[0];
                      return (
                        <li key={p.name}>
                          <button className={who === p.name ? 'on' : ''} onClick={() => setWho(who === p.name ? null : p.name)} aria-pressed={who === p.name}>
                            <span className="pp-avatar member">{p.name[0]?.toUpperCase()}</span>
                            <span className="ac-who">
                              <b>{p.name}</b>
                              <span>{ago(p.last)} · {p.visits} {p.visits === 1 ? 'visit' : 'visits'}{fav ? ` · mostly ${GAME_NAMES[fav[0]] ?? fav[0]}` : ''}</span>
                            </span>
                            <span className="ac-devs">{[...p.devices].map((d) => <DeviceIcon key={d} d={d} />)}</span>
                            <span className="ac-time"><b>{dur(p.active)}</b><i style={{ width: `${(p.active / view.maxActive) * 100}%` }} /></span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : <p className="ac-note">No visits in this period{withMe ? '' : ' (from anyone but you)'}.</p>}
                {view.absent.length > 0 && <p className="ac-note">Not seen in this period: {view.absent.join(', ')}</p>}

                {view.crashes.length > 0 && (
                  <div className="ac-crashes">
                    <AlertTriangle size={14} />
                    <div>
                      <b>{view.crashes.length} error{view.crashes.length === 1 ? '' : 's'}</b>
                      {view.crashes.slice(0, 5).map((c, i) => <span key={i}>{c.user} · {c.d.w}{c.d.e ? ` — ${c.d.e}` : ''} · {ago(c.at)}</span>)}
                    </div>
                  </div>
                )}

                {(view.games.length > 0 || view.countries.length > 0) && (
                  <div className="ac-two">
                    {view.games.length > 0 && (
                      <div>
                        <div className="fr-label">Games</div>
                        <ul className="ac-bars">
                          {view.games.map(([g, v]) => (
                            <li key={g}><span>{GAME_NAMES[g] ?? g}</span><i style={{ width: `${(v.plays / view.games[0][1].plays) * 100}%` }} /><b>{v.plays}</b></li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {view.countries.length > 0 && (
                      <div>
                        <div className="fr-label">Most-viewed countries</div>
                        <div className="ac-chips">{view.countries.map(([c, n]) => <span key={c}>{country(c)} <b>{n}</b></span>)}</div>
                      </div>
                    )}
                  </div>
                )}

                {view.places.length > 0 && (
                  <>
                    <div className="fr-label">Where they’re from <span className="ac-hint">roughly — by connection</span></div>
                    <div className="ac-chips">{view.places.map((p) => <span key={p.name + p.cc}>{flag(p.cc)} {p.name} <b>{p.n}</b></span>)}</div>
                  </>
                )}

                <div className="fr-label">Visits{who ? ` · ${who}` : ''}</div>
                <ul className="ac-visits">
                  {view.sessions.slice(0, 60).map((s) => {
                    const open = expanded === s.sid;
                    const games = s.events.filter((e) => e[1] === 'game').length;
                    const seen = new Set(s.events.filter((e) => e[1] === 'country').map((e) => e[2]?.c)).size;
                    return (
                      <li key={s.sid} className={open ? 'open' : ''}>
                        <button onClick={() => setExpanded(open ? null : s.sid)} aria-expanded={open}>
                          <span className="ac-v-main">
                            <b>{s.user}</b>
                            <span>{when(s.start)}{s.place ? ` · ${flag(s.place.country)} ${placeLabel(s.place)}` : ''}</span>
                          </span>
                          <span className="ac-v-sum">
                            {s.events.some((e) => e[1] === 'crash') && <em className="bad">error</em>}
                            {games > 0 && <em>{games} game{games === 1 ? '' : 's'}</em>}
                            {seen > 0 && <em>{seen} countr{seen === 1 ? 'y' : 'ies'}</em>}
                          </span>
                          <span className="ac-v-dev" title={`${s.os} · ${s.browser}${s.pwa ? ' · installed app' : ''}`}><DeviceIcon d={s.device} /></span>
                          <span className="ac-v-time">{dur(s.active)}</span>
                          <ChevronDown size={14} className="ac-chev" />
                        </button>
                        {open && (
                          <div className="ac-timeline">
                            <p>{s.place ? `${flag(s.place.country)} ${[s.place.city, s.place.region, s.place.country].filter(Boolean).join(', ')} · ` : ''}{s.os} · {s.browser}{s.pwa ? ' · installed app' : ''} · on screen {dur(s.active)} of {dur((s.last - s.start) / 1000)}</p>
                            {s.events.length ? (
                              <ol>{s.events.map((e, i) => <li key={i} className={e[1] === 'crash' ? 'bad' : ''}><time>{new Date(s.start + e[0] * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time>{describe(e)}</li>)}</ol>
                            ) : <p>Just looked around the globe.</p>}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {view.sessions.length > 60 && <p className="ac-note">Showing the latest 60 of {view.sessions.length} visits.</p>}
              </>
            )}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
