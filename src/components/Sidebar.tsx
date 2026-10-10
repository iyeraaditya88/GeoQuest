import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BarChart3, BellRing, Binoculars, Brain, CalendarDays, Check, ChevronLeft, Dices, Drill, Gamepad2, Globe2, History, KeyRound, Landmark, Link2, ListOrdered, LogOut, Map as MapIcon, MapPinned, Menu, Mountain, RotateCcw, RotateCw, Satellite, Search, Sparkles, SunMoon, Swords, UserRound, Users, X } from 'lucide-react';
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
  hosted?: boolean;
  /** Signed-in user on the hosted site (null locally). */
  user?: string | null;
  onSignOut?: () => void;
  /** Owner on the hosted site: open the People panel. */
  onPeople?: () => void;
  onActivity?: () => void;
  onQuiz: () => void;
  /** Today's Daily challenge: done yet, the streak, and the theme */
  daily?: { done: boolean; streak: number; theme: string };
  dailyOn?: boolean;
  onDaily: () => void;
  /** Morning reminders (notifications) */
  onReminders?: () => void;
  remindersOn?: boolean;
  onStreet: () => void;
  antipodeOn: boolean;
  /** My places: pins for home, friends and favourite spots */
  onPlaces: () => void;
  placesOn?: boolean;
  onAntipode: () => void;
  onTop5: () => void;
  onCapitals: () => void;
  onTrivia: () => void;
  /** Live head-to-head (absent when live play isn't available) */
  onFriends?: () => void;
  onInvite?: () => void;
  friendsOnline?: number;
  matchOn?: boolean;
  onToggleView: () => void;
  onStyle: (s: MapStyle) => void;
  onAutoRotate: () => void;
  nature: boolean;
  onNature: () => void;
  onReset: () => void;
  onPick: (cca3: string) => void;
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
            <span className="sb-mark"><img src="/icons/icon-192.png" alt="" width={40} height={40} /></span>
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
            <Item icon={Dices} label="Random country" rail={rail} onClick={act(p.onRandom)} />
            <Item icon={Sparkles} label="Ask the Atlas" rail={rail} onClick={act(p.onAsk)} accent />
            <Item icon={Drill} label={p.antipodeOn ? 'Exit antipode finder' : 'Antipode finder'} sub={p.antipodeOn ? undefined : 'Dig straight through the Earth'} rail={rail} active={p.antipodeOn} onClick={act(p.onAntipode)} />
            <Item icon={MapPinned} label={p.placesOn ? 'Close My places' : 'My places'} sub={p.placesOn ? undefined : 'Pin home, friends & favourite spots'} rail={rail} active={p.placesOn} onClick={act(p.onPlaces)} />
          </Section>

          <Section title="Play" rail={rail} action={p.onFriends && (
            <span className="sb-play-actions">
              <button className={`sb-pill ${p.matchOn ? 'on' : ''}`} onClick={act(p.onFriends)} title="Challenge friends who are online">
                <Swords size={12} /> Challenge{p.friendsOnline ? <span className="sb-online" aria-label={`${p.friendsOnline} online`}><i />{p.friendsOnline}</span> : null}
              </button>
              {p.onInvite && <button className="sb-pill" onClick={act(p.onInvite)} title="Invite anyone with a link"><Link2 size={12} /> Invite</button>}
            </span>
          )}>
            {rail && p.onFriends && <Item icon={Swords} label="Challenge friends" rail onClick={act(p.onFriends)} active={p.matchOn} accent />}
            {rail && p.onInvite && <Item icon={Link2} label="Invite with a link" rail onClick={act(p.onInvite)} />}
            <Item icon={CalendarDays} label={p.dailyOn ? 'Exit Daily' : 'Daily challenge'} active={p.dailyOn} sub={p.dailyOn ? undefined : p.daily ? (p.daily.done ? `Done today${p.daily.streak > 1 ? ` · 🔥 ${p.daily.streak}` : ''}` : `Find 5 countries on the globe${p.daily.streak > 1 ? ` · 🔥 ${p.daily.streak}` : ''}`) : 'Find 5 countries, new every day'}
              rail={rail} onClick={act(p.onDaily)} accent
              trailing={!p.dailyOn && p.daily && (p.daily.done ? <span className="sb-done" aria-label="Done today"><Check size={13} /></span> : <span className="sb-new">New</span>)} />
            <Item icon={Gamepad2} label={p.quizOn ? 'Exit quiz' : 'Map quiz'} sub={p.quizOn ? undefined : 'Find it · Flags · Clues'} rail={rail} active={p.quizOn} onClick={act(p.onQuiz)} />
            <Item icon={Binoculars} label="Street View challenge" sub="GeoGuessr-style, 5 rounds" rail={rail} onClick={act(p.onStreet)} />
            <Item icon={ListOrdered} label={p.playOn === 'top5' ? 'Exit Top 5' : 'Name the Top 5'} sub={p.playOn === 'top5' ? undefined : 'Rivers, peaks, populations…'} rail={rail} active={p.playOn === 'top5'} onClick={act(p.onTop5)} />
            <Item icon={Landmark} label={p.playOn === 'capitals' ? 'Exit Capitals' : 'Capitals'} sub={p.playOn === 'capitals' ? undefined : 'Country ↔ capital, 10 a round'} rail={rail} active={p.playOn === 'capitals'} onClick={act(p.onCapitals)} />
            <Item icon={Brain} label={p.playOn === 'trivia' ? 'Exit Geo Trivia' : 'Geo Trivia'} sub={p.playOn === 'trivia' ? undefined : 'Adapts as you go · Easy → Impossible'} rail={rail} active={p.playOn === 'trivia'} onClick={act(p.onTrivia)} />
          </Section>

          <Section title="Map" rail={rail}>
            {rail ? (
              <>
                <Item icon={p.view === 'globe' ? MapIcon : Globe2} label={p.view === 'globe' ? 'Flatten to atlas' : 'Back to globe'} rail onClick={p.onToggleView} active={p.view === 'flat'} />
                <StyleFlyout style={p.style} disabled={p.view === 'flat'} onStyle={p.onStyle} />
              </>
            ) : (
              <>
                <div className="sb-field">
                  <span className="sb-field-label">View</span>
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
                <span>{p.ai ? 'Ask anything, anywhere' : p.hosted ? 'Use your own Anthropic key' : 'Unlock open questions'}</span>
              </span>
            </Fade>
          </button>
          <div className="sb-foot-row">
            {p.user && (
              <>
                <Fade show={!rail}><span className="sb-user" title={`Signed in as ${p.user}`}><UserRound size={13} /> {p.user}</span></Fade>
                {p.onReminders && <button className={`sb-icon ${p.remindersOn ? 'lit' : ''}`} onClick={p.onReminders} aria-label="Morning reminder" data-tip={p.remindersOn ? 'Morning reminder: on' : 'Morning reminder'}><BellRing size={16} /><span className="sb-icon-label">Reminder</span></button>}
                {p.onActivity && <button className="sb-icon" onClick={p.onActivity} aria-label="Activity" data-tip="Activity — who’s playing"><BarChart3 size={16} /><span className="sb-icon-label">Activity</span></button>}
                {p.onPeople && <button className="sb-icon" onClick={p.onPeople} aria-label="People" data-tip="People — invite friends"><Users size={16} /><span className="sb-icon-label">People</span></button>}
                <button className="sb-icon sb-signout" onClick={p.onSignOut} aria-label="Sign out" data-tip="Sign out"><LogOut size={16} /><span className="sb-icon-label">Sign out</span></button>
              </>
            )}
            {!p.user && p.onReminders && <button className={`sb-icon ${p.remindersOn ? 'lit' : ''}`} onClick={p.onReminders} aria-label="Morning reminder" data-tip="Morning reminder"><BellRing size={16} /><span className="sb-icon-label">Reminder</span></button>}
            {!p.user && p.onActivity && <button className="sb-icon" onClick={p.onActivity} aria-label="Activity" data-tip="Activity — who’s playing"><BarChart3 size={16} /><span className="sb-icon-label">Activity</span></button>}
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
          <span className="sb-handle-tip">{rail ? 'Expand' : 'Collapse'}</span>
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

function Section({ title, rail, icon: Icon, action, children }: { title: string; rail: boolean; icon?: typeof Search; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="sb-section">
      {rail ? <div className="sb-divider" /> : <h4>{Icon && <Icon size={12} />}{title}{action}</h4>}
      <div className="sb-items">{children}</div>
    </section>
  );
}

function Item({ icon: Icon, label, sub, rail, onClick, active, disabled, trailing, accent }: {
  icon: typeof Search; label: string; sub?: string; rail: boolean; onClick: () => void;
  active?: boolean; disabled?: boolean; trailing?: ReactNode; accent?: boolean;
}) {
  return (
    <button
      className={`sb-item ${active ? 'on' : ''} ${accent ? 'accent' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={label}
      data-tip={rail ? label : undefined}
    >
      {active && <span className="sb-ind" />}
      <span className="sb-ico"><Icon size={18} /></span>
      <Fade show={!rail}>
        <span className="sb-text">
          <span className="sb-label">{label}</span>
          {sub && <span className="sb-sub">{sub}</span>}
        </span>
      </Fade>
      {!rail && trailing}
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
