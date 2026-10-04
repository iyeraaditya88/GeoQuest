// Accounts for the hosted site: created by the owner, stored as scrypt hashes in the
// GEOQUEST_USERS environment variable ("name:scrypt:<salt>:<hash>", comma-separated).
// Create entries with `npm run user:add -- <name>`.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const KEYLEN = 32;

/** A storable entry for `name` with `password`. */
export async function hashUser(name: string, password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN);
  return `${name}:scrypt:${salt.toString('base64url')}:${hash.toString('base64url')}`;
}

function users() {
  const map = new Map<string, { salt: Buffer; hash: Buffer }>();
  for (const raw of (process.env.GEOQUEST_USERS ?? '').split(',')) {
    const [name, algo, salt, hash] = raw.trim().split(':');
    if (name && algo === 'scrypt' && salt && hash) map.set(name.toLowerCase(), { salt: Buffer.from(salt, 'base64url'), hash: Buffer.from(hash, 'base64url') });
  }
  return map;
}

// Unknown users still pay the full scrypt cost, so timing doesn't reveal who exists.
const DUMMY = { salt: Buffer.alloc(16, 7), hash: Buffer.alloc(KEYLEN, 0) };

/** The canonical username if the credentials are right, otherwise null. */
export async function checkLogin(name: string, password: string) {
  const key = name.trim().toLowerCase();
  const u = users().get(key);
  const rec = u ?? DUMMY;
  const got = await scrypt(password, rec.salt, KEYLEN);
  const ok = timingSafeEqual(got, rec.hash);
  return u && ok ? key : null;
}

export const hasUsers = () => users().size > 0;
