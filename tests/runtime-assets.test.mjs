import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {request} from 'node:http';
import {createApp} from '../server/app.mjs';

test('all application scripts and fonts are served locally with usable content types',async()=>{
  const app=createApp({dbPath:':memory:'});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  try{
    const response=await fetch(base),page=await response.text();
    assert.doesNotMatch(page,/(?:src|href)="https:\/\/(?:cdnjs|cdn\.jsdelivr|fonts\.)/);
    assert.match(response.headers.get('content-security-policy'),/script-src 'self'(?:;|$)/);
    assert.doesNotMatch(response.headers.get('content-security-policy'),/sha256-/);
    assert.doesNotMatch(response.headers.get('content-security-policy'),/https:/);
    assert.equal([...page.matchAll(/<script src="\.\.\/assets\/vendor\/[^"]+" integrity="sha384-[^"]+" crossorigin="anonymous"><\/script>/g)].length,3);
    const {assets}=JSON.parse(readFileSync(new URL('../data/runtime-assets.json',import.meta.url),'utf8'));
    const runtime=assets.filter(a=>/\.(js|css|woff2)$/.test(a.path));
    assert.ok(runtime.length>=5);
    for(const {path} of runtime){
      const asset=await fetch(base+'/'+path);
      assert.equal(asset.status,200,path);
      assert.match(asset.headers.get('content-type'),path.endsWith('.js')?/^text\/javascript/:path.endsWith('.css')?/^text\/css/:/^font\/woff2/);
      assert.ok((await asset.arrayBuffer()).byteLength>0,path);
    }
    for(const [path,type] of [['/dist/app.js',/^text\/javascript/],['/dist/app.css',/^text\/css/]]){
      const output=await fetch(base+path);
      assert.equal(output.status,200,path);
      assert.match(output.headers.get('content-type'),type);
      assert.match(output.headers.get('cache-control'),/no-cache/);
      assert.ok((await output.arrayBuffer()).byteLength>0);
      const head=await fetch(base+path,{method:'HEAD'});
      assert.equal(head.status,200);
      assert.equal(await head.text(),'');
    }
    for(const path of ['/dist/%2e%2e/server/app.mjs','/dist/%2fapp.js','/dist/app.js%2f..%2f..%2fserver%2fapp.mjs','/dist/other.js','/site/app/main.mjs','/site/styles/main.css','/server/app.mjs','/docs/REVIEW-AND-PROVENANCE.md']){
      const status=await new Promise((resolve,reject)=>{const req=request(base,{path,method:'GET'},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});
      assert.equal(status,404,path);
    }
    const file=await fetch(base+'/assets/vendor/react.production.min.js',{method:'HEAD'});
    assert.equal(file.status,200);
    assert.equal(await file.text(),'');
  }finally{await app.close();}
});
