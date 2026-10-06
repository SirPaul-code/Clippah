const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const DB_NAME = 'clippah';
const DB_VERSION = 3;
const PROJECT_KEY = 'studio:project:v4';

const els = {
  projectTitle: $('#project-title'), projectMeta: $('#project-meta'), export: $('#export'), exportStatus: $('#export-status'), settings: $('#settings'),
  refresh: $('#refresh'), folderFilter: $('#folder-filter'), organize: $('#organize'), bulkBar: $('#bulk-bar'), bulkCount: $('#bulk-count'), moveFolder: $('#move-folder'), newFolder: $('#new-folder'), bulkDone: $('#bulk-done'), clipList: $('#clip-list'),
  toolSelect: $('#tool-select'), toolCut: $('#tool-cut'), addText: $('#add-text'), viewerShell: $('#viewer-shell'), emptyState: $('#empty-state'), stage: $('#stage'), preview: $('#preview'), viewerGuides: $('#viewer-guides'), autoHint: $('#auto-hint'),
  play: $('#play'), time: $('#time'), duration: $('#duration'), splitAtPlayhead: $('#split-at-playhead'), deleteSegment: $('#delete-segment'), timeline: $('#timeline'), ruler: $('#ruler'), videoTrack: $('#video-track'), waveform: $('#waveform'), audioFades: $('#audio-fades'), textTrack: $('#text-track'), captionTrack: $('#caption-track'), playhead: $('#playhead'),
  inspectorTabs: $$('.inspector-tabs button'), panels: $$('.inspector-panel'), clipIndex: $('#clip-index'), noSegment: $('#no-segment'), clipControls: $('#clip-controls'), speed: $('#speed'), speedValue: $('#speed-value'), volume: $('#volume'), volumeValue: $('#volume-value'), videoFadeIn: $('#video-fade-in'), videoFadeInValue: $('#video-fade-in-value'), videoFadeOut: $('#video-fade-out'), videoFadeOutValue: $('#video-fade-out-value'), audioFadeIn: $('#audio-fade-in'), audioFadeInValue: $('#audio-fade-in-value'), audioFadeOut: $('#audio-fade-out'), audioFadeOutValue: $('#audio-fade-out-value'), clipSplit: $('#clip-split'), clipRemove: $('#clip-remove'),
  resetFrame: $('#reset-frame'), aspect: $('#aspect'), fill: $('#fill'), zoom: $('#zoom'), zoomValue: $('#zoom-value'), autoKeyframe: $('#auto-keyframe'), keyframeCount: $('#keyframe-count'), keyframeList: $('#keyframe-list'), addKeyframe: $('#add-keyframe'), removeKeyframe: $('#remove-keyframe'), clearKeyframes: $('#clear-keyframes'),
  newText: $('#new-text'), noText: $('#no-text'), textControls: $('#text-controls'), textContent: $('#text-content'), loadFonts: $('#load-fonts'), fontFamily: $('#font-family'), fontHint: $('#font-hint'), fontSize: $('#font-size'), fontColor: $('#font-color'), textStart: $('#text-start'), textEnd: $('#text-end'), textFadeIn: $('#text-fade-in'), textFadeOut: $('#text-fade-out'), deleteText: $('#delete-text'),
  captionsEnabled: $('#captions-enabled'), captionSize: $('#caption-size'), captionSizeValue: $('#caption-size-value'), captionCount: $('#caption-count'), captionSource: $('#caption-source'), importCaptions: $('#import-captions'), exportCaptions: $('#export-captions'), captionFile: $('#caption-file'),
  picker: $('#picker'), pickerClose: $('#picker-close'), pickerList: $('#picker-list'), contextMenu: $('#context-menu'), toast: $('#toast'), source: $('#source')
};

const state = {
  clips: [], folders: [], organizing: false, selectedLibrary: new Set(), folderFilter: 'all',
  project: { aspect: '16:9', fill: 'crop', autoKeyframe: true, captionsEnabled: false, captionSize: 1, segments: [] },
  selectedSegmentId: null, selectedTextId: null, tool: 'select', globalTime: 0, playing: false, playRaf: 0,
  sourceUrl: null, loadedSegmentId: null, sourceReady: false, draggingCanvas: false, dragStart: null, transformStart: null, textDrag: false,
  waveformCache: new Map(), waveformPending: new Set(), saveTimer: 0, toastTimer: 0, pendingInsertIndex: null, dragInsertIndex: null,
  exporting: false, audioContext: null, mediaSourceNode: null, previewGain: null, exportGain: null, exportDest: null,
  contextSegmentId: null, fonts: ['Arial','Verdana','Tahoma','Trebuchet MS','Georgia','Times New Roman','Courier New','Impact','Segoe UI','Roboto','Inter','Helvetica']
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const fmt = seconds => {
  if (!Number.isFinite(seconds)) return '0:00.000';
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), rem = ms % 1000;
  return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(rem).padStart(3,'0')}` : `${m}:${String(s).padStart(2,'0')}.${String(rem).padStart(3,'0')}`;
};
const bytes = n => !Number.isFinite(n) ? '--' : n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const uuid = () => crypto.randomUUID();

function toast(message, error = false, timeout = 2800) {
  clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.className = `toast on${error ? ' error' : ''}`;
  state.toastTimer = setTimeout(() => els.toast.className = 'toast', timeout);
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
      if (!db.objectStoreNames.contains('folders')) {
        const folders = db.createObjectStore('folders', { keyPath: 'id' });
        folders.createIndex('name', 'name');
      }
      if (!db.objectStoreNames.contains('chunks')) {
        const chunks = db.createObjectStore('chunks', { keyPath: 'key' });
        chunks.createIndex('sessionId', 'sessionId');
      }
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
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
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('clips', 'readwrite');
      const store = tx.objectStore('clips');
      for (const id of ids) {
        const request = store.get(id);
        request.onsuccess = () => request.result && store.put({ ...request.result, folderId: folderId || null });
      }
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

function clipById(id) { return state.clips.find(clip => clip.id === id) || null; }
function segmentById(id) { return state.project.segments.find(segment => segment.id === id) || null; }
function selectedSegment() { return segmentById(state.selectedSegmentId); }
function fallbackDuration(clip) {
  const meta = clip?.meta || {};
  const values = [meta.recordedDuration, Number(meta.segmentEnd) - Number(meta.segmentStart), meta.mediaDuration];
  return values.find(v => Number.isFinite(v) && v > 0) || 1;
}
function segmentDuration(segment) { return Math.max(.01, (segment.out - segment.in) / Math.max(.05, segment.speed || 1)); }
function sequenceLayout() {
  let cursor = 0;
  return state.project.segments.map((segment, index) => {
    const duration = segmentDuration(segment);
    const item = { segment, index, start: cursor, end: cursor + duration, duration, clip: clipById(segment.clipId) };
    cursor += duration;
    return item;
  });
}
function totalDuration() { const layout = sequenceLayout(); return layout.length ? layout.at(-1).end : 0; }
function globalToLocation(time = state.globalTime) {
  const layout = sequenceLayout();
  if (!layout.length) return null;
  const total = layout.at(-1).end;
  const t = clamp(time, 0, Math.max(0, total));
  let item = layout.find(x => t < x.end - 1e-6) || layout.at(-1);
  const localOutput = clamp(t - item.start, 0, item.duration);
  const sourceTime = clamp(item.segment.in + localOutput * item.segment.speed, item.segment.in, item.segment.out);
  return { ...item, globalTime: t, localOutput, sourceTime };
}
function sourceToGlobal(segment, sourceTime) {
  const item = sequenceLayout().find(x => x.segment.id === segment.id);
  if (!item) return 0;
  return item.start + (clamp(sourceTime, segment.in, segment.out) - segment.in) / segment.speed;
}

function defaultCaptionsForClip(clip) {
  const raw = Array.isArray(clip?.meta?.captions) ? clip.meta.captions : [];
  return raw.map(cue => ({ id: uuid(), start: Math.max(0, Number(cue.start) || 0), end: Math.max(Number(cue.start) || 0, Number(cue.end) || 0), text: String(cue.text || '') })).filter(cue => cue.text);
}
function makeSegment(clip) {
  const duration = fallbackDuration(clip);
  return {
    id: uuid(), clipId: clip.id, in: 0, out: duration, speed: 1, volume: 1,
    videoFadeIn: 0, videoFadeOut: 0, audioFadeIn: 0, audioFadeOut: 0,
    motion: [], texts: [], captions: defaultCaptionsForClip(clip)
  };
}
function sanitizeSegment(segment) {
  const clip = clipById(segment.clipId);
  const max = fallbackDuration(clip);
  return {
    id: segment.id || uuid(), clipId: segment.clipId,
    in: clamp(Number(segment.in) || 0, 0, max), out: clamp(Number(segment.out) || max, .01, max),
    speed: clamp(Number(segment.speed) || 1, .25, 3), volume: clamp(Number(segment.volume) || 1, 0, 2),
    videoFadeIn: Math.max(0, Number(segment.videoFadeIn) || 0), videoFadeOut: Math.max(0, Number(segment.videoFadeOut) || 0),
    audioFadeIn: Math.max(0, Number(segment.audioFadeIn) || 0), audioFadeOut: Math.max(0, Number(segment.audioFadeOut) || 0),
    motion: Array.isArray(segment.motion) ? segment.motion : [], texts: Array.isArray(segment.texts) ? segment.texts : [], captions: Array.isArray(segment.captions) ? segment.captions : defaultCaptionsForClip(clip)
  };
}

async function saveProject() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => chrome.storage.local.set({ [PROJECT_KEY]: state.project }), 120);
}
async function loadProject() {
  const stored = (await chrome.storage.local.get([PROJECT_KEY, 'studio:sequence'])) || {};
  if (stored[PROJECT_KEY]?.segments) {
    state.project = { aspect:'16:9', fill:'crop', autoKeyframe:true, captionsEnabled:false, captionSize:1, ...stored[PROJECT_KEY] };
    state.project.segments = state.project.segments.filter(s => clipById(s.clipId)).map(sanitizeSegment);
    return;
  }
  const old = stored['studio:sequence'];
  if (Array.isArray(old)) state.project.segments = old.map(clipById).filter(Boolean).map(makeSegment);
}

function switchPanel(name) {
  els.inspectorTabs.forEach(button => button.classList.toggle('active', button.dataset.panel === name));
  els.panels.forEach(panel => panel.classList.toggle('active', panel.id === `panel-${name}`));
}
function setTool(tool) {
  state.tool = tool;
  els.toolSelect.classList.toggle('active', tool === 'select');
  els.toolCut.classList.toggle('active', tool === 'cut');
  els.preview.style.cursor = tool === 'cut' ? 'crosshair' : tool === 'text' ? 'move' : 'grab';
}

function renderFolders() {
  const current = state.folderFilter;
  els.folderFilter.innerHTML = '<option value="all">All clips</option><option value="none">Unfiled</option>' + state.folders.map(folder => `<option value="${folder.id}">${esc(folder.name)}</option>`).join('');
  els.folderFilter.value = [...els.folderFilter.options].some(o => o.value === current) ? current : 'all';
  els.moveFolder.innerHTML = '<option value="">Move to folder…</option><option value="none">No folder</option>' + state.folders.map(folder => `<option value="${folder.id}">${esc(folder.name)}</option>`).join('');
}
function renderLibrary() {
  els.clipList.innerHTML = '';
  const visible = state.clips.filter(clip => state.folderFilter === 'all' || (state.folderFilter === 'none' ? !clip.folderId : clip.folderId === state.folderFilter));
  if (!visible.length) {
    els.clipList.innerHTML = '<div class="empty-inspector">No clips in this folder yet.</div>';
    return;
  }
  for (const clip of visible) {
    const row = document.createElement('div');
    row.className = 'clip-card';
    row.draggable = !state.organizing;
    row.dataset.clipId = clip.id;
    const folder = state.folders.find(f => f.id === clip.folderId);
    row.innerHTML = `${state.organizing ? `<input type="checkbox" ${state.selectedLibrary.has(clip.id) ? 'checked' : ''}>` : '<span class="drag-grip">⋮⋮</span>'}<div><strong>${esc(clip.meta?.title || 'Captured clip')}</strong><small>${fmt(fallbackDuration(clip))} · ${bytes(clip.size)} · ${clip.meta?.captureMode === 'element' ? 'clean media' : 'browser capture'}</small>${folder ? `<span class="folder-chip">${esc(folder.name)}</span>` : ''}</div><button class="tiny-add" title="Add to timeline">+</button>`;
    row.addEventListener('dragstart', event => {
      if (state.organizing) return event.preventDefault();
      row.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('application/x-clippah-clip', clip.id);
      event.dataTransfer.setData('text/plain', clip.id);
    });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.querySelector('.tiny-add').addEventListener('click', event => { event.stopPropagation(); insertClip(clip.id, state.project.segments.length); });
    row.addEventListener('click', event => {
      if (!state.organizing || event.target.closest('.tiny-add')) return;
      state.selectedLibrary.has(clip.id) ? state.selectedLibrary.delete(clip.id) : state.selectedLibrary.add(clip.id);
      renderLibrary(); updateBulkBar();
    });
    els.clipList.appendChild(row);
  }
}
function updateBulkBar() {
  els.bulkBar.hidden = !state.organizing;
  els.bulkCount.textContent = `${state.selectedLibrary.size} selected`;
  els.organize.textContent = state.organizing ? 'Selecting…' : 'Organize';
}

function renderRuler() {
  const total = totalDuration();
  els.ruler.innerHTML = '';
  if (!total) return;
  const steps = total <= 15 ? 1 : total <= 60 ? 5 : total <= 180 ? 10 : 30;
  for (let t = 0; t <= total + .001; t += steps) {
    const tick = document.createElement('span');
    tick.className = 'ruler-tick';
    tick.style.left = `${(t / total) * 100}%`;
    tick.textContent = fmt(t).replace(/\.\d+$/, '');
    els.ruler.appendChild(tick);
  }
}
function renderTimeline() {
  const layout = sequenceLayout(), total = totalDuration();
  els.videoTrack.innerHTML = '';
  els.textTrack.innerHTML = '';
  els.captionTrack.innerHTML = '';
  renderRuler();
  for (const item of layout) {
    const segment = item.segment;
    const block = document.createElement('div');
    block.className = `timeline-segment${segment.id === state.selectedSegmentId ? ' selected' : ''}`;
    block.dataset.segmentId = segment.id;
    block.draggable = state.tool === 'select';
    block.style.left = `${(item.start / total) * 100}%`;
    block.style.width = `${Math.max(.3, (item.duration / total) * 100)}%`;
    block.innerHTML = `<span class="fade-visual in" style="width:${Math.min(50, segment.videoFadeIn / Math.max(.01,item.duration) * 100)}%"></span><span class="fade-visual out" style="width:${Math.min(50, segment.videoFadeOut / Math.max(.01,item.duration) * 100)}%"></span><span class="segment-title">${esc(item.clip?.meta?.title || 'Clip')}</span><span class="segment-meta">${item.index + 1} · ${segment.speed.toFixed(2)}× · ${fmt(item.duration)}</span><button class="segment-x" title="Remove segment">×</button>`;
    block.addEventListener('click', event => {
      event.stopPropagation();
      if (event.target.closest('.segment-x')) return removeSegment(segment.id);
      if (state.tool === 'cut') {
        const r = block.getBoundingClientRect();
        const fraction = clamp((event.clientX - r.left) / Math.max(1, r.width), 0, 1);
        return splitSegment(segment.id, segment.in + (segment.out - segment.in) * fraction);
      }
      selectSegment(segment.id, true);
    });
    block.addEventListener('contextmenu', event => { event.preventDefault(); selectSegment(segment.id, false); openContextMenu(event.clientX, event.clientY, segment.id); });
    block.addEventListener('dragstart', event => {
      if (state.tool !== 'select') return event.preventDefault();
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-clippah-segment', segment.id);
    });
    els.videoTrack.appendChild(block);

    for (const text of segment.texts || []) {
      const start = sourceToGlobal(segment, text.start), end = sourceToGlobal(segment, text.end);
      const textBlock = document.createElement('button');
      textBlock.className = `text-block${text.id === state.selectedTextId ? ' selected' : ''}`;
      textBlock.style.left = `${(start / total) * 100}%`;
      textBlock.style.width = `${Math.max(.35, ((end - start) / total) * 100)}%`;
      textBlock.textContent = text.text || 'Text';
      textBlock.title = 'Text layer';
      textBlock.addEventListener('click', event => { event.stopPropagation(); state.selectedSegmentId = segment.id; state.selectedTextId = text.id; switchPanel('text'); setTool('text'); syncInspector(); renderTimeline(); draw(); });
      els.textTrack.appendChild(textBlock);
    }
    for (const cue of segment.captions || []) {
      const cueStart = clamp(cue.start, segment.in, segment.out), cueEnd = clamp(cue.end, segment.in, segment.out);
      if (cueEnd <= cueStart) continue;
      const start = sourceToGlobal(segment, cueStart), end = sourceToGlobal(segment, cueEnd);
      const cc = document.createElement('span');
      cc.className = 'caption-block';
      cc.style.left = `${(start / total) * 100}%`;
      cc.style.width = `${Math.max(.25, ((end - start) / total) * 100)}%`;
      cc.textContent = cue.text;
      els.captionTrack.appendChild(cc);
    }
  }
  renderPlayhead();
  drawWaveform();
  syncInspector();
  els.duration.textContent = fmt(total);
  els.viewerShell.classList.toggle('empty', !layout.length);
  els.emptyState.hidden = !!layout.length;
  els.stage.hidden = !layout.length;
  els.projectMeta.textContent = layout.length ? `${layout.length} segment${layout.length === 1 ? '' : 's'} · ${fmt(total)} · local project` : 'Local-first browser video editor';
}
function renderPlayhead() {
  const total = totalDuration();
  const trackWidth = Math.max(0, els.timeline.clientWidth - 70);
  const x = total ? 70 + (clamp(state.globalTime, 0, total) / total) * trackWidth : 70;
  els.playhead.style.left = `${x}px`;
  els.time.textContent = fmt(state.globalTime);
}
function timelineDropIndex(clientX) {
  const total = totalDuration(), layout = sequenceLayout(), r = els.videoTrack.getBoundingClientRect();
  if (!layout.length || !total) return 0;
  const time = clamp((clientX - r.left) / Math.max(1, r.width), 0, 1) * total;
  for (let i = 0; i < layout.length; i++) if (time < (layout[i].start + layout[i].end) / 2) return i;
  return layout.length;
}
function showInsertMarker(index) {
  els.videoTrack.querySelector('.insert-marker')?.remove();
  const total = totalDuration();
  let left = 0;
  if (total && index > 0) left = sequenceLayout()[Math.min(index - 1, state.project.segments.length - 1)]?.end / total * 100 || 0;
  const marker = document.createElement('span'); marker.className = 'insert-marker'; marker.style.left = `${left}%`; els.videoTrack.appendChild(marker);
}

async function insertClip(clipId, index = state.project.segments.length) {
  const clip = clipById(clipId); if (!clip) return;
  const segment = makeSegment(clip);
  state.project.segments.splice(clamp(index, 0, state.project.segments.length), 0, segment);
  state.selectedSegmentId = segment.id; state.selectedTextId = null;
  await saveProject(); renderTimeline(); await seekGlobal(sequenceLayout().find(x => x.segment.id === segment.id)?.start || 0, true); toast('Clip added to timeline.');
}
function reorderSegment(segmentId, index) {
  const from = state.project.segments.findIndex(s => s.id === segmentId); if (from < 0) return;
  const [segment] = state.project.segments.splice(from, 1);
  let to = clamp(index, 0, state.project.segments.length);
  if (from < index) to = Math.max(0, to - 1);
  state.project.segments.splice(to, 0, segment); saveProject(); renderTimeline();
}
async function selectSegment(id, seek = false) {
  const segment = segmentById(id); if (!segment) return;
  state.selectedSegmentId = id; state.selectedTextId = null; setTool('select');
  const item = sequenceLayout().find(x => x.segment.id === id);
  if (seek && item) await seekGlobal(item.start, true);
  renderTimeline(); syncInspector();
}
function removeSegment(id) {
  const index = state.project.segments.findIndex(s => s.id === id); if (index < 0) return;
  const was = state.project.segments[index];
  state.project.segments.splice(index, 1);
  if (state.selectedSegmentId === id) state.selectedSegmentId = state.project.segments[Math.min(index, state.project.segments.length - 1)]?.id || null;
  state.selectedTextId = null; state.globalTime = clamp(state.globalTime, 0, totalDuration());
  saveProject(); renderTimeline(); if (!state.project.segments.length) unloadSource(); else seekGlobal(state.globalTime, true); toast(`Removed ${clipById(was.clipId)?.meta?.title || 'segment'}.`);
}
function duplicateSegment(id) {
  const index = state.project.segments.findIndex(s => s.id === id); if (index < 0) return;
  const copy = structuredClone(state.project.segments[index]); copy.id = uuid(); copy.motion = copy.motion.map(k => ({...k})); copy.texts = copy.texts.map(t => ({...t,id:uuid()})); copy.captions = copy.captions.map(c => ({...c,id:uuid()}));
  state.project.segments.splice(index + 1, 0, copy); state.selectedSegmentId = copy.id; saveProject(); renderTimeline();
}
function splitSegment(id = state.selectedSegmentId, sourceTime = null) {
  const index = state.project.segments.findIndex(s => s.id === id); if (index < 0) return false;
  const segment = state.project.segments[index];
  if (sourceTime == null) {
    const loc = globalToLocation();
    if (!loc || loc.segment.id !== id) return toast('Move the playhead inside the selected segment first.', true), false;
    sourceTime = loc.sourceTime;
  }
  sourceTime = clamp(sourceTime, segment.in, segment.out);
  if (sourceTime - segment.in < .08 || segment.out - sourceTime < .08) return toast('Split point is too close to the edge.', true), false;
  const left = structuredClone(segment), right = structuredClone(segment);
  left.id = uuid(); right.id = uuid(); left.out = sourceTime; right.in = sourceTime;
  left.motion = left.motion.filter(k => k.time <= sourceTime); right.motion = right.motion.filter(k => k.time >= sourceTime);
  const splitOverlays = items => {
    const a = [], b = [];
    for (const item of items || []) {
      if (item.end <= sourceTime) a.push({...item});
      else if (item.start >= sourceTime) b.push({...item,id:uuid()});
      else { a.push({...item,end:sourceTime}); b.push({...item,id:uuid(),start:sourceTime}); }
    }
    return [a,b];
  };
  [left.texts,right.texts] = splitOverlays(segment.texts); [left.captions,right.captions] = splitOverlays(segment.captions);
  state.project.segments.splice(index, 1, left, right); state.selectedSegmentId = right.id; state.selectedTextId = null; saveProject(); renderTimeline(); toast('Segment split.'); return true;
}

function openPicker(index) {
  state.pendingInsertIndex = clamp(index, 0, state.project.segments.length);
  els.pickerList.innerHTML = '';
  if (!state.clips.length) els.pickerList.innerHTML = '<div class="empty-inspector">No local clips yet.</div>';
  for (const clip of state.clips) {
    const item = document.createElement('button'); item.className = 'picker-item';
    item.innerHTML = `<span><strong>${esc(clip.meta?.title || 'Captured clip')}</strong><small>${fmt(fallbackDuration(clip))} · ${bytes(clip.size)}</small></span><span>+</span>`;
    item.addEventListener('click', async () => { closePicker(); await insertClip(clip.id, state.pendingInsertIndex); });
    els.pickerList.appendChild(item);
  }
  els.picker.hidden = false;
}
function closePicker() { els.picker.hidden = true; }
function openContextMenu(x,y,id) { state.contextSegmentId = id; els.contextMenu.hidden = false; els.contextMenu.style.left = `${x}px`; els.contextMenu.style.top = `${y}px`; }
function closeContextMenu() { els.contextMenu.hidden = true; state.contextSegmentId = null; }

function segmentMotionAt(segment, sourceTime) {
  const frames = [...(segment.motion || [])].sort((a,b) => a.time - b.time);
  if (!frames.length) return {x:.5,y:.5,zoom:1};
  if (sourceTime <= frames[0].time) return frames[0];
  if (sourceTime >= frames.at(-1).time) return frames.at(-1);
  for (let i=0;i<frames.length-1;i++) {
    const a=frames[i], b=frames[i+1]; if (sourceTime < a.time || sourceTime > b.time) continue;
    let t=(sourceTime-a.time)/Math.max(.0001,b.time-a.time); t=t*t*(3-2*t);
    return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,zoom:a.zoom+(b.zoom-a.zoom)*t};
  }
  return {x:.5,y:.5,zoom:1};
}
function upsertKeyframe(segment, sourceTime, transform) {
  sourceTime = clamp(sourceTime, segment.in, segment.out);
  if (!segment.motion.length && sourceTime > segment.in + .05) segment.motion.push({time:segment.in,x:.5,y:.5,zoom:1});
  const existing = segment.motion.find(k => Math.abs(k.time - sourceTime) < .06);
  if (existing) Object.assign(existing, {time:sourceTime,...transform}); else segment.motion.push({time:sourceTime,...transform});
  segment.motion.sort((a,b) => a.time-b.time); saveProject(); renderKeyframes(); renderTimeline();
}
function removeNearestKeyframe() {
  const segment = selectedSegment(), loc = globalToLocation(); if (!segment || !loc || loc.segment.id !== segment.id || !segment.motion.length) return;
  let best=0,delta=Infinity; segment.motion.forEach((k,i)=>{const d=Math.abs(k.time-loc.sourceTime);if(d<delta){delta=d;best=i;}}); segment.motion.splice(best,1); saveProject(); renderKeyframes(); renderTimeline(); draw();
}
function clearMotion() { const segment=selectedSegment(); if(!segment)return; segment.motion=[]; saveProject(); renderKeyframes(); renderTimeline(); draw(); }
function renderKeyframes() {
  const segment=selectedSegment(); els.keyframeList.innerHTML=''; els.keyframeCount.textContent=String(segment?.motion?.length||0);
  for(const keyframe of segment?.motion||[]) { const b=document.createElement('button'); b.className='keyframe-chip'; b.textContent=fmt(keyframe.time-segment.in); b.title=`Source ${fmt(keyframe.time)}`; b.onclick=()=>seekGlobal(sourceToGlobal(segment,keyframe.time),true); els.keyframeList.appendChild(b); }
}

function sourceRegion(video = els.source, clip = null) {
  const vw=video.videoWidth||16,vh=video.videoHeight||9,meta=clip?.meta||{};
  if(meta.captureMode!=='tab'||!meta.rect||!meta.viewportWidth||!meta.viewportHeight)return{sx:0,sy:0,sw:vw,sh:vh};
  const sx=clamp(meta.rect.left/meta.viewportWidth*vw,0,vw-1),sy=clamp(meta.rect.top/meta.viewportHeight*vh,0,vh-1),sw=clamp(meta.rect.width/meta.viewportWidth*vw,2,vw-sx),sh=clamp(meta.rect.height/meta.viewportHeight*vh,2,vh-sy); return{sx,sy,sw,sh};
}
function videoOpacity(segment, localOutput) {
  const d=segmentDuration(segment); let o=1;
  if(segment.videoFadeIn>0)o=Math.min(o,clamp(localOutput/segment.videoFadeIn,0,1));
  if(segment.videoFadeOut>0)o=Math.min(o,clamp((d-localOutput)/segment.videoFadeOut,0,1)); return o;
}
function audioLevel(segment, localOutput) {
  const d=segmentDuration(segment); let v=segment.volume;
  if(segment.audioFadeIn>0)v*=clamp(localOutput/segment.audioFadeIn,0,1);
  if(segment.audioFadeOut>0)v*=clamp((d-localOutput)/segment.audioFadeOut,0,1); return clamp(v,0,2);
}
function textOpacity(text, sourceTime) {
  let o=1;
  if(text.fadeIn>0)o=Math.min(o,clamp((sourceTime-text.start)/text.fadeIn,0,1));
  if(text.fadeOut>0)o=Math.min(o,clamp((text.end-sourceTime)/text.fadeOut,0,1)); return o*(text.opacity ?? 1);
}
function drawText(ctx,text,w,h,sourceTime,selected=false){
  if(sourceTime<text.start||sourceTime>text.end)return;
  const alpha=textOpacity(text,sourceTime); if(alpha<=0)return;
  ctx.save();ctx.globalAlpha*=alpha;const size=Math.round((Number(text.fontSize)||64)*(w/1920));ctx.font=`800 ${Math.max(12,size)}px ${text.fontFamily||'Arial'}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=Math.max(2,size*.07);ctx.strokeStyle='rgba(0,0,0,.78)';ctx.fillStyle=text.color||'#fff';const x=clamp(text.x??.5,0,1)*w,y=clamp(text.y??.82,0,1)*h;ctx.strokeText(text.text||'Text',x,y);ctx.fillText(text.text||'Text',x,y);if(selected){const metrics=ctx.measureText(text.text||'Text');ctx.strokeStyle='#72d8f1';ctx.lineWidth=1;ctx.strokeRect(x-metrics.width/2-8,y-size*.7,metrics.width+16,size*1.4);}ctx.restore();
}
function activeCaption(segment,sourceTime){return (segment.captions||[]).find(c=>sourceTime>=c.start&&sourceTime<=c.end&&c.text);}
function drawCaption(ctx,cue,w,h){if(!cue||!state.project.captionsEnabled)return;ctx.save();const size=Math.round(52*(state.project.captionSize||1)*(w/1920));ctx.font=`800 ${Math.max(18,size)}px Arial`;ctx.textAlign='center';ctx.textBaseline='bottom';const maxWidth=w*.82,words=String(cue.text).split(/\s+/),lines=[];let line='';for(const word of words){const test=line?line+' '+word:word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word}else line=test}if(line)lines.push(line);const lh=size*1.22,y0=h-h*.085-(lines.length-1)*lh;ctx.lineWidth=Math.max(3,size*.09);ctx.strokeStyle='rgba(0,0,0,.88)';ctx.fillStyle='#fff';lines.forEach((text,i)=>{const y=y0+i*lh;ctx.strokeText(text,w/2,y);ctx.fillText(text,w/2,y)});ctx.restore();}
function drawFrame(ctx,w,h,location=globalToLocation(),opts={}){
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);if(!location||!els.source.videoWidth)return;
  const {segment,clip,sourceTime,localOutput}=location,src=sourceRegion(els.source,clip),motion=segmentMotionAt(segment,sourceTime),fill=state.project.fill;
  ctx.save();ctx.globalAlpha=videoOpacity(segment,localOutput);
  if(fill==='blur'||fill==='mirror'){
    const cover=Math.max(w/src.sw,h/src.sh),bw=src.sw*cover,bh=src.sh*cover;ctx.save();if(fill==='blur')ctx.filter='blur(36px) brightness(.62)';if(fill==='mirror'){ctx.translate(w,0);ctx.scale(-1,1)}ctx.drawImage(els.source,src.sx,src.sy,src.sw,src.sh,(w-bw)/2,(h-bh)/2,bw,bh);ctx.restore();const fit=Math.min(w/src.sw,h/src.sh)*motion.zoom,fw=src.sw*fit,fh=src.sh*fit,ox=Math.max(0,fw-w),oy=Math.max(0,fh-h),dx=(w-fw)/2-(motion.x-.5)*ox,dy=(h-fh)/2-(motion.y-.5)*oy;ctx.drawImage(els.source,src.sx,src.sy,src.sw,src.sh,dx,dy,fw,fh);
  }else if(fill==='fit'){
    const scale=Math.min(w/src.sw,h/src.sh)*motion.zoom,dw=src.sw*scale,dh=src.sh*scale,ox=Math.max(0,dw-w),oy=Math.max(0,dh-h),dx=(w-dw)/2-(motion.x-.5)*ox,dy=(h-dh)/2-(motion.y-.5)*oy;ctx.drawImage(els.source,src.sx,src.sy,src.sw,src.sh,dx,dy,dw,dh);
  }else{
    const target=w/h;let sw=src.sw,sh=src.sh;if(src.sw/src.sh>target)sw=src.sh*target;else sh=src.sw/target;sw/=motion.zoom;sh/=motion.zoom;const sx=src.sx+clamp(motion.x,0,1)*(src.sw-sw),sy=src.sy+clamp(motion.y,0,1)*(src.sh-sh);ctx.drawImage(els.source,sx,sy,sw,sh,0,0,w,h);
  }
  ctx.restore();
  for(const text of segment.texts||[])drawText(ctx,text,w,h,sourceTime,text.id===state.selectedTextId&&opts.guides!==false);
  drawCaption(ctx,activeCaption(segment,sourceTime),w,h);
}
function resizePreview(){if(els.stage.hidden)return;const r=els.stage.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);els.preview.width=Math.max(2,Math.round(r.width*dpr));els.preview.height=Math.max(2,Math.round(r.height*dpr));draw();}
function draw(){if(els.stage.hidden)return;drawFrame(els.preview.getContext('2d',{alpha:false}),els.preview.width,els.preview.height,globalToLocation());}

async function ensureAudioGraph(){
  if(state.audioContext)return;
  state.audioContext=new AudioContext();state.mediaSourceNode=state.audioContext.createMediaElementSource(els.source);state.previewGain=state.audioContext.createGain();state.exportGain=state.audioContext.createGain();state.exportDest=state.audioContext.createMediaStreamDestination();state.mediaSourceNode.connect(state.previewGain);state.previewGain.connect(state.audioContext.destination);state.mediaSourceNode.connect(state.exportGain);state.exportGain.connect(state.exportDest);state.exportGain.gain.value=0;
}
function updateAudioLevel(location=globalToLocation()){
  if(!location)return;const level=audioLevel(location.segment,location.localOutput);els.source.volume=state.audioContext?1:clamp(level,0,1);if(state.previewGain)state.previewGain.gain.value=level;if(state.exportGain&&!state.exporting)state.exportGain.gain.value=0;
}

function unloadSource(){if(state.sourceUrl)URL.revokeObjectURL(state.sourceUrl);state.sourceUrl=null;state.loadedSegmentId=null;state.sourceReady=false;els.source.pause();els.source.removeAttribute('src');els.source.load();}
async function loadLocation(location, forceSeek=true){
  if(!location)return;
  if(state.loadedSegmentId!==location.segment.id){
    if(state.sourceUrl)URL.revokeObjectURL(state.sourceUrl);state.sourceUrl=URL.createObjectURL(location.clip.blob);state.loadedSegmentId=location.segment.id;state.sourceReady=false;els.source.pause();els.source.src=state.sourceUrl;els.source.load();await new Promise(resolve=>{if(els.source.readyState>=1)return resolve();const done=()=>resolve();els.source.addEventListener('loadedmetadata',done,{once:true});setTimeout(done,900)});state.sourceReady=true;
  }
  els.source.playbackRate=location.segment.speed;
  if(forceSeek||Math.abs(els.source.currentTime-location.sourceTime)>.12){try{els.source.currentTime=location.sourceTime}catch(_){}}
  updateAudioLevel(location);draw();
}
async function seekGlobal(time, pause=true){
  const total=totalDuration();state.globalTime=clamp(Number(time)||0,0,total);if(pause)pauseSequence(false);const loc=globalToLocation();if(loc){state.selectedSegmentId=loc.segment.id;await loadLocation(loc,true);}renderPlayhead();renderTimeline();draw();
}
async function playSequence(){
  if(!state.project.segments.length)return;if(state.playing)return pauseSequence();if(state.globalTime>=totalDuration()-.01)state.globalTime=0;state.playing=true;els.play.textContent='❚❚';const loc=globalToLocation();await loadLocation(loc,true);await ensureAudioGraph().catch(()=>{});try{await state.audioContext?.resume()}catch(_){};try{await els.source.play()}catch(error){state.playing=false;toast(error?.message||'Could not start playback.',true);return}state.playRaf=requestAnimationFrame(playLoop);
}
async function playLoop(){
  if(!state.playing)return;const loc=globalToLocation();if(!loc){pauseSequence();return}
  const same=loc.segment.id===state.loadedSegmentId;
  if(same){const current=els.source.currentTime;state.globalTime=clamp(loc.start+(current-loc.segment.in)/loc.segment.speed,loc.start,loc.end);updateAudioLevel({...loc,sourceTime:current,localOutput:(current-loc.segment.in)/loc.segment.speed});draw();renderPlayhead();if(current>=loc.segment.out-.025||els.source.ended){const next=sequenceLayout()[loc.index+1];if(!next){state.globalTime=totalDuration();pauseSequence(false);renderPlayhead();return}state.globalTime=next.start;await loadLocation({...next,globalTime:next.start,localOutput:0,sourceTime:next.segment.in},true);try{await els.source.play()}catch(_){}}
  }else await loadLocation(globalToLocation(),true);
  state.playRaf=requestAnimationFrame(playLoop);
}
function pauseSequence(update=true){state.playing=false;cancelAnimationFrame(state.playRaf);els.source.pause();els.play.textContent='▶';if(update)renderPlayhead();}

function currentTransform(){const loc=globalToLocation();return loc?segmentMotionAt(loc.segment,loc.sourceTime):{x:.5,y:.5,zoom:1};}
function commitViewport(transform){const loc=globalToLocation();if(!loc)return;const segment=loc.segment;if(state.project.autoKeyframe)upsertKeyframe(segment,loc.sourceTime,transform);else{segment.motion=[{time:segment.in,...transform}];saveProject();renderKeyframes();renderTimeline()}draw();}

function syncInspector(){
  const segment=selectedSegment();const loc=globalToLocation();
  els.noSegment.hidden=!!segment;els.clipControls.hidden=!segment;els.clipIndex.textContent=segment?`${state.project.segments.findIndex(s=>s.id===segment.id)+1}/${state.project.segments.length}`:'—';
  if(segment){els.speed.value=segment.speed;els.speedValue.textContent=`${segment.speed.toFixed(2)}×`;els.volume.value=segment.volume;els.volumeValue.textContent=`${Math.round(segment.volume*100)}%`;for(const [input,valueEl,key] of [[els.videoFadeIn,els.videoFadeInValue,'videoFadeIn'],[els.videoFadeOut,els.videoFadeOutValue,'videoFadeOut'],[els.audioFadeIn,els.audioFadeInValue,'audioFadeIn'],[els.audioFadeOut,els.audioFadeOutValue,'audioFadeOut']]){input.max=Math.max(.1,Math.min(5,segmentDuration(segment)/2));input.value=segment[key];valueEl.textContent=`${segment[key].toFixed(1)}s`;}}
  els.aspect.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.aspect===state.project.aspect));els.fill.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.fill===state.project.fill));els.autoKeyframe.checked=state.project.autoKeyframe;els.autoHint.textContent=state.project.autoKeyframe?'Auto keyframe on':'Auto keyframe off';
  const motion=loc&&segment&&loc.segment.id===segment.id?segmentMotionAt(segment,loc.sourceTime):{x:.5,y:.5,zoom:1};els.zoom.value=motion.zoom;els.zoomValue.textContent=`${Math.round(motion.zoom*100)}%`;renderKeyframes();syncTextInspector();
  els.captionsEnabled.checked=state.project.captionsEnabled;els.captionSize.value=state.project.captionSize;els.captionSizeValue.textContent=`${Math.round(state.project.captionSize*100)}%`;const captions=segment?.captions||[];els.captionCount.textContent=String(captions.length);els.captionSource.textContent=captions.length?(clipById(segment.clipId)?.meta?.captionLanguage||'Source / imported'):'No captions';
}
function setSegmentNumber(key,value,min,max){const segment=selectedSegment();if(!segment)return;segment[key]=clamp(Number(value)||0,min,max);saveProject();renderTimeline();syncInspector();updateAudioLevel();draw();}

function selectedText(){const segment=selectedSegment();return segment?.texts?.find(t=>t.id===state.selectedTextId)||null;}
function addTextLayer(){const loc=globalToLocation();if(!loc)return toast('Add a clip to the timeline first.',true);state.selectedSegmentId=loc.segment.id;const text={id:uuid(),text:'Your text',start:loc.sourceTime,end:Math.min(loc.segment.out,loc.sourceTime+5*loc.segment.speed),x:.5,y:.82,fontFamily:'Arial',fontSize:64,color:'#ffffff',opacity:1,fadeIn:.2,fadeOut:.2};if(text.end<=text.start+.05)text.end=Math.min(loc.segment.out,text.start+.5);loc.segment.texts.push(text);state.selectedTextId=text.id;setTool('text');switchPanel('text');saveProject();renderTimeline();syncTextInspector();draw();}
function syncTextInspector(){const text=selectedText();els.noText.hidden=!!text;els.textControls.hidden=!text;if(!text)return;els.textContent.value=text.text;els.fontFamily.value=[...els.fontFamily.options].some(o=>o.value===text.fontFamily)?text.fontFamily:'Arial';els.fontSize.value=text.fontSize;els.fontColor.value=text.color;els.textStart.value=text.start.toFixed(2);els.textEnd.value=text.end.toFixed(2);els.textFadeIn.value=text.fadeIn||0;els.textFadeOut.value=text.fadeOut||0;}
function updateText(patch){const text=selectedText(),segment=selectedSegment();if(!text||!segment)return;Object.assign(text,patch);text.start=clamp(Number(text.start)||segment.in,segment.in,segment.out);text.end=clamp(Number(text.end)||segment.out,text.start+.01,segment.out);saveProject();renderTimeline();draw();}
function deleteTextLayer(){const segment=selectedSegment();if(!segment||!state.selectedTextId)return;segment.texts=segment.texts.filter(t=>t.id!==state.selectedTextId);state.selectedTextId=null;saveProject();renderTimeline();syncTextInspector();setTool('select');draw();}
function populateFonts(){const current=selectedText()?.fontFamily||'Arial';els.fontFamily.innerHTML=[...new Set(state.fonts)].sort((a,b)=>a.localeCompare(b)).map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join('');if([...els.fontFamily.options].some(o=>o.value===current))els.fontFamily.value=current;}
async function loadSystemFonts(){if(typeof queryLocalFonts!=='function')return toast('Chrome does not expose Local Font Access here. Common system fonts still work.',true,4200);try{const fonts=await queryLocalFonts();state.fonts=[...new Set([...state.fonts,...fonts.map(f=>f.family).filter(Boolean)])];populateFonts();toast(`Loaded ${fonts.length} installed font faces.`);}catch(error){toast('Font access was not granted. You can still use the common font list.',true,4200)}}

function parseTimestamp(value){const parts=String(value).trim().replace(',', '.').split(':').map(Number);if(parts.some(n=>!Number.isFinite(n)))return 0;return parts.length===3?parts[0]*3600+parts[1]*60+parts[2]:parts.length===2?parts[0]*60+parts[1]:parts[0];}
function parseCaptions(text){const blocks=String(text).replace(/\r/g,'').trim().split(/\n{2,}/),cues=[];for(const block of blocks){const lines=block.split('\n').filter(Boolean);const ti=lines.findIndex(line=>line.includes('-->'));if(ti<0)continue;const [a,b]=lines[ti].split('-->').map(v=>parseTimestamp(v.trim().split(/\s+/)[0]));const body=lines.slice(ti+1).join(' ').replace(/<[^>]+>/g,'').trim();if(body)cues.push({id:uuid(),start:a,end:Math.max(a+.05,b),text:body});}return cues;}
function srtTime(value){const ms=Math.max(0,Math.round(value*1000)),h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000),r=ms%1000;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(r).padStart(3,'0')}`;}

async function computePeaks(clip){
  if(state.waveformCache.has(clip.id))return state.waveformCache.get(clip.id);if(state.waveformPending.has(clip.id))return null;state.waveformPending.add(clip.id);
  try{const ctx=new AudioContext();const buffer=await ctx.decodeAudioData(await clip.blob.arrayBuffer());const data=buffer.getChannelData(0),count=500,peaks=new Float32Array(count),step=Math.max(1,Math.floor(data.length/count));for(let i=0;i<count;i++){let p=0;for(let j=i*step;j<Math.min(data.length,(i+1)*step);j+=Math.max(1,Math.floor(step/32)))p=Math.max(p,Math.abs(data[j]));peaks[i]=p}state.waveformCache.set(clip.id,peaks);ctx.close();return peaks}catch(_){state.waveformCache.set(clip.id,new Float32Array(1));return state.waveformCache.get(clip.id)}finally{state.waveformPending.delete(clip.id);drawWaveform()}
}
function drawWaveform(){
  const r=els.waveform.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);if(!r.width||!r.height)return;els.waveform.width=Math.round(r.width*dpr);els.waveform.height=Math.round(r.height*dpr);const ctx=els.waveform.getContext('2d'),w=els.waveform.width,h=els.waveform.height;ctx.clearRect(0,0,w,h);ctx.strokeStyle='#5965a8';ctx.lineWidth=Math.max(1,dpr);const total=totalDuration();if(!total)return;const layout=sequenceLayout();for(const item of layout){const peaks=state.waveformCache.get(item.clip?.id);if(!peaks){item.clip&&computePeaks(item.clip);continue}const x0=item.start/total*w,x1=item.end/total*w,mid=h/2;ctx.beginPath();for(let x=Math.floor(x0);x<x1;x+=Math.max(1,Math.floor(2*dpr))){const frac=(x-x0)/Math.max(1,x1-x0),sourceFrac=(item.segment.in+(item.segment.out-item.segment.in)*frac)/Math.max(.001,fallbackDuration(item.clip)),idx=clamp(Math.floor(sourceFrac*(peaks.length-1)),0,peaks.length-1),amp=(peaks[idx]||0)*h*.43;ctx.moveTo(x,mid-amp);ctx.lineTo(x,mid+amp)}ctx.stroke();}
}

function renderAll(){renderFolders();renderLibrary();updateBulkBar();renderTimeline();syncInspector();populateFonts();}

function aspectDims(){return state.project.aspect==='9:16'?[1080,1920]:state.project.aspect==='1:1'?[1080,1080]:[1920,1080];}
async function exportSequence(){
  if(state.exporting||!state.project.segments.length)return;state.exporting=true;els.export.disabled=true;els.exportStatus.textContent='Rendering locally…';pauseSequence(false);await ensureAudioGraph();await state.audioContext.resume();const [w,h]=aspectDims(),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{alpha:false}),canvasStream=canvas.captureStream(30);state.exportGain.gain.value=0;const out=new MediaStream([...canvasStream.getVideoTracks(),...state.exportDest.stream.getAudioTracks()]);const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t))||'';const recorder=new MediaRecorder(out,mime?{mimeType:mime,videoBitsPerSecond:12000000}:undefined),chunks=[];recorder.ondataavailable=e=>e.data?.size&&chunks.push(e.data);recorder.start(1000);
  try{
    const layout=sequenceLayout();for(const item of layout){await loadLocation({...item,globalTime:item.start,localOutput:0,sourceTime:item.segment.in},true);els.source.playbackRate=item.segment.speed;await els.source.play();await new Promise((resolve,reject)=>{const step=()=>{if(!state.exporting)return reject(new Error('Export cancelled'));const sourceTime=els.source.currentTime,localOutput=(sourceTime-item.segment.in)/item.segment.speed;state.exportGain.gain.value=audioLevel(item.segment,localOutput);drawFrame(ctx,w,h,{...item,globalTime:item.start+localOutput,localOutput,sourceTime},{guides:false});if(sourceTime>=item.segment.out-.02||els.source.ended){els.source.pause();state.exportGain.gain.value=0;return resolve()}requestAnimationFrame(step)};requestAnimationFrame(step)});}
    const stopped=new Promise(resolve=>recorder.addEventListener('stop',resolve,{once:true}));recorder.stop();await stopped;const blob=new Blob(chunks,{type:recorder.mimeType||'video/webm'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`clippah-${state.project.aspect.replace(':','x')}-${Date.now()}.webm`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);els.exportStatus.textContent=`Exported ${bytes(blob.size)}`;
  }catch(error){try{recorder.stop()}catch(_){}els.exportStatus.textContent='Export failed';toast(error?.message||'Export failed.',true,5000)}finally{canvasStream.getTracks().forEach(t=>t.stop());state.exportGain.gain.value=0;state.exporting=false;els.export.disabled=false;await seekGlobal(state.globalTime,true)}
}

function frameDataUrl(){return els.preview.toDataURL('image/png');}
async function handleAgent(command,params={}){
  if(command==='studio_status')return{ok:true,globalTime:state.globalTime,duration:totalDuration(),tool:state.tool,aspect:state.project.aspect,fill:state.project.fill,selectedSegmentId:state.selectedSegmentId,selectedTextId:state.selectedTextId,segments:sequenceLayout().map(x=>({id:x.segment.id,clipId:x.segment.clipId,title:x.clip?.meta?.title||'Clip',start:x.start,end:x.end,duration:x.duration,in:x.segment.in,out:x.segment.out,speed:x.segment.speed,volume:x.segment.volume,videoFadeIn:x.segment.videoFadeIn,videoFadeOut:x.segment.videoFadeOut,audioFadeIn:x.segment.audioFadeIn,audioFadeOut:x.segment.audioFadeOut,motion:x.segment.motion,texts:x.segment.texts,captions:x.segment.captions.length}))};
  if(command==='studio_seek'){await seekGlobal(Number(params.time)||0,true);return{ok:true,time:state.globalTime}};
  if(command==='studio_set_aspect'){if(!['16:9','9:16','1:1'].includes(params.aspect))return{ok:false,error:'Invalid aspect'};state.project.aspect=params.aspect;saveProject();syncInspector();resizePreview();return{ok:true,aspect:state.project.aspect}};
  if(command==='studio_set_fill'){if(!['crop','blur','mirror','fit'].includes(params.fill))return{ok:false,error:'Invalid fill'};state.project.fill=params.fill;saveProject();syncInspector();draw();return{ok:true,fill:state.project.fill}};
  if(command==='studio_select_segment'){if(!segmentById(params.segmentId))return{ok:false,error:'Unknown segment'};await selectSegment(params.segmentId,!!params.seek);return{ok:true}};
  if(command==='studio_insert_clip'){if(!clipById(params.clipId))return{ok:false,error:'Unknown clip'};await insertClip(params.clipId,Number.isInteger(params.index)?params.index:state.project.segments.length);return{ok:true,segmentId:state.selectedSegmentId}};
  if(command==='studio_move_segment'){const from=state.project.segments.findIndex(s=>s.id===params.segmentId);if(from<0)return{ok:false,error:'Unknown segment'};reorderSegment(params.segmentId,Number(params.index)||0);return{ok:true}};
  if(command==='studio_split'){const id=params.segmentId||state.selectedSegmentId;if(!id)return{ok:false,error:'No segment selected'};let sourceTime=params.sourceTime;if(sourceTime==null&&params.time!=null){const loc=globalToLocation(Number(params.time));if(!loc||loc.segment.id!==id)return{ok:false,error:'Global time is outside segment'};sourceTime=loc.sourceTime}return{ok:splitSegment(id,sourceTime)}};
  if(command==='studio_delete_segment'){removeSegment(params.segmentId||state.selectedSegmentId);return{ok:true}};
  if(command==='studio_set_segment'){const segment=segmentById(params.segmentId||state.selectedSegmentId);if(!segment)return{ok:false,error:'No segment selected'};for(const key of ['speed','volume','videoFadeIn','videoFadeOut','audioFadeIn','audioFadeOut'])if(params[key]!=null)segment[key]=Number(params[key]);segment.speed=clamp(segment.speed,.25,3);segment.volume=clamp(segment.volume,0,2);for(const key of ['videoFadeIn','videoFadeOut','audioFadeIn','audioFadeOut'])segment[key]=Math.max(0,segment[key]||0);saveProject();renderTimeline();syncInspector();return{ok:true,segment}};
  if(command==='studio_set_viewport'||command==='studio_move_viewport'||command==='studio_add_keyframe'){if(params.time!=null)await seekGlobal(Number(params.time),true);const loc=globalToLocation();if(!loc)return{ok:false,error:'No active segment'};let current=segmentMotionAt(loc.segment,loc.sourceTime);if(command==='studio_set_viewport')current={x:clamp(Number(params.x),0,1),y:clamp(Number(params.y),0,1),zoom:clamp(Number(params.zoom??current.zoom),1,3)};if(command==='studio_move_viewport'){const [w,h]=aspectDims();current={x:clamp(current.x+(Number(params.dx)||0)/Math.max(1,w),0,1),y:clamp(current.y+(Number(params.dy)||0)/Math.max(1,h),0,1),zoom:clamp(Number(params.zoom??current.zoom),1,3)}};upsertKeyframe(loc.segment,loc.sourceTime,current);draw();return{ok:true,time:state.globalTime,sourceTime:loc.sourceTime,viewport:current}};
  if(command==='studio_clear_motion'){clearMotion();return{ok:true}};
  if(command==='studio_add_text'){if(params.time!=null)await seekGlobal(Number(params.time),true);addTextLayer();const text=selectedText();if(params.text)updateText({text:String(params.text)});return{ok:true,text:selectedText()}};
  if(command==='studio_update_text'){const segment=segmentById(params.segmentId||state.selectedSegmentId);if(!segment)return{ok:false,error:'Unknown segment'};const text=segment.texts.find(t=>t.id===params.textId);if(!text)return{ok:false,error:'Unknown text'};Object.assign(text,params.patch||{});saveProject();renderTimeline();draw();return{ok:true,text}};
  if(command==='studio_delete_text'){const segment=segmentById(params.segmentId||state.selectedSegmentId);if(!segment)return{ok:false,error:'Unknown segment'};segment.texts=segment.texts.filter(t=>t.id!==params.textId);if(state.selectedTextId===params.textId)state.selectedTextId=null;saveProject();renderTimeline();draw();return{ok:true}};
  if(command==='studio_set_captions'){const segment=segmentById(params.segmentId||state.selectedSegmentId);if(!segment)return{ok:false,error:'Unknown segment'};segment.captions=(params.cues||[]).map(c=>({id:c.id||uuid(),start:Number(c.start)||0,end:Number(c.end)||0,text:String(c.text||'')}));state.project.captionsEnabled=true;saveProject();renderTimeline();syncInspector();draw();return{ok:true,count:segment.captions.length}};
  if(command==='studio_get_captions'){const segment=segmentById(params.segmentId||state.selectedSegmentId);return segment?{ok:true,cues:segment.captions}:{ok:false,error:'Unknown segment'}};
  if(command==='studio_get_frame'||command==='studio_get_frames'){
    const times=command==='studio_get_frame'?[params.time??state.globalTime]:(params.times||[]).slice(0,8),frames=[];const restore=state.globalTime;for(const time of times){await seekGlobal(Number(time)||0,true);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));draw();const loc=globalToLocation();frames.push({time:state.globalTime,sourceTime:loc?.sourceTime,segmentId:loc?.segment.id,output:{aspect:state.project.aspect,width:els.preview.width,height:els.preview.height},viewport:loc?segmentMotionAt(loc.segment,loc.sourceTime):null,dataUrl:frameDataUrl()})}await seekGlobal(restore,true);return command==='studio_get_frame'?{ok:true,...frames[0]}:{ok:true,frames};
  }
  if(command==='studio_export'){exportSequence();return{ok:true,started:true}};
  return{ok:false,error:`Unknown Studio command: ${command}`};
}


/* CLIPPAH_V05_OVERRIDE */
Object.assign(els,{
  librarySearch:$('#library-search'),libraryNewFolder:$('#library-new-folder'),libraryContextMenu:$('#library-context-menu'),
  addEmoji:$('#add-emoji'),addImage:$('#add-image'),newEmoji:$('#new-emoji'),newImage:$('#new-image'),
  motionMode:$('#motion-mode'),motionModeHelp:$('#motion-mode-help'),
  overlayKind:$('#overlay-kind'),emojiQuick:$('#emoji-quick'),textFontSection:$('#text-font-section'),imageSection:$('#image-section'),
  changeImage:$('#change-image'),overlayImageFile:$('#overlay-image-file'),overlayOpacity:$('#overlay-opacity'),overlayScale:$('#overlay-scale'),
  overlayRotation:$('#overlay-rotation'),overlayZ:$('#overlay-z'),objectMotionMode:$('#object-motion-mode'),
  objectKeyframeCount:$('#object-keyframe-count'),objectKeyframeList:$('#object-keyframe-list'),addObjectKeyframe:$('#add-object-keyframe'),
  removeObjectKeyframe:$('#remove-object-keyframe'),clearObjectMotion:$('#clear-object-motion')
});
Object.assign(state,{
  librarySearchText:'',activeFolderId:null,expandedFolders:new Set(),libraryContext:null,
  overlayImages:new Map(),overlayBounds:new Map(),overlayDrag:false,overlayDragStart:null,overlayTransformStart:null,
  fadeDrag:null
});

function normalizeTransform(value, fallback){
  fallback=fallback||{x:.5,y:.5,zoom:1};
  return{
    x:clamp(Number(value&&value.x!=null?value.x:fallback.x),0,1),
    y:clamp(Number(value&&value.y!=null?value.y:fallback.y),0,1),
    zoom:clamp(Number(value&&value.zoom!=null?value.zoom:fallback.zoom),1,3)
  };
}
function normalizeOverlayTransform(value,fallback){
  fallback=fallback||{x:.5,y:.82,scale:1,rotation:0,opacity:1};
  return{
    x:clamp(Number(value&&value.x!=null?value.x:fallback.x),0,1),
    y:clamp(Number(value&&value.y!=null?value.y:fallback.y),0,1),
    scale:clamp(Number(value&&value.scale!=null?value.scale:fallback.scale),.1,8),
    rotation:Number(value&&value.rotation!=null?value.rotation:fallback.rotation)||0,
    opacity:clamp(Number(value&&value.opacity!=null?value.opacity:fallback.opacity),0,1)
  };
}
function normalizeOverlay(item,segment){
  const base=normalizeOverlayTransform(item&&item.baseTransform,{
    x:item&&item.x!=null?item.x:.5,y:item&&item.y!=null?item.y:.82,
    scale:item&&item.scale!=null?item.scale:1,rotation:item&&item.rotation!=null?item.rotation:0,opacity:item&&item.opacity!=null?item.opacity:1
  });
  const kind=['text','emoji','image'].includes(item&&item.kind)?item.kind:'text';
  return{
    ...item,id:item&&item.id||uuid(),kind:kind,text:String(item&&item.text!=null?item.text:(kind==='emoji'?'😀':'Your text')),
    src:item&&item.src||null,start:clamp(Number(item&&item.start)||segment.in,segment.in,segment.out),
    end:clamp(Number(item&&item.end)||segment.out,segment.in,segment.out),
    fontFamily:item&&item.fontFamily||'Arial',fontSize:clamp(Number(item&&item.fontSize)||64,12,320),
    color:item&&item.color||'#ffffff',fadeIn:Math.max(0,Number(item&&item.fadeIn)||0),fadeOut:Math.max(0,Number(item&&item.fadeOut)||0),
    z:clamp(Number(item&&item.z)||10,0,99),baseTransform:base,motionMode:item&&item.motionMode==='animate'?'animate':'static',
    motion:Array.isArray(item&&item.motion)?item.motion.map(k=>({time:Number(k.time)||segment.in,...normalizeOverlayTransform(k,base)})).sort((a,b)=>a.time-b.time):[]
  };
}
function makeSegment(clip){
  const duration=fallbackDuration(clip);
  return{id:uuid(),clipId:clip.id,in:0,out:duration,speed:1,volume:1,videoFadeIn:0,videoFadeOut:0,audioFadeIn:0,audioFadeOut:0,
    baseTransform:{x:.5,y:.5,zoom:1},motion:[],texts:[],captions:defaultCaptionsForClip(clip)};
}
function sanitizeSegment(segment){
  const clip=clipById(segment.clipId),max=fallbackDuration(clip);
  const out={
    id:segment.id||uuid(),clipId:segment.clipId,
    in:clamp(Number(segment.in)||0,0,max),out:clamp(Number(segment.out)||max,.01,max),
    speed:clamp(Number(segment.speed)||1,.25,3),volume:clamp(Number(segment.volume)||1,0,2),
    videoFadeIn:Math.max(0,Number(segment.videoFadeIn)||0),videoFadeOut:Math.max(0,Number(segment.videoFadeOut)||0),
    audioFadeIn:Math.max(0,Number(segment.audioFadeIn)||0),audioFadeOut:Math.max(0,Number(segment.audioFadeOut)||0),
    baseTransform:normalizeTransform(segment.baseTransform||((segment.motion&&segment.motion[0])||{x:.5,y:.5,zoom:1})),
    motion:Array.isArray(segment.motion)?segment.motion.map(k=>({time:Number(k.time)||0,...normalizeTransform(k)})).sort((a,b)=>a.time-b.time):[],
    texts:[],captions:Array.isArray(segment.captions)?segment.captions:defaultCaptionsForClip(clip)
  };
  out.texts=(Array.isArray(segment.texts)?segment.texts:[]).map(item=>normalizeOverlay(item,out));
  return out;
}
async function loadProject(){
  const stored=(await chrome.storage.local.get([PROJECT_KEY,'studio:sequence']))||{};
  if(stored[PROJECT_KEY]&&stored[PROJECT_KEY].segments){
    const raw=stored[PROJECT_KEY];
    state.project={aspect:'16:9',fill:'crop',motionMode:raw.motionMode||(raw.autoKeyframe===false?'static':'animate'),captionsEnabled:false,captionSize:1,...raw};
    state.project.motionMode=state.project.motionMode==='static'?'static':'animate';
    state.project.segments=state.project.segments.filter(s=>clipById(s.clipId)).map(sanitizeSegment);
    return;
  }
  const old=stored['studio:sequence'];
  state.project={aspect:'16:9',fill:'crop',motionMode:'animate',captionsEnabled:false,captionSize:1,segments:[]};
  if(Array.isArray(old))state.project.segments=old.map(clipById).filter(Boolean).map(makeSegment);
}

function setTool(tool){
  state.tool=tool;
  els.toolSelect.classList.toggle('active',tool==='select');
  els.toolCut.classList.toggle('active',tool==='cut');
  if(els.preview)els.preview.style.cursor=tool==='cut'?'crosshair':tool==='text'?'move':'grab';
}

function folderById(id){return state.folders.find(f=>f.id===id)||null}
function folderChildren(parentId){return state.folders.filter(f=>(f.parentId||null)===(parentId||null)).sort((a,b)=>String(a.name).localeCompare(String(b.name)))}
function clipsInFolder(folderId){return state.clips.filter(c=>(c.folderId||null)===(folderId||null))}
function folderPath(id){
  const names=[];let current=folderById(id),guard=0;
  while(current&&guard++<20){names.unshift(current.name);current=folderById(current.parentId)}
  return names.join(' / ');
}
function folderContains(folderId,targetId){
  if(!folderId||!targetId)return false;
  let cur=folderById(targetId),guard=0;
  while(cur&&guard++<30){if(cur.parentId===folderId)return true;cur=folderById(cur.parentId)}
  return false;
}
async function createLibraryFolder(name,parentId){
  name=String(name||'').trim();if(!name)return null;
  const folder={id:uuid(),name:name,parentId:parentId||null,createdAt:Date.now()};
  await putRecord('folders',folder);state.expandedFolders.add(parentId||'root');state.expandedFolders.add(folder.id);
  await refreshLibrary(false);return folder;
}
async function moveFolderParent(folderId,parentId){
  if(folderId===parentId||folderContains(folderId,parentId))return toast('A folder cannot be moved inside itself.',true);
  const folder=folderById(folderId);if(!folder)return;
  await putRecord('folders',{...folder,parentId:parentId||null});await refreshLibrary(false);
}
async function deleteLibraryFolder(folderId){
  const folder=folderById(folderId);if(!folder)return;
  const parent=folder.parentId||null;
  for(const child of folderChildren(folderId))await putRecord('folders',{...child,parentId:parent});
  await moveClipsToFolder(clipsInFolder(folderId).map(c=>c.id),parent);
  await deleteRecord('folders',folderId);state.expandedFolders.delete(folderId);await refreshLibrary(false);
}
function renderFolders(){
  if(els.folderFilter){
    els.folderFilter.innerHTML='<option value="all">All clips</option><option value="none">Unfiled</option>'+state.folders.map(f=>'<option value="'+esc(f.id)+'">'+esc(folderPath(f.id)||f.name)+'</option>').join('');
  }
  if(els.moveFolder){
    els.moveFolder.innerHTML='<option value="">Move to folder…</option><option value="none">No folder</option>'+state.folders.map(f=>'<option value="'+esc(f.id)+'">'+esc(folderPath(f.id)||f.name)+'</option>').join('');
  }
}
function updateBulkBar(){if(els.bulkBar)els.bulkBar.hidden=true}

function matchingClip(clip){
  const q=String(state.librarySearchText||'').trim().toLowerCase();
  if(!q)return true;
  const folder=clip.folderId?folderPath(clip.folderId):'';
  return String(clip.meta&&clip.meta.title||'').toLowerCase().includes(q)||folder.toLowerCase().includes(q);
}
function subtreeHasMatch(folderId){
  if(clipsInFolder(folderId).some(matchingClip))return true;
  return folderChildren(folderId).some(f=>subtreeHasMatch(f.id));
}
function clipTreeRow(clip,depth){
  const row=document.createElement('div');row.className='tree-row tree-clip'+(state.selectedLibrary.has(clip.id)?' selected':'');row.draggable=true;row.dataset.clipId=clip.id;row.style.paddingLeft=(6+depth*16)+'px';
  row.innerHTML='<span class="tree-indent drag-grip">⋮</span><span class="tree-icon">▶</span><div class="tree-label"><strong>'+esc(clip.meta&&clip.meta.title||'Captured clip')+'</strong><div class="tree-meta">'+fmt(fallbackDuration(clip))+' · '+bytes(clip.size)+'</div></div><div class="tree-actions"><button class="tiny-add" title="Add to timeline">+</button></div>';
  row.addEventListener('dragstart',event=>{row.classList.add('dragging');event.dataTransfer.effectAllowed='copyMove';event.dataTransfer.setData('application/x-clippah-clip',clip.id);event.dataTransfer.setData('text/plain',clip.id)});
  row.addEventListener('dragend',()=>row.classList.remove('dragging'));
  row.querySelector('.tiny-add').addEventListener('click',event=>{event.stopPropagation();insertClip(clip.id,state.project.segments.length)});
  row.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey){state.selectedLibrary.has(clip.id)?state.selectedLibrary.delete(clip.id):state.selectedLibrary.add(clip.id)}else{state.selectedLibrary.clear();state.selectedLibrary.add(clip.id)}renderLibrary()});
  row.addEventListener('contextmenu',event=>{event.preventDefault();if(!state.selectedLibrary.has(clip.id)){state.selectedLibrary.clear();state.selectedLibrary.add(clip.id)}renderLibrary();openLibraryContextMenu(event.clientX,event.clientY,{type:'clip',clipId:clip.id})});
  return row;
}
function folderTreeRow(folder,depth){
  const expanded=state.expandedFolders.has(folder.id);const row=document.createElement('div');row.className='tree-row tree-folder'+(state.activeFolderId===folder.id?' selected':'');row.dataset.folderId=folder.id;row.draggable=true;row.style.paddingLeft=(6+depth*16)+'px';
  const count=clipsInFolder(folder.id).length;
  row.innerHTML='<button class="tree-caret">'+(expanded?'▾':'▸')+'</button><span class="tree-icon">'+(expanded?'📂':'📁')+'</span><div class="tree-label">'+esc(folder.name)+'<div class="tree-meta">'+count+' clip'+(count===1?'':'s')+'</div></div><div></div>';
  row.querySelector('.tree-caret').addEventListener('click',event=>{event.stopPropagation();expanded?state.expandedFolders.delete(folder.id):state.expandedFolders.add(folder.id);renderLibrary()});
  row.addEventListener('click',()=>{state.activeFolderId=folder.id;if(!state.expandedFolders.has(folder.id))state.expandedFolders.add(folder.id);renderLibrary()});
  row.addEventListener('contextmenu',event=>{event.preventDefault();state.activeFolderId=folder.id;renderLibrary();openLibraryContextMenu(event.clientX,event.clientY,{type:'folder',folderId:folder.id})});
  row.addEventListener('dragstart',event=>{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-clippah-folder',folder.id)});
  row.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('application/x-clippah-clip')||event.dataTransfer.types.includes('application/x-clippah-folder')){event.preventDefault();row.classList.add('drop-target')}});
  row.addEventListener('dragleave',()=>row.classList.remove('drop-target'));
  row.addEventListener('drop',async event=>{event.preventDefault();row.classList.remove('drop-target');const clipId=event.dataTransfer.getData('application/x-clippah-clip'),folderId=event.dataTransfer.getData('application/x-clippah-folder');if(clipId){const ids=state.selectedLibrary.has(clipId)?[...state.selectedLibrary]:[clipId];await moveClipsToFolder(ids,folder.id);state.selectedLibrary.clear();await refreshLibrary(false);toast('Moved to '+folder.name+'.')}else if(folderId)await moveFolderParent(folderId,folder.id)});
  return row;
}
function renderFolderBranch(container,parentId,depth){
  for(const folder of folderChildren(parentId)){
    if(state.librarySearchText&&!subtreeHasMatch(folder.id)&&!String(folder.name).toLowerCase().includes(String(state.librarySearchText).toLowerCase()))continue;
    container.appendChild(folderTreeRow(folder,depth));
    const expanded=state.expandedFolders.has(folder.id)||!!state.librarySearchText;
    if(expanded){
      renderFolderBranch(container,folder.id,depth+1);
      for(const clip of clipsInFolder(folder.id).filter(matchingClip))container.appendChild(clipTreeRow(clip,depth+1));
      if(!folderChildren(folder.id).length&&!clipsInFolder(folder.id).filter(matchingClip).length){const empty=document.createElement('div');empty.className='tree-empty';empty.style.paddingLeft=(48+depth*16)+'px';empty.textContent='Empty folder';container.appendChild(empty)}
    }
  }
}
function renderLibrary(){
  if(!els.clipList)return;els.clipList.innerHTML='';
  const root=document.createElement('div');root.className='tree-row tree-root'+(state.activeFolderId===null?' selected':'');root.innerHTML='<button class="tree-caret">▾</button><span class="tree-icon">🗂</span><div class="tree-label">All media<div class="tree-meta">'+state.clips.length+' local clips</div></div><div></div>';
  root.addEventListener('click',()=>{state.activeFolderId=null;renderLibrary()});
  root.addEventListener('contextmenu',event=>{event.preventDefault();openLibraryContextMenu(event.clientX,event.clientY,{type:'root'})});
  root.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('application/x-clippah-clip')||event.dataTransfer.types.includes('application/x-clippah-folder')){event.preventDefault();root.classList.add('drop-target')}});
  root.addEventListener('dragleave',()=>root.classList.remove('drop-target'));
  root.addEventListener('drop',async event=>{event.preventDefault();root.classList.remove('drop-target');const clipId=event.dataTransfer.getData('application/x-clippah-clip'),folderId=event.dataTransfer.getData('application/x-clippah-folder');if(clipId){const ids=state.selectedLibrary.has(clipId)?[...state.selectedLibrary]:[clipId];await moveClipsToFolder(ids,null);state.selectedLibrary.clear();await refreshLibrary(false)}else if(folderId)await moveFolderParent(folderId,null)});
  els.clipList.appendChild(root);
  renderFolderBranch(els.clipList,null,0);
  for(const clip of clipsInFolder(null).filter(matchingClip))els.clipList.appendChild(clipTreeRow(clip,0));
  if(!state.clips.length){const e=document.createElement('div');e.className='empty-inspector';e.textContent='No captured clips yet.';els.clipList.appendChild(e)}
}
function closeLibraryContextMenu(){if(els.libraryContextMenu)els.libraryContextMenu.hidden=true;state.libraryContext=null}
function showFolderMoveMenu(ids){
  const menu=els.libraryContextMenu;menu.innerHTML='<div class="menu-title">MOVE TO</div>';
  const root=document.createElement('button');root.textContent='⌂ Unfiled / root';root.onclick=async()=>{await moveClipsToFolder(ids,null);closeLibraryContextMenu();state.selectedLibrary.clear();await refreshLibrary(false)};menu.appendChild(root);
  for(const folder of state.folders.sort((a,b)=>folderPath(a.id).localeCompare(folderPath(b.id)))){const b=document.createElement('button');b.className='indented';b.textContent='📁 '+folderPath(folder.id);b.onclick=async()=>{await moveClipsToFolder(ids,folder.id);closeLibraryContextMenu();state.selectedLibrary.clear();await refreshLibrary(false)};menu.appendChild(b)}
}
function openLibraryContextMenu(x,y,ctx){
  state.libraryContext=ctx;const menu=els.libraryContextMenu;if(!menu)return;menu.innerHTML='';
  if(ctx.type==='clip'){
    const ids=state.selectedLibrary.size?[...state.selectedLibrary]:[ctx.clipId];
    const title=document.createElement('div');title.className='menu-title';title.textContent=ids.length+' CLIP'+(ids.length===1?'':'S');menu.appendChild(title);
    const add=document.createElement('button');add.textContent='＋ Add to end of timeline';add.onclick=()=>{ids.forEach(id=>insertClip(id,state.project.segments.length));closeLibraryContextMenu()};menu.appendChild(add);
    const move=document.createElement('button');move.textContent='↪ Move to…';move.onclick=()=>showFolderMoveMenu(ids);menu.appendChild(move);
  }else{
    const parentId=ctx.type==='folder'?ctx.folderId:null;
    const title=document.createElement('div');title.className='menu-title';title.textContent=ctx.type==='folder'?'FOLDER':'LIBRARY';menu.appendChild(title);
    const sub=document.createElement('button');sub.textContent='＋ New folder here';sub.onclick=async()=>{const name=prompt('Folder name');if(name)await createLibraryFolder(name,parentId);closeLibraryContextMenu()};menu.appendChild(sub);
    if(ctx.type==='folder'){
      const rename=document.createElement('button');rename.textContent='✎ Rename';rename.onclick=async()=>{const f=folderById(ctx.folderId),name=prompt('Rename folder',f&&f.name||'');if(name&&f){await putRecord('folders',{...f,name:name.trim()});await refreshLibrary(false)}closeLibraryContextMenu()};menu.appendChild(rename);
      const del=document.createElement('button');del.className='danger-text';del.textContent='Delete folder';del.onclick=async()=>{if(confirm('Delete this folder? Its clips and subfolders will move one level up.'))await deleteLibraryFolder(ctx.folderId);closeLibraryContextMenu()};menu.appendChild(del);
    }
  }
  menu.style.left=Math.min(x,innerWidth-230)+'px';menu.style.top=Math.min(y,innerHeight-300)+'px';menu.hidden=false;
}

function segmentMotionAt(segment,sourceTime){
  if(segment.__previewTransform)return segment.__previewTransform;
  const base=normalizeTransform(segment.baseTransform||{x:.5,y:.5,zoom:1});
  const frames=[...(segment.motion||[])].sort((a,b)=>a.time-b.time);
  if(!frames.length)return base;
  if(sourceTime<=frames[0].time)return normalizeTransform(frames[0],base);
  if(sourceTime>=frames[frames.length-1].time)return normalizeTransform(frames[frames.length-1],base);
  for(let i=0;i<frames.length-1;i++){const a=frames[i],b=frames[i+1];if(sourceTime<a.time||sourceTime>b.time)continue;let t=(sourceTime-a.time)/Math.max(.0001,b.time-a.time);t=t*t*(3-2*t);return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,zoom:a.zoom+(b.zoom-a.zoom)*t}}
  return base;
}
function upsertKeyframe(segment,sourceTime,transform){
  sourceTime=clamp(sourceTime,segment.in,segment.out);transform=normalizeTransform(transform,segment.baseTransform);
  if(!segment.motion.length&&sourceTime>segment.in+.05)segment.motion.push({time:segment.in,...normalizeTransform(segment.baseTransform)});
  const existing=segment.motion.find(k=>Math.abs(k.time-sourceTime)<.06);
  if(existing)Object.assign(existing,{time:sourceTime,...transform});else segment.motion.push({time:sourceTime,...transform});
  segment.motion.sort((a,b)=>a.time-b.time);saveProject();renderKeyframes();renderTimeline();
}
function applyStaticViewport(segment,sourceTime,next){
  next=normalizeTransform(next);const current=segmentMotionAt(segment,sourceTime),dx=next.x-current.x,dy=next.y-current.y,ratio=next.zoom/Math.max(.001,current.zoom);
  const adjust=t=>({x:clamp(t.x+dx,0,1),y:clamp(t.y+dy,0,1),zoom:clamp(t.zoom*ratio,1,3)});
  segment.baseTransform=adjust(normalizeTransform(segment.baseTransform));
  segment.motion=(segment.motion||[]).map(k=>({time:k.time,...adjust(normalizeTransform(k))}));
  saveProject();renderKeyframes();renderTimeline();
}
function commitViewport(transform){
  const loc=globalToLocation();if(!loc)return;delete loc.segment.__previewTransform;
  if(state.project.motionMode==='animate')upsertKeyframe(loc.segment,loc.sourceTime,transform);else applyStaticViewport(loc.segment,loc.sourceTime,transform);
  draw();syncInspector();
}
function clearMotion(){const segment=selectedSegment(),loc=globalToLocation();if(!segment)return;segment.baseTransform=loc&&loc.segment.id===segment.id?segmentMotionAt(segment,loc.sourceTime):normalizeTransform(segment.baseTransform);segment.motion=[];saveProject();renderKeyframes();renderTimeline();draw();syncInspector()}

function overlayTransformAt(item,sourceTime){
  if(item.__previewTransform)return item.__previewTransform;
  const base=normalizeOverlayTransform(item.baseTransform);
  const frames=[...(item.motion||[])].sort((a,b)=>a.time-b.time);
  if(!frames.length)return base;
  if(sourceTime<=frames[0].time)return normalizeOverlayTransform(frames[0],base);
  if(sourceTime>=frames[frames.length-1].time)return normalizeOverlayTransform(frames[frames.length-1],base);
  for(let i=0;i<frames.length-1;i++){const a=frames[i],b=frames[i+1];if(sourceTime<a.time||sourceTime>b.time)continue;let t=(sourceTime-a.time)/Math.max(.0001,b.time-a.time);t=t*t*(3-2*t);return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,scale:a.scale+(b.scale-a.scale)*t,rotation:a.rotation+(b.rotation-a.rotation)*t,opacity:a.opacity+(b.opacity-a.opacity)*t}}
  return base;
}
function upsertOverlayKeyframe(item,sourceTime,transform){
  transform=normalizeOverlayTransform(transform,item.baseTransform);sourceTime=clamp(sourceTime,item.start,item.end);
  if(!item.motion.length&&sourceTime>item.start+.05)item.motion.push({time:item.start,...normalizeOverlayTransform(item.baseTransform)});
  const existing=item.motion.find(k=>Math.abs(k.time-sourceTime)<.06);
  if(existing)Object.assign(existing,{time:sourceTime,...transform});else item.motion.push({time:sourceTime,...transform});
  item.motion.sort((a,b)=>a.time-b.time);saveProject();renderTimeline();renderObjectKeyframes();
}
function applyStaticOverlay(item,sourceTime,next){
  next=normalizeOverlayTransform(next,item.baseTransform);const current=overlayTransformAt(item,sourceTime),dx=next.x-current.x,dy=next.y-current.y,ratio=next.scale/Math.max(.001,current.scale),dr=next.rotation-current.rotation,op=next.opacity/Math.max(.001,current.opacity||1);
  const adjust=t=>({x:clamp(t.x+dx,0,1),y:clamp(t.y+dy,0,1),scale:clamp(t.scale*ratio,.1,8),rotation:t.rotation+dr,opacity:clamp(t.opacity*op,0,1)});
  item.baseTransform=adjust(normalizeOverlayTransform(item.baseTransform));item.motion=(item.motion||[]).map(k=>({time:k.time,...adjust(normalizeOverlayTransform(k))}));saveProject();renderTimeline();
}
function commitOverlayTransform(item,sourceTime,transform){
  delete item.__previewTransform;if(item.motionMode==='animate')upsertOverlayKeyframe(item,sourceTime,transform);else applyStaticOverlay(item,sourceTime,transform);
  syncTextInspector();draw();
}
function selectedText(){const segment=selectedSegment();return segment&&segment.texts&&segment.texts.find(t=>t.id===state.selectedTextId)||null}
function addOverlayLayer(kind,options){
  const loc=globalToLocation();if(!loc)return toast('Add a clip to the timeline first.',true);
  state.selectedSegmentId=loc.segment.id;const base={x:.5,y:kind==='text'?.82:.5,scale:1,rotation:0,opacity:1};
  const item=normalizeOverlay({id:uuid(),kind:kind,text:kind==='emoji'?'😀':'Your text',src:options&&options.src||null,start:loc.sourceTime,end:Math.min(loc.segment.out,loc.sourceTime+5*loc.segment.speed),fontFamily:kind==='emoji'?'Segoe UI Emoji':'Arial',fontSize:kind==='emoji'?110:64,color:'#ffffff',fadeIn:.2,fadeOut:.2,z:10,baseTransform:base,motionMode:'static',motion:[]},loc.segment);
  if(item.end<=item.start+.05)item.end=Math.min(loc.segment.out,item.start+.5);loc.segment.texts.push(item);state.selectedTextId=item.id;setTool('text');switchPanel('text');saveProject();renderTimeline();syncTextInspector();draw();return item;
}
function addTextLayer(){return addOverlayLayer('text')}
function addEmojiLayer(){return addOverlayLayer('emoji')}
function addImageLayer(){if(els.overlayImageFile){els.overlayImageFile.dataset.create='1';els.overlayImageFile.value='';els.overlayImageFile.click()}}
async function overlayFileChosen(file,replace){
  if(!file)return;if(file.size>8*1024*1024)return toast('Keep overlay images below 8 MB for a local browser project.',true,4500);
  const src=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});
  if(replace&&selectedText()){updateText({kind:'image',src:src,text:file.name});return}
  const item=addOverlayLayer('image',{src:src});if(item)item.text=file.name;saveProject();syncTextInspector();draw();
}
function overlayFadeOpacity(item,sourceTime){
  let o=1;if(item.fadeIn>0)o=Math.min(o,clamp((sourceTime-item.start)/item.fadeIn,0,1));if(item.fadeOut>0)o=Math.min(o,clamp((item.end-sourceTime)/item.fadeOut,0,1));return o;
}
function getOverlayImage(item){
  if(!item.src)return null;const cached=state.overlayImages.get(item.id);if(cached&&cached.src===item.src)return cached.img;
  const img=new Image();state.overlayImages.set(item.id,{src:item.src,img:img});img.onload=()=>draw();img.src=item.src;return img;
}
function drawText(ctx,item,w,h,sourceTime,selected){
  if(sourceTime<item.start||sourceTime>item.end)return;
  const t=overlayTransformAt(item,sourceTime),alpha=overlayFadeOpacity(item,sourceTime)*t.opacity;if(alpha<=0)return;
  ctx.save();ctx.globalAlpha*=alpha;const x=t.x*w,y=t.y*h;ctx.translate(x,y);ctx.rotate(t.rotation*Math.PI/180);
  let bw=120,bh=60;
  if(item.kind==='image'){
    const img=getOverlayImage(item);const ratio=img&&img.naturalWidth&&img.naturalHeight?img.naturalWidth/img.naturalHeight:1.5;bw=w*.28*t.scale;bh=bw/ratio;if(img&&img.complete&&img.naturalWidth)ctx.drawImage(img,-bw/2,-bh/2,bw,bh);else{ctx.fillStyle='rgba(100,110,130,.35)';ctx.fillRect(-bw/2,-bh/2,bw,bh);ctx.fillStyle='#d7dbe2';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=Math.max(16,w*.014)+'px Arial';ctx.fillText('Image',0,0)}
  }else{
    const size=Math.max(12,Math.round((Number(item.fontSize)||64)*(w/1920)*t.scale));const family=item.kind==='emoji'?'"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif':(item.fontFamily||'Arial');ctx.font=(item.kind==='emoji'?'400 ':'800 ')+size+'px '+family;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=Math.max(2,size*.07);ctx.strokeStyle='rgba(0,0,0,.78)';ctx.fillStyle=item.color||'#fff';const value=item.text||(item.kind==='emoji'?'😀':'Text');if(item.kind!=='emoji')ctx.strokeText(value,0,0);ctx.fillText(value,0,0);const m=ctx.measureText(value);bw=Math.max(40,m.width+18);bh=size*1.45;
  }
  ctx.restore();
  if(selected){
    ctx.save();ctx.translate(x,y);ctx.rotate(t.rotation*Math.PI/180);ctx.strokeStyle='#72d8f1';ctx.lineWidth=Math.max(1,w/1200);ctx.setLineDash([7,5]);ctx.strokeRect(-bw/2-7,-bh/2-7,bw+14,bh+14);ctx.restore();
  }
  state.overlayBounds.set(item.id,{x:x-bw/2-12,y:y-bh/2-12,w:bw+24,h:bh+24,z:item.z||0,segmentId:state.selectedSegmentId});
}
function overlayHit(clientX,clientY){
  const r=els.preview.getBoundingClientRect(),sx=els.preview.width/Math.max(1,r.width),sy=els.preview.height/Math.max(1,r.height),x=(clientX-r.left)*sx,y=(clientY-r.top)*sy;
  const hits=[...state.overlayBounds.entries()].filter(([,b])=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h).sort((a,b)=>(b[1].z||0)-(a[1].z||0));return hits[0]&&hits[0][0]||null;
}
function renderObjectKeyframes(){
  const item=selectedText();if(!els.objectKeyframeList)return;els.objectKeyframeList.innerHTML='';els.objectKeyframeCount.textContent=String(item&&item.motion?item.motion.length:0);
  if(!item)return;const segment=selectedSegment();for(const k of item.motion||[]){const b=document.createElement('button');b.className='keyframe-chip';b.textContent=fmt(k.time-segment.in);b.onclick=()=>seekGlobal(sourceToGlobal(segment,k.time),true);els.objectKeyframeList.appendChild(b)}
}
function removeNearestObjectKeyframe(){
  const item=selectedText(),loc=globalToLocation();if(!item||!loc||!item.motion.length)return;let best=0,delta=Infinity;item.motion.forEach((k,i)=>{const d=Math.abs(k.time-loc.sourceTime);if(d<delta){delta=d;best=i}});item.motion.splice(best,1);saveProject();renderObjectKeyframes();renderTimeline();draw()
}
function clearObjectMotion(){
  const item=selectedText(),loc=globalToLocation();if(!item)return;if(loc)item.baseTransform=overlayTransformAt(item,loc.sourceTime);item.motion=[];saveProject();renderObjectKeyframes();renderTimeline();draw();syncTextInspector()
}
function syncTextInspector(){
  const item=selectedText();els.noText.hidden=!!item;els.textControls.hidden=!item;if(!item)return;
  const kind=item.kind||'text';if(els.overlayKind)els.overlayKind.textContent=kind==='emoji'?'Emoji':kind==='image'?'Image / sticker':'Text';
  els.textContent.value=item.text||'';els.textContent.disabled=kind==='image';if(els.emojiQuick)els.emojiQuick.hidden=kind!=='emoji';if(els.textFontSection)els.textFontSection.hidden=kind!=='text';if(els.imageSection)els.imageSection.hidden=kind!=='image';
  if(kind==='text'){els.fontFamily.value=[...els.fontFamily.options].some(o=>o.value===item.fontFamily)?item.fontFamily:'Arial'}
  els.fontSize.value=item.fontSize||64;els.fontColor.value=item.color||'#ffffff';const t=overlayTransformAt(item,globalToLocation()&&globalToLocation().sourceTime||item.start);
  if(els.overlayScale)els.overlayScale.value=t.scale;if(els.overlayRotation)els.overlayRotation.value=t.rotation;if(els.overlayOpacity)els.overlayOpacity.value=t.opacity;if(els.overlayZ)els.overlayZ.value=item.z||10;
  els.textStart.value=Number(item.start).toFixed(2);els.textEnd.value=Number(item.end).toFixed(2);els.textFadeIn.value=item.fadeIn||0;els.textFadeOut.value=item.fadeOut||0;
  if(els.objectMotionMode)els.objectMotionMode.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.mode===(item.motionMode||'static')));renderObjectKeyframes()
}
function updateText(patch){
  const item=selectedText(),segment=selectedSegment();if(!item||!segment)return;
  Object.assign(item,patch);item.start=clamp(Number(item.start)||segment.in,segment.in,segment.out);item.end=clamp(Number(item.end)||segment.out,item.start+.01,segment.out);item.z=clamp(Number(item.z)||10,0,99);
  saveProject();renderTimeline();syncTextInspector();draw()
}
function deleteTextLayer(){const segment=selectedSegment();if(!segment||!state.selectedTextId)return;segment.texts=segment.texts.filter(t=>t.id!==state.selectedTextId);state.selectedTextId=null;saveProject();renderTimeline();syncTextInspector();setTool('select');draw()}

function startFadeDrag(event,segment,key,element,duration){
  event.preventDefault();event.stopPropagation();state.fadeDrag={segment:segment,key:key,element:element,duration:duration};document.addEventListener('pointermove',fadeDragMove);document.addEventListener('pointerup',fadeDragEnd,{once:true});fadeDragMove(event)
}
function fadeDragMove(event){
  const d=state.fadeDrag;if(!d)return;const r=d.element.getBoundingClientRect(),f=clamp((event.clientX-r.left)/Math.max(1,r.width),0,1),value=d.key.endsWith('Out')?(1-f)*d.duration:f*d.duration;d.segment[d.key]=clamp(value,0,d.duration);saveProject();renderTimeline();syncInspector();draw()
}
function fadeDragEnd(){document.removeEventListener('pointermove',fadeDragMove);state.fadeDrag=null}

function renderTimeline(){
  const layout=sequenceLayout(),total=totalDuration();els.videoTrack.innerHTML='';els.textTrack.innerHTML='';els.captionTrack.innerHTML='';if(els.audioFades)els.audioFades.innerHTML='';renderRuler();
  state.overlayBounds.clear();
  for(const item of layout){
    const segment=item.segment,dur=Math.max(.01,item.duration),left=(item.start/Math.max(.001,total))*100,width=Math.max(.3,(item.duration/Math.max(.001,total))*100);
    const block=document.createElement('div');block.className='timeline-segment'+(segment.id===state.selectedSegmentId?' selected':'');block.dataset.segmentId=segment.id;block.draggable=state.tool==='select';block.style.left=left+'%';block.style.width=width+'%';
    const fi=clamp(segment.videoFadeIn/dur*100,0,100),fo=clamp(segment.videoFadeOut/dur*100,0,100);
    block.innerHTML='<span class="fade-visual in" style="width:'+fi+'%"></span><span class="fade-visual out" style="width:'+fo+'%"></span><span class="fade-handle in video-fade-in-handle" style="left:'+fi+'%" title="Drag video fade in"></span><span class="fade-handle out video-fade-out-handle" style="left:'+(100-fo)+'%" title="Drag video fade out"></span><span class="segment-title">'+esc(item.clip&&item.clip.meta&&item.clip.meta.title||'Clip')+'</span><span class="segment-speed-badge">'+segment.speed.toFixed(2)+'×</span><span class="segment-meta">'+(item.index+1)+' · '+fmt(item.duration)+'</span><button class="segment-x" title="Remove segment">×</button>';
    block.querySelector('.video-fade-in-handle').addEventListener('pointerdown',e=>startFadeDrag(e,segment,'videoFadeIn',block,dur));block.querySelector('.video-fade-out-handle').addEventListener('pointerdown',e=>startFadeDrag(e,segment,'videoFadeOut',block,dur));
    block.addEventListener('click',event=>{event.stopPropagation();if(event.target.closest('.segment-x'))return removeSegment(segment.id);if(event.target.closest('.fade-handle'))return;if(state.tool==='cut'){const r=block.getBoundingClientRect(),fraction=clamp((event.clientX-r.left)/Math.max(1,r.width),0,1);return splitSegment(segment.id,segment.in+(segment.out-segment.in)*fraction)}selectSegment(segment.id,true)});
    block.addEventListener('contextmenu',event=>{event.preventDefault();selectSegment(segment.id,false);openContextMenu(event.clientX,event.clientY,segment.id)});
    block.addEventListener('dragstart',event=>{if(state.tool!=='select')return event.preventDefault();event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-clippah-segment',segment.id)});
    els.videoTrack.appendChild(block);

    if(els.audioFades){
      const audio=document.createElement('div');audio.className='audio-segment-ui';audio.style.left=left+'%';audio.style.width=width+'%';const afi=clamp(segment.audioFadeIn/dur*100,0,100),afo=clamp(segment.audioFadeOut/dur*100,0,100);
      audio.innerHTML='<span class="audio-volume-badge">'+Math.round(segment.volume*100)+'%</span><span class="fade-handle in audio-fade-in-handle" style="left:'+afi+'%" title="Drag audio fade in"></span><span class="fade-handle out audio-fade-out-handle" style="left:'+(100-afo)+'%" title="Drag audio fade out"></span>';
      audio.querySelector('.audio-fade-in-handle').addEventListener('pointerdown',e=>startFadeDrag(e,segment,'audioFadeIn',audio,dur));audio.querySelector('.audio-fade-out-handle').addEventListener('pointerdown',e=>startFadeDrag(e,segment,'audioFadeOut',audio,dur));els.audioFades.appendChild(audio)
    }

    for(const object of [...(segment.texts||[])].sort((a,b)=>(a.z||0)-(b.z||0))){
      const start=sourceToGlobal(segment,object.start),end=sourceToGlobal(segment,object.end),ob=document.createElement('button');ob.className='overlay-block'+(object.id===state.selectedTextId?' selected':'');ob.style.left=(start/Math.max(.001,total)*100)+'%';ob.style.width=Math.max(.35,(end-start)/Math.max(.001,total)*100)+'%';
      const icon=object.kind==='emoji'?'☺':object.kind==='image'?'▧':'T';ob.innerHTML='<span class="overlay-kind-icon">'+icon+'</span><span>'+esc(object.kind==='image'?(object.text||'Image'):(object.text||object.kind))+'</span>';ob.title=(object.kind||'text')+' overlay';
      ob.addEventListener('click',event=>{event.stopPropagation();state.selectedSegmentId=segment.id;state.selectedTextId=object.id;switchPanel('text');setTool('text');syncInspector();renderTimeline();draw()});els.textTrack.appendChild(ob)
    }
    for(const cue of segment.captions||[]){const cs=clamp(cue.start,segment.in,segment.out),ce=clamp(cue.end,segment.in,segment.out);if(ce<=cs)continue;const start=sourceToGlobal(segment,cs),end=sourceToGlobal(segment,ce),cc=document.createElement('span');cc.className='caption-block';cc.style.left=(start/Math.max(.001,total)*100)+'%';cc.style.width=Math.max(.25,(end-start)/Math.max(.001,total)*100)+'%';cc.textContent=cue.text;els.captionTrack.appendChild(cc)}
  }
  renderPlayhead();drawWaveform();syncInspector();els.duration.textContent=fmt(total);els.viewerShell.classList.toggle('empty',!layout.length);els.emptyState.hidden=!!layout.length;els.stage.hidden=!layout.length;els.projectMeta.textContent=layout.length?layout.length+' segment'+(layout.length===1?'':'s')+' · '+fmt(total)+' · local project':'Local-first browser video editor'
}

function syncInspector(){
  const segment=selectedSegment(),loc=globalToLocation();els.noSegment.hidden=!!segment;els.clipControls.hidden=!segment;els.clipIndex.textContent=segment?(state.project.segments.findIndex(s=>s.id===segment.id)+1)+'/'+state.project.segments.length:'—';
  if(segment){els.speed.value=segment.speed;els.speedValue.textContent=segment.speed.toFixed(2)+'×';els.volume.value=segment.volume;els.volumeValue.textContent=Math.round(segment.volume*100)+'%';for(const item of [[els.videoFadeIn,els.videoFadeInValue,'videoFadeIn'],[els.videoFadeOut,els.videoFadeOutValue,'videoFadeOut'],[els.audioFadeIn,els.audioFadeInValue,'audioFadeIn'],[els.audioFadeOut,els.audioFadeOutValue,'audioFadeOut']]){const input=item[0],valueEl=item[1],key=item[2];input.max=Math.max(.1,segmentDuration(segment));input.value=segment[key];valueEl.textContent=segment[key].toFixed(1)+'s'}}
  els.aspect.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.aspect===state.project.aspect));els.fill.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.fill===state.project.fill));
  if(els.motionMode)els.motionMode.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.project.motionMode));if(els.autoKeyframe)els.autoKeyframe.checked=state.project.motionMode==='animate';if(els.autoHint)els.autoHint.textContent=state.project.motionMode==='animate'?'Viewport animation on':'Static viewport edit';
  if(els.motionModeHelp)els.motionModeHelp.textContent=state.project.motionMode==='animate'?'Animate: drag or zoom at different times to create viewport keyframes.':'Static: drag or zoom changes the whole clip while preserving any existing animation offsets.';
  const motion=loc&&segment&&loc.segment.id===segment.id?segmentMotionAt(segment,loc.sourceTime):normalizeTransform(segment&&segment.baseTransform);els.zoom.value=motion.zoom;els.zoomValue.textContent=Math.round(motion.zoom*100)+'%';renderKeyframes();syncTextInspector();
  els.captionsEnabled.checked=state.project.captionsEnabled;els.captionSize.value=state.project.captionSize;els.captionSizeValue.textContent=Math.round(state.project.captionSize*100)+'%';const caps=segment&&segment.captions||[];els.captionCount.textContent=String(caps.length);els.captionSource.textContent=caps.length?(clipById(segment.clipId)&&clipById(segment.clipId).meta&&clipById(segment.clipId).meta.captionLanguage||'Source / imported'):'No captions'
}
function renderAll(){renderFolders();renderLibrary();renderTimeline();syncInspector();populateFonts()}

async function handleAgent(command,params){
  params=params||{};
  if(command==='studio_status')return{ok:true,globalTime:state.globalTime,duration:totalDuration(),tool:state.tool,aspect:state.project.aspect,fill:state.project.fill,motionMode:state.project.motionMode,selectedSegmentId:state.selectedSegmentId,selectedOverlayId:state.selectedTextId,segments:sequenceLayout().map(x=>({id:x.segment.id,clipId:x.segment.clipId,title:x.clip&&x.clip.meta&&x.clip.meta.title||'Clip',start:x.start,end:x.end,duration:x.duration,in:x.segment.in,out:x.segment.out,speed:x.segment.speed,volume:x.segment.volume,videoFadeIn:x.segment.videoFadeIn,videoFadeOut:x.segment.videoFadeOut,audioFadeIn:x.segment.audioFadeIn,audioFadeOut:x.segment.audioFadeOut,baseTransform:x.segment.baseTransform,motion:x.segment.motion,overlays:x.segment.texts,captions:x.segment.captions.length}))};
  if(command==='studio_seek'){await seekGlobal(Number(params.time)||0,true);return{ok:true,time:state.globalTime}};
  if(command==='studio_set_aspect'){if(!['16:9','9:16','1:1'].includes(params.aspect))return{ok:false,error:'Invalid aspect'};state.project.aspect=params.aspect;saveProject();syncInspector();resizePreview();return{ok:true,aspect:state.project.aspect}};
  if(command==='studio_set_fill'){if(!['crop','blur','mirror','fit'].includes(params.fill))return{ok:false,error:'Invalid fill'};state.project.fill=params.fill;saveProject();syncInspector();draw();return{ok:true,fill:state.project.fill}};
  if(command==='studio_set_motion_mode'){state.project.motionMode=params.mode==='static'?'static':'animate';saveProject();syncInspector();return{ok:true,mode:state.project.motionMode}};
  if(command==='studio_select_segment'){if(!segmentById(params.segmentId))return{ok:false,error:'Unknown segment'};await selectSegment(params.segmentId,!!params.seek);return{ok:true}};
  if(command==='studio_insert_clip'){if(!clipById(params.clipId))return{ok:false,error:'Unknown clip'};await insertClip(params.clipId,Number.isInteger(params.index)?params.index:state.project.segments.length);return{ok:true,segmentId:state.selectedSegmentId}};
  if(command==='studio_move_segment'){const from=state.project.segments.findIndex(s=>s.id===params.segmentId);if(from<0)return{ok:false,error:'Unknown segment'};reorderSegment(params.segmentId,Number(params.index)||0);return{ok:true}};
  if(command==='studio_split'){const id=params.segmentId||state.selectedSegmentId;if(!id)return{ok:false,error:'No segment selected'};let sourceTime=params.sourceTime;if(sourceTime==null&&params.time!=null){const loc=globalToLocation(Number(params.time));if(!loc||loc.segment.id!==id)return{ok:false,error:'Global time is outside segment'};sourceTime=loc.sourceTime}return{ok:splitSegment(id,sourceTime)}};
  if(command==='studio_delete_segment'){removeSegment(params.segmentId||state.selectedSegmentId);return{ok:true}};
  if(command==='studio_set_segment'){const segment=segmentById(params.segmentId||state.selectedSegmentId);if(!segment)return{ok:false,error:'No segment selected'};for(const key of ['speed','volume','videoFadeIn','videoFadeOut','audioFadeIn','audioFadeOut'])if(params[key]!=null)segment[key]=Number(params[key]);segment.speed=clamp(segment.speed,.25,3);segment.volume=clamp(segment.volume,0,2);for(const key of ['videoFadeIn','videoFadeOut','audioFadeIn','audioFadeOut'])segment[key]=clamp(segment[key]||0,0,segmentDuration(segment));saveProject();renderTimeline();syncInspector();return{ok:true,segment:segment}};
  if(command==='studio_set_viewport'||command==='studio_move_viewport'||command==='studio_add_keyframe'){if(params.time!=null)await seekGlobal(Number(params.time),true);const loc=globalToLocation();if(!loc)return{ok:false,error:'No active segment'};let current=segmentMotionAt(loc.segment,loc.sourceTime);if(command==='studio_set_viewport')current={x:clamp(Number(params.x),0,1),y:clamp(Number(params.y),0,1),zoom:clamp(Number(params.zoom!=null?params.zoom:current.zoom),1,3)};if(command==='studio_move_viewport'){const dims=aspectDims();current={x:clamp(current.x+(Number(params.dx)||0)/Math.max(1,dims[0]),0,1),y:clamp(current.y+(Number(params.dy)||0)/Math.max(1,dims[1]),0,1),zoom:clamp(Number(params.zoom!=null?params.zoom:current.zoom),1,3)}};if(command==='studio_add_keyframe')upsertKeyframe(loc.segment,loc.sourceTime,current);else commitViewport(current);draw();return{ok:true,time:state.globalTime,sourceTime:loc.sourceTime,viewport:current,mode:state.project.motionMode}};
  if(command==='studio_clear_motion'){clearMotion();return{ok:true}};
  if(command==='studio_add_overlay'||command==='studio_add_text'){if(params.time!=null)await seekGlobal(Number(params.time),true);const kind=command==='studio_add_text'?'text':(['text','emoji','image'].includes(params.kind)?params.kind:'text');let item=addOverlayLayer(kind,{src:params.src||params.dataUrl||null});if(!item)return{ok:false,error:'No active segment'};if(params.text!=null)item.text=String(params.text);if(params.patch)Object.assign(item,params.patch);saveProject();syncTextInspector();draw();return{ok:true,overlay:item}};
  if(command==='studio_update_overlay'||command==='studio_update_text'){const segment=segmentById(params.segmentId||state.selectedSegmentId);if(!segment)return{ok:false,error:'Unknown segment'};const id=params.overlayId||params.textId;const item=segment.texts.find(t=>t.id===id);if(!item)return{ok:false,error:'Unknown overlay'};Object.assign(item,params.patch||{});if(params.patch&&params.patch.baseTransform)item.baseTransform=normalizeOverlayTransform(params.patch.baseTransform,item.baseTransform);saveProject();renderTimeline();draw();return{ok:true,overlay:item}};
  if(command==='studio_delete_overlay'||command==='studio_delete_text'){const segment=segmentById(params.segmentId||state.selectedSegmentId);if(!segment)return{ok:false,error:'Unknown segment'};const id=params.overlayId||params.textId;segment.texts=segment.texts.filter(t=>t.id!==id);if(state.selectedTextId===id)state.selectedTextId=null;saveProject();renderTimeline();draw();return{ok:true}};
  if(command==='studio_move_overlay'||command==='studio_set_overlay'){if(params.time!=null)await seekGlobal(Number(params.time),true);const loc=globalToLocation(),segment=segmentById(params.segmentId||state.selectedSegmentId)||(loc&&loc.segment);if(!segment)return{ok:false,error:'No segment'};const item=segment.texts.find(t=>t.id===(params.overlayId||state.selectedTextId));if(!item)return{ok:false,error:'Unknown overlay'};const sourceTime=loc&&loc.segment.id===segment.id?loc.sourceTime:item.start;let t=overlayTransformAt(item,sourceTime);if(command==='studio_move_overlay'){const dims=aspectDims();t={...t,x:clamp(t.x+(Number(params.dx)||0)/dims[0],0,1),y:clamp(t.y+(Number(params.dy)||0)/dims[1],0,1)}}else t={x:clamp(Number(params.x!=null?params.x:t.x),0,1),y:clamp(Number(params.y!=null?params.y:t.y),0,1),scale:clamp(Number(params.scale!=null?params.scale:t.scale),.1,8),rotation:Number(params.rotation!=null?params.rotation:t.rotation)||0,opacity:clamp(Number(params.opacity!=null?params.opacity:t.opacity),0,1)};commitOverlayTransform(item,sourceTime,t);return{ok:true,overlayId:item.id,transform:t,motionMode:item.motionMode}};
  if(command==='studio_set_overlay_motion_mode'){const item=selectedText()||(selectedSegment()&&selectedSegment().texts.find(t=>t.id===params.overlayId));if(!item)return{ok:false,error:'Unknown overlay'};item.motionMode=params.mode==='animate'?'animate':'static';saveProject();syncTextInspector();return{ok:true,mode:item.motionMode}};
  if(command==='studio_add_overlay_keyframe'){if(params.time!=null)await seekGlobal(Number(params.time),true);const loc=globalToLocation(),item=selectedText();if(!loc||!item)return{ok:false,error:'Select an overlay'};upsertOverlayKeyframe(item,loc.sourceTime,overlayTransformAt(item,loc.sourceTime));return{ok:true,keyframes:item.motion}};
  if(command==='studio_clear_overlay_motion'){clearObjectMotion();return{ok:true}};
  if(command==='studio_list_library')return{ok:true,folders:state.folders.map(f=>({...f,path:folderPath(f.id)})),clips:state.clips.map(c=>({id:c.id,title:c.meta&&c.meta.title||'Clip',folderId:c.folderId||null,duration:fallbackDuration(c),size:c.size}))};
  if(command==='studio_create_folder'){const folder=await createLibraryFolder(params.name,params.parentId||null);return folder?{ok:true,folder:folder}:{ok:false,error:'Folder name required'}};
  if(command==='studio_move_clips'){await moveClipsToFolder(params.clipIds||[],params.folderId||null);await refreshLibrary(false);return{ok:true}};
  if(command==='studio_move_folder'){await moveFolderParent(params.folderId,params.parentId||null);return{ok:true}};
  if(command==='studio_delete_folder'){await deleteLibraryFolder(params.folderId);return{ok:true}};
  if(command==='studio_set_captions'){const segment=segmentById(params.segmentId||state.selectedSegmentId);if(!segment)return{ok:false,error:'Unknown segment'};segment.captions=(params.cues||[]).map(c=>({id:c.id||uuid(),start:Number(c.start)||0,end:Number(c.end)||0,text:String(c.text||'')}));state.project.captionsEnabled=true;saveProject();renderTimeline();syncInspector();draw();return{ok:true,count:segment.captions.length}};
  if(command==='studio_get_captions'){const segment=segmentById(params.segmentId||state.selectedSegmentId);return segment?{ok:true,cues:segment.captions}:{ok:false,error:'Unknown segment'}};
  if(command==='studio_get_frame'||command==='studio_get_frames'){const times=command==='studio_get_frame'?[params.time!=null?params.time:state.globalTime]:(params.times||[]).slice(0,8),frames=[],restore=state.globalTime;for(const time of times){await seekGlobal(Number(time)||0,true);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));draw();const loc=globalToLocation();frames.push({time:state.globalTime,sourceTime:loc&&loc.sourceTime,segmentId:loc&&loc.segment.id,output:{aspect:state.project.aspect,width:els.preview.width,height:els.preview.height},viewport:loc?segmentMotionAt(loc.segment,loc.sourceTime):null,overlays:loc?(loc.segment.texts||[]).map(o=>({id:o.id,kind:o.kind,transform:overlayTransformAt(o,loc.sourceTime),active:loc.sourceTime>=o.start&&loc.sourceTime<=o.end})):[],dataUrl:frameDataUrl()})}await seekGlobal(restore,true);return command==='studio_get_frame'?{ok:true,...frames[0]}:{ok:true,frames:frames}};
  if(command==='studio_export'){exportSequence();return{ok:true,started:true}};
  return{ok:false,error:'Unknown Studio command: '+command}
}

// v0.5 controls
if(els.librarySearch)els.librarySearch.addEventListener('input',()=>{state.librarySearchText=els.librarySearch.value;renderLibrary()});
if(els.libraryNewFolder)els.libraryNewFolder.addEventListener('click',async()=>{const name=prompt('New folder name');if(name)await createLibraryFolder(name,state.activeFolderId)});
if(els.motionMode)els.motionMode.addEventListener('click',event=>{const mode=event.target.closest('button')&&event.target.closest('button').dataset.mode;if(!mode)return;state.project.motionMode=mode==='static'?'static':'animate';state.project.autoKeyframe=state.project.motionMode==='animate';saveProject();syncInspector()});
if(els.addEmoji)els.addEmoji.addEventListener('click',addEmojiLayer);if(els.newEmoji)els.newEmoji.addEventListener('click',addEmojiLayer);if(els.addImage)els.addImage.addEventListener('click',addImageLayer);if(els.newImage)els.newImage.addEventListener('click',addImageLayer);
if(els.changeImage)els.changeImage.addEventListener('click',()=>{els.overlayImageFile.dataset.create='0';els.overlayImageFile.value='';els.overlayImageFile.click()});
if(els.overlayImageFile)els.overlayImageFile.addEventListener('change',()=>overlayFileChosen(els.overlayImageFile.files&&els.overlayImageFile.files[0],els.overlayImageFile.dataset.create!=='1'));
if(els.emojiQuick)els.emojiQuick.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;event.preventDefault();updateText({text:b.textContent})});
if(els.objectMotionMode)els.objectMotionMode.addEventListener('click',event=>{const mode=event.target.closest('button')&&event.target.closest('button').dataset.mode,item=selectedText();if(!mode||!item)return;item.motionMode=mode==='animate'?'animate':'static';saveProject();syncTextInspector()});
if(els.addObjectKeyframe)els.addObjectKeyframe.addEventListener('click',()=>{const item=selectedText(),loc=globalToLocation();if(item&&loc)upsertOverlayKeyframe(item,loc.sourceTime,overlayTransformAt(item,loc.sourceTime))});
if(els.removeObjectKeyframe)els.removeObjectKeyframe.addEventListener('click',removeNearestObjectKeyframe);if(els.clearObjectMotion)els.clearObjectMotion.addEventListener('click',clearObjectMotion);
if(els.overlayScale)els.overlayScale.addEventListener('change',()=>{const item=selectedText(),loc=globalToLocation();if(item&&loc)commitOverlayTransform(item,loc.sourceTime,{...overlayTransformAt(item,loc.sourceTime),scale:Number(els.overlayScale.value)||1})});
if(els.overlayRotation)els.overlayRotation.addEventListener('change',()=>{const item=selectedText(),loc=globalToLocation();if(item&&loc)commitOverlayTransform(item,loc.sourceTime,{...overlayTransformAt(item,loc.sourceTime),rotation:Number(els.overlayRotation.value)||0})});
if(els.overlayOpacity)els.overlayOpacity.addEventListener('change',()=>{const item=selectedText(),loc=globalToLocation();if(item&&loc)commitOverlayTransform(item,loc.sourceTime,{...overlayTransformAt(item,loc.sourceTime),opacity:Number(els.overlayOpacity.value)})});
if(els.overlayZ)els.overlayZ.addEventListener('change',()=>updateText({z:Number(els.overlayZ.value)||10}));
if(els.libraryContextMenu)els.libraryContextMenu.addEventListener('pointerdown',event=>event.stopPropagation());
document.addEventListener('pointerdown',event=>{if(els.libraryContextMenu&&!event.target.closest('#library-context-menu'))closeLibraryContextMenu()},true);

// Capture-phase canvas interaction replaces v0.4 handlers without removing backward-compatible code.
els.preview.addEventListener('pointerdown',event=>{
  const loc=globalToLocation();if(!loc)return;
  const hit=overlayHit(event.clientX,event.clientY);
  if(hit){state.selectedSegmentId=loc.segment.id;state.selectedTextId=hit;setTool('text');switchPanel('text');syncInspector();renderTimeline()}
  const item=selectedText();
  if(state.tool==='text'&&item&&loc.segment.texts.some(o=>o.id===item.id)){
    event.preventDefault();event.stopImmediatePropagation();state.overlayDrag=true;els.preview.setPointerCapture(event.pointerId);state.overlayDragStart={x:event.clientX,y:event.clientY};state.overlayTransformStart={...overlayTransformAt(item,loc.sourceTime)};return
  }
  if(state.tool==='select'){
    event.preventDefault();event.stopImmediatePropagation();state.draggingCanvas=true;els.preview.classList.add('dragging');els.preview.setPointerCapture(event.pointerId);state.dragStart={x:event.clientX,y:event.clientY};state.transformStart={...segmentMotionAt(loc.segment,loc.sourceTime)}
  }
},{capture:true});
els.preview.addEventListener('pointermove',event=>{
  const loc=globalToLocation();if(!loc)return;
  if(state.overlayDrag&&selectedText()){
    event.preventDefault();event.stopImmediatePropagation();const r=els.preview.getBoundingClientRect(),dx=(event.clientX-state.overlayDragStart.x)/Math.max(1,r.width),dy=(event.clientY-state.overlayDragStart.y)/Math.max(1,r.height),item=selectedText();item.__previewTransform={...state.overlayTransformStart,x:clamp(state.overlayTransformStart.x+dx,0,1),y:clamp(state.overlayTransformStart.y+dy,0,1)};draw();return
  }
  if(state.draggingCanvas){
    event.preventDefault();event.stopImmediatePropagation();const r=els.preview.getBoundingClientRect(),dx=(event.clientX-state.dragStart.x)/Math.max(1,r.width),dy=(event.clientY-state.dragStart.y)/Math.max(1,r.height),t={...state.transformStart,x:clamp(state.transformStart.x-dx/Math.max(1,state.transformStart.zoom),0,1),y:clamp(state.transformStart.y-dy/Math.max(1,state.transformStart.zoom),0,1)};loc.segment.__previewTransform=t;draw()
  }
},{capture:true});
function v05CanvasEnd(event){
  const loc=globalToLocation();
  if(state.overlayDrag){event.preventDefault();event.stopImmediatePropagation();state.overlayDrag=false;const item=selectedText();if(item&&item.__previewTransform&&loc){const t={...item.__previewTransform};delete item.__previewTransform;commitOverlayTransform(item,loc.sourceTime,t)}try{els.preview.releasePointerCapture(event.pointerId)}catch(_){}return}
  if(state.draggingCanvas){event.preventDefault();event.stopImmediatePropagation();state.draggingCanvas=false;els.preview.classList.remove('dragging');if(loc&&loc.segment.__previewTransform){const t={...loc.segment.__previewTransform};delete loc.segment.__previewTransform;commitViewport(t)}try{els.preview.releasePointerCapture(event.pointerId)}catch(_){}}
}
els.preview.addEventListener('pointerup',v05CanvasEnd,{capture:true});els.preview.addEventListener('pointercancel',v05CanvasEnd,{capture:true});
els.preview.addEventListener('wheel',event=>{
  const loc=globalToLocation();if(!loc)return;
  if(state.tool==='text'&&selectedText()){event.preventDefault();event.stopImmediatePropagation();const item=selectedText(),t=overlayTransformAt(item,loc.sourceTime);t.scale=clamp(t.scale*(event.deltaY<0?1.06:.94),.1,8);commitOverlayTransform(item,loc.sourceTime,t);return}
  if(state.tool==='select'){event.preventDefault();event.stopImmediatePropagation();const t=segmentMotionAt(loc.segment,loc.sourceTime);t.zoom=clamp(t.zoom*(event.deltaY<0?1.06:.94),1,3);commitViewport(t)}
},{capture:true,passive:false});


// UI bindings
els.inspectorTabs.forEach(button=>button.addEventListener('click',()=>switchPanel(button.dataset.panel)));
els.toolSelect.addEventListener('click',()=>setTool('select'));els.toolCut.addEventListener('click',()=>setTool('cut'));els.addText.addEventListener('click',addTextLayer);els.newText.addEventListener('click',addTextLayer);els.play.addEventListener('click',playSequence);els.splitAtPlayhead.addEventListener('click',()=>splitSegment());els.deleteSegment.addEventListener('click',()=>state.selectedSegmentId&&removeSegment(state.selectedSegmentId));els.clipSplit.addEventListener('click',()=>splitSegment());els.clipRemove.addEventListener('click',()=>state.selectedSegmentId&&removeSegment(state.selectedSegmentId));els.export.addEventListener('click',exportSequence);els.settings.addEventListener('click',()=>chrome.runtime.openOptionsPage());els.refresh.addEventListener('click',()=>refreshLibrary(true));

els.videoTrack.addEventListener('dragover',event=>{event.preventDefault();event.dataTransfer.dropEffect=event.dataTransfer.types.includes('application/x-clippah-segment')?'move':'copy';state.dragInsertIndex=timelineDropIndex(event.clientX);els.videoTrack.classList.add('drag-over');showInsertMarker(state.dragInsertIndex)});els.videoTrack.addEventListener('dragleave',event=>{if(!els.videoTrack.contains(event.relatedTarget)){els.videoTrack.classList.remove('drag-over');els.videoTrack.querySelector('.insert-marker')?.remove()}});els.videoTrack.addEventListener('drop',event=>{event.preventDefault();els.videoTrack.classList.remove('drag-over');els.videoTrack.querySelector('.insert-marker')?.remove();const index=timelineDropIndex(event.clientX),segmentId=event.dataTransfer.getData('application/x-clippah-segment'),clipId=event.dataTransfer.getData('application/x-clippah-clip')||event.dataTransfer.getData('text/plain');if(segmentId)reorderSegment(segmentId,index);else if(clipById(clipId))insertClip(clipId,index)});

els.timeline.addEventListener('pointerdown',event=>{if(event.target.closest('.timeline-segment,.text-block,button,input'))return;const r=els.videoTrack.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right)return;seekGlobal((event.clientX-r.left)/r.width*totalDuration(),true)});
els.pickerClose.addEventListener('click',closePicker);els.picker.addEventListener('click',event=>event.target===els.picker&&closePicker());
els.contextMenu.addEventListener('click',event=>{const action=event.target.dataset.action,id=state.contextSegmentId;closeContextMenu();if(!id)return;if(action==='split')splitSegment(id);if(action==='duplicate')duplicateSegment(id);if(action==='delete')removeSegment(id)});document.addEventListener('pointerdown',event=>{if(!event.target.closest('#context-menu'))closeContextMenu()});

els.organize.addEventListener('click',()=>{state.organizing=!state.organizing;state.selectedLibrary.clear();updateBulkBar();renderLibrary()});els.bulkDone.addEventListener('click',()=>{state.organizing=false;state.selectedLibrary.clear();updateBulkBar();renderLibrary()});els.folderFilter.addEventListener('change',()=>{state.folderFilter=els.folderFilter.value;renderLibrary()});els.moveFolder.addEventListener('change',async()=>{if(!state.selectedLibrary.size||!els.moveFolder.value)return;await moveClipsToFolder([...state.selectedLibrary],els.moveFolder.value==='none'?null:els.moveFolder.value);state.selectedLibrary.clear();els.moveFolder.value='';await refreshLibrary(false);toast('Clips moved.');});els.newFolder.addEventListener('click',async()=>{const name=prompt('New folder name');if(!name?.trim())return;const folder={id:uuid(),name:name.trim(),createdAt:Date.now()};await putRecord('folders',folder);if(state.selectedLibrary.size)await moveClipsToFolder([...state.selectedLibrary],folder.id);state.selectedLibrary.clear();await refreshLibrary(false);toast(`Folder “${folder.name}” created.`)});

for(const [input,key,valueEl,max] of [[els.speed,'speed',els.speedValue,3],[els.volume,'volume',els.volumeValue,2],[els.videoFadeIn,'videoFadeIn',els.videoFadeInValue,99],[els.videoFadeOut,'videoFadeOut',els.videoFadeOutValue,99],[els.audioFadeIn,'audioFadeIn',els.audioFadeInValue,99],[els.audioFadeOut,'audioFadeOut',els.audioFadeOutValue,99]])input.addEventListener('input',()=>{const value=Number(input.value);setSegmentNumber(key,value,0,max);if(key==='speed')valueEl.textContent=`${value.toFixed(2)}×`;else if(key==='volume')valueEl.textContent=`${Math.round(value*100)}%`;else valueEl.textContent=`${value.toFixed(1)}s`});
els.aspect.addEventListener('click',event=>{const aspect=event.target.closest('button')?.dataset.aspect;if(!aspect)return;state.project.aspect=aspect;saveProject();els.stage.className=`stage ratio-${aspect.replace(':','-')}`;syncInspector();requestAnimationFrame(resizePreview)});els.fill.addEventListener('click',event=>{const fill=event.target.closest('button')?.dataset.fill;if(!fill)return;state.project.fill=fill;saveProject();syncInspector();draw()});els.autoKeyframe.addEventListener('change',()=>{state.project.autoKeyframe=els.autoKeyframe.checked;saveProject();syncInspector()});els.zoom.addEventListener('input',()=>{const loc=globalToLocation();if(!loc)return;const current=segmentMotionAt(loc.segment,loc.sourceTime);commitViewport({...current,zoom:Number(els.zoom.value)});els.zoomValue.textContent=`${Math.round(Number(els.zoom.value)*100)}%`});els.addKeyframe.addEventListener('click',()=>{const loc=globalToLocation();if(!loc)return;upsertKeyframe(loc.segment,loc.sourceTime,segmentMotionAt(loc.segment,loc.sourceTime))});els.removeKeyframe.addEventListener('click',removeNearestKeyframe);els.clearKeyframes.addEventListener('click',clearMotion);els.resetFrame.addEventListener('click',()=>{const loc=globalToLocation();if(!loc)return;upsertKeyframe(loc.segment,loc.sourceTime,{x:.5,y:.5,zoom:1});draw()});

els.textContent.addEventListener('input',()=>updateText({text:els.textContent.value}));els.fontFamily.addEventListener('change',()=>updateText({fontFamily:els.fontFamily.value}));els.fontSize.addEventListener('input',()=>updateText({fontSize:clamp(Number(els.fontSize.value)||64,12,240)}));els.fontColor.addEventListener('input',()=>updateText({color:els.fontColor.value}));els.textStart.addEventListener('change',()=>updateText({start:Number(els.textStart.value)}));els.textEnd.addEventListener('change',()=>updateText({end:Number(els.textEnd.value)}));els.textFadeIn.addEventListener('change',()=>updateText({fadeIn:Math.max(0,Number(els.textFadeIn.value)||0)}));els.textFadeOut.addEventListener('change',()=>updateText({fadeOut:Math.max(0,Number(els.textFadeOut.value)||0)}));els.deleteText.addEventListener('click',deleteTextLayer);els.loadFonts.addEventListener('click',loadSystemFonts);

els.captionsEnabled.addEventListener('change',()=>{state.project.captionsEnabled=els.captionsEnabled.checked;saveProject();draw()});els.captionSize.addEventListener('input',()=>{state.project.captionSize=Number(els.captionSize.value);els.captionSizeValue.textContent=`${Math.round(state.project.captionSize*100)}%`;saveProject();draw()});els.importCaptions.addEventListener('click',()=>els.captionFile.click());els.captionFile.addEventListener('change',async()=>{const file=els.captionFile.files?.[0],segment=selectedSegment();if(!file||!segment)return;segment.captions=parseCaptions(await file.text());state.project.captionsEnabled=true;saveProject();renderTimeline();syncInspector();draw();toast(`Imported ${segment.captions.length} captions.`)});els.exportCaptions.addEventListener('click',()=>{const segment=selectedSegment();if(!segment?.captions?.length)return toast('No captions on the selected segment.',true);const body=segment.captions.map((c,i)=>`${i+1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}`).join('\n\n'),blob=new Blob([body],{type:'text/plain'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='clippah-captions.srt';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)});

els.preview.addEventListener('pointerdown',event=>{const loc=globalToLocation();if(!loc)return;if(state.tool==='text'&&selectedText()){state.textDrag=true;els.preview.setPointerCapture(event.pointerId);const r=els.preview.getBoundingClientRect();updateText({x:clamp((event.clientX-r.left)/r.width,0,1),y:clamp((event.clientY-r.top)/r.height,0,1)});return}if(state.tool!=='select')return;state.draggingCanvas=true;els.preview.classList.add('dragging');els.preview.setPointerCapture(event.pointerId);state.dragStart={x:event.clientX,y:event.clientY};state.transformStart={...segmentMotionAt(loc.segment,loc.sourceTime)}});els.preview.addEventListener('pointermove',event=>{if(state.textDrag&&selectedText()){const r=els.preview.getBoundingClientRect();updateText({x:clamp((event.clientX-r.left)/r.width,0,1),y:clamp((event.clientY-r.top)/r.height,0,1)});return}if(!state.draggingCanvas)return;const r=els.preview.getBoundingClientRect(),dx=(event.clientX-state.dragStart.x)/Math.max(1,r.width),dy=(event.clientY-state.dragStart.y)/Math.max(1,r.height);const t={...state.transformStart,x:clamp(state.transformStart.x-dx/Math.max(1,state.transformStart.zoom),0,1),y:clamp(state.transformStart.y-dy/Math.max(1,state.transformStart.zoom),0,1)};state.previewTransform=t;const loc=globalToLocation();if(loc){const original=loc.segment.motion;loc.segment.__previewMotion=t;drawFrame(els.preview.getContext('2d',{alpha:false}),els.preview.width,els.preview.height,{...loc,segment:{...loc.segment,motion:[{time:loc.sourceTime,...t}]}});loc.segment.motion=original}});function endCanvas(event){if(state.textDrag){state.textDrag=false;return}if(!state.draggingCanvas)return;state.draggingCanvas=false;els.preview.classList.remove('dragging');try{els.preview.releasePointerCapture(event.pointerId)}catch(_){}if(state.previewTransform){commitViewport(state.previewTransform);state.previewTransform=null}}els.preview.addEventListener('pointerup',endCanvas);els.preview.addEventListener('pointercancel',endCanvas);els.preview.addEventListener('wheel',event=>{if(state.tool!=='select')return;event.preventDefault();const loc=globalToLocation();if(!loc)return;const t=segmentMotionAt(loc.segment,loc.sourceTime);t.zoom=clamp(t.zoom*(event.deltaY<0?1.06:.94),1,3);commitViewport(t)},{passive:false});

window.addEventListener('resize',()=>{resizePreview();drawWaveform()});document.addEventListener('keydown',event=>{if(event.target&&['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;if(event.code==='Space'){event.preventDefault();playSequence()}else if(event.key==='c'||event.key==='C')setTool('cut');else if(event.key==='v'||event.key==='V')setTool('select');else if(event.key==='t'||event.key==='T')addTextLayer();else if(event.key==='Delete'&&state.selectedTextId)deleteTextLayer();else if(event.key==='Delete'&&state.selectedSegmentId)removeSegment(state.selectedSegmentId);else if(event.key==='Escape'){closePicker();closeContextMenu();setTool('select')}else if(event.key==='s'||event.key==='S')splitSegment()});

chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{if(message?.type==='CLIP_LIBRARY_CHANGED'){refreshLibrary(false).then(()=>toast('New clip added to Library.'));return}if(message?.type==='AGENT_STUDIO_COMMAND'){handleAgent(message.command,message.params||{}).then(sendResponse).catch(error=>sendResponse({ok:false,error:error?.message||String(error)}));return true}});

async function refreshLibrary(selectNewest=false){const oldIds=new Set(state.clips.map(c=>c.id));state.clips=(await getAll('clips')).sort((a,b)=>b.createdAt-a.createdAt);state.folders=(await getAll('folders')).sort((a,b)=>a.name.localeCompare(b.name));state.project.segments=state.project.segments.filter(s=>clipById(s.clipId));if(selectNewest&&state.clips[0]&&!oldIds.has(state.clips[0].id))await insertClip(state.clips[0].id,state.project.segments.length);renderAll();if(state.project.segments.length&&!state.loadedSegmentId)await seekGlobal(clamp(state.globalTime,0,totalDuration()),true)}

async function init(){
  state.clips=(await getAll('clips')).sort((a,b)=>b.createdAt-a.createdAt);state.folders=(await getAll('folders')).sort((a,b)=>a.name.localeCompare(b.name));await loadProject();state.selectedSegmentId=state.project.segments[0]?.id||null;populateFonts();renderAll();els.stage.className=`stage ratio-${state.project.aspect.replace(':','-')}`;if(state.project.segments.length)await seekGlobal(0,true);else renderTimeline();
}
init();
