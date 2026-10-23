// Demo mode (?demo=1), for recording marketing videos: no footer, feedback button, nudges or
// sign-in prompts on screen, no music, and the visit isn't counted in analytics. It sticks for the
// browser session, so the app can navigate without losing it.
const KEY = 'gq-demo';
function detect() {
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(location.search).get('demo') === '1') { sessionStorage.setItem(KEY, '1'); return true; }
    return sessionStorage.getItem(KEY) === '1';
  } catch { return false; }
}
export const DEMO = detect();
if (DEMO) document.documentElement.classList.add('demo');
