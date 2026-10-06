const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const els = {
  list: $('#clip-list'), workspace: $('#workspace'), empty: $('#empty-state'), editor: $('#editor'), inspector: $('#inspector'),
  title: $('#clip-title'), meta: $('#clip-meta'), stage: $('#stage'), canvas: $('#preview'), source: $('#source'),
  play: $('#play'), scrub: $('#scrub'), time: $('#time'), duration: $('#duration'), keyframeRail: $('#keyframe-rail'), timelineNote: $('#timeline-note'),
  aspect: $('#aspect'), background: $('#background-mode'), zoom: $('#zoom'), zoomValue: $('#zoom-value'),
  autoKeyframe: $('#auto-keyframe'), autoHint: $('#auto-hint'), addKeyframe: $('#add-keyframe'), removeKeyframe: $('#remove-keyframe'),
  clearKeyframes: $('#clear-keyframes'), keyframeCount: $('#keyframe-count'), resetFrame: $('#reset-frame'),
  export: $('#export'), exportStatus: $('#export-status'), downloadOriginal: $('#download-original'), delete: $('#delete'), refresh: $('#refresh'), settings: $('#settings'),
  sourceMode: $('#source-mode'), sourceSize: $('#source-size'), folderFilter: $('#folder-filter'), organize: $('#organize'), bulkBar: $('#bulk-bar'),
  bulkCount: $('#bulk-count'), moveFolder: $('#move-folder'), newFolder: $('#new-folder'), bulkDone: $('#bulk-done'),
  sequenceStrip: $('#sequence-strip'), prependClip: $('#prepend-clip'), appendClip: $('#append-clip'), picker: $('#picker'), pickerList: $('#picker-list'), pickerClose: $('#picker-close'),
  captionsEnabled: $('#captions-enabled'), captionSize: $('#caption-size'), captionSizeValue: $('#caption-size-value'), captionCount: $('#caption-count'),
  captionSource: $('#caption-source'), importCaptions: $('#import-captions'), exportCaptions: $('#export-captions'), captionFile: $('#caption-file'),
  toast: $('#toast')
};

const DB_NAME = 'clippah';
const DB_VERSION = 3;
const GLOBAL_EDIT_KEY = 'studio:global';
const SEQUENCE_KEY = 'studio:sequence';

const state = {
  clips: [], folders: [], folderFilter: 'all', organizing: false, selected: new Set(),
  sequence: [], activeSequenceIndex: 0, pendingInsertIndex: 0,
  clip: null, url: null, duration: 0,
  aspect: '16:9', mode: 'crop', x: .5, y: .5, zoom: 1, keyframes: [], autoKeyframe: true,
  captions: [], captionsEnabled: false, captionSize: 1, captionSource: 'No captions',
  dragging: false, pointerStart: null, transformStart: null, suppressTimeSync: false, wheelCommitTimer: 0,
  exporting: false, sequencePlaying: false, toastTimer: 0, saveTimer: 0
};

function fmt(seconds) {
  if (!Number.isFinite(seconds)) return '0:00.000';
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const rem = ms % 1000;
  return h
    ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(rem).padStart(3,'0')}`
    : `${m}:${String(s).padStart(2,'0')}.${String(rem).padStart(3,'0')}`;
}
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const bytes = size => !Number.isFinite(size) ? '--' : size < 1048576 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1048576).toFixed(1)} MB`;
const escapeHtml = value => String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

function toast(message, error = false, timeout = 2800) {
  clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.className = `studio-toast on${error ? ' error' : ''}`;
  state.toastTimer = setTimeout(() => els.toast.className = 'studio-toast', timeout);
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
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('folders')) {
        const folders = db.createObjectStore('folders', { keyPath: 'id' });
        folders.createIndex('name', 'name');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAll(storeName) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

async function listClips() { return (await getAll('clips')).sort((a,b) => b.createdAt - a.createdAt); }
async function listFolders() { return (await getAll('folders')).sort((a,b) => a.name.localeCompare(b.name)); }

async function putRecord(storeName, record) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

async function deleteRecord(storeName, id) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

async function moveClipsToFolder(ids, folderId) {
  if (!ids.length) return;
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('clips', 'readwrite');
      const store = tx.objectStore('clips');
      for (const id of ids) {
        const request = store.get(id);
        request.onsuccess = () => {
          if (!request.result) return;
          store.put({ ...request.result, folderId: folderId || null });
        };
      }
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

async function createFolder(name) {
  name = String(name || '').trim();
  if (!name) return null;
  const existing = state.folders.find(folder => folder.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  const folder = { id: crypto.randomUUID(), name, createdAt: Date.now() };
  await putRecord('folders', folder);
  state.folders.push(folder);
  state.folders.sort((a,b) => a.name.localeCompare(b.name));
  renderFolderControls();
  return folder;
}

function fallbackDuration(clip) {
  const meta = clip?.meta || {};
  if (Number.isFinite(meta.recordedDuration) && meta.recordedDuration > 0) return meta.recordedDuration;
  if (Number.isFinite(meta.segmentStart) && Number.isFinite(meta.segmentEnd) && meta.segmentEnd > meta.segmentStart) return meta.segmentEnd - meta.segmentStart;
  return 0;
}

function clipById(id) { return state.clips.find(clip => clip.id === id) || null; }
function folderName(id) { return id ? state.folders.find(folder => folder.id === id)?.name || 'Folder' : ''; }
function sequenceClips() { return state.sequence.map(clipById).filter(Boolean); }
function sequenceDuration() { return sequenceClips().reduce((sum, clip) => sum + fallbackDuration(clip), 0); }
function sequenceOffset(index = state.activeSequenceIndex) { return sequenceClips().slice(0, index).reduce((sum, clip) => sum + fallbackDuration(clip), 0); }
function globalTime() { return sequenceOffset() + (els.source.currentTime || 0); }

async function loadGlobalSettings() {
  const saved = (await chrome.storage.local.get(GLOBAL_EDIT_KEY))[GLOBAL_EDIT_KEY] || {};
  state.aspect = saved.aspect || '16:9';
  state.captionSize = saved.captionSize || 1;
}
function saveGlobalSettings() {
  chrome.storage.local.set({ [GLOBAL_EDIT_KEY]: { aspect: state.aspect, captionSize: state.captionSize } });
}

function editKey(id) { return `edit:${id}`; }
async function loadClipEdit(clip) {
  const saved = (await chrome.storage.local.get(editKey(clip.id)))[editKey(clip.id)] || {};
  state.mode = saved.mode || 'crop';
  state.keyframes = Array.isArray(saved.keyframes) ? saved.keyframes : [];
  state.autoKeyframe = saved.autoKeyframe !== false;
  state.captions = Array.isArray(saved.captions) ? saved.captions : (Array.isArray(clip.meta?.captions) ? clip.meta.captions : []);
  state.captionsEnabled = saved.captionsEnabled ?? state.captions.length > 0;
  state.captionSource = saved.captionSource || clip.meta?.captionSource || (state.captions.length ? 'Captured from source' : 'No captions');
  const t = transformAt(0);
  state.x = t.x; state.y = t.y; state.zoom = t.zoom;
}
function saveClipEditSoon() {
  if (!state.clip) return;
  clearTimeout(state.saveTimer);
  const clipId = state.clip.id;
  state.saveTimer = setTimeout(() => {
    chrome.storage.local.set({
      [editKey(clipId)]: {
        mode: state.mode, keyframes: state.keyframes, autoKeyframe: state.autoKeyframe,
        captions: state.captions, captionsEnabled: state.captionsEnabled, captionSource: state.captionSource
      }
    });
  }, 150);
}

async function saveSequence() {
  await chrome.storage.local.set({ [SEQUENCE_KEY]: state.sequence });
}

function renderFolderControls() {
  const filter = ['<option value="all">All clips</option>', '<option value="none">Unfiled</option>'];
  const move = ['<option value="">Move to…</option>', '<option value="none">Unfiled</option>'];
  for (const folder of state.folders) {
    filter.push(`<option value="${folder.id}">${escapeHtml(folder.name)}</option>`);
    move.push(`<option value="${folder.id}">${escapeHtml(folder.name)}</option>`);
  }
  const current = state.folderFilter;
  els.folderFilter.innerHTML = filter.join('');
  els.folderFilter.value = [...els.folderFilter.options].some(o => o.value === current) ? current : 'all';
  els.moveFolder.innerHTML = move.join('');
}

function visibleLibraryClips() {
  if (state.folderFilter === 'all') return state.clips;
  if (state.folderFilter === 'none') return state.clips.filter(clip => !clip.folderId);
  return state.clips.filter(clip => clip.folderId === state.folderFilter);
}

function renderList() {
  els.list.innerHTML = '';
  const clips = visibleLibraryClips();
  if (!clips.length) {
    els.list.innerHTML = '<div style="padding:12px;color:#7f8795;font-size:.78rem">No clips in this view.</div>';
    return;
  }
  for (const clip of clips) {
    const button = document.createElement('button');
    button.className = `clip-item${state.clip?.id === clip.id ? ' active' : ''}`;
    const checked = state.selected.has(clip.id);
    const checkbox = state.organizing ? `<input class="select-box" type="checkbox" ${checked ? 'checked' : ''} tabindex="-1">` : '<span></span>';
    const duration = fallbackDuration(clip);
    const mode = clip.meta?.captureMode === 'element' ? 'clean media' : 'browser capture';
    const folder = clip.folderId ? `<span class="clip-folder">${escapeHtml(folderName(clip.folderId))}</span>` : '';
    button.innerHTML = `${checkbox}<span class="clip-copy"><strong>${escapeHtml(clip.meta?.title || 'Captured clip')}</strong><small><i class="mode-dot"></i>${fmt(duration)} · ${bytes(clip.size)} · ${mode}</small>${folder}</span>`;
    button.addEventListener('click', async event => {
      if (state.organizing) {
        event.preventDefault();
        state.selected.has(clip.id) ? state.selected.delete(clip.id) : state.selected.add(clip.id);
        updateBulkUi(); renderList();
      } else {
        state.sequence = [clip.id]; state.activeSequenceIndex = 0; await saveSequence();
        await selectSequenceIndex(0);
      }
    });
    els.list.appendChild(button);
  }
}

function updateBulkUi() {
  els.bulkBar.hidden = !state.organizing;
  els.organize.textContent = state.organizing ? 'Selecting…' : 'Organize';
  els.bulkCount.textContent = `${state.selected.size} selected`;
}

function renderSequence() {
  els.sequenceStrip.innerHTML = '';
  const clips = sequenceClips();
  clips.forEach((clip, index) => {
    if (index > 0) {
      const between = document.createElement('button');
      between.className = 'add-clip';
      between.textContent = '+';
      between.dataset.tip = 'Insert another clip here';
      between.addEventListener('click', () => openPicker(index));
      els.sequenceStrip.appendChild(between);
    }
    const card = document.createElement('button');
    card.className = `sequence-card${index === state.activeSequenceIndex ? ' active' : ''}`;
    card.innerHTML = `<span class="seq-num">${index + 1}</span><span class="seq-title">${escapeHtml(clip.meta?.title || 'Clip')}</span>${clips.length > 1 ? '<span class="sequence-remove" title="Remove from sequence">×</span>' : ''}`;
    card.addEventListener('click', async event => {
      if (event.target.closest('.sequence-remove')) {
        event.stopPropagation();
        state.sequence.splice(index, 1);
        if (!state.sequence.length) state.sequence = [clip.id];
        state.activeSequenceIndex = clamp(state.activeSequenceIndex, 0, state.sequence.length - 1);
        await saveSequence(); renderSequence(); await selectSequenceIndex(state.activeSequenceIndex);
        return;
      }
      await selectSequenceIndex(index);
    });
    els.sequenceStrip.appendChild(card);
  });
  els.duration.textContent = fmt(sequenceDuration());
}

function openPicker(insertIndex) {
  state.pendingInsertIndex = clamp(insertIndex, 0, state.sequence.length);
  els.pickerList.innerHTML = '';
  for (const clip of state.clips) {
    const item = document.createElement('button');
    item.className = 'picker-item';
    item.innerHTML = `<strong>${escapeHtml(clip.meta?.title || 'Captured clip')}</strong><small>${fmt(fallbackDuration(clip))} · ${bytes(clip.size)}${clip.folderId ? ` · ${escapeHtml(folderName(clip.folderId))}` : ''}</small>`;
    item.addEventListener('click', async () => {
      state.sequence.splice(state.pendingInsertIndex, 0, clip.id);
      state.activeSequenceIndex = state.pendingInsertIndex;
      els.picker.hidden = true;
      await saveSequence(); renderSequence(); await selectSequenceIndex(state.activeSequenceIndex);
    });
    els.pickerList.appendChild(item);
  }
  els.picker.hidden = false;
}

async function repairWebmDuration() {
  const video = els.source;
  if (Number.isFinite(video.duration) && video.duration > 0 && video.duration !== Infinity) return video.duration;
  if (video.duration === Infinity) {
    await new Promise(resolve => {
      let done = false;
      const finish = () => { if (done) return; done = true; resolve(); };
      video.addEventListener('durationchange', finish, { once:true });
      try { video.currentTime = 1e101; } catch (_) {}
      setTimeout(finish, 650);
    });
    try { video.currentTime = 0; } catch (_) {}
  }
  return Number.isFinite(video.duration) && video.duration > 0 && video.duration !== Infinity ? video.duration : fallbackDuration(state.clip);
}

async function selectSequenceIndex(index, localTime = 0, autoPlay = false) {
  const clip = sequenceClips()[index];
  if (!clip) return;
  state.activeSequenceIndex = index;
  await selectClip(clip, localTime, autoPlay);
  renderSequence();
}

async function selectClip(clip, localTime = 0, autoPlay = false) {
  if (state.url) URL.revokeObjectURL(state.url);
  state.clip = clip;
  state.url = URL.createObjectURL(clip.blob);
  state.duration = fallbackDuration(clip);
  state.suppressTimeSync = true;
  els.source.pause();
  els.source.src = state.url;
  els.source.load();
  els.title.textContent = sequenceClips().length > 1 ? `${state.activeSequenceIndex + 1}/${state.sequence.length} · ${clip.meta?.title || 'Captured clip'}` : clip.meta?.title || 'Captured clip';
  els.meta.textContent = `${clip.meta?.captureMode === 'element' ? 'Clean media capture' : 'Browser capture'} · local only · ${bytes(clip.size)}`;
  els.sourceMode.textContent = clip.meta?.captureMode === 'element' ? 'Clean media' : 'Browser capture';
  els.sourceSize.textContent = bytes(clip.size);
  els.workspace.classList.remove('empty'); els.empty.hidden = true; els.editor.hidden = false; els.inspector.hidden = false;

  await new Promise(resolve => {
    if (els.source.readyState >= 1) return resolve();
    els.source.addEventListener('loadedmetadata', resolve, { once:true });
    setTimeout(resolve, 1000);
  });
  state.duration = await repairWebmDuration();
  await loadClipEdit(clip);
  try { els.source.currentTime = clamp(localTime, 0, state.duration || localTime); } catch (_) {}
  state.suppressTimeSync = false;
  syncControls(); renderList(); renderSequence(); renderKeyframes(); resize(); draw();
  if (autoPlay) els.source.play().catch(() => {});
}

function sourceRegion(video = els.source, clip = state.clip) {
  const vw = video.videoWidth || 16, vh = video.videoHeight || 9, meta = clip?.meta || {};
  if (meta.captureMode !== 'tab' || !meta.rect || !meta.viewportWidth || !meta.viewportHeight) return { sx:0, sy:0, sw:vw, sh:vh };
  const sx = clamp(meta.rect.left / meta.viewportWidth * vw, 0, vw - 1);
  const sy = clamp(meta.rect.top / meta.viewportHeight * vh, 0, vh - 1);
  const sw = clamp(meta.rect.width / meta.viewportWidth * vw, 2, vw - sx);
  const sh = clamp(meta.rect.height / meta.viewportHeight * vh, 2, vh - sy);
  return { sx, sy, sw, sh };
}

function transformFromFrames(frames, time, fallback = {x:.5,y:.5,zoom:1}) {
  frames = [...(frames || [])].sort((a,b) => a.time - b.time);
  if (!frames.length) return fallback;
  if (time <= frames[0].time) return frames[0];
  if (time >= frames.at(-1).time) return frames.at(-1);
  for (let i=0;i<frames.length-1;i++) {
    const a=frames[i], b=frames[i+1];
    if (time >= a.time && time <= b.time) {
      let t=(time-a.time)/Math.max(.0001,b.time-a.time); t=t*t*(3-2*t);
      return { x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t, zoom:a.zoom+(b.zoom-a.zoom)*t };
    }
  }
  return frames[0];
}
function transformAt(time) { return transformFromFrames(state.keyframes, time, {x:state.x,y:state.y,zoom:state.zoom}); }

function drawCover(ctx, video, region, w, h, mirror = false, blur = false) {
  const scale = Math.max(w / region.sw, h / region.sh), dw = region.sw * scale, dh = region.sh * scale, dx=(w-dw)/2, dy=(h-dh)/2;
  ctx.save();
  if (blur) ctx.filter='blur(34px) brightness(.62) saturate(.86)';
  if (mirror) { ctx.translate(w,0); ctx.scale(-1,1); ctx.drawImage(video,region.sx,region.sy,region.sw,region.sh,-dx-dw,dy,dw,dh); }
  else ctx.drawImage(video,region.sx,region.sy,region.sw,region.sh,dx,dy,dw,dh);
  ctx.restore();
}

function drawVideoFrame(ctx, video, w, h, transform, mode, clip) {
  const region = sourceRegion(video, clip);
  ctx.clearRect(0,0,w,h); ctx.fillStyle='#000'; ctx.fillRect(0,0,w,h);
  if (mode === 'blur' || mode === 'mirror') {
    drawCover(ctx,video,region,w,h,mode==='mirror',mode==='blur');
    const fit=Math.min(w/region.sw,h/region.sh)*transform.zoom, dw=region.sw*fit, dh=region.sh*fit;
    const dx=(w-dw)/2+(0.5-transform.x)*Math.max(0,Math.abs(w-dw));
    const dy=(h-dh)/2+(0.5-transform.y)*Math.max(0,Math.abs(h-dh));
    ctx.drawImage(video,region.sx,region.sy,region.sw,region.sh,dx,dy,dw,dh); return;
  }
  if (mode === 'fit') {
    const fit=Math.min(w/region.sw,h/region.sh)*transform.zoom, dw=region.sw*fit, dh=region.sh*fit;
    const dx=(w-dw)/2+(0.5-transform.x)*Math.max(0,Math.abs(w-dw));
    const dy=(h-dh)/2+(0.5-transform.y)*Math.max(0,Math.abs(h-dh));
    ctx.drawImage(video,region.sx,region.sy,region.sw,region.sh,dx,dy,dw,dh); return;
  }
  const target=w/h; let sw=region.sw, sh=region.sh;
  if (region.sw/region.sh > target) sw=region.sh*target; else sh=region.sw/target;
  sw/=transform.zoom; sh/=transform.zoom;
  const sx=region.sx+clamp(transform.x,0,1)*Math.max(0,region.sw-sw);
  const sy=region.sy+clamp(transform.y,0,1)*Math.max(0,region.sh-sh);
  ctx.drawImage(video,sx,sy,sw,sh,0,0,w,h);
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text || '').trim().split(/\s+/); const lines=[]; let line='';
  for (const word of words) {
    const test=line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxWidth) { lines.push(line); line=word; }
    else line=test;
  }
  if (line) lines.push(line);
  return lines.slice(0,3);
}
function activeCaption(cues, time) { return (cues || []).find(cue => time >= cue.start && time <= cue.end) || null; }
function drawCaptions(ctx, w, h, time, cues, enabled, sizeScale = 1) {
  if (!enabled || !cues?.length) return;
  const cue = activeCaption(cues, time); if (!cue?.text) return;
  const fontSize = Math.round(clamp(h * .042 * sizeScale, 22, 84));
  ctx.save(); ctx.font=`800 ${fontSize}px Inter,Arial,sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
  const maxWidth=w*.82, lines=wrapText(ctx,cue.text,maxWidth), lineHeight=fontSize*1.18, padX=fontSize*.45, padY=fontSize*.28;
  const widest=Math.max(...lines.map(line=>ctx.measureText(line).width),0);
  const boxW=Math.min(w*.9,widest+padX*2), boxH=lines.length*lineHeight+padY*2, x=w/2-boxW/2, y=h*.84-boxH/2;
  ctx.fillStyle='rgba(0,0,0,.68)'; ctx.beginPath(); const r=Math.min(18,fontSize*.28); ctx.roundRect(x,y,boxW,boxH,r); ctx.fill();
  ctx.fillStyle='#fff'; lines.forEach((line,i)=>ctx.fillText(line,w/2,y+padY+lineHeight*(i+.5)));
  ctx.restore();
}

function drawFrame(ctx, video, w, h, transform, mode, clip, captions = [], captionsEnabled = false, captionSize = 1) {
  drawVideoFrame(ctx, video, w, h, transform, mode, clip);
  drawCaptions(ctx,w,h,video.currentTime||0,captions,captionsEnabled,captionSize);
}

function resize() {
  if (!state.clip) return;
  const rect=els.stage.getBoundingClientRect(), dpr=Math.min(2,devicePixelRatio||1);
  els.canvas.width=Math.max(2,Math.round(rect.width*dpr)); els.canvas.height=Math.max(2,Math.round(rect.height*dpr)); draw();
}
function draw() {
  if (!state.clip || !els.source.videoWidth || !els.canvas.width) return;
  const t=state.dragging?{x:state.x,y:state.y,zoom:state.zoom}:transformAt(els.source.currentTime||0);
  if (!state.dragging && !state.suppressTimeSync) { state.x=t.x; state.y=t.y; state.zoom=t.zoom; syncZoomOnly(); }
  drawFrame(els.canvas.getContext('2d',{alpha:false}),els.source,els.canvas.width,els.canvas.height,t,state.mode,state.clip,state.captions,state.captionsEnabled,state.captionSize);
}

function syncZoomOnly(){ els.zoom.value=String(state.zoom); els.zoomValue.textContent=`${Math.round(state.zoom*100)}%`; }
function syncControls() {
  els.stage.className=`stage ratio-${state.aspect.replace(':','-')}`;
  els.aspect.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.aspect===state.aspect));
  els.background.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));
  els.autoKeyframe.checked=state.autoKeyframe; els.autoHint.textContent=state.autoKeyframe?'Auto keyframe on':'Auto keyframe off';
  els.captionsEnabled.checked=state.captionsEnabled; els.captionSize.value=String(state.captionSize); els.captionSizeValue.textContent=`${Math.round(state.captionSize*100)}%`;
  els.captionCount.textContent=String(state.captions.length); els.captionSource.textContent=state.captionSource;
  syncZoomOnly(); renderKeyframes(); requestAnimationFrame(resize);
}

function upsertKeyframe(frame = {time:els.source.currentTime||0,x:state.x,y:state.y,zoom:state.zoom}) {
  if (!state.clip) return;
  if (!state.keyframes.length && frame.time > .08) state.keyframes.push({time:0,x:.5,y:.5,zoom:1});
  const existing=state.keyframes.find(item=>Math.abs(item.time-frame.time)<=.10);
  if (existing) Object.assign(existing,frame); else state.keyframes.push(frame);
  state.keyframes.sort((a,b)=>a.time-b.time); renderKeyframes(); saveClipEditSoon(); draw();
}
function removeNearestKeyframe() {
  if (!state.keyframes.length) return;
  const time=els.source.currentTime||0; let index=0,best=Infinity;
  state.keyframes.forEach((frame,i)=>{const d=Math.abs(frame.time-time);if(d<best){best=d;index=i;}});
  state.keyframes.splice(index,1); renderKeyframes(); saveClipEditSoon(); draw();
}
function commitTransform(){ if(state.autoKeyframe) upsertKeyframe(); else {saveClipEditSoon();draw();} }

function renderKeyframes() {
  els.keyframeRail.innerHTML=''; els.keyframeCount.textContent=String(state.keyframes.length);
  els.timelineNote.textContent=state.keyframes.length?`${state.keyframes.length} motion point${state.keyframes.length===1?'':'s'} on active clip · smooth interpolation.`:'Move the frame at a new time to animate it.';
  const total=sequenceDuration()||1, offset=sequenceOffset();
  for (const frame of state.keyframes) {
    const marker=document.createElement('button'); marker.className='keyframe-marker'; marker.style.left=`${clamp((offset+frame.time)/total,0,1)*100}%`; marker.title=`Keyframe at ${fmt(offset+frame.time)}`;
    marker.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();seekGlobal(offset+frame.time);}); els.keyframeRail.appendChild(marker);
  }
}

async function seekGlobal(time, playAfter = false) {
  const clips=sequenceClips(); if(!clips.length)return;
  time=clamp(time,0,sequenceDuration()); let offset=0,index=0,local=0;
  for (;index<clips.length;index++) { const d=fallbackDuration(clips[index]); if(time<=offset+d||index===clips.length-1){local=time-offset;break;} offset+=d; }
  if(index!==state.activeSequenceIndex) await selectSequenceIndex(index,local,playAfter);
  else { try{els.source.currentTime=clamp(local,0,state.duration||local);}catch(_){} if(playAfter)els.source.play().catch(()=>{}); }
}

function setAspect(aspect){ state.aspect=aspect; syncControls(); saveGlobalSettings(); }
function setMode(mode){ state.mode=mode; syncControls(); saveClipEditSoon(); }
function resetFrame(){ state.x=.5;state.y=.5;state.zoom=1;if(state.autoKeyframe)upsertKeyframe();syncZoomOnly();draw(); }

function parseTimestamp(value) {
  const parts=value.trim().replace(',', '.').split(':').map(Number); if(parts.some(Number.isNaN))return NaN;
  if(parts.length===3)return parts[0]*3600+parts[1]*60+parts[2]; if(parts.length===2)return parts[0]*60+parts[1]; return parts[0];
}
function parseSubtitleFile(text) {
  text=String(text||'').replace(/^WEBVTT[^\n]*\n+/i,'').replace(/\r/g,''); const cues=[];
  const blocks=text.split(/\n\s*\n/);
  for(const block of blocks){const lines=block.split('\n').filter(Boolean);const timeLine=lines.findIndex(l=>l.includes('-->'));if(timeLine<0)continue;const [a,b]=lines[timeLine].split('-->').map(s=>s.trim().split(/\s+/)[0]);const start=parseTimestamp(a),end=parseTimestamp(b);if(!Number.isFinite(start)||!Number.isFinite(end))continue;const body=lines.slice(timeLine+1).join(' ').replace(/<[^>]+>/g,'').trim();if(body)cues.push({start,end,text:body});}
  return cues;
}
function srtTime(seconds){const ms=Math.max(0,Math.round(seconds*1000)),h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000),s=Math.floor((ms%60000)/1000),r=ms%1000;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(r).padStart(3,'0')}`;}
function exportSrt(){if(!state.captions.length)return toast('No captions on this clip.',true);const text=state.captions.map((cue,i)=>`${i+1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text}\n`).join('\n');const blob=new Blob([text],{type:'text/plain'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='clippah-captions.srt';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}

async function readEditForClip(clip) {
  const saved=(await chrome.storage.local.get(editKey(clip.id)))[editKey(clip.id)]||{};
  return {
    mode:saved.mode||'crop', keyframes:Array.isArray(saved.keyframes)?saved.keyframes:[],
    captions:Array.isArray(saved.captions)?saved.captions:(Array.isArray(clip.meta?.captions)?clip.meta.captions:[]),
    captionsEnabled:saved.captionsEnabled??(Array.isArray(clip.meta?.captions)&&clip.meta.captions.length>0)
  };
}
function bestMimeType(){return ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(type=>MediaRecorder.isTypeSupported(type))||'';}

async function exportSequence() {
  if(state.exporting||!state.sequence.length)return;
  state.exporting=true;els.export.disabled=true;els.exportStatus.textContent='Rendering sequence locally…';
  const dimensions=state.aspect==='9:16'?[1080,1920]:state.aspect==='1:1'?[1080,1080]:[1920,1080];
  const canvas=document.createElement('canvas');canvas.width=dimensions[0];canvas.height=dimensions[1];const ctx=canvas.getContext('2d',{alpha:false});const canvasStream=canvas.captureStream(30);
  const renderVideo=document.createElement('video');renderVideo.playsInline=true;renderVideo.preload='auto';renderVideo.style.position='fixed';renderVideo.style.left='-9999px';document.body.appendChild(renderVideo);
  const audioContext=new AudioContext();const mediaNode=audioContext.createMediaElementSource(renderVideo);const audioDest=audioContext.createMediaStreamDestination();mediaNode.connect(audioDest);await audioContext.resume();
  const output=new MediaStream([...canvasStream.getVideoTracks(),...audioDest.stream.getAudioTracks()]);const mimeType=bestMimeType();const recorder=new MediaRecorder(output,mimeType?{mimeType,videoBitsPerSecond:12000000}:undefined);const chunks=[];recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};recorder.start(1000);
  let raf=0,currentRender=null;
  const paint=()=>{if(currentRender&&renderVideo.videoWidth){const t=transformFromFrames(currentRender.edit.keyframes,renderVideo.currentTime||0,{x:.5,y:.5,zoom:1});drawFrame(ctx,renderVideo,canvas.width,canvas.height,t,currentRender.edit.mode,currentRender.clip,currentRender.edit.captions,currentRender.edit.captionsEnabled,state.captionSize);}raf=requestAnimationFrame(paint);};paint();
  try{
    for(let i=0;i<state.sequence.length;i++){
      const clip=clipById(state.sequence[i]);if(!clip)continue;const edit=await readEditForClip(clip);currentRender={clip,edit};const url=URL.createObjectURL(clip.blob);renderVideo.src=url;renderVideo.load();await new Promise(resolve=>{if(renderVideo.readyState>=1)return resolve();renderVideo.addEventListener('loadedmetadata',resolve,{once:true});setTimeout(resolve,1200)});try{renderVideo.currentTime=0}catch(_){};await new Promise(async resolve=>{const done=()=>resolve();renderVideo.addEventListener('ended',done,{once:true});try{await renderVideo.play()}catch(_){resolve()}setTimeout(done,Math.max(2500,(fallbackDuration(clip)+2)*1000));});URL.revokeObjectURL(url);
    }
  }catch(error){toast(`Export failed: ${error.message}`,true,5000);}
  cancelAnimationFrame(raf);if(recorder.state!=='inactive'){const stopped=new Promise(resolve=>recorder.addEventListener('stop',resolve,{once:true}));recorder.stop();await stopped;}canvasStream.getTracks().forEach(t=>t.stop());audioDest.stream.getTracks().forEach(t=>t.stop());await audioContext.close().catch(()=>{});renderVideo.remove();
  const blob=new Blob(chunks,{type:recorder.mimeType||'video/webm'});if(blob.size){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`clippah-sequence-${state.aspect.replace(':','x')}-${Date.now()}.webm`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);els.exportStatus.textContent=`Exported ${bytes(blob.size)}`;}else els.exportStatus.textContent='Export failed';
  state.exporting=false;els.export.disabled=false;
}

async function captureFrameAt(globalSeconds = globalTime()) {
  const originalGlobal=globalTime();const wasPaused=els.source.paused;els.source.pause();await seekGlobal(globalSeconds,false);await new Promise(resolve=>setTimeout(resolve,90));draw();
  const dataUrl=els.canvas.toDataURL('image/png');const region=sourceRegion();const response={ok:true,dataUrl,mimeType:'image/png',globalTime:globalTime(),localTime:els.source.currentTime||0,clipId:state.clip?.id,sequenceIndex:state.activeSequenceIndex,output:{width:els.canvas.width,height:els.canvas.height,aspect:state.aspect},source:{videoWidth:els.source.videoWidth,videoHeight:els.source.videoHeight,region},viewport:{x:state.x,y:state.y,zoom:state.zoom},keyframes:state.keyframes,captions:{count:state.captions.length,enabled:state.captionsEnabled,active:activeCaption(state.captions,els.source.currentTime||0)?.text||null}};
  await seekGlobal(originalGlobal,false);if(!wasPaused)els.source.play().catch(()=>{});return response;
}

async function captureFrames(times) {
  const original=globalTime(),wasPaused=els.source.paused;els.source.pause();const frames=[];
  for(const time of times.slice(0,6)){await seekGlobal(Number(time)||0,false);await new Promise(resolve=>setTimeout(resolve,80));draw();frames.push({time:globalTime(),clipId:state.clip?.id,localTime:els.source.currentTime||0,dataUrl:els.canvas.toDataURL('image/png'),viewport:{x:state.x,y:state.y,zoom:state.zoom},output:{width:els.canvas.width,height:els.canvas.height}});}
  await seekGlobal(original,false);if(!wasPaused)els.source.play().catch(()=>{});return{ok:true,frames};
}

async function handleStudioAgent(command, params={}) {
  if(command==='studio_status')return{ok:true,sequence:state.sequence,activeSequenceIndex:state.activeSequenceIndex,totalDuration:sequenceDuration(),globalTime:globalTime(),activeClipId:state.clip?.id,aspect:state.aspect,mode:state.mode,viewport:{x:state.x,y:state.y,zoom:state.zoom},keyframes:state.keyframes,captions:{count:state.captions.length,enabled:state.captionsEnabled,source:state.captionSource}};
  if(!state.clip)return{ok:false,error:'No clip is open in Clippah Studio.'};
  if(command==='studio_get_frame')return captureFrameAt(Number.isFinite(params.time)?params.time:globalTime());
  if(command==='studio_get_frames')return captureFrames(Array.isArray(params.times)?params.times:[]);
  if(command==='studio_seek'){await seekGlobal(Number(params.time)||0,false);return{ok:true,globalTime:globalTime()};}
  if(command==='studio_set_aspect'){if(!['16:9','9:16','1:1'].includes(params.aspect))return{ok:false,error:'aspect must be 16:9, 9:16, or 1:1'};setAspect(params.aspect);return{ok:true,aspect:state.aspect};}
  if(command==='studio_set_viewport'){if(Number.isFinite(params.time))await seekGlobal(params.time,false);state.x=clamp(Number(params.x),0,1);state.y=clamp(Number(params.y),0,1);if(Number.isFinite(params.zoom))state.zoom=clamp(Number(params.zoom),1,3);upsertKeyframe();syncZoomOnly();draw();return{ok:true,viewport:{x:state.x,y:state.y,zoom:state.zoom},localTime:els.source.currentTime||0};}
  if(command==='studio_move_viewport'){if(Number.isFinite(params.time))await seekGlobal(params.time,false);const w=els.canvas.width||1080,h=els.canvas.height||1920;state.x=clamp(state.x+(Number(params.dx)||0)/w/Math.max(1,state.zoom),0,1);state.y=clamp(state.y+(Number(params.dy)||0)/h/Math.max(1,state.zoom),0,1);if(Number.isFinite(params.zoom))state.zoom=clamp(Number(params.zoom),1,3);upsertKeyframe();syncZoomOnly();draw();return{ok:true,viewport:{x:state.x,y:state.y,zoom:state.zoom},output:{width:w,height:h}};}
  if(command==='studio_add_keyframe'){if(Number.isFinite(params.time))await seekGlobal(params.time,false);upsertKeyframe();return{ok:true,keyframes:state.keyframes};}
  if(command==='studio_clear_motion'){state.keyframes=[];state.x=.5;state.y=.5;state.zoom=1;renderKeyframes();saveClipEditSoon();draw();return{ok:true};}
  if(command==='studio_append_clip'){const clip=clipById(params.clipId);if(!clip)return{ok:false,error:'Unknown clipId'};state.sequence.push(clip.id);await saveSequence();renderSequence();return{ok:true,sequence:state.sequence};}
  return{ok:false,error:`Unknown Studio command: ${command}`};
}

els.play.addEventListener('click',async()=>{if(els.source.paused){state.sequencePlaying=true;await els.source.play();}else{state.sequencePlaying=false;els.source.pause();}});
els.source.addEventListener('play',()=>{els.play.textContent='Pause';});
els.source.addEventListener('pause',()=>{els.play.textContent='Play';});
els.source.addEventListener('ended',async()=>{if(state.sequencePlaying&&state.activeSequenceIndex<state.sequence.length-1)await selectSequenceIndex(state.activeSequenceIndex+1,0,true);else state.sequencePlaying=false;});
els.source.addEventListener('timeupdate',()=>{const total=sequenceDuration();const g=globalTime();if(total>0)els.scrub.value=String(Math.round(g/total*1000));els.time.textContent=fmt(g);if(!state.dragging&&!state.suppressTimeSync){const t=transformAt(els.source.currentTime||0);state.x=t.x;state.y=t.y;state.zoom=t.zoom;syncZoomOnly();}draw();});
els.source.addEventListener('seeked',()=>{draw();});
els.scrub.addEventListener('input',()=>{const total=sequenceDuration();if(total>0)seekGlobal(Number(els.scrub.value)/1000*total,false);});

els.zoom.addEventListener('input',()=>{state.zoom=Number(els.zoom.value);els.zoomValue.textContent=`${Math.round(state.zoom*100)}%`;draw();});
els.zoom.addEventListener('change',commitTransform);
els.aspect.addEventListener('click',event=>{const b=event.target.closest('button[data-aspect]');if(b)setAspect(b.dataset.aspect);});
els.background.addEventListener('click',event=>{const b=event.target.closest('button[data-mode]');if(b)setMode(b.dataset.mode);});
els.autoKeyframe.addEventListener('change',()=>{state.autoKeyframe=els.autoKeyframe.checked;els.autoHint.textContent=state.autoKeyframe?'Auto keyframe on':'Auto keyframe off';saveClipEditSoon();});
els.addKeyframe.addEventListener('click',()=>upsertKeyframe());els.removeKeyframe.addEventListener('click',removeNearestKeyframe);els.clearKeyframes.addEventListener('click',()=>{state.keyframes=[];renderKeyframes();saveClipEditSoon();draw();toast('Motion cleared.');});els.resetFrame.addEventListener('click',resetFrame);
els.export.addEventListener('click',exportSequence);els.settings.addEventListener('click',()=>chrome.runtime.openOptionsPage());

els.captionsEnabled.addEventListener('change',()=>{state.captionsEnabled=els.captionsEnabled.checked;saveClipEditSoon();draw();});
els.captionSize.addEventListener('input',()=>{state.captionSize=Number(els.captionSize.value);els.captionSizeValue.textContent=`${Math.round(state.captionSize*100)}%`;saveGlobalSettings();draw();});
els.importCaptions.addEventListener('click',()=>els.captionFile.click());
els.captionFile.addEventListener('change',async()=>{const file=els.captionFile.files?.[0];if(!file)return;const cues=parseSubtitleFile(await file.text());if(!cues.length)return toast('No valid subtitle cues found.',true);state.captions=cues;state.captionsEnabled=true;state.captionSource=`Imported ${file.name}`;syncControls();saveClipEditSoon();draw();toast(`Imported ${cues.length} caption cues.`);els.captionFile.value='';});
els.exportCaptions.addEventListener('click',exportSrt);

$$('.inspector-tabs button').forEach(button=>button.addEventListener('click',()=>{$$('.inspector-tabs button').forEach(b=>b.classList.toggle('active',b===button));$$('.inspector-panel').forEach(panel=>panel.classList.toggle('active',panel.id===`panel-${button.dataset.tab}`));}));

els.folderFilter.addEventListener('change',()=>{state.folderFilter=els.folderFilter.value;renderList();});
els.organize.addEventListener('click',()=>{state.organizing=!state.organizing;if(!state.organizing)state.selected.clear();updateBulkUi();renderList();});
els.bulkDone.addEventListener('click',()=>{state.organizing=false;state.selected.clear();updateBulkUi();renderList();});
els.moveFolder.addEventListener('change',async()=>{if(!state.selected.size||!els.moveFolder.value)return;const value=els.moveFolder.value;await moveClipsToFolder([...state.selected],value==='none'?null:value);els.moveFolder.value='';state.selected.clear();await refresh(false);updateBulkUi();toast('Clips moved.');});
els.newFolder.addEventListener('click',async()=>{const name=prompt('New folder name');if(!name)return;const folder=await createFolder(name);if(folder&&state.selected.size){await moveClipsToFolder([...state.selected],folder.id);state.selected.clear();await refresh(false);updateBulkUi();toast(`Moved to ${folder.name}.`);}});

els.prependClip.addEventListener('click',()=>openPicker(0));els.appendClip.addEventListener('click',()=>openPicker(state.sequence.length));els.pickerClose.addEventListener('click',()=>els.picker.hidden=true);els.picker.addEventListener('click',event=>{if(event.target===els.picker)els.picker.hidden=true;});
els.refresh.addEventListener('click',()=>refresh(true));

els.downloadOriginal.addEventListener('click',()=>{if(!state.clip)return;const url=URL.createObjectURL(state.clip.blob),a=document.createElement('a');a.href=url;a.download=`clippah-source-${Date.now()}.webm`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);});
els.delete.addEventListener('click',async()=>{if(!state.clip)return;const id=state.clip.id;if(!confirm('Delete this local clip?'))return;await deleteRecord('clips',id);state.sequence=state.sequence.filter(item=>item!==id);if(!state.sequence.length&&state.clips.length>1)state.sequence=[state.clips.find(c=>c.id!==id)?.id].filter(Boolean);state.activeSequenceIndex=0;await saveSequence();await refresh(true);toast('Clip deleted.');});

els.canvas.addEventListener('pointerdown',event=>{if(!state.clip)return;state.dragging=true;state.suppressTimeSync=true;els.canvas.classList.add('dragging');els.canvas.setPointerCapture(event.pointerId);state.pointerStart={x:event.clientX,y:event.clientY};const t=transformAt(els.source.currentTime||0);state.transformStart={...t};state.x=t.x;state.y=t.y;state.zoom=t.zoom;});
els.canvas.addEventListener('pointermove',event=>{if(!state.dragging)return;const r=els.canvas.getBoundingClientRect(),dx=(event.clientX-state.pointerStart.x)/Math.max(1,r.width),dy=(event.clientY-state.pointerStart.y)/Math.max(1,r.height);state.x=clamp(state.transformStart.x-dx/Math.max(1,state.zoom),0,1);state.y=clamp(state.transformStart.y-dy/Math.max(1,state.zoom),0,1);draw();});
function endDrag(event){if(!state.dragging)return;state.dragging=false;state.suppressTimeSync=false;els.canvas.classList.remove('dragging');try{els.canvas.releasePointerCapture(event.pointerId)}catch(_){}commitTransform();}
els.canvas.addEventListener('pointerup',endDrag);els.canvas.addEventListener('pointercancel',endDrag);
els.canvas.addEventListener('wheel',event=>{event.preventDefault();state.suppressTimeSync=true;state.zoom=clamp(state.zoom*(event.deltaY<0?1.06:.94),1,3);syncZoomOnly();draw();clearTimeout(state.wheelCommitTimer);state.wheelCommitTimer=setTimeout(()=>{state.suppressTimeSync=false;commitTransform();},180);},{passive:false});
window.addEventListener('resize',resize);

chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
  if(message?.type==='CLIP_LIBRARY_CHANGED'){refresh(false).then(()=>toast('New clip added to Library.'));return;}
  if(message?.type==='AGENT_STUDIO_COMMAND'){handleStudioAgent(message.command,message.params||{}).then(sendResponse).catch(error=>sendResponse({ok:false,error:error?.message||String(error)}));return true;}
});

async function refresh(selectNewest = false) {
  const oldIds=new Set(state.clips.map(clip=>clip.id));
  state.clips=await listClips();state.folders=await listFolders();renderFolderControls();
  state.sequence=state.sequence.filter(id=>clipById(id));
  if(!state.sequence.length&&state.clips.length)state.sequence=[state.clips[0].id];
  if(selectNewest&&state.clips[0]&&!oldIds.has(state.clips[0].id)){state.sequence=[state.clips[0].id];state.activeSequenceIndex=0;}
  state.activeSequenceIndex=clamp(state.activeSequenceIndex,0,Math.max(0,state.sequence.length-1));renderList();renderSequence();
  if(state.sequence.length){const active=clipById(state.sequence[state.activeSequenceIndex]);if(!state.clip||!clipById(state.clip.id)||state.clip.id!==active?.id)await selectSequenceIndex(state.activeSequenceIndex);}else{state.clip=null;els.editor.hidden=true;els.inspector.hidden=true;els.empty.hidden=false;els.workspace.classList.add('empty');}
}

async function init() {
  await loadGlobalSettings();
  const saved=(await chrome.storage.local.get(SEQUENCE_KEY))[SEQUENCE_KEY];if(Array.isArray(saved))state.sequence=saved;
  await refresh(false);syncControls();updateBulkUi();
}
init();
