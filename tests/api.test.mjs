import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, realpathSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { Script, runInNewContext } from 'node:vm';
import { request } from 'node:http';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.mjs';

function removeFixture(dir) {
  const target = realpathSync(dir);
  if (lstatSync(dir).isSymbolicLink() || dirname(target) !== realpathSync(tmpdir()) || !basename(target).startsWith('spr-')) {
    throw new Error('Refusing to remove a directory outside the dedicated test area');
  }
  rmSync(target, { recursive: true, force: true });
}

async function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'spr-test-'));
  const app = createApp({ dbPath: join(dir, 'test.sqlite'), ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close(); removeFixture(dir); });
  return { base: `http://127.0.0.1:${app.server.address().port}`, app, dir };
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

test('comparison and profile section routes retain valid targets and reject invalid ones', () => {
  const page = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  const route = page.match(/function parse\(\)\{[\s\S]*?\n\}/);
  const people = JSON.parse(readFileSync(new URL('../data/personas.json', import.meta.url), 'utf8')).personas;
  const parseHash = hash => JSON.parse(JSON.stringify(runInNewContext(route[0] + '\nparse()', {
    location: { hash }, PEOPLE: people, byId: id => people.find(person => person.id === id),
  })));
  assert.deepEqual(parseHash('#compare'), { name: 'compare', ids: ['PP-AZ-0001', 'PP-TR-0004'] });
  assert.deepEqual(parseHash('#compare/PP-SE-0023/PP-AZ-0001'), { name: 'compare', ids: ['PP-SE-0023', 'PP-AZ-0001'] });
  assert.deepEqual(parseHash('#pp-az-0001/risks'), { name: 'record', id: 'PP-AZ-0001', section: 'risks' });
  assert.deepEqual(parseHash('#PP-AZ-0001/examples'), { name: 'record', id: 'PP-AZ-0001' });
  assert.deepEqual(parseHash('#PP-AZ-0001'), { name: 'record', id: 'PP-AZ-0001' });
  for (const hash of ['#compare/PP-AZ-0001/PP-AZ-0001', '#compare/PP-AZ-0001/missing', '#compare/PP-AZ-0001', '#compare/%E0%A4%A/PP-AZ-0001', '#missing/risks', '#PP-AZ-0001/unknown']) {
    assert.deepEqual(parseHash(hash), { name: 'home' }, hash);
  }
});

test('comparison differences reflect visible values and ignore ordering of risks', () => {
  const page = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  const source = page.match(/function comparisonValue\(person,key\)\{[\s\S]*?\n\}/);
  const social = page.match(/function socialHref\(channel\)\{[\s\S]*?\n\}/);
  const value = runInNewContext(social[0] + '\n' + source[0] + '\ncomparisonValue', { URL, decodeURIComponent });
  const [first, second] = JSON.parse(readFileSync(new URL('../data/personas.json', import.meta.url), 'utf8')).personas;
  assert.equal(value(first, 'nature'), value(second, 'nature'));
  assert.notEqual(value(first, 'occupation'), value(second, 'occupation'));
  assert.equal(value(first, 'risks'), value({ ...first, risks: [...first.risks].reverse() }, 'risks'));
  assert.notEqual(value(first, 'risks'), value({ ...first, risks: [] }, 'risks'));
  assert.notEqual(value(first, 'notice'), value({ ...first, note: 'Additional review pending' }, 'notice'));
  assert.notEqual(value(first, 'channels'), value({ ...first, socials: [{ platform: 'Instagram', handle: first.handle, url: null }] }, 'channels'));
});

test('catalog comparison selection retains at most two distinct known records', () => {
  const page = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  const source = page.match(/function toggleComparisonSelection\(current,id\)\{[\s\S]*?\n\}/);
  const people = JSON.parse(readFileSync(new URL('../data/personas.json', import.meta.url), 'utf8')).personas;
  const toggle = runInNewContext(source[0] + '\ntoggleComparisonSelection', { byId: id => people.find(person => person.id === id) });
  let pair = toggle([], people[0].id);
  pair = toggle(pair, people[1].id);
  assert.deepEqual(Array.from(toggle(pair, people[2].id)), [people[0].id, people[1].id]);
  assert.deepEqual(Array.from(toggle(pair, people[0].id)), [people[1].id]);
  assert.deepEqual(Array.from(toggle([], 'unknown')), []);
});

test('public claim context stays tied to existing demo endorsements and dated events', () => {
  const records = JSON.parse(readFileSync(new URL('../data/personas.json', import.meta.url), 'utf8')).personas;
  for (const person of records) {
    const historyDates = person.history.map(event => new Date(event.d + ' 00:00:00 GMT').toISOString().slice(0, 10));
    assert.equal(person.claims.length, person.stamps.length, person.id);
    for (const claim of person.claims) {
      assert.ok(person.stamps.some(stamp => stamp.t === claim.title && stamp.v === claim.statement), `${person.id}: ${claim.title}`);
      if (claim.recordedAt !== null) {
        assert.ok(historyDates.includes(claim.recordedAt), `${person.id}: unsupported claim date ${claim.recordedAt}`);
      }
    }
  }
});

test('social profile links require the matching HTTPS platform and handle', () => {
  const page = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  const source = page.match(/function socialHref\(channel\)\{[\s\S]*?\n\}/);
  assert.ok(source);
  const socialHref = runInNewContext(source[0] + '\nsocialHref', { URL, decodeURIComponent });
  const channel = { platform: 'TikTok', handle: '@fidan.sings', url: 'https://www.tiktok.com/@fidan.sings' };
  assert.equal(socialHref(channel), channel.url);
  for (const url of ['http://www.tiktok.com/@fidan.sings', 'https://tiktok.com.evil.test/@fidan.sings',
    'https://www.tiktok.com/@another.account', 'https://name@www.tiktok.com/@fidan.sings',
    'https://www.tiktok.com:8443/@fidan.sings']) assert.equal(socialHref({ ...channel, url }), null, url);
  assert.equal(socialHref({ ...channel, url: null }), null);
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

test('a private case accepts evidence, records review decisions, and keeps payloads private', async t => {
  const reviewerToken = 'local-test-reviewer-token-with-at-least-32-characters';
  const { base, dir } = await fixture(t, { reviewerToken });
  const application = { name: 'Fictional likeness', handle: '@fictional', nature: 'likeness', langs: 'English', holderType: 'person', holder: 'Example Holder', email: 'holder@example.com', evidence: ['consent'] };
  const submitted = await fetch(base + '/api/v1/applications', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(application) });
  assert.equal(submitted.status, 201);
  const { id, accessToken } = await submitted.json();
  assert.match(accessToken, /^[A-Za-z0-9_-]{43}$/);
  const stored = new DatabaseSync(join(dir, 'test.sqlite'));
  const storedHash = stored.prepare('SELECT access_hash FROM submissions WHERE id = ?').get(id).access_hash;
  stored.close();
  assert.equal(storedHash, createHash('sha256').update(accessToken).digest('hex'));
  assert.notEqual(storedHash, accessToken);
  const ownerHeaders = { Authorization: `Bearer ${accessToken}` };
  const reviewerHeaders = { Authorization: `Bearer ${reviewerToken}` };
  assert.equal((await fetch(base + `/api/v1/cases/${id}`)).status, 404);
  assert.equal((await fetch(base + `/api/v1/cases/${id}`, { headers: { Authorization: 'Bearer ' + 'A'.repeat(43) } })).status, 404);
  const privateCase = await fetch(base + `/api/v1/cases/${id}`, { headers: ownerHeaders }).then(r => r.json());
  assert.equal(privateCase.status, 'received');
  assert.equal(privateCase.events[0].action, 'submitted');
  assert.equal('payload' in privateCase, false);
  assert.equal(JSON.stringify(privateCase).includes('holder@example.com'), false);
  assert.equal((await fetch(base + '/api/v1/review/cases')).status, 401);
  const queue = await fetch(base + '/api/v1/review/cases', { headers: reviewerHeaders }).then(r => r.json());
  assert.equal(queue.cases[0].id, id);
  const review = await fetch(base + `/api/v1/review/cases/${id}`, { headers: reviewerHeaders }).then(r => r.json());
  assert.equal(review.payload.email, 'holder@example.com');
  const status = (next, note) => fetch(base + `/api/v1/review/cases/${id}/status`, { method: 'POST', headers: { ...reviewerHeaders, 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ status: next, note }) });
  assert.equal((await status('reviewing', '')).status, 200);
  assert.equal((await status('approved', 'Evidence checked')).status, 409);
  const content = Buffer.from('%PDF-1.4\nFictional consent fixture\n');
  const upload = (body, token = accessToken, origin = base) => fetch(base + `/api/v1/cases/${id}/evidence`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: origin, 'Content-Type': 'application/pdf', 'X-Evidence-Kind': 'consent', 'X-File-Name': 'consent.pdf', 'X-Evidence-Source': 'Fictional signed consent supplied by example owner' }, body });
  assert.equal((await upload(content, 'B'.repeat(43))).status, 404);
  assert.equal((await upload(content, accessToken, 'https://evil.example')).status, 403);
  assert.equal((await upload(Buffer.from('<html>not a pdf</html>'))).status, 422);
  assert.equal((await upload(Buffer.alloc(5 * 1024 * 1024 + 1))).status, 413);
  const savedEvidence = await upload(content);
  assert.equal(savedEvidence.status, 201);
  const item = await savedEvidence.json();
  assert.equal(item.sha256, createHash('sha256').update(content).digest('hex'));
  assert.equal(item.sourceStatement, 'Fictional signed consent supplied by example owner');
  assert.equal((await fetch(base + `/api/v1/review/evidence/${item.id}/file`)).status, 401);
  const file = await fetch(base + `/api/v1/review/evidence/${item.id}/file`, { headers: reviewerHeaders });
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'application/octet-stream');
  assert.equal(file.headers.get('x-content-sha256'), item.sha256);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), content);
  const decide = note => fetch(base + `/api/v1/review/evidence/${item.id}/decision`, { method: 'POST', headers: { ...reviewerHeaders, 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ decision: 'accepted', note }) });
  assert.equal((await decide('')).status, 422);
  assert.equal((await decide('Signed consent reviewed for this fictional test case.')).status, 200);
  assert.equal((await status('approved', 'Review complete; no public passport issued.')).status, 200);
  const finalCase = await fetch(base + `/api/v1/cases/${id}`, { headers: ownerHeaders }).then(r => r.json());
  assert.equal(finalCase.status, 'approved');
  assert.equal(finalCase.evidence[0].reviewStatus, 'accepted');
  assert.equal(finalCase.events.at(-1).note, 'Review complete; no public passport issued.');
  assert.equal((await upload(content)).status, 409);
  const publicRecord = await fetch(base + '/api/v1/personas/PP-AZ-0001').then(r => r.json());
  assert.equal(publicRecord.status, 'Valid');
});

test('a likeness application needs accepted consent, and final decisions are closed', async t => {
  const reviewerToken = 'local-reviewer-test-key-with-enough-random-looking-characters';
  const { base } = await fixture(t, { reviewerToken });
  const application = { name: 'Demo likeness', handle: '@likeness.demo', nature: 'likeness', langs: '', holderType: 'person', holder: 'Example', email: 'example@example.com', evidence: ['images', 'consent'] };
  const result = await fetch(base + '/api/v1/applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(application) }).then(r => r.json());
  const owner = { Authorization: `Bearer ${result.accessToken}` };
  const reviewer = { Authorization: `Bearer ${reviewerToken}`, 'Content-Type': 'application/json' };
  const status = (value, note) => fetch(base + `/api/v1/review/cases/${result.id}/status`, { method: 'POST', headers: reviewer, body: JSON.stringify({ status: value, note }) });
  const pdf = Buffer.from('%PDF-1.4\nFictional test material\n');
  const upload = kind => fetch(base + `/api/v1/cases/${result.id}/evidence`, { method: 'POST', headers: { ...owner, 'Content-Type': 'application/pdf', 'X-Evidence-Kind': kind, 'X-File-Name': 'fixture.pdf', 'X-Evidence-Source': 'Fictional fixture created for a local API test' }, body: pdf });
  assert.equal((await status('reviewing', '')).status, 200);
  const imageEvidence = await upload('images').then(r => r.json());
  const decide = id => fetch(base + `/api/v1/review/evidence/${id}/decision`, { method: 'POST', headers: reviewer, body: JSON.stringify({ decision: 'accepted', note: 'Reviewed fictional fixture.' }) });
  assert.equal((await decide(imageEvidence.id)).status, 200);
  assert.equal((await status('approved', 'Approved')).status, 409);
  const consentEvidence = await upload('consent').then(r => r.json());
  assert.equal((await decide(consentEvidence.id)).status, 200);
  assert.equal((await status('approved', 'Review complete.')).status, 200);
  assert.equal((await status('rejected', 'Changed mind')).status, 409);
});

test('the media provenance endpoint checks exact asset hashes without asserting origin proof', async t => {
  const { base } = await fixture(t);
  const response = await fetch(base + '/api/v1/personas/PP-AZ-0001/provenance');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.originIndependentlyVerified, false);
  assert.equal(data.c2paManifestVerified, false);
  assert.equal(data.identityVerified, false);
  assert.deepEqual(data.assets.map(asset => asset.integrity), ['matches_manifest', 'matches_manifest']);
  assert.ok(data.assets.every(asset => /^[a-f0-9]{64}$/.test(asset.sha256)));
});

test('an existing database migrates without exposing legacy cases by ID alone', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'spr-migrate-'));
  const path = join(dir, 'legacy.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec("CREATE TABLE submissions (id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'received', created_at TEXT NOT NULL)");
  legacy.prepare('INSERT INTO submissions VALUES (?, ?, ?, ?, ?)').run('RPT-2026-ABCDEF123456', 'report', JSON.stringify({ who: 'Legacy case', email: 'old@example.com' }), 'received', '2026-01-01T00:00:00.000Z');
  legacy.close();
  const reviewerToken = 'another-local-test-reviewer-token-long-enough';
  const app = createApp({ dbPath: path, reviewerToken });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close(); removeFixture(dir); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  assert.equal((await fetch(base + '/api/v1/cases/RPT-2026-ABCDEF123456', { headers: { Authorization: 'Bearer ' + 'A'.repeat(43) } })).status, 404);
  const review = await fetch(base + '/api/v1/review/cases/RPT-2026-ABCDEF123456', { headers: { Authorization: `Bearer ${reviewerToken}` } }).then(r => r.json());
  assert.equal(review.payload.email, 'old@example.com');
  assert.equal(review.updatedAt, '2026-01-01T00:00:00.000Z');
});
