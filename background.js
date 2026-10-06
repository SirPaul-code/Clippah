const OFFSCREEN_URL = 'offscreen.html';
const DB_NAME = 'clippah';
const DB_VERSION = 3;
let creatingOffscreen = null;
let agentSocket = null;
let agentReconnectTimer = null;
let agentState = { connected: false, error: null };

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('clips')) {
        const clips = db.createObjectStore('clips', { keyPath: 'id' });
        clips.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('chunks')) {
        const chunks = db.createObjectStore('chunks', { keyPath: 'key' });
        chunks.createIndex('sessionId', 'sessionId');
      }
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('folders')) {
        const folders = db.createObjectStore('folders', { keyPath: 'id' });
        folders.createIndex('name', 'name');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withDb(mode, stores, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let result;
      try {
        result = fn(tx);
      } catch (error) {
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
  } finally {
    db.close();
  }
}

async function clearSessionChunks(sessionId) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('chunks', 'readwrite');
      const store = tx.objectStore('chunks');
      const index = store.index('sessionId');
      const request = index.openCursor(IDBKeyRange.only(sessionId));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function directStart(sessionId, meta) {
  await clearSessionChunks(sessionId);
  await withDb('readwrite', ['sessions'], tx => {
    tx.objectStore('sessions').put({ id: sessionId, meta, createdAt: Date.now() });
  });
  return { ok: true };
}

async function directChunk(sessionId, index, blob) {
  if (!(blob instanceof Blob)) return { ok: false, error: 'Direct chunk was not a Blob.' };
  await withDb('readwrite', ['chunks'], tx => {
    tx.objectStore('chunks').put({ key: `${sessionId}:${String(index).padStart(8, '0')}`, sessionId, index, blob });
  });
  return { ok: true };
}

async function getSessionChunks(sessionId) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('chunks', 'readonly');
      const request = tx.objectStore('chunks').index('sessionId').getAll(IDBKeyRange.only(sessionId));
      request.onsuccess = () => resolve((request.result || []).sort((a, b) => a.index - b.index));
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function directStop(sessionId, mimeType, meta) {
  const chunks = await getSessionChunks(sessionId);
  if (!chunks.length) return { ok: false, error: 'No media chunks were recorded.' };

  const blob = new Blob(chunks.map(item => item.blob), { type: mimeType || chunks[0].blob.type || 'video/webm' });
  const clipId = crypto.randomUUID();
  const createdAt = Date.now();
  const record = {
    id: clipId,
    createdAt,
    blob,
    mimeType: blob.type,
    size: blob.size,
    meta: { ...meta, captureMode: 'element', clipId }
  };

  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['clips', 'chunks', 'sessions'], 'readwrite');
      tx.objectStore('clips').put(record);
      tx.objectStore('sessions').delete(sessionId);
      const chunkStore = tx.objectStore('chunks');
      const request = chunkStore.index('sessionId').openCursor(IDBKeyRange.only(sessionId));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }

  await broadcastLibraryChanged(clipId);
  return { ok: true, clipId, size: blob.size };
}

async function directCancel(sessionId) {
  await clearSessionChunks(sessionId);
  await withDb('readwrite', ['sessions'], tx => tx.objectStore('sessions').delete(sessionId));
  return { ok: true };
}

async function listClipMetadata() {
  const db = await openDb();
  try {
    const clips = await new Promise((resolve, reject) => {
      const request = db.transaction('clips', 'readonly').objectStore('clips').getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    return clips
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ blob, ...clip }) => clip);
  } finally {
    db.close();
  }
}

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)]
  });
  if (contexts.length) return;

  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['USER_MEDIA'],
      justification: 'Compatibility capture for sites that do not expose usable media-element audio.'
    });
  }

  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

async function captured(tabId) {
  const tabs = await chrome.tabCapture.getCapturedTabs();
  return tabs.some(item => item.tabId === tabId && (item.status === 'active' || item.status === 'pending'));
}

async function tell(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (_) {
    return null;
  }
}

async function broadcastLibraryChanged(clipId = null) {
  try { await chrome.runtime.sendMessage({ type: 'CLIP_LIBRARY_CHANGED', clipId }); } catch (_) {}
}

async function studioTab() {
  const url = chrome.runtime.getURL('editor.html');
  const tabs = await chrome.tabs.query({});
  return tabs.find(tab => tab.url === url || tab.url?.startsWith(url + '#') || tab.url?.startsWith(url + '?')) || null;
}

async function tellStudio(command, params = {}) {
  let tab = await studioTab();
  if (!tab?.id) {
    tab = await chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
    await new Promise(resolve => setTimeout(resolve, 650));
  }
  try {
    return await chrome.runtime.sendMessage({ type: 'AGENT_STUDIO_COMMAND', command, params });
  } catch (error) {
    return { ok: false, error: error?.message || 'Clippah Studio is not ready yet.' };
  }
}

async function setCaptureBadge(tabId, ready) {
  try {
    await chrome.action.setBadgeText({ tabId, text: ready ? 'ON' : '' });
    if (ready) {
      await chrome.action.setBadgeBackgroundColor({ tabId, color: '#45d483' });
      await chrome.action.setBadgeTextColor({ tabId, color: '#111216' });
    }
  } catch (_) {}
}

chrome.action.onClicked.addListener(async tab => {
  if (!tab.id) return;
  try {
    await ensureOffscreen();

    if (await captured(tab.id)) {
      await chrome.runtime.sendMessage({ target: 'offscreen', type: 'DISARM', tabId: tab.id });
      await setCaptureBadge(tab.id, false);
      await tell(tab.id, { type: 'CLIPPAH_CAPTURE_STATE', ready: false });
      return;
    }

    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    const result = await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'ARM',
      tabId: tab.id,
      streamId
    });

    if (!result?.ok) throw new Error(result?.error || 'Could not enable capture for this tab.');
    await setCaptureBadge(tab.id, true);
    await tell(tab.id, { type: 'CLIPPAH_CAPTURE_STATE', ready: true });
  } catch (error) {
    await setCaptureBadge(tab.id, false);
    await tell(tab.id, { type: 'CLIPPAH_ERROR', message: error?.message || String(error) });
  }
});

chrome.tabCapture.onStatusChanged.addListener(async info => {
  if (info.status === 'stopped' || info.status === 'error') {
    await setCaptureBadge(info.tabId, false);
    await tell(info.tabId, { type: 'CLIPPAH_CAPTURE_STATE', ready: false });
  }
});

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] || null;
}

async function routeAgentCommand(method, params = {}) {
  if (method === 'list_clips') return { ok: true, clips: await listClipMetadata() };
  if (method === 'open_studio') {
    const tab = await chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
    return { ok: true, tabId: tab.id };
  }

  const studioMethods = new Map([
    ['studio_status', 'studio_status'],
    ['studio_get_frame', 'studio_get_frame'],
    ['studio_get_frames', 'studio_get_frames'],
    ['studio_seek', 'studio_seek'],
    ['studio_set_aspect', 'studio_set_aspect'],
    ['studio_set_viewport', 'studio_set_viewport'],
    ['studio_move_viewport', 'studio_move_viewport'],
    ['studio_add_keyframe', 'studio_add_keyframe'],
    ['studio_clear_motion', 'studio_clear_motion'],
    ['studio_append_clip', 'studio_append_clip']
  ]);
  if (studioMethods.has(method)) return tellStudio(studioMethods.get(method), params);

  const tab = await activeTab();
  if (!tab?.id) return { ok: false, error: 'No active browser tab.' };

  const commandMap = {
    status: 'status',
    play: 'play',
    pause: 'pause',
    seek: 'seek',
    start_clip: 'start_clip',
    finish_clip: 'finish_clip',
    cancel_clip: 'cancel_clip',
    get_markers: 'get_markers'
  };
  const command = commandMap[method];
  if (!command) return { ok: false, error: `Unknown bridge method: ${method}` };

  const response = await tell(tab.id, { type: 'AGENT_COMMAND', command, params });
  return response || { ok: false, error: 'Clippah is not active on the current page.' };
}

function disconnectAgentBridge() {
  clearTimeout(agentReconnectTimer);
  agentReconnectTimer = null;
  if (agentSocket) {
    try { agentSocket.close(); } catch (_) {}
  }
  agentSocket = null;
  agentState = { connected: false, error: null };
}

async function connectAgentBridge() {
  clearTimeout(agentReconnectTimer);
  agentReconnectTimer = null;

  const settings = await chrome.storage.local.get({
    agentBridgeEnabled: false,
    agentBridgeUrl: 'ws://127.0.0.1:47281/extension',
    agentBridgeToken: ''
  });

  if (!settings.agentBridgeEnabled || !settings.agentBridgeToken) {
    disconnectAgentBridge();
    return;
  }

  if (agentSocket && (agentSocket.readyState === WebSocket.OPEN || agentSocket.readyState === WebSocket.CONNECTING)) return;

  try {
    const url = new URL(settings.agentBridgeUrl || 'ws://127.0.0.1:47281/extension');
    url.searchParams.set('token', settings.agentBridgeToken);
    const socket = new WebSocket(url.toString());
    agentSocket = socket;
    agentState = { connected: false, error: null };

    socket.addEventListener('open', () => {
      if (agentSocket !== socket) return;
      agentState = { connected: true, error: null };
      socket.send(JSON.stringify({ type: 'hello', client: 'clippah-extension', version: chrome.runtime.getManifest().version }));
    });

    socket.addEventListener('message', event => {
      if (agentSocket !== socket) return;
      let message;
      try { message = JSON.parse(event.data); } catch (_) { return; }

      if (message.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong', at: Date.now() }));
        return;
      }

      if (message.type === 'request' && message.id) {
        (async () => {
          try {
            const result = await routeAgentCommand(message.method, message.params || {});
            socket.send(JSON.stringify({ type: 'response', id: message.id, result }));
          } catch (error) {
            socket.send(JSON.stringify({ type: 'response', id: message.id, error: error?.message || String(error) }));
          }
        })();
      }
    });

    socket.addEventListener('error', () => {
      if (agentSocket !== socket) return;
      agentState = { connected: false, error: 'Could not connect to the local Clippah MCP bridge.' };
    });

    socket.addEventListener('close', () => {
      if (agentSocket !== socket) return;
      agentSocket = null;
      agentState = { connected: false, error: 'Bridge disconnected.' };
      agentReconnectTimer = setTimeout(connectAgentBridge, 5000);
    });
  } catch (error) {
    agentState = { connected: false, error: error?.message || String(error) };
    agentReconnectTimer = setTimeout(connectAgentBridge, 5000);
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.agentBridgeEnabled || changes.agentBridgeUrl || changes.agentBridgeToken) connectAgentBridge();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target === 'offscreen') return;
  const tabId = sender.tab?.id ?? message.tabId;

  if (message.type === 'GET_CAPTURE_STATE') {
    (async () => {
      try { sendResponse({ ok: true, ready: tabId ? await captured(tabId) : false }); }
      catch (error) { sendResponse({ ok: false, ready: false, error: error?.message || String(error) }); }
    })();
    return true;
  }

  if (message.type === 'SEGMENT_START') {
    (async () => {
      try {
        if (!tabId || !(await captured(tabId))) {
          return sendResponse({ ok: false, error: 'Capture is not enabled for this tab yet.' });
        }
        const result = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'SEGMENT_START', tabId, meta: message.meta });
        sendResponse({ ...(result || { ok: true }), mode: 'tab' });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
    })();
    return true;
  }

  if (message.type === 'SEGMENT_STOP' || message.type === 'SEGMENT_CANCEL') {
    (async () => {
      try {
        const result = await chrome.runtime.sendMessage({
          target: 'offscreen',
          type: message.type,
          tabId,
          meta: message.meta
        });
        sendResponse(result || { ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
    })();
    return true;
  }

  if (message.type === 'DIRECT_START') {
    directStart(message.sessionId, message.meta)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message.type === 'DIRECT_CHUNK') {
    directChunk(message.sessionId, message.index, message.blob)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message.type === 'DIRECT_STOP') {
    directStop(message.sessionId, message.mimeType, message.meta)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message.type === 'DIRECT_CANCEL') {
    directCancel(message.sessionId)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message.type === 'OPEN_STUDIO') {
    chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') })
      .then(tab => sendResponse({ ok: true, tabId: tab.id }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message.type === 'GET_AGENT_BRIDGE_STATUS') {
    sendResponse({ ok: true, ...agentState });
    return;
  }

  if (message.type === 'AGENT_RECONNECT') {
    connectAgentBridge()
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
});

connectAgentBridge();
