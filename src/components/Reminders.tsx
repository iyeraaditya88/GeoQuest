import { useEffect, useState } from 'react';
import { BellOff, BellRing, Check, Loader2, Share, SquarePlus } from 'lucide-react';
import { disableReminder, enableReminder, hourLabel, pushSupport, reminderState, sendTestReminder, type ReminderState } from '../lib/push';
import { track } from '../lib/analytics';
import { canUseAccount, needSignIn, useAuth } from '../lib/session';

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/**
 * Morning reminder for this device: on/off, the time, and a test. `compact` is the one-line
 * offer on the Daily result ("Want tomorrow's at 8 AM?").
 */
export function Reminders({ compact = false, onChange }: { compact?: boolean; onChange?: (on: boolean) => void }) {
  const support = pushSupport();
  const a = useAuth();
  const account = canUseAccount(a);
  const [st, setSt] = useState<ReminderState | null>(null);
  const [hour, setHour] = useState(8);
  const [busy, setBusy] = useState<false | 'on' | 'off' | 'test'>(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (support !== 'ok' || !account) return;
    void reminderState().then((s) => { setSt(s); setHour(s.hour); onChange?.(s.on); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [support, account]);

  const run = async (what: 'on' | 'off' | 'test', fn: () => Promise<void>, ok: string) => {
    setBusy(what); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  };
  const turnOn = (h = hour) => run('on', async () => {
    await enableReminder(h);
    setSt({ on: true, hour: h }); onChange?.(true); track('reminder', { on: 1, h });
  }, `Done — see you at ${hourLabel(h)} tomorrow.`);
  const turnOff = () => run('off', async () => {
    await disableReminder();
    setSt((s) => (s ? { ...s, on: false } : s)); onChange?.(false); track('reminder', { on: 0 });
  }, 'Reminder off on this device.');

  // Guests: reminders come with an account (they're sent to you, and skip days you've played).
  if (!account) {
    return (
      <div className={`rm ${compact ? 'compact' : ''}`}>
        <p className="rm-lead"><BellRing size={15} /> {compact ? 'Create a free account to keep your streak — and get a morning nudge.' : 'Morning reminders come with a free account — a nudge each morning with the new Daily.'}</p>
        <button className="primary" onClick={() => needSignIn(compact ? 'daily' : 'reminders')}>Create account or sign in</button>
      </div>
    );
  }

  // iPhone in Safari: notifications need the installed app first.
  if (support === 'ios-install') {
    return (
      <div className={`rm ${compact ? 'compact' : ''}`}>
        <p className="rm-lead"><BellRing size={15} /> Get a nudge each morning</p>
        <ol className="rm-ios">
          <li>Tap <Share size={13} /> <b>Share</b> in Safari</li>
          <li>Choose <SquarePlus size={13} /> <b>Add to Home Screen</b></li>
          <li>Open GeoQuest from your Home Screen and turn the reminder on there</li>
        </ol>
      </div>
    );
  }
  if (support !== 'ok') {
    return compact ? null : (
      <div className="rm"><p className="rm-note">{support === 'denied'
        ? 'Notifications are blocked for GeoQuest. Allow them in your browser (or phone) settings, then come back here.'
        : 'This browser can’t show notifications. Try Chrome, Edge, Firefox or Safari — or the installed app on your phone.'}</p></div>
    );
  }

  const on = !!st?.on;
  if (compact) {
    if (on) return <p className="rm-done"><Check size={14} /> Reminder on — {hourLabel(st!.hour)} each morning</p>;
    return (
      <div className="rm compact">
        <p className="rm-lead"><BellRing size={15} /> Want tomorrow’s challenge as a nudge?</p>
        <div className="rm-row">
          <select value={hour} onChange={(e) => setHour(Number(e.target.value))} aria-label="Reminder time">
            {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
          <button className="primary" disabled={!!busy || !st} onClick={() => void turnOn()}>{busy === 'on' ? <Loader2 size={15} className="spin" /> : <BellRing size={15} />} Remind me</button>
        </div>
        {msg && <p className={`rm-msg ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</p>}
      </div>
    );
  }

  return (
    <div className="rm">
      <p className="rm-lead"><BellRing size={15} /> A nudge each morning with the new Daily challenge — skipped if you’ve already played.</p>
      <div className="rm-row">
        <label className="rm-time">Time
          <select value={hour} onChange={(e) => { const h = Number(e.target.value); setHour(h); if (on) void turnOn(h); }} aria-label="Reminder time">
            {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
        </label>
        {on
          ? <button className="ghost-cta" disabled={!!busy} onClick={() => void turnOff()}>{busy === 'off' ? <Loader2 size={14} className="spin" /> : <BellOff size={14} />} Turn off</button>
          : <button className="primary" disabled={!!busy || !st} onClick={() => void turnOn()}>{busy === 'on' ? <Loader2 size={15} className="spin" /> : <BellRing size={15} />} Turn on</button>}
      </div>
      {on && <button className="rm-test" disabled={!!busy} onClick={() => void run('test', sendTestReminder, 'Sent — it should pop up in a moment.')}>{busy === 'test' ? 'Sending…' : 'Send a test notification'}</button>}
      {msg && <p className={`rm-msg ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</p>}
      <p className="rm-note">On this device only — turn it on on each phone or computer you use.</p>
    </div>
  );
}
