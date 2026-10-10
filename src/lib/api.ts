// fetch() for our own /api routes. A 401 means this needs an account (a guest), or a sign-in that
// has just expired: either way, offer to sign in — never a hard redirect away from the globe.
import { getAuth, needSignIn, setAuth } from './session';

export async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { credentials: 'same-origin', ...init });
  if (res.status === 401) {
    const a = getAuth();
    if (a.user) { setAuth({ hosted: a.hosted, user: null, role: null }); needSignIn('expired'); }
    else if (a.known && a.hosted) needSignIn('general');
  }
  return res;
}
