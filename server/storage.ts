// Private Vercel Blob storage for small JSON documents (accounts, history, preferences).
// Connected store = classic read-write token, or (newer projects) store ID + Vercel OIDC.
// Without one (your own machine), callers fall back to local files.
//
// Reads distinguish "doesn't exist yet" (null) from "couldn't read" (throws): treating a failed
// read as empty and then writing would wipe the document.
import { BlobNotFoundError, BlobPreconditionFailedError, del, get, head, list, put } from '@vercel/blob';

export { BlobPreconditionFailedError };
export const blobEnabled = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

const sameTag = (a: string, b: string) => a.replace(/^W\//, '').replace(/"/g, '') === b.replace(/^W\//, '').replace(/"/g, '');
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A private blob's text and version (ETag); null if it doesn't exist. Throws if it can't be read.
 *
 * The version comes from head() — the storage API's own, the one a conditional write (ifMatch)
 * checks against (the download's ETag header can be in a different form, which made every
 * conditional write fail). The content must be that same version: right after a write, a download
 * can briefly still serve the one before, so if they don't line up, wait and read again.
 */
export async function readBlobDoc(path: string): Promise<{ text: string; etag: string } | null> {
  for (let attempt = 0; ; attempt++) {
    let meta: Awaited<ReturnType<typeof head>>;
    try { meta = await head(path); } catch (err) { if (err instanceof BlobNotFoundError) return null; throw err; }
    const r = await get(path, { access: 'private', useCache: false });
    if (r && r.statusCode !== 200) throw new Error(`Couldn't read ${path} (${r.statusCode})`);
    const text = r ? await new Response(r.stream).text() : null;
    if (r && text !== null) {
      // Same version? The tags match, or (if they're written differently) same size and same second.
      const mod = r.headers.get('last-modified');
      const sameSecond = !!mod && Math.floor(Date.parse(mod) / 1000) === Math.floor(new Date(meta.uploadedAt).getTime() / 1000);
      if (sameTag(r.blob.etag, meta.etag) || (sameSecond && Buffer.byteLength(text) === meta.size)) return { text, etag: meta.etag };
      console.warn('[blob] download lags the latest version', { path, head: meta.etag, get: r.blob.etag, attempt });
    }
    if (attempt >= 5) throw new Error(`Couldn't get an up-to-date copy of ${path} — try again in a moment.`);
    await pause(150 * 2 ** attempt);
  }
}

/** Like readBlobDoc, but any failure reads as "nothing there" — for data where that's harmless. */
export async function readBlobTextLenient(path: string): Promise<string | null> {
  try { return (await readBlobDoc(path))?.text ?? null; } catch { return null; }
}

/**
 * Write a private blob at a fixed path.
 * - ifMatch: only if it's still the version we read (optimistic concurrency) — else BlobPreconditionFailedError
 * - overwrite: false = only if it doesn't exist yet
 */
export async function writeBlob(path: string, body: string, opts: { contentType?: string; overwrite?: boolean; ifMatch?: string } = {}) {
  await put(path, body, {
    access: 'private', addRandomSuffix: false, cacheControlMaxAge: 0,
    allowOverwrite: opts.overwrite ?? true, contentType: opts.contentType ?? 'application/json',
    ...(opts.ifMatch ? { ifMatch: opts.ifMatch } : {}),
  });
}

/** Every blob path under a prefix (pages through the listing). */
export async function listBlobPaths(prefix: string): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    out.push(...page.blobs.map((b) => b.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

export async function deleteBlobs(paths: string[]) {
  for (let i = 0; i < paths.length; i += 500) await del(paths.slice(i, i + 500));
}
