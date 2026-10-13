/* Clippah licensing client. Server-confirmed entitlements only; defaults to Free.
 * A browser extension is user-editable and therefore cannot enforce DRM against a determined patcher.
 */
(function(root){
  'use strict';
  const CONFIG_URL='license-config.json';
  const STORAGE='clippah:license-credential';
  const CHECK_INTERVAL=5*60*1000;
  let config={apiBase:''},entitlement={active:false,plan:'free',features:[]};
  let lastChecked=0,initialized=null,inflight=null,handlers=new Set(),timer=null,installationId=null;

  async function readConfig(){
    try{
      const resp=await fetch(root.chrome.runtime.getURL(CONFIG_URL),{cache:'no-store'});
      const value=await resp.json();
      const input=String(value?.apiBase||'').replace(/\/+$/,'');
      if(!input||!/^https:\/\/[a-z0-9.-]+(?::443)?$/i.test(input))return {apiBase:''};
      return {apiBase:input};
    }catch(error){console.warn('Clippah license configuration not available',error);return {apiBase:''};}
  }
  function notify(){
    for(const callback of handlers)try{callback({...entitlement});}catch(error){console.warn(error);}
  }
  function setEntitlement(next){
    const features=Array.isArray(next?.features)?next.features.filter(x=>typeof x==='string'):[];
    entitlement={active:next?.active===true,plan:next?.active===true?String(next.plan||'pro'):'free',
      features:next?.active===true?features:[],expiresAt:next?.expiresAt||null};
    lastChecked=Date.now();notify();
    return status();
  }
  function status(){return {...entitlement,configured:Boolean(config.apiBase),lastChecked};}
  function has(name){return entitlement.active&&entitlement.features.includes(name);}
  async function loadCredentials(){
    return (await root.chrome.storage.local.get(STORAGE))[STORAGE]||null;
  }
  async function post(endpoint,payload,token){
    if(!config.apiBase)throw new Error('The Clippah license server is not configured yet.');
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),8500);
    try{
      const response=await fetch(config.apiBase+endpoint,{
        method:'POST',headers:{'Content-Type':'application/json',...(token?{'Authorization':'Bearer '+token}:{})},
        body:JSON.stringify(payload||{}),cache:'no-store',signal:controller.signal
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'License server rejected the request (HTTP '+response.status+').');
      return data;
    }finally{clearTimeout(timeout);}
  }
  async function refresh(force=false){
    await start();
    if(inflight)return inflight;
    if(!force&&Date.now()-lastChecked<CHECK_INTERVAL)return status();
    inflight=(async()=>{
      const credentials=await loadCredentials();
      if(!config.apiBase||!credentials?.token||!credentials?.installationId)
        return setEntitlement({active:false});
      try{
        const response=await post('/v1/verify',{installationId:credentials.installationId},credentials.token);
        return setEntitlement(response);
      }catch(error){
        // Do not trust local flags when server verification cannot be completed.
        setEntitlement({active:false});
        console.warn('Clippah entitlement verification failed:',error?.message||error);
        return status();
      }
    })().finally(()=>{inflight=null;});
    return inflight;
  }
  async function start(){
    if(initialized)return initialized;
    initialized=(async()=>{
      config=await readConfig();
      const stored=(await root.chrome.storage.local.get(STORAGE))[STORAGE];
      installationId=stored?.installationId||root.crypto.randomUUID();
      if(!timer&&typeof window!=='undefined')timer=setInterval(()=>refresh(true).catch(()=>{}),CHECK_INTERVAL);
      return status();
    })();
    return initialized;
  }
  async function activate(code){
    await start();
    if(!config.apiBase)throw new Error('License server not configured. Free mode remains available.');
    const value=String(code||'').trim().toUpperCase();
    if(value.length<12||value.length>128)throw new Error('Enter your complete Clippah license key.');
    const installationIdLocal=installationId||root.crypto.randomUUID();
    const result=await post('/v1/activate',{licenseKey:value,installationId:installationIdLocal});
    if(!result?.token||result?.active!==true||!result.features?.includes('no_watermark'))
      throw new Error('The server did not confirm a Pro license.');
    await root.chrome.storage.local.set({[STORAGE]:{token:result.token,installationId:installationIdLocal}});
    return setEntitlement(result);
  }
  async function deactivate(){
    await start();
    const credentials=await loadCredentials();
    if(credentials?.token&&config.apiBase){
      try{await post('/v1/deactivate',{installationId:credentials.installationId},credentials.token);}
      catch(error){console.warn('License deactivation failed; local credentials will still be cleared.',error);}
    }
    await root.chrome.storage.local.remove(STORAGE);
    return setEntitlement({active:false});
  }
  function onChange(callback){handlers.add(callback);return ()=>handlers.delete(callback);}
  root.ClippahLicense={start,refresh,activate,deactivate,onChange,status,has};
})(typeof globalThis!=='undefined'?globalThis:this);
