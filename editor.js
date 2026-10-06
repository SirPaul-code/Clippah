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
