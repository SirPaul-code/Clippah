const captures = new Map();
const recordings = new Map();

function mimeType() {
  return ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm']
    .find(type => MediaRecorder.isTypeSupported(type)) || '';
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('clippah', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('clips')) {
        const store = db.createObjectStore('clips', { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveClip(record) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('clips', 'readwrite');
    tx.objectStore('clips').put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function arm(tabId, streamId) {
  if (captures.has(tabId)) return { ok: true, alreadyArmed: true };

  const media = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
    video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } }
  });

  let audioContext = null;
  if (media.getAudioTracks().length) {
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(media);
    source.connect(audioContext.destination);
  }

  const preview = document.createElement('video');
  preview.muted = true;
  preview.playsInline = true;
  preview.srcObject = media;
  await preview.play();

  captures.set(tabId, { media, preview, audioContext });
  media.getTracks().forEach(track => track.addEventListener('ended', () => disarm(tabId).catch(() => {}), { once: true }));
  return { ok: true };
}

async function disarm(tabId) {
  const rec = recordings.get(tabId);
  if (rec) {
    try { rec.recorder.stop(); } catch (_) {}
    cancelAnimationFrame(rec.raf);
    recordings.delete(tabId);
  }

  const cap = captures.get(tabId);
  if (!cap) return { ok: true };
  cap.media.getTracks().forEach(t => t.stop());
  cap.preview.srcObject = null;
  if (cap.audioContext) await cap.audioContext.close().catch(() => {});
  captures.delete(tabId);
  return { ok: true };
}

function crop(meta, settings) {
  const vw = Math.max(1, meta.viewportWidth || 1);
  const vh = Math.max(1, meta.viewportHeight || 1);
  const cw = settings.width || vw;
  const ch = settings.height || vh;
  const scaleX = cw / vw;
  const scaleY = ch / vh;

  let sx = Math.max(0, (meta.rect?.left || 0) * scaleX);
  let sy = Math.max(0, (meta.rect?.top || 0) * scaleY);
  let sw = Math.max(2, (meta.rect?.width || vw) * scaleX);
  let sh = Math.max(2, (meta.rect?.height || vh) * scaleY);
  sw = Math.min(sw, cw - sx);
  sh = Math.min(sh, ch - sy);

  const outScale = Math.min(1, 1920 / sw, 1080 / sh);
  return {
    sx, sy, sw, sh,
    outW: Math.max(2, Math.round(sw * outScale)),
    outH: Math.max(2, Math.round(sh * outScale))
  };
}

async function start(tabId, meta) {
  if (recordings.has(tabId)) return { ok: false, error: 'A clip is already recording.' };
  const cap = captures.get(tabId);
  if (!cap) return { ok: false, error: 'Capture is not armed.' };

  const area = crop(meta, cap.media.getVideoTracks()[0]?.getSettings?.() || {});
  const canvas = document.createElement('canvas');
  canvas.width = area.outW;
  canvas.height = area.outH;
  const ctx = canvas.getContext('2d', { alpha: false });

  let raf = 0;
  const draw = () => {
    try {
      ctx.drawImage(cap.preview, area.sx, area.sy, area.sw, area.sh, 0, 0, canvas.width, canvas.height);
    } catch (_) {}
    raf = requestAnimationFrame(draw);
    const active = recordings.get(tabId);
    if (active) active.raf = raf;
  };
  draw();

  const canvasStream = canvas.captureStream(30);
  const output = new MediaStream([...canvasStream.getVideoTracks(), ...cap.media.getAudioTracks()]);
  const type = mimeType();
  const recorder = new MediaRecorder(output, type ? { mimeType: type, videoBitsPerSecond: 8_000_000 } : undefined);
  const chunks = [];
  recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };

  const id = crypto.randomUUID();
  recordings.set(tabId, {
    id, recorder, chunks, canvasStream, output, raf,
    meta: { ...meta, crop: area, captureStartedAt: Date.now() }
  });
  recorder.start(1000);
  return { ok: true, id };
}

async function stop(tabId, stopMeta = {}) {
  const rec = recordings.get(tabId);
  if (!rec) return { ok: false, error: 'No active clip recording.' };

  const result = await new Promise(resolve => {
    rec.recorder.addEventListener('stop', async () => {
      cancelAnimationFrame(rec.raf);
      rec.canvasStream.getTracks().forEach(t => t.stop());

      const blob = new Blob(rec.chunks, { type: rec.recorder.mimeType || 'video/webm' });
      const createdAt = Date.now();
      const record = {
        id: rec.id, createdAt, blob, mimeType: blob.type, size: blob.size,
        meta: { ...rec.meta, ...stopMeta, captureStoppedAt: createdAt }
      };

      try {
        await saveClip(record);
        resolve({ ok: true, clipId: record.id, size: record.size });
      } catch (error) {
        resolve({ ok: false, error: error?.message || String(error) });
      }
    }, { once: true });
    rec.recorder.stop();
  });

  recordings.delete(tabId);
  return result;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') return;
  (async () => {
    try {
      if (message.type === 'ARM') return sendResponse(await arm(message.tabId, message.streamId));
      if (message.type === 'DISARM') return sendResponse(await disarm(message.tabId));
      if (message.type === 'SEGMENT_START') return sendResponse(await start(message.tabId, message.meta || {}));
      if (message.type === 'SEGMENT_STOP') return sendResponse(await stop(message.tabId, message.meta || {}));
      sendResponse({ ok: false, error: 'Unknown offscreen message' });
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || String(error) });
    }
  })();
  return true;
});
