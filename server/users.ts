// GeoQuest accounts for the hosted site.
//
// Stored as one small JSON document in a *private* Vercel Blob store (BLOB_READ_WRITE_TOKEN is
// injected automatically when the store is connected to the project). Locally (for testing the
// hosted mode) it falls back to a JSON file. Only scrypt password hashes and SHA-256 invite
// fingerprints are stored — never a password or a usable invite link.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { BlobPreconditionFailedError, blobEnabled, readBlobDoc, readBlobTextLenient, writeBlob } from './storage.js';

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
  /** session version: bumped when the password is reset, which signs out every old session */
  sv?: number;
  /** the game link they signed up through (each link admits only a few new accounts) */
  via?: string;
}
/** A group invite link (one link for a whole chat): up to `max` people may join before `exp`. */
export interface GroupLink { sha: string; max: number; used: number; exp: number; createdAt: number; by: string; label?: string; revoked?: boolean }
type Db = { users: Record<string, UserRecord>; groups?: Record<string, GroupLink> };

const localFile = () => process.env.GQ_USERS_FILE ?? '.users.local.json';

// Short cache: reads are on every API call (to cut off removed users at once), writes are rare.
let cache: { db: Db; at: number } | null = null;
const TTL = 5000;

/**
 * The accounts document and its version. "Not there yet" is an empty list (first run); a failed
 * read throws — carrying on with an empty list and saving it would wipe every account.
 */
async function readDb(): Promise<{ db: Db; etag?: string }> {
  let db: Db = { users: {} }, etag: string | undefined;
  if (blobEnabled()) {
    const doc = await readBlobDoc(BLOB_PATH);
    if (doc) { db = JSON.parse(doc.text) as Db; etag = doc.etag; }
  } else {
    try { db = JSON.parse(await readFile(localFile(), 'utf8')) as Db; } catch (err) { if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err; }
  }
  db.users ??= {};
  return { db, etag };
}

async function load(fresh = false): Promise<Db> {
  if (!fresh && cache && Date.now() - cache.at < TTL) return cache.db;
  const { db } = await readDb();
  cache = { db, at: Date.now() };
  return db;
}

/**
 * Change the accounts safely: read the latest version, apply `fn`, and write only if nobody else
 * wrote in between (otherwise re-read and retry) — so two changes at once can't undo each other.
 */
async function update<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const { db, etag } = await readDb();
    const out = await fn(db);
    const body = JSON.stringify(db);
    try {
      if (blobEnabled()) await writeBlob(BLOB_PATH, body, etag ? { ifMatch: etag } : { overwrite: false });
      else await writeFile(localFile(), body, { mode: 0o600 });
      cache = { db, at: Date.now() };
      return out;
    } catch (err) {
      // Someone else wrote first (or created it first): try again on top of their version.
      const conflict = err instanceof BlobPreconditionFailedError || (!etag && /exist/i.test((err as Error).message));
      if (!conflict || attempt >= 4) throw err;
    }
  }
}

// ── Session signing key ──
// SESSION_SECRET if set; otherwise a random key generated on first use and kept in the same
// private store (so there's nothing for anyone to copy or paste). Cached per instance.
const SECRET_PATH = 'auth/session-secret';
let secretCache: string | null = null;
async function readSecret() {
  return (await readBlobTextLenient(SECRET_PATH))?.trim() || null;
}
export async function sessionSecret(): Promise<string | null> {
  const env = process.env.SESSION_SECRET;
  if (env && env.length >= 32) return env;
  if (secretCache) return secretCache;
  if (!blobEnabled()) return null;
  try {
    secretCache = await readSecret();
    if (secretCache) return secretCache;
    const fresh = randomBytes(32).toString('base64url');
    try {
      await writeBlob(SECRET_PATH, fresh, { overwrite: false, contentType: 'text/plain' });
      secretCache = fresh;
    } catch {
      secretCache = await readSecret(); // another instance created it first — use theirs
    }
    return secretCache;
  } catch (err) {
    console.error('[geoquest] could not load the session key:', (err as Error).message);
    return null;
  }
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
  const u = (await load(true)).users[name];
  const ok = await passwordMatches(typeof pw === 'string' ? pw : '', u?.password);
  if (!u?.password || !ok) return null;
  void update((db) => { if (db.users[name]) db.users[name].lastLogin = Date.now(); }).catch(() => null); // best effort
  return { name, role: u.role, sv: u.sv ?? 0 };
}

// ── Owner setup (once) ──
export async function createOwner(nameRaw: unknown, pw: string) {
  const name = normName(nameRaw);
  if (!validName(name)) throw new Error('Pick a username of 2–32 letters, digits, dots, dashes or underscores.');
  const password = await hashPassword(pw);
  await update((db) => {
    if (Object.values(db.users).some((u) => u.role === 'owner' && u.password)) throw new Error('GeoQuest is already set up.');
    db.users[name] = { role: 'owner', createdAt: Date.now(), password };
  });
  return { name, role: 'owner' as Role, sv: 0 };
}

// ── Invites ──
/** Create (or re-issue) an invite. Returns the one-time token — shown only to the owner. */
export async function invite(nameRaw: unknown) {
  const name = normName(nameRaw);
  if (!validName(name)) throw new Error('Use 2–32 letters, digits, dots, dashes or underscores (e.g. “bob” or “maya.k”).');
  const token = randomBytes(24).toString('base64url');
  await update((db) => {
    const existing = db.users[name];
    if (existing?.role === 'owner') throw new Error('That’s the owner account.');
    // Re-inviting someone who already has a password resets it (they choose a new one from the
    // link) — and signs out their old sessions.
    const sv = (existing?.sv ?? 0) + (existing?.password ? 1 : 0);
    db.users[name] = { role: 'member', createdAt: existing?.createdAt ?? Date.now(), invite: { sha: sha(token), exp: Date.now() + INVITE_DAYS * 86400000 }, sv };
  });
  return { name, token, days: INVITE_DAYS };
}

export async function inviteValid(nameRaw: unknown, token: unknown) {
  return tokenMatches((await load(true)).users[normName(nameRaw)], token);
}

const tokenMatches = (u: UserRecord | undefined, token: unknown) =>
  !!(u?.invite && typeof token === 'string' && u.invite.exp > Date.now() && timingSafeEqual(Buffer.from(sha(token)), Buffer.from(u.invite.sha)));

export async function acceptInvite(nameRaw: unknown, token: unknown, pw: string) {
  const name = normName(nameRaw);
  const EXPIRED = 'This invite link has expired or was already used — ask for a new one.';
  if (!(await inviteValid(name, token))) throw new Error(EXPIRED);
  const password = await hashPassword(pw);
  return update((db) => {
    const u = db.users[name];
    if (!tokenMatches(u, token)) throw new Error(EXPIRED); // re-checked on the latest version
    u.password = password;
    delete u.invite;
    u.lastLogin = Date.now();
    return { name, role: u.role, sv: u.sv ?? 0 };
  });
}

// ── Sign-up from the owner's game link ──
/** New accounts one game link may create. */
export const SIGNUPS_PER_LINK = 5;
export async function createMember(nameRaw: unknown, pw: string, via: string) {
  const name = normName(nameRaw);
  if (!validName(name)) throw new Error('Pick a username of 2–32 letters, digits, dots, dashes or underscores.');
  const password = await hashPassword(pw);
  return update((db) => {
    if (db.users[name]) throw new Error('That username is taken — pick another (or sign in if it’s yours).');
    if (Object.values(db.users).filter((u) => u.via === via).length >= SIGNUPS_PER_LINK) throw new Error('This link has already been used to sign up several people — ask for a new one.');
    db.users[name] = { role: 'member', createdAt: Date.now(), password, lastLogin: Date.now(), via };
    return { name, role: 'member' as Role, sv: 0 };
  });
}

// ── Group invite links (owner only) ──
// One link to post in a group chat: each person picks their own username and password. Only a
// fingerprint of the link is stored (like single invites), so it's shown once, when made.
export const GROUP_MAX = 200;
export const GROUP_DAYS = 30;
const groupId = () => randomBytes(6).toString('base64url').replace(/[-_]/g, 'x');
const splitCode = (code: unknown) => {
  const [id, token] = typeof code === 'string' ? code.split('.') : [];
  return id && token && /^[A-Za-z0-9]{6,12}$/.test(id) && /^[A-Za-z0-9_-]{20,64}$/.test(token) ? { id, token } : null;
};
const groupOk = (g: GroupLink | undefined, token: string) =>
  !!g && !g.revoked && g.exp > Date.now() && g.used < g.max && timingSafeEqual(Buffer.from(sha(token)), Buffer.from(g.sha));

export async function createGroup(by: string, max: number, days: number, label?: string) {
  const m = Math.round(max), d = Math.round(days);
  if (!(m >= 2 && m <= GROUP_MAX) || !(d >= 1 && d <= GROUP_DAYS)) throw new Error('Pick between 2 and 200 people, and 1 to 30 days.');
  const id = groupId(), token = randomBytes(24).toString('base64url');
  await update((db) => {
    db.groups ??= {};
    // Tidy: forget group links that ended over a month ago.
    for (const [k, g] of Object.entries(db.groups)) if (g.exp < Date.now() - 30 * 86400000) delete db.groups[k];
    db.groups[id] = { sha: sha(token), max: m, used: 0, exp: Date.now() + d * 86400000, createdAt: Date.now(), by, ...(label ? { label: label.slice(0, 60) } : {}) };
  });
  return { id, code: `${id}.${token}`, max: m, days: d };
}

export async function listGroups() {
  const db = await load(true);
  return Object.entries(db.groups ?? {}).map(([id, g]) => ({ id, max: g.max, used: g.used, exp: g.exp, createdAt: g.createdAt, label: g.label ?? null, active: !g.revoked && g.exp > Date.now() && g.used < g.max, revoked: !!g.revoked }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function revokeGroup(id: string) {
  return update((db) => { const g = db.groups?.[id]; if (!g) return false; g.revoked = true; return true; });
}

/** Can this group link still be used? (and who it's from, to greet people) */
export async function groupInfo(code: unknown) {
  const c = splitCode(code);
  const g = c ? (await load(true)).groups?.[c.id] : undefined;
  return c && groupOk(g, c.token) ? { valid: true, by: g!.by, left: g!.max - g!.used } : { valid: false };
}

/** Join through a group link: a new member account, counted against the link (atomically). */
export async function joinGroup(code: unknown, nameRaw: unknown, pw: string) {
  const c = splitCode(code);
  const name = normName(nameRaw);
  const ENDED = 'This group link has expired or is full — ask for a new one.';
  if (!c) throw new Error(ENDED);
  if (!validName(name)) throw new Error('Pick a username of 2–32 letters, digits, dots, dashes or underscores.');
  const password = await hashPassword(pw);
  return update((db) => {
    const g = db.groups?.[c.id];
    if (!groupOk(g, c.token)) throw new Error(ENDED);
    if (db.users[name]) throw new Error('That username is taken — pick another (or sign in if it’s yours).');
    g!.used += 1;
    db.users[name] = { role: 'member', createdAt: Date.now(), password, lastLogin: Date.now(), via: `g:${c.id}` };
    return { name, role: 'member' as Role, sv: 0 };
  });
}

export async function removeUser(nameRaw: unknown) {
  const name = normName(nameRaw);
  return update((db) => {
    if (!db.users[name]) return false;
    if (db.users[name].role === 'owner') throw new Error('The owner account can’t be removed.');
    delete db.users[name];
    return true;
  });
}
