// Sessions and per-user secrets for the hosted site.
//
// Web Crypto only, so this exact file runs in Vercel Routing Middleware (Edge) and in the
// Node API function. Everything is keyed off SESSION_SECRET; without it nothing verifies
// (fail closed).

export const SESSION_COOKIE = 'gq_session';
export const KEY_COOKIE = 'gq_ak';
export const SESSION_DAYS = 30;

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes: Uint8Array) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Where the signing key comes from: SESSION_SECRET by default; the server and middleware
// plug in the account store's generated key (server/users.ts → sessionSecret).
type SecretSource = () => Promise<string | null>;
let source: SecretSource = async () => {
  const s = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.SESSION_SECRET;
  return s && s.length >= 32 ? s : null;
};
export function setSecretSource(fn: SecretSource) { source = fn; }
const secret = async () => {
  const s = await source();
  return s && s.length >= 32 ? s : null;
};
export const authConfigured = async () => !!(await secret());

async function hmacKey(s: string) {
  return crypto.subtle.importKey('raw', enc.encode(s), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export interface Session { u: string; exp: number }

/** A signed, expiring session token: base64url(payload).base64url(hmac). */
export async function signSession(user: string, days = SESSION_DAYS) {
  const s = await secret();
  if (!s) throw new Error('No session key available');
  const payload = b64url(enc.encode(JSON.stringify({ u: user, exp: Date.now() + days * 86400000 } satisfies Session)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(s), enc.encode(payload)));
  return `${payload}.${b64url(sig)}`;
}

/** The session in a token, or null if it's missing, forged, malformed or expired. */
export async function verifySession(token: string | null | undefined): Promise<Session | null> {
  const s = await secret();
  if (!s || !token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(s), unb64url(sig), enc.encode(payload));
    if (!ok) return null;
    const data = JSON.parse(dec.decode(unb64url(payload))) as Session;
    if (typeof data.u !== 'string' || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

// ── Small signed tokens for other purposes (e.g. live-match tickets) ──
// The purpose is mixed into the MAC, so one kind of token can never pass as another (or as a session).
export async function signData(purpose: string, data: object) {
  const s = await secret();
  if (!s) throw new Error('No session key available');
  const payload = b64url(enc.encode(JSON.stringify(data)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(s), enc.encode(`${purpose}.${payload}`)));
  return `${payload}.${b64url(sig)}`;
}
export async function verifyData<T>(purpose: string, token: unknown): Promise<T | null> {
  const s = await secret();
  if (!s || typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  try {
    if (!(await crypto.subtle.verify('HMAC', await hmacKey(s), unb64url(sig), enc.encode(`${purpose}.${payload}`)))) return null;
    return JSON.parse(dec.decode(unb64url(payload))) as T;
  } catch {
    return null;
  }
}

// ── A user's own Anthropic key, sealed into an httpOnly cookie ──
async function aesKey(s: string) {
  const base = await crypto.subtle.importKey('raw', enc.encode(s), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('geoquest/user-key/v1'), info: enc.encode('aes-gcm') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

/** Encrypt `value` for `user` (AES-256-GCM; the username is bound in as associated data). */
export async function sealKey(value: string, user: string) {
  const s = await secret();
  if (!s) throw new Error('No session key available');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(user) }, await aesKey(s), enc.encode(value)));
  return `${b64url(iv)}.${b64url(ct)}`;
}

/** Decrypt a sealed value for `user`; null if it was tampered with or sealed for someone else. */
export async function openKey(blob: string | null | undefined, user: string) {
  const s = await secret();
  if (!s || !blob) return null;
  const [iv, ct] = blob.split('.');
  if (!iv || !ct) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64url(iv), additionalData: enc.encode(user) }, await aesKey(s), unb64url(ct));
    return dec.decode(pt);
  } catch {
    return null;
  }
}

/** Read one cookie from a Cookie header. */
export function readCookie(header: string | null | undefined, name: string) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
