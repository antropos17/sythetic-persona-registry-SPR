import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApp} from '../server/app.mjs';

test('each persona has a small thumbnail served by the registry',async t=>{
  const people=JSON.parse(readFileSync(new URL('../data/personas.json',import.meta.url),'utf8')).personas;
  const app=createApp({dbPath:':memory:'});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>app.close());
  const base=`http://127.0.0.1:${app.server.address().port}`;
  for(const person of people){
    const response=await fetch(`${base}/assets/portrait-thumbs/${person.id}.jpg`);
    assert.equal(response.status,200,person.id);
    assert.equal(response.headers.get('content-type'),'image/jpeg',person.id);
    const image=Buffer.from(await response.arrayBuffer());
    assert.ok(image.length<10000,person.id);
    assert.deepEqual([...image.subarray(0,3)],[0xff,0xd8,0xff],person.id);
  }
});
