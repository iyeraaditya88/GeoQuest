// @vercel/blob reads, simulated: the version used for a conditional write must be the storage
// API's (head), and the content must be that version — even when the download's ETag header is
// written differently, or the download briefly lags a write.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sim = vi.hoisted(() => ({
  meta: null as null | { etag: string; size: number; uploadedAt: Date },
  downloads: [] as { text: string; etag: string; lastModified: string }[], // served in order (last one repeats)
}));
vi.mock('@vercel/blob', () => {
  class BlobNotFoundError extends Error {}
  class BlobPreconditionFailedError extends Error {}
  return {
    BlobNotFoundError, BlobPreconditionFailedError,
    head: async () => { if (!sim.meta) throw new BlobNotFoundError('not found'); return { ...sim.meta }; },
    get: async () => {
      const d = sim.downloads.length > 1 ? sim.downloads.shift()! : sim.downloads[0];
      if (!d) return null;
      return { statusCode: 200, stream: new Response(d.text).body, headers: new Headers({ 'last-modified': d.lastModified }), blob: { etag: d.etag } };
    },
    put: async () => ({}), del: async () => {}, list: async () => ({ blobs: [], hasMore: false }),
  };
});

const { readBlobDoc } = await import('../server/storage');
const at = new Date('2026-10-10T08:00:00.400Z');

beforeEach(() => { sim.meta = null; sim.downloads = []; });

describe('reading a versioned document', () => {
  it('uses the storage API\'s version, even when the download writes it differently', async () => {
    sim.meta = { etag: 'abc123', size: 7, uploadedAt: at };
    sim.downloads = [{ text: '{"v":2}', etag: '"abc123"', lastModified: at.toUTCString() }];
    expect(await readBlobDoc('auth/users.json')).toEqual({ text: '{"v":2}', etag: 'abc123' });
  });

  it('waits for a download that still serves the version before a write', async () => {
    sim.meta = { etag: 'v2', size: 7, uploadedAt: at };
    const old = { text: '{"v":1}', etag: '"v1"', lastModified: new Date(at.getTime() - 5000).toUTCString() };
    sim.downloads = [old, old, { text: '{"v":2}', etag: '"v2"', lastModified: at.toUTCString() }];
    expect(await readBlobDoc('auth/users.json')).toEqual({ text: '{"v":2}', etag: 'v2' });
  });

  it('says "not there yet" for a missing document', async () => {
    expect(await readBlobDoc('auth/users.json')).toBeNull();
  });
});
