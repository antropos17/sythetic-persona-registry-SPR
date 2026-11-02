import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {brotliDecompressSync,gunzipSync} from 'node:zlib';
import {createApp} from '../server/app.mjs';

function get(base,path,headers={},method='GET'){
  return new Promise((resolve,reject)=>{
    const req=request(base,{path,method,headers},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
    });req.on('error',reject);req.end();
  });
}
test('dist representations negotiate encodings, preserve contents and cache separately',async t=>{
  const app=createApp({dbPath:':memory:'});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());
  const base=`http://127.0.0.1:${app.server.address().port}`;
  for(const path of ['/dist/app.js','/dist/app.css']){
    const identity=await get(base,path,{'Accept-Encoding':'identity'});
    assert.equal(identity.status,200);assert.equal(identity.headers['content-encoding'],undefined);
    for(const [header,encoding,decode] of [['br, gzip','br',brotliDecompressSync],['gzip, br;q=0','gzip',gunzipSync],['gzip;q=1, br;q=0.5','gzip',gunzipSync]]){
      const compressed=await get(base,path,{'Accept-Encoding':header});
      assert.equal(compressed.status,200);assert.equal(compressed.headers['content-encoding'],encoding);
      assert.equal(compressed.headers['content-type'],identity.headers['content-type']);assert.match(compressed.headers.vary,/Accept-Encoding/i);
      assert.deepEqual(decode(compressed.body),identity.body);assert.notEqual(compressed.headers.etag,identity.headers.etag);
      const head=await get(base,path,{'Accept-Encoding':header},'HEAD');assert.equal(head.headers.etag,compressed.headers.etag);assert.equal(head.body.length,0);
      const cached=await get(base,path,{'Accept-Encoding':header,'If-None-Match':compressed.headers.etag});assert.equal(cached.status,304);assert.equal(cached.headers['content-encoding'],encoding);assert.equal(cached.body.length,0);
    }
    const disabled=await get(base,path,{'Accept-Encoding':'br;q=0, gzip;q=0'});assert.equal(disabled.headers['content-encoding'],undefined);assert.deepEqual(disabled.body,identity.body);
    const wildcard=await get(base,path,{'Accept-Encoding':'*;q=1, br;q=0'});assert.equal(wildcard.headers['content-encoding'],'gzip');
    const unknown=await get(base,path,{'Accept-Encoding':'unknown'});assert.equal(unknown.headers['content-encoding'],undefined);
    const preferredIdentity=await get(base,path,{'Accept-Encoding':'gzip;q=0.5, identity;q=1'});assert.equal(preferredIdentity.headers['content-encoding'],undefined);
    const impossible=await get(base,path,{'Accept-Encoding':'br;q=0, gzip;q=0, identity;q=0'});assert.equal(impossible.status,406);
    const wildcardForbidden=await get(base,path,{'Accept-Encoding':'*;q=0'});assert.equal(wildcardForbidden.status,406);
    const mismatch=await get(base,path,{'Accept-Encoding':'gzip','If-None-Match':identity.headers.etag});assert.equal(mismatch.status,200);
    assert.equal((await get(base,path+'.br')).status,404);
  }
});
