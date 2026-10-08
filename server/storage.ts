// Private Vercel Blob storage for small JSON documents (accounts, history, preferences).
// Connected store = classic read-write token, or (newer projects) store ID + Vercel OIDC.
// Without one (your own machine), callers fall back to local files.
//
// Reads distinguish "doesn't exist yet" (null) from "couldn't read" (throws): treating a failed
// read as empty and then writing would wipe the document.
import { BlobPreconditionFailedError, del, get, list, put } from '@vercel/blob';

export { BlobPreconditionFailedError };
export const blobEnabled = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

/** A private blob's text and version (ETag); null if it doesn't exist. Throws if it can't be read. */
export async function readBlobDoc(path: string): Promise<{ text: string; etag: string } | null> {
  const r = await get(path, { access: 'private', useCache: false });
  if (!r) return null;
  if (r.statusCode !== 200) throw new Error(`Couldn't read ${path} (${r.statusCode})`);
  return { text: await new Response(r.stream).text(), etag: r.blob.etag };
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
