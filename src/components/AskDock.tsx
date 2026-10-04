import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp, Globe2, KeyRound, MapPin, Sparkles, X, WifiOff, Square, Loader2, ExternalLink } from 'lucide-react';
import { BY_CCA3, flagUrl, type Country } from '../lib/data';
import { answerLocally } from '../lib/localQuery';
import { api } from '../lib/api';

interface Msg { role: 'user' | 'assistant'; content: string; countries?: string[]; scope?: string | null; offline?: boolean; connect?: boolean }

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  country: Country | null;
  request: { prompt: string; n: number } | null;
  /** bump to open the Connect Claude form */
  keyRequest?: number;
  /** Tells the app whether this is the public, owner-managed deployment. */
  onHosted?: (hosted: boolean) => void;
  onAiChange?: (ai: boolean) => void;
  onHighlight: (cca3s: string[]) => void;
  onSelect: (cca3: string) => void;
}

const WORLD_SUGGESTIONS = [
  'Which countries drive on the left?',
  'Largest countries in Africa',
  'What are the 5 longest rivers in the world?',
  'How do I tell Slovenia from Slovakia in GeoGuessr?',
  'Landlocked countries in South America',
  'Which countries use yellow centre lines?',
];
const countrySuggestions = (c: Country) => [
  `What is ${c.name} famous for?`,
  `How do I recognise ${c.name} in GeoGuessr?`,
  `What countries border ${c.name}?`,
  `Give me 3 surprising facts about ${c.name}`,
  `What's the history of ${c.capital[0] ?? c.name}?`,
];

// Minimal, safe markdown: **bold**, _italic_, lists, paragraphs.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('_') && part.endsWith('_') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}
function Markdown({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <>
      {blocks.map((blk, i) => {
        const lines = blk.split('\n');
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
          const ordered = /^\s*\d+\./.test(lines[0]);
          const items = lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ''))}</li>);
          return ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
        }
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l.replace(/^#+\s*/, ''))}</Fragment>)}</p>;
      })}
    </>
  );
}

function splitMap(raw: string): { text: string; codes: string[] } {
  const m = raw.match(/\n?\s*MAP:\s*([A-Z]{3}(?:\s*,\s*[A-Z]{3})*)\s*$/);
  const cut = raw.search(/\n\s*MAP:?[^\n]*$/);
  const text = cut >= 0 ? raw.slice(0, cut) : raw;
  const codes = m ? m[1].split(',').map((s) => s.trim()).filter((c) => BY_CCA3.has(c)) : [];
  return { text, codes };
}

export function AskDock({ open, setOpen, country, request, keyRequest = 0, onAiChange, onHosted, onHighlight, onSelect }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<boolean | null>(null);
  const [keySource, setKeySource] = useState<'env' | 'app' | 'user' | null>(null);
  // On the public site keys are owner-managed: never offer the key form there.
  const [hosted, setHosted] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [useCountry, setUseCountry] = useState(true);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  const scope = useCountry && country ? country : null;

  useEffect(() => {
    api('/api/health').then((r) => r.json()).then((d) => { setAi(!!d.ai); setKeySource(d.source ?? null); setHosted(!!d.hosted); onHosted?.(!!d.hosted); }).catch(() => setAi(false));
  }, [onHosted]); // a stable state setter — runs once
  useEffect(() => { setUseCountry(true); }, [country?.cca3]);
  useEffect(() => { if (keyRequest && ai === false) setShowKey(true); }, [keyRequest, ai]);
  useEffect(() => { if (ai !== null) onAiChange?.(ai); }, [ai, onAiChange]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }, [msgs]);
  useEffect(() => { if (open) setTimeout(() => field.current?.focus(), 250); }, [open]);
  useEffect(() => {
    if (request?.prompt) void send(request.prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.n]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    const history = [...msgs, { role: 'user' as const, content: q, scope: scope?.cca3 ?? null }];
    setMsgs([...history, { role: 'assistant', content: '' }]);

    const offline = () => {
      const local = answerLocally(q, scope);
      const content = local?.text ?? 'Offline, I can only answer data questions (capitals, populations, borders, largest/smallest, driving side, landlocked, languages). **Connect Claude** with your Anthropic API key to ask me anything at all.';
      setMsgs([...history, { role: 'assistant', content, countries: local?.highlight, offline: true, connect: !local }]);
      if (local?.highlight.length) onHighlight(local.highlight);
    };

    if (!ai) { offline(); return; }

    setBusy(true);
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const res = await api('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })), country: scope?.cca3 ?? null }),
        signal: ctl.signal,
      });
      if (!res.ok || !res.body) { if (res.status === 503) setAi(false); offline(); return; }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        const { text } = splitMap(acc);
        setMsgs([...history, { role: 'assistant', content: text }]);
      }
      const { text, codes } = splitMap(acc);
      setMsgs([...history, { role: 'assistant', content: text, countries: codes }]);
      if (codes.length) onHighlight(codes);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') offline();
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  const onConnected = (source: 'env' | 'app' | 'user' | null) => {
    setAi(true);
    setKeySource(source);
    setShowKey(false);
    // Re-ask the question that couldn't be answered offline.
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
    const last = msgs[msgs.length - 1];
    if (lastUser && last?.connect) {
      setMsgs(msgs.slice(0, -2));
      setTimeout(() => void send(lastUser.content), 0);
    }
  };

  const disconnect = () => {
    setAi(false); // reflect it at once; the server call can finish in the background
    setKeySource(null);
    void api('/api/key', { method: 'DELETE' }).catch(() => null);
  };

  const suggestions = scope ? countrySuggestions(scope) : WORLD_SUGGESTIONS;

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            className="ask-fab"
            onClick={() => setOpen(true)}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
          >
            <span className="fab-orb"><Sparkles size={16} /></span>
            Ask the Atlas{country ? ` about ${country.name}` : ' anything'}
            <kbd>A</kbd>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.section
            className="dock"
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            <header className="dock-head">
              <span className="fab-orb"><Sparkles size={15} /></span>
              <div className="dock-title">
                <b>The Atlas</b>
                {ai === false ? (
                  <button className="connect-link" onClick={() => setShowKey((v) => !v)}><WifiOff size={11} /> Offline · <u>Connect Claude</u></button>
                ) : ai ? (
                  <span className="ai-on">
                    <i className="live-dot" /> Powered by Claude
                    {(keySource === 'app' || keySource === 'user') && <button className="connect-link" onClick={() => void disconnect()} title="Forget the saved API key">· Disconnect</button>}
                  </span>
                ) : <span>Connecting…</span>}
              </div>
              <div className="scope">
                <button className={!scope ? 'on' : ''} onClick={() => setUseCountry(false)}><Globe2 size={13} /> World</button>
                <button className={scope ? 'on' : ''} disabled={!country} onClick={() => setUseCountry(true)} title={country ? '' : 'Select a country on the globe'}>
                  {country ? <img src={flagUrl(country.cca2, 80)} alt="" /> : <MapPin size={13} />}
                  {country ? country.name : 'Country'}
                </button>
              </div>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close chat"><X size={17} /></button>
            </header>

            <AnimatePresence initial={false}>
              {showKey && <KeyForm hosted={hosted} onDone={onConnected} onCancel={() => setShowKey(false)} />}
            </AnimatePresence>

            <div className="dock-body" ref={scroller}>
              {msgs.length === 0 && (
                <div className="empty-chat">
                  <p>{scope ? <>Ask anything about <b>{scope.name}</b> — history, culture, geography or GeoGuessr tells.</> : <>Ask anything about the world. Answers light up on the globe.</>}</p>
                </div>
              )}
              {msgs.map((m, i) => (
                <motion.div key={i} className={`msg ${m.role}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  {m.role === 'assistant' ? (
                    m.content ? <Markdown text={m.content} /> : <Thinking />
                  ) : (
                    <>
                      {m.scope && BY_CCA3.get(m.scope) && <img className="msg-flag" src={flagUrl(BY_CCA3.get(m.scope)!.cca2, 80)} alt="" />}
                      {m.content}
                    </>
                  )}
                  {m.connect && !ai && (
                    <button className="connect-cta" onClick={() => setShowKey(true)}><KeyRound size={14} /> Connect Claude</button>
                  )}
                  {m.countries && m.countries.length > 0 && (
                    <div className="msg-countries">
                      {m.countries.slice(0, 20).map((code) => {
                        const c = BY_CCA3.get(code)!;
                        return (
                          <button key={code} onClick={() => onSelect(code)} title={`Go to ${c.name}`}>
                            <img src={flagUrl(c.cca2, 80)} alt="" />{c.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>

            {msgs.length < 2 && (
              <div className="suggest">
                {suggestions.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}
              </div>
            )}

            <form className="composer" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
              <textarea
                ref={field}
                rows={1}
                value={input}
                placeholder={scope ? `Ask about ${scope.name}…` : 'Ask about any place on Earth…'}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); }
                  if (e.key === 'Escape') setOpen(false);
                }}
              />
              {busy ? (
                <button type="button" className="send" onClick={() => abort.current?.abort()} aria-label="Stop"><Square size={14} /></button>
              ) : (
                <button type="submit" className="send" disabled={!input.trim()} aria-label="Send"><ArrowUp size={17} /></button>
              )}
            </form>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}

function KeyForm({ hosted, onDone, onCancel }: { hosted: boolean; onDone: (source: 'env' | 'app' | 'user' | null) => void; onCancel: () => void }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => field.current?.focus(), 200); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api('/api/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key.trim() }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? 'Couldn’t save the key.'); return; }
      setKey('');
      onDone(d.source ?? 'app');
    } catch {
      setError('The GeoQuest server isn’t running — start it with npm run dev.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.form
      className="key-form"
      onSubmit={save}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="key-inner">
        <p><KeyRound size={14} /> Paste your Anthropic API key to let the Atlas answer <b>anything</b>. {hosted
          ? <>It’s checked with Anthropic and kept <b>encrypted in a secure cookie in this browser</b> — never stored on our servers. Remove it any time with Disconnect.</>
          : <>It’s checked with Anthropic and saved only in this project’s <code>.env</code> on your computer — never in the browser.</>}</p>
        <div className="key-row">
          <input
            ref={field}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-ant-…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onCancel()}
          />
          <button type="submit" className="key-save" disabled={!key.trim() || busy}>
            {busy ? <Loader2 size={15} className="spin" /> : 'Connect'}
          </button>
        </div>
        {error && <div className="key-error">{error}</div>}
        <a className="key-help" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
          Get a key from the Anthropic Console <ExternalLink size={11} />
        </a>
      </div>
    </motion.form>
  );
}

/** Waiting for the first words: dots, then a quiet status line as the wait grows. */
function Thinking() {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const a = window.setTimeout(() => setStage(1), 1800);
    const b = window.setTimeout(() => setStage(2), 6000);
    return () => { window.clearTimeout(a); window.clearTimeout(b); };
  }, []);
  return (
    <span className="thinking" role="status">
      <span className="typing"><i /><i /><i /></span>
      <AnimatePresence mode="wait">
        {stage > 0 && (
          <motion.em key={stage} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.25 }}>
            {stage === 1 ? 'Thinking…' : 'Checking sources — almost there…'}
          </motion.em>
        )}
      </AnimatePresence>
    </span>
  );
}
