import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {createApp} from '../server/app.mjs';

const report=JSON.stringify({who:'Example',what:'other',details:'A fictional report for a local rate limit test.',email:''});
async function fixture(t){
  const app=createApp({dbPath:':memory:'});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>app.close());
  return app;
}
function pendingRequest(app,body=report){
  let client;
  const done=new Promise((resolve,reject)=>{
    client=request({hostname:'127.0.0.1',port:app.server.address().port,path:'/api/v1/reports',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
    client.on('error',reject);
  });
  return {client,done,body};
}

test('simultaneous submissions cannot exceed the hourly limit',async t=>{
  const app=await fixture(t),requests=Array.from({length:15},()=>pendingRequest(app));
  let seen=0;
  const received=new Promise(resolve=>app.server.on('request',()=>{if(++seen===15)resolve();}));
  requests.forEach(({client})=>client.flushHeaders());
  await received;
  requests.forEach(({client,body})=>client.end(body));
  const statuses=await Promise.all(requests.map(item=>item.done));
  assert.equal(statuses.filter(status=>status===201).length,10);
  assert.equal(statuses.filter(status=>status===429).length,5);
  assert.equal(app.db.count(),10);
});

test('invalid submissions release their reservation without consuming the success quota',async t=>{
  const app=await fixture(t),invalid=pendingRequest(app,'{}');
  invalid.client.end(invalid.body);
  assert.equal(await invalid.done,422);
  for(let i=0;i<10;i++){const item=pendingRequest(app);item.client.end(item.body);assert.equal(await item.done,201);}
  const extra=pendingRequest(app);extra.client.end(extra.body);assert.equal(await extra.done,429);
  assert.equal(app.db.count(),10);
});
