/**
 * sync.js
 * -------
 * Two layers of backup for the garden:
 *
 * 1) Export / import — download the whole dataset as words-YYYY-MM-DD.json
 *    (lands in the Files app on iPhone), restore from such a file.
 *
 * 2) GitHub Gist sync — stores the dataset in a private Gist owned by
 *    the user, via the GitHub API (CORS-enabled). Needs a personal
 *    access token with only the "gist" scope, entered once. After
 *    every data change a push is scheduled (debounced 4s); on app
 *    launch the newer side wins (simple last-write-wins by the
 *    lastUpdated timestamp — fine for a single-person app).
 */

const SYNC_KEY = 'tango_sync_v1';
const GIST_FILENAME = 'tango-words.json';
const GIST_DESC = '言葉の庭 — vocabulary backup';

function getSyncConfig() {
  try { return JSON.parse(localStorage.getItem(SYNC_KEY) || 'null') || {}; }
  catch (e) { return {}; }
}
function saveSyncConfig(cfg) {
  try { localStorage.setItem(SYNC_KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ }
}

// ---------------- file export / import ----------------

function exportBackup() {
  const data = loadData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tango-words-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return data.words.length;
}

async function importBackupFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text); // throws on invalid JSON
  if (!parsed || !Array.isArray(parsed.words)) {
    throw new Error('このファイルは言葉の庭のバックアップではないようです');
  }
  parsed.words.forEach(w => { if (!Array.isArray(w.tags)) w.tags = []; });
  saveData(parsed);
  return parsed.words.length;
}

// ---------------- GitHub Gist sync ----------------

async function gistRequest(method, path, token, body) {
  const res = await fetch('https://api.github.com' + path, {
    method,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + token,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401) throw new Error('トークンが無効です。作り直してください');
  if (res.status === 404) { const e = new Error('notfound'); e.notfound = true; throw e; }
  if (!res.ok) throw new Error('GitHubに接続できませんでした（' + res.status + '）');
  return res.json();
}

async function gistPush(cfg) {
  const data = loadData();
  const files = { [GIST_FILENAME]: { content: JSON.stringify(data) } };
  if (cfg.gistId) {
    await gistRequest('PATCH', '/gists/' + cfg.gistId, cfg.token, { files });
    return 'pushed';
  }
  const created = await gistRequest('POST', '/gists', cfg.token, {
    description: GIST_DESC, public: false, files
  });
  cfg.gistId = created.id;
  saveSyncConfig(cfg);
  return 'created';
}

async function gistPull(cfg) {
  const gist = await gistRequest('GET', '/gists/' + cfg.gistId, cfg.token);
  const file = gist.files && gist.files[GIST_FILENAME];
  if (!file || !file.content) return null;
  try {
    const parsed = JSON.parse(file.content);
    return (parsed && Array.isArray(parsed.words)) ? parsed : null;
  } catch (e) { return null; }
}

/** Look through the user's gists for an existing 言葉の庭 backup. */
async function findExistingGist(cfg) {
  const list = await gistRequest('GET', '/gists?per_page=100', cfg.token);
  const hit = Array.isArray(list) && list.find(g => g.files && g.files[GIST_FILENAME]);
  return hit ? hit.id : null;
}

/**
 * Full sync: newer side wins (by lastUpdated).
 * Returns 'created' | 'pushed' | 'pulled' | 'uptodate'.
 * If this device doesn't know the gist yet, it first searches the
 * account for an existing backup and adopts it — so setting up on a
 * second device (PC → phone) reuses the same gist instead of
 * creating a duplicate.
 */
async function syncNow() {
  const cfg = getSyncConfig();
  if (!cfg.token) throw new Error('トークンが設定されていません');

  if (!cfg.gistId) {
    const existing = await findExistingGist(cfg);
    if (existing) { cfg.gistId = existing; saveSyncConfig(cfg); }
    else return gistPush(cfg);
  }

  let remote;
  try {
    remote = await gistPull(cfg);
  } catch (e) {
    if (e.notfound) { cfg.gistId = null; saveSyncConfig(cfg); return gistPush(cfg); }
    throw e;
  }
  if (!remote) return gistPush(cfg);

  const local = loadData();
  const l = local.lastUpdated || '';
  const r = remote.lastUpdated || '';
  if (r > l) {
    remote.words.forEach(w => { if (!Array.isArray(w.tags)) w.tags = []; });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(remote)); } catch (e) { /* ignore */ }
    return 'pulled';
  }
  if (l > r) { await gistPush(cfg); return 'pushed'; }
  return 'uptodate';
}

// ---------------- auto-push (debounced) ----------------

let __pushTimer = null;

function scheduleAutoPush() {
  const cfg = getSyncConfig();
  if (!cfg.token) return;
  clearTimeout(__pushTimer);
  __pushTimer = setTimeout(async () => {
    try {
      await gistPush(getSyncConfig());
      if (typeof onSyncStatus === 'function') onSyncStatus('自動保存しました', false);
    } catch (e) {
      if (typeof onSyncStatus === 'function') onSyncStatus('自動保存に失敗（後で再試行されます）', true);
    }
  }, 4000);
}
