// Sharing a war, a battle or a voyage: the link opens it straight away, and the same words title
// the message and the link's preview (see middleware.ts). Pure data, so the edge can use it too.
import { BY_BATTLE } from './battles.js';
import { WORLD_WARS } from './worldWars.js';
import { BY_VOYAGE } from './voyages.js';

export type StoryKind = 'battles' | 'voyages';
export interface Story { title: string; line: string; path: string }

/** What a shared link to a war, battle or voyage says about it (null if there's no such thing). */
export function storyOf(kind: string | null, id: string | null): Story | null {
  if (!id) return null;
  if (kind === 'battles') {
    const war = WORLD_WARS[id as keyof typeof WORLD_WARS];
    if (war) return { title: `${war.name}, told on a map, narrated`, line: war.line, path: `/?explore=battles&id=${id}` };
    const b = BY_BATTLE.get(id);
    if (b) return { title: `${b.name}, told on a map, narrated`, line: b.line, path: `/?explore=battles&id=${id}` };
  }
  if (kind === 'voyages') {
    const v = BY_VOYAGE.get(id);
    if (v) return { title: `Sail with ${v.voyager}: ${v.title}`, line: v.tagline, path: `/?explore=voyages&id=${id}` };
  }
  return null;
}

/** The message: the title, the one line, and the link. */
export const storyText = (s: Story, origin: string) => `🗺️ ${s.title} · GeoQuest\n${s.line}\n${origin}${s.path}&ref=share`;
