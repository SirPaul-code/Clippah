/* Clippah user-initiated in-place updater.
 * Only works for unpacked installations in a folder explicitly granted by the user.
 * No executable downloads, native host, elevated access, or remote code execution.
 */
(function (root) {
  'use strict';

  const REPO = 'SirPaul-code/Clippah';
  const API = 'https://api.github.com/repos/' + REPO;
  const RAW = 'https://raw.githubusercontent.com/' + REPO + '/';
  const REQUIRED = ['manifest.json','runtime-files.json','background.js','editor.js','options.js','updater.js'];
  const ALLOWED_EXTENSION = /\.(?:js|html|css|json|png|svg|webp|woff2)$/i;
  const DB_NAME = 'clippah-updater';
  const DB_STORE = 'handles';
  const DB_KEY = 'extension-directory';
  const decoder = new TextDecoder();

  function versionCompare(a, b) {
    const parse = value => {
      if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) throw new Error('Unexpected Clippah version.');
      return value.split('.').map(Number);
    };
    const x = parse(a), y = parse(b);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
    return 0;
  }

  function validateFileList(manifest) {
    if (!manifest || manifest.schema !== 1 || !Array.isArray(manifest.files)) throw new Error('Unsupported GitHub update file list.');
    if (manifest.files.length > 100 || manifest.files.length < REQUIRED.length) throw new Error('Invalid update file count.');
    const seen = new Set();
    for (const path of manifest.files) {
      if (typeof path !== 'string' || path.length > 150 || !/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(path) ||
        path.startsWith('.') || path.endsWith('/') || path.includes('//') || path.split('/').includes('..') ||
        !ALLOWED_EXTENSION.test(path) || seen.has(path)) throw new Error('Unsafe or duplicate update filename.');
      seen.add(path);
    }
    for (const path of REQUIRED) if (!seen.has(path)) throw new Error('Incomplete update: missing ' + path);
    return [...seen];
  }

  function hex(buffer) {
    return [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2,'0')).join('');
  }

  async function gitBlobSha1(data, cryptoApi = root.crypto) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const header = new TextEncoder().encode('blob ' + bytes.byteLength + '\0');
    const combined = new Uint8Array(header.length + bytes.length);
    combined.set(header);
    combined.set(bytes,header.length);
    return hex(await cryptoApi.subtle.digest('SHA-1',combined));
  }

  async function sha256(data, cryptoApi = root.crypto) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    return hex(await cryptoApi.subtle.digest('SHA-256',bytes));
  }

  async function fetchBytes(url, fetchImpl = root.fetch.bind(root)) {
    const response = await fetchImpl(url, {cache:'no-store',redirect:'follow'});
    if (!response.ok) throw new Error('GitHub HTTP ' + response.status + ' (' + url.split('/').pop() + ')');
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > 4 * 1024 * 1024) throw new Error('A downloaded file exceeds the 4 MB safety limit.');
    return new Uint8Array(buffer);
  }

  async function fetchJson(url, fetchImpl = root.fetch.bind(root)) {
    return JSON.parse(decoder.decode(await fetchBytes(url,fetchImpl)));
  }

  async function latestCommit(fetchImpl = root.fetch.bind(root)) {
    const commit = await fetchJson(API + '/commits/main',fetchImpl);
    const sha = String(commit?.sha || '').toLowerCase();
    const tree = String(commit?.commit?.tree?.sha || '').toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(sha) || !/^[0-9a-f]{40}$/.test(tree)) throw new Error('GitHub did not provide a valid immutable commit.');
    return {sha,tree};
  }

  async function checkLatest(installedVersion, fetchImpl = root.fetch.bind(root)) {
    const response = await fetchJson(RAW + 'main/manifest.json',fetchImpl);
    if (response?.name !== 'Clippah' || !response?.version) throw new Error('Unexpected remote extension manifest.');
    return {version: response.version, newer: versionCompare(response.version,installedVersion) > 0};
  }

  async function fetchRelease(installedVersion, progress = () => {}, fetchImpl = root.fetch.bind(root)) {
    const commit = await latestCommit(fetchImpl);
    const [manifestBytes, fileListBytes, tree] = await Promise.all([
      fetchBytes(RAW + commit.sha + '/manifest.json',fetchImpl),
      fetchBytes(RAW + commit.sha + '/runtime-files.json',fetchImpl),
      fetchJson(API + '/git/trees/' + commit.tree + '?recursive=1',fetchImpl)
    ]);
    const manifest = JSON.parse(decoder.decode(manifestBytes));
    if (manifest?.name !== 'Clippah' || !manifest?.version || versionCompare(manifest.version,installedVersion) <= 0)
      throw new Error('No newer Clippah version is available on GitHub main.');
    if (tree?.truncated || !Array.isArray(tree?.tree)) throw new Error('GitHub returned an incomplete source tree.');
    const files = validateFileList(JSON.parse(decoder.decode(fileListBytes)));
    const expected = new Map(tree.tree.filter(e => e.type === 'blob').map(e => [e.path,{sha:e.sha,size:e.size}]));
    for (const path of files) {
      const item = expected.get(path);
      if (!item || !/^[0-9a-f]{40}$/.test(item.sha) || item.size > 4 * 1024 * 1024) throw new Error('GitHub tree is missing a valid '+path);
    }
    const downloaded = new Map();
    downloaded.set('manifest.json',manifestBytes);
    downloaded.set('runtime-files.json',fileListBytes);
    for (const path of files) {
      if (!downloaded.has(path)) downloaded.set(path,await fetchBytes(RAW + commit.sha + '/' + path,fetchImpl));
      const data = downloaded.get(path), item = expected.get(path);
      if (data.length !== item.size || await gitBlobSha1(data) !== item.sha) throw new Error('GitHub integrity check failed for ' + path);
      progress({phase:'download',current:downloaded.size,total:files.length,path});
    }
    return {version:manifest.version,sha:commit.sha,files,downloaded};
  }

  async function getFileHandle(rootHandle, path, create) {
    const parts = path.split('/');
    let folder = rootHandle;
    for (const part of parts.slice(0,-1)) folder = await folder.getDirectoryHandle(part,{create:Boolean(create)});
    return {folder,file:await folder.getFileHandle(parts[parts.length-1],{create:Boolean(create)}),basename:parts[parts.length-1]};
  }

  async function readFileBytes(rootHandle,path) {
    try {
      const entry = await getFileHandle(rootHandle,path,false);
      return new Uint8Array(await (await entry.file.getFile()).arrayBuffer());
    } catch (error) {
      if (error?.name === 'NotFoundError') return null;
      throw error;
    }
  }

  function describeFileFailure(error,phase,path){
    const original=String(error?.message||error||'Unknown I/O error');
    const wrapped=new Error('Failed to '+phase+' "'+path+'": '+original);
    wrapped.name=error?.name||'FileUpdateError';
    wrapped.file=path;
    wrapped.phase=phase;
    wrapped.securityBlocked=/aborted due to security policy|blocked by safe browsing|virus detected|malware|blocked by your organization|securityerror/i.test(original);
    return wrapped;
  }

  function sameBytes(a,b){
    if(!a||!b||a.byteLength!==b.byteLength)return false;
    for(let i=0;i<a.byteLength;i++)if(a[i]!==b[i])return false;
    return true;
  }

  async function writeFileBytes(rootHandle,path,bytes){
    let file,stream,phase='open';
    try{
      ({file}=await getFileHandle(rootHandle,path,true));
      phase='create writable';
      stream=await file.createWritable();
      phase='write';
      await stream.write(bytes);
      phase='finalize';
      await stream.close();
    }catch(error){
      if(stream)try{await stream.abort()}catch(_){}
      throw describeFileFailure(error,phase,path);
    }
  }

  async function removeNewFile(rootHandle,path) {
    const parts = path.split('/'), basename = parts.pop();
    let folder = rootHandle;
    for (const part of parts) folder = await folder.getDirectoryHandle(part);
    await folder.removeEntry(basename);
  }

  async function verifyChosenFolder(rootHandle, installedVersion, cryptoApi = root.crypto, fetchImpl = root.fetch.bind(root)) {
    const manifestBytes = await readFileBytes(rootHandle,'manifest.json');
    if (!manifestBytes) throw new Error('Choose the folder with Clippah manifest.json, not its parent.');
    let manifest;
    try {manifest = JSON.parse(decoder.decode(manifestBytes));}
    catch (_) {throw new Error('Selected folder has an invalid manifest.json.');}
    if (manifest.name !== 'Clippah' || manifest.version !== installedVersion)
      throw new Error('That folder is not the running Clippah '+installedVersion+' installation.');
    const local = await readFileBytes(rootHandle,'editor.js');
    if (!local) throw new Error('Selected folder is missing editor.js.');
    const live = await fetchBytes(root.chrome.runtime.getURL('editor.js'),fetchImpl);
    if (await sha256(local,cryptoApi) !== await sha256(live,cryptoApi))
      throw new Error('Selected folder does not match the currently loaded Clippah editor. Pick the exact Load unpacked folder.');
    return true;
  }

  async function installPrepared(folder,release,progress = () => {}){
    const files=validateFileList({schema:1,files:release.files});
    if(!release.downloaded||files.some(path=>!release.downloaded.has(path)))
      throw new Error('Update cannot start until all files have been downloaded and verified.');
    const order=[...files.filter(name=>name!=='manifest.json'),'manifest.json'];
    const backup=new Map();
    // Snapshot every original before mutating anything.
    for(const path of order){
      try{backup.set(path,await readFileBytes(folder,path))}
      catch(error){throw describeFileFailure(error,'read original',path)}
    }
    const modified=[];
    let attempted=null;
    try{
      for(const path of order){
        attempted=path;
        const data=release.downloaded.get(path);
        if(sameBytes(backup.get(path),data)){
          progress({phase:'unchanged',current:modified.length,total:order.length,path});
          continue;
        }
        progress({phase:'writing',current:modified.length,total:order.length,path});
        await writeFileBytes(folder,path,data);
        modified.push(path);
        progress({phase:'install',current:modified.length,total:order.length,path});
      }
      for(const path of order){
        let actual;
        try{actual=await readFileBytes(folder,path)}
        catch(error){throw describeFileFailure(error,'verify installed',path)}
        if(!sameBytes(actual,release.downloaded.get(path)))
          throw describeFileFailure(new Error('Installed file checksum does not match downloaded file'),'verify installed',path);
      }
    }catch(error){
      // A failed createWritable/close can leave a new empty or partial file even
      // if the operation rejected. Restore the attempted path as well.
      const recovery=[...modified];
      if(attempted&&!recovery.includes(attempted))recovery.push(attempted);
      const notRestored=[];
      for(const path of recovery.reverse()){
        try{
          const original=backup.get(path);
          const current=await readFileBytes(folder,path);
          if(original===null){
            if(current!==null)await removeNewFile(folder,path);
          }else if(!sameBytes(current,original)){
            await writeFileBytes(folder,path,original);
          }
          const check=await readFileBytes(folder,path);
          if(original===null?check!==null:!sameBytes(check,original))
            throw new Error('Original file differs after rollback');
        }catch(restoreError){notRestored.push(path+': '+(restoreError?.message||String(restoreError)))}
      }
      const restored=notRestored.length===0;
      const status=restored
        ?'Previous extension files were verified restored.'
        :'ROLLBACK INCOMPLETE for '+notRestored.join('; ')+'. Do not reload the extension. Restore the release ZIP manually.';
      const wrapped=new Error((error?.message||String(error))+'. '+status);
      wrapped.failedFile=error?.file||attempted;
      wrapped.failedPhase=error?.phase||'install';
      wrapped.securityBlocked=Boolean(error?.securityBlocked)||
        /aborted due to security policy|blocked by safe browsing|virus detected|malware|securityerror/i.test(error?.message||'');
      wrapped.rollbackVerified=restored;
      throw wrapped;
    }
    return {version:release.version,updated:modified.length};
  }

  function openDb() {
    return new Promise((resolve,reject) => {
      const req = indexedDB.open(DB_NAME,1);
      req.onupgradeneeded = () => {if (!req.result.objectStoreNames.contains(DB_STORE))req.result.createObjectStore(DB_STORE);};
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  }

  async function savedDirectory() {
    const db = await openDb();
    try {
      return await new Promise((resolve,reject) => {
        const req = db.transaction(DB_STORE,'readonly').objectStore(DB_STORE).get(DB_KEY);
        req.onsuccess = () => resolve(req.result||null);
        req.onerror = () => reject(req.error);
      });
    } finally {db.close();}
  }

  async function rememberDirectory(handle) {
    const db = await openDb();
    try {
      await new Promise((resolve,reject) => {
        const tx=db.transaction(DB_STORE,'readwrite');
        tx.objectStore(DB_STORE).put(handle,DB_KEY);
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
      });
    } finally {db.close();}
  }

  async function unlinkDirectory() {
    const db=await openDb();
    try {
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(DB_STORE,'readwrite');
        tx.objectStore(DB_STORE).delete(DB_KEY);
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
      });
    } finally {db.close();}
  }

  const core={versionCompare,validateFileList,gitBlobSha1,sha256,latestCommit,checkLatest,fetchRelease,
    verifyChosenFolder,readFileBytes,writeFileBytes,installPrepared};
  if (typeof module !== 'undefined' && module.exports) module.exports=core;

  if (typeof document === 'undefined' || !document.querySelector('#check-updates')) return;
  const ui={
    check:document.querySelector('#check-updates'),
    link:document.querySelector('#link-update-folder'),
    unlink:document.querySelector('#unlink-update-folder'),
    install:document.querySelector('#install-update'),
    status:document.querySelector('#update-status'),
    details:document.querySelector('#update-details'),
    progress:document.querySelector('#update-progress'),
    bar:document.querySelector('#update-progress-bar'),
    folder:document.querySelector('#update-folder-name'),
    github:document.querySelector('#update-link')
  };
  let linkedFolder=null,latest=null,busy=false;
  const installed=root.chrome.runtime.getManifest().version;
  function message(status,detail=''){ui.status.textContent=status;ui.details.textContent=detail;}
  function paint(){
    ui.install.hidden=!latest?.newer;
    ui.install.disabled=busy;
    ui.check.disabled=busy;
    ui.link.disabled=busy;
    ui.unlink.disabled=busy||!linkedFolder;
    ui.folder.textContent=linkedFolder?'Linked folder: '+linkedFolder.name:'Not linked: choose the folder containing manifest.json once.';
  }
  function updateProgress(info) {
    ui.progress.hidden=false;
    const percent=Math.round(info.current/Math.max(1,info.total)*100);
    ui.bar.style.width=percent+'%';
    ui.progress.setAttribute('aria-valuenow',String(percent));
    message(info.phase==='download'?'Downloading verified files...':'Installing update...',
      info.current+'/'+info.total+' · '+info.path);
  }

  (async () => {
    try {linkedFolder=await savedDirectory();}
    catch (error) {message('Cannot access saved folder',error.message);}
    paint();
  })();
  ui.link.addEventListener('click',async()=>{
    if (typeof root.showDirectoryPicker !== 'function'){
      message('Folder access unsupported','Use a current desktop Chrome browser to enable in-app updates.');return;
    }
    let choice;
    try {choice=root.showDirectoryPicker({id:'clippah-extension',mode:'readwrite'});}
    catch (error){message('Could not open folder picker',error.message);return;}
    busy=true;paint();
    try {
      const folder=await choice;
      await verifyChosenFolder(folder,installed);
      await rememberDirectory(folder);
      linkedFolder=folder;
      message('Update folder linked','Future versions can be installed from this page without downloading ZIP files. Chrome may request permission again.');
    }catch(error){
      if (error?.name!=='AbortError') message('Folder not linked',error.message);
    }finally {busy=false;paint();}
  });
  ui.unlink.addEventListener('click',async()=>{
    busy=true;paint();
    try {await unlinkDirectory();linkedFolder=null;message('Folder unlinked','Your extension and saved clips were not changed.');}
    catch(error){message('Could not unlink folder',error.message);}
    finally{busy=false;paint();}
  });
  ui.check.addEventListener('click',async()=>{
    busy=true;paint();ui.github.hidden=true;
    message('Checking GitHub for updates...');
    try {
      latest=await checkLatest(installed);
      if (latest.newer){
        message('Clippah '+latest.version+' is available','Installed: '+installed+'. Click Install update to apply directly to your linked extension folder.');
        ui.github.hidden=false;
      }else message('Clippah '+installed+' is up to date','GitHub main: '+latest.version+'. Nothing to install.');
    } catch(error){latest=null;message('Could not check GitHub',error.message);}
    finally{busy=false;paint();}
  });
  ui.install.addEventListener('click',async()=>{
    if(busy||!latest?.newer)return;
    if(!linkedFolder){
      message('Link the extension folder first','Click Choose folder and select the directory used by Chrome Load unpacked.');
      return;
    }
    // Re-grant permissions from this user gesture before requesting anything from GitHub.
    busy=true;paint();
    try{
      const permission={mode:'readwrite'};
      if(await linkedFolder.queryPermission(permission)!=='granted' &&
         await linkedFolder.requestPermission(permission)!=='granted')
        throw new Error('Write permission was not granted. Choose the folder again.');
      await verifyChosenFolder(linkedFolder,installed);
      if(!root.confirm('Update Clippah now? Open Studio tabs will reload. Clips and settings remain stored under the same extension ID.'))return;
      message('Preparing verified update','Checking immutable GitHub commit and file checksums...');
      ui.progress.hidden=false;ui.bar.style.width='0%';
      const release=await fetchRelease(installed,updateProgress);
      await installPrepared(linkedFolder,release,updateProgress);
      await root.chrome.storage.local.set({'clippah:last-update':{version:release.version,time:Date.now()}});
      message('Clippah '+release.version+' installed','Refreshing the extension. Do not uninstall it.');
      ui.bar.style.width='100%';
      setTimeout(()=>root.chrome.runtime.reload(),900);
    }catch(error){
      message('Update not installed',error.message);
      console.error('Clippah updater:',error);
    }finally{busy=false;paint();}
  });
})(typeof globalThis!=='undefined'?globalThis:this);
