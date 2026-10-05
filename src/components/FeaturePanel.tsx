import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ExternalLink, Flag, MessageCircle, Mountain, MountainSnow, Ruler, Triangle, Waves, X } from 'lucide-react';
import { BY_CCA3, flagUrl } from '../lib/data';
import { displayName, wikiSummary, type FeatureInfo, type WikiSummary } from '../lib/features';

const KIND = {
  river: { label: 'River', icon: Waves, tone: 'water' },
  lake: { label: 'Lake', icon: Waves, tone: 'water' },
  range: { label: 'Mountain range', icon: MountainSnow, tone: 'earth' },
  peak: { label: 'Peak', icon: Triangle, tone: 'earth' },
} as const;

const item = {
  hidden: { opacity: 0, y: 8 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.04 + i * 0.03, duration: 0.3, ease: [0.22, 1, 0.36, 1] as const } }),
};

interface Props {
  feature: FeatureInfo | null;
  onClose: () => void;
  onSelectCountry: (cca3: string) => void;
  onAsk: (prompt: string) => void;
}

/** Side panel for a river, lake, mountain range or peak. */
export function FeaturePanel({ feature, onClose, onSelectCountry, onAsk }: Props) {
  return (
    <AnimatePresence>
      {feature && (
        <motion.aside key="feature" className="panel" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 300, damping: 36, mass: 0.9 }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={`${feature.kind}:${feature.name}`} className="panel-inner" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
              <Body f={feature} onClose={onClose} onSelectCountry={onSelectCountry} onAsk={onAsk} />
            </motion.div>
          </AnimatePresence>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function Body({ f, onClose, onSelectCountry, onAsk }: { f: FeatureInfo } & Omit<Props, 'feature'>) {
  const k = KIND[f.kind];
  const title = displayName(f);
  const [wiki, setWiki] = useState<WikiSummary | null | undefined>(undefined); // undefined = loading
  const [imgReady, setImgReady] = useState(false);
  useEffect(() => {
    let live = true;
    setWiki(undefined); setImgReady(false);
    void wikiSummary(f, f.countries).then((w) => { if (live) setWiki(w); });
    return () => { live = false; };
  }, [f]);

  const facts: { icon: typeof Ruler; label: string; value: string; sub?: string }[] = [];
  if (f.kind === 'river') {
    if (wiki?.lengthKm) facts.push({ icon: Ruler, label: 'Length', value: `${wiki.lengthKm.toLocaleString('en-US')} km` });
    else if (f.river && wiki !== undefined) facts.push({ icon: Ruler, label: 'Mapped length', value: `≈ ${f.river.km.toLocaleString('en-US')} km`, sub: 'as drawn on this map' });
  }
  if (f.kind === 'peak' && f.elevation) facts.push({ icon: Mountain, label: 'Elevation', value: `${f.elevation.toLocaleString('en-US')} m` });
  if (f.kind === 'range' && f.peaks?.[0]) facts.push({ icon: Mountain, label: 'Highest mapped peak', value: f.peaks[0].name, sub: `${f.peaks[0].e.toLocaleString('en-US')} m` });
  const countries = f.countries.map((c) => BY_CCA3.get(c)).filter(Boolean) as NonNullable<ReturnType<typeof BY_CCA3.get>>[];
  const where = { river: 'Flows through', lake: 'Shores in', range: 'Spans', peak: 'In' }[f.kind];

  return (
    <>
      <div className={`hero feature-hero tone-${k.tone} ${wiki?.thumbnail && !imgReady ? 'is-loading' : ''}`}>
        {wiki?.thumbnail && (
          <motion.img className="hero-flag" src={wiki.thumbnail} alt="" onLoad={() => setImgReady(true)} onError={() => setImgReady(true)}
            initial={{ opacity: 0, scale: 1.06 }} animate={imgReady ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 1.06 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} />
        )}
        {!wiki?.thumbnail && <k.icon className="feature-glyph" size={96} strokeWidth={1.1} />}
        <div className="hero-shade" />
        <button className="icon-btn hero-close" onClick={onClose} aria-label="Close panel"><X size={18} /></button>
        <div className="hero-text">
          <motion.div className="chips" variants={item} initial="hidden" animate="show" custom={0}>
            <span className="chip"><k.icon size={12} /> {k.label}</span>
          </motion.div>
          <motion.h2 variants={item} initial="hidden" animate="show" custom={1}>{title}</motion.h2>
          {wiki?.description && <motion.p className="official" variants={item} initial="hidden" animate="show" custom={2}>{wiki.description}</motion.p>}
        </div>
      </div>

      <div className="panel-scroll">
        {facts.length > 0 && (
          <div className="stats">
            {facts.map((s, i) => (
              <motion.div key={s.label} className="stat" variants={item} initial="hidden" animate="show" custom={i + 2}>
                <s.icon size={16} className="stat-icon" />
                <div>
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value">{s.value}</div>
                  {s.sub && <div className="stat-sub">{s.sub}</div>}
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {countries.length > 0 && (
          <motion.div variants={item} initial="hidden" animate="show" custom={4}>
            <div className="section-title"><Flag size={13} /> {where}</div>
            <div className="neighbours">
              {countries.map((c) => (
                <button key={c.cca3} className="nb" onClick={() => onSelectCountry(c.cca3)}>
                  <img src={flagUrl(c.cca2, 80)} alt="" /> {c.name}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {f.kind === 'range' && f.peaks && f.peaks.length > 1 && (
          <motion.div variants={item} initial="hidden" animate="show" custom={5}>
            <div className="section-title"><Mountain size={13} /> Highest peaks</div>
            <ul className="feature-peaks">
              {f.peaks.map((p) => <li key={p.name}><Triangle size={11} /> <b>{p.name}</b><span>{p.e.toLocaleString('en-US')} m</span></li>)}
            </ul>
          </motion.div>
        )}

        <motion.div className="feature-about" variants={item} initial="hidden" animate="show" custom={6}>
          {wiki === undefined ? (
            <><i className="sk sk-line" /><i className="sk sk-line" /><i className="sk sk-line short" /></>
          ) : wiki ? (
            <>
              <p>{wiki.extract}</p>
              <a href={wiki.url} target="_blank" rel="noreferrer">Read more on Wikipedia <ExternalLink size={12} /></a>
            </>
          ) : (
            <p className="muted">No encyclopedia summary found — ask the Atlas below.</p>
          )}
        </motion.div>
      </div>

      <div className="panel-foot">
        <button className="primary" onClick={() => onAsk(`Tell me about the ${title}${countries.length ? ` (${countries.slice(0, 3).map((c) => c.name).join(', ')})` : ''}.`)}>
          <MessageCircle size={16} /> Ask the Atlas about the {title}
        </button>
      </div>
    </>
  );
}
