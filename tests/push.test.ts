// @vitest-environment node
// When morning reminders go out: each player's chosen hour, in their own time zone, once a day.
import { describe, it, expect } from 'vitest';
import { cleanSub, dueNow, localClock, morningNote, validTz, withSub, type PushPrefs } from '../server/push';

const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' }, at: 0 };
const at = (iso: string) => Date.parse(iso);

describe('morning reminders', () => {
  it('reads the local hour and date in a time zone (India is +5:30)', () => {
    expect(localClock('Asia/Kolkata', at('2026-10-09T02:31:00Z'))).toEqual({ hour: 8, date: '2026-10-09' });
    expect(localClock('America/Los_Angeles', at('2026-10-09T02:31:00Z'))).toEqual({ hour: 19, date: '2026-10-08' });
  });

  it('is due at the chosen local hour, once a day', () => {
    const p: PushPrefs = { subs: [sub], hour: 8, tz: 'Asia/Kolkata' };
    expect(dueNow(p, at('2026-10-09T02:35:00Z'))).toBe('2026-10-09'); // 8:05 in India
    expect(dueNow(p, at('2026-10-09T03:35:00Z'))).toBe(null); // 9:05
    expect(dueNow({ ...p, lastSent: '2026-10-09' }, at('2026-10-09T02:35:00Z'))).toBe(null); // already sent
    expect(dueNow({ ...p, subs: [] }, at('2026-10-09T02:35:00Z'))).toBe(null); // no devices
  });

  it('checks what the browser sends', () => {
    expect(cleanSub({ endpoint: 'http://insecure.example', keys: { p256dh: 'p', auth: 'a' } })).toBe(null);
    expect(cleanSub({ endpoint: 'https://push.example/x', keys: {} })).toBe(null);
    expect(cleanSub({ endpoint: 'https://push.example/x', keys: { p256dh: 'p', auth: 'a' } })?.endpoint).toBe('https://push.example/x');
    expect([validTz('Asia/Kolkata'), validTz('Mars/Olympus'), validTz(5)]).toEqual([true, false, false]);
  });

  it('keeps a handful of devices, newest last, without duplicates', () => {
    let p: PushPrefs | null = null;
    for (let i = 0; i < 7; i++) p = withSub(p, { ...sub, endpoint: `https://push.example/${i}` }, 8, 'UTC');
    p = withSub(p, { ...sub, endpoint: 'https://push.example/3' }, 9, 'UTC');
    expect(p!.subs.map((s) => s.endpoint.slice(-1))).toEqual(['2', '4', '5', '6', '3']);
    expect(p!.hour).toBe(9);
  });

  it('mentions the streak when there is one to keep', () => {
    expect(morningNote('2026-10-09', 4).title).toMatch(/4-day streak/);
    expect(morningNote('2026-10-09', 0).title).toMatch(/Daily #1/);
  });
});
