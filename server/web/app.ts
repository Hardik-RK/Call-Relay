// Browser code for the call page. Compiled to public/app.js by `npm run build:web`.

type CallState = 'queued' | 'sent_to_phone' | 'dialing' | 'failed';

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

type HintKind = '' | 'ok' | 'err';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
};

const STATE_LABEL: Record<CallState, string> = {
  queued: 'Queued',
  sent_to_phone: 'Sent to phone',
  dialing: 'Dialing',
  failed: 'Failed',
};

let accessKey = '';
try {
  accessKey = sessionStorage.getItem('qd-key') ?? '';
} catch {
  /* storage unavailable */
}
let pairExpires = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let previewTimer: ReturnType<typeof setTimeout> | undefined;
let previewSeq = 0;
let lastDeviceCount = -1;

interface ApiOptions {
  method?: string;
  body?: unknown;
}

async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<{ status: number; data: T | null }> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (accessKey) headers['x-access-key'] = accessKey;
  const res = await fetch(path, {
    method: opts.method ?? 'GET',
    headers,
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

function setHint(text: string, kind: HintKind = ''): void {
  const h = $('hint');
  h.textContent = text;
  h.className = 'hint' + (kind ? ' ' + kind : '');
}

function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function li(children: HTMLElement[]): HTMLLIElement {
  const el = document.createElement('li');
  el.className = 'item';
  children.forEach((c) => el.appendChild(c));
  return el;
}

function span(text: string, cls?: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.textContent = text;
  if (cls) el.className = cls;
  return el;
}

const rawMode = (): boolean => $<HTMLInputElement>('rawMode').checked;

function render(state: StateResponse): void {
  $('keyCard').classList.add('hidden');
  if (lastDeviceCount >= 0 && state.devices.length > lastDeviceCount) {
    clearInterval(timer);
    $('pairBox').classList.add('hidden');
  }
  lastDeviceCount = state.devices.length;

  const devices = $('devices');
  devices.replaceChildren();
  for (const d of state.devices) {
    const left = document.createElement('div');
    const top = document.createElement('div');
    top.append(span('', 'dot' + (d.online ? ' on' : '')), span(d.name, 'num'));
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = d.online ? 'Online' : 'Last seen ' + timeAgo(d.lastSeenAt);
    left.append(top, meta);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'small';
    btn.textContent = 'Unpair';
    btn.addEventListener('click', async () => {
      if (!confirm('Unpair ' + d.name + '?')) return;
      await api('/api/devices/' + encodeURIComponent(d.id), { method: 'DELETE' });
      void refresh();
    });
    devices.appendChild(li([left, btn]));
  }
  $('noDevices').classList.toggle('hidden', state.devices.length > 0);

  const sel = $<HTMLSelectElement>('device');
  const prev = sel.value;
  sel.replaceChildren();
  for (const d of state.devices) {
    const o = document.createElement('option');
    o.value = d.id;
    o.textContent = d.name + (d.online ? '' : ' (offline)');
    sel.appendChild(o);
  }
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  $('deviceRow').classList.toggle('hidden', state.devices.length < 2);

  const calls = $('calls');
  calls.replaceChildren();
  for (const c of state.calls) {
    const left = document.createElement('div');
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = timeAgo(c.createdAt) + (c.raw ? ' · as typed' : '') + (c.reason ? ' · ' + c.reason : '');
    left.append(span(c.display, 'num'), meta);
    calls.appendChild(li([left, span(STATE_LABEL[c.state] ?? c.state, 'badge ' + c.state)]));
  }
  $('noCalls').classList.toggle('hidden', state.calls.length > 0);
}

async function refresh(): Promise<void> {
  try {
    const { status, data } = await api<StateResponse>('/api/state');
    if (status === 401) {
      $('keyCard').classList.remove('hidden');
      return;
    }
    if (status === 200 && data) render(data);
  } catch {
    /* server briefly unreachable: keep the last view */
  }
}

$('keyBtn').addEventListener('click', async () => {
  accessKey = $<HTMLInputElement>('key').value;
  const { status } = await api('/api/state');
  if (status === 200) {
    try {
      sessionStorage.setItem('qd-key', accessKey);
    } catch {
      /* ignore */
    }
    $('keyErr').textContent = '';
    void refresh();
  } else {
    $('keyErr').textContent = status === 429 ? 'Too many attempts. Wait a minute.' : 'That key was not accepted.';
  }
});

function preview(): void {
  clearTimeout(previewTimer);
  const value = $<HTMLInputElement>('number').value;
  if (!value.trim()) {
    setHint('');
    return;
  }
  const seq = ++previewSeq;
  const raw = rawMode();
  previewTimer = setTimeout(async () => {
    const { data } = await api<NormalizeResponse>(
      '/api/normalize?number=' + encodeURIComponent(value) + (raw ? '&raw=1' : ''),
    );
    if (seq !== previewSeq || !data) return;
    if (data.ok) setHint((raw ? 'Will dial exactly: ' : 'Will dial ') + (data.display ?? ''), 'ok');
    else setHint(data.message ?? 'Not a valid number.', 'err');
  }, 200);
}

$('number').addEventListener('input', preview);
$('rawMode').addEventListener('change', () => {
  const input = $<HTMLInputElement>('number');
  input.placeholder = rawMode() ? 'e.g. 112, *#06#, 1800123456,,1' : 'e.g. 91234 56789';
  input.inputMode = rawMode() ? 'text' : 'tel';
  $('rawNote').classList.toggle('hidden', !rawMode());
  preview();
});

$('dialForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $<HTMLButtonElement>('callBtn');
  btn.disabled = true;
  try {
    const body: { number: string; raw?: boolean; deviceId?: string } = { number: $<HTMLInputElement>('number').value };
    if (rawMode()) body.raw = true;
    if (!$('deviceRow').classList.contains('hidden')) body.deviceId = $<HTMLSelectElement>('device').value;
    const { status, data } = await api<CallView & ApiError>('/api/calls', { method: 'POST', body });
    if (status === 201 && data) {
      previewSeq++;
      setHint('Queued ' + data.display + '. Waiting for your phone.', 'ok');
      $<HTMLInputElement>('number').value = '';
    } else if (status === 429) {
      setHint('Slow down: try again in ' + (data?.retryAfter ?? 'a few') + ' seconds.', 'err');
    } else {
      setHint(data?.message ?? 'Could not place the call.', 'err');
    }
  } catch {
    setHint('Server unreachable.', 'err');
  } finally {
    btn.disabled = false;
    void refresh();
  }
});

function tickCode(): void {
  clearInterval(timer);
  const update = (): void => {
    const left = Math.round((pairExpires - Date.now()) / 1000);
    if (left <= 0) {
      $('pairBox').classList.add('hidden');
      clearInterval(timer);
      return;
    }
    $('codeMeta').textContent = 'Expires in ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
  };
  update();
  timer = setInterval(update, 1000);
}

$('pairBtn').addEventListener('click', async () => {
  const { status, data } = await api<PairingResponse>('/api/pairing-code', { method: 'POST', body: {} });
  if (status !== 201 || !data) {
    $('code').textContent = '';
    $('codeMeta').textContent = status === 429 ? 'Too many codes requested. Wait a minute.' : 'Could not create a code.';
    $('pairBox').classList.remove('hidden');
    return;
  }
  $('code').textContent = data.code;
  pairExpires = data.expiresAt;
  $('pairBox').classList.remove('hidden');
  tickCode();
});

void refresh();
setInterval(() => void refresh(), 2000);
