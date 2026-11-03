import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.mjs';

test('account claims protect cases and recovery rotates credentials and sessions', async (t) => {
  const app = createApp({ dbPath: ':memory:' });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  async function call(path, body, cookie = '', extra = {}) {
    const res = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(body === undefined
          ? {}
          : { 'content-type': 'application/json', 'x-spr-owner': '1', origin: base }),
        ...(cookie ? { cookie } : {}),
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: res.status,
      data: await res.json(),
      cookie: res.headers.get('set-cookie')?.split(';')[0],
    };
  }
  const pw = 'correct horse battery staple';
  const reg = await call('/api/v1/account/register', { username: 'Alice', password: pw });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.account.username, 'alice');
  const case1 = app.db.create('application', {});
  for (const id of [undefined, {}, 'invalid']) {
    assert.equal(
      (await call('/api/v1/account/cases', { id, accessToken: case1.accessToken }, reg.cookie)).status,
      404,
    );
  }
  assert.equal(
    (
      await call(
        '/api/v1/account/cases',
        { id: case1.id, accessToken: case1.accessToken },
        reg.cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(`/api/v1/cases/${case1.id}`, undefined, '', {
        authorization: `Bearer ${case1.accessToken}`,
      })
    ).status,
    404,
  );
  assert.equal((await call(`/api/v1/cases/${case1.id}`, undefined, reg.cookie)).status, 200);
  assert.equal(
    (await call('/api/v1/account/cases', undefined, reg.cookie, { origin: 'http://evil.test' }))
      .status,
    403,
  );
  assert.equal(
    (await call('/api/v1/account/logout', {}, reg.cookie, { 'x-spr-owner': '0' })).status,
    403,
  );
  const bob = await call('/api/v1/account/register', { username: 'bob', password: pw });
  assert.equal((await call(`/api/v1/cases/${case1.id}`, undefined, bob.cookie)).status, 404);
  assert.equal(
    (
      await call(
        '/api/v1/account/cases',
        { id: case1.id, accessToken: case1.accessToken },
        bob.cookie,
      )
    ).status,
    404,
  );
  const reset = await call('/api/v1/account/recover', {
    username: 'ALICE',
    recoveryCode: reg.data.recoveryCode,
    newPassword: 'another long password here',
  });
  assert.equal(reset.status, 200);
  assert.equal((await call(`/api/v1/cases/${case1.id}`, undefined, reg.cookie)).status, 404);
  assert.equal(
    (
      await call('/api/v1/account/recover', {
        username: 'alice',
        recoveryCode: reg.data.recoveryCode,
        newPassword: pw,
      })
    ).status,
    401,
  );
  assert.equal(
    (await call('/api/v1/account/login', { username: 'alice', password: pw })).status,
    401,
  );
  const login = await call('/api/v1/account/login', {
    username: 'alice',
    password: 'another long password here',
  });
  assert.equal(login.status, 200);
  assert.equal(
    (await call('/api/v1/account/cases', undefined, login.cookie)).data.cases[0].id,
    case1.id,
  );
});
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { backupDatabase } from '../scripts/backup.mjs';

async function serverFixture(t, path = ':memory:') {
  const app = createApp({ dbPath: path });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  async function call(path, body, cookie = '', extra = {}) {
    const res = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(body === undefined
          ? {}
          : { 'content-type': 'application/json', 'x-spr-owner': '1', origin: base }),
        ...(cookie ? { cookie } : {}),
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: res.status,
      data: await res.json(),
      cookie: res.headers.get('set-cookie')?.split(';')[0],
    };
  }
  return { app, base, call };
}

test('concurrent recovery permits one winner; password change invalidates old sessions', async (t) => {
  const { call } = await serverFixture(t),
    pw = 'correct horse battery staple';
  const reg = await call('/api/v1/account/register', { username: 'owner', password: pw });
  const other = await call('/api/v1/account/login', { username: 'owner', password: pw });
  const results = await Promise.all(
    [1, 2].map(() =>
      call('/api/v1/account/recover', {
        username: 'owner',
        recoveryCode: reg.data.recoveryCode,
        newPassword: 'new password with enough length',
      }),
    ),
  );
  assert.deepEqual(results.map((x) => x.status).sort(), [200, 401]);
  assert.equal((await call('/api/v1/account', undefined, reg.cookie)).data.account, null);
  assert.equal((await call('/api/v1/account', undefined, other.cookie)).data.account, null);
  const login = await call('/api/v1/account/login', {
    username: 'owner',
    password: 'new password with enough length',
  });
  const changed = await call(
    '/api/v1/account/password',
    {
      currentPassword: 'new password with enough length',
      newPassword: 'final password with enough length',
    },
    login.cookie,
  );
  assert.equal(changed.status, 200);
  assert.notEqual(
    changed.data.recoveryCode,
    results.find((x) => x.status === 200).data.recoveryCode,
  );
  assert.equal((await call('/api/v1/account', undefined, login.cookie)).data.account, null);
  assert.equal(
    (await call('/api/v1/account', undefined, changed.cookie)).data.account.username,
    'owner',
  );
  assert.equal(
    (
      await call('/api/v1/account/recover', {
        username: 'owner',
        recoveryCode: results.find((x) => x.status === 200).data.recoveryCode,
        newPassword: pw,
      })
    ).status,
    401,
  );
});

test('session limits, idle expiry, hashed secrets and backup persist ownership', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'spr-owner-'));
  const dbPath = join(dir, 'db.sqlite'),
    backup = join(dir, 'backup.sqlite');
  const { app, call } = await serverFixture(t, dbPath);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const pw = 'correct horse battery staple';
  const reg = await call('/api/v1/account/register', { username: 'persist', password: pw });
  const item = app.db.create('application', {});
  await call('/api/v1/account/cases', { id: item.id, accessToken: item.accessToken }, reg.cookie);
  const cookies = [reg.cookie];
  for (let i = 0; i < 5; i++)
    cookies.push(
      (await call('/api/v1/account/login', { username: 'persist', password: pw })).cookie,
    );
  assert.equal((await call('/api/v1/account', undefined, cookies[0])).data.account, null);
  const sessions = await call('/api/v1/account/sessions', undefined, cookies.at(-1));
  assert.equal(sessions.data.sessions.length, 5);
  const raw = new DatabaseSync(dbPath);
  const account = raw.prepare('SELECT * FROM owner_accounts').get();
  const session = raw.prepare('SELECT * FROM owner_sessions LIMIT 1').get();
  assert.notEqual(account.password_hash, pw);
  assert.notEqual(account.recovery_hash, reg.data.recoveryCode);
  assert.ok(!cookies.some((c) => c.includes(session.token_hash)));
  raw
    .prepare('UPDATE owner_sessions SET last_seen_at=? WHERE id=?')
    .run(Date.now() - 86400001, sessions.data.sessions.find((s) => s.current).id);
  raw.close();
  assert.equal((await call('/api/v1/account', undefined, cookies.at(-1))).data.account, null);
  await backupDatabase(dbPath, backup);
  const restored = createApp({ dbPath: backup });
  try {
    const login = await restored.db.accounts.login(
      { username: 'persist', password: pw },
      'restore',
    );
    assert.equal(restored.db.accounts.cases(login.token).cases[0].id, item.id);
  } finally {
    restored.db.close();
  }
});

test('authentication overload is bounded and login quotas survive restart', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'spr-owner-rate-'));
  const path = join(dir, 'db.sqlite');
  const { app, call } = await serverFixture(t, path);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const pw = 'correct horse battery staple';
  await call('/api/v1/account/register', { username: 'limits', password: pw });
  const racing = await Promise.all(
    [1, 2, 3].map(() => call('/api/v1/account/login', { username: 'limits', password: pw })),
  );
  assert.deepEqual(racing.map((x) => x.status).sort(), [200, 200, 503]);
  for (let i = 0; i < 7; i++)
    assert.equal(
      (await call('/api/v1/account/login', { username: 'limits', password: 'wrong' })).status,
      401,
    );
  assert.equal(
    (await call('/api/v1/account/login', { username: 'limits', password: 'wrong' })).status,
    429,
  );
  const reopened = createApp({ dbPath: path });
  try {
    await assert.rejects(
      reopened.db.accounts.login({ username: 'limits', password: pw }, '127.0.0.1'),
      (e) => e.status === 429,
    );
  } finally {
    reopened.db.close();
  }
});
import { request as httpRequest } from 'node:http';

test('cookie owner can publish and stale session cannot finish an awaited upload', async (t) => {
  const { app, base, call } = await serverFixture(t);
  const password = 'correct horse battery staple';
  const reg = await call('/api/v1/account/register', { username: 'publisher', password });
  const payload = {
    name: 'Synthetic Publication',
    handle: '@publication_test',
    nature: 'synthetic',
    holderType: 'company',
    holder: 'Example Studio',
    langs: 'English',
    email: 'fixture@example.test',
    evidence: ['licences'],
  };
  const item = app.db.create('application', payload);
  const file = app.db.addEvidence(item.id, item.accessToken, {
    kind: 'licences',
    fileName: 'fixture.pdf',
    sourceStatement: 'Fixture source statement',
    mime: 'application/pdf',
    content: Buffer.from('%PDF-1.4'),
  });
  app.db.reviewEvidence(file.id, 'accepted', 'Accepted fixture');
  app.db.updateStatus(item.id, 'reviewing', 'Review');
  app.db.updateStatus(item.id, 'approved', 'Approved');
  const content = {
    name: payload.name,
    handle: payload.handle,
    nature: payload.nature,
    holder: payload.holder,
    languages: 'English',
    occupation: 'Presenter',
    description: 'A synthetic persona used only for publication workflow tests.',
    usageTerms: 'Example campaign use requires a separate agreement with the listed holder.',
  };
  const draft = app.db.publication.createReviewer(item.id, { content, expectedVersion: 0 });
  assert.equal(
    (
      await call(
        '/api/v1/account/cases',
        { id: item.id, accessToken: item.accessToken },
        reg.cookie,
      )
    ).status,
    200,
  );
  const published = await call(
    `/api/v1/cases/${item.id}/publication/publish`,
    { version: draft.draft.version, digest: draft.draft.digest, consent: true },
    reg.cookie,
  );
  assert.equal(published.status, 200);
  assert.equal(published.data.current.status, 'published');
  assert.equal(
    (
      await call(`/api/v1/cases/${item.id}/publication`, undefined, '', {
        authorization: `Bearer ${item.accessToken}`,
      })
    ).status,
    404,
  );
  const upload = await new Promise((resolve, reject) => {
    const req = httpRequest(
      base + `/api/v1/cases/${item.id}/evidence`,
      {
        method: 'POST',
        headers: {
          cookie: reg.cookie,
          origin: base,
          'x-spr-owner': '1',
          'content-type': 'application/pdf',
          'x-evidence-kind': 'other',
          'x-file-name': 'fixture.pdf',
          'x-evidence-source': 'Fixture%20source%20statement',
          'content-length': '8',
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('error', reject);
    req.write('%PDF');
    setTimeout(() => {
      app.db.accounts.logout(reg.cookie.split('=')[1]);
      req.end('-1.4');
    }, 50);
  });
  assert.equal(upload, 404);
  assert.equal(app.db.getReview(item.id).evidence.length, 1);
});

test('case list pagination is bounded and loopback host is unavailable in public configuration', async (t) => {
  const { app, call } = await serverFixture(t);
  const password = 'correct horse battery staple';
  const reg = await call('/api/v1/account/register', { username: 'paging', password });
  const token = reg.cookie.split('=')[1];
  for (let i = 0; i < 51; i++) app.db.create('report', {}, token);
  const first = await call('/api/v1/account/cases', undefined, reg.cookie);
  assert.equal(first.data.cases.length, 50);
  assert.equal(first.data.hasMore, true);
  const next = await call('/api/v1/account/cases?offset=50', undefined, reg.cookie);
  assert.equal(next.data.cases.length, 1);
  assert.equal(next.data.hasMore, false);
  assert.equal((await call('/api/v1/account/cases?offset=-1', undefined, reg.cookie)).status, 400);
  const publicApp = createApp({ dbPath: ':memory:', publicOrigin: 'https://example.test' });
  await new Promise((r) => publicApp.server.listen(0, '127.0.0.1', r));
  t.after(() => publicApp.close());
  const port = publicApp.server.address().port;
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/account`, {
    headers: { host: `localhost:${port}` },
  });
  assert.equal(response.status, 403);
});
