// A live match between two players over the local (tab-to-tab) transport, end to end.
import { describe, it, expect } from 'vitest';
import { connectLive, type Live } from '../src/lib/live';
import { MatchSession, type Invite, type Snapshot } from '../src/lib/match';

const until = async (cond: () => boolean, ms = 8000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
};

describe('live match', () => {
  it('runs a match: join → start → answer → reveal, and scores agree', async () => {
    const alice = await connectLive('local', 'alice');
    const bob = await connectLive('local', 'bob');
    const inv: Invite = { id: `t${Date.now()}`, from: 'alice', game: 'capitals', opts: { level: 'easy' }, players: ['alice', 'bob'], at: Date.now() };
    const host = new MatchSession(alice, inv);
    const guest = new MatchSession(bob, inv);
    await host.open();
    await guest.open();

    // Bob's presence counts as joining; with everyone in, the host starts on its own.
    await until(() => host.get().players.every((p) => p.status === 'joined'));
    await until(() => host.get().phase === 'question' && guest.get().phase === 'question', 12000);
    const h: Snapshot = host.get(), g: Snapshot = guest.get();
    expect(h.script).toEqual(g.script); // same questions for both
    expect(h.qi).toBe(0);

    host.answer(900, true);
    guest.answer(0, false);
    await until(() => host.get().phase === 'reveal' && guest.get().phase === 'reveal');
    const score = (s: Snapshot, n: string) => s.players.find((p) => p.name === n)!.score;
    expect(score(host.get(), 'alice')).toBe(900);
    expect(score(guest.get(), 'alice')).toBe(900);
    expect(score(guest.get(), 'bob')).toBe(0);

    // A second answer to the same question doesn't count.
    host.answer(1000, true);
    expect(score(host.get(), 'alice')).toBe(900);

    // Bob leaves: the host wraps up with the scores so far.
    guest.close();
    await until(() => host.get().phase === 'done');
    expect(host.get().players.find((p) => p.name === 'bob')!.status).toBe('left');

    host.close();
    alice.close();
    bob.close();
  }, 20000);

  it('ignores a malformed start message', async () => {
    const alice = await connectLive('local', 'alice2');
    const bob = await connectLive('local', 'bob2');
    const inv: Invite = { id: `m${Date.now()}`, from: 'alice2', game: 'trivia', opts: {}, players: ['alice2', 'bob2'], at: Date.now() };
    const guest = new MatchSession(bob, inv);
    await guest.open();
    const ch = alice.channel(`match:${inv.id}`);
    await ch.publish('start', { script: { game: 'trivia', qs: 'not a list' }, players: ['alice2', 'bob2'] });
    await ch.publish('start', { script: { game: 'capitals', qs: [1] }, players: ['alice2', 'bob2'] }); // wrong game
    await new Promise((r) => setTimeout(r, 200));
    expect(guest.get().phase).toBe('lobby');
    guest.close();
    alice.close();
    bob.close();
  });

  it('carries chat between the players, and only theirs', async () => {
    const alice = await connectLive('local', 'alice3');
    const bob = await connectLive('local', 'bob3');
    const eve = await connectLive('local', 'eve3');
    const inv: Invite = { id: `c${Date.now()}`, from: 'alice3', game: 'capitals', opts: {}, players: ['alice3', 'bob3'], at: Date.now() };
    const a = new MatchSession(alice, inv), b = new MatchSession(bob, inv);
    await a.open(); await b.open();
    expect(a.say('  good luck 😄  ')).toBe(true);
    expect(a.say('again')).toBe(false); // too fast
    await eve.channel(`match:${inv.id}`).publish('chat', { t: 'I am not in this match' });
    await until(() => b.get().chat.length === 1 && a.get().chat.length === 1);
    await new Promise((r) => setTimeout(r, 100));
    expect(b.get().chat.map((m) => [m.from, m.text])).toEqual([['alice3', 'good luck 😄']]);
    b.say('x'.repeat(500));
    await until(() => a.get().chat.length === 2);
    expect(a.get().chat[1].text.length).toBe(200);
    a.close(); b.close(); alice.close(); bob.close(); eve.close();
  });

  // A connection that loses some messages on the way in (like a phone on a shaky network).
  const lossy = (live: Live, drop: (name: string, data: Record<string, unknown>) => boolean): Live => ({
    ...live,
    channel(n) {
      const ch = live.channel(n);
      return { ...ch, subscribe: (cb) => ch.subscribe((name, data, from) => { if (!drop(name, (data ?? {}) as Record<string, unknown>)) cb(name, data, from); }) };
    },
  });

  it('catches up a player who missed a question (and ignores repeats)', async () => {
    const alice = await connectLive('local', 'alice4');
    let dropped = 0;
    const bob = lossy(await connectLive('local', 'bob4'), (name, d) => name === 'q' && d.i === 1 && ++dropped > 0);
    const inv: Invite = { id: `l${Date.now()}`, from: 'alice4', game: 'capitals', opts: { level: 'easy' }, players: ['alice4', 'bob4'], at: Date.now() };
    const host = new MatchSession(alice, inv), guest = new MatchSession(bob, inv);
    await host.open(); await guest.open();
    await until(() => host.get().phase === 'question' && guest.get().phase === 'question', 12000);
    host.answer(800, true); guest.answer(500, true);
    await until(() => host.get().phase === 'question' && host.get().qi === 1, 15000); // (roomy: other test files run alongside)
    await until(() => dropped === 1, 3000); // bob never got "question 2" (the host moves on before its message lands)…
    await until(() => guest.get().phase === 'question' && guest.get().qi === 1, 6000); // …but is on it within a beat or two
    expect(Math.abs(guest.get().qEndsAt - host.get().qEndsAt)).toBeLessThan(1500); // with the host's clock
    // A repeated (or late) "question 1" doesn't restart the clock or go backwards.
    const before = guest.get().qEndsAt;
    await alice.channel(`match:${inv.id}`).publish('q', { i: 0 });
    await alice.channel(`match:${inv.id}`).publish('q', { i: 1 });
    await new Promise((r) => setTimeout(r, 100));
    expect([guest.get().qi, guest.get().qEndsAt]).toEqual([1, before]);
    host.close(); guest.close(); alice.close(); bob.close();
  }, 45000);

  it('catches up a player who missed the start altogether', async () => {
    const alice = await connectLive('local', 'alice5');
    const bob = lossy(await connectLive('local', 'bob5'), (name, d) => name === 'start' && d.left !== 0);
    const inv: Invite = { id: `s${Date.now()}`, from: 'alice5', game: 'capitals', opts: { level: 'easy' }, players: ['alice5', 'bob5'], at: Date.now() };
    const host = new MatchSession(alice, inv), guest = new MatchSession(bob, inv);
    await host.open(); await guest.open();
    await until(() => host.get().phase === 'question', 12000);
    await until(() => guest.get().phase === 'question' && guest.get().qi === host.get().qi, 8000);
    expect(guest.get().script).toEqual(host.get().script);
    host.close(); guest.close(); alice.close(); bob.close();
  }, 30000);
});
