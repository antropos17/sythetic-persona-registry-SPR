import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.mjs';

test('evidence source accepts the multiline text offered by the form', async t => {
  const app=createApp({dbPath:':memory:'});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>app.close());
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const report={who:'Example',what:'other',details:'A fictional report for a multiline evidence source.'};
  const created=await fetch(base+'/api/v1/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)}).then(r=>r.json());
  const source='Original issuer: Sample Studio\nProvided by the owner';
  const response=await fetch(base+`/api/v1/cases/${created.id}/evidence`,{method:'POST',headers:{Authorization:`Bearer ${created.accessToken}`,'Content-Type':'application/pdf','X-Evidence-Kind':'other','X-File-Name':'sample.pdf','X-Evidence-Source':encodeURIComponent(source)},body:'%PDF- sample'});
  assert.equal(response.status,201);
  assert.equal((await response.json()).sourceStatement,source);
  const bad=await fetch(base+`/api/v1/cases/${created.id}/evidence`,{method:'POST',headers:{Authorization:`Bearer ${created.accessToken}`,'Content-Type':'application/pdf','X-Evidence-Kind':'other','X-File-Name':'sample.pdf','X-Evidence-Source':encodeURIComponent('Bad\u0000 source statement')},body:'%PDF- sample'});
  assert.equal(bad.status,422);
});
