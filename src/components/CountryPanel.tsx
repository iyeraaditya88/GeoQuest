import { useEffect, useState } from 'react';
import { AnimatePresence, motion, animate } from 'motion/react';
import {
  Building2, Car, Clock, Coins, Globe2, Landmark, Languages, Lightbulb, Maximize2, MessageCircle, Mountain,
  MountainSnow, Phone, Signpost, Sparkles, Sun, TreePine, Type, Users, Waves, X, Route, CarFront, Trophy,
} from 'lucide-react';
import { BY_CCA3, autoTips, curatedFor, flagUrl, fmtInt, rankOf, type Country } from '../lib/data';
import type { TipKind } from '../data/curated';

const TIP_ICON: Record<TipKind, typeof Type> = {
  script: Type, road: Route, nature: TreePine, build: Building2, car: CarFront, sign: Signpost, misc: Lightbulb,
};

function CountUp({ value }: { value: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const ctl = animate(0, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1], onUpdate: (x) => setV(x) });
    return () => ctl.stop();
  }, [value]);
  return <>{fmtInt(Math.round(v))}</>;
}

const item = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.04 + Math.min(i, 12) * 0.018, duration: 0.32, ease: [0.22, 1, 0.36, 1] as const } }),
};

interface Props {
  country: Country | null;
  onClose: () => void;
  onSelect: (cca3: string) => void;
  onAsk: (prompt: string) => void;
}

type Tab = 'overview' | 'geoguessr';

export function CountryPanel({ country, onClose, onSelect, onAsk }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  useEffect(() => setTab('overview'), [country?.cca3]);

  return (
    <AnimatePresence>
      {country && (
        <motion.aside
          key="dock"
          className="panel"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 36, mass: 0.9 }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={country.cca3}
              className="panel-inner"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <PanelBody country={country} tab={tab} setTab={setTab} onClose={onClose} onSelect={onSelect} onAsk={onAsk} />
            </motion.div>
          </AnimatePresence>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function PanelBody({ country: c, tab, setTab, onClose, onSelect, onAsk }: Props & { country: Country; tab: Tab; setTab: (t: Tab) => void }) {
  const cur = curatedFor(c.cca3);
  const popRank = rankOf(c, 'population');
  const areaRank = rankOf(c, 'area');
  const neighbours = c.borders.map((b) => BY_CCA3.get(b)).filter(Boolean) as Country[];
  const density = c.area ? Math.round(c.population / c.area) : 0;

  const stats = [
    { icon: Landmark, label: 'Capital', value: c.capital.join(', ') || '—' },
    { icon: Users, label: 'Population', value: <CountUp value={c.population} />, sub: popRank ? `#${popRank} in the world` : undefined },
    { icon: Maximize2, label: 'Area', value: `${fmtInt(Math.round(c.area))} km²`, sub: areaRank ? `#${areaRank} by size · ${fmtInt(density)}/km²` : undefined },
    { icon: Languages, label: c.languages.length > 1 ? 'Languages' : 'Language', value: c.languages.slice(0, 4).join(', ') || '—' },
    { icon: Coins, label: 'Currency', value: c.currencies.map((x) => `${x.name}${x.symbol ? ` (${x.symbol})` : ''}`).join(', ') || '—' },
    { icon: Car, label: 'Drives on', value: c.drive === 'left' ? 'Left ⬅' : 'Right ➡' },
    { icon: Phone, label: 'Calling code', value: c.idd || '—' },
    { icon: Globe2, label: 'Web domain', value: c.tld.join(' ') || '—' },
  ];

  const [flagReady, setFlagReady] = useState(false);
  const [flagFor, setFlagFor] = useState(c.cca2);
  if (flagFor !== c.cca2) { setFlagFor(c.cca2); setFlagReady(false); } // new country: wait for its flag

  const curTips = cur?.tips ?? [];
  const hasDrive = curTips.some((t) => /drives on/i.test(t.t));
  const hasScript = curTips.some((t) => t.k === 'script');
  const tips = [...curTips, ...autoTips(c).filter((t) => !(hasDrive && /drives on/i.test(t.t)) && !(hasScript && t.k === 'script'))];

  return (
    <>
      <div className={`hero ${flagReady ? '' : 'is-loading'}`}>
        <motion.img
          key={c.cca2}
          className="hero-flag"
          src={flagUrl(c.cca2, 640)}
          alt={`Flag of ${c.name}`}
          decoding="async"
          // Reveal when the image has actually arrived (instant when prefetched on hover).
          onLoad={() => setFlagReady(true)}
          onError={() => setFlagReady(true)}
          initial={{ scale: 1.08, opacity: 0 }}
          animate={flagReady ? { scale: 1, opacity: 1 } : { scale: 1.08, opacity: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        />
        <div className="hero-shade" />
        <button className="icon-btn hero-close" onClick={onClose} aria-label="Close panel"><X size={18} /></button>
        <div className="hero-text">
          <motion.div className="chips" variants={item} initial="hidden" animate="show" custom={0}>
            <span className="chip">{c.region}</span>
            {c.subregion && <span className="chip ghost">{c.subregion}</span>}
            {c.landlocked && <span className="chip ghost">Landlocked</span>}
            {!c.independent && <span className="chip warn">Territory</span>}
          </motion.div>
          <motion.h2 variants={item} initial="hidden" animate="show" custom={1}>{c.name}</motion.h2>
          {c.official !== c.name && <motion.p className="official" variants={item} initial="hidden" animate="show" custom={2}>{c.official}</motion.p>}
        </div>
      </div>

      <div className="tabs" role="tablist">
        {(['overview', 'geoguessr'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t === 'overview' ? 'Overview' : <><Trophy size={14} /> GeoGuessr</>}
            {tab === t && <motion.span layoutId="tab-ink" className="tab-ink" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
          </button>
        ))}
      </div>

      <div className="panel-scroll">
        <AnimatePresence mode="wait">
          {tab === 'overview' ? (
            <motion.div key="ov" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
              <div className="stats">
                {stats.map((s, i) => (
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

              <h3 className="section-title">Natural landmarks</h3>
              {cur ? (
                <div className="landmarks">
                  <Landmark3 icon={Waves} tone="blue" label="Longest river" value={cur.river} i={10} />
                  <Landmark3 icon={MountainSnow} tone="violet" label="Highest peak" value={cur.peak} i={11} />
                  {cur.range && cur.range !== '—' && <Landmark3 icon={Mountain} tone="green" label="Mountain range" value={cur.range} i={12} />}
                </div>
              ) : (
                <button className="ghost-cta" onClick={() => onAsk(`What are the longest river, highest mountain and main mountain range in ${c.name}?`)}>
                  <Sparkles size={15} /> Ask the Atlas for rivers & mountains
                </button>
              )}
              {cur?.fact && (
                <motion.div className="fact" variants={item} initial="hidden" animate="show" custom={13}>
                  <Sun size={15} /> {cur.fact}
                </motion.div>
              )}

              <h3 className="section-title">Time</h3>
              <div className="tz"><Clock size={14} /> {c.timezones.slice(0, 4).join(' · ')}{c.timezones.length > 4 ? ` +${c.timezones.length - 4} more` : ''}</div>

              {neighbours.length > 0 && (
                <>
                  <h3 className="section-title">Neighbours <span className="count">{neighbours.length}</span></h3>
                  <div className="neighbours">
                    {neighbours.map((nb) => (
                      <button key={nb.cca3} className="nb" onClick={() => onSelect(nb.cca3)}>
                        <img src={flagUrl(nb.cca2, 80)} alt="" /> {nb.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          ) : (
            <motion.div key="gg" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
              <p className="gg-intro">How to recognise <b>{c.name}</b> from a single Street View frame:</p>
              <ul className="tips">
                {tips.map((tip, i) => {
                  const Icon = TIP_ICON[tip.k];
                  const auto = i >= (cur?.tips.length ?? 0);
                  return (
                    <motion.li key={i} variants={item} initial="hidden" animate="show" custom={i}>
                      <span className={`tip-icon k-${tip.k}`}><Icon size={15} /></span>
                      <span>{tip.t}</span>
                      {auto && <span className="auto">data</span>}
                    </motion.li>
                  );
                })}
              </ul>
              <button className="ghost-cta" onClick={() => onAsk(`Give me the 6 best GeoGuessr tips for recognising ${c.name} (bollards, road lines, plates, poles, signs, vegetation, architecture), and how to tell it apart from look-alike countries.`)}>
                <Sparkles size={15} /> More pro tips from the Atlas
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="panel-foot">
        <button className="primary" onClick={() => onAsk('')}>
          <MessageCircle size={16} /> Ask anything about {c.name}
        </button>
      </div>
    </>
  );
}

function Landmark3({ icon: Icon, tone, label, value, i }: { icon: typeof Waves; tone: string; label: string; value: string; i: number }) {
  return (
    <motion.div className={`lm tone-${tone}`} variants={item} initial="hidden" animate="show" custom={i}>
      <span className="lm-icon"><Icon size={18} /></span>
      <div>
        <div className="stat-label">{label}</div>
        <div className="lm-value">{value}</div>
      </div>
    </motion.div>
  );
}
