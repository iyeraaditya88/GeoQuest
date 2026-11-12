import { useEffect, useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { shareText } from '../../lib/share';
import type { Story, StoryKind } from '../../lib/shareStory';

/**
 * Share this war, battle or voyage: the share sheet, else the clipboard (with a tick). Its words
 * load with the story (they come with every battle and war, which the home screen shouldn't pay
 * for), ready before the tap: a phone's share sheet only opens straight from one.
 */
export function ShareStory({ kind, id }: { kind: StoryKind; id: string }) {
  const [copied, setCopied] = useState(false);
  const [said, setSaid] = useState<{ story: Story; text: string } | null>(null);
  useEffect(() => {
    let live = true;
    void import('../../lib/shareStory').then(({ storyOf, storyText }) => {
      const story = storyOf(kind, id);
      if (live) setSaid(story ? { story, text: storyText(story, location.origin) } : null);
    }).catch(() => null); // (offline: no share button, the story plays on)
    return () => { live = false; };
  }, [kind, id]);
  if (!said) return null;
  const go = async () => {
    const r = await shareText(`${kind}:${id}`, said.text);
    if (r === 'copied') { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
  };
  return (
    <button className="icon-btn share-story" onClick={() => void go()} aria-label={copied ? 'Link copied' : `Share ${said.story.title.toLowerCase().startsWith('sail') ? 'this voyage' : 'this'}`} title="Share">
      {copied ? <Check size={17} /> : <Share2 size={17} />}
    </button>
  );
}
