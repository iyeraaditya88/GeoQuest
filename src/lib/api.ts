// fetch() for our own /api routes. On the hosted site a 401 means the session expired:
// go back to the sign-in page (and return here afterwards).
export async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { credentials: 'same-origin', ...init });
  if (res.status === 401) {
    const back = location.pathname + location.search;
    location.replace(`/login${back !== '/' ? `?next=${encodeURIComponent(back)}` : ''}`);
  }
  return res;
}
