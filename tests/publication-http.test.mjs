import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, lstatSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { createApp } from '../server/app.mjs';
import { backupDatabase } from '../scripts/backup.mjs';

const reviewer = 'publication-http-reviewer-synthetic-key-2026';
const application = {
  name: 'Synthetic Publication',
  handle: '@publication_test',
  nature: 'synthetic',
  holderType: 'company',
  holder: 'Example Studio',
  langs: 'English',
  email: 'PRIVATE_EMAIL_MARKER@example.test',
  evidence: ['licences'],
};
const publicContent = {
  name: application.name,
  handle: application.handle,
  nature: application.nature,
  holder: application.holder,
  languages: 'English',
  occupation: 'Presenter',
  description: 'A synthetic persona used only for publication workflow tests.',
  usageTerms: 'Example campaign use requires a separate agreement with the listed holder.',
};

async function start(path = ':memory:') {
  const app = createApp({ dbPath: path, reviewerToken: reviewer });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  async function call(path, token, body, headers = {}) {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json', Origin: base }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json(), headers: response.headers };
  }
  return { ...app, base, call };
}

async function approved(app, payload = application) {
  const created = await app.call('/api/v1/applications', null, payload);
  assert.equal(created.status, 201);
  const { id, accessToken } = created.data;
  const upload = await fetch(app.base + `/api/v1/cases/${id}/evidence`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      Origin: app.base,
      'Content-Type': 'application/pdf',
      'X-Evidence-Kind': payload.nature === 'likeness' ? 'consent' : 'licences',
      'X-File-Name': 'PRIVATE_FILENAME_MARKER.pdf',
      'X-Evidence-Source': 'PRIVATE_SOURCE_MARKER synthetic fixture',
    },
    body: '%PDF-1.4\nPRIVATE_FILE_CONTENT_MARKER',
  });
  assert.equal(upload.status, 201);
  const file = await upload.json();
  assert.equal(
    (
      await app.call(`/api/v1/review/evidence/${file.id}/decision`, reviewer, {
        decision: 'accepted',
        note: 'PRIVATE_REVIEW_MARKER fixture accepted',
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await app.call(`/api/v1/review/cases/${id}/status`, reviewer, {
        status: 'reviewing',
        note: 'Synthetic review started',
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await app.call(`/api/v1/review/cases/${id}/status`, reviewer, {
        status: 'approved',
        note: 'PRIVATE_APPROVAL_MARKER synthetic approval only',
      })
    ).status,
    200,
  );
  return { id, accessToken, fileId: file.id };
}

const ownerPath = (item, suffix = '') => `/api/v1/cases/${item.id}/publication${suffix}`;
const reviewPath = (item, suffix = '') => `/api/v1/review/cases/${item.id}/publication${suffix}`;
async function draft(app, item, content = publicContent, expectedVersion = 0) {
  const result = await app.call(reviewPath(item, '/drafts'), reviewer, {
    content,
    expectedVersion,
  });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return result.data;
}
async function publish(app, item, state) {
  return app.call(ownerPath(item, '/publish'), item.accessToken, {
    version: state.draft.version,
    digest: state.draft.digest,
    consent: true,
  });
}
function noPrivate(value, item) {
  const text = JSON.stringify(value);
  for (const privateValue of [
    item.id,
    item.accessToken,
    item.fileId,
    'PRIVATE_',
    'private_email_marker',
  ])
    assert.ok(
      !text.includes(privateValue),
      `Public response contains private value: ${privateValue}`,
    );
  for (const key of [
    'payload',
    'email',
    'accessToken',
    'evidence',
    'reviewNote',
    'submissionId',
    'caseId',
  ])
    assert.ok(!Object.hasOwn(value, key), `Unexpected public property ${key}`);
}

test('approval and reviewer preview remain private until exact owner consent publishes the whitelist', async (t) => {
  const app = await start();
  t.after(() => app.close());
  const item = await approved(app);
  const initial = await app.call(ownerPath(item), item.accessToken);
  assert.deepEqual(initial.data, {
    passportId: null,
    latestVersion: 0,
    current: null,
    draft: null,
  });
  const state = await draft(app, item);
  assert.match(state.passportId, /^PP-SPR-[A-F0-9]{12}$/);
  assert.match(state.draft.digest, /^[a-f0-9]{64}$/);
  assert.equal(state.draft.status, 'awaiting_consent');
  assert.equal((await app.call(`/api/v1/passports/${state.passportId}`)).status, 404);
  assert.equal(
    (await app.call('/api/v1/personas')).data.personas.some((p) => p.id === state.passportId),
    false,
  );
  assert.equal((await app.call(ownerPath(item), reviewer)).status, 404);
  assert.equal((await app.call(reviewPath(item), item.accessToken)).status, 401);
  assert.equal((await app.call(ownerPath(item))).status, 404);
  assert.equal(
    (
      await app.call(ownerPath(item, '/publish'), item.accessToken, {
        version: 1,
        digest: state.draft.digest,
        consent: false,
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await app.call(ownerPath(item, '/publish'), item.accessToken, {
        version: 1,
        digest: '0'.repeat(64),
        consent: true,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await app.call(
        ownerPath(item, '/publish'),
        item.accessToken,
        { version: 1, digest: state.draft.digest, consent: true },
        { Origin: 'https://foreign.example' },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await app.call(
        ownerPath(item, '/publish'),
        item.accessToken,
        { version: 1, digest: state.draft.digest, consent: true },
        { 'Sec-Fetch-Site': 'cross-site' },
      )
    ).status,
    403,
  );
  const result = await publish(app, item, state);
  assert.equal(result.status, 200);
  const publicResult = await app.call(`/api/v1/passports/${state.passportId}`);
  assert.equal(publicResult.status, 200);
  assert.equal(publicResult.headers.get('cache-control'), 'no-store');
  assert.equal(publicResult.data.status, 'published');
  for (const [key, value] of Object.entries(publicContent))
    assert.equal(publicResult.data[key], value);
  assert.equal(publicResult.data.version, 1);
  const eventsBefore = (await app.call(`/api/v1/cases/${item.id}`, item.accessToken)).data.events;
  assert.equal((await publish(app, item, state)).status, 200);
  const eventsAfter = (await app.call(`/api/v1/cases/${item.id}`, item.accessToken)).data.events;
  assert.equal(
    eventsAfter.length,
    eventsBefore.length,
    'Retry must not duplicate consent audit events',
  );
  for (const path of [
    `/api/v1/passports/${state.passportId}`,
    `/api/v1/personas/${state.passportId}`,
    `/api/v1/passports/${state.passportId}/check`,
    '/api/v1/personas',
  ]) {
    const response = await app.call(path);
    assert.equal(response.status, 200, path);
    noPrivate(response.data, item);
  }
});

test('updates require fresh review and consent; obsolete previews cannot overwrite current publication', async (t) => {
  const app = await start();
  t.after(() => app.close());
  const item = await approved(app);
  const first = await draft(app, item);
  assert.equal((await publish(app, item, first)).status, 200);
  const nextContent = {
    ...publicContent,
    description: 'A newly proposed description, private until both steps complete.',
  };
  const proposed = await app.call(ownerPath(item, '/updates'), item.accessToken, {
    content: nextContent,
    expectedVersion: 1,
  });
  assert.equal(proposed.status, 201);
  assert.equal(proposed.data.draft.status, 'pending_review');
  assert.equal((await publish(app, item, proposed.data)).status, 409);
  assert.equal(
    (await app.call(`/api/v1/passports/${first.passportId}`)).data.description,
    publicContent.description,
  );
  const approvedUpdate = await app.call(reviewPath(item, '/review'), reviewer, {
    version: 2,
    digest: proposed.data.draft.digest,
    decision: 'approve',
    note: 'PRIVATE_UPDATE_REVIEW_MARKER',
  });
  assert.equal(approvedUpdate.status, 200);
  assert.equal((await app.call(`/api/v1/passports/${first.passportId}`)).data.version, 1);
  const replaced = await app.call(ownerPath(item, '/updates'), item.accessToken, {
    content: {
      ...nextContent,
      description: 'A third revision replaces the approved but unconsented second revision.',
    },
    expectedVersion: 2,
  });
  assert.equal(replaced.status, 201);
  assert.equal((await publish(app, item, approvedUpdate.data)).status, 409);
  assert.equal((await publish(app, item, first)).status, 409);
  const thirdReview = await app.call(reviewPath(item, '/review'), reviewer, {
    version: 3,
    digest: replaced.data.draft.digest,
    decision: 'approve',
    note: '',
  });
  assert.equal(thirdReview.status, 200);
  assert.equal((await publish(app, item, thirdReview.data)).status, 200);
  const current = await app.call(`/api/v1/passports/${first.passportId}`);
  assert.equal(current.data.version, 3);
  assert.equal(current.data.description, replaced.data.draft.content.description);
  noPrivate(current.data, item);
});

test('concurrent updates serialize, rejected text stays private, and a later correction can proceed', async (t) => {
  const app = await start();
  t.after(() => app.close());
  const item = await approved(app);
  const first = await draft(app, item);
  await publish(app, item, first);
  const results = await Promise.all([
    app.call(ownerPath(item, '/updates'), item.accessToken, {
      content: { ...publicContent, name: 'First competing update' },
      expectedVersion: 1,
    }),
    app.call(ownerPath(item, '/updates'), item.accessToken, {
      content: { ...publicContent, name: 'Second competing update' },
      expectedVersion: 1,
    }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const pending = results.find((r) => r.status === 201).data;
  const rejected = await app.call(reviewPath(item, '/review'), reviewer, {
    version: 2,
    digest: pending.draft.digest,
    decision: 'reject',
    note: 'PRIVATE_REJECTION_MARKER requires correction',
  });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.data.draft.status, 'rejected');
  assert.equal((await publish(app, item, rejected.data)).status, 409);
  assert.equal(
    (await app.call(`/api/v1/passports/${first.passportId}`)).data.name,
    publicContent.name,
  );
  const correction = await app.call(ownerPath(item, '/updates'), item.accessToken, {
    content: { ...publicContent, description: 'Corrected public text after a rejected proposal.' },
    expectedVersion: 2,
  });
  assert.equal(correction.status, 201);
  assert.equal(correction.data.draft.version, 3);
  const events = (await app.call(`/api/v1/cases/${item.id}`, item.accessToken)).data.events;
  assert.ok(events.some((event) => event.action === 'publication_rejected'));
});

test('revocation remains available during update review and leaves only a durable public tombstone', async (t) => {
  const app = await start();
  t.after(() => app.close());
  const item = await approved(app);
  const first = await draft(app, item);
  await publish(app, item, first);
  const pending = await app.call(ownerPath(item, '/updates'), item.accessToken, {
    content: { ...publicContent, name: 'Unpublished replacement name' },
    expectedVersion: 1,
  });
  assert.equal(pending.status, 201);
  assert.equal(
    (
      await app.call(ownerPath(item, '/revoke'), item.accessToken, {
        version: 2,
        reason: 'Withdrawn by the case-link holder.',
        confirmed: true,
      })
    ).status,
    409,
  );
  const revokeBody = { version: 1, reason: 'Withdrawn by the case-link holder.', confirmed: true };
  const revoked = await app.call(ownerPath(item, '/revoke'), item.accessToken, revokeBody);
  assert.equal(revoked.status, 200);
  assert.equal(revoked.data.draft, null);
  assert.equal(
    (await app.call(ownerPath(item, '/revoke'), item.accessToken, revokeBody)).status,
    200,
  );
  const tombstone = await app.call(`/api/v1/passports/${first.passportId}`);
  assert.equal(tombstone.status, 200);
  assert.equal(tombstone.data.status, 'revoked');
  assert.deepEqual(
    Object.keys(tombstone.data).sort(),
    [
      'id',
      'recordType',
      'version',
      'status',
      'revokedAt',
      'updatedAt',
      'revocationReason',
      'registryMode',
    ].sort(),
  );
  assert.equal(
    (await app.call('/api/v1/personas')).data.personas.some((p) => p.id === first.passportId),
    false,
  );
  assert.equal((await app.call(`/api/v1/personas/${first.passportId}`)).status, 404);
  assert.equal(
    (
      await app.call(reviewPath(item, '/review'), reviewer, {
        version: 2,
        digest: pending.data.draft.digest,
        decision: 'approve',
        note: '',
      })
    ).status,
    409,
  );
  assert.equal((await publish(app, item, first)).status, 409);
  assert.equal((await draftResponse(app, item, publicContent, 2)).status, 409);
  noPrivate(tombstone.data, item);
});

function draftResponse(app, item, content, expectedVersion) {
  return app.call(reviewPath(item, '/drafts'), reviewer, { content, expectedVersion });
}

test('publication gates reject unapproved/report cases, private fields and immutable holder or nature changes', async (t) => {
  const app = await start();
  t.after(() => app.close());
  const received = (await app.call('/api/v1/applications', null, application)).data;
  assert.equal((await draftResponse(app, received, publicContent, 0)).status, 409);
  const report = (
    await app.call('/api/v1/reports', null, {
      who: 'Synthetic report',
      what: 'other',
      details: 'Synthetic report with no publication eligibility.',
      email: '',
    })
  ).data;
  assert.equal((await draftResponse(app, report, publicContent, 0)).status, 409);
  const item = await approved(app);
  for (const content of [
    { ...publicContent, email: 'PRIVATE_MARKER@example.test' },
    { ...publicContent, holder: 'Different holder' },
    { ...publicContent, nature: 'likeness' },
    { ...publicContent, name: 'Invalid\u0000name' },
  ])
    assert.equal((await draftResponse(app, item, content, 0)).status, 422);
  const other = await approved(app, { ...application, name: 'Other application' });
  const state = await draft(app, item);
  assert.equal((await app.call(ownerPath(item), other.accessToken)).status, 404);
  assert.equal(
    (
      await app.call(ownerPath(item, '/publish'), other.accessToken, {
        version: 1,
        digest: state.draft.digest,
        consent: true,
      })
    ).status,
    404,
  );
});

test('publication, pending updates and revocation survive restart and online backup restoration', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'spr-publication-'));
  let app;
  t.after(async () => {
    if (app) await app.close();
    const real = realpathSync(dir);
    assert.equal(lstatSync(dir).isSymbolicLink(), false);
    assert.equal(dirname(real), realpathSync(tmpdir()));
    assert.ok(basename(real).startsWith('spr-publication-'));
    rmSync(real, { recursive: true, force: true });
  });
  const path = join(dir, 'source.sqlite'),
    snapshot = join(dir, 'snapshot.sqlite');
  app = await start(path);
  const item = await approved(app);
  const first = await draft(app, item);
  await publish(app, item, first);
  await app.call(ownerPath(item, '/updates'), item.accessToken, {
    content: {
      ...publicContent,
      description: 'A pending update survives an online backup and restart.',
    },
    expectedVersion: 1,
  });
  await backupDatabase(path, snapshot);
  await app.close();
  app = null;
  app = await start(snapshot);
  const restored = await app.call(ownerPath(item), item.accessToken);
  assert.equal(restored.data.current.version, 1);
  assert.equal(restored.data.draft.version, 2);
  assert.equal(restored.data.draft.status, 'pending_review');
  assert.equal(
    (await app.call(`/api/v1/review/cases/${item.id}`, reviewer)).data.evidence.length,
    1,
  );
  assert.equal(
    (
      await app.call(ownerPath(item, '/revoke'), item.accessToken, {
        version: 1,
        reason: 'Revoked after restore verification.',
        confirmed: true,
      })
    ).status,
    200,
  );
  const revokedSnapshot = join(dir, 'revoked-snapshot.sqlite');
  await backupDatabase(snapshot, revokedSnapshot);
  await app.close();
  app = null;
  app = await start(revokedSnapshot);
  const publicResult = await app.call(`/api/v1/passports/${first.passportId}`);
  assert.equal(publicResult.data.status, 'revoked');
  assert.equal((await publish(app, item, first)).status, 409);
});
