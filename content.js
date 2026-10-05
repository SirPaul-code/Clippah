(() => {
  if (window.__CLIPPAH_LOADED__) return;
  window.__CLIPPAH_LOADED__ = true;

  const state = {
    video: null, inTime: null, segments: [], armed: false, recording: false,
    root: null, shadow: null, els: {}, url: location.href, timer: 0
  };

  const pad = n => String(n).padStart(2, '0');
  const fmt = seconds => {
    if (!Number.isFinite(seconds)) return '--:--.--';
    const ms = Math.max(0, Math.round(seconds * 1000));
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const cs = Math.floor((ms % 1000) / 10);
    return h ? `${h}:${pad(m)}:${pad(s)}.${pad(cs)}` : `${m}:${pad(s)}.${pad(cs)}`;
  };

  function visibleArea(v) {
    const r = v.getBoundingClientRect();
    return Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) *
      Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
  }

  function chooseVideo() {
    return [...document.querySelectorAll('video')]
      .filter(v => v.getBoundingClientRect().width >= 240 && v.getBoundingClientRect().height >= 120)
      .sort((a, b) => visibleArea(b) - visibleArea(a))[0] || null;
  }

  const storageKey = () => `markers:${location.origin}${location.pathname}${location.search}`;

  async function load() {
    try {
      const key = storageKey();
      const result = await chrome.storage.local.get(key);
      state.segments = Array.isArray(result[key]) ? result[key] : [];
    } catch (_) { state.segments = []; }
    renderSegments();
  }

  async function save() {
    try { await chrome.storage.local.set({ [storageKey()]: state.segments.slice(-100) }); } catch (_) {}
  }

  function ui() {
    if (state.root?.isConnected) return;
    const host = document.createElement('div');
    host.id = 'clippah-root';
    Object.assign(host.style, {
      position: 'fixed', zIndex: '2147483647', pointerEvents: 'none', display: 'none'
    });
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        *{box-sizing:border-box}.bar{pointer-events:auto;font-family:Inter,system-ui,sans-serif;color:#f7f7f7;background:rgba(14,14,18,.92);border:1px solid rgba(255,255,255,.18);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.38);backdrop-filter:blur(12px);min-width:360px;overflow:hidden}
        .row{display:flex;align-items:center;gap:7px;padding:8px}.brand{font-size:12px;font-weight:900;letter-spacing:.08em}.time{font:700 12px ui-monospace,monospace;color:#c3beff;min-width:90px}
        button{border:1px solid rgba(255,255,255,.15);background:#24242b;color:#fff;border-radius:8px;padding:7px 9px;font:700 11px system-ui;cursor:pointer}button:hover{background:#31313b}.primary{background:#6d5dfc!important}.danger{background:#3a2024!important;color:#ffb7be}
        .status{margin-left:auto;display:flex;align-items:center;gap:5px;font-size:10px;color:#aaa}.dot{width:7px;height:7px;border-radius:50%;background:#666}.armed .dot{background:#35dd77}.recording .dot{background:#ff4d63}
        .segments{border-top:1px solid rgba(255,255,255,.09);max-height:100px;overflow:auto;padding:5px 8px 8px}.segment{display:flex;gap:8px;align-items:center;font:600 10px ui-monospace,monospace;color:#cacaca;padding:3px 0}.dur{color:#8b82ff}.segment button{margin-left:auto;padding:3px 6px;font-size:9px}.empty{color:#777;font-size:10px}.msg{display:none;border-top:1px solid rgba(255,255,255,.08);padding:7px 8px;font:600 10px system-ui;color:#ffc97d}
      </style>
      <div class="bar">
        <div class="row">
          <span class="brand">CLIPPAH</span><span id="time" class="time">--:--.--</span>
          <button id="in" class="primary">[ IN</button><button id="out">OUT ]</button>
          <button id="studio">STUDIO</button><button id="clear" class="danger">CLEAR</button>
          <span id="status" class="status"><i class="dot"></i><span>MARK ONLY</span></span>
        </div>
        <div id="segments" class="segments"></div><div id="msg" class="msg"></div>
      </div>`;

    state.root = host;
    state.shadow = shadow;
    ['time','in','out','studio','clear','status','segments','msg'].forEach(id => state.els[id] = shadow.getElementById(id));
    state.els.in.onclick = markIn;
    state.els.out.onclick = markOut;
    state.els.studio.onclick = () => chrome.runtime.sendMessage({ type: 'OPEN_STUDIO' });
    state.els.clear.onclick = async () => {
      state.inTime = null; state.segments = []; await save(); renderSegments(); flash('Markers cleared.');
    };
  }

  function flash(message, error = false) {
    if (!state.els.msg) return;
    clearTimeout(state.timer);
    state.els.msg.textContent = message;
    state.els.msg.style.display = 'block';
    state.els.msg.style.color = error ? '#ff929f' : '#ffc97d';
    state.timer = setTimeout(() => state.els.msg && (state.els.msg.style.display = 'none'), 3800);
  }

  function meta() {
    const v = state.video;
    const r = v.getBoundingClientRect();
    return {
      pageUrl: location.href, title: document.title, mediaTime: v.currentTime,
      duration: v.duration, playbackRate: v.playbackRate,
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
      viewportWidth: innerWidth, viewportHeight: innerHeight,
      videoWidth: v.videoWidth, videoHeight: v.videoHeight
    };
  }

  async function markIn() {
    const v = state.video;
    if (!v) return;
    state.inTime = v.currentTime;

    if (!state.armed) {
      flash(`IN ${fmt(state.inTime)} marked. Click the Clippah toolbar icon to arm capture.`);
      return;
    }

    const result = await chrome.runtime.sendMessage({
      type: 'SEGMENT_START', meta: { ...meta(), segmentStart: state.inTime }
    }).catch(e => ({ ok: false, error: e?.message || String(e) }));

    if (result?.ok) {
      state.recording = true; status(); flash(`IN ${fmt(state.inTime)} — capture started.`);
    } else flash(result?.error || 'Could not start capture.', true);
  }

  async function markOut() {
    const v = state.video;
    if (!v || state.inTime == null) return flash('Set IN first.', true);
    const end = v.currentTime;
    if (end <= state.inTime) return flash('OUT must be after IN.', true);

    const segment = {
      id: crypto.randomUUID(), start: state.inTime, end, duration: end - state.inTime,
      url: location.href, title: document.title, createdAt: Date.now(), captured: false
    };
    state.segments.push(segment);
    await save();

    if (state.recording) {
      const result = await chrome.runtime.sendMessage({
        type: 'SEGMENT_STOP', meta: { ...meta(), segmentStart: segment.start, segmentEnd: segment.end }
      }).catch(e => ({ ok: false, error: e?.message || String(e) }));

      state.recording = false; status();
      if (result?.ok) {
        segment.clipId = result.clipId; segment.captured = true; await save();
        flash(`Saved ${fmt(segment.start)} → ${fmt(segment.end)} to Studio.`);
      } else flash(result?.error || 'Marker saved, capture failed.', true);
    } else {
      flash(`Marked ${fmt(segment.start)} → ${fmt(segment.end)}.`);
    }

    state.inTime = null;
    renderSegments();
  }

  function renderSegments() {
    if (!state.els.segments) return;
    state.els.segments.innerHTML = '';
    if (!state.segments.length) {
      state.els.segments.innerHTML = '<div class="empty">No clips marked yet.</div>'; return;
    }

    state.segments.slice(-8).reverse().forEach(segment => {
      const row = document.createElement('div');
      row.className = 'segment';
      const label = document.createElement('span');
      label.textContent = `${fmt(segment.start)} → ${fmt(segment.end)}`;
      const dur = document.createElement('span');
      dur.className = 'dur';
      dur.textContent = `${segment.duration.toFixed(1)}s${segment.captured ? ' • saved' : ''}`;
      const go = document.createElement('button');
      go.textContent = 'GO';
      go.onclick = () => { if (state.video) { state.video.currentTime = segment.start; state.video.pause(); } };
      row.append(label, dur, go);
      state.els.segments.appendChild(row);
    });
  }

  function status() {
    if (!state.els.status) return;
    state.els.status.classList.toggle('armed', state.armed && !state.recording);
    state.els.status.classList.toggle('recording', state.recording);
    state.els.status.querySelector('span').textContent =
      state.recording ? 'RECORDING' : state.armed ? 'ARMED' : 'MARK ONLY';
  }

  function place() {
    ui();
    const v = chooseVideo();
    if (v !== state.video) { state.video = v; state.inTime = null; }

    if (!v || visibleArea(v) < 30000) {
      state.root.style.display = 'none';
      return requestAnimationFrame(place);
    }

    const r = v.getBoundingClientRect();
    const width = Math.min(560, Math.max(360, r.width - 16));
    const left = Math.max(8, Math.min(innerWidth - width - 8, r.right - width - 8));
    const top = Math.max(8, Math.min(innerHeight - 120, r.top + 8));
    Object.assign(state.root.style, {
      display: 'block', left: Math.round(left) + 'px', top: Math.round(top) + 'px', width: Math.round(width) + 'px'
    });
    state.els.time.textContent = `${fmt(v.currentTime)} / ${fmt(v.duration)}`;

    if (state.url !== location.href) {
      state.url = location.href; state.inTime = null; load();
    }
    requestAnimationFrame(place);
  }

  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const t = event.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (event.key === '[') { event.preventDefault(); markIn(); }
    if (event.key === ']') { event.preventDefault(); markOut(); }
  }, true);

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'CLIPPAH_CAPTURE_STATE') {
      state.armed = !!message.armed;
      if (!state.armed) state.recording = false;
      status();
      flash(state.armed ? 'Capture armed. [ = IN, ] = OUT.' : 'Capture disarmed. Markers still work.');
    }
    if (message?.type === 'CLIPPAH_ERROR') flash(message.message || 'Clippah error', true);
  });

  (async () => {
    ui(); await load();
    const result = await chrome.runtime.sendMessage({ type: 'GET_CAPTURE_STATE' }).catch(() => ({ armed: false }));
    state.armed = !!result?.armed; status(); requestAnimationFrame(place);
  })();
})();
