(() => {
  if (window.__CLIPPAH_LOADED__) return;
  window.__CLIPPAH_LOADED__ = true;

  const TAB_CAPTURE_HOSTS = /(^|\.)(youtube\.com|youtu\.be|twitch\.tv)$/i;
  const state = {
    video: null,
    root: null,
    shadow: null,
    els: {},
    url: location.href,
    segments: [],
    compatibilityReady: false,
    recording: false,
    captureMode: null,
    inTime: null,
    recordingStartedAt: 0,
    direct: null,
    toastTimer: 0,
    noticeTimer: 0,
    lastSaved: null,
    captions: [],
    captionTimer: null,
    captionOpen: null,
    lastCaptionText: ''
  };

  const pad = n => String(n).padStart(2, '0');
  const fmt = seconds => {
    if (!Number.isFinite(seconds)) return '--:--';
    const total = Math.max(0, seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = Math.floor(total % 60);
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  };
  const fmtPrecise = seconds => {
    if (!Number.isFinite(seconds)) return '--:--.---';
    const ms = Math.max(0, Math.round(seconds * 1000));
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const rem = ms % 1000;
    return h ? `${h}:${pad(m)}:${pad(s)}.${String(rem).padStart(3, '0')}` : `${m}:${pad(s)}.${String(rem).padStart(3, '0')}`;
  };

  function visibleArea(video) {
    const r = video.getBoundingClientRect();
    return Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) *
      Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
  }

  function chooseVideo() {
    return [...document.querySelectorAll('video')]
      .filter(video => {
        const r = video.getBoundingClientRect();
        return r.width >= 240 && r.height >= 120 && visibleArea(video) > 25000;
      })
      .sort((a, b) => visibleArea(b) - visibleArea(a))[0] || null;
  }

  const markerStorageKey = () => `markers:${location.origin}${location.pathname}${location.search}`;

  async function loadMarkers() {
    try {
      const key = markerStorageKey();
      const stored = await chrome.storage.local.get(key);
      state.segments = Array.isArray(stored[key]) ? stored[key] : [];
      state.lastSaved = state.segments.at(-1) || null;
    } catch (_) {
      state.segments = [];
      state.lastSaved = null;
    }
    renderHistory();
  }

  async function saveMarkers() {
    try {
      await chrome.storage.local.set({ [markerStorageKey()]: state.segments.slice(-100) });
    } catch (_) {}
  }

  function ensureUi() {
    if (state.root?.isConnected) return;

    const host = document.createElement('div');
    host.id = 'clippah-root';
    Object.assign(host.style, {
      position: 'fixed',
      zIndex: '2147483647',
      pointerEvents: 'none',
      display: 'none',
      width: '430px'
    });
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host{all:initial}
        *{box-sizing:border-box}
        .shell{pointer-events:auto;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f7f7f8;background:rgba(19,20,24,.94);border:1px solid rgba(255,255,255,.11);border-radius:16px;box-shadow:0 18px 48px rgba(0,0,0,.34),0 2px 8px rgba(0,0,0,.25);backdrop-filter:blur(18px) saturate(135%);overflow:hidden;transition:transform .18s ease,opacity .18s ease}
        .top{height:38px;padding:0 10px 0 12px;display:flex;align-items:center;gap:9px;border-bottom:1px solid rgba(255,255,255,.07)}
        .logo{display:flex;align-items:center;gap:8px;font:750 12px/1 system-ui;letter-spacing:.01em}
        .mark{width:20px;height:20px;border-radius:7px;display:grid;place-items:center;background:#795fff;color:white;font-size:11px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.15)}
        .status{margin-left:auto;display:flex;align-items:center;gap:6px;color:#9ca0aa;font:650 10px/1 system-ui}
        .dot{width:7px;height:7px;border-radius:50%;background:#5e626d}.status.ready .dot{background:#45d483;box-shadow:0 0 0 3px rgba(69,212,131,.10)}.status.recording{color:#ff9aa4}.status.recording .dot{background:#ff5265;animation:pulse 1.3s infinite}.status.setup .dot{background:#f4b84f}
        @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(255,82,101,.35)}50%{box-shadow:0 0 0 5px rgba(255,82,101,0)}}
        .body{padding:10px 11px 9px;display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:8px}
        .clock{min-width:0}.time{font:720 12px/1.1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#f4f4f6;white-space:nowrap}.subtime{margin-top:4px;font:550 9px/1 system-ui;color:#777c87;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        button{appearance:none;border:0;color:#f5f5f7;background:#292b31;border-radius:10px;height:34px;padding:0 12px;font:720 11px/1 system-ui;cursor:pointer;transition:background .12s ease,transform .08s ease,opacity .12s ease;white-space:nowrap}button:hover{background:#34363e}button:active{transform:translateY(1px)}button:disabled{cursor:default;opacity:.55}
        .primary{background:#785fff;color:#fff;min-width:106px}.primary:hover{background:#866fff}.primary.stop{background:#e84c5f}.primary.stop:hover{background:#f15a6d}
        .studio{background:transparent;border:1px solid rgba(255,255,255,.11);padding:0 10px}.count{display:inline-grid;place-items:center;min-width:17px;height:17px;margin-left:5px;padding:0 4px;border-radius:999px;background:rgba(255,255,255,.09);font-size:9px;color:#c8cad0}
        .footer{min-height:30px;padding:7px 11px 8px;display:flex;align-items:center;gap:10px;border-top:1px solid rgba(255,255,255,.065);color:#858a95;font:550 9px/1.25 system-ui}.spacer{flex:1}kbd{font:700 9px/1 ui-monospace,monospace;color:#d5d6da;background:#24262c;border:1px solid rgba(255,255,255,.12);border-bottom-color:rgba(255,255,255,.19);border-radius:5px;padding:2px 5px}.saved{color:#a8abb3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:155px}
        .notice{margin:0 10px 10px;padding:9px 10px;border-radius:10px;background:#211f18;border:1px solid rgba(244,184,79,.22);color:#c9b98f;font:570 10px/1.35 system-ui}.notice strong{color:#f2d995}.notice[hidden]{display:none}
        .toast{position:absolute;right:0;bottom:calc(100% + 8px);max-width:360px;padding:9px 11px;border-radius:10px;background:#17181c;border:1px solid rgba(255,255,255,.12);box-shadow:0 12px 30px rgba(0,0,0,.3);color:#d9dae0;font:600 10px/1.35 system-ui;opacity:0;transform:translateY(5px);pointer-events:none;transition:.16s ease}.toast.show{opacity:1;transform:none}.toast.error{color:#ffb2ba;border-color:rgba(255,83,101,.28)}
        .recording-strip{height:2px;background:linear-gradient(90deg,#ff5063,#ff7f8d);transform-origin:left;display:none}.recording .recording-strip{display:block}
        @media(max-width:560px){.shell{border-radius:14px}.body{grid-template-columns:1fr auto}.studio{display:none}.footer .saved{display:none}}
      </style>
      <div class="toast" id="toast"></div>
      <div class="shell" id="shell">
        <div class="recording-strip"></div>
        <div class="top">
          <div class="logo"><span class="mark">C</span><span>Clippah</span></div>
          <div class="status setup" id="status"><span class="dot"></span><span id="statusText">Checking video…</span></div>
        </div>
        <div class="body">
          <div class="clock"><div class="time" id="time">--:-- / --:--</div><div class="subtime" id="subtime">Waiting for a playable video</div></div>
          <button id="primary" class="primary">Start clip</button>
          <button id="studio" class="studio">Studio <span id="count" class="count">0</span></button>
        </div>
        <div class="footer">
          <span><kbd>[</kbd> start</span><span><kbd>]</kbd> finish</span><span class="spacer"></span><span id="saved" class="saved">No clips yet</span>
        </div>
        <div class="notice" id="notice" hidden></div>
      </div>`;

    state.root = host;
    state.shadow = shadow;
    ['shell','status','statusText','time','subtime','primary','studio','count','saved','notice','toast'].forEach(id => state.els[id] = shadow.getElementById(id));
    state.els.primary.addEventListener('click', () => state.recording ? finishClip() : startClip());
    state.els.studio.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'OPEN_STUDIO' }));
  }

  function toast(message, error = false, timeout = 3200) {
    ensureUi();
    clearTimeout(state.toastTimer);
    const el = state.els.toast;
    el.textContent = message;
    el.classList.toggle('error', error);
    el.classList.add('show');
    state.toastTimer = setTimeout(() => el.classList.remove('show'), timeout);
  }

  function showCaptureSetup() {
    const el = state.els.notice;
    el.hidden = false;
    el.innerHTML = `
      <strong>1 click needed for YouTube — only once per tab.</strong><br>
      <span style="display:block;margin-top:6px">① In the Chrome toolbar, click the purple <b>Clippah C</b> extension icon once.</span>
      <span style="display:block;margin-top:4px">② The icon will show <b>ON</b>. Then use <b>Start clip / Finish clip</b> here for every clip — no more toolbar clicks.</span>
      <span style="display:block;margin-top:6px;color:#a99b77">Keyboard alternative: <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>K</kbd>.</span>
    `;
    chrome.runtime.sendMessage({ type: 'CAPTURE_NEEDED' }).catch(() => {});
    clearTimeout(state.noticeTimer);
    state.noticeTimer = setTimeout(() => {
      if (state.compatibilityReady) el.hidden = true;
    }, 12000);
  }

  function hideNotice() {
    if (state.els.notice) state.els.notice.hidden = true;
  }

  function hostPrefersTabCapture() {
    return TAB_CAPTURE_HOSTS.test(location.hostname);
  }

  function directCaptureLikelyAvailable() {
    return !!state.video && typeof state.video.captureStream === 'function' && !hostPrefersTabCapture();
  }

  function readyForClip() {
    return directCaptureLikelyAvailable() || state.compatibilityReady;
  }

  function updateUi() {
    if (!state.els.status || !state.video) return;

    const v = state.video;
    const current = fmt(v.currentTime);
    const duration = fmt(v.duration);
    state.els.time.textContent = `${current} / ${duration}`;
    state.els.count.textContent = String(state.segments.length);

    if (state.recording) {
      const elapsed = (performance.now() - state.recordingStartedAt) / 1000;
      state.els.shell.classList.add('recording');
      state.els.status.className = 'status recording';
      state.els.statusText.textContent = `Recording ${fmtPrecise(elapsed)}`;
      state.els.primary.textContent = 'Finish clip';
      state.els.primary.classList.add('stop');
      state.els.subtime.textContent = state.captureMode === 'tab' ? 'Compatibility capture · audio + video' : 'Direct media capture';
      return;
    }

    state.els.shell.classList.remove('recording');
    state.els.primary.classList.remove('stop');
    state.els.primary.textContent = 'Start clip';

    if (readyForClip()) {
      state.els.status.className = 'status ready';
      state.els.statusText.textContent = 'Ready';
      state.els.subtime.textContent = hostPrefersTabCapture() ? 'Player detected · capture enabled' : 'Player detected · direct capture';
      hideNotice();
    } else {
      state.els.status.className = 'status setup';
      state.els.statusText.textContent = 'Enable capture';
      state.els.subtime.textContent = 'Player detected · one-time browser permission';
    }
  }

  function renderHistory() {
    if (!state.els.saved) return;
    state.els.count.textContent = String(state.segments.length);
    if (!state.lastSaved) {
      state.els.saved.textContent = 'No clips yet';
      return;
    }
    state.els.saved.textContent = `Saved ${fmtPrecise(state.lastSaved.start)} → ${fmtPrecise(state.lastSaved.end)}`;
  }

  function captureMeta(extra = {}) {
    const v = state.video;
    const r = v.getBoundingClientRect();
    return {
      pageUrl: location.href,
      title: document.title,
      mediaTime: v.currentTime,
      mediaDuration: v.duration,
      playbackRate: v.playbackRate,
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      ...extra
    };
  }

  function activeCaptionText() {
    try {
      const tracks = [...(state.video?.textTracks || [])];
      for (const track of tracks) {
        if (!track?.activeCues?.length) continue;
        const text = [...track.activeCues].map(cue => String(cue.text || '').replace(/<[^>]+>/g, '').trim()).filter(Boolean).join(' ');
        if (text) return text;
      }
    } catch (_) {}

    try {
      const text = [...document.querySelectorAll('.ytp-caption-segment')]
        .map(node => node.textContent?.trim()).filter(Boolean).join(' ').trim();
      if (text) return text;
    } catch (_) {}
    return '';
  }

  function captionLanguage() {
    try {
      const track = [...(state.video?.textTracks || [])].find(item => item?.activeCues?.length || item?.mode === 'showing');
      if (track?.language || track?.label) return [track.language, track.label].filter(Boolean).join(' · ');
    } catch (_) {}
    return document.documentElement.lang || 'source language';
  }

  function startCaptionCapture() {
    clearInterval(state.captionTimer);
    state.captions = [];
    state.captionOpen = null;
    state.lastCaptionText = '';
    state.captionTimer = setInterval(() => {
      if (!state.recording || state.inTime == null || !state.video) return;
      const text = activeCaptionText();
      const rel = Math.max(0, state.video.currentTime - state.inTime);
      if (text === state.lastCaptionText) {
        if (text && state.captionOpen) state.captionOpen.end = Math.max(state.captionOpen.end, rel + .22);
        return;
      }
      if (state.captionOpen) state.captionOpen.end = Math.max(state.captionOpen.start + .18, rel);
      state.lastCaptionText = text;
      state.captionOpen = null;
      if (text) {
        const cue = { start: rel, end: rel + 1.2, text };
        state.captions.push(cue);
        state.captionOpen = cue;
      }
    }, 140);
  }

  function stopCaptionCapture(endTime) {
    clearInterval(state.captionTimer);
    state.captionTimer = null;
    const rel = state.inTime == null ? 0 : Math.max(0, endTime - state.inTime);
    if (state.captionOpen) state.captionOpen.end = Math.max(state.captionOpen.start + .18, rel);
    const result = state.captions
      .filter(cue => cue.text && cue.end > cue.start)
      .map(cue => ({ start: Number(cue.start.toFixed(3)), end: Number(cue.end.toFixed(3)), text: cue.text }));
    state.captionOpen = null;
    state.lastCaptionText = '';
    return { captions: result, captionSource: result.length ? `Source captions · ${captionLanguage()}` : 'No source captions captured' };
  }

  function bestMimeType() {
    return ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      .find(type => MediaRecorder.isTypeSupported(type)) || '';
  }

  async function startDirectCapture(startTime) {
    let stream;
    try {
      stream = state.video.captureStream();
    } catch (error) {
      return { ok: false, error: error?.message || 'Direct capture unavailable.' };
    }

    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    if (!videoTracks.length || !audioTracks.length) {
      stream.getTracks().forEach(track => track.stop());
      return { ok: false, error: 'Direct capture does not expose both video and audio on this site.' };
    }

    const sessionId = crypto.randomUUID();
    const startMeta = captureMeta({
      captureMode: 'element',
      segmentStart: startTime,
      captureStartedAt: Date.now()
    });

    const init = await chrome.runtime.sendMessage({ type: 'DIRECT_START', sessionId, meta: startMeta })
      .catch(error => ({ ok: false, error: error?.message || String(error) }));
    if (!init?.ok) {
      stream.getTracks().forEach(track => track.stop());
      return init || { ok: false, error: 'Could not initialize local clip storage.' };
    }

    const mimeType = bestMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : undefined);
    const pending = [];
    let chunkIndex = 0;

    recorder.addEventListener('dataavailable', event => {
      if (!event.data?.size) return;
      const index = chunkIndex++;
      const request = chrome.runtime.sendMessage({
        type: 'DIRECT_CHUNK',
        sessionId,
        index,
        blob: event.data
      }).catch(error => ({ ok: false, error: error?.message || String(error) }));
      pending.push(request);
    });

    recorder.start(750);
    state.direct = { sessionId, recorder, stream, pending, mimeType: recorder.mimeType || mimeType };
    return { ok: true, mode: 'element' };
  }

  async function finishDirectCapture(endTime, captionData = {}) {
    const direct = state.direct;
    if (!direct) return { ok: false, error: 'Direct capture session is missing.' };

    const stopped = new Promise(resolve => direct.recorder.addEventListener('stop', resolve, { once: true }));
    if (direct.recorder.state !== 'inactive') direct.recorder.stop();
    await stopped;
    await Promise.all(direct.pending);

    direct.stream.getTracks().forEach(track => track.stop());
    const result = await chrome.runtime.sendMessage({
      type: 'DIRECT_STOP',
      sessionId: direct.sessionId,
      mimeType: direct.mimeType,
      meta: captureMeta({
        captureMode: 'element',
        segmentStart: state.inTime,
        segmentEnd: endTime,
        captureStoppedAt: Date.now(),
        recordedDuration: (performance.now() - state.recordingStartedAt) / 1000,
        ...captionData
      })
    }).catch(error => ({ ok: false, error: error?.message || String(error) }));

    state.direct = null;
    return result;
  }

  async function startClip() {
    const v = state.video;
    if (!v || state.recording) return;
    if (v.readyState < 2) return toast('Wait until the video is playable, then try again.', true);

    state.inTime = v.currentTime;
    let result = null;

    if (directCaptureLikelyAvailable()) {
      result = await startDirectCapture(state.inTime);
    }

    if (!result?.ok) {
      if (!state.compatibilityReady) {
        state.inTime = null;
        showCaptureSetup();
        toast('Click the purple Clippah toolbar icon once. When it says ON, Start clip works normally for this whole tab.', false, 6500);
        return;
      }

      result = await chrome.runtime.sendMessage({
        type: 'SEGMENT_START',
        meta: captureMeta({
          captureMode: 'tab',
          segmentStart: state.inTime,
          captureStartedAt: Date.now()
        })
      }).catch(error => ({ ok: false, error: error?.message || String(error) }));
    }

    if (!result?.ok) {
      state.inTime = null;
      toast(result?.error || 'Could not start capture.', true, 5000);
      return;
    }

    state.captureMode = result.mode || (state.direct ? 'element' : 'tab');
    state.recording = true;
    state.recordingStartedAt = performance.now();
    startCaptionCapture();
    updateUi();
  }

  async function finishClip() {
    const v = state.video;
    if (!v || !state.recording || state.inTime == null) return;

    const endTime = v.currentTime;
    if (endTime < state.inTime) {
      toast('The playhead moved before the clip start. Finish after the IN point or cancel the clip.', true, 5000);
      return;
    }

    const captionData = stopCaptionCapture(endTime);
    let result;
    if (state.captureMode === 'element') {
      result = await finishDirectCapture(endTime, captionData);
    } else {
      result = await chrome.runtime.sendMessage({
        type: 'SEGMENT_STOP',
        meta: captureMeta({
          captureMode: 'tab',
          segmentStart: state.inTime,
          segmentEnd: endTime,
          captureStoppedAt: Date.now(),
          recordedDuration: (performance.now() - state.recordingStartedAt) / 1000,
          ...captionData
        })
      }).catch(error => ({ ok: false, error: error?.message || String(error) }));
    }

    const segment = {
      id: crypto.randomUUID(),
      clipId: result?.clipId || null,
      start: state.inTime,
      end: endTime,
      duration: Math.max(0, endTime - state.inTime),
      recordedDuration: (performance.now() - state.recordingStartedAt) / 1000,
      url: location.href,
      title: document.title,
      createdAt: Date.now(),
      captured: !!result?.ok,
      captureMode: state.captureMode
    };

    state.recording = false;
    state.captureMode = null;
    state.inTime = null;
    state.recordingStartedAt = 0;
    state.segments.push(segment);
    state.lastSaved = segment;
    await saveMarkers();
    renderHistory();
    updateUi();

    if (result?.ok) toast(`Clip saved · ${segment.recordedDuration.toFixed(1)}s · Open Studio to reframe.`);
    else toast(result?.error || 'The marker was saved, but the video capture failed.', true, 5000);
  }

  async function cancelClip() {
    if (!state.recording) return;
    clearInterval(state.captionTimer); state.captionTimer = null; state.captions = []; state.captionOpen = null; state.lastCaptionText = '';
    if (state.captureMode === 'element' && state.direct) {
      try {
        if (state.direct.recorder.state !== 'inactive') state.direct.recorder.stop();
        state.direct.stream.getTracks().forEach(track => track.stop());
        await chrome.runtime.sendMessage({ type: 'DIRECT_CANCEL', sessionId: state.direct.sessionId });
      } catch (_) {}
      state.direct = null;
    } else if (state.captureMode === 'tab') {
      try { await chrome.runtime.sendMessage({ type: 'SEGMENT_CANCEL' }); } catch (_) {}
    }
    state.recording = false;
    state.captureMode = null;
    state.inTime = null;
    state.recordingStartedAt = 0;
    updateUi();
    toast('Clip cancelled.');
  }

  function safeDockPosition(rect, width, height) {
    const gap = 10;
    const margin = 10;
    const candidates = [
      { left: Math.min(innerWidth - width - margin, Math.max(margin, rect.right - width)), top: rect.bottom + gap },
      { left: Math.min(innerWidth - width - margin, Math.max(margin, rect.right - width)), top: rect.top - height - gap },
      { left: rect.right + gap, top: Math.max(margin, Math.min(innerHeight - height - margin, rect.top)) },
      { left: rect.left - width - gap, top: Math.max(margin, Math.min(innerHeight - height - margin, rect.top)) }
    ];

    for (const c of candidates) {
      if (c.left >= margin && c.top >= margin && c.left + width <= innerWidth - margin && c.top + height <= innerHeight - margin) {
        return c;
      }
    }

    return {
      left: Math.max(margin, Math.min(innerWidth - width - margin, rect.right - width - margin)),
      top: Math.max(margin, Math.min(innerHeight - height - margin, rect.bottom - height - margin))
    };
  }

  function placeUi() {
    ensureUi();
    const nextVideo = chooseVideo();
    if (nextVideo !== state.video) {
      state.video = nextVideo;
      if (!state.recording) state.inTime = null;
    }

    if (!state.video) {
      state.root.style.display = 'none';
      requestAnimationFrame(placeUi);
      return;
    }

    const r = state.video.getBoundingClientRect();
    const width = Math.min(430, Math.max(330, innerWidth - 20));
    state.root.style.width = `${Math.round(width)}px`;
    const estimatedHeight = state.els.notice?.hidden ? 108 : 158;
    const pos = safeDockPosition(r, width, estimatedHeight);

    Object.assign(state.root.style, {
      display: 'block',
      left: `${Math.round(pos.left)}px`,
      top: `${Math.round(pos.top)}px`
    });

    if (state.url !== location.href) {
      state.url = location.href;
      if (!state.recording) {
        state.inTime = null;
        loadMarkers();
      }
    }

    updateUi();
    requestAnimationFrame(placeUi);
  }

  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

    if (event.key === '[') {
      event.preventDefault();
      if (!state.recording) startClip();
      return;
    }
    if (event.key === ']') {
      event.preventDefault();
      if (state.recording) finishClip();
      return;
    }
    if (event.key === 'Escape' && state.recording) {
      event.preventDefault();
      cancelClip();
    }
  }, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'CLIPPAH_CAPTURE_STATE') {
      state.compatibilityReady = !!message.ready;
      if (state.compatibilityReady) hideNotice();
      updateUi();
      if (!state.compatibilityReady && hostPrefersTabCapture()) {
        chrome.runtime.sendMessage({ type: 'CAPTURE_NEEDED' }).catch(() => {});
        showCaptureSetup();
      }
      toast(state.compatibilityReady ? 'Ready — Clippah is ON for this tab. You can make as many clips as you want.' : 'Capture access ended for this tab.');
      return;
    }

    if (message?.type === 'CLIPPAH_ERROR') {
      toast(message.message || 'Clippah error', true, 5000);
      return;
    }

    if (message?.type === 'AGENT_COMMAND') {
      (async () => {
        try {
          const command = message.command;
          const params = message.params || {};
          if (command === 'status') {
            return sendResponse({
              ok: true,
              url: location.href,
              title: document.title,
              videoDetected: !!state.video,
              currentTime: state.video?.currentTime ?? null,
              duration: state.video?.duration ?? null,
              paused: state.video?.paused ?? null,
              recording: state.recording,
              captureMode: state.captureMode,
              compatibilityReady: state.compatibilityReady,
              markers: state.segments
            });
          }
          if (!state.video) return sendResponse({ ok: false, error: 'No video detected in the active tab.' });
          if (command === 'play') { await state.video.play(); return sendResponse({ ok: true }); }
          if (command === 'pause') { state.video.pause(); return sendResponse({ ok: true }); }
          if (command === 'seek') {
            const seconds = Number(params.seconds);
            if (!Number.isFinite(seconds)) return sendResponse({ ok: false, error: 'seconds must be a number' });
            state.video.currentTime = Math.max(0, Math.min(Number.isFinite(state.video.duration) ? state.video.duration : seconds, seconds));
            return sendResponse({ ok: true, currentTime: state.video.currentTime });
          }
          if (command === 'start_clip') { await startClip(); return sendResponse({ ok: state.recording, recording: state.recording }); }
          if (command === 'finish_clip') { await finishClip(); return sendResponse({ ok: !state.recording, recording: state.recording }); }
          if (command === 'cancel_clip') { await cancelClip(); return sendResponse({ ok: true }); }
          if (command === 'get_markers') return sendResponse({ ok: true, markers: state.segments });
          return sendResponse({ ok: false, error: `Unknown agent command: ${command}` });
        } catch (error) {
          sendResponse({ ok: false, error: error?.message || String(error) });
        }
      })();
      return true;
    }
  });

  (async () => {
    ensureUi();
    await loadMarkers();
    const captureState = await chrome.runtime.sendMessage({ type: 'GET_CAPTURE_STATE' })
      .catch(() => ({ ready: false }));
    state.compatibilityReady = !!captureState?.ready;
    if (!state.compatibilityReady && hostPrefersTabCapture()) {
      chrome.runtime.sendMessage({ type: 'CAPTURE_NEEDED' }).catch(() => {});
      showCaptureSetup();
    }
    requestAnimationFrame(placeUi);
  })();
})();
