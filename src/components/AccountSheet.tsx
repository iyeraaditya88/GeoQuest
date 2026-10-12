import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Loader2, LogOut, Trash2, UserRound, X } from 'lucide-react';
import { api } from '../lib/api';

/** My account: who I'm signed in as, sign out — and delete my account (confirmed with my password). */
export function AccountSheet({ user, owner, onSignOut, onClose }: { user: string; owner: boolean; onSignOut: () => void; onClose: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const erase = async () => {
    if (!password) { setError('Enter your password to confirm.'); return; }
    setBusy(true); setError(null);
    try {
      const r = await api('/api/me/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? 'Couldn’t delete your account — try again.'); return; }
      // Gone: clear what this device kept about the account, and start fresh as a guest.
      try { for (const k of Object.keys(localStorage)) if (k.startsWith('gq-')) localStorage.removeItem(k); } catch { /* private mode */ }
      location.replace('/');
    } catch { setError('Couldn’t reach GeoQuest — check your connection.'); }
    finally { setBusy(false); }
  };

  return (
    <motion.div className="people-backdrop si-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section className="si-sheet acct" role="dialog" aria-modal="true" aria-labelledby="acct-title" onClick={(e) => e.stopPropagation()}
        initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
        <button className="icon-btn si-close" onClick={onClose} aria-label="Close"><X size={17} /></button>
        <span className="acct-avatar"><UserRound size={26} /></span>
        <h2 id="acct-title">{user}</h2>
        <p className="si-sub">{owner ? 'Owner account' : 'Your GeoQuest account'}</p>
        <div className="si-actions">
          <button className="ghost-cta acct-row" onClick={onSignOut}><LogOut size={15} /> Sign out</button>
        </div>
        {!owner && (
          confirming ? (
            <div className="acct-danger">
              <b>Delete your account?</b>
              <p>This removes your account, saved places, favourites, Daily streak and results, reminders and visit history. It can’t be undone.</p>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password" aria-label="Your password" />
              {error && <p className="fb-error">{error}</p>}
              <div className="acct-buttons">
                <button className="ghost-cta" onClick={() => { setConfirming(false); setPassword(''); setError(null); }} disabled={busy}>Keep my account</button>
                <button className="acct-delete" onClick={() => void erase()} disabled={busy}>{busy ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />} Delete forever</button>
              </div>
            </div>
          ) : (
            <button className="acct-link" onClick={() => setConfirming(true)}>Delete my account</button>
          )
        )}
        <p className="acct-legal"><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/about">About</a></p>
      </motion.section>
    </motion.div>
  );
}
