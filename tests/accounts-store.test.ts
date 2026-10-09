// @vitest-environment node
// The accounts store on Blob storage, with the store simulated: a failed read must never wipe
// accounts, and two changes at once must both survive (optimistic concurrency with ETags).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = vi.hoisted(() => ({
  doc: null as { text: string; etag: string } | null,
  version: 0,
  failNextRead: false,
  staleReads: 0, // the next N reads return the previous version (as just after a write)
  prev: null as { text: string; etag: string } | null,
  conflictOnce: null as null | (() => void), // a "concurrent" write that lands just before ours
}));

vi.mock('../server/storage', () => {
  class BlobPreconditionFailedError extends Error {}
  return {
    BlobPreconditionFailedError,
    blobEnabled: () => true,
    readBlobDoc: async () => {
      if (store.failNextRead) { store.failNextRead = false; throw new Error('network down'); }
      if (store.staleReads > 0 && store.prev) { store.staleReads--; return { ...store.prev }; }
      return store.doc ? { ...store.doc } : null;
    },
    readBlobTextLenient: async () => 'x'.repeat(40),
    writeBlob: async (_path: string, body: string, opts: { ifMatch?: string; overwrite?: boolean } = {}) => {
      if (store.conflictOnce) { const c = store.conflictOnce; store.conflictOnce = null; c(); }
      if (opts.ifMatch && store.doc?.etag !== opts.ifMatch) throw new BlobPreconditionFailedError('stale');
      if (opts.overwrite === false && store.doc) throw new Error('This blob already exists');
      store.prev = store.doc;
      store.doc = { text: body, etag: `v${++store.version}` };
    },
  };
});

const users = await import('../server/users');
const names = () => Object.keys(JSON.parse(store.doc!.text).users).sort();

beforeEach(() => {
  store.doc = { text: JSON.stringify({ users: { owner: { role: 'owner', createdAt: 1, password: 'scrypt$x$y' }, ann: { role: 'member', createdAt: 1, password: 'scrypt$x$y' } } }), etag: 'v0' };
  store.version = 0;
});

describe('accounts store', () => {
  it('does not wipe accounts when a read fails', async () => {
    store.failNextRead = true;
    await expect(users.invite('bob')).rejects.toThrow(/network down/);
    expect(names()).toEqual(['ann', 'owner']); // untouched
  });

  it('keeps both changes when two happen at once', async () => {
    // Someone else adds "cara" between our read and our write.
    store.conflictOnce = () => {
      const db = JSON.parse(store.doc!.text);
      db.users.cara = { role: 'member', createdAt: 2 };
      store.doc = { text: JSON.stringify(db), etag: `v${++store.version}` };
    };
    await users.invite('bob');
    expect(names()).toEqual(['ann', 'bob', 'cara', 'owner']);
  });

  it('refuses a second owner even under a race', async () => {
    await expect(users.createOwner('mallory', 'password123')).rejects.toThrow(/already set up/);
    expect(names()).toEqual(['ann', 'owner']);
  });

  it('bumps the session version when a password is reset', async () => {
    await users.invite('ann');
    expect(JSON.parse(store.doc!.text).users.ann.sv).toBe(1);
  });

  it('waits out a store that briefly returns the previous version after a write', async () => {
    await users.invite('bob'); // a write…
    store.staleReads = 3; // …and the next few reads still see the version before it
    await users.invite('cara');
    expect(names()).toEqual(['ann', 'bob', 'cara', 'owner']); // both kept, nothing lost
  });

  it('gives a friendly message if it still can\'t save', async () => {
    await users.invite('bob');
    store.staleReads = 99;
    await expect(users.invite('dan')).rejects.toThrow(/busy saving another change/);
    expect(names()).toEqual(['ann', 'bob', 'owner']);
    store.staleReads = 0;
  }, 20000);
});
