/* Pure camera-timeline math: shared by the browser editor and Node regression tests. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.ClippahTimeline=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  const safeDuration=value=>Math.max(0,Number(value)||0);
  function widthForTimeline(viewportWidth,duration,pixelsPerSecond,label=96){
    const content=Math.ceil(safeDuration(duration)*clamp(pixelsPerSecond,2,180));
    return clamp(Math.max(Math.round(viewportWidth)||0,label+content),label+100,100000);
  }
  function timeForPoint(clientX,left,width,duration){
    return clamp((clientX-left)/Math.max(1,width),0,1)*safeDuration(duration);
  }
  function positionForTime(time,duration){
    return clamp(time/Math.max(.001,safeDuration(duration)),0,1)*100;
  }
  function zoomAtPointer(transform,region,pointer,newZoom,fill='crop'){
    const before=clamp(Number(transform.zoom)||1,1,3),after=clamp(Number(newZoom)||1,1,3);
    if(before===after)return {...transform,zoom:after};
    const px=clamp(pointer.x,0,1),py=clamp(pointer.y,0,1);
    const existing={x:clamp(transform.x,0,1),y:clamp(transform.y,0,1),zoom:before};
    if(fill!=='crop'){
      // Fit/mirror/blur canvas layouts have a different transform.
      // Keeping the camera centre is less surprising than an inaccurate cursor shift.
      return {...existing,zoom:after};
    }
    const w=Math.max(1,region.width),h=Math.max(1,region.height),aspect=Math.max(.05,region.aspect);
    let cropW=w,cropH=h;
    if(w/h>aspect)cropW=h*aspect;else cropH=w/aspect;
    // A normalized cursor is converted into a source-pixel focal point first.
    // Move the next crop to keep that pixel beneath the mouse after zooming.
    function focus(position,normalized,full,crop){
      const oldExtent=crop/before,newExtent=crop/after;
      const oldOrigin=position*(full-oldExtent);
      const sourcePoint=oldOrigin+normalized*oldExtent;
      return clamp((sourcePoint-normalized*newExtent)/Math.max(.0001,full-newExtent),0,1);
    }
    return {
      x:focus(existing.x,px,w,cropW),
      y:focus(existing.y,py,h,cropH),
      zoom:after
    };
  }
  function moveKeyframe(frames,id,newTime,min,max,fps=30){
    const sorted=frames.slice().sort((a,b)=>a.time-b.time);
    const idx=sorted.findIndex(frame=>frame.id===id);
    if(idx<0)return {moved:false,time:null};
    const separation=1/clamp(fps,1,120);
    const lower=Math.max(min,idx>0?sorted[idx-1].time+separation:min);
    const upper=Math.min(max,idx<sorted.length-1?sorted[idx+1].time-separation:max);
    if(lower>upper)return {moved:false,time:sorted[idx].time};
    const time=clamp(newTime,lower,upper);
    sorted[idx].time=time;
    frames.sort((a,b)=>a.time-b.time);
    return {moved:true,time};
  }
  function cameraWindow(transform){
    const zoom=clamp(transform.zoom||1,1,3);
    const size=1/zoom;
    return {left:clamp((transform.x||.5)*(1-size),0,1),top:clamp((transform.y||.5)*(1-size),0,1),width:size,height:size};
  }
  return {widthForTimeline,timeForPoint,positionForTime,zoomAtPointer,moveKeyframe,cameraWindow};
});
