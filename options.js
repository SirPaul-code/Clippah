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


// Studio shortcuts are scoped to Clippah Studio and stored in extension local storage.
const shortcutDefaults={play:'Space',keyframe:'KeyK',cut:'KeyC',select:'KeyV',split:'KeyS'};
let shortcutKeys={...shortcutDefaults};
const shortcutFields=[...document.querySelectorAll('[data-shortcut]')];
function shortcutDisplay(code){return code==='Space'?'Space':code.startsWith('Key')?code.slice(3):code.startsWith('Digit')?code.slice(5):code;}
function paintShortcuts(message='Ready'){
  for(const field of shortcutFields)field.value=shortcutDisplay(shortcutKeys[field.dataset.shortcut]);
  document.querySelector('#shortcuts-status').textContent=message;
}
chrome.storage.local.get('clippah:shortcuts').then(values=>{
  shortcutKeys={...shortcutDefaults,...(values['clippah:shortcuts']||{})};paintShortcuts();
});
for(const field of shortcutFields){
  field.addEventListener('focus',()=>{field.value='Press a key...';});
  field.addEventListener('blur',()=>paintShortcuts());
  field.addEventListener('keydown',async event=>{
    event.preventDefault();event.stopPropagation();
    if(event.code==='Escape'){field.blur();return;}
    if(event.ctrlKey||event.metaKey||event.altKey||['ShiftLeft','ShiftRight','ControlLeft','ControlRight','AltLeft','AltRight','MetaLeft','MetaRight','Tab','Enter'].includes(event.code)){
      paintShortcuts('Choose a single non-modifier key.');return;
    }
    if(Object.entries(shortcutKeys).some(([key,code])=>key!==field.dataset.shortcut&&code===event.code)){
      paintShortcuts('That key is already assigned.');return;
    }
    shortcutKeys[field.dataset.shortcut]=event.code;
    await chrome.storage.local.set({'clippah:shortcuts':shortcutKeys});
    paintShortcuts('Saved. Reopen Studio to use the updated key.');
    field.blur();
  });
}
document.querySelector('#shortcuts-reset').addEventListener('click',async()=>{
  shortcutKeys={...shortcutDefaults};
  await chrome.storage.local.set({'clippah:shortcuts':shortcutKeys});
  paintShortcuts('Shortcuts reset to defaults.');
});

const checkUpdates=document.querySelector('#check-updates');
const updateStatus=document.querySelector('#update-status');
const updateDetails=document.querySelector('#update-details');
const updateLink=document.querySelector('#update-link');
function compareVersion(a,b){
  const aa=String(a).split('.').map(Number),bb=String(b).split('.').map(Number);
  for(let i=0;i<Math.max(aa.length,bb.length);i++){
    if((aa[i]||0)!==(bb[i]||0))return (aa[i]||0)>(bb[i]||0)?1:-1;
  }
  return 0;
}
checkUpdates.addEventListener('click',async()=>{
  checkUpdates.disabled=true;updateLink.hidden=true;updateStatus.textContent='Checking GitHub...';updateDetails.textContent='';
  try{
    const request=await fetch('https://raw.githubusercontent.com/SirPaul-code/Clippah/main/manifest.json',{cache:'no-store'});
    if(!request.ok)throw new Error('GitHub returned HTTP '+request.status);
    const manifest=await request.json();
    if(!/^\d+\.\d+\.\d+$/.test(manifest.version))throw new Error('Invalid release version.');
    const installed=chrome.runtime.getManifest().version;
    if(compareVersion(manifest.version,installed)>0){
      updateStatus.textContent='New version '+manifest.version+' available';
      updateDetails.textContent='Installed: '+installed+'. Open GitHub, replace the files in your current extension folder and click Reload in chrome://extensions. Never uninstall the extension just to upgrade.';
      updateLink.href='https://github.com/SirPaul-code/Clippah/tree/main';updateLink.hidden=false;
    }else{
      updateStatus.textContent='You are up to date ('+installed+')';
      updateDetails.textContent='GitHub main: '+manifest.version;
    }
  }catch(error){
    updateStatus.textContent='Update check failed';
    updateDetails.textContent=error.message+' · Check your internet connection or GitHub access.';
  }finally{checkUpdates.disabled=false;}
});
