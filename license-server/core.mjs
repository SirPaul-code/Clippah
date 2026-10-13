import crypto from 'node:crypto';
export function normalizeKey(value){
  return String(value||'').toUpperCase().trim().replace(/\s+/g,'');
}
export function codeDigest(key,pepper){
  if(!pepper||pepper.length<24)throw new Error('Missing sufficiently long LICENSE_HASH_PEPPER');
  return crypto.createHmac('sha256',pepper).update(normalizeKey(key)).digest('hex');
}
export function installDigest(id,pepper){
  if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw new Error('Invalid installation ID');
  return crypto.createHmac('sha256',pepper).update('install:'+id.toLowerCase()).digest('hex');
}
export function tokenDigest(token,pepper){
  if(!/^[0-9a-f]{64}$/i.test(String(token||'')))throw new Error('Invalid activation token');
  return crypto.createHmac('sha256',pepper).update('token:'+token).digest('hex');
}
export function randomKey(){
  const s=crypto.randomBytes(20).toString('hex').toUpperCase();
  return 'CLP-'+s.match(/.{1,8}/g).join('-');
}
export function checkoutKey(sessionId,secret){
  if(!/^cs_(?:test_|live_)?[A-Za-z0-9]{12,200}$/.test(sessionId))throw new Error('Invalid Stripe checkout ID');
  if(!secret||secret.length<24)throw new Error('Missing LICENSE_ISSUE_SECRET');
  const s=crypto.createHmac('sha256',secret).update('clippah:'+sessionId).digest('hex').slice(0,40).toUpperCase();
  return 'CLP-'+s.match(/.{1,8}/g).join('-');
}
export function safeEqual(a,b){
  const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));
  return x.length===y.length&&crypto.timingSafeEqual(x,y);
}
export function verifyStripeSignature(raw,header,secret,now=Date.now()){
  if(!secret)throw new Error('Missing STRIPE_WEBHOOK_SECRET');
  const values=Object.fromEntries(String(header||'').split(',').map(piece=>piece.trim().split('=',2)));
  const timestamp=Number(values.t);
  if(!Number.isInteger(timestamp)||Math.abs(now/1000-timestamp)>300)throw new Error('Outdated Stripe webhook timestamp');
  const signatures=String(header).split(',').filter(x=>x.trim().startsWith('v1=')).map(x=>x.trim().slice(3));
  const expected=crypto.createHmac('sha256',secret).update(String(timestamp)+'.').update(raw).digest('hex');
  if(!signatures.some(sig=>safeEqual(expected,sig)))throw new Error('Invalid Stripe webhook signature');
  return true;
}
export function entitled(license,now=new Date()){
  return Boolean(license&&license.status==='active'&&(!license.expires_at||new Date(license.expires_at)>now));
}
export const FEATURES={pro:['no_watermark']};
export function licenseResponse(license){
  const active=entitled(license);
  return {active,plan:active?'pro':'free',features:active?FEATURES.pro:[],expiresAt:license?.expires_at||null};
}
