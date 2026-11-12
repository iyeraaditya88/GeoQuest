import { useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { shareText } from '../../lib/share';
import { storyOf, storyText, type StoryKind } from '../../lib/shareStory';

/** Share this war, battle or voyage: the share sheet, else the clipboard (with a tick). */
export function ShareStory({ kind, id }: { kind: StoryKind; id: string }) {
  const [copied, setCopied] = useState(false);
  const story = storyOf(kind, id);
  if (!story) return null;
  const go = async () => {
    const r = await shareText(`${kind}:${id}`, storyText(story, location.origin));
    if (r === 'copied') { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
  };
  return (
    <button className="icon-btn share-story" onClick={() => void go()} aria-label={copied ? 'Link copied' : `Share ${story.title.toLowerCase().startsWith('sail') ? 'this voyage' : 'this'}`} title="Share">
      {copied ? <Check size={17} /> : <Share2 size={17} />}
    </button>
  );
}
