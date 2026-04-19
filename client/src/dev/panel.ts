// In-page dev panel — collapsible overlay at the bottom of the viewport.
// Solves the "can't see devtools console in embedded preview" problem: the
// panel injects its own DOM + CSS and intercepts console.log/warn/error so
// everything surfaces inside the page.
//
// Activation:
//   - Imported by main.ts and editor.ts (dev-only, stripped in production).
//   - Toggle with backtick (`) or click the header strip.
//
// Controls:
//   - Prompt line to read/write any `settings.*` field
//   - Scrolling log feed with log/warn/error severity colors
//
// The prompt accepts three forms:
//   - `<group>`                       → log the whole group
//   - `<group>.<field>`               → log the field
//   - `<group>.<field> = <value>`     → set the field
//   - `<helper>(arg1, arg2, ...)`     → call a helper
// Arg/value literals: numbers, true/false, "strings".

import { settings } from './settings';
import { config } from '../config';

/** Only mount in dev — Vite strips this branch in production. */
if (import.meta.env.DEV) {
  mount();
}

function mount() {
  injectStyles();
  const panel = renderPanel();
  document.body.appendChild(panel);
  interceptConsole(panel.querySelector('#dev-log') as HTMLDivElement);
  installHotkey(panel);
  startFpsMeter(panel.querySelector('#dev-fps') as HTMLSpanElement);
  startPerfMeter(panel.querySelector('#dev-perf') as HTMLSpanElement);

  // Print dev-help once on startup. Goes through our intercepted console.log
  // so it also shows up inside the panel the first time someone opens it.
  console.log(
    '[dev] panel ready. Press ` (backtick) or click footer to toggle.\n' +
    'Prompt examples:\n' +
    '  physics          → log the physics group\n' +
    '  grass.topRise    → read one field\n' +
    '  grass.topRise=8  → set one field\n' +
    '  tint(0.4,0.45,0.55) / tintOff() / tintDark() / log()',
  );
}

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #dev-panel {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 9999;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      color: #d0d0d0;
      background: transparent;
      border-top: 1px solid rgba(42, 46, 58, 0.7);
      transition: height 0.15s ease-out;
      overflow: hidden;
      user-select: none;
    }
    #dev-panel.collapsed { height: 22px; }
    #dev-panel.expanded  { height: 300px; }

    #dev-panel-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 3px 10px;
      height: 22px;
      background: rgb(0 0 0 / 80%);
      cursor: pointer;
      font-weight: 600;
      color: #9aa;
      letter-spacing: 0.05em;
    }
    #dev-panel-toggle:hover { color: #cce; }
    #dev-panel-toggle .chev { font-size: 10px; opacity: 0.7; }
    #dev-panel-toggle .right { display: flex; align-items: center; gap: 10px; }
    #dev-fps { color: #8ca; min-width: 52px; text-align: right; font-weight: 500; }
    #dev-perf { color: #9ab; min-width: 130px; text-align: right; font-weight: 500; }

    #dev-panel-body {
      display: flex;
      flex-direction: column;
      height: calc(100% - 22px);
      background: transparent;
    }

    #dev-log {
      flex: 1;
      padding: 8px 10px;
      overflow-y: auto;
      background: rgba(8, 10, 16, 0.7);
      backdrop-filter: blur(2px);
      font-size: 11px;
      line-height: 1.4;
      color: #e0e6ef;
      text-shadow: 0 1px 2px rgba(0,0,0,0.8);
      /* Firefox */
      scrollbar-width: thin;
      scrollbar-color: #3a3f4a rgba(0,0,0,0.4);
    }
    /* WebKit / Chromium */
    #dev-log::-webkit-scrollbar { width: 10px; }
    #dev-log::-webkit-scrollbar-track { background: rgba(0,0,0,0.4); }
    #dev-log::-webkit-scrollbar-thumb {
      background: #3a3f4a;
      border-radius: 5px;
      border: 2px solid rgba(0,0,0,0.4);
    }
    #dev-log::-webkit-scrollbar-thumb:hover { background: #4a4f5c; }
    .dev-log-entry { white-space: pre-wrap; word-break: break-word; margin-bottom: 2px; }
    .dev-log-log   { color: #b0b0b0; }
    .dev-log-warn  { color: #e5c07b; }
    .dev-log-error { color: #ef6060; }
    .dev-log-echo  { color: #6af; }
    .dev-log-time  { color: #556; margin-right: 6px; }

    #dev-prompt-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-top: 1px solid #2a2e3a;
      background: rgba(0, 0, 0, 0.5);
    }
    #dev-prompt-wrap .caret { color: #6af; font-weight: 700; }
    #dev-prompt {
      flex: 1;
      background: transparent;
      border: 0;
      outline: 0;
      color: #e0e6ef;
      font: inherit;
      user-select: text;
    }
    #dev-prompt::placeholder { color: #5a6070; }
  `;
  document.head.appendChild(style);
}

function renderPanel(): HTMLDivElement {
  const panel = document.createElement('div');
  panel.id = 'dev-panel';
  panel.className = 'collapsed';

  panel.innerHTML = `
    <div id="dev-panel-toggle">
      <span>DEV</span>
      <span class="right">
        <span id="dev-perf" title="Sprite instances / flushes last frame">— inst · — flush</span>
        <span id="dev-fps" title="RAF frame rate — smoothed over the last 60 frames">— fps</span>
        <span class="chev">▲</span>
      </span>
    </div>
    <div id="dev-panel-body">
      <div id="dev-log"></div>
      <div id="dev-prompt-wrap">
        <span class="caret">&gt;</span>
        <input id="dev-prompt" spellcheck="false" autocomplete="off"
               placeholder="physics / grass.topRise=8 / tint(1,1,1)" />
      </div>
    </div>
  `;

  const toggle = panel.querySelector('#dev-panel-toggle') as HTMLDivElement;
  const chev = panel.querySelector('.chev') as HTMLSpanElement;
  const input = panel.querySelector('#dev-prompt') as HTMLInputElement;
  toggle.addEventListener('click', () => {
    const expand = panel.classList.contains('collapsed');
    panel.classList.toggle('collapsed', !expand);
    panel.classList.toggle('expanded', expand);
    chev.textContent = expand ? '▼' : '▲';
    if (expand) setTimeout(() => input.focus(), 50);
  });

  // Submit on Enter; up/down scrolls through history; Tab autocompletes.
  const history: string[] = [];
  let histIdx = -1;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const completions = completionsFor(input.value);
      if (completions.length === 1) {
        input.value = completions[0];
        // Move caret to end
        input.setSelectionRange(input.value.length, input.value.length);
      } else if (completions.length > 1) {
        // Complete to the longest common prefix and list the rest.
        const prefix = longestCommonPrefix(completions);
        if (prefix.length > input.value.length) input.value = prefix;
        input.setSelectionRange(input.value.length, input.value.length);
        console.log(completions.join('  '));
      }
      return;
    }
    if (e.key === 'Enter') {
      const value = input.value.trim();
      if (value) {
        history.push(value);
        histIdx = history.length;
        console.log('%c> ' + value, 'color:#6af', 'DEV_ECHO');
        runCommand(value);
        input.value = '';
      }
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      if (histIdx > 0) {
        histIdx--;
        input.value = history[histIdx];
      }
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      if (histIdx < history.length - 1) {
        histIdx++;
        input.value = history[histIdx];
      } else {
        histIdx = history.length;
        input.value = '';
      }
      e.preventDefault();
    }
  });

  return panel;
}

/**
 * Parse + execute a line typed into the dev prompt. Supports read, write and
 * helper calls against the live `settings` object.
 */
function runCommand(raw: string) {
  const input = raw.trim();
  if (!input) return;

  // Helper call: name(arg1, arg2, ...)
  const callMatch = input.match(/^(\w+)\s*\((.*)\)\s*$/);
  if (callMatch) {
    const [, name, argsStr] = callMatch;
    const fn = (settings as unknown as Record<string, unknown>)[name];
    if (typeof fn !== 'function') {
      console.error(`unknown helper: ${name}`);
      return;
    }
    const args = argsStr.trim()
      ? argsStr.split(',').map((a) => parseLiteral(a.trim()))
      : [];
    try {
      const result = (fn as (...a: unknown[]) => unknown).apply(settings, args);
      if (result !== undefined) console.log(result);
    } catch (e) {
      console.error(String(e));
    }
    return;
  }

  // Assignment: path = value
  const assignMatch = input.match(/^([\w.]+)\s*=\s*(.+)$/);
  if (assignMatch) {
    const [, path, rawValue] = assignMatch;
    const parts = path.split('.');
    let obj = config as unknown as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
      const next = obj[parts[i]];
      if (next === undefined) {
        console.error(`unknown path: ${path}`);
        return;
      }
      obj = next as Record<string, unknown>;
    }
    const key = parts[parts.length - 1];
    if (!(key in obj)) {
      console.error(`unknown path: ${path}`);
      return;
    }
    const value = parseLiteral(rawValue);
    obj[key] = value;
    console.log(`${path} = ${JSON.stringify(value)}`);
    return;
  }

  // Bare helper name (e.g. `help`, `log`) → call it without args.
  if (/^\w+$/.test(input)) {
    const fn = (settings as unknown as Record<string, unknown>)[input];
    if (typeof fn === 'function') {
      try {
        const result = (fn as (...a: unknown[]) => unknown).apply(settings);
        if (result !== undefined) console.log(result);
      } catch (e) {
        console.error(String(e));
      }
      return;
    }
  }

  // Read: path (logs value)
  const parts = input.split('.');
  let obj: unknown = config;
  for (const part of parts) {
    if (obj === null || typeof obj !== 'object' || !(part in (obj as object))) {
      console.error(`unknown path: ${input}`);
      return;
    }
    obj = (obj as Record<string, unknown>)[part];
  }
  console.log(input, obj);
}

/**
 * Build the list of completable tokens each Tab — reflects the live
 * `config` and `settings` so new fields/helpers auto-appear.
 */
function allCompletions(): string[] {
  const out: string[] = [];
  // Config groups and nested fields.
  for (const [group, value] of Object.entries(config as unknown as Record<string, unknown>)) {
    out.push(group);
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) out.push(`${group}.${key}`);
    }
  }
  // Helper function names on the settings object.
  for (const [key, value] of Object.entries(settings as unknown as Record<string, unknown>)) {
    if (typeof value === 'function') out.push(key);
  }
  return out.sort();
}

function completionsFor(partial: string): string[] {
  // Don't complete inside an assignment RHS.
  if (partial.includes('=')) return [];
  if (partial.includes('(')) return [];
  const all = allCompletions();
  return all.filter((c) => c.startsWith(partial));
}

function longestCommonPrefix(xs: string[]): string {
  if (xs.length === 0) return '';
  let prefix = xs[0];
  for (let i = 1; i < xs.length; i++) {
    while (!xs[i].startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) break;
  }
  return prefix;
}

function parseLiteral(s: string): unknown {
  const t = s.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (/^['"].*['"]$/.test(t)) return t.slice(1, -1);
  return t;
}

function startFpsMeter(el: HTMLSpanElement) {
  let last = performance.now();
  const samples: number[] = [];
  function tick() {
    requestAnimationFrame(tick);
    const now = performance.now();
    const dt = now - last;
    last = now;
    if (dt > 0) {
      samples.push(1000 / dt);
      if (samples.length > 60) samples.shift();
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      el.textContent = `${avg.toFixed(0)} fps`;
    }
  }
  requestAnimationFrame(tick);
}

function startPerfMeter(el: HTMLSpanElement) {
  function tick() {
    requestAnimationFrame(tick);
    const perf = (window as unknown as { __perf?: { instances: number; flushes: number } }).__perf;
    if (perf) el.textContent = `${perf.instances} inst · ${perf.flushes} flush`;
  }
  requestAnimationFrame(tick);
}

function installHotkey(panel: HTMLElement) {
  window.addEventListener('keydown', (e) => {
    // Backtick toggles. Avoid triggering while typing in an input (unless
    // it's the dev prompt itself, where backtick *should* still open/close).
    if (e.key !== '`' && e.key !== '~') return;
    const target = e.target as HTMLElement | null;
    const isPrompt = target?.id === 'dev-prompt';
    if (!isPrompt && target
        && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    (panel.querySelector('#dev-panel-toggle') as HTMLDivElement).click();
  });
}

function interceptConsole(logEl: HTMLDivElement) {
  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);

  console.log = (...args: unknown[]) => {
    // Echo marker sent by the prompt — render as a distinct style.
    const isEcho = args.length && args[args.length - 1] === 'DEV_ECHO';
    origLog(...(isEcho ? args.slice(0, -1) : args));
    appendLog(logEl, isEcho ? 'echo' : 'log', isEcho ? args.slice(0, -1) : args);
  };
  console.warn  = (...args: unknown[]) => { origWarn(...args);  appendLog(logEl, 'warn',  args); };
  console.error = (...args: unknown[]) => { origError(...args); appendLog(logEl, 'error', args); };
}

function appendLog(logEl: HTMLDivElement, kind: 'log' | 'warn' | 'error' | 'echo', args: unknown[]) {
  const entry = document.createElement('div');
  entry.className = `dev-log-entry dev-log-${kind}`;
  const time = new Date().toLocaleTimeString([], { hour12: false });
  entry.innerHTML =
    `<span class="dev-log-time">${time}</span>` +
    args.map(formatArg).join(' ');
  logEl.appendChild(entry);
  // Always follow the tail — old entries are still scroll-back accessible
  // but new log lines pin the view to the bottom.
  logEl.scrollTop = logEl.scrollHeight;

  // Cap log size so memory doesn't grow forever on long sessions.
  while (logEl.childElementCount > 500) logEl.firstChild?.remove();
}

function formatArg(arg: unknown): string {
  if (typeof arg === 'string') return escapeHtml(arg);
  if (arg instanceof Error) return escapeHtml(arg.stack ?? arg.message);
  try {
    return escapeHtml(JSON.stringify(arg, null, 2));
  } catch {
    return escapeHtml(String(arg));
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
