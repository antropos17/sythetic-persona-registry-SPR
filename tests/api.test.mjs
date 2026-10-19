import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Script, runInNewContext } from 'node:vm';
import { createApp } from '../server/app.mjs';

async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'spr-test-'));
  const app = createApp({ dbPath: join(dir, 'test.sqlite') });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); });
  return { base: `http://127.0.0.1:${app.server.address().port}`, app };
}

test('the standalone interface script parses and keeps the demo disclosures', () => {
  const page = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  const inline = page.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
  assert.ok(inline);
  assert.doesNotThrow(() => new Script(inline[1]));
  assert.match(page, /Independent registry of AI personas/);
  assert.match(page, /Demo data/);
});

test('standalone fallback records match the API source', () => {
  const page = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  const match = page.match(/const G=.*?;\s*const PEOPLE = \[[\s\S]*?\n\];/);
  assert.ok(match);
  const fallback = runInNewContext(match[0] + '\nPEOPLE');
  const source = JSON.parse(readFileSync(new URL('../data/personas.json', import.meta.url), 'utf8')).personas;
  assert.deepEqual(JSON.parse(JSON.stringify(fallback)), source.map(({ portrait, ...record }) => record));
});

test('serves the site and registry, while private files stay inaccessible', async t => {
  const { base } = await fixture(t);
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Synthetic Persona Registry/);
  const registry = await fetch(base + '/api/v1/personas').then(r => r.json());
  assert.equal(registry.personas.length, 8);
  const record = await fetch(base + '/api/v1/personas/PP-AZ-0001').then(r => r.json());
  assert.equal(record.name, 'Fidan');
  const picture = await fetch(base + '/assets/portraits/PP-AZ-0001.jpg');
  assert.equal(picture.status, 200);
  assert.equal(picture.headers.get('content-type'), 'image/jpeg');
  for (const person of registry.personas) {
    assert.equal((await fetch(base + '/' + person.portrait)).status, 200, person.id);
  }
  for (const path of ['/data/personas.json', '/server/db.mjs', '/.env', '/assets/../data/personas.json']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
});

test('check reports the exact demonstration boundary', async t => {
  const { base } = await fixture(t);
  const response = await fetch(base + '/api/v1/passports/PP-AZ-0001/check');
  assert.equal(response.status, 200);
  const check = await response.json();
  assert.equal(check.notice, 'Valid');
  assert.equal(check.openRiskCount, 2);
  assert.equal(check.cryptographicSignatureVerified, false);
  assert.equal(check.faceComparisonPerformed, false);
});

test('valid submissions persist and invalid or cross-origin requests do not', async t => {
  const { base, app } = await fixture(t);
  const application = { name: 'Example', handle: '@example', nature: 'synthetic', langs: 'English', holderType: 'person', holder: 'Example Owner', email: 'owner@example.com', evidence: ['images'] };
  const post = (path, body, origin = base) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
  const bad = await post('/api/v1/applications', { ...application, email: 'bad' });
  assert.equal(bad.status, 422);
  assert.equal(app.db.count(), 0);
  assert.equal((await post('/api/v1/applications', application, 'https://evil.example')).status, 403);
  assert.equal(app.db.count(), 0);
  const saved = await post('/api/v1/applications', application);
  assert.equal(saved.status, 201);
  assert.match((await saved.json()).id, /^SPR-\d{4}-[A-F0-9]{12}$/);
  const report = await post('/api/v1/reports', { who: 'Example', what: 'copy', details: 'This example is long enough to be a valid report.', email: '' });
  assert.equal(report.status, 201);
  assert.equal(app.db.count(), 2);
});
