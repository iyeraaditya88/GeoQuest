import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Bug, Check, Inbox, Lightbulb, Loader2, Mail, MessageCircle, Monitor, RotateCcw, RotateCw, Smartphone, Sparkles, Tablet, X } from 'lucide-react';
import { api } from '../lib/api';

type Kind = 'idea' | 'bug' | 'feature' | 'other';
interface Item {
  id: string; at: number; kind: Kind; text: string; contact?: string; user: string; where: string;
  device: string; os: string; browser: string; pwa: boolean; place?: { city?: string; region?: string; country?: string }; status: 'new' | 'done';
}
const KIND: Record<Kind, { label: string; icon: typeof Bug }> = {
  idea: { label: 'Improvement', icon: Lightbulb }, bug: { label: 'Bug', icon: Bug },
  feature: { label: 'Feature request', icon: Sparkles }, other: { label: 'General', icon: MessageCircle },
};
const flag = (cc?: string) => (cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '');
const when = (t: number) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** Owner-only: what players have told us — newest first; mark each one done. */
export function FeedbackInbox({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState<'new' | 'all'>('new');
  const [kind, setKind] = useState<Kind | null>(null);

  const load = () => {
    setLoading(true); setError(null);
    api('/api/feedback').then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? 'Couldn’t load feedback.');
      setItems(d.feedback ?? []);
    }).catch((e) => setError((e as Error).message)).finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const mark = async (it: Item) => {
    const status = it.status === 'new' ? 'done' : 'new';
    setItems((xs) => xs?.map((x) => (x.id === it.id ? { ...x, status } : x)) ?? null);
    const r = await api(`/api/feedback/${it.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }).catch(() => null);
    if (!r?.ok) setItems((xs) => xs?.map((x) => (x.id === it.id ? { ...x, status: it.status } : x)) ?? null); // put it back
  };

  const fresh = items?.filter((x) => x.status === 'new').length ?? 0;
  const list = (items ?? []).filter((x) => (show === 'all' || x.status === 'new') && (!kind || x.kind === kind));

  return (
    <motion.div className="people-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section className="people activity fb-inbox" role="dialog" aria-label="Feedback" onClick={(e) => e.stopPropagation()}
        initial={{ y: 16, scale: 0.98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 10, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
        <header className="gc-head">
          <span className="gc-badge"><Inbox size={16} /></span>
          <div className="gc-title"><b>Feedback</b><span>{items ? `${fresh} new · ${items.length} in all` : 'What players are telling you'}</span></div>
          <span className="gc-spacer" />
          <button className="icon-btn" onClick={load} aria-label="Refresh" disabled={loading}>{loading ? <Loader2 size={16} className="spin" /> : <RotateCw size={16} />}</button>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </header>

        <div className="ac-controls">
          <div className="gc-level" role="radiogroup" aria-label="Show">
            <button role="radio" aria-checked={show === 'new'} className={show === 'new' ? 'on' : ''} onClick={() => setShow('new')}>New</button>
            <button role="radio" aria-checked={show === 'all'} className={show === 'all' ? 'on' : ''} onClick={() => setShow('all')}>All</button>
          </div>
          <div className="fb-filter">
            {(Object.keys(KIND) as Kind[]).map((k) => {
              const Icon = KIND[k].icon;
              return <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(kind === k ? null : k)} aria-pressed={kind === k} title={KIND[k].label}><Icon size={14} /></button>;
            })}
          </div>
        </div>

        {error && <p className="pp-error">{error}</p>}
        {!items && !error && <div className="ac-empty"><Loader2 size={18} className="spin" /></div>}
        {items && !list.length && <p className="ac-note">{show === 'new' ? 'All caught up — nothing new.' : 'No feedback yet. It’ll show up here (and on your phone, if notifications are on).'}</p>}

        <ul className="fb-list">
          {list.map((it) => {
            const K = KIND[it.kind];
            const Dev = it.device === 'phone' ? Smartphone : it.device === 'tablet' ? Tablet : Monitor;
            return (
              <li key={it.id} className={`fb-item k-${it.kind} ${it.status}`}>
                <div className="fb-top">
                  <span className="fb-kind"><K.icon size={13} /> {K.label}</span>
                  <span className="fb-when">{when(it.at)}</span>
                  <button className="fb-mark" onClick={() => void mark(it)} aria-label={it.status === 'new' ? 'Mark done' : 'Mark as new'}>
                    {it.status === 'new' ? <><Check size={14} /> Done</> : <><RotateCcw size={13} /> Reopen</>}
                  </button>
                </div>
                <p className="fb-body">{it.text}</p>
                <div className="fb-meta">
                  <b>{it.user}</b>
                  {it.contact && (isEmail(it.contact) ? <a href={`mailto:${it.contact}?subject=${encodeURIComponent('Your GeoQuest feedback')}`}><Mail size={12} /> {it.contact}</a> : <span>{it.contact}</span>)}
                  <span>in {it.where}</span>
                  <span><Dev size={12} /> {it.os} · {it.browser}{it.pwa ? ' · app' : ''}</span>
                  {it.place && <span>{flag(it.place.country)} {[it.place.city, it.place.country].filter(Boolean).join(', ')}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </motion.section>
    </motion.div>
  );
}
