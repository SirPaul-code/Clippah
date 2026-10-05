const enabled=document.querySelector('#enabled');
const url=document.querySelector('#url');
const token=document.querySelector('#token');
const save=document.querySelector('#save');
const status=document.querySelector('#status');
const dot=document.querySelector('#dot');

async function load(){
  const settings=await chrome.storage.local.get({agentBridgeEnabled:false,agentBridgeUrl:'ws://127.0.0.1:47281/extension',agentBridgeToken:''});
  enabled.checked=settings.agentBridgeEnabled;
  url.value=settings.agentBridgeUrl;
  token.value=settings.agentBridgeToken;
  await refreshStatus();
}
async function refreshStatus(){
  const result=await chrome.runtime.sendMessage({type:'GET_AGENT_BRIDGE_STATUS'}).catch(()=>({connected:false,error:'Service worker unavailable.'}));
  dot.className='dot';
  if(!enabled.checked){status.textContent='Disabled';return;}
  if(result?.connected){dot.classList.add('connected');status.textContent='Connected to local MCP bridge';}
  else if(result?.error){dot.classList.add('error');status.textContent=result.error;}
  else status.textContent='Waiting for local MCP bridge';
}
save.addEventListener('click',async()=>{
  await chrome.storage.local.set({agentBridgeEnabled:enabled.checked,agentBridgeUrl:url.value.trim()||'ws://127.0.0.1:47281/extension',agentBridgeToken:token.value.trim()});
  await chrome.runtime.sendMessage({type:'AGENT_RECONNECT'}).catch(()=>{});
  await refreshStatus();
});
enabled.addEventListener('change',refreshStatus);
setInterval(refreshStatus,2500);
load();
