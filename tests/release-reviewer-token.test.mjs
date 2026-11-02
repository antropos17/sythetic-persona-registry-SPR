import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.mjs';

test('reviewer credentials fail fast when the bearer format cannot represent them', () => {
  assert.throws(() => createApp({dbPath:':memory:', reviewerToken:'x'.repeat(31)}), /at least 32 URL-safe characters/);
  assert.throws(() => createApp({dbPath:':memory:', reviewerToken:'x'.repeat(32)+'+'}), /URL-safe characters/);
  assert.throws(() => createApp({dbPath:':memory:', reviewerToken:'x'.repeat(32)+' '}), /URL-safe characters/);
});

test('a configured URL-safe reviewer credential works over HTTP', async t => {
  const token='A_9-'.repeat(11);
  const app=createApp({dbPath:':memory:',reviewerToken:token});
  await new Promise(resolve => app.server.listen(0,'127.0.0.1',resolve));
  t.after(() => app.close());
  const base=`http://127.0.0.1:${app.server.address().port}`;
  assert.equal((await fetch(base+'/api/v1/review/cases',{headers:{Authorization:`Bearer ${token}`}})).status,200);
  assert.equal((await fetch(base+'/api/v1/review/cases',{headers:{Authorization:`Bearer ${token}x`}})).status,401);
});
