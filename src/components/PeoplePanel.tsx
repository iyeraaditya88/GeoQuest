import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Copy, Link2, Loader2, RotateCcw, Share2, Trash2, UserPlus, Users, X } from 'lucide-react';
import { api } from '../lib/api';

interface Person {
  name: string;
  role: 'owner' | 'member';
  status: 'active' | 'invited' | 'expired';
  inviteExpires: number | null;
  lastLogin: number | null;
}
interface Invite { name: string; link: string; days: number }

const ago = (t: number | null) => {
  if (!t) return 'never';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const daysLeft = (t: number | null) => (t ? Math.max(1, Math.ceil((t - Date.now()) / 86400000)) : 0);

/** Owner-only: invite people with a one-time link, reset or remove them. */
export function PeoplePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const refresh = () => api('/api/people').then((r) => r.json()).then((d) => setPeople(d.people ?? [])).catch(() => setPeople([]));
  useEffect(() => {
    if (!open) return;
    setInvite(null); setError(null); setConfirm(null);
    void refresh();
    setTimeout(() => input.current?.focus(), 120);
  }, [open]);

  const create = async (who: string) => {
    if (!who.trim() || busy) return;
    setBusy(true); setError(null); setCopied(false);
    try {
      const r = await api('/api/people', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: who.trim() }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Couldn’t create the invite.');
      setInvite(d);
      setName('');
      void refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const remove = async (who: string) => {
    setConfirm(null);
    await api(`/api/people/${encodeURIComponent(who)}`, { method: 'DELETE' }).catch(() => null);
    if (invite?.name === who) setInvite(null);
    void refresh();
  };

  const copy = async () => {
    if (!invite) return;
    try { await navigator.clipboard.writeText(invite.link); } catch { /* clipboard blocked: the field is selectable */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const share = () => invite && navigator.share?.({ title: 'Join me on GeoQuest', text: `Here’s your GeoQuest invite (${invite.name}):`, url: invite.link }).catch(() => null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="people-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.section className="people" role="dialog" aria-label="People" onClick={(e) => e.stopPropagation()}
            initial={{ y: 24, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 16, opacity: 0, scale: 0.98 }} transition={{ type: 'spring', stiffness: 340, damping: 30 }}>
            <header className="gc-head">
              <span className="gc-badge"><Users size={15} /></span>
              <div className="gc-title"><b>People</b><span>Invite friends with a one-time link</span></div>
              <span className="gc-spacer" />
              <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={17} /></button>
            </header>

            <form className="pp-invite" onSubmit={(e) => { e.preventDefault(); void create(name); }}>
              <span className="pp-field">
                <UserPlus size={15} />
                <input ref={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name, e.g. bob" autoCapitalize="none" spellCheck={false} maxLength={32} />
              </span>
              <button className="primary sm" disabled={!name.trim() || busy}>{busy ? <Loader2 size={14} className="spin" /> : <Link2 size={14} />} Create invite</button>
            </form>
            {error && <p className="pp-error">{error}</p>}

            <AnimatePresence>
              {invite && (
                <motion.div className="pp-link" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <p><b>Send this link to {invite.name}.</b> They open it and choose their own password. It works once and expires in {invite.days} days.</p>
                  <div className="pp-copy">
                    <input readOnly value={invite.link} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
                    <button className="ap-btn gold" onClick={() => void copy()}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}</button>
                    {'share' in navigator && <button className="ap-btn" onClick={share} aria-label="Share"><Share2 size={14} /></button>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <ul className="pp-list">
              {people === null && <li className="pp-empty"><Loader2 size={14} className="spin" /> Loading…</li>}
              {people?.map((p) => (
                <li key={p.name}>
                  <span className={`pp-avatar ${p.role}`}>{p.name[0]?.toUpperCase()}</span>
                  <div className="pp-who">
                    <b>{p.name}</b>
                    <span>
                      {p.role === 'owner' ? 'Owner' : p.status === 'active' ? 'Active' : p.status === 'invited' ? `Invited · link expires in ${daysLeft(p.inviteExpires)} d` : 'Invite expired'}
                      {p.status === 'active' && ` · seen ${ago(p.lastLogin)}`}
                    </span>
                  </div>
                  {p.role !== 'owner' && (confirm === p.name ? (
                    <span className="pp-confirm">Remove? <button onClick={() => void remove(p.name)}>Yes</button><button onClick={() => setConfirm(null)}>No</button></span>
                  ) : (
                    <span className="pp-actions">
                      <button className="sb-icon" title={p.status === 'active' ? 'New link (resets their password)' : 'New invite link'} aria-label="New link" onClick={() => void create(p.name)}><RotateCcw size={15} /></button>
                      <button className="sb-icon pp-del" title="Remove" aria-label={`Remove ${p.name}`} onClick={() => setConfirm(p.name)}><Trash2 size={15} /></button>
                    </span>
                  ))}
                </li>
              ))}
              {people?.length === 1 && <li className="pp-empty">No one else yet — invite someone above.</li>}
            </ul>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
