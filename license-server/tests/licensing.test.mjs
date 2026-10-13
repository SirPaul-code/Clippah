import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {codeDigest,installDigest,tokenDigest,randomKey,safeEqual,entitled,licenseResponse,verifyStripeSignature} from '../core.mjs';
const secret='not-in-repository-test-secret-with-many-characters';
test('license key digest is deterministic and does not expose raw key',()=>{
  const key=randomKey();
  assert.match(key,/^CLP-(?:[A-F0-9]{8}-){4}[A-F0-9]{8}$/);
  assert.equal(codeDigest(key,secret),codeDigest(key.toLowerCase(),secret));
  assert.notEqual(codeDigest(key,secret),key);
});
test('installation identity is a UUID and signed with server pepper',()=>{
  const uuid=crypto.randomUUID();
  const digest=installDigest(uuid,secret);
  assert.match(digest,/^[a-f0-9]{64}$/);
  assert.throws(()=>installDigest('../fake',secret),/installation/);
});
test('activation token HMAC only accepts securely generated tokens',()=>{
  const value=crypto.randomBytes(32).toString('hex');
  assert.match(tokenDigest(value,secret),/^[a-f0-9]{64}$/);
  assert.throws(()=>tokenDigest('x',secret),/token/);
});
test('entitlement obeys expiry and revocation',()=>{
  assert.equal(entitled({status:'active',expires_at:null}),true);
  assert.equal(entitled({status:'revoked'}),false);
  assert.equal(entitled({status:'active',expires_at:new Date(Date.now()-1000).toISOString()}),false);
  const result=licenseResponse({status:'active'});
  assert.deepEqual(result.features,['no_watermark']);
});
test('timing-safe comparison rejects different lengths',()=>{
  assert.equal(safeEqual('foo','foo'),true);
  assert.equal(safeEqual('foo','bar'),false);
  assert.equal(safeEqual('foo','fooo'),false);
});
test('Stripe signatures reject tampered messages and expired timestamps',()=>{
  const raw=Buffer.from('{"id":"evt_test"}');
  const timestamp=Math.floor(Date.now()/1000);
  const sig=crypto.createHmac('sha256',secret).update(timestamp+'.').update(raw).digest('hex');
  assert.equal(verifyStripeSignature(raw,'t='+timestamp+',v1='+sig,secret),true);
  assert.throws(()=>verifyStripeSignature(Buffer.from('tampered'),'t='+timestamp+',v1='+sig,secret),/signature/);
  assert.throws(()=>verifyStripeSignature(raw,'t=123,v1='+sig,secret),/timestamp/);
});
