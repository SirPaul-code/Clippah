'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const updater=require('../updater.js');
const enc=new TextEncoder();
const baseList=['manifest.json','runtime-files.json','background.js','editor.js','options.js','updater.js'];
function bytes(text){return enc.encode(text);}
const utf8=data=>new TextDecoder().decode(data);

class VirtualFile {
  constructor(parent,name) {this.parent=parent;this.name=name;}
  async getFile() {const data=this.parent.entries.get(this.name);return {arrayBuffer: async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};}
  async createWritable() {
    const self=this;
    let staged=null;
    return {
      async write(data) {if(self.parent.failWrite===self.name)throw Error(self.parent.failReason||'Simulated write failure');staged=Uint8Array.from(data);},
      async close() {self.parent.entries.set(self.name,staged);},
      async abort() {staged=null;}
    };
  }
}
class VirtualFolder {
  constructor(){this.entries=new Map();this.folders=new Map();this.actions=[];this.failWrite=null;}
  async getDirectoryHandle(name,opts={}) {
    if(!this.folders.has(name)) {
      if(!opts.create)throw Object.assign(Error('Not found'),{name:'NotFoundError'});
      this.folders.set(name,new VirtualFolder());
    }
    return this.folders.get(name);
  }
  async getFileHandle(name,opts={}) {
    if(!this.entries.has(name)){
      if(!opts.create)throw Object.assign(Error('Not found'),{name:'NotFoundError'});
      this.entries.set(name,new Uint8Array());
    }
    this.actions.push('access '+name);
    return new VirtualFile(this,name);
  }
  async removeEntry(name) {this.actions.push('remove '+name);this.entries.delete(name);}
}

test('compare semantic versions without lexicographic mistakes',()=>{
  assert.equal(updater.versionCompare('0.5.10','0.5.9'),1);
  assert.equal(updater.versionCompare('0.5.2','0.5.2'),0);
  assert.equal(updater.versionCompare('0.5.3','0.5.9'),-1);
  assert.throws(()=>updater.versionCompare('nonsense','0.5.2'),/version/);
});

test('runtime file list rejects traversal, duplicates and executable payloads',()=>{
  assert.deepEqual(updater.validateFileList({schema:1,files:baseList}),baseList);
  for(const bad of ['../secret.js','/absolute.js','updater.ps1','folder\\script.js','options.js','a//b.js']) {
    const list=[...baseList,bad];
    assert.throws(()=>updater.validateFileList({schema:1,files:list}),/Unsafe|duplicate/);
  }
});

test('Git blob digest matches Git object hashing',async()=>{
  const payload=bytes('hello\n');
  const expected=crypto.createHash('sha1').update(Buffer.from('blob '+payload.length+'\0')).update(payload).digest('hex');
  assert.equal(await updater.gitBlobSha1(payload,crypto.webcrypto),expected);
  assert.equal(expected,'ce013625030ba8dba906f756967f9e9ca394464a');
});

test('successful install writes manifest last and preserves unrelated files',async()=>{
  const folder=new VirtualFolder();
  for(const path of baseList)folder.entries.set(path,bytes('OLD '+path));
  folder.entries.set('not-a-runtime-file.txt',bytes('untouched'));
  const fresh=new Map(baseList.map(path=>[path,bytes('NEW '+path)]));
  const progress=[];
  const result=await updater.installPrepared(folder,{version:'0.5.4',files:baseList,downloaded:fresh},step=>progress.push(step.path));
  assert.equal(result.updated,baseList.length);
  assert.equal(progress.at(-1),'manifest.json');
  assert.equal(utf8(folder.entries.get('options.js')),'NEW options.js');
  assert.equal(utf8(folder.entries.get('not-a-runtime-file.txt')),'untouched');
});

test('failed install rolls back all previously modified files and manifest',async()=>{
  const folder=new VirtualFolder();
  for(const path of baseList)folder.entries.set(path,bytes('OLD '+path));
  folder.failWrite='options.js';
  const fresh=new Map(baseList.map(path=>[path,bytes('NEW '+path)]));
  await assert.rejects(()=>updater.installPrepared(folder,{version:'0.5.4',files:baseList,downloaded:fresh}),/restored/);
  for(const path of baseList)assert.equal(utf8(folder.entries.get(path)),'OLD '+path);
});

test('install rejects incomplete release before mutating files',async()=>{
  const folder=new VirtualFolder();
  const fresh=new Map(baseList.filter(name=>name!=='editor.js').map(path=>[path,bytes('NEW '+path)]));
  await assert.rejects(()=>updater.installPrepared(folder,{version:'0.5.4',files:baseList,downloaded:fresh}),/all files/);
  assert.equal(folder.actions.length,0);
});

test('GitHub release verifies every downloaded file against immutable tree blobs',async()=>{
  const sha='a'.repeat(40),treeSha='b'.repeat(40),oldVersion='0.5.3',newVersion='0.5.4';
  const manifest=bytes(JSON.stringify({name:'Clippah',version:newVersion}));
  const runtime=bytes(JSON.stringify({schema:1,files:baseList}));
  const map=new Map(baseList.map(path=>[path,bytes('contents '+path)]));
  map.set('manifest.json',manifest);map.set('runtime-files.json',runtime);
  const tree=baseList.map(path=>({path,type:'blob',sha:crypto.createHash('sha1').update(Buffer.from('blob '+map.get(path).length+'\0')).update(map.get(path)).digest('hex'),size:map.get(path).length}));
  const responses=new Map([
    ['https://api.github.com/repos/SirPaul-code/Clippah/commits/main',bytes(JSON.stringify({sha,commit:{tree:{sha:treeSha}}}))],
    ['https://api.github.com/repos/SirPaul-code/Clippah/git/trees/'+treeSha+'?recursive=1',bytes(JSON.stringify({tree,truncated:false}))]
  ]);
  for(const [path,data] of map)responses.set('https://raw.githubusercontent.com/SirPaul-code/Clippah/'+sha+'/'+path,data);
  const fetchFake=async url=>{
    const data=responses.get(url);if(!data)return {ok:false,status:404};
    return {ok:true,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};
  };
  const result=await updater.fetchRelease(oldVersion,()=>{},fetchFake);
  assert.equal(result.version,newVersion);
  assert.equal(result.downloaded.size,baseList.length);
  const bad=bytes('tampered contents');
  responses.set('https://raw.githubusercontent.com/SirPaul-code/Clippah/'+sha+'/options.js',bad);
  await assert.rejects(()=>updater.fetchRelease(oldVersion,()=>{},fetchFake),/integrity check/);
});


test('Windows/Chrome security policy failure identifies the file and verifies original versions',async()=>{
  const folder=new VirtualFolder();
  for(const path of baseList)folder.entries.set(path,bytes('OLD '+path));
  folder.failWrite='updater.js';
  folder.failReason='Aborted due to security policy';
  const fresh=new Map(baseList.map(path=>[path,bytes('NEW '+path)]));
  let problem;
  try{await updater.installPrepared(folder,{version:'0.6.1',files:baseList,downloaded:fresh})}
  catch(error){problem=error}
  assert.ok(problem,'A blocked update must throw');
  assert.equal(problem.failedFile,'updater.js');
  assert.equal(problem.failedPhase,'write');
  assert.equal(problem.securityBlocked,true);
  assert.equal(problem.rollbackVerified,true);
  assert.match(problem.message,/Aborted due to security policy/);
  for(const path of baseList)assert.equal(utf8(folder.entries.get(path)),'OLD '+path);
});

test('write policy denial before new file content must not leave empty placeholder file',async()=>{
  const folder=new VirtualFolder();
  for(const path of baseList)folder.entries.set(path,bytes('OLD '+path));
  folder.failWrite='new-theme.css';
  folder.failReason='Aborted due to security policy';
  const all=[...baseList.filter(x=>x!=='manifest.json'),'new-theme.css','manifest.json'];
  const fresh=new Map(all.map(path=>[path,bytes('NEW '+path)]));
  await assert.rejects(
    ()=>updater.installPrepared(folder,{version:'0.6.1',files:all,downloaded:fresh}),
    error=>error.failedFile==='new-theme.css'&&error.securityBlocked&&error.rollbackVerified
  );
  assert.equal(folder.entries.has('new-theme.css'),false);
  for(const path of baseList)assert.equal(utf8(folder.entries.get(path)),'OLD '+path);
});

test('unchanged runtime files skip writes and preserve manifest-last write order',async()=>{
  const folder=new VirtualFolder();
  const fresh=new Map(baseList.map(path=>[path,bytes('CURRENT '+path)]));
  for(const [path,data] of fresh)folder.entries.set(path,bytes(utf8(data)));
  const progress=[];
  const result=await updater.installPrepared(folder,{version:'0.6.1',files:baseList,downloaded:fresh},info=>progress.push(info));
  assert.equal(result.updated,0);
  assert.equal(progress.filter(x=>x.phase==='writing').length,0);
  assert.equal(progress.filter(x=>x.phase==='unchanged').length,baseList.length);
});
