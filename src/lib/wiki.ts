// A picture for a Wikipedia page (its summary thumbnail), fetched once per page and cached.
const photos = new Map<string, Promise<string | null>>();
export function wikiPhoto(page: string): Promise<string | null> {
  if (!photos.has(page)) {
    photos.set(page, fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { thumbnail?: { source?: string } } | null) => j?.thumbnail?.source ?? null)
      .catch(() => null));
  }
  return photos.get(page)!;
}
