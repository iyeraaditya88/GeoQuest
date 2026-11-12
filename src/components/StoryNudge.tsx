import { Play, Ship, Swords } from 'lucide-react';
import { track } from '../lib/analytics';
import type { StoryKind } from '../lib/shareStory';
import { useStoryOfDay } from './HistorySheet';

/** After a game: one quiet line inviting you into today's narrated story. */
export function StoryNudge({ from, onStory }: { from: string; onStory: (kind: StoryKind, id: string) => void }) {
  const story = useStoryOfDay();
  if (!story) return null;
  const Icon = story.icon === 'voyage' ? Ship : Swords;
  return (
    <button className="story-nudge" onClick={() => { track('launch', { g: 'story-nudge', s: story.id, from }); onStory(story.kind, story.id); }}>
      <span className="story-nudge-icon"><Icon size={16} /></span>
      <span className="story-nudge-text">
        <em>Next: today’s story</em>
        <b>{story.title}</b>
        <span>Narrated{story.min ? ` · ${story.min} min` : ''}</span>
      </span>
      <span className="cp-story-play" aria-hidden><Play size={13} fill="currentColor" /></span>
    </button>
  );
}
