(() => {
  if (window.__CLIPPAH_V2__) return;
  window.__CLIPPAH_V2__ = true;

  const TAB_ONLY = /(^|\.)(youtube\.com|youtu\.be|twitch\.tv)$/i;
  const state = {
    video: null,
    root: null,
    shadow: null,
    ui: {},
    markers: [],
    ready: false,
    recording: false,
    mode: null,
    startTime: null,
    startedAt: 0,
    direct: null,
    pageKey: '',
    toastTimer: 0
  };

  const fmt = value => {
    if (!Number.isFinite(value)) return '--:--';
    value = Math.max(0, value);
    const h = Math.floor(value / 3600);
    const m = Math.floor((value % 3600) / 60);
    const s = Math.floor(value % 60);
    return h ? h + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0')
      : m + ':' + String(s).padStart(2,'0');
  };

  const precise = value => Number.isFinite(value) ? value.toFixed(3) + 's' : '--';

  function visibleArea(video) {
    const r = video.getBoundingClientRect();
    const w = Math.max(0, Math.min(innerWidth, r.right) - Math.max(0, r.left));
    const h = Math.max(0, Math.min(innerHeight, r.bottom) - Math.max(0, r.top));
    return w * h;
  }

  function findVideo() {
    return [...document.querySelectorAll('video')]
      .filter(v => {
        const r = v.getBoundingClientRect();
        return r.width >= 240 && r.height >= 120 && visibleArea(v) > 25000;
      })
      .sort((a,b) => visibleArea(b) - visibleArea(a))[0] || null;
  }

  function storageKey() {
    return 'markers:' + location.origin + location.pathname + location.search;
  }

  async function loadMarkers() {
    state.pageKey = storageKey();
    try {
      const result = await chrome.storage.local.get(state.pageKey);
      state.markers = Array.isArray(result[state.pageKey]) ? result[state.pageKey] : [];
    } catch (_) {
      state.markers = [];
    }
    updateUi();
  }

  async function saveMarkers() {
    try {
      await chrome.storage.local.set({ [state.pageKey || storageKey()]: state.markers.slice(-100) });
    } catch (_) {}
  }

  function ensureUi() {
    if (state.root?.isConnected) return;
    const host = document.createElement('div');
    host.id = 'clippah-v2';
    Object.assign(host.style, {
      position:'fixed', zIndex:'2147483647', width:'414px',
      pointerEvents:'none', display:'none'
    });
    document.documentElement.appendChild(host);
    const sh = host.attachShadow({mode:'open'});
    state.root = host;
    state.shadow = sh;

    sh.innerHTML =
      '<style>' +
      ':host{all:initial}*{box-sizing:border-box}' +
      '.dock{pointer-events:auto;color:#f7f7f8;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:rgba(17,18,22,.94);border:1px solid rgba(255,255,255,.11);border-radius:15px;box-shadow:0 16px 44px rgba(0,0,0,.38);backdrop-filter:blur(18px) saturate(135%);overflow:hidden}' +
      '.head{height:34px;padding:0 10px;display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(255,255,255,.065)}' +
      '.brand{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:800}.logo{width:18px;height:18px;border-radius:6px;background:#7a63ff;display:grid;place-items:center;font-size:9px}' +
      '.state{margin-left:auto;display:flex;align-items:center;gap:6px;color:#9196a2;font-size:9px;font-weight:700}.dot{width:7px;height:7px;border-radius:50%;background:#666b75}.ready .dot{background:#43d386}.rec{color:#ffadb5}.rec .dot{background:#ff5367;box-shadow:0 0 0 4px rgba(255,83,103,.10)}' +
      '.main{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;padding:9px 10px}.clock{min-width:0}.time{font:700 12px ui-monospace,SFMono-Regular,Menlo,monospace}.hint{margin-top:3px;color:#777d88;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      'button{height:33px;border:1px solid rgba(255,255,255,.10);border-radius:9px;background:#282a31;color:#f6f6f7;padding:0 11px;font-size:10px;font-weight:760;cursor:pointer}button:hover{background:#33363e}.primary{border-color:#8f80ff;background:#7962ff;min-width:102px}.primary:hover{background:#876fff}.primary.stop{background:#e54f61;border-color:#ef6676}.studio{background:transparent}' +
      '.foot{height:28px;padding:0 10px;display:flex;align-items:center;gap:8px;border-top:1px solid rgba(255,255,255,.055);color:#777d88;font-size:9px}.foot .right{margin-left:auto;color:#a2a6ae}.foot kbd{font:700 9px ui-monospace,monospace;background:#24262c;border:1px solid rgba(255,255,255,.11);border-radius:5px;padding:1px 5px;color:#cfd1d6}' +
      '.setup{padding:9px 10px;border-top:1px solid rgba(244,184,79,.13);background:#211f18;color:#c8bb98;font-size:9.5px;line-height:1.45}.setup strong{color:#f1d38e}.setup[hidden]{display:none}' +
      '.toast{position:absolute;bottom:calc(100% + 7px);right:0;max-width:350px;padding:9px 11px;border-radius:10px;background:#15161a;border:1px solid rgba(255,255,255,.12);color:#d8dae0;font:600 10px/1.35 system-ui;box-shadow:0 12px 32px rgba(0,0,0,.35);opacity:0;transform:translateY(4px);transition:.15s;pointer-events:none}.toast.on{opacity:1;transform:none}.toast.err{color:#ffb0b8;border-color:rgba(255,83,103,.30)}' +
      '@media(max-width:520px){.main{grid-template-columns:1fr auto}.studio{display:none}}' +
      '</style>' +
      '<div id="toast" class="toast"></div>' +
      '<div class="dock">' +
        '<div class="head"><div class="brand"><span class="logo">C</span>Clippah</div><div id="state" class="state"><span class="dot"></span><span id="stateText">Video detected</span></div></div>' +
        '<div class="main"><div class="clock"><div id="time" class="time">--:-- / --:--</div><div id="hint" class="hint">Ready to clip</div></div><button id="primary" class="primary">Start clip</button><button id="studio" class="studio">Studio</button></div>' +
        '<div class="foot"><span><kbd>[</kbd> start</span><span><kbd>]</kbd> finish</span><span><kbd>Esc</kbd> cancel</span><span id="count" class="right">0 clips</span></div>' +
        '<div id="setup" class="setup" hidden></div>' +
      '</div>';

    ['toast','state','stateText','time','hint','primary','studio','count','setup'].forEach(id => state.ui[id] = sh.getElementById(id));
    state.ui.primary.addEventListener('click', () => state.recording ? finishClip() : startClip());
    state.ui.studio.addEventListener('click', () => chrome.runtime.sendMessage({type:'OPEN_STUDIO'}));
  }

  function toast(text, error=false, ms=3400) {
    ensureUi();
    clearTimeout(state.toastTimer);
    const el = state.ui.toast;
    el.textContent = text;
    el.classList.toggle('err', error);
    el.classList.add('on');
    state.toastTimer = setTimeout(() => el.classList.remove('on'), ms);
  }

  function showSetup() {
    state.ui.setup.hidden = false;
    state.ui.setup.innerHTML = '<strong>Enable capture once for this tab.</strong> Press <b>Ctrl+Shift+K</b> (Cmd+Shift+K on Mac) or click the Clippah toolbar icon once. You will not do this for every clip.';
  }

  function hideSetup() {
    if (state.ui.setup) state.ui.setup.hidden = true;
  }

  function prefersTabCapture() {
    return TAB_ONLY.test(location.hostname);
  }

  function directPossible() {
    return !!state.video && typeof state.video.captureStream === 'function' && !prefersTabCapture();
  }

  function metadata(extra={}) {
    const v = state.video;
    const r = v.getBoundingClientRect();
    return {
      pageUrl:location.href, title:document.title,
      mediaTime:v.currentTime, mediaDuration:v.duration, playbackRate:v.playbackRate,
      rect:{left:r.left,top:r.top,width:r.width,height:r.height},
      viewportWidth:innerWidth, viewportHeight:innerHeight,
      videoWidth:v.videoWidth, videoHeight:v.videoHeight,
      ...extra
    };
  }

  function updateUi() {
    if (!state.video || !state.ui.time) return;
    state.ui.time.textContent = fmt(state.video.currentTime) + ' / ' + fmt(state.video.duration);
    state.ui.count.textContent = state.markers.length + (state.markers.length === 1 ? ' clip' : ' clips');
    state.ui.state.className = 'state';

    if (state.recording) {
      state.ui.state.classList.add('rec');
      state.ui.stateText.textContent = 'Recording';
      state.ui.primary.textContent = 'Finish clip';
      state.ui.primary.classList.add('stop');
      const elapsed = Math.max(0,(performance.now()-state.startedAt)/1000);
      state.ui.hint.textContent = 'Recording ' + elapsed.toFixed(1) + 's · ' + (state.mode === 'element' ? 'clean media' : 'browser capture');
      return;
    }

    state.ui.primary.textContent = 'Start clip';
    state.ui.primary.classList.remove('stop');
    if (directPossible() || state.ready) {
      state.ui.state.classList.add('ready');
      state.ui.stateText.textContent = 'Ready';
      state.ui.hint.textContent = directPossible() ? 'Local clean capture available' : 'Capture enabled for this tab';
    } else {
      state.ui.stateText.textContent = 'Video detected';
      state.ui.hint.textContent = prefersTabCapture() ? 'Start clip to enable capture' : 'Ready to clip';
    }
  }

  async function startDirect() {
    let stream;
    try { stream = state.video.captureStream(); }
    catch (error) { return {ok:false,error:error?.message||String(error)}; }
    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    if (!videoTracks.length || !audioTracks.length) {
      stream.getTracks().forEach(t => t.stop());
      return {ok:false,error:'This player does not expose both video and audio tracks.'};
    }

    const mime = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(x => MediaRecorder.isTypeSupported(x)) || '';
    const recorder = new MediaRecorder(stream, mime ? {mimeType:mime,videoBitsPerSecond:10000000} : undefined);
    const sessionId = crypto.randomUUID();
    let index = 0;
    let sendChain = Promise.resolve();

    const begin = await chrome.runtime.sendMessage({type:'DIRECT_START',sessionId,meta:metadata({captureMode:'element',segmentStart:state.startTime})}).catch(e=>({ok:false,error:e?.message||String(e)}));
    if (!begin?.ok) {
      stream.getTracks().forEach(t=>t.stop());
      return begin;
    }

    recorder.addEventListener('dataavailable', event => {
      if (!event.data?.size) return;
      const n = index++;
      sendChain = sendChain.then(() => chrome.runtime.sendMessage({type:'DIRECT_CHUNK',sessionId,index:n,blob:event.data}));
    });
    recorder.start(750);
    state.direct = {stream,recorder,sessionId,mimeType:recorder.mimeType,sendChain};
    return {ok:true,mode:'element'};
  }

  async function stopDirect(endTime) {
    const d = state.direct;
    if (!d) return {ok:false,error:'Direct capture session is missing.'};
    const stopped = new Promise(resolve => d.recorder.addEventListener('stop', resolve, {once:true}));
    if (d.recorder.state !== 'inactive') d.recorder.stop();
    await stopped;
    await d.sendChain.catch(()=>{});
    d.stream.getTracks().forEach(t=>t.stop());
    const result = await chrome.runtime.sendMessage({
      type:'DIRECT_STOP', sessionId:d.sessionId, mimeType:d.mimeType,
      meta:metadata({
        captureMode:'element', segmentStart:state.startTime, segmentEnd:endTime,
        captureStoppedAt:Date.now(), recordedDuration:(performance.now()-state.startedAt)/1000
      })
    }).catch(e=>({ok:false,error:e?.message||String(e)}));
    state.direct = null;
    return result;
  }

  async function startClip() {
    if (!state.video || state.recording) return;
    if (state.video.readyState < 2) return toast('Wait until the video is playable.', true);
    state.startTime = state.video.currentTime;
    let result = null;

    if (directPossible()) result = await startDirect();

    if (!result?.ok) {
      if (!state.ready) {
        state.startTime = null;
        showSetup();
        toast('One-time capture access is needed for this tab.', false, 5000);
        return;
      }
      result = await chrome.runtime.sendMessage({
        type:'SEGMENT_START',
        meta:metadata({captureMode:'tab',segmentStart:state.startTime,captureStartedAt:Date.now()})
      }).catch(e=>({ok:false,error:e?.message||String(e)}));
    }

    if (!result?.ok) {
      state.startTime = null;
      return toast(result?.error || 'Could not start the clip.', true, 5000);
    }

    state.mode = result.mode || (state.direct ? 'element' : 'tab');
    state.recording = true;
    state.startedAt = performance.now();
    updateUi();
  }

  async function finishClip() {
    if (!state.video || !state.recording || state.startTime == null) return;
    const end = state.video.currentTime;
    if (end < state.startTime) return toast('Finish after the clip start, or press Esc to cancel.', true, 5000);

    const result = state.mode === 'element'
      ? await stopDirect(end)
      : await chrome.runtime.sendMessage({
          type:'SEGMENT_STOP',
          meta:metadata({
            captureMode:'tab', segmentStart:state.startTime, segmentEnd:end,
            captureStoppedAt:Date.now(), recordedDuration:(performance.now()-state.startedAt)/1000
          })
        }).catch(e=>({ok:false,error:e?.message||String(e)}));

    const marker = {
      id:crypto.randomUUID(), clipId:result?.clipId||null,
      start:state.startTime, end, duration:Math.max(0,end-state.startTime),
      recordedDuration:(performance.now()-state.startedAt)/1000,
      url:location.href, title:document.title, createdAt:Date.now(),
      captured:!!result?.ok, captureMode:state.mode
    };

    state.recording=false; state.mode=null; state.startTime=null; state.startedAt=0;
    state.markers.push(marker);
    await saveMarkers();
    updateUi();
    if (result?.ok) toast('Clip saved · open Studio to reframe.');
    else toast(result?.error || 'Marker saved, video capture failed.', true, 5000);
  }

  async function cancelClip() {
    if (!state.recording) return;
    if (state.mode === 'element' && state.direct) {
      try {
        const stopped = new Promise(resolve => state.direct.recorder.addEventListener('stop',resolve,{once:true}));
        if (state.direct.recorder.state !== 'inactive') state.direct.recorder.stop();
        await stopped;
        state.direct.stream.getTracks().forEach(t=>t.stop());
        await chrome.runtime.sendMessage({type:'DIRECT_CANCEL',sessionId:state.direct.sessionId});
      } catch (_) {}
      state.direct=null;
    } else if (state.mode === 'tab') {
      try { await chrome.runtime.sendMessage({type:'SEGMENT_CANCEL'}); } catch (_) {}
    }
    state.recording=false; state.mode=null; state.startTime=null; state.startedAt=0;
    updateUi();
    toast('Clip cancelled.');
  }

  function dockPosition(r,w,h) {
    const m=10,g=10;
    const list=[
      {left:Math.max(m,Math.min(innerWidth-w-m,r.right-w)),top:r.bottom+g},
      {left:Math.max(m,Math.min(innerWidth-w-m,r.right-w)),top:r.top-h-g},
      {left:r.right+g,top:Math.max(m,Math.min(innerHeight-h-m,r.top))},
      {left:r.left-w-g,top:Math.max(m,Math.min(innerHeight-h-m,r.top))}
    ];
    return list.find(p=>p.left>=m&&p.top>=m&&p.left+w<=innerWidth-m&&p.top+h<=innerHeight-m) ||
      {left:Math.max(m,innerWidth-w-m),top:Math.max(m,innerHeight-h-m)};
  }

  function loop() {
    ensureUi();
    const v = findVideo();
    if (v !== state.video) {
      state.video = v;
      if (!state.recording) state.startTime = null;
    }

    if (!v) {
      state.root.style.display='none';
      requestAnimationFrame(loop);
      return;
    }

    const r=v.getBoundingClientRect();
    const w=Math.min(414,Math.max(330,innerWidth-20));
    state.root.style.width=w+'px';
    const p=dockPosition(r,w,state.ui.setup.hidden?101:145);
    Object.assign(state.root.style,{display:'block',left:Math.round(p.left)+'px',top:Math.round(p.top)+'px'});

    const key=storageKey();
    if (key!==state.pageKey && !state.recording) loadMarkers();

    updateUi();
    requestAnimationFrame(loop);
  }

  document.addEventListener('keydown',event=>{
    if (event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey) return;
    const t=event.target;
    if (t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
    if (event.key==='['&&!state.recording){event.preventDefault();startClip();}
    else if(event.key===']'&&state.recording){event.preventDefault();finishClip();}
    else if(event.key==='Escape'&&state.recording){event.preventDefault();cancelClip();}
  },true);

  chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
    if (message?.type==='CLIPPAH_CAPTURE_STATE') {
      state.ready=!!message.ready;
      if(state.ready) hideSetup();
      updateUi();
      toast(state.ready?'Capture enabled for this tab.':'Capture access ended.');
      return;
    }
    if (message?.type==='CLIPPAH_ERROR') {
      toast(message.message||'Clippah error',true,5000);
      return;
    }
    if (message?.type==='AGENT_COMMAND') {
      (async()=>{
        try{
          const cmd=message.command, params=message.params||{};
          if(cmd==='status') return sendResponse({ok:true,url:location.href,title:document.title,videoDetected:!!state.video,currentTime:state.video?.currentTime??null,duration:state.video?.duration??null,paused:state.video?.paused??null,recording:state.recording,captureMode:state.mode,compatibilityReady:state.ready,markers:state.markers});
          if(!state.video) return sendResponse({ok:false,error:'No video detected in the active tab.'});
          if(cmd==='play'){await state.video.play();return sendResponse({ok:true});}
          if(cmd==='pause'){state.video.pause();return sendResponse({ok:true});}
          if(cmd==='seek'){const s=Number(params.seconds);if(!Number.isFinite(s))return sendResponse({ok:false,error:'seconds must be a number'});state.video.currentTime=Math.max(0,Math.min(Number.isFinite(state.video.duration)?state.video.duration:s,s));return sendResponse({ok:true,currentTime:state.video.currentTime});}
          if(cmd==='start_clip'){await startClip();return sendResponse({ok:state.recording,recording:state.recording});}
          if(cmd==='finish_clip'){await finishClip();return sendResponse({ok:!state.recording,recording:state.recording});}
          if(cmd==='cancel_clip'){await cancelClip();return sendResponse({ok:true});}
          if(cmd==='get_markers')return sendResponse({ok:true,markers:state.markers});
          return sendResponse({ok:false,error:'Unknown agent command: '+cmd});
        }catch(error){sendResponse({ok:false,error:error?.message||String(error)});}
      })();
      return true;
    }
  });

  (async()=>{
    ensureUi();
    await loadMarkers();
    const capture=await chrome.runtime.sendMessage({type:'GET_CAPTURE_STATE'}).catch(()=>({ready:false}));
    state.ready=!!capture?.ready;
    requestAnimationFrame(loop);
  })();
})();