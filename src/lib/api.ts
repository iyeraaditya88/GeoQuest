// fetch() for our own /api routes. A 401 means this needs an account. For a guest that's just a
// background call they can't make — say nothing (features that need an account ask, with a reason,
// when someone reaches for them). For someone whose sign-in has just expired: carry on as a guest,
// with a quiet note. Never a hard redirect away from the globe.
import { getAuth, setAuth, signedOut } from './session';

export async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { credentials: 'same-origin', ...init });
  if (res.status === 401) {
    const a = getAuth();
    if (a.user) { setAuth({ hosted: a.hosted, user: null, role: null }); signedOut(); }
  }
  return res;
}
