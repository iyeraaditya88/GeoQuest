import { useEffect } from 'react';
import { motion } from 'motion/react';
import { MessageCircle, X } from 'lucide-react';
import type { FeedbackReply } from '../lib/feedback';

const when = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** What GeoQuest wrote back to a player's feedback: newest first, each under what they said. */
export function FeedbackReplies({ replies, onWriteBack, onClose }: { replies: FeedbackReply[]; onWriteBack: () => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div className="people-backdrop si-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section className="si-sheet fb-sheet" role="dialog" aria-modal="true" aria-labelledby="fb-replies-title" onClick={(e) => e.stopPropagation()}
        initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
        <button className="icon-btn si-close" onClick={onClose} aria-label="Close"><X size={17} /></button>
        <h2 id="fb-replies-title">Replies from GeoQuest</h2>
        {replies.length ? (
          <ul className="fb-replies">
            {replies.map((r) => (
              <li key={`${r.id}-${r.at}`}>
                <p className="fb-yours"><b>You wrote:</b> {r.message}</p>
                <div className="fb-answer">
                  <span>GeoQuest · {when(r.at)}</span>
                  <p>{r.reply}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="si-sub">No replies here yet.</p>}
        <div className="si-actions">
          <button className="primary si-go" onClick={onWriteBack}><MessageCircle size={16} /> Write back</button>
        </div>
      </motion.section>
    </motion.div>
  );
}
