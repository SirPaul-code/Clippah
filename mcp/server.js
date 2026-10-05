import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOST='127.0.0.1';
const PORT=Number(process.env.CLIPPAH_BRIDGE_PORT||47281);
const TOKEN=loadToken();
let extension=null;
let seq=0;
const pending=new Map();

function loadToken(){
  if(process.env.CLIPPAH_TOKEN) return process.env.CLIPPAH_TOKEN.trim();
  const dir=join(homedir(),'.clippah');
  const path=join(dir,'mcp-token');
  try{
    const value=readFileSync(path,'utf8').trim();
    if(value) return value;
  }catch(_){}
  mkdirSync(dir,{recursive:true});
  const value=randomBytes(24).toString('hex');
  writeFileSync(path,value+'\n',{mode:0o600});
  return value;
}

const wss=new WebSocketServer({host:HOST,port:PORT,path:'/extension'});

wss.on('connection',(socket,request)=>{
  const url=new URL(request.url||'/extension','http://'+HOST+':'+PORT);
  if(url.searchParams.get('token')!==TOKEN){
    socket.close(1008,'Invalid pairing token');
    return;
  }
  if(extension&&extension!==socket){
    try{extension.close(1012,'Replaced by newer Clippah extension connection');}catch(_){}
  }
  extension=socket;
  console.error('[clippah-mcp] Extension connected.');

  socket.on('message',raw=>{
    let message;
    try{message=JSON.parse(raw.toString());}catch(_){return;}
    if(message.type!=='response'||!message.id) return;
    const item=pending.get(message.id);
    if(!item) return;
    pending.delete(message.id);
    clearTimeout(item.timer);
    if(message.error) item.reject(new Error(message.error));
    else item.resolve(message.result);
  });
  socket.on('close',()=>{
    if(extension===socket) extension=null;
    console.error('[clippah-mcp] Extension disconnected.');
  });
});

wss.on('listening',()=>{
  console.error('[clippah-mcp] Local bridge: ws://'+HOST+':'+PORT+'/extension');
  console.error('[clippah-mcp] Pairing token: '+TOKEN);
  console.error('[clippah-mcp] Paste the token into Clippah Settings -> Agent Bridge.');
});
wss.on('error',error=>console.error('[clippah-mcp] Bridge error: '+error.message));

setInterval(()=>{
  if(extension?.readyState===WebSocket.OPEN){
    try{extension.send(JSON.stringify({type:'ping',at:Date.now()}));}catch(_){}
  }
},20000).unref();

function callExtension(method,params={},timeoutMs=12000){
  if(!extension||extension.readyState!==WebSocket.OPEN){
    return Promise.reject(new Error('Clippah extension is not connected. Pair it in Clippah Settings -> Agent Bridge.'));
  }
  const id='mcp-'+Date.now()+'-'+(++seq);
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{
      pending.delete(id);
      reject(new Error('Clippah timed out while handling '+method+'.'));
    },timeoutMs);
    pending.set(id,{resolve,reject,timer});
    extension.send(JSON.stringify({type:'request',id,method,params}));
  });
}

function result(value){
  const ok=value?.ok!==false;
  return {content:[{type:'text',text:JSON.stringify(value??null,null,2)}],...(ok?{}:{isError:true})};
}
async function invoke(method,params={}){
  try{return result(await callExtension(method,params));}
  catch(error){return {content:[{type:'text',text:error?.message||String(error)}],isError:true};}
}

function createServer(){
  const server=new McpServer({name:'clippah',version:'0.1.0'});

  server.registerTool('clippah_status',{
    title:'Clippah status',
    description:'Inspect the active browser video, playhead, duration, recording state and markers.',
    annotations:{readOnlyHint:true}
  },async()=>invoke('status'));

  server.registerTool('clippah_play',{
    title:'Play active video',
    description:'Play the video currently detected by Clippah.'
  },async()=>invoke('play'));

  server.registerTool('clippah_pause',{
    title:'Pause active video',
    description:'Pause the video currently detected by Clippah.'
  },async()=>invoke('pause'));

  server.registerTool('clippah_seek',{
    title:'Seek active video',
    description:'Move the detected video playhead to an absolute time in seconds.',
    inputSchema:{seconds:z.number().nonnegative()}
  },async({seconds})=>invoke('seek',{seconds}));

  server.registerTool('clippah_start_clip',{
    title:'Start clip',
    description:'Start a Clippah clip at the current playhead.'
  },async()=>invoke('start_clip'));

  server.registerTool('clippah_finish_clip',{
    title:'Finish clip',
    description:'Finish the current clip and save it locally to Clippah Studio.'
  },async()=>invoke('finish_clip'));

  server.registerTool('clippah_cancel_clip',{
    title:'Cancel clip',
    description:'Cancel the current clip without saving.'
  },async()=>invoke('cancel_clip'));

  server.registerTool('clippah_get_markers',{
    title:'Get markers',
    description:'Read clip ranges saved for the active video page.',
    annotations:{readOnlyHint:true}
  },async()=>invoke('get_markers'));

  server.registerTool('clippah_list_clips',{
    title:'List local clips',
    description:'List locally stored clip metadata. Video bytes are never returned through MCP.',
    annotations:{readOnlyHint:true}
  },async()=>invoke('list_clips'));

  server.registerTool('clippah_open_studio',{
    title:'Open Clippah Studio',
    description:'Open Clippah Studio in a browser tab.'
  },async()=>invoke('open_studio'));

  return server;
}

void serveStdio(createServer);
console.error('[clippah-mcp] MCP stdio server ready.');
