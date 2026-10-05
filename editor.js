const $ = s => document.querySelector(s);
const els = {
  clipList:$('#clip-list'), workspace:$('#workspace'), empty:$('#empty-state'), editor:$('#editor'),
  title:$('#clip-title'), meta:$('#clip-meta'), stage:$('#stage'), canvas:$('#preview'), source:$('#source'),
  play:$('#play'), scrub:$('#scrub'), time:$('#time'), duration:$('#duration'), zoom:$('#zoom'),
  aspect:$('#aspect'), background:$('#background-mode'), addKeyframe:$('#add-keyframe'),
  clearKeyframes:$('#clear-keyframes'), keyframeCount:$('#keyframe-count'),
  export:$('#export'), exportStatus:$('#export-status'), downloadOriginal:$('#download-original'),
  delete:$('#delete'), refresh:$('#refresh')
};

const state = {
  clips:[], clip:null, url:null, aspect:'16:9', mode:'crop',
  x:.5, y:.5, zoom:1, keyframes:[], dragging:false,
  pointerStart:null, transformStart:null, exporting:false
};

const fmt = s => {
  if (!Number.isFinite(s)) return '0:00.00';
  const m=Math.floor(s/60), sec=Math.floor(s%60), cs=Math.floor((s%1)*100);
  return `${m}:${String(sec).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
};

function openDb() {
  return new Promise((resolve,reject) => {
    const req=indexedDB.open('clippah',1);
    req.onupgradeneeded=() => {
      const db=req.result;
      if(!db.objectStoreNames.contains('clips')) {
        const store=db.createObjectStore('clips',{keyPath:'id'});
        store.createIndex('createdAt','createdAt');
      }
    };
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}

async function listClips() {
  const db=await openDb();
  const clips=await new Promise((resolve,reject)=>{
    const req=db.transaction('clips','readonly').objectStore('clips').getAll();
    req.onsuccess=()=>resolve(req.result||[]); req.onerror=()=>reject(req.error);
  });
  db.close();
  return clips.sort((a,b)=>b.createdAt-a.createdAt);
}

async function deleteClip(id) {
  const db=await openDb();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction('clips','readwrite');
    tx.objectStore('clips').delete(id); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error);
  });
  db.close();
}

function escapeHtml(v) {
  return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function renderList() {
  els.clipList.innerHTML='';
  if(!state.clips.length) return els.clipList.innerHTML='<div class="muted">No captured clips yet.</div>';
  state.clips.forEach(clip=>{
    const b=document.createElement('button');
    b.className='clip-item'+(state.clip?.id===clip.id?' active':'');
    const start=clip.meta?.segmentStart,end=clip.meta?.segmentEnd;
    const range=Number.isFinite(start)&&Number.isFinite(end)?`${fmt(start)} → ${fmt(end)}`:new Date(clip.createdAt).toLocaleTimeString();
    b.innerHTML=`<strong>${escapeHtml(clip.meta?.title||'Captured clip')}</strong><small>${range} · ${(clip.size/1048576).toFixed(1)} MB</small>`;
    b.onclick=()=>selectClip(clip); els.clipList.appendChild(b);
  });
}

function setAspect(aspect) {
  state.aspect=aspect;
  els.stage.className='stage ratio-'+aspect.replace(':','-');
  els.aspect.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.aspect===aspect));
  resize();
}

function setMode(mode) {
  state.mode=mode;
  els.background.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  draw();
}

function resetTransform() {
  state.x=.5; state.y=.5; state.zoom=1; state.keyframes=[]; els.zoom.value='1'; keyframeCount();
}

async function selectClip(clip) {
  if(state.url) URL.revokeObjectURL(state.url);
  state.clip=clip; state.url=URL.createObjectURL(clip.blob); resetTransform();
  els.source.src=state.url; els.title.textContent=clip.meta?.title||'Captured clip';
  const s=clip.meta?.segmentStart,e=clip.meta?.segmentEnd;
  els.meta.textContent=(Number.isFinite(s)?`${fmt(s)} → ${fmt(e)} · `:'')+`${(clip.size/1048576).toFixed(1)} MB · local capture`;
  els.workspace.classList.remove('empty'); els.empty.hidden=true; els.editor.hidden=false; renderList();
  await new Promise(resolve=>{
    if(els.source.readyState>=1) return resolve();
    els.source.addEventListener('loadedmetadata',resolve,{once:true});
  });
  els.duration.textContent=fmt(els.source.duration); els.scrub.value=0; resize(); draw();
}

function transformAt(time) {
  const frames=[...state.keyframes].sort((a,b)=>a.time-b.time);
  if(!frames.length) return {x:state.x,y:state.y,zoom:state.zoom};
  if(time<=frames[0].time) return frames[0];
  if(time>=frames[frames.length-1].time) return frames[frames.length-1];
  for(let i=0;i<frames.length-1;i++) {
    const a=frames[i],b=frames[i+1];
    if(time>=a.time&&time<=b.time) {
      let t=(time-a.time)/Math.max(.0001,b.time-a.time);
      t=t*t*(3-2*t);
      return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,zoom:a.zoom+(b.zoom-a.zoom)*t};
    }
  }
  return frames[0];
}

function drawCrop(ctx,video,w,h,t,mode) {
  const vw=video.videoWidth||16,vh=video.videoHeight||9;
  ctx.clearRect(0,0,w,h); ctx.fillStyle='#000'; ctx.fillRect(0,0,w,h);

  if(mode==='blur') {
    const cover=Math.max(w/vw,h/vh),bw=vw*cover,bh=vh*cover;
    ctx.save(); ctx.filter='blur(28px) brightness(.72)';
    ctx.drawImage(video,(w-bw)/2,(h-bh)/2,bw,bh); ctx.restore();
    const fit=Math.min(w/vw,h/vh)*t.zoom,fw=vw*fit,fh=vh*fit;
    const cx=w/2+(t.x-.5)*Math.max(0,w-fw),cy=h/2+(t.y-.5)*Math.max(0,h-fh);
    ctx.drawImage(video,cx-fw/2,cy-fh/2,fw,fh); return;
  }

  if(mode==='fit') {
    const scale=Math.min(w/vw,h/vh)*t.zoom,dw=vw*scale,dh=vh*scale;
    const cx=w/2+(t.x-.5)*Math.max(0,w-dw),cy=h/2+(t.y-.5)*Math.max(0,h-dh);
    ctx.drawImage(video,cx-dw/2,cy-dh/2,dw,dh); return;
  }

  const target=w/h;
  let sw=vw,sh=vh;
  if(vw/vh>target) sw=vh*target; else sh=vw/target;
  sw/=t.zoom; sh/=t.zoom;
  const maxX=vw-sw,maxY=vh-sh,sx=Math.max(0,Math.min(maxX,t.x*maxX)),sy=Math.max(0,Math.min(maxY,t.y*maxY));
  ctx.drawImage(video,sx,sy,sw,sh,0,0,w,h);
}

function resize() {
  const r=els.stage.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);
  els.canvas.width=Math.max(2,Math.round(r.width*dpr)); els.canvas.height=Math.max(2,Math.round(r.height*dpr)); draw();
}

function draw() {
  if(!state.clip||!els.source.videoWidth||!els.canvas.width) return;
  drawCrop(els.canvas.getContext('2d',{alpha:false}),els.source,els.canvas.width,els.canvas.height,transformAt(els.source.currentTime||0),state.mode);
}

function keyframeCount(){els.keyframeCount.textContent=String(state.keyframes.length)}

function addKeyframe() {
  if(!state.clip) return;
  const time=els.source.currentTime||0, frame={time,x:state.x,y:state.y,zoom:state.zoom};
  const old=state.keyframes.find(k=>Math.abs(k.time-time)<.12);
  if(old) Object.assign(old,frame); else state.keyframes.push(frame);
  state.keyframes.sort((a,b)=>a.time-b.time); keyframeCount(); draw();
}

const mediaType=()=>['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t))||'';

async function exportVideo() {
  if(!state.clip||state.exporting) return;
  state.exporting=true; els.export.disabled=true; els.exportStatus.textContent='Rendering in real time…';

  const dims=state.aspect==='9:16'?[720,1280]:state.aspect==='1:1'?[1080,1080]:[1280,720];
  const canvas=document.createElement('canvas'); canvas.width=dims[0]; canvas.height=dims[1];
  const ctx=canvas.getContext('2d',{alpha:false}),canvasStream=canvas.captureStream(30);
  const original=els.source.currentTime,wasPaused=els.source.paused;

  els.source.pause(); els.source.currentTime=0;
  await new Promise(resolve=>els.source.addEventListener('seeked',resolve,{once:true}));

  const sourceStream=els.source.captureStream?els.source.captureStream():null;
  const audio=sourceStream?sourceStream.getAudioTracks():[];
  const out=new MediaStream([...canvasStream.getVideoTracks(),...audio]);
  const type=mediaType();
  const rec=new MediaRecorder(out,type?{mimeType:type,videoBitsPerSecond:8_000_000}:undefined);
  const chunks=[]; rec.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};

  let raf=0;
  const paint=()=>{drawCrop(ctx,els.source,canvas.width,canvas.height,transformAt(els.source.currentTime||0),state.mode);raf=requestAnimationFrame(paint)};

  const blob=await new Promise(async (resolve,reject)=>{
    rec.onerror=()=>reject(rec.error||new Error('Export failed'));
    rec.onstop=()=>resolve(new Blob(chunks,{type:rec.mimeType||'video/webm'}));
    els.source.addEventListener('ended',()=>rec.stop(),{once:true});
    rec.start(1000); paint(); await els.source.play();
  }).catch(error=>{els.exportStatus.textContent='Export failed: '+error.message;return null});

  cancelAnimationFrame(raf); canvasStream.getTracks().forEach(t=>t.stop()); audio.forEach(t=>t.stop());

  if(blob) {
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`clippah-${state.aspect.replace(':','x')}-${Date.now()}.webm`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),30000);els.exportStatus.textContent=`Exported ${(blob.size/1048576).toFixed(1)} MB`;
  }

  els.source.currentTime=Math.min(original,els.source.duration||original);
  if(!wasPaused) els.source.play().catch(()=>{});
  state.exporting=false;els.export.disabled=false;
}

els.play.onclick=()=>els.source.paused?els.source.play():els.source.pause();
els.source.onplay=()=>els.play.textContent='❚❚'; els.source.onpause=()=>els.play.textContent='▶';
els.source.ontimeupdate=()=>{
  if(!Number.isFinite(els.source.duration)||!els.source.duration)return;
  els.scrub.value=String(Math.round(els.source.currentTime/els.source.duration*1000));els.time.textContent=fmt(els.source.currentTime);
  const t=transformAt(els.source.currentTime);state.x=t.x;state.y=t.y;state.zoom=t.zoom;els.zoom.value=String(t.zoom);draw();
};
els.scrub.oninput=()=>{if(Number.isFinite(els.source.duration))els.source.currentTime=Number(els.scrub.value)/1000*els.source.duration};
els.zoom.oninput=()=>{state.zoom=Number(els.zoom.value);draw()};
els.aspect.onclick=e=>e.target.dataset.aspect&&setAspect(e.target.dataset.aspect);
els.background.onclick=e=>e.target.dataset.mode&&setMode(e.target.dataset.mode);
els.addKeyframe.onclick=addKeyframe;
els.clearKeyframes.onclick=()=>{state.keyframes=[];keyframeCount();draw()};
els.export.onclick=exportVideo;
els.downloadOriginal.onclick=()=>{
  if(!state.clip)return;const url=URL.createObjectURL(state.clip.blob),a=document.createElement('a');
  a.href=url;a.download=`clippah-capture-${Date.now()}.webm`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
};
els.delete.onclick=async()=>{
  if(!state.clip)return;await deleteClip(state.clip.id);state.clip=null;
  if(state.url)URL.revokeObjectURL(state.url);state.url=null;els.editor.hidden=true;els.empty.hidden=false;els.workspace.classList.add('empty');await refresh();
};
els.refresh.onclick=refresh;

els.canvas.onpointerdown=e=>{
  if(!state.clip)return;state.dragging=true;els.canvas.classList.add('dragging');els.canvas.setPointerCapture(e.pointerId);
  state.pointerStart={x:e.clientX,y:e.clientY};const t=transformAt(els.source.currentTime||0);
  state.transformStart={...t};state.x=t.x;state.y=t.y;state.zoom=t.zoom;
};
els.canvas.onpointermove=e=>{
  if(!state.dragging)return;const r=els.canvas.getBoundingClientRect(),dx=(e.clientX-state.pointerStart.x)/Math.max(1,r.width),dy=(e.clientY-state.pointerStart.y)/Math.max(1,r.height);
  state.x=Math.max(0,Math.min(1,state.transformStart.x-dx/state.zoom));state.y=Math.max(0,Math.min(1,state.transformStart.y-dy/state.zoom));draw();
};
els.canvas.onpointerup=e=>{state.dragging=false;els.canvas.classList.remove('dragging');try{els.canvas.releasePointerCapture(e.pointerId)}catch(_){}};
els.canvas.addEventListener('wheel',e=>{e.preventDefault();state.zoom=Math.max(1,Math.min(3,state.zoom*(e.deltaY<0?1.07:.935)));els.zoom.value=String(state.zoom);draw()},{passive:false});
window.onresize=resize;

async function refresh(){state.clips=await listClips();renderList();if(!state.clip&&state.clips.length)selectClip(state.clips[0])}
function tick(){if(!state.exporting)draw();requestAnimationFrame(tick)}
refresh();tick();
