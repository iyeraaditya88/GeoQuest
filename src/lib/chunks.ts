// After a deploy, a tab that was already open still asks for the old build's code files, which
// are gone — so opening a game would fail. When that happens, reload once onto the new version.
const KEY = 'gq-reloaded-at';

/** A code file (chunk) that couldn't be loaded — usually because a newer version was deployed. */
export const isChunkError = (err: unknown) =>
  /dynamically imported module|Importing a module script failed|error loading dynamically imported|Unable to preload|Failed to load module script/i.test(String((err as Error)?.message ?? err));

/** Reload the page, at most once every 30 s (so a real outage can't cause a reload loop). */
export function reloadForUpdate(): boolean {
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < 30_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { return false; }
  location.reload();
  return true;
}

/** Wrap a dynamic import: on a stale-version failure, reload instead of crashing. */
export function fresh<T>(load: Promise<T>): Promise<T> {
  return load.catch((err) => {
    if (isChunkError(err) && reloadForUpdate()) return new Promise<T>(() => {}); // the page is reloading
    throw err;
  });
}
