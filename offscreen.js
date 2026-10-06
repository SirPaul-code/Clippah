const DB_NAME = 'clippah';
const DB_VERSION = 3;
const captures = new Map();
const recordings = new Map();

function bestMimeType() {
  return ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find(type => MediaRecorder.isTypeSupported(type)) || '';
}

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

async function saveClip(record) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('clips', 'readwrite');
      tx.objectStore('clips').put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function arm(tabId, streamId) {
  if (captures.has(tabId)) return { ok: true, alreadyReady: true };

  const media = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    },
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    }
  });

  const videoTrack = media.getVideoTracks()[0];
  if (videoTrack) {
    try {
      const supported = navigator.mediaDevices.getSupportedConstraints?.() || {};
      if (supported.cursor) await videoTrack.applyConstraints({ cursor: 'never' });
    } catch (_) {}
  }

  let audioContext = null;
  if (media.getAudioTracks().length) {
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(media);
    source.connect(audioContext.destination);
  }

  captures.set(tabId, {
    media,
    audioContext,
    settings: videoTrack?.getSettings?.() || {}
  });

  media.getTracks().forEach(track => {
    track.addEventListener('ended', () => disarm(tabId).catch(() => {}), { once: true });
  });

  return { ok: true, settings: captures.get(tabId).settings };
}

async function disarm(tabId) {
  const active = recordings.get(tabId);
  if (active) await cancel(tabId);

  const capture = captures.get(tabId);
  if (!capture) return { ok: true };

  capture.media.getTracks().forEach(track => track.stop());
  if (capture.audioContext) await capture.audioContext.close().catch(() => {});
  captures.delete(tabId);
  return { ok: true };
}

async function start(tabId, meta) {
  if (recordings.has(tabId)) return { ok: false, error: 'A clip is already recording.' };
  const capture = captures.get(tabId);
  if (!capture) return { ok: false, error: 'Capture is not enabled for this tab.' };

  const mimeType = bestMimeType();
  const recorder = new MediaRecorder(
    capture.media,
    mimeType ? { mimeType, videoBitsPerSecond: 10_000_000 } : undefined
  );
  const chunks = [];
  recorder.addEventListener('dataavailable', event => {
    if (event.data?.size) chunks.push(event.data);
  });

  const id = crypto.randomUUID();
  recordings.set(tabId, {
    id,
    recorder,
    chunks,
    startedAt: performance.now(),
    meta: {
      ...meta,
      captureMode: 'tab',
      captureSettings: capture.settings,
      captureStartedAt: Date.now()
    }
  });

  recorder.start(1000);
  return { ok: true, id, mode: 'tab', captureSettings: capture.settings };
}

async function stop(tabId, stopMeta = {}) {
  const active = recordings.get(tabId);
  if (!active) return { ok: false, error: 'No active clip recording.' };

  const stopped = new Promise(resolve => active.recorder.addEventListener('stop', resolve, { once: true }));
  if (active.recorder.state !== 'inactive') active.recorder.stop();
  await stopped;

  recordings.delete(tabId);

  const blob = new Blob(active.chunks, { type: active.recorder.mimeType || 'video/webm' });
  if (!blob.size) return { ok: false, error: 'The captured clip is empty.' };

  const createdAt = Date.now();
  const recordedDuration = (performance.now() - active.startedAt) / 1000;
  const record = {
    id: active.id,
    createdAt,
    blob,
    mimeType: blob.type,
    size: blob.size,
    meta: {
      ...active.meta,
      ...stopMeta,
      captureMode: 'tab',
      recordedDuration,
      captureStoppedAt: createdAt
    }
  };

  await saveClip(record);
  try { await chrome.runtime.sendMessage({ type: 'CLIP_LIBRARY_CHANGED', clipId: record.id }); } catch (_) {}
  return { ok: true, clipId: record.id, size: record.size, recordedDuration };
}

async function cancel(tabId) {
  const active = recordings.get(tabId);
  if (!active) return { ok: true };
  const stopped = new Promise(resolve => active.recorder.addEventListener('stop', resolve, { once: true }));
  if (active.recorder.state !== 'inactive') active.recorder.stop();
  await stopped;
  recordings.delete(tabId);
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') return;

  (async () => {
    try {
      if (message.type === 'ARM') return sendResponse(await arm(message.tabId, message.streamId));
      if (message.type === 'DISARM') return sendResponse(await disarm(message.tabId));
      if (message.type === 'SEGMENT_START') return sendResponse(await start(message.tabId, message.meta || {}));
      if (message.type === 'SEGMENT_STOP') return sendResponse(await stop(message.tabId, message.meta || {}));
      if (message.type === 'SEGMENT_CANCEL') return sendResponse(await cancel(message.tabId));
      sendResponse({ ok: false, error: 'Unknown offscreen message.' });
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || String(error) });
    }
  })();

  return true;
});
