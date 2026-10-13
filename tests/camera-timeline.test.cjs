'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const math=require('../camera-timeline.js');
test('ruler can access time zero and the exact end',()=>{
  assert.equal(math.timeForPoint(96,96,960,40),0);
  assert.equal(math.timeForPoint(1056,96,960,40),40);
  assert.equal(math.timeForPoint(-100,96,960,40),0);
  assert.equal(math.timeForPoint(3000,96,960,40),40);
});
test('timeline horizontal width can expand for precise edits',()=>{
  assert.equal(math.widthForTimeline(700,60,32,96),2016);
  assert.equal(math.widthForTimeline(900,5,32,96),900);
  assert.ok(math.widthForTimeline(900,60,48,96)>math.widthForTimeline(900,60,16,96));
});
test('pointer-centered camera zoom retains focus in x and y',()=>{
  const base={x:.5,y:.5,zoom:1},px=.28,py=.74,region={width:1920,height:1080,aspect:16/9};
  const next=math.zoomAtPointer(base,region,{x:px,y:py},2,'crop');
  assert.ok(Math.abs(next.x-px)<.00001);
  assert.ok(Math.abs(next.y-py)<.00001);
  assert.equal(next.zoom,2);
  assert.deepEqual(math.zoomAtPointer(base,region,{x:px,y:py},1,'crop'),base);
});
test('zooming when fit or blur is selected keeps camera anchor stable',()=>{
  const base={x:.35,y:.61,zoom:1.3};
  const next=math.zoomAtPointer(base,{width:1080,height:1920,aspect:1},{x:.9,y:.1},1.8,'fit');
  assert.equal(next.x,base.x);assert.equal(next.y,base.y);
});
test('keyframe movement preserves the identity and strict order of neighbors',()=>{
  const frames=[{id:'a',time:1},{id:'b',time:2},{id:'c',time:4}];
  let result=math.moveKeyframe(frames,'b',3.1,0,5,30);
  assert.equal(result.moved,true);
  assert.equal(frames[1].time,3.1);
  result=math.moveKeyframe(frames,'b',4.9,0,5,30);
  assert.ok(result.time<4);
  result=math.moveKeyframe(frames,'b',0,0,5,30);
  assert.ok(result.time>1);
});
test('missing keyframe ID is ignored and clamped normalized thumbnails are valid',()=>{
  const frames=[{id:'a',time:1}];
  assert.equal(math.moveKeyframe(frames,'missing',2,0,5).moved,false);
  const rect=math.cameraWindow({x:.5,y:.5,zoom:2});
  assert.deepEqual(rect,{left:.25,top:.25,width:.5,height:.5});
  assert.equal(math.positionForTime(-1,20),0);
  assert.equal(math.positionForTime(30,20),100);
});
