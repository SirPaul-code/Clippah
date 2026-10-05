const $=selector=>document.querySelector(selector);
const els={
  list:$('#clip-list'),workspace:$('#workspace'),empty:$('#empty-state'),editor:$('#editor'),inspector:$('#inspector'),
  title:$('#clip-title'),meta:$('#clip-meta'),stage:$('#stage'),canvas:$('#preview'),source:$('#source'),
  play:$('#play'),scrub:$('#scrub'),time:$('#time'),duration:$('#duration'),rail:$('#keyframe-rail'),
  aspect:$('#aspect'),background:$('#background-mode'),zoom:$('#zoom'),zoomValue:$('#zoom-value'),
  auto:$('#auto-keyframe'),autoHint:$('#auto-hint'),add:$('#add-keyframe'),remove:$('#remove-keyframe'),
  clear:$('#clear-keyframes'),count:$('#keyframe-count'),reset:$('#reset-frame'),
  sourceMode:$('#source-mode'),sourceSize:$('#source-size'),download:$('#download-original'),delete:$('#delete'),
  refresh:$('#refresh'),settings:$('#settings'),export:$('#export'),exportStatus:$('#export-status')
};

const state={
  clips:[],clip:null,url:null,duration:0,aspect:'16:9',mode:'crop',
  x:.5,y:.5,zoom:1,keyframes:[],dragging:false,dragStart:null,transformStart:null,
  exporting:false,auto:true,saveTimer:0,wheelTimer:0
};

const fmt=s=>{
  if(!Number.isFinite(s))return '0:00.000';
  s=Math.max(0,s);
  const m=Math.floor(s/60),sec=Math.floor(s%60),ms=Math.floor((s%1)*1000);
  return m+':'+String(sec).padStart(2,'0')+'.'+String(ms).padStart(3,'0');
};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const sizeLabel=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';

function openDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open('clippah',2);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains('clips')){
        const s=db.createObjectStore('clips',{keyPath:'id'});s.createIndex('createdAt','createdAt');
      }
      if(!db.objectStoreNames.contains('chunks')){
        const s=db.createObjectStore('chunks',{keyPath:'key'});s.createIndex('sessionId','sessionId');
      }
      if(!db.objectStoreNames.contains('sessions'))db.createObjectStore('sessions',{keyPath:'id'});
    };
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
async function listClips(){
  const db=await openDb();
  try{
    return await new Promise((resolve,reject)=>{
      const req=db.transaction('clips','readonly').objectStore('clips').getAll();
      req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>b.createdAt-a.createdAt));
      req.onerror=()=>reject(req.error);
    });
  }finally{db.close();}
}
async function deleteClip(id){
  const db=await openDb();
  try{
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('clips','readwrite');tx.objectStore('clips').delete(id);
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
  }finally{db.close();}
}

function projectKey(){return state.clip?'edit:'+state.clip.id:null;}
async function loadProject(){
  const key=projectKey();
  const saved=key?(await chrome.storage.local.get(key))[key]:null;
  state.aspect=saved?.aspect||'16:9';
  state.mode=saved?.mode||'crop';
  state.keyframes=Array.isArray(saved?.keyframes)?saved.keyframes:[];
  state.auto=saved?.auto!==false;
  const first=transformAt(els.source.currentTime||0);
  state.x=first.x;state.y=first.y;state.zoom=first.zoom;
  syncControls();renderKeyframes();
}
function saveProjectSoon(){
  clearTimeout(state.saveTimer);
  state.saveTimer=setTimeout(async()=>{
    const key=projectKey();if(!key)return;
    await chrome.storage.local.set({[key]:{aspect:state.aspect,mode:state.mode,keyframes:state.keyframes,auto:state.auto}});
  },180);
}

function escapeHtml(value){
  return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function renderList(){
  els.list.innerHTML='';
  if(!state.clips.length){
    els.list.innerHTML='<div style="color:#707580;font-size:10px;padding:10px 7px">No captured clips yet.</div>';
    return;
  }
  for(const clip of state.clips){
    const button=document.createElement('button');
    button.className='clip-item'+(state.clip?.id===clip.id?' active':'');
    const mode=clip.meta?.captureMode==='element'?'clean media':'browser capture';
    const duration=clip.meta?.recordedDuration||((clip.meta?.segmentEnd??0)-(clip.meta?.segmentStart??0));
    button.innerHTML='<strong>'+escapeHtml(clip.meta?.title||'Captured clip')+'</strong><small><i class="mode-dot"></i>'+fmt(duration)+' · '+escapeHtml(mode)+'</small>';
    button.onclick=()=>selectClip(clip);
    els.list.appendChild(button);
  }
}

function sourceRegion(){
  const vw=els.source.videoWidth||1,vh=els.source.videoHeight||1;
  const meta=state.clip?.meta||{};
  if(meta.captureMode!=='tab'||!meta.rect||!meta.viewportWidth||!meta.viewportHeight){
    return {x:0,y:0,w:vw,h:vh};
  }
  const sx=clamp(meta.rect.left/meta.viewportWidth*vw,0,vw-1);
  const sy=clamp(meta.rect.top/meta.viewportHeight*vh,0,vh-1);
  const sw=clamp(meta.rect.width/meta.viewportWidth*vw,2,vw-sx);
  const sh=clamp(meta.rect.height/meta.viewportHeight*vh,2,vh-sy);
  return {x:sx,y:sy,w:sw,h:sh};
}

async function resolveDuration(){
  const fallback=Number(state.clip?.meta?.recordedDuration)||0;
  if(Number.isFinite(els.source.duration)&&els.source.duration>0){
    state.duration=els.source.duration;return state.duration;
  }
  const old=els.source.currentTime||0;
  try{
    els.source.currentTime=1e10;
    await Promise.race([
      new Promise(resolve=>els.source.addEventListener('timeupdate',resolve,{once:true})),
      new Promise(resolve=>els.source.addEventListener('durationchange',resolve,{once:true})),
      new Promise(resolve=>setTimeout(resolve,1200))
    ]);
    if(Number.isFinite(els.source.duration)&&els.source.duration>0)state.duration=els.source.duration;
  }catch(_){}
  if(!state.duration)state.duration=fallback;
  try{els.source.currentTime=Math.min(old,state.duration||old);}catch(_){}
  return state.duration;
}

async function selectClip(clip){
  if(state.url)URL.revokeObjectURL(state.url);
  state.clip=clip;state.url=URL.createObjectURL(clip.blob);state.duration=0;
  els.source.pause();els.source.src=state.url;els.source.load();
  els.title.textContent=clip.meta?.title||'Captured clip';
  els.meta.textContent=(clip.meta?.captureMode==='element'?'Clean media capture':'Browser capture · player cropped in Studio')+' · local only';
  els.sourceMode.textContent=clip.meta?.captureMode==='element'?'Clean media':'Browser capture';
  els.sourceSize.textContent=sizeLabel(clip.size||clip.blob?.size||0);
  els.workspace.classList.remove('empty');els.empty.hidden=true;els.editor.hidden=false;els.inspector.hidden=false;
  renderList();

  await new Promise(resolve=>{
    if(els.source.readyState>=1)return resolve();
    els.source.addEventListener('loadedmetadata',resolve,{once:true});
  });
  await resolveDuration();
  els.source.currentTime=0;
  await loadProject();
  syncControls();resize();draw();
}

function transformAt(time){
  const frames=[...state.keyframes].sort((a,b)=>a.time-b.time);
  if(!frames.length)return{x:state.x||.5,y:state.y||.5,zoom:state.zoom||1};
  if(time<=frames[0].time)return{x:frames[0].x,y:frames[0].y,zoom:frames[0].zoom};
  if(time>=frames.at(-1).time){const f=frames.at(-1);return{x:f.x,y:f.y,zoom:f.zoom};}
  for(let i=0;i<frames.length-1;i++){
    const a=frames[i],b=frames[i+1];
    if(time>=a.time&&time<=b.time){
      let t=(time-a.time)/Math.max(.0001,b.time-a.time);
      t=t*t*(3-2*t);
      return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,zoom:a.zoom+(b.zoom-a.zoom)*t};
    }
  }
  return{x:.5,y:.5,zoom:1};
}

function sourceToCanvas(ctx,video,w,h,t,mode){
  const src=sourceRegion();
  ctx.save();ctx.clearRect(0,0,w,h);ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);

  if(mode==='blur'||mode==='mirror'){
    const cover=Math.max(w/src.w,h/src.h),bw=src.w*cover,bh=src.h*cover;
    ctx.save();
    if(mode==='blur')ctx.filter='blur(34px) brightness(.62)';
    if(mode==='mirror'){ctx.translate(w,0);ctx.scale(-1,1);}
    ctx.drawImage(video,src.x,src.y,src.w,src.h,(w-bw)/2,(h-bh)/2,bw,bh);
    ctx.restore();
    const fit=Math.min(w/src.w,h/src.h)*t.zoom,fw=src.w*fit,fh=src.h*fit;
    const overflowX=Math.max(0,fw-w),overflowY=Math.max(0,fh-h);
    const dx=(w-fw)/2-(t.x-.5)*overflowX,dy=(h-fh)/2-(t.y-.5)*overflowY;
    ctx.drawImage(video,src.x,src.y,src.w,src.h,dx,dy,fw,fh);
    ctx.restore();return;
  }

  if(mode==='fit'){
    const scale=Math.min(w/src.w,h/src.h)*t.zoom,dw=src.w*scale,dh=src.h*scale;
    const overflowX=Math.max(0,dw-w),overflowY=Math.max(0,dh-h);
    const dx=(w-dw)/2-(t.x-.5)*overflowX,dy=(h-dh)/2-(t.y-.5)*overflowY;
    ctx.drawImage(video,src.x,src.y,src.w,src.h,dx,dy,dw,dh);
    ctx.restore();return;
  }

  const target=w/h;
  let sw=src.w,sh=src.h;
  if(src.w/src.h>target)sw=src.h*target;else sh=src.w/target;
  sw/=t.zoom;sh/=t.zoom;
  const maxX=src.w-sw,maxY=src.h-sh;
  const sx=src.x+clamp(t.x,0,1)*maxX,sy=src.y+clamp(t.y,0,1)*maxY;
  ctx.drawImage(video,sx,sy,sw,sh,0,0,w,h);
  ctx.restore();
}

function currentTransform(){
  return{x:state.x,y:state.y,zoom:state.zoom};
}
function draw(){
  if(!state.clip||!els.source.videoWidth||!els.canvas.width)return;
  const t=state.dragging?currentTransform():transformAt(els.source.currentTime||0);
  if(!state.dragging){state.x=t.x;state.y=t.y;state.zoom=t.zoom;syncZoomOnly();}
  sourceToCanvas(els.canvas.getContext('2d',{alpha:false}),els.source,els.canvas.width,els.canvas.height,t,state.mode);
}
function resize(){
  if(!state.clip)return;
  const r=els.stage.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);
  els.canvas.width=Math.max(2,Math.round(r.width*dpr));
  els.canvas.height=Math.max(2,Math.round(r.height*dpr));
  draw();
}

function syncZoomOnly(){
  els.zoom.value=String(state.zoom);
  els.zoomValue.textContent=Math.round(state.zoom*100)+'%';
}
function syncControls(){
  els.stage.className='stage ratio-'+state.aspect.replace(':','-');
  els.aspect.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.aspect===state.aspect));
  els.background.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));
  els.auto.checked=state.auto;
  els.autoHint.textContent=state.auto?'Auto keyframe on':'Auto keyframe off';
  syncZoomOnly();els.count.textContent=String(state.keyframes.length);
  requestAnimationFrame(resize);
}

function upsertKeyframe(time,transform=currentTransform()){
  if(!state.clip)return;
  time=clamp(time,0,state.duration||time);
  if(!state.keyframes.length&&time>.08){
    state.keyframes.push({time:0,x:.5,y:.5,zoom:1});
  }
  const existing=state.keyframes.find(k=>Math.abs(k.time-time)<.08);
  if(existing)Object.assign(existing,{time,x:transform.x,y:transform.y,zoom:transform.zoom});
  else state.keyframes.push({time,x:transform.x,y:transform.y,zoom:transform.zoom});
  state.keyframes.sort((a,b)=>a.time-b.time);
  renderKeyframes();saveProjectSoon();
}

function renderKeyframes(){
  els.rail.innerHTML='';
  els.count.textContent=String(state.keyframes.length);
  const d=state.duration||1;
  for(const frame of state.keyframes){
    const marker=document.createElement('button');
    marker.className='keyframe-marker';
    marker.style.left=(clamp(frame.time/d,0,1)*100)+'%';
    marker.title='Keyframe at '+fmt(frame.time);
    marker.onclick=()=>{
      els.source.currentTime=frame.time;
      state.x=frame.x;state.y=frame.y;state.zoom=frame.zoom;
      syncZoomOnly();draw();
    };
    els.rail.appendChild(marker);
  }
}
function removeNearest(){
  if(!state.keyframes.length)return;
  const time=els.source.currentTime||0;
  let index=0,best=Infinity;
  state.keyframes.forEach((k,i)=>{const delta=Math.abs(k.time-time);if(delta<best){best=delta;index=i;}});
  state.keyframes.splice(index,1);renderKeyframes();saveProjectSoon();draw();
}

function setAspect(value){state.aspect=value;syncControls();saveProjectSoon();}
function setMode(value){state.mode=value;syncControls();saveProjectSoon();}
function resetFrame(){
  state.x=.5;state.y=.5;state.zoom=1;
  if(state.auto)upsertKeyframe(els.source.currentTime||0);
  syncZoomOnly();draw();
}

function mediaType(){
  return ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t))||'';
}

async function exportClip(){
  if(!state.clip||state.exporting)return;
  state.exporting=true;els.export.disabled=true;els.exportStatus.textContent='Rendering locally…';

  const dims=state.aspect==='9:16'?[1080,1920]:state.aspect==='1:1'?[1080,1080]:[1920,1080];
  const canvas=document.createElement('canvas');canvas.width=dims[0];canvas.height=dims[1];
  const ctx=canvas.getContext('2d',{alpha:false});
  const canvasStream=canvas.captureStream(30);
  const originalTime=els.source.currentTime||0,wasPaused=els.source.paused,oldRate=els.source.playbackRate;
  els.source.pause();els.source.playbackRate=1;els.source.currentTime=0;
  await new Promise(resolve=>els.source.addEventListener('seeked',resolve,{once:true}));

  let sourceStream=null,audio=[];
  try{
    sourceStream=els.source.captureStream();
    audio=sourceStream.getAudioTracks();
  }catch(_){audio=[];}
  const out=new MediaStream([...canvasStream.getVideoTracks(),...audio]);
  const type=mediaType();
  const recorder=new MediaRecorder(out,type?{mimeType:type,videoBitsPerSecond:12000000}:undefined);
  const chunks=[];
  recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};

  let raf=0,done=false;
  const paint=()=>{
    sourceToCanvas(ctx,els.source,canvas.width,canvas.height,transformAt(els.source.currentTime||0),state.mode);
    if(!done)raf=requestAnimationFrame(paint);
  };

  const blobPromise=new Promise((resolve,reject)=>{
    recorder.onerror=()=>reject(recorder.error||new Error('Export failed'));
    recorder.onstop=()=>resolve(new Blob(chunks,{type:recorder.mimeType||'video/webm'}));
  });

  const stop=()=>{
    if(done)return;done=true;
    if(recorder.state!=='inactive')recorder.stop();
  };
  const endHandler=()=>stop();
  els.source.addEventListener('ended',endHandler,{once:true});

  recorder.start(1000);paint();
  await els.source.play().catch(()=>{});
  const safety=setTimeout(stop,Math.max(2000,(state.duration||30)*1000+2500));
  const blob=await blobPromise.catch(error=>{els.exportStatus.textContent='Export failed: '+error.message;return null;});
  clearTimeout(safety);cancelAnimationFrame(raf);
  canvasStream.getTracks().forEach(t=>t.stop());audio.forEach(t=>t.stop());
  try{sourceStream?.getTracks().forEach(t=>t.stop());}catch(_){}

  if(blob){
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='clippah-'+state.aspect.replace(':','x')+'-'+Date.now()+'.webm';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    els.exportStatus.textContent='Exported '+sizeLabel(blob.size);
  }

  els.source.playbackRate=oldRate;
  try{els.source.currentTime=Math.min(originalTime,state.duration||originalTime);}catch(_){}
  if(!wasPaused)els.source.play().catch(()=>{});
  state.exporting=false;els.export.disabled=false;
}

els.play.onclick=()=>els.source.paused?els.source.play():els.source.pause();
els.source.onplay=()=>els.play.textContent='Pause';
els.source.onpause=()=>els.play.textContent='Play';
els.source.ontimeupdate=()=>{
  if(!state.duration)return;
  els.scrub.value=String(Math.round(clamp(els.source.currentTime/state.duration,0,1)*1000));
  els.time.textContent=fmt(els.source.currentTime);
  draw();
};
els.scrub.oninput=()=>{
  if(!state.duration)return;
  els.source.currentTime=Number(els.scrub.value)/1000*state.duration;
  draw();
};

els.aspect.onclick=e=>{const v=e.target.closest('button')?.dataset.aspect;if(v)setAspect(v);};
els.background.onclick=e=>{const v=e.target.closest('button')?.dataset.mode;if(v)setMode(v);};
els.zoom.oninput=()=>{state.zoom=Number(els.zoom.value);syncZoomOnly();draw();};
els.zoom.onchange=()=>{if(state.auto)upsertKeyframe(els.source.currentTime||0);saveProjectSoon();};
els.auto.onchange=()=>{state.auto=els.auto.checked;syncControls();saveProjectSoon();};
els.add.onclick=()=>upsertKeyframe(els.source.currentTime||0);
els.remove.onclick=removeNearest;
els.clear.onclick=()=>{state.keyframes=[];renderKeyframes();saveProjectSoon();draw();};
els.reset.onclick=resetFrame;

els.canvas.onpointerdown=e=>{
  if(!state.clip)return;
  state.dragging=true;els.canvas.classList.add('dragging');els.canvas.setPointerCapture(e.pointerId);
  const t=transformAt(els.source.currentTime||0);
  state.x=t.x;state.y=t.y;state.zoom=t.zoom;
  state.dragStart={x:e.clientX,y:e.clientY};state.transformStart={...t};
};
els.canvas.onpointermove=e=>{
  if(!state.dragging)return;
  const r=els.canvas.getBoundingClientRect();
  const dx=(e.clientX-state.dragStart.x)/Math.max(1,r.width);
  const dy=(e.clientY-state.dragStart.y)/Math.max(1,r.height);
  state.x=clamp(state.transformStart.x-dx/Math.max(1,state.zoom),0,1);
  state.y=clamp(state.transformStart.y-dy/Math.max(1,state.zoom),0,1);
  draw();
};
function endDrag(e){
  if(!state.dragging)return;
  state.dragging=false;els.canvas.classList.remove('dragging');
  try{els.canvas.releasePointerCapture(e.pointerId);}catch(_){}
  if(state.auto)upsertKeyframe(els.source.currentTime||0);
  saveProjectSoon();draw();
}
els.canvas.onpointerup=endDrag;els.canvas.onpointercancel=endDrag;
els.canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  const t=transformAt(els.source.currentTime||0);
  if(!state.dragging){state.x=t.x;state.y=t.y;state.zoom=t.zoom;}
  state.zoom=clamp(state.zoom*(e.deltaY<0?1.06:.943),1,3);
  syncZoomOnly();draw();
  clearTimeout(state.wheelTimer);
  state.wheelTimer=setTimeout(()=>{if(state.auto)upsertKeyframe(els.source.currentTime||0);saveProjectSoon();},180);
},{passive:false});

els.download.onclick=()=>{
  if(!state.clip)return;
  const url=URL.createObjectURL(state.clip.blob),a=document.createElement('a');
  a.href=url;a.download='clippah-source-'+Date.now()+'.webm';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
};
els.delete.onclick=async()=>{
  if(!state.clip)return;
  const id=state.clip.id;
  await deleteClip(id);
  await chrome.storage.local.remove('edit:'+id);
  if(state.url)URL.revokeObjectURL(state.url);
  state.clip=null;state.url=null;els.source.removeAttribute('src');els.source.load();
  els.editor.hidden=true;els.inspector.hidden=true;els.empty.hidden=false;els.workspace.classList.add('empty');
  await refresh();
};
els.refresh.onclick=refresh;
els.settings.onclick=()=>chrome.runtime.openOptionsPage();
els.export.onclick=exportClip;
window.addEventListener('resize',resize);

async function refresh(){
  state.clips=await listClips();renderList();
  if(state.clip){
    const found=state.clips.find(c=>c.id===state.clip.id);
    if(found)state.clip=found;
  }else if(state.clips.length)await selectClip(state.clips[0]);
}
function tick(){if(state.clip&&!state.exporting)draw();requestAnimationFrame(tick);}
refresh();tick();