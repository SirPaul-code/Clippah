import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';
import {codeDigest,installDigest,tokenDigest,randomKey,safeEqual,entitled,licenseResponse} from './core.mjs';

const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:6,connectionTimeoutMillis:7500});
const pepper=process.env.LICENSE_HASH_PEPPER||'';
const admin=process.env.LICENSE_ADMIN_TOKEN||'';
if(!process.env.DATABASE_URL||pepper.length<24||admin.length<24){
  throw Error('Set DATABASE_URL, LICENSE_HASH_PEPPER and LICENSE_ADMIN_TOKEN (minimum 24 characters)');
}
const counters=new Map();
setInterval(()=>{for(const [key,v] of counters)if(v.end<Date.now())counters.delete(key)},60000).unref();
function send(res,status,obj){
  res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(obj));
}
function fail(res,status,error){send(res,status,{ok:false,error})}
function bearer(req){return /^Bearer (.+)$/i.exec(String(req.headers.authorization||''))?.[1]||''}
function authenticate(req){
  if(!safeEqual(bearer(req),admin))throw Object.assign(Error('Unauthorized'),{status:401});
}
function install(body){
  try{return installDigest(body.installationId,pepper)}
  catch(_){throw Object.assign(Error('Invalid installation ID'),{status:400})}
}
function read(req){
  return new Promise((resolve,reject)=>{
    let size=0;const data=[];let aborted=false;
    req.on('data',part=>{
      size+=part.length;
      if(size>32768&&!aborted){
        aborted=true;reject(Object.assign(Error('Request too large'),{status:413}));req.destroy();
      }else if(!aborted)data.push(part);
    });
    req.on('end',()=>{if(!aborted)resolve(Buffer.concat(data))});
    req.on('error',reject);
  });
}
function parse(raw){
  try{
    const x=JSON.parse(raw.toString());
    if(x&&typeof x==='object'&&!Array.isArray(x))return x;
  }catch(_){}
  throw Object.assign(Error('Invalid JSON object'),{status:400});
}
async function transaction(fn){
  const db=await pool.connect();
  try{await db.query('BEGIN');const result=await fn(db);await db.query('COMMIT');return result}
  catch(error){await db.query('ROLLBACK').catch(()=>{});throw error}
  finally{db.release()}
}
async function activate(res,body){
  const key=String(body.licenseKey||'').trim(),device=install(body);
  if(!/^CLP-(?:[A-F0-9]{8}-){4}[A-F0-9]{8}$/i.test(key))return fail(res,400,'Invalid key format');
  const token=crypto.randomBytes(32).toString('hex');
  const result=await transaction(async db=>{
    const result=await db.query('SELECT * FROM clippah_licenses WHERE code_hash=$1 FOR UPDATE',[codeDigest(key,pepper)]);
    const row=result.rows[0];
    if(!entitled(row))throw Object.assign(Error('License is inactive or invalid'),{status:403});
    const old=await db.query('SELECT id FROM clippah_activations WHERE license_id=$1 AND installation_hash=$2',[row.id,device]);
    if(!old.rowCount){
      const count=await db.query('SELECT count(*)::int AS n FROM clippah_activations WHERE license_id=$1',[row.id]);
      if(count.rows[0].n>=row.seat_limit)throw Object.assign(Error('Device limit exceeded'),{status:409});
    }
    const sql='INSERT INTO clippah_activations (license_id,installation_hash,token_hash) VALUES($1,$2,$3) '+
      'ON CONFLICT (license_id,installation_hash) DO UPDATE SET token_hash=excluded.token_hash,last_verified_at=now()';
    await db.query(sql,[row.id,device,tokenDigest(token,pepper)]);
    return {...licenseResponse(row),token};
  });
  send(res,200,result);
}
async function identity(req,body){
  const token=bearer(req);
  if(!/^[a-f0-9]{64}$/i.test(token))return null;
  const sql='SELECT a.id AS activation_id,l.* FROM clippah_activations a '+
    'JOIN clippah_licenses l ON l.id=a.license_id WHERE a.token_hash=$1 AND a.installation_hash=$2';
  const result=await pool.query(sql,[tokenDigest(token,pepper),install(body)]);
  return result.rows[0]||null;
}
async function verify(req,res,body){
  const row=await identity(req,body);
  if(!entitled(row))return fail(res,403,'License is not active');
  await pool.query('UPDATE clippah_activations SET last_verified_at=now() WHERE id=$1',[row.activation_id]);
  send(res,200,licenseResponse(row));
}
async function deactivate(req,res,body){
  const row=await identity(req,body);
  if(row)await pool.query('DELETE FROM clippah_activations WHERE id=$1',[row.activation_id]);
  send(res,200,{ok:true});
}
async function issue(req,res,body){
  authenticate(req);
  const seats=Math.max(1,Math.min(20,Number(body.seatLimit)||2));
  const days=body.validDays==null?null:Number(body.validDays);
  if(days!==null&&(!Number.isInteger(days)||days<1||days>3650))return fail(res,400,'Invalid validDays');
  const key=randomKey();
  const expiry=days===null?null:new Date(Date.now()+days*86400000);
  const result=await pool.query('INSERT INTO clippah_licenses(code_hash,email,seat_limit,expires_at) VALUES ($1,$2,$3,$4) RETURNING id',
    [codeDigest(key,pepper),String(body.email||'').slice(0,254)||null,seats,expiry]);
  send(res,201,{ok:true,id:result.rows[0].id,licenseKey:key,expiresAt:expiry,seatLimit:seats});
}
async function revoke(req,res,body){
  authenticate(req);
  if(!/^[0-9a-f-]{36}$/i.test(String(body.id||'')))return fail(res,400,'Invalid license UUID');
  const result=await pool.query("UPDATE clippah_licenses SET status='revoked',updated_at=now() WHERE id=$1 RETURNING id",[body.id]);
  send(res,result.rowCount?200:404,{ok:result.rowCount>0});
}
const server=http.createServer(async(req,res)=>{
  const origin=String(req.headers.origin||'');
  if(/^chrome-extension:\/\/[a-p]{32}$/.test(origin)){
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Allow-Headers','authorization,content-type');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  }
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  const key=(req.socket.remoteAddress||'unknown')+':'+req.url.split('?')[0];
  let limit=counters.get(key);if(!limit||limit.end<Date.now())limit={count:0,end:Date.now()+60000};
  limit.count++;counters.set(key,limit);
  if(limit.count>(req.url.startsWith('/admin')?10:60))return fail(res,429,'Rate limit');
  try{
    if(req.method==='GET'&&req.url==='/health')return send(res,200,{ok:true,service:'Clippah license API'});
    if(req.method!=='POST')return fail(res,404,'Unknown endpoint');
    const body=parse(await read(req));
    if(req.url==='/v1/activate')return await activate(res,body);
    if(req.url==='/v1/verify')return await verify(req,res,body);
    if(req.url==='/v1/deactivate')return await deactivate(req,res,body);
    if(req.url==='/admin/issue')return await issue(req,res,body);
    if(req.url==='/admin/revoke')return await revoke(req,res,body);
    return fail(res,404,'Unknown endpoint');
  }catch(e){
    console.error('License server:',e?.message||e);
    return fail(res,e.status||500,e.status&&e.status<500?e.message:'Internal server error');
  }
});
server.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('Clippah license API running'));
