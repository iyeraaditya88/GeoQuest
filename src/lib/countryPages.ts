// Shared by the country-page generator (scripts/country-pages.ts), the middleware and the app:
// which countries get a page, and their address (/country/<slug>).

/** "Côte d'Ivoire" → "cote-divoire", "São Tomé and Príncipe" → "sao-tome-and-principe" */
export const slugify = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const countrySlug = (c: { name: string }) => slugify(c.name);

/** Countries and territories with enough to say: a name, a flag code and people living there. */
export const pageCountries = <T extends { name: string; cca2: string; population: number }>(all: T[]) =>
  all.filter((c) => c.name && c.cca2 && c.population > 0);

/** /country/<slug>: a page address the middleware serves (letters, digits and dashes only). */
export const isCountryPath = (path: string) => /^\/country\/[a-z0-9-]{2,60}$/.test(path);
