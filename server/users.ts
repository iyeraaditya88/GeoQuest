// GeoQuest accounts for the hosted site.
//
// Stored as one small JSON document in a *private* Vercel Blob store (BLOB_READ_WRITE_TOKEN is
// injected automatically when the store is connected to the project). Locally (for testing the
// hosted mode) it falls back to a JSON file. Only scrypt password hashes and SHA-256 invite
// fingerprints are stored — never a password or a usable invite link.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { get, put } from '@vercel/blob';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const KEYLEN = 32;
const INVITE_DAYS = 7;
const BLOB_PATH = 'auth/users.json';

export type Role = 'owner' | 'member';
export interface UserRecord {
  role: Role;
  createdAt: number;
  /** scrypt$<salt>$<hash>; absent until they accept their invite */
  password?: string;
  /** sha256 of the outstanding invite token, and when it expires */
  invite?: { sha: string; exp: number };
  lastLogin?: number;
}
type Db = { users: Record<string, UserRecord> };

const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const localFile = () => process.env.GQ_USERS_FILE ?? '.users.local.json';

// Short cache: reads are on every API call (to cut off removed users at once), writes are rare.
let cache: { db: Db; at: number } | null = null;
const TTL = 5000;

async function load(fresh = false): Promise<Db> {
  if (!fresh && cache && Date.now() - cache.at < TTL) return cache.db;
  let db: Db = { users: {} };
  try {
    if (useBlob()) {
      const r = await get(BLOB_PATH, { access: 'private', useCache: false });
      if (r && r.statusCode === 200) db = JSON.parse(await new Response(r.stream).text()) as Db;
    } else {
      db = JSON.parse(await readFile(localFile(), 'utf8')) as Db;
    }
  } catch { /* first run: no accounts yet */ }
  db.users ??= {};
  cache = { db, at: Date.now() };
  return db;
}

async function save(db: Db) {
  const body = JSON.stringify(db);
  if (useBlob()) await put(BLOB_PATH, body, { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 0 });
  else await writeFile(localFile(), body, { mode: 0o600 });
  cache = { db, at: Date.now() };
}

/** Usernames: 2–32 chars, lowercase letters, digits, dot, dash, underscore. */
export const normName = (s: unknown) => (typeof s === 'string' ? s.trim().toLowerCase() : '');
export const validName = (n: string) => /^[a-z0-9._-]{2,32}$/.test(n);
export const validPassword = (p: unknown): p is string => typeof p === 'string' && p.length >= 8 && p.length <= 200;

async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64url')}$${(await scrypt(pw, salt, KEYLEN)).toString('base64url')}`;
}
// Unknown users still pay the full scrypt cost, so timing doesn't reveal who exists.
const DUMMY = `scrypt$${Buffer.alloc(16, 7).toString('base64url')}$${Buffer.alloc(KEYLEN).toString('base64url')}`;
async function passwordMatches(pw: string, stored: string | undefined) {
  const [, salt, hash] = (stored ?? DUMMY).split('$');
  const got = await scrypt(pw, Buffer.from(salt, 'base64url'), KEYLEN);
  const want = Buffer.from(hash, 'base64url');
  return got.length === want.length && timingSafeEqual(got, want);
}
const sha = (s: string) => createHash('sha256').update(s).digest('base64url');

// ── Queries ──
export async function hasOwner() {
  return Object.values((await load(true)).users).some((u) => u.role === 'owner' && u.password);
}
export async function getUser(name: string) {
  return (await load()).users[name] ?? null;
}
export async function listUsers() {
  const db = await load(true);
  return Object.entries(db.users).map(([name, u]) => ({
    name, role: u.role, createdAt: u.createdAt, lastLogin: u.lastLogin ?? null,
    status: u.password ? 'active' : u.invite && u.invite.exp > Date.now() ? 'invited' : 'expired',
    inviteExpires: u.invite?.exp ?? null,
  })).sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'owner' ? -1 : 1));
}

// ── Sign-in ──
export async function checkLogin(nameRaw: unknown, pw: unknown) {
  const name = normName(nameRaw);
  const db = await load(true);
  const u = db.users[name];
  const ok = await passwordMatches(typeof pw === 'string' ? pw : '', u?.password);
  if (!u?.password || !ok) return null;
  u.lastLogin = Date.now();
  await save(db).catch(() => null); // best effort
  return { name, role: u.role };
}

// ── Owner setup (once) ──
export async function createOwner(nameRaw: unknown, pw: string) {
  const name = normName(nameRaw);
  if (!validName(name)) throw new Error('Pick a username of 2–32 letters, digits, dots, dashes or underscores.');
  const db = await load(true);
  if (Object.values(db.users).some((u) => u.role === 'owner' && u.password)) throw new Error('GeoQuest is already set up.');
  db.users[name] = { role: 'owner', createdAt: Date.now(), password: await hashPassword(pw) };
  await save(db);
  return { name, role: 'owner' as Role };
}

// ── Invites ──
/** Create (or re-issue) an invite. Returns the one-time token — shown only to the owner. */
export async function invite(nameRaw: unknown) {
  const name = normName(nameRaw);
  if (!validName(name)) throw new Error('Use 2–32 letters, digits, dots, dashes or underscores (e.g. “bob” or “maya.k”).');
  const db = await load(true);
  const existing = db.users[name];
  if (existing?.role === 'owner') throw new Error('That’s the owner account.');
  const token = randomBytes(24).toString('base64url');
  db.users[name] = { role: 'member', createdAt: existing?.createdAt ?? Date.now(), invite: { sha: sha(token), exp: Date.now() + INVITE_DAYS * 86400000 } };
  // (Re-inviting someone resets their password: they choose a new one from the link.)
  await save(db);
  return { name, token, days: INVITE_DAYS };
}

export async function inviteValid(nameRaw: unknown, token: unknown) {
  const u = (await load(true)).users[normName(nameRaw)];
  return !!(u?.invite && typeof token === 'string' && u.invite.exp > Date.now() && timingSafeEqual(Buffer.from(sha(token)), Buffer.from(u.invite.sha)));
}

export async function acceptInvite(nameRaw: unknown, token: unknown, pw: string) {
  const name = normName(nameRaw);
  if (!(await inviteValid(name, token))) throw new Error('This invite link has expired or was already used — ask for a new one.');
  const db = await load(true);
  const u = db.users[name];
  u.password = await hashPassword(pw);
  delete u.invite;
  u.lastLogin = Date.now();
  await save(db);
  return { name, role: u.role };
}

export async function removeUser(nameRaw: unknown) {
  const name = normName(nameRaw);
  const db = await load(true);
  if (!db.users[name]) return false;
  if (db.users[name].role === 'owner') throw new Error('The owner account can’t be removed.');
  delete db.users[name];
  await save(db);
  return true;
}
