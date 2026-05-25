'use strict';

/*
 * Claude Counter Desktop — main process  (v0.5)
 * ------------------------------------------------------------------
 * Tracks two kinds of session:
 *   - Cowork sessions  — read from local transcripts, exact token counts
 *   - Claude web chats — read from claude.ai, size estimated from text
 * Both get the same context bar and the same "start a new chat" warning,
 * each measured against its own context window.
 *
 * Consumes ZERO Claude tokens. It never sends a message or calls the
 * model. It reads local transcript files and makes read-only GETs to
 * claude.ai (the usage page and your conversation list).
 */

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CLAUDE_URL = 'https://claude.ai/';
const USAGE_POLL_MS = 60 * 1000;
const CONTEXT_POLL_MS = 20 * 1000;
const CHARS_PER_TOKEN = 4; // rough estimate for web chats (no exact count available)

// Cowork sessions run a large context window.
const COWORK_LIMIT = 1000000, COWORK_LARGE = 300000, COWORK_HUGE = 600000;
// Claude web chats run the standard 200k window.
const WEB_LIMIT = 200000, WEB_LARGE = 120000, WEB_HUGE = 170000;

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// =========================================================================
// Browser-side snippets (run inside the logged-in claude.ai page).
// Read-only GETs only. No backticks or ${ } inside these strings.
// =========================================================================
const USAGE_SNIPPET = `
(async () => {
  try {
    var c = document.cookie.split('; ').find(function (x) { return x.indexOf('lastActiveOrg=') === 0; });
    var org = c ? c.split('=')[1] : null;
    if (!org) return { state: 'login' };
    var r = await fetch('/api/organizations/' + org + '/usage',
      { credentials: 'include', headers: { accept: 'application/json' } });
    if (r.status === 401 || r.status === 403) return { state: 'login' };
    if (!r.ok) return { state: 'error', message: 'HTTP ' + r.status };
    return { state: 'ok', usage: await r.json() };
  } catch (e) {
    return { state: 'error', message: String((e && e.message) || e) };
  }
})()
`;

// Pure-JS helpers: walk a conversation's active branch and pull out text.
const HELPERS = `
  function txtOfItem(item) {
    if (!item || typeof item !== 'object' || typeof item.type !== 'string') return '';
    var t = item.type;
    if (t === 'thinking' || t === 'redacted_thinking' || t === 'image' || t === 'document') return '';
    if (t === 'text' && typeof item.text === 'string') return item.text;
    if (t === 'tool_use') { try { return JSON.stringify({ name: item.name, input: item.input }); } catch (e) { return ''; } }
    if (t === 'tool_result') { try { return JSON.stringify({ is_error: item.is_error, content: item.content }); } catch (e) { return ''; } }
    if (typeof item.text === 'string') return item.text;
    if (typeof item.content === 'string') return item.content;
    return '';
  }
  function msgText(m) {
    var parts = [];
    var content = Array.isArray(m && m.content) ? m.content : [];
    for (var i = 0; i < content.length; i++) { var s = txtOfItem(content[i]); if (s) parts.push(s); }
    var att = Array.isArray(m && m.attachments) ? m.attachments : [];
    for (var j = 0; j < att.length; j++) {
      if (att[j] && typeof att[j].extracted_content === 'string') parts.push(att[j].extracted_content);
    }
    return parts.join('\\n');
  }
  function trunk(conv) {
    var ROOT = '00000000-0000-4000-8000-000000000000';
    var msgs = Array.isArray(conv && conv.chat_messages) ? conv.chat_messages : [];
    var byId = {};
    for (var i = 0; i < msgs.length; i++) { if (msgs[i] && msgs[i].uuid) byId[msgs[i].uuid] = msgs[i]; }
    var cur = conv && conv.current_leaf_message_uuid;
    var out = [], guard = 0;
    while (cur && cur !== ROOT && guard < 20000) {
      var m = byId[cur]; if (!m) break;
      out.push(m); cur = m.parent_message_uuid; guard++;
    }
    out.reverse();
    return out;
  }
`;

// Body: list recent web chats and measure each one's text length.
const WEB_LIST_BODY = `
  try {
    var c = document.cookie.split('; ').find(function (x) { return x.indexOf('lastActiveOrg=') === 0; });
    var org = c ? c.split('=')[1] : null;
    if (!org) return { state: 'login' };
    var base = '/api/organizations/' + org;
    var TREE = '?tree=true&rendering_mode=messages&render_all_tools=true';
    var lr = await fetch(base + '/chat_conversations?limit=40', { credentials: 'include', headers: { accept: 'application/json' } });
    if (lr.status === 401 || lr.status === 403) return { state: 'login' };
    if (!lr.ok) return { state: 'error', message: 'HTTP ' + lr.status };
    var list = await lr.json();
    if (!Array.isArray(list) && list && Array.isArray(list.conversations)) list = list.conversations;
    if (!Array.isArray(list)) list = [];
    var items = [];
    for (var i = 0; i < list.length; i++) {
      var x = list[i];
      if (x && x.uuid) items.push({ id: x.uuid, name: x.name || 'Untitled chat', updated_at: x.updated_at || x.created_at || null });
    }
    items.sort(function (a, b) { return (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0); });
    items = items.slice(0, 15);
    var chats = await Promise.all(items.map(async function (it) {
      try {
        var cr = await fetch(base + '/chat_conversations/' + it.id + TREE, { credentials: 'include', headers: { accept: 'application/json' } });
        if (!cr.ok) return { id: it.id, name: it.name, updated_at: it.updated_at, chars: 0 };
        var conv = await cr.json();
        var tk = trunk(conv);
        var total = 0;
        for (var n = 0; n < tk.length; n++) { var s = msgText(tk[n]); if (s) total += s.length; }
        return { id: it.id, name: (conv && conv.name) || it.name, updated_at: it.updated_at, chars: total };
      } catch (e) {
        return { id: it.id, name: it.name, updated_at: it.updated_at, chars: 0 };
      }
    }));
    return { state: 'ok', chats: chats };
  } catch (e) {
    return { state: 'error', message: String((e && e.message) || e) };
  }
`;

// Body: measure one web chat by id (CID is injected before this runs).
const WEB_ONE_BODY = `
  try {
    var c = document.cookie.split('; ').find(function (x) { return x.indexOf('lastActiveOrg=') === 0; });
    var org = c ? c.split('=')[1] : null;
    if (!org) return { state: 'login' };
    var base = '/api/organizations/' + org;
    var cr = await fetch(base + '/chat_conversations/' + CID + '?tree=true&rendering_mode=messages&render_all_tools=true',
      { credentials: 'include', headers: { accept: 'application/json' } });
    if (cr.status === 401 || cr.status === 403) return { state: 'login' };
    if (!cr.ok) return { state: 'error', message: 'HTTP ' + cr.status };
    var conv = await cr.json();
    var tk = trunk(conv);
    var total = 0;
    for (var n = 0; n < tk.length; n++) { var s = msgText(tk[n]); if (s) total += s.length; }
    return { state: 'ok', name: (conv && conv.name) || 'Claude chat', chars: total };
  } catch (e) {
    return { state: 'error', message: String((e && e.message) || e) };
  }
`;

const WEB_LIST_SNIPPET = '(async () => {' + HELPERS + WEB_LIST_BODY + '})()';
function webOneSnippet(id) {
  return '(async () => { var CID = ' + JSON.stringify(String(id)) + ';' + HELPERS + WEB_ONE_BODY + '})()';
}

// =========================================================================
// State
// =========================================================================
let overlay = null, worker = null, picker = null;
let usageTimer = null, contextTimer = null;
let usagePolling = false;
let pinned = null; // { kind: 'cowork'|'web', id, name } or null (= auto)

function sendOverlay(ch, p) { if (overlay && !overlay.isDestroyed()) overlay.webContents.send(ch, p); }
function sendPicker(ch, p) { if (picker && !picker.isDestroyed()) picker.webContents.send(ch, p); }

// --- pinned-session persistence ------------------------------------------
function pinPath() { return path.join(app.getPath('userData'), 'cc-pin.json'); }
function loadPin() {
  try {
    const o = JSON.parse(fs.readFileSync(pinPath(), 'utf8'));
    if (o && o.kind && o.id) return { kind: String(o.kind), id: String(o.id), name: String(o.name || 'session') };
  } catch (e) { /* none */ }
  return null;
}
function savePin(p) {
  try { fs.writeFileSync(pinPath(), JSON.stringify(p || null)); } catch (e) { /* ignore */ }
}

// --- tiers ----------------------------------------------------------------
function tierOf(ctx, kind) {
  const large = kind === 'web' ? WEB_LARGE : COWORK_LARGE;
  const huge = kind === 'web' ? WEB_HUGE : COWORK_HUGE;
  if (ctx >= huge) return 'huge';
  if (ctx >= large) return 'large';
  return 'ok';
}
function limitOf(kind) { return kind === 'web' ? WEB_LIMIT : COWORK_LIMIT; }

// --- Cowork transcript discovery (local, exact) --------------------------
function findTranscripts() {
  const home = os.homedir();
  const seeds = [
    path.join(home, '.claude', 'projects'),
    path.join(home, 'AppData', 'Roaming', 'Claude', 'local-agent-mode-sessions')
  ];
  const found = new Set();
  const walk = (dir, depth) => {
    if (depth > 7) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        const n = e.name.toLowerCase();
        if (n === 'node_modules' || n === 'uploads' || n === 'outputs') continue;
        walk(full, depth + 1);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.jsonl')) {
        found.add(full);
      }
    }
  };
  for (const s of seeds) walk(s, 0);
  return Array.from(found);
}
function mtimeOf(f) { try { return fs.statSync(f).mtimeMs; } catch (e) { return 0; } }

function summarize(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { return null; }
  let title = null, context = 0, lastTs = 0, sessionId = null;
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln) continue;
    let o;
    try { o = JSON.parse(ln); } catch (e) { continue; }
    if (o.type === 'ai-title' && typeof o.aiTitle === 'string' && o.aiTitle) title = o.aiTitle;
    if (typeof o.sessionId === 'string' && o.sessionId) sessionId = o.sessionId;
    if (typeof o.timestamp === 'string') { const t = Date.parse(o.timestamp); if (t) lastTs = Math.max(lastTs, t); }
    const m = o.message;
    if (m && typeof m === 'object' && m.usage && typeof m.usage === 'object') {
      const u = m.usage;
      const c = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
      if (c > 0) context = c;
    }
  }
  return {
    id: sessionId || path.basename(file, '.jsonl'),
    file: file,
    title: title || 'Untitled session',
    context: context,
    lastActiveMs: Math.max(mtimeOf(file), lastTs)
  };
}

// --- worker helper --------------------------------------------------------
// Runs a snippet inside the hidden claude.ai window. Returns { state: 'pending' }
// when the window is not ready yet, so callers can quietly wait.
async function runOnWorker(snippet) {
  if (!worker || worker.isDestroyed() || worker.webContents.isLoading()) return { state: 'pending' };
  const url = worker.webContents.getURL() || '';
  if (!url.startsWith('https://claude.ai')) {
    if (!worker.isVisible()) worker.loadURL(CLAUDE_URL, { userAgent: CHROME_UA });
    return { state: 'pending' };
  }
  try {
    const r = await worker.webContents.executeJavaScript(snippet, true);
    return (r && typeof r === 'object') ? r : { state: 'error', message: 'No response' };
  } catch (e) {
    return { state: 'error', message: String(e) };
  }
}

// --- pollers --------------------------------------------------------------
function coworkContext(target) {
  const s = summarize(target);
  if (!s) return null;
  return { kind: 'cowork', tokens: s.context, title: s.title, limit: COWORK_LIMIT, tier: tierOf(s.context, 'cowork') };
}

async function pollContext() {
  // Pinned web chat: read it from claude.ai.
  if (pinned && pinned.kind === 'web') {
    const r = await runOnWorker(webOneSnippet(pinned.id));
    if (r.state === 'pending') return; // worker not ready — keep last value
    if (r.state === 'ok') {
      const tokens = Math.round((r.chars || 0) / CHARS_PER_TOKEN);
      sendOverlay('context', {
        kind: 'web', tokens: tokens, title: r.name || pinned.name || 'Claude chat',
        limit: WEB_LIMIT, tier: tierOf(tokens, 'web')
      });
    } else {
      sendOverlay('context', { kind: 'web', unavailable: true, title: pinned.name || 'Claude chat' });
    }
    return;
  }
  // Pinned Cowork session.
  if (pinned && pinned.kind === 'cowork') {
    let ok = false;
    try { ok = fs.statSync(pinned.id).isFile(); } catch (e) { ok = false; }
    if (ok) { sendOverlay('context', coworkContext(pinned.id)); return; }
  }
  // Auto: most recently active Cowork transcript.
  const files = findTranscripts();
  let target = null, best = -1;
  for (const f of files) { const mt = mtimeOf(f); if (mt > best) { best = mt; target = f; } }
  sendOverlay('context', target ? coworkContext(target) : null);
}

function normalizeUsage(raw) {
  const pick = (w) => {
    if (!w || typeof w.utilization !== 'number' || !isFinite(w.utilization)) return null;
    return {
      utilization: Math.max(0, Math.min(100, w.utilization)),
      resets_at: typeof w.resets_at === 'string' ? w.resets_at : null
    };
  };
  raw = raw && typeof raw === 'object' ? raw : {};
  return { five_hour: pick(raw.five_hour), seven_day: pick(raw.seven_day) };
}

async function pollUsage() {
  if (usagePolling) return;
  usagePolling = true;
  let r;
  try { r = await runOnWorker(USAGE_SNIPPET); } finally { usagePolling = false; }
  if (r.state === 'pending') return;
  if (r.state === 'login') {
    sendOverlay('usage', { state: 'login' });
    if (worker && !worker.isDestroyed() && !worker.isVisible()) { worker.show(); worker.focus(); }
  } else if (r.state === 'error') {
    sendOverlay('usage', { state: 'error', message: r.message || 'Connection error' });
  } else {
    if (worker && !worker.isDestroyed() && worker.isVisible()) worker.hide();
    sendOverlay('usage', { state: 'ok', usage: normalizeUsage(r.usage) });
  }
}

// --- session list for the picker -----------------------------------------
async function buildSessionList() {
  const out = [];
  // Cowork sessions (local, de-duplicated).
  const byId = new Map();
  for (const f of findTranscripts()) {
    const s = summarize(f);
    if (!s) continue;
    const prev = byId.get(s.id);
    if (!prev || s.lastActiveMs > prev.lastActiveMs) byId.set(s.id, s);
  }
  for (const s of byId.values()) {
    out.push({
      kind: 'cowork', id: s.file, title: s.title,
      context: s.context, tier: tierOf(s.context, 'cowork'), lastActiveMs: s.lastActiveMs
    });
  }
  // Claude web chats (via claude.ai).
  let webState = 'ok';
  const r = await runOnWorker(WEB_LIST_SNIPPET);
  if (r.state === 'ok' && Array.isArray(r.chats)) {
    for (const ch of r.chats) {
      const tokens = Math.round((ch.chars || 0) / CHARS_PER_TOKEN);
      out.push({
        kind: 'web', id: ch.id, title: ch.name || 'Claude chat',
        context: tokens, tier: tierOf(tokens, 'web'), lastActiveMs: Date.parse(ch.updated_at) || 0
      });
    }
  } else {
    webState = r.state; // login | pending | error
  }
  out.sort((a, b) => b.lastActiveMs - a.lastActiveMs);
  return { sessions: out.slice(0, 50), webState: webState };
}

// --- windows --------------------------------------------------------------
function createOverlay() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 300, height = 168;
  overlay = new BrowserWindow({
    width, height,
    x: workArea.x + workArea.width - width - 16,
    y: workArea.y + 16,
    frame: false, resizable: false, transparent: true, alwaysOnTop: true,
    skipTaskbar: false, fullscreenable: false, maximizable: false,
    title: 'Claude Counter',
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.loadFile(path.join(__dirname, 'overlay.html'));
  overlay.webContents.on('did-finish-load', () => pollContext());
  overlay.on('closed', () => { overlay = null; app.quit(); });
}

function createWorker() {
  worker = new BrowserWindow({
    width: 460, height: 660, show: false,
    title: 'Claude Counter — sign in to claude.ai',
    autoHideMenuBar: true,
    webPreferences: { partition: 'persist:claude-counter', nodeIntegration: false, contextIsolation: true }
  });
  worker.webContents.setWindowOpenHandler(() => ({ action: 'allow' }));
  worker.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); worker.hide(); } });
  worker.webContents.on('did-finish-load', () => pollUsage());
  worker.webContents.on('did-fail-load', (_e, code, desc) => {
    if (code === -3) return;
    sendOverlay('usage', { state: 'error', message: 'Network: ' + desc });
  });
  worker.loadURL(CLAUDE_URL, { userAgent: CHROME_UA });
}

function openPicker() {
  if (picker && !picker.isDestroyed()) { picker.show(); picker.focus(); return; }
  picker = new BrowserWindow({
    width: 410, height: 540, title: 'Claude Counter — pick a session',
    autoHideMenuBar: true, resizable: true, minimizable: false, maximizable: false,
    backgroundColor: '#1e1d1b',
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  picker.loadFile(path.join(__dirname, 'picker.html'));
  picker.on('closed', () => { picker = null; });
}

// --- lifecycle & IPC ------------------------------------------------------
app.whenReady().then(() => {
  pinned = loadPin();
  createOverlay();
  createWorker();
  pollContext();
  usageTimer = setInterval(pollUsage, USAGE_POLL_MS);
  contextTimer = setInterval(pollContext, CONTEXT_POLL_MS);
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (usageTimer) clearInterval(usageTimer);
  if (contextTimer) clearInterval(contextTimer);
});
app.on('window-all-closed', () => app.quit());

ipcMain.on('cc-refresh', () => { pollContext(); pollUsage(); });
ipcMain.on('cc-open-picker', () => openPicker());
ipcMain.on('cc-login', () => { if (worker && !worker.isDestroyed()) { worker.show(); worker.focus(); } });
ipcMain.on('cc-quit', () => app.quit());

ipcMain.on('cc-picker-ready', async () => {
  const r = await buildSessionList();
  sendPicker('cc-list', {
    sessions: r.sessions,
    webState: r.webState,
    pinned: pinned ? { kind: pinned.kind, id: pinned.id } : null
  });
});

ipcMain.on('cc-pin', (_e, p) => {
  pinned = (p && p.kind && p.id)
    ? { kind: String(p.kind), id: String(p.id), name: String(p.name || 'session') }
    : null;
  savePin(pinned);
  if (picker && !picker.isDestroyed()) picker.close();
  pollContext();
});
