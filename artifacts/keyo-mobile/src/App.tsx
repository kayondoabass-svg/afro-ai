import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Cpu, Download, FolderUp, HardDrive, Menu, MessageSquarePlus, Pause, Pencil, Play,
  Power, Settings2, ShieldAlert, Square, Trash2, Wifi, WifiOff, X, Library,
} from 'lucide-react';
import { useKeyoStudio } from './useKeyoStudio';
import type { ModelEntry, StudioState } from './studio-types';

function fmtBytes(n: number) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

function useApplyTheme(theme: StudioState['theme']) {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#202a24' : '#eef0e7');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

function Mark({ size = 34 }: { size?: number }) {
  return (
    <div aria-hidden="true" style={{ width: size, height: size }}
      className="grid place-items-center rounded-[5px] bg-[#243c31] text-[#d5ed77] k-serif font-bold dark:bg-[#c0d99a] dark:text-[#203026]">
      K
    </div>
  );
}

function Modal({ title, description, onClose, children }: { title: string; description?: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input,button,textarea,select')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus(); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-[#202921]/40 p-0 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby={description ? 'modal-desc' : undefined}
        className="k-rise w-full sm:max-w-lg max-h-[90dvh] overflow-y-auto rounded-t-xl sm:rounded-lg border bg-card p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="modal-title" className="k-serif text-xl">{title}</h2>
          <button type="button" className="k-btn k-btn-quiet !min-h-8 !px-2" onClick={onClose} aria-label="Close dialog"><X size={16} /></button>
        </div>
        {description && <p id="modal-desc" className="mt-1 text-sm text-muted-foreground">{description}</p>}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

type Dlg =
  | { kind: 'rename'; id: string; title: string }
  | { kind: 'delete-chat'; id: string; title: string }
  | { kind: 'download'; model: ModelEntry }
  | { kind: 'import'; model: ModelEntry }
  | { kind: 'delete-model'; model: ModelEntry }
  | null;

function App() {
  const s = useKeyoStudio();
  useApplyTheme(s.theme);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [panel, setPanel] = useState<'chats' | 'models' | 'settings' | null>(null);
  const close = () => setDlg(null);

  const sidebar = (
    <ChatList s={s} onRename={(c) => setDlg({ kind: 'rename', id: c.id, title: c.title })}
      onDelete={(c) => setDlg({ kind: 'delete-chat', id: c.id, title: c.title })} onPick={() => setPanel(null)} />
  );
  const models = <ModelPanel s={s} setDlg={setDlg} />;
  const settings = <SettingsPanel s={s} />;

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background/90 backdrop-blur px-3 sm:px-5 h-14">
        <button type="button" className="k-btn k-btn-quiet !px-2 lg:hidden" aria-label="Open conversations" onClick={() => setPanel('chats')} data-testid="button-open-chats"><Menu size={18} /></button>
        <Mark />
        <div className="leading-tight">
          <div className="font-bold text-[15px] text-primary">KEYO Studio</div>
          <div className="k-eyebrow">Portable · offline</div>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs" aria-live="polite">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-muted-foreground" data-testid="status-network">
            {s.online ? <Wifi size={14} /> : <WifiOff size={14} />}{s.online ? 'Online' : 'Offline'}
          </span>
          <EngineBadge s={s} />
          <button type="button" className="k-btn !px-2 xl:hidden" aria-label="Model library" onClick={() => setPanel('models')} data-testid="button-open-models"><Library size={16} /></button>
          <button type="button" className="k-btn !px-2 xl:hidden" aria-label="Settings" onClick={() => setPanel('settings')} data-testid="button-open-settings"><Settings2 size={16} /></button>
        </div>
      </header>

      <div className="flex-1 grid lg:grid-cols-[260px_1fr] xl:grid-cols-[260px_1fr_340px] min-h-0">
        <aside className="hidden lg:flex flex-col border-r bg-sidebar/60" aria-label="Conversations">{sidebar}</aside>
        <main className="min-w-0 flex flex-col">
          {!s.supported && (
            <div role="alert" className="m-3 rounded border border-destructive/50 bg-destructive/10 p-3 text-sm">
              This browser lacks the storage or worker features KEYO needs (Origin Private File System, Web Workers). Models cannot be stored or run here.
            </div>
          )}
          {s.error && (
            <div role="alert" className="mx-3 mt-3 flex items-start gap-3 rounded border border-destructive/50 bg-destructive/10 p-3 text-sm" data-testid="status-error">
              <ShieldAlert size={18} className="shrink-0 text-destructive" />
              <span className="flex-1">{s.error}</span>
              <button type="button" className="k-btn !min-h-8" onClick={() => { s.clearError(); void s.refresh(); }}>Retry</button>
              <button type="button" className="k-btn k-btn-quiet !min-h-8" onClick={s.clearError}>Dismiss</button>
            </div>
          )}
          {s.notice && <p role="status" className="mx-3 mt-3 rounded border bg-accent/40 p-2 px-3 text-sm" data-testid="status-notice">{s.notice}</p>}
          <ChatView s={s} onRename={(c) => setDlg({ kind: 'rename', id: c.id, title: c.title })}
            onDelete={(c) => setDlg({ kind: 'delete-chat', id: c.id, title: c.title })} openModels={() => setPanel('models')} />
        </main>
        <aside className="hidden xl:block border-l overflow-y-auto max-h-[calc(100dvh-3.5rem)] p-4 space-y-6" aria-label="Models and settings">
          {models}{settings}
        </aside>
      </div>

      {panel && (
        <div className="fixed inset-0 z-40 bg-[#202921]/40" onMouseDown={(e) => e.target === e.currentTarget && setPanel(null)}>
          <div role="dialog" aria-modal="true" aria-label={panel === 'chats' ? 'Conversations' : panel === 'models' ? 'Model library' : 'Settings'}
            className={`k-rise absolute top-0 bottom-0 w-[min(92vw,380px)] bg-background border flex flex-col ${panel === 'chats' ? 'left-0' : 'right-0'}`}>
            <div className="flex justify-end p-2"><button type="button" className="k-btn k-btn-quiet !px-2" aria-label="Close panel" onClick={() => setPanel(null)}><X size={18} /></button></div>
            <div className={`flex-1 overflow-y-auto ${panel === 'chats' ? 'flex flex-col' : 'p-4'}`}>{panel === 'chats' ? sidebar : panel === 'models' ? models : settings}</div>
          </div>
        </div>
      )}

      {dlg?.kind === 'rename' && <RenameDialog id={dlg.id} title={dlg.title} s={s} onClose={close} />}
      {dlg?.kind === 'delete-chat' && (
        <Modal title="Delete conversation?" description={`"${dlg.title}" and its messages will be removed from this device. Downloaded models are not deleted.`} onClose={close}>
          <div className="flex justify-end gap-2">
            <button type="button" className="k-btn" onClick={close}>Cancel</button>
            <button type="button" className="k-btn k-btn-danger" data-testid="button-confirm-delete-chat" onClick={() => { s.deleteChat(dlg.id); close(); }}>Delete conversation</button>
          </div>
        </Modal>
      )}
      {(dlg?.kind === 'download' || dlg?.kind === 'import') && <LicenseDialog dlg={dlg} s={s} onClose={close} />}
      {dlg?.kind === 'delete-model' && (
        <Modal title={`Delete ${dlg.model.name} files?`} description={`Frees about ${fmtBytes(dlg.model.bytes)}. Conversations are kept. You will need Internet (or the files) to install it again.`} onClose={close}>
          <div className="flex justify-end gap-2">
            <button type="button" className="k-btn" onClick={close}>Cancel</button>
            <button type="button" className="k-btn k-btn-danger" data-testid="button-confirm-delete-model" onClick={() => { void s.deleteModel(dlg.model.id); close(); }}>Delete model files</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function EngineBadge({ s }: { s: StudioState }) {
  const label = { idle: 'No model loaded', loading: 'Loading…', ready: 'Ready', generating: 'Generating', error: 'Engine error' }[s.engine];
  const tone = s.engine === 'error' ? 'bg-destructive/15 text-destructive' : s.engine === 'ready' || s.engine === 'generating' ? 'bg-[#d5ed77] text-[#243c31]' : 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 font-mono text-[11px] ${tone}`} title={s.engineInfo} data-testid="status-engine">
      <Cpu size={13} />{label}
    </span>
  );
}

function ChatList({ s, onRename, onDelete, onPick }: { s: StudioState; onRename: (c: { id: string; title: string }) => void; onDelete: (c: { id: string; title: string }) => void; onPick: () => void }) {
  const list = [...s.conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <>
      <div className="flex items-center justify-between p-3">
        <span className="k-eyebrow">Workspace / history</span>
        <button type="button" className="k-btn k-btn-primary !min-h-8" onClick={() => { s.createChat(); onPick(); }} data-testid="button-new-chat"><MessageSquarePlus size={15} />New</button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2" aria-label="Saved conversations">
        {list.length === 0 ? (
          <p className="m-2 rounded border border-dashed p-4 text-sm text-muted-foreground">No conversations yet. Create one to start — nothing is pre-filled.</p>
        ) : (
          <ul className="space-y-1">
            {list.map((c) => {
              const active = s.activeChat?.id === c.id;
              return (
                <li key={c.id} className={`group flex items-center rounded border ${active ? 'border-border bg-card' : 'border-transparent'}`}>
                  <button type="button" aria-current={active ? 'page' : undefined} className="flex-1 min-w-0 text-left px-2.5 py-2" onClick={() => { s.selectChat(c.id); onPick(); }} data-testid={`button-chat-${c.id}`}>
                    <span className="block truncate text-sm font-medium">{c.title || 'Untitled'}</span>
                    <span className="block font-mono text-[10px] text-muted-foreground">{c.messages.length} msg · {new Date(c.updatedAt).toLocaleDateString()}</span>
                  </button>
                  <button type="button" className="k-btn k-btn-quiet !min-h-8 !px-1.5" aria-label={`Rename ${c.title}`} onClick={() => onRename(c)}><Pencil size={13} /></button>
                  <button type="button" className="k-btn k-btn-quiet !min-h-8 !px-1.5 text-destructive" aria-label={`Delete ${c.title}`} onClick={() => onDelete(c)}><Trash2 size={13} /></button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
      <p className="m-3 border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
        <strong className="text-foreground">Privacy:</strong> conversations and models are stored locally in this browser on this device. Storage is not encrypted — anyone with access to this device profile can read it. Deleting a chat does not delete models.
      </p>
    </>
  );
}

function ChatView({ s, onRename, onDelete, openModels }: { s: StudioState; onRename: (c: { id: string; title: string }) => void; onDelete: (c: { id: string; title: string }) => void; openModels: () => void }) {
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const chat = s.activeChat;
  const last = chat?.messages[chat.messages.length - 1];
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [chat?.messages.length, last?.text]);
  const busy = s.engine === 'generating';
  const canSend = !!chat && s.engine === 'ready' && text.trim().length > 0;
  const hint = !chat ? 'Create a conversation to begin.' : s.engine === 'idle' ? 'Load a downloaded model to generate.' : s.engine === 'loading' ? 'Loading model…' : s.engine === 'error' ? 'Engine error — see message above.' : busy ? 'Generating on CPU. Stop keeps partial output.' : 'Ctrl/⌘ + Enter to run';
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSend) return;
    const t = text; setText('');
    void s.send(t);
  };
  const modelName = s.models.find((m) => m.id === s.selectedModel)?.name;

  return (
    <div className="flex-1 flex flex-col min-h-0 px-3 sm:px-6 pb-3">
      <div className="flex flex-wrap items-end gap-3 pt-5 pb-3">
        <div className="min-w-0 flex-1">
          <div className="k-eyebrow">Local inference / {s.options.mode === 'chat' ? 'instruction chat' : 'completion'}</div>
          <h1 className="k-serif text-2xl sm:text-3xl truncate text-primary" data-testid="text-chat-title">{chat ? chat.title || 'Untitled' : 'A workspace you own.'}</h1>
        </div>
        {chat && (
          <div className="flex gap-2">
            <button type="button" className="k-btn !min-h-8" onClick={() => onRename(chat)} data-testid="button-rename-chat"><Pencil size={14} />Rename</button>
            <button type="button" className="k-btn k-btn-danger !min-h-8" onClick={() => onDelete(chat)} data-testid="button-delete-chat"><Trash2 size={14} />Delete</button>
          </div>
        )}
      </div>

      <section aria-label="Conversation" className="flex-1 min-h-[280px] overflow-y-auto rounded-md border bg-card p-4 sm:p-6" aria-live="polite" aria-relevant="additions text">
        {!chat || chat.messages.length === 0 ? (
          <div className="h-full grid place-items-center text-center">
            <div className="max-w-md">
              <div className="font-mono text-xs text-muted-foreground">K / 01</div>
              <h2 className="k-serif text-2xl mt-2">{chat ? 'Empty conversation.' : 'Start with a local conversation.'}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {s.installed.length === 0
                  ? 'No model is on this device yet. Download one once (Internet required), then it runs offline on your CPU.'
                  : s.engine === 'ready' ? `${modelName ?? 'Model'} is loaded. Write a prompt below.` : 'Load a downloaded model, then write a prompt.'}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {!chat && <button type="button" className="k-btn k-btn-primary" onClick={s.createChat}><MessageSquarePlus size={15} />New conversation</button>}
                {s.engine !== 'ready' && <button type="button" className="k-btn xl:hidden" onClick={openModels}><Library size={15} />Model library</button>}
              </div>
            </div>
          </div>
        ) : (
          <ol className="space-y-5">
            {chat.messages.map((m) => (
              <li key={m.id} className={`k-rise ${m.role === 'user' ? 'pl-6 sm:pl-16' : ''}`} data-testid={`message-${m.id}`}>
                <div className="k-eyebrow mb-1 flex gap-2">
                  <span>{m.role === 'user' ? 'You' : 'Model'}</span>
                  {m.status === 'interrupted' && <span className="text-[#db633d]">stopped</span>}
                  {m.status === 'error' && <span className="text-destructive">error</span>}
                </div>
                <div className={`whitespace-pre-wrap break-words text-[15px] leading-relaxed ${m.role === 'user' ? 'rounded bg-muted px-3 py-2' : 'border-l-2 border-[#d5ed77] pl-3'} ${m.status === 'streaming' ? 'k-caret' : ''}`}>
                  {m.text}
                </div>
              </li>
            ))}
          </ol>
        )}
        <div ref={endRef} />
      </section>

      <form onSubmit={submit} className="mt-3 rounded-md border bg-card p-2">
        <label htmlFor="prompt" className="sr-only">Prompt</label>
        <textarea id="prompt" rows={3} value={text} onChange={(e) => setText(e.target.value)} disabled={!chat || busy}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); }}
          placeholder={s.options.mode === 'chat' ? 'Ask your instruction model…' : 'Write text for the model to continue…'}
          className="w-full resize-none bg-transparent p-2 text-[15px] outline-none disabled:opacity-60" data-testid="input-prompt" />
        <div className="flex items-center gap-2 px-1">
          <span className="flex-1 text-xs text-muted-foreground" role="status">{hint}</span>
          {busy ? (
            <button type="button" className="k-btn k-btn-danger" onClick={s.stop} data-testid="button-stop"><Square size={14} />Stop</button>
          ) : (
            <button type="submit" className="k-btn k-btn-primary" disabled={!canSend} data-testid="button-send"><Play size={14} />Generate</button>
          )}
        </div>
      </form>
    </div>
  );
}

function ModelPanel({ s, setDlg }: { s: StudioState; setDlg: (d: Dlg) => void }) {
  return (
    <section aria-labelledby="models-h" className="space-y-3">
      <div>
        <div className="k-eyebrow">Model library</div>
        <h2 id="models-h" className="k-serif text-xl text-primary">Weights on this device</h2>
        <p className="mt-1 text-xs text-muted-foreground">CPU only. GPU, WASM SIMD, quantization and device speed are not certified. Offline use requires one download first; stopping or backgrounding unloads the engine safely and keeps files.</p>
      </div>
      {s.models.map((m) => {
        const installed = s.installed.includes(m.id);
        const prog = s.progress?.modelId === m.id ? s.progress : null;
        const loaded = s.selectedModel === m.id && (s.engine === 'ready' || s.engine === 'generating');
        const pct = prog && prog.total ? prog.bytes / prog.total : 0;
        return (
          <article key={m.id} className={`rounded-md border bg-card p-3 ${loaded ? 'ring-2 ring-[#d5ed77]' : ''}`} data-testid={`card-model-${m.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold">{m.name}</h3>
                <p className="font-mono text-[11px] text-muted-foreground">{m.architecture} · {fmtBytes(m.bytes)} · {m.license}</p>
              </div>
              <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] ${loaded ? 'bg-[#d5ed77] text-[#243c31]' : installed ? 'bg-muted' : 'border'}`}>
                {loaded ? 'LOADED' : installed ? 'ON DEVICE' : 'NOT DOWNLOADED'}
              </span>
            </div>
            {m.note && <p className="mt-2 text-xs text-muted-foreground">{m.note}</p>}
            <p className="mt-1 font-mono text-[10px] text-muted-foreground break-all">{m.repository}@{m.revision.slice(0, 10)}</p>
            {prog && (
              <div className="mt-3" role="status" aria-live="polite">
                <div className="k-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} aria-label={`${m.name} ${prog.phase}`}>
                  <span style={{ transform: `scaleX(${pct})` }} />
                </div>
                <p className="mt-1 font-mono text-[11px]">{prog.phase} · {fmtBytes(prog.bytes)} / {fmtBytes(prog.total)} ({(pct * 100).toFixed(1)}%)</p>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {prog ? (
                <button type="button" className="k-btn !min-h-8" onClick={s.pauseDownload} data-testid={`button-pause-${m.id}`}><Pause size={14} />Pause</button>
              ) : !installed ? (
                <>
                  <button type="button" className="k-btn k-btn-primary !min-h-8" disabled={!s.online || !!s.progress || !s.supported} onClick={() => setDlg({ kind: 'download', model: m })} data-testid={`button-download-${m.id}`}><Download size={14} />Download / resume</button>
                  <button type="button" className="k-btn !min-h-8" disabled={!!s.progress || !s.supported} onClick={() => setDlg({ kind: 'import', model: m })} data-testid={`button-import-${m.id}`}><FolderUp size={14} />Import files</button>
                </>
              ) : loaded ? (
                <button type="button" className="k-btn !min-h-8" onClick={s.unloadModel} disabled={s.engine === 'generating'} data-testid={`button-unload-${m.id}`}><Power size={14} />Unload</button>
              ) : (
                <button type="button" className="k-btn k-btn-lime !min-h-8" disabled={s.engine === 'loading' || s.engine === 'generating'} onClick={() => { s.selectModel(m.id); void s.loadModel(m.id); }} data-testid={`button-load-${m.id}`}><Cpu size={14} />{s.engine === 'loading' && s.selectedModel === m.id ? 'Loading…' : 'Load'}</button>
              )}
              {installed && !prog && (
                <button type="button" className="k-btn k-btn-danger !min-h-8" disabled={loaded} onClick={() => setDlg({ kind: 'delete-model', model: m })} data-testid={`button-delete-model-${m.id}`}><Trash2 size={14} />Delete files</button>
              )}
            </div>
          </article>
        );
      })}
      {s.engineInfo && <p className="font-mono text-[11px] text-muted-foreground" data-testid="text-engine-info">{s.engineInfo}</p>}
      <p className="text-[11px] text-muted-foreground"><a className="underline" href="https://github.com/kayondoabass-svg/keyo-studio/releases/tag/v0.2.0-alpha.1" target="_blank" rel="noreferrer">Android development release</a>. Debug APK—not Play Store or phone-execution certified. Models download separately.</p>
    </section>
  );
}

function SettingsPanel({ s }: { s: StudioState }) {
  const { usage, quota, persistent } = s.storage;
  const pct = quota ? usage / quota : 0;
  return (
    <section aria-labelledby="settings-h" className="space-y-4">
      <div>
        <div className="k-eyebrow">Generation / device</div>
        <h2 id="settings-h" className="k-serif text-xl text-primary">Settings</h2>
      </div>
      <div>
        <label htmlFor="mode" className="k-eyebrow block mb-1">Run mode</label>
        <select id="mode" className="k-field" value={s.options.mode} onChange={(e) => s.setOptions({ mode: e.target.value as 'chat' | 'completion' })} data-testid="select-mode">
          <option value="chat">Instruction chat · use template</option>
          <option value="completion">Completion · continue raw text</option>
        </select>
      </div>
      <div>
        <label htmlFor="max-tokens" className="k-eyebrow flex justify-between mb-1"><span>Max output tokens</span><span className="font-mono">{s.options.maxTokens}</span></label>
        <input id="max-tokens" type="range" min={1} max={128} step={1} value={s.options.maxTokens} onChange={(e) => s.setOptions({ maxTokens: Number(e.target.value) })} className="w-full accent-[#243c31] dark:accent-[#c0d99a]" data-testid="input-max-tokens" />
      </div>
      <div>
        <label htmlFor="temp" className="k-eyebrow flex justify-between mb-1"><span>Temperature</span><span className="font-mono">{s.options.temperature.toFixed(1)}</span></label>
        <input id="temp" type="range" min={0} max={2} step={0.1} value={s.options.temperature} onChange={(e) => s.setOptions({ temperature: Number(e.target.value) })} className="w-full accent-[#243c31] dark:accent-[#c0d99a]" data-testid="input-temperature" />
      </div>
      <fieldset>
        <legend className="k-eyebrow mb-1">Appearance</legend>
        <div className="grid grid-cols-3 gap-1 rounded border p-1">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button key={t} type="button" aria-pressed={s.theme === t} onClick={() => s.setTheme(t)}
              className={`rounded px-2 py-1.5 text-xs capitalize ${s.theme === t ? 'bg-primary text-primary-foreground' : ''}`} data-testid={`button-theme-${t}`}>{t}</button>
          ))}
        </div>
      </fieldset>
      <div className="rounded-md border bg-card p-3" data-testid="status-storage">
        <div className="flex items-center gap-2 text-sm font-semibold"><HardDrive size={15} />Storage</div>
        <div className="k-bar mt-2"><span style={{ transform: `scaleX(${Math.min(1, pct)})` }} /></div>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">{fmtBytes(usage)} used of {quota ? fmtBytes(quota) : 'unknown'} quota</p>
        <p className="mt-2 text-xs">{persistent ? 'Persistent: the browser should not evict these files automatically.' : 'Not persistent: the browser may clear models under storage pressure.'}</p>
        <div className="mt-2 flex gap-2">
          {!persistent && <button type="button" className="k-btn !min-h-8" onClick={() => void s.requestPersistence()} data-testid="button-persist">Request persistence</button>}
          <button type="button" className="k-btn k-btn-quiet !min-h-8" onClick={() => void s.refresh()} data-testid="button-refresh">Refresh</button>
        </div>
      </div>
    </section>
  );
}

function RenameDialog({ id, title, s, onClose }: { id: string; title: string; s: StudioState; onClose: () => void }) {
  const [v, setV] = useState(title);
  const err = v.trim() ? '' : 'Name cannot be empty.';
  return (
    <Modal title="Rename conversation" description="Choose a clear name for this local conversation." onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (err) return; s.renameChat(id, v.trim()); onClose(); }}>
        <label htmlFor="rename" className="k-eyebrow block mb-1">Conversation name</label>
        <input id="rename" className="k-field" maxLength={120} value={v} onChange={(e) => setV(e.target.value)} aria-invalid={!!err} aria-describedby="rename-err" data-testid="input-rename" />
        <p id="rename-err" className="mt-1 min-h-4 text-xs text-destructive">{err}</p>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="k-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="k-btn k-btn-primary" disabled={!!err} data-testid="button-save-rename">Save name</button>
        </div>
      </form>
    </Modal>
  );
}

function LicenseDialog({ dlg, s, onClose }: { dlg: { kind: 'download' | 'import'; model: ModelEntry }; s: StudioState; onClose: () => void }) {
  const [ok, setOk] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const m = dlg.model;
  const imp = dlg.kind === 'import';
  return (
    <Modal title={imp ? `Import ${m.name}` : `Download ${m.name}`}
      description={imp ? 'Select the model files you already have (config, tokenizer and weights). They are copied into private browser storage.' : `About ${fmtBytes(m.bytes)} from ${m.repository}. Interrupted downloads can resume. Use Wi-Fi if data is metered.`}
      onClose={onClose}>
      <form onSubmit={(e) => {
        e.preventDefault();
        if (!ok || (imp && !files.length)) return;
        void (imp ? s.importModel(m.id, files, true) : s.downloadModel(m.id, true));
        onClose();
      }}>
        {imp && (
          <div className="mb-3">
            <label htmlFor="files" className="k-eyebrow block mb-1">Model files</label>
            <input id="files" type="file" multiple className="k-field" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} data-testid="input-import-files" />
            <p className="mt-1 text-xs text-muted-foreground">{files.length ? `${files.length} file(s), ${fmtBytes(files.reduce((a, f) => a + f.size, 0))}` : 'No files selected.'}</p>
          </div>
        )}
        <div className="rounded border bg-muted/50 p-3 text-sm">
          <p>License: <strong>{m.license}</strong> · <a className="underline" href={m.licenseUrl} target="_blank" rel="noreferrer">read license</a></p>
          <label className="mt-2 flex items-start gap-2">
            <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-1 accent-[#243c31]" data-testid="checkbox-license" />
            <span>I have read and accept the {m.license} license for {m.name}.</span>
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="k-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="k-btn k-btn-primary" disabled={!ok || (imp && !files.length)} data-testid="button-confirm-license">
            {imp ? <><FolderUp size={14} />Import</> : <><Download size={14} />Download</>}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default App;
