import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Script, runInNewContext } from 'node:vm';
import { request } from 'node:http';
import { createApp } from '../server/app.mjs';

async function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'spr-test-'));
  const app = createApp({ dbPath: join(dir, 'test.sqlite'), ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); });
  return { base: `http://127.0.0.1:${app.server.address().port}`, app };
}

async function rawRequest(url, { method = 'GET', headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, headers }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
    req.end(body);
  });
}

test('the standalone interface script parses and keeps the demo disclosures', () => {
  const page = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  const inline = page.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
  assert.ok(inline);
  assert.doesNotThrow(() => new Script(inline[1]));
  assert.match(page, /Independent registry of AI personas/);
  assert.match(page, /Demo data/);
  const route = page.match(/function parse\(\)\{[\s\S]*?\n\}/);
  assert.ok(route);
  assert.deepEqual(JSON.parse(JSON.stringify(runInNewContext(route[0] + '\nparse()', {
    location: { hash: '#%E0%A4%A' }, byId: () => null
  }))), { name: 'home' });
});

test('standalone fallback records match the API source', () => {
  const page = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  const match = page.match(/const G=.*?;\s*const PEOPLE = \[[\s\S]*?\n\];/);
  assert.ok(match);
  const fallback = runInNewContext(match[0] + '\nPEOPLE');
  const source = JSON.parse(readFileSync(new URL('../data/personas.json', import.meta.url), 'utf8')).personas;
  assert.deepEqual(JSON.parse(JSON.stringify(fallback)), source.map(({ portrait, ...record }) => record));
});

test('a malformed saved application cannot break the registration form', () => {
  const page = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  const source = page.match(/const APPLY0 = [\s\S]*?function Apply\(/);
  assert.ok(source);
  const draft = runInNewContext(source[0].slice(0, -'function Apply('.length) + '\nrestoreApplication({ name: 42, holder: "Company", evidence: {} })');
  assert.equal(draft.name, '');
  assert.equal(draft.holder, 'Company');
  assert.deepEqual(JSON.parse(JSON.stringify(draft.evidence)), []);
});

test('serves the site and registry, while private files stay inaccessible', async t => {
  const { base } = await fixture(t);
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /script-src[^;]*'sha256-/);
  assert.match(page.headers.get('content-security-policy'), /object-src 'none'/);
  assert.equal((await fetch(base, { headers: { 'If-None-Match': page.headers.get('etag') } })).status, 304);
  assert.match(await page.text(), /Synthetic Persona Registry/);
  const registry = await fetch(base + '/api/v1/personas').then(r => r.json());
  assert.equal(registry.personas.length, 8);
  const record = await fetch(base + '/api/v1/personas/PP-AZ-0001').then(r => r.json());
  assert.equal(record.name, 'Fidan');
  const picture = await fetch(base + '/assets/portraits/PP-AZ-0001.jpg');
  assert.equal(picture.status, 200);
  assert.equal(picture.headers.get('content-type'), 'image/jpeg');
  assert.equal(picture.headers.get('cache-control'), 'public, no-cache');
  assert.equal((await fetch(base + '/assets/portraits/PP-AZ-0001.jpg', {
    headers: { 'If-None-Match': picture.headers.get('etag') }
  })).status, 304);
  for (const person of registry.personas) {
    assert.equal((await fetch(base + '/' + person.portrait)).status, 200, person.id);
    const fullBody = await fetch(base + '/assets/full-body/' + person.id + '.jpg');
    assert.equal(fullBody.status, 200, person.id);
    assert.equal(fullBody.headers.get('content-type'), 'image/jpeg');
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
  const hostileOrigin = `http://attacker.example:${new URL(base).port}`;
  const rebound = await rawRequest(base + '/api/v1/applications', { method: 'POST', headers: { Host: new URL(hostileOrigin).host, Origin: hostileOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify(application) });
  assert.equal(rebound, 421);
  const malformedEvidence = await post('/api/v1/applications', { ...application, nature: 'likeness', evidence: {} });
  assert.equal(malformedEvidence.status, 422);
  assert.equal(app.db.count(), 0);
  assert.equal((await post('/api/v1/applications', application, 'https://evil.example')).status, 403);
  assert.equal(app.db.count(), 0);
  const saved = await post('/api/v1/applications', application);
  assert.equal(saved.status, 201);
  assert.match((await saved.json()).id, /^SPR-\d{4}-[A-F0-9]{12}$/);
  const report = await post('/api/v1/reports', { who: 'Example', what: 'copy', details: 'This example is long enough to be a valid report.', email: '' });
  assert.equal(report.status, 201);
  const reportWithoutEmail = await post('/api/v1/reports', { who: 'Example', what: 'other', details: 'This is another valid report with no contact address.', email: '   ' });
  assert.equal(reportWithoutEmail.status, 201);
  assert.equal(app.db.count(), 3);
});

test('a configured public origin works behind a proxy while local health stays available', async t => {
  const publicOrigin = 'https://registry.example.test';
  const { base, app } = await fixture(t, { publicOrigin });
  assert.equal((await fetch(base + '/api/v1/health')).status, 200);
  assert.equal(await rawRequest(base + '/api/v1/health', { headers: { Host: 'registry.example.test' } }), 200);
  const report = { who: 'Demo', what: 'other', details: 'A fictional report for the reverse proxy test.', email: '' };
  assert.equal(await rawRequest(base + '/api/v1/reports', { method: 'POST', headers: { Host: 'registry.example.test', Origin: publicOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify(report) }), 201);
  assert.equal(app.db.count(), 1);
});
