// Browser code for the call page. Compiled to public/app.js by `npm run build:web`. No dependencies.

type CallState = 'queued' | 'sent_to_phone' | 'dialing' | 'failed';
type Mode = 'number' | 'raw';
type Tone = 'ok' | 'warn' | 'err';

interface DeviceView {
  id: string;
  name: string;
  online: boolean;
  lastSeenAt: number;
}

interface CallView {
  id: string;
  display: string;
  state: CallState;
  reason?: string;
  raw?: boolean;
  createdAt: number;
}

interface StateResponse {
  devices: DeviceView[];
  calls: CallView[];
}

interface ApiError {
  message?: string;
  retryAfter?: number;
}

interface NormalizeResponse {
  ok: boolean;
  display?: string;
  message?: string;
}

interface PairingResponse {
  code: string;
  expiresAt: number;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
};

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

const STATE_LABEL: Record<CallState, string> = {
  queued: 'Queued',
  sent_to_phone: 'Sent to phone',
  dialing: 'Dialing',
  failed: 'Failed',
};

// ---- api ------------------------------------------------------------------------------------

async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<{ status: number; data: T | null }> {
  const res = await fetch(path, {
    method: opts.method ?? 'GET',
    headers: opts.body === undefined ? {} : { 'content-type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    /* empty body */
  }
  return { status: res.status, data };
}

// ---- time -----------------------------------------------------------------------------------

function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  const d = new Date(ms);
  const clock = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return clock;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ', ' + clock;
}

/** Elements carrying data-ts get their relative time refreshed in place, so lists are not rebuilt (and focus not lost). */
function tickTimes(): void {
  document.querySelectorAll<HTMLElement>('[data-ts]').forEach((el) => {
    const text = (el.dataset.prefix ?? '') + timeAgo(Number(el.dataset.ts));
    if (el.textContent !== text) el.textContent = text;
  });
}

// ---- theme ----------------------------------------------------------------------------------

const THEME_KEY = 'qd-theme';
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function storedTheme(): 'light' | 'dark' | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function effectiveTheme(): 'light' | 'dark' {
  const t = document.documentElement.dataset.theme;
  if (t === 'light' || t === 'dark') return t;
  return darkQuery.matches ? 'dark' : 'light';
}

function syncThemeButton(): void {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  $('themeBtn').setAttribute('aria-label', `Switch to ${next} theme`);
  $('themeBtn').title = `Switch to ${next} theme (Alt T)`;
}

function toggleTheme(): void {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* storage unavailable: the choice lasts for this visit only */
  }
  syncThemeButton();
}

{
  const saved = storedTheme();
  if (saved) document.documentElement.dataset.theme = saved;
  syncThemeButton();
  darkQuery.addEventListener('change', syncThemeButton);
  $('themeBtn').addEventListener('click', toggleTheme);
}

// ---- toasts ---------------------------------------------------------------------------------

function toast(message: string, tone: Tone = 'ok'): void {
  const box = $('toasts');
  const el = h('div', 'toast' + (tone === 'ok' ? '' : ' ' + tone));
  if (tone === 'err') el.setAttribute('role', 'alert');
  el.append(h('span', 'led'), h('span', '', message));
  el.firstElementChild?.setAttribute('aria-hidden', 'true');
  box.append(el);
  while (box.children.length > 3) box.firstElementChild?.remove();
  setTimeout(() => el.remove(), tone === 'ok' ? 4000 : 6000);
}

// ---- dot-matrix empty panel -----------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';

function dotMark(warn = false): SVGSVGElement {
  const lit = new Set(['5,3', '8,2', '11,3']);
  let off = '';
  let on = '';
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 6; y++) {
      const cell = `M${x * 4 + 2} ${y * 4 + 2}h0`;
      if (lit.has(`${x},${y}`)) on += cell;
      else off += cell;
    }
  }
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'dm');
  svg.setAttribute('width', '64');
  svg.setAttribute('height', '24');
  svg.setAttribute('viewBox', '0 0 64 24');
  svg.setAttribute('aria-hidden', 'true');
  const pOff = document.createElementNS(SVG_NS, 'path');
  pOff.setAttribute('class', 'off');
  pOff.setAttribute('d', off);
  const pOn = document.createElementNS(SVG_NS, 'path');
  pOn.setAttribute('class', warn ? 'on warn' : 'on');
  pOn.setAttribute('d', on);
  svg.append(pOff, pOn);
  return svg;
}

function emptyPanel(title: string, text: string, opts: { warn?: boolean; action?: HTMLElement } = {}): HTMLElement {
  const box = h('div', 'empty');
  if (opts.warn) box.setAttribute('role', 'alert');
  box.append(dotMark(opts.warn), h('h3', '', title));
  if (text) box.append(h('p', '', text));
  if (opts.action) box.append(opts.action);
  return box;
}

// ---- state ----------------------------------------------------------------------------------

let devices: DeviceView[] = [];
let lastDeviceIds: string[] | null = null;
let sheetOpen = false;
let busy = false;
let mode: Mode = 'number';
let previewOk: boolean | null = null;
let previewTimer: ReturnType<typeof setTimeout> | undefined;
let previewSeq = 0;
let deviceSig = '';
let callSig = '';

const numberEl = $<HTMLInputElement>('number');

// ---- connection indicator -------------------------------------------------------------------

let failures = 0;

function setConnection(ok: boolean): void {
  failures = ok ? 0 : failures + 1;
  const state = ok ? 'ok' : failures >= 2 ? 'down' : $('conn').dataset.state ?? 'connecting';
  $('conn').dataset.state = state;
  $('connText').textContent = state === 'ok' ? 'Connected' : state === 'down' ? 'Server unreachable' : 'Connecting…';
}

// ---- rendering ------------------------------------------------------------------------------

function renderDevices(): void {
  const sig = JSON.stringify(devices.map((d) => [d.id, d.name, d.online]));
  const online = devices.filter((d) => d.online).length;
  $('phoneSummary').textContent = devices.length ? `${online} of ${devices.length} phone${devices.length === 1 ? '' : 's'} online` : '';
  if (sig === deviceSig) return;
  deviceSig = sig;

  const list = $('devices');
  list.replaceChildren();
  for (const d of devices) {
    const row = h('li');
    const main = h('div', 'row-main');
    const meta = h('span', 'row-meta');
    if (d.online) meta.textContent = 'Online';
    else {
      meta.dataset.ts = String(d.lastSeenAt);
      meta.dataset.prefix = 'Last seen ';
    }
    main.append(h('span', 'row-title', d.name), meta);
    const unpair = h('button', 'btn', 'Unpair');
    unpair.type = 'button';
    unpair.setAttribute('aria-label', 'Unpair ' + d.name);
    unpair.addEventListener('click', () => void unpairDevice(d, unpair));
    row.append(h('span', 'dot' + (d.online ? ' on' : '')), main, unpair);
    row.firstElementChild?.setAttribute('aria-hidden', 'true');
    list.append(row);
  }
  const none = $('noDevices');
  none.hidden = devices.length > 0;
  if (!none.hidden && none.childElementCount === 0) {
    const pair = h('button', 'btn btn-primary', 'Pair a phone');
    pair.type = 'button';
    pair.addEventListener('click', () => void startPairing());
    none.append(emptyPanel('No phone paired', '', { action: pair }));
  }

  const sel = $<HTMLSelectElement>('device');
  const prev = sel.value;
  sel.replaceChildren();
  for (const d of devices) {
    const o = h('option', '', d.name + (d.online ? '' : ' (offline)'));
    o.value = d.id;
    sel.append(o);
  }
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  $('deviceRow').hidden = devices.length < 2;
}

function renderCalls(calls: CallView[]): void {
  const sig = JSON.stringify(calls.map((c) => [c.id, c.state, c.reason, c.display]));
  const none = $('noCalls');
  none.hidden = calls.length > 0;
  if (!none.hidden && none.childElementCount === 0) {
    none.append(emptyPanel('No calls yet', ''));
  }
  if (sig === callSig) return;
  callSig = sig;

  const list = $('calls');
  list.replaceChildren();
  for (const c of calls) {
    const row = h('li');
    const main = h('div', 'row-main');
    const meta = h('span', 'row-meta');
    const when = h('span');
    when.dataset.ts = String(c.createdAt);
    meta.append(when);
    if (c.raw) meta.append(document.createTextNode(' · as typed'));
    if (c.reason) meta.append(document.createTextNode(' · '), h('span', 'bad', c.reason));
    main.append(h('span', 'row-title num', c.display), meta);
    row.append(main, h('span', 'pill ' + c.state, STATE_LABEL[c.state] ?? c.state));
    list.append(row);
  }
}

function showUnauthorised(): void {
  $('main').hidden = true;
  $('keys').hidden = true;
  const box = $('unauth');
  box.hidden = false;
  box.replaceChildren(emptyPanel('Not authorised', 'This server did not accept the request. Check the address you opened, or ask whoever runs it.', { warn: true }));
  $('conn').dataset.state = 'down';
  $('connText').textContent = 'Not authorised';
}

function render(state: StateResponse): void {
  $('main').classList.remove('is-loading');
  const ids = state.devices.map((d) => d.id);
  if (lastDeviceIds && ids.some((id) => !lastDeviceIds!.includes(id))) {
    const added = state.devices.find((d) => !lastDeviceIds!.includes(d.id));
    closePairing();
    toast('Phone paired' + (added ? ': ' + added.name : ''));
  }
  lastDeviceIds = ids;
  devices = state.devices;
  renderDevices();
  renderCalls(state.calls);
  tickTimes();
  updateCallButton();
}

let polling = false;
async function refresh(): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    const { status, data } = await api<StateResponse>('/api/state');
    if (status === 401 || status === 403) {
      showUnauthorised();
      return;
    }
    if (status === 200 && data) {
      setConnection(true);
      render(data);
    } else {
      setConnection(false);
    }
  } catch {
    setConnection(false);
  } finally {
    polling = false;
  }
}

// ---- dial form ------------------------------------------------------------------------------

function setPreview(kind: '' | 'ok' | 'err', label: string, value: string): void {
  const p = $('preview');
  p.dataset.kind = kind;
  p.querySelector('.pv-label')!.textContent = label;
  p.querySelector('.pv-value')!.textContent = value;
  $('display').dataset.invalid = kind === 'err' ? 'true' : 'false';
  numberEl.setAttribute('aria-invalid', kind === 'err' ? 'true' : 'false');
}

function resetPreview(): void {
  previewOk = null;
  setPreview('', '', '');
}

function updateCallButton(): void {
  const btn = $<HTMLButtonElement>('callBtn');
  const empty = numberEl.value.trim() === '';
  const noPhone = devices.length === 0 && !$('main').classList.contains('is-loading');
  btn.disabled = busy || empty || noPhone;
  btn.classList.toggle('is-busy', busy);
  btn.setAttribute('aria-busy', String(busy));
  $('callLabel').textContent = busy ? 'Sending…' : 'Call';
  $('callNote').textContent = noPhone ? 'Pair a phone to place calls.' : '';
}

function preview(): void {
  clearTimeout(previewTimer);
  const value = numberEl.value;
  numberEl.classList.toggle('long', value.length > 14);
  updateCallButton();
  if (!value.trim()) {
    previewSeq++;
    resetPreview();
    return;
  }
  const seq = ++previewSeq;
  const raw = mode === 'raw';
  previewTimer = setTimeout(async () => {
    try {
      const { data } = await api<NormalizeResponse>('/api/normalize?number=' + encodeURIComponent(value) + (raw ? '&raw=1' : ''));
      if (seq !== previewSeq || !data) return;
      if (data.ok) {
        previewOk = true;
        setPreview('ok', raw ? 'Dials exactly' : 'Will dial', data.display ?? '');
      } else {
        previewOk = false;
        setPreview('err', '', data.message ?? 'Not a valid number.');
      }
    } catch {
      /* the connection indicator reports this */
    }
  }, 150);
}

function setMode(next: Mode, focus = false): void {
  mode = next;
  const seg = $('modeSeg');
  seg.dataset.value = next;
  seg.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    const on = b.dataset.mode === next;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
    if (on && focus) b.focus();
  });
  numberEl.inputMode = next === 'raw' ? 'text' : 'tel';
  numberEl.placeholder = next === 'raw' ? 'e.g. 112, *#06#, 1800123456,,1' : 'Enter a number';
  preview();
}

function insert(text: string): void {
  const el = numberEl;
  if (el.value.length >= el.maxLength) return;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  el.setRangeText(text, start, end, 'end');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  if (matchMedia('(hover: hover)').matches) el.focus();
}

function backspace(): void {
  const el = numberEl;
  let start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  if (start === end) {
    if (start === 0) return;
    start -= 1;
  }
  el.setRangeText('', start, end, 'end');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  if (matchMedia('(hover: hover)').matches) el.focus();
}

function clearField(): void {
  if (!numberEl.value) return;
  numberEl.value = '';
  preview();
}

async function submitCall(): Promise<void> {
  if (busy) return;
  const value = numberEl.value;
  if (!value.trim()) {
    numberEl.focus();
    return;
  }
  if (devices.length === 0) {
    toast('Pair a phone first.', 'warn');
    return;
  }
  busy = true;
  updateCallButton();
  try {
    const body: { number: string; raw?: boolean; deviceId?: string } = { number: value };
    if (mode === 'raw') body.raw = true;
    if (!$('deviceRow').hidden) body.deviceId = $<HTMLSelectElement>('device').value;
    const { status, data } = await api<CallView & ApiError>('/api/calls', { method: 'POST', body });
    if (status === 201 && data) {
      previewSeq++;
      numberEl.value = '';
      numberEl.classList.remove('long');
      resetPreview();
      toast(`Queued ${data.display}. Waiting for your phone.`);
      callSig = '';
    } else if (status === 429) {
      const msg = `Slow down: try again in ${data?.retryAfter ?? 'a few'} seconds.`;
      setPreview('err', '', msg);
      toast(msg, 'warn');
    } else {
      const msg = data?.message ?? 'Could not place the call.';
      setPreview('err', '', msg);
      toast(msg, 'err');
    }
  } catch {
    setPreview('err', '', 'Server unreachable.');
    toast('Server unreachable. Nothing was sent.', 'err');
  } finally {
    busy = false;
    updateCallButton();
    void refresh();
  }
}

numberEl.addEventListener('input', preview);
$('dialForm').addEventListener('submit', (e) => {
  e.preventDefault();
  void submitCall();
});
$('backBtn').addEventListener('click', backspace);
$('backBtn').addEventListener('mousedown', (e) => e.preventDefault());

// Segmented control: click, and arrow keys move between the two options.
$('modeSeg').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-mode]');
  if (b) setMode(b.dataset.mode as Mode);
});
$('modeSeg').addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    e.preventDefault();
    setMode(mode === 'number' ? 'raw' : 'number', true);
  }
});

// ---- confirm sheet --------------------------------------------------------------------------

interface SheetOptions {
  kicker: string;
  title: string;
  summary: string;
  note?: string;
  confirmLabel: string;
  danger?: boolean;
}

/** Right-edge sheet (bottom sheet on phones). Focus is trapped, Escape and the backdrop cancel, focus returns to the opener. */
function confirmSheet(opts: SheetOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const opener = document.activeElement as HTMLElement | null;
    sheetOpen = true;
    const backdrop = h('div', 'backdrop');
    const sheet = h('aside', 'confirm-sheet' + (opts.danger ? ' is-danger' : ''));
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.tabIndex = -1;
    const head = h('header', 'confirm-head');
    const title = h('h2', '', opts.title);
    title.id = 'sheetTitle';
    sheet.setAttribute('aria-labelledby', 'sheetTitle');
    head.append(h('span', 'kicker', opts.kicker), title);
    const body = h('div', 'confirm-body');
    body.append(h('p', '', opts.summary));
    if (opts.note) body.append(h('p', 'meta', opts.note));
    const foot = h('footer', 'confirm-foot');
    const cancel = h('button', 'btn', 'Cancel');
    cancel.type = 'button';
    const ok = h('button', 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary'), opts.confirmLabel);
    ok.type = 'button';
    foot.append(cancel, ok);
    sheet.append(head, body, foot);
    backdrop.append(sheet);
    document.body.append(backdrop);
    cancel.focus();

    const close = (result: boolean): void => {
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      sheetOpen = false;
      if (opener?.isConnected) opener.focus();
      resolve(result);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(false);
      } else if (e.key === 'Tab') {
        const items = [...sheet.querySelectorAll<HTMLElement>('button:not([disabled])')];
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (!sheet.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    cancel.addEventListener('click', () => close(false));
    ok.addEventListener('click', () => close(true));
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) close(false);
    });
  });
}

async function unpairDevice(d: DeviceView, opener: HTMLElement): Promise<void> {
  const yes = await confirmSheet({
    kicker: 'Confirm',
    title: `Unpair ${d.name}?`,
    summary: `${d.name} will stop receiving calls from this page. You can pair it again later with a new code.`,
    note: 'Calls already sent to the phone are not recalled.',
    confirmLabel: 'Unpair',
    danger: true,
  });
  if (!yes) return;
  try {
    const { status } = await api('/api/devices/' + encodeURIComponent(d.id), { method: 'DELETE' });
    if (status === 200) toast(`Unpaired ${d.name}.`);
    else toast(`Could not unpair ${d.name}.`, 'err');
  } catch {
    toast(`Could not unpair ${d.name}: server unreachable.`, 'err');
  }
  deviceSig = '';
  await refresh();
  if (opener.isConnected) opener.focus();
  else $('pairBtn').focus();
}

// ---- pairing --------------------------------------------------------------------------------

let pairExpires = 0;
let pairTotal = 1;
let pairTimer: ReturnType<typeof setInterval> | undefined;

function closePairing(): void {
  clearInterval(pairTimer);
  pairTimer = undefined;
  $('pairBox').hidden = true;
  $('pairLabel').textContent = 'Pair a phone';
}

function tickPairing(): void {
  const leftMs = pairExpires - Date.now();
  const left = Math.ceil(leftMs / 1000);
  if (left <= 0) {
    closePairing();
    toast('The pairing code expired. Make a new one to try again.', 'warn');
    return;
  }
  $('codeMeta').textContent = `Expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  const track = $('codeTrack');
  track.style.setProperty('--p', String(Math.max(0, Math.min(100, (leftMs / pairTotal) * 100))));
  track.classList.toggle('warn', left <= 60);
}

async function startPairing(): Promise<void> {
  const btn = $<HTMLButtonElement>('pairBtn');
  btn.disabled = true;
  try {
    const { status, data } = await api<PairingResponse>('/api/pairing-code', { method: 'POST', body: {} });
    if (status !== 201 || !data) {
      toast(status === 429 ? 'Too many codes requested. Wait a minute.' : 'Could not create a pairing code.', status === 429 ? 'warn' : 'err');
      return;
    }
    $('code').textContent = data.code;
    $('addr').textContent = location.host;
    pairExpires = data.expiresAt;
    pairTotal = Math.max(1, data.expiresAt - Date.now());
    $('pairBox').hidden = false;
    $('pairLabel').textContent = 'New code';
    $('copyLabel').textContent = 'Copy';
    clearInterval(pairTimer);
    tickPairing();
    pairTimer = setInterval(tickPairing, 1000);
    $('copyBtn').focus();
  } catch {
    toast('Server unreachable.', 'err');
  } finally {
    btn.disabled = false;
  }
}

async function copyCode(): Promise<void> {
  const text = $('code').textContent ?? '';
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    const range = document.createRange();
    range.selectNodeContents($('code'));
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
  }
  if (copied) {
    $('copyLabel').textContent = 'Copied';
    toast('Pairing code copied.');
    setTimeout(() => ($('copyLabel').textContent = 'Copy'), 1800);
  } else {
    toast('Could not copy. The code is selected: press Ctrl+C.', 'warn');
  }
}

$('pairBtn').addEventListener('click', () => void startPairing());
$('copyBtn').addEventListener('click', () => void copyCode());
$('pairClose').addEventListener('click', () => {
  closePairing();
  $('pairBtn').focus();
});

// ---- keyboard -------------------------------------------------------------------------------

numberEl.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape') clearField();
});

document.addEventListener('keydown', (e) => {
  if (sheetOpen || e.defaultPrevented) return;
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    const act: Record<string, () => void> = {
      KeyP: () => void startPairing(),
      KeyT: toggleTheme,
      KeyM: () => setMode(mode === 'number' ? 'raw' : 'number'),
    };
    const fn = act[e.code];
    if (fn) {
      e.preventDefault();
      fn();
    }
    return;
  }
  if (e.ctrlKey || e.metaKey) return;
  const t = e.target as HTMLElement;
  if (t === numberEl) return;
  if (t.closest('input, select, textarea, [contenteditable], [role="radio"], [role="dialog"]')) return;
  if (/^[0-9+*#,]$/.test(e.key)) {
    e.preventDefault();
    numberEl.focus();
    numberEl.setSelectionRange(numberEl.value.length, numberEl.value.length);
    insert(e.key);
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    numberEl.focus();
    backspace();
  } else if (e.key === 'Escape') {
    clearField();
  } else if (e.key === 'Enter' && !t.closest('button, a')) {
    e.preventDefault();
    void submitCall();
  }
});

// ---- start ----------------------------------------------------------------------------------

$('addr').textContent = location.host;
setMode('number');
resetPreview();
updateCallButton();
if (matchMedia('(hover: hover)').matches) numberEl.focus();
void refresh();
setInterval(() => void refresh(), 2000);
setInterval(tickTimes, 1000);
