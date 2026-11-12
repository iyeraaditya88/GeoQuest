import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Castle, Hourglass, Play, Ship, Swords, X } from 'lucide-react';
import { track } from '../lib/analytics';
import { localDate } from '../lib/daily';
import { narrator } from '../lib/narrator';
import type { StoryPick } from '../lib/historyIndex';
import type { StoryKind } from '../lib/shareStory';

export type HistoryKey = 'battles' | 'voyages' | 'eras' | 'empires';

interface Props {
  onPick: (k: HistoryKey) => void;
  onStory: (kind: StoryKind, id: string) => void;
  onClose: () => void;
}

/** Today's narrated story (and how long it runs), once the index has loaded. */
export function useStoryOfDay() {
  const [story, setStory] = useState<(StoryPick & { min: number | null }) | null>(null);
  useEffect(() => {
    let live = true;
    void import('../lib/historyIndex').then(async ({ storyOfDay }) => {
      const s = storyOfDay(localDate());
      if (live) setStory({ ...s, min: null });
      const min = await narrator.minutes(s.kind, s.id);
      if (live && min) setStory({ ...s, min });
    });
    return () => { live = false; };
  }, []);
  return story;
}

const ICONS = { war: Swords, battle: Swords, voyage: Ship };

/** History, one tap away: what the History button opens. */
export function HistorySheet({ onPick, onStory, onClose }: Props) {
  const startY = useRef<number | null>(null);
  const story = useStoryOfDay();
  useEffect(() => { track('open', { w: 'history' }); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const items: { key: HistoryKey; icon: typeof Swords; name: string; line: string; tone: string; told?: boolean }[] = [
    { key: 'battles', icon: Swords, name: 'Battles and Wars', line: 'Plassey, Stalingrad, both world wars', tone: 'rose', told: true },
    { key: 'voyages', icon: Ship, name: 'Famous voyages', line: 'Columbus, Magellan, Cook & more', tone: 'blue', told: true },
    { key: 'eras', icon: Hourglass, name: 'Eras of civilization', line: 'Stone Age to today', tone: 'amber' },
    { key: 'empires', icon: Castle, name: 'Empires of the world', line: 'Rome, the Ottomans, the Mughals & more', tone: 'violet' },
  ];
  const StoryIcon = story ? ICONS[story.icon] : Swords;

  return (
    <motion.div className="people-backdrop gs-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section className="gs-sheet hs-sheet" role="dialog" aria-modal="true" aria-labelledby="hs-title" onClick={(e) => e.stopPropagation()}
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} transition={{ type: 'spring', stiffness: 340, damping: 32 }}
        onTouchStart={(e) => { startY.current = e.touches[0].clientY; }}
        onTouchEnd={(e) => { if (startY.current !== null && e.changedTouches[0].clientY - startY.current > 60) onClose(); startY.current = null; }}>
        <span className="gs-grab" aria-hidden />
        <header className="gs-head">
          <h2 id="hs-title">History</h2>
          <span>Wars, voyages and empires, told on the globe</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <button className={`hs-day ${story ? '' : 'is-loading'}`} disabled={!story} onClick={() => { if (!story) return; track('launch', { g: 'story-day', s: story.id }); onStory(story.kind, story.id); }}
          aria-label={story ? `Story of the day: ${story.title}. Play it, narrated` : 'Story of the day'}>
          <span className="hs-day-label">★ Story of the day</span>
          <span className="hs-day-row">
            <span className="hs-day-icon"><StoryIcon size={20} /></span>
            <span className="hs-day-text">
              <b>{story?.title ?? ' '}</b>
              <span>{story?.line ?? ' '}</span>
              <em>Narrated{story?.min ? ` · ${story.min} min` : ''}</em>
            </span>
            <span className="hs-day-play" aria-hidden><Play size={18} fill="currentColor" /></span>
          </span>
        </button>
        <div className="gs-grid hs-grid">
          {items.map(({ key, icon: Icon, name, line, tone, told }) => (
            <button key={key} className={`gs-card t-${tone}`} onClick={() => { track('launch', { g: key, v: 'history' }); onPick(key); }}>
              <span className="gs-icon"><Icon size={20} /></span>
              <span className="gs-text"><b>{name}</b><span>{line}</span></span>
              {told && <span className="hs-told">Narrated</span>}
            </button>
          ))}
        </div>
      </motion.section>
    </motion.div>
  );
}
