// A live match between two players over the local (tab-to-tab) transport, end to end.
import { describe, it, expect } from 'vitest';
import { connectLive } from '../src/lib/live';
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
});
