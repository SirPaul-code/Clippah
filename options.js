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


// License activation uses only server-verified entitlements; never a local premium flag.
const licenseStatus=document.querySelector('#license-status');
const licenseInput=document.querySelector('#license-key');
const licenseActivate=document.querySelector('#license-activate');
const licenseDeactivate=document.querySelector('#license-deactivate');
const licenseRefresh=document.querySelector('#license-refresh');
function renderLicense(info){
  const pro=info.active&&info.features.includes('no_watermark');
  licenseStatus.textContent=pro?'Pro active — watermark removed':info.configured?
    'Free — watermark enabled; enter a Pro key':'Free — watermark enabled; license server not yet deployed';
  licenseStatus.classList.toggle('pro',pro);
  licenseActivate.disabled=!info.configured;
  licenseDeactivate.disabled=!info.configured&&!info.active;
}
ClippahLicense.onChange(renderLicense);
ClippahLicense.start().then(()=>ClippahLicense.refresh(true)).then(renderLicense)
  .catch(error=>{licenseStatus.textContent=error.message;});
licenseActivate.addEventListener('click',async()=>{
  licenseActivate.disabled=true;licenseStatus.textContent='Activating license...';
  try{
    await ClippahLicense.activate(licenseInput.value);
    licenseInput.value='';
    renderLicense(ClippahLicense.status());
  }catch(error){licenseStatus.textContent='Activation failed: '+error.message;}
  finally{licenseActivate.disabled=!ClippahLicense.status().configured;}
});
licenseDeactivate.addEventListener('click',async()=>{
  licenseDeactivate.disabled=true;
  try{renderLicense(await ClippahLicense.deactivate());}
  catch(error){licenseStatus.textContent=error.message;}
  finally{licenseDeactivate.disabled=false;}
});
licenseRefresh.addEventListener('click',async()=>{
  licenseRefresh.disabled=true;
  try{renderLicense(await ClippahLicense.refresh(true));}
  catch(error){licenseStatus.textContent=error.message;}
  finally{licenseRefresh.disabled=false;}
});
