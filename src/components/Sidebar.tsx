import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Binoculars, Dices, Gamepad2, ListOrdered, Landmark, Globe2, History, Keyboard, KeyRound, Map as MapIcon, Mountain, Drill, Brain, SunMoon, ChevronLeft, RotateCcw, RotateCw, Satellite, Search, Sparkles, X, Menu,
} from 'lucide-react';
import { BY_CCA3, flagUrl } from '../lib/data';
import type { MapStyle } from './GlobeView';

export const SIDEBAR_W = { open: 268, rail: 72 } as const;

interface Props {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobile: boolean;
  drawerOpen: boolean;
  setDrawerOpen: (v: boolean) => void;
  hidden: boolean;
  view: 'globe' | 'flat';
  style: MapStyle;
  autoRotate: boolean;
  quizOn: boolean;
  playOn: null | 'top5' | 'capitals' | 'trivia';
  selected: string | null;
  recents: string[];
  ai: boolean | null;
  onSearch: () => void;
  onRandom: () => void;
  onAsk: () => void;
  onConnect: () => void;
  onQuiz: () => void;
  onStreet: () => void;
  antipodeOn: boolean;
  onAntipode: () => void;
  onTop5: () => void;
  onCapitals: () => void;
  onTrivia: () => void;
  onToggleView: () => void;
  onStyle: (s: MapStyle) => void;
  onAutoRotate: () => void;
  nature: boolean;
  onNature: () => void;
  onReset: () => void;
  onPick: (cca3: string) => void;
  onShortcuts: () => void;
}

const STYLES: { id: MapStyle; label: string; icon: typeof Satellite }[] = [
  { id: 'satellite', label: 'Satellite', icon: Satellite },
  { id: 'political', label: 'Political', icon: MapIcon },
  { id: 'daynight', label: 'Day/Night', icon: SunMoon },
];

export function Sidebar(p: Props) {
  const rail = p.collapsed && !p.mobile;
  const width = rail ? SIDEBAR_W.rail : SIDEBAR_W.open;
  const show = p.mobile ? p.drawerOpen : !p.hidden;

  // Close the mobile drawer after any action.
  const act = (fn: () => void) => () => { fn(); if (p.mobile) p.setDrawerOpen(false); };

  return (
    <>
      {p.mobile && !p.hidden && (
        <button className="sb-burger" onClick={() => p.setDrawerOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
      )}
      <AnimatePresence>
        {p.mobile && p.drawerOpen && (
          <motion.div className="sb-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => p.setDrawerOpen(false)} />
        )}
      </AnimatePresence>
      <motion.nav
        className={`sidebar ${rail ? 'is-rail' : ''} ${p.mobile ? 'is-drawer' : ''}`}
        aria-label="Main"
        initial={false}
        animate={{ width, x: show ? 0 : -width - 24 }}
        transition={{ type: 'spring', stiffness: 380, damping: 38, mass: 0.8 }}
      >
        {/* Brand */}
        <div className="sb-head">
          <div className="sb-brand">
            <span className="sb-mark"><Globe2 size={18} /></span>
            <Fade show={!rail}>
              <div className="sb-brand-text"><b>GeoQuest</b><span>Explore · Learn · Guess</span></div>
            </Fade>
          </div>
          {p.mobile && (
            <button className="sb-icon" onClick={() => p.setDrawerOpen(false)} aria-label="Close menu"><X size={18} /></button>
          )}
        </div>

        {/* Search */}
        <div className="sb-pad">
          <button className="sb-search" onClick={act(p.onSearch)} aria-label="Search countries" data-tip={rail ? 'Search  ⌘K' : undefined}>
            <Search size={16} />
            <Fade show={!rail}><span className="sb-search-ph">Search countries…</span></Fade>
            <Fade show={!rail}><kbd>⌘K</kbd></Fade>
          </button>
        </div>

        <div className="sb-scroll">
          <Section title="Explore" rail={rail}>
            <Item icon={Dices} label="Random country" kbd="R" rail={rail} onClick={act(p.onRandom)} />
            <Item icon={Sparkles} label="Ask the Atlas" kbd="A" rail={rail} onClick={act(p.onAsk)} accent />
            <Item icon={Drill} label={p.antipodeOn ? 'Exit antipode finder' : 'Antipode finder'} sub={p.antipodeOn ? undefined : 'Dig straight through the Earth'} kbd="P" rail={rail} active={p.antipodeOn} onClick={act(p.onAntipode)} />
          </Section>

          <Section title="Play" rail={rail}>
            <Item icon={Gamepad2} label={p.quizOn ? 'Exit quiz' : 'Map quiz'} sub={p.quizOn ? undefined : 'Find it · Flags · Clues'} kbd="Q" rail={rail} active={p.quizOn} onClick={act(p.onQuiz)} />
            <Item icon={Binoculars} label="Street View challenge" sub="GeoGuessr-style, 5 rounds" kbd="G" rail={rail} onClick={act(p.onStreet)} />
            <Item icon={ListOrdered} label={p.playOn === 'top5' ? 'Exit Top 5' : 'Name the Top 5'} sub={p.playOn === 'top5' ? undefined : 'Rivers, peaks, populations…'} kbd="T" rail={rail} active={p.playOn === 'top5'} onClick={act(p.onTop5)} />
            <Item icon={Landmark} label={p.playOn === 'capitals' ? 'Exit Capitals' : 'Capitals'} sub={p.playOn === 'capitals' ? undefined : 'Country ↔ capital, 10 a round'} kbd="C" rail={rail} active={p.playOn === 'capitals'} onClick={act(p.onCapitals)} />
            <Item icon={Brain} label={p.playOn === 'trivia' ? 'Exit Geo Trivia' : 'Geo Trivia'} sub={p.playOn === 'trivia' ? undefined : 'Adapts as you go · Easy → Impossible'} kbd="I" rail={rail} active={p.playOn === 'trivia'} onClick={act(p.onTrivia)} />
          </Section>

          <Section title="Map" rail={rail}>
            {rail ? (
              <>
                <Item icon={p.view === 'globe' ? MapIcon : Globe2} label={p.view === 'globe' ? 'Flatten to atlas' : 'Back to globe'} kbd="F" rail onClick={p.onToggleView} active={p.view === 'flat'} />
                <StyleFlyout style={p.style} disabled={p.view === 'flat'} onStyle={p.onStyle} />
              </>
            ) : (
              <>
                <div className="sb-field">
                  <span className="sb-field-label">View <kbd>F</kbd></span>
                  <Segmented
                    value={p.view}
                    options={[{ id: 'globe', label: 'Globe', icon: Globe2 }, { id: 'flat', label: 'Atlas', icon: MapIcon }]}
                    onChange={(v) => v !== p.view && p.onToggleView()}
                  />
                </div>
                <div className={`sb-field ${p.view === 'flat' ? 'is-disabled' : ''}`}>
                  <span className="sb-field-label">Style {p.view === 'flat' && <em>globe only</em>}</span>
                  <Segmented value={p.style} options={STYLES} onChange={(v) => p.onStyle(v as MapStyle)} disabled={p.view === 'flat'} />
                </div>
              </>
            )}
            <Item
              icon={RotateCw}
              label="Auto-rotate"
              kbd={rail ? undefined : 'Space'}
              rail={rail}
              onClick={p.onAutoRotate}
              disabled={p.view === 'flat'}
              trailing={rail ? undefined : <Switch on={p.autoRotate && p.view === 'globe'} />}
              active={rail && p.autoRotate}
            />
            <Item
              icon={Mountain}
              label="Rivers & mountains"
              sub={rail ? undefined : 'Lakes, ranges and peaks'}
              kbd={rail ? undefined : 'N'}
              rail={rail}
              onClick={p.onNature}
              trailing={rail ? undefined : <Switch on={p.nature} />}
              active={rail && p.nature}
            />
            <Item icon={RotateCcw} label="Reset view" rail={rail} onClick={act(p.onReset)} />
          </Section>

          {!rail && p.recents.length > 0 && (
            <Section title="Recently viewed" rail={rail} icon={History}>
              <div className="sb-recents">
                {p.recents.map((c) => {
                  const ct = BY_CCA3.get(c);
                  if (!ct) return null;
                  return (
                    <button key={c} className={`sb-recent ${p.selected === c ? 'on' : ''}`} onClick={act(() => p.onPick(c))}>
                      <img src={flagUrl(ct.cca2, 80)} alt="" />
                      <span>{ct.name}</span>
                    </button>
                  );
                })}
              </div>
            </Section>
          )}
        </div>

        {/* Footer */}
        <div className="sb-foot">
          <button className={`sb-status ${p.ai ? 'ok' : ''}`} onClick={act(p.ai ? p.onAsk : p.onConnect)} data-tip={rail ? (p.ai ? 'Claude connected' : 'Connect Claude') : undefined}>
            {p.ai ? <i className="sb-live" /> : <KeyRound size={15} />}
            <Fade show={!rail}>
              <span className="sb-status-text">
                <b>{p.ai ? 'Claude connected' : 'Connect Claude'}</b>
                <span>{p.ai ? 'Ask anything, anywhere' : 'Unlock open questions'}</span>
              </span>
            </Fade>
          </button>
          <div className="sb-foot-row">
            <button className="sb-icon" onClick={p.onShortcuts} aria-label="Keyboard shortcuts" data-tip="Shortcuts  ?"><Keyboard size={17} /></button>
          </div>
        </div>
      </motion.nav>

      {/* One handle, same place in both states: sits on the sidebar's edge and flips direction. */}
      {!p.mobile && (
        <motion.button
          className={`sb-handle ${rail ? 'is-rail' : ''}`}
          onClick={() => p.setCollapsed(!rail)}
          aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!rail}
          initial={false}
          animate={{ left: width - 14, opacity: show ? 1 : 0, pointerEvents: show ? 'auto' : 'none' }}
          transition={{ type: 'spring', stiffness: 380, damping: 38, mass: 0.8 }}
          whileTap={{ scale: 0.9 }}
        >
          <motion.span animate={{ rotate: rail ? 180 : 0 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
            <ChevronLeft size={15} strokeWidth={2.5} />
          </motion.span>
          <span className="sb-handle-tip">{rail ? 'Expand' : 'Collapse'} <kbd>{rail ? ']' : '['}</kbd></span>
        </motion.button>
      )}
    </>
  );
}

// ── Building blocks ────────────────────────────────────────
function Fade({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.span className="sb-fade" initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0, transition: { delay: 0.08, duration: 0.18 } }} exit={{ opacity: 0, transition: { duration: 0.08 } }}>
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function Section({ title, rail, icon: Icon, children }: { title: string; rail: boolean; icon?: typeof Search; children: ReactNode }) {
  return (
    <section className="sb-section">
      {rail ? <div className="sb-divider" /> : <h4>{Icon && <Icon size={12} />}{title}</h4>}
      <div className="sb-items">{children}</div>
    </section>
  );
}

function Item({ icon: Icon, label, sub, kbd, rail, onClick, active, disabled, trailing, accent }: {
  icon: typeof Search; label: string; sub?: string; kbd?: string; rail: boolean; onClick: () => void;
  active?: boolean; disabled?: boolean; trailing?: ReactNode; accent?: boolean;
}) {
  return (
    <button
      className={`sb-item ${active ? 'on' : ''} ${accent ? 'accent' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={label}
      data-tip={rail ? (kbd ? `${label}  ${kbd}` : label) : undefined}
    >
      {active && <span className="sb-ind" />}
      <span className="sb-ico"><Icon size={18} /></span>
      <Fade show={!rail}>
        <span className="sb-text">
          <span className="sb-label">{label}</span>
          {sub && <span className="sb-sub">{sub}</span>}
        </span>
      </Fade>
      {!rail && (trailing ?? (kbd && <kbd>{kbd}</kbd>))}
    </button>
  );
}

function Switch({ on }: { on: boolean }) {
  return <span className={`sb-switch ${on ? 'on' : ''}`} aria-hidden><i /></span>;
}

function Segmented<T extends string>({ value, options, onChange, disabled }: {
  value: T; options: { id: T; label: string; icon: typeof Search }[]; onChange: (v: T) => void; disabled?: boolean;
}) {
  return (
    <div className="sb-seg" role="radiogroup">
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)} disabled={disabled}>
          {value === o.id && <motion.span layoutId={`seg-${options[0].id}`} className="sb-seg-ink" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          {options.length < 3 && <o.icon size={14} />}{/* three words + icons don't fit the sidebar */}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function StyleFlyout({ style, disabled, onStyle }: { style: MapStyle; disabled: boolean; onStyle: (s: MapStyle) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.sb-flyout-wrap')) setOpen(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const Icon = STYLES.find((s) => s.id === style)!.icon;
  return (
    <div className="sb-flyout-wrap">
      <Item icon={Icon} label={disabled ? 'Map style (globe only)' : 'Map style'} rail onClick={() => setOpen((v) => !v)} active={open} disabled={disabled} />
      <AnimatePresence>
        {open && (
          <motion.div className="sb-flyout" initial={{ opacity: 0, x: -6, scale: 0.97 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -6, scale: 0.97 }} transition={{ duration: 0.16 }}>
            <div className="sb-flyout-title">Map style</div>
            {STYLES.map((s) => (
              <button key={s.id} className={style === s.id ? 'on' : ''} onClick={() => { onStyle(s.id); setOpen(false); }}>
                <s.icon size={15} /> {s.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Shortcuts sheet ────────────────────────────────────────
const SHORTCUTS: [string, string][] = [
  ['⌘K  /', 'Search countries'], ['R', 'Random country'], ['A', 'Ask the Atlas'], ['Q', 'Map quiz'],
  ['G', 'Street View challenge'], ['T', 'Name the Top 5'], ['C', 'Capitals quiz'], ['I', 'Geo Trivia'], ['F', 'Globe ↔ flat atlas'], ['N', 'Rivers & mountains'], ['P', 'Antipode finder'], ['Space', 'Pause / resume rotation'],
  ['[  ]', 'Collapse / expand sidebar'], ['Esc', 'Close / deselect'], ['?', 'This sheet'],
];
const STREET: [string, string][] = [['W  ↑', 'Walk forward'], ['S  ↓', 'Walk back'], ['A D  ← →', 'Turn'], ['Click road', 'Walk that way'], ['Enter', 'Guess / next round']];

export function ShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.div
            className="sheet"
            role="dialog"
            aria-label="Keyboard shortcuts"
            initial={{ y: 16, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 10, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header><Keyboard size={17} /> Keyboard shortcuts <button className="sb-icon" onClick={onClose} aria-label="Close"><X size={17} /></button></header>
            <div className="sheet-cols">
              <ShortcutList title="Everywhere" rows={SHORTCUTS} />
              <ShortcutList title="Street View" rows={STREET} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ShortcutList({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div>
      <h4>{title}</h4>
      <ul>
        {rows.map(([k, d]) => (
          <li key={d}><span>{d}</span><span className="keys">{k.split(/\s{2,}/).map((x) => <kbd key={x}>{x}</kbd>)}</span></li>
        ))}
      </ul>
    </div>
  );
}
