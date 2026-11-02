// Run only against a disposable loopback container configured with the synthetic key.
import assert from 'node:assert/strict';

const base = process.argv[2];
const key = process.env.SPR_REVIEWER_TOKEN;
if (
  !base ||
  !['127.0.0.1', 'localhost'].includes(new URL(base).hostname) ||
  key !== 'ci-publication-synthetic-reviewer-key-2026'
) {
  throw new Error('Use an explicit disposable loopback service and the CI synthetic reviewer key');
}
async function call(path, token, body, expected = 200) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json', Origin: base }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`);
  return data;
}
// Verify the dedicated operator configuration before creating any synthetic data.
await call('/api/v1/review/cases', key);
const item = await call(
  '/api/v1/applications',
  null,
  {
    name: 'Container publication fixture',
    handle: '@container.fixture',
    nature: 'synthetic',
    holderType: 'company',
    holder: 'Synthetic CI Studio',
    langs: 'English',
    email: 'private-container@example.test',
    evidence: ['licences'],
  },
  201,
);
const owner = `/api/v1/cases/${item.id}/publication`;
const review = `/api/v1/review/cases/${item.id}`;
const upload = await fetch(base + `/api/v1/cases/${item.id}/evidence`, {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + item.accessToken,
    Origin: base,
    'Content-Type': 'application/pdf',
    'X-Evidence-Kind': 'licences',
    'X-File-Name': 'synthetic-private-fixture.pdf',
    'X-Evidence-Source': 'Synthetic CI test fixture only',
  },
  body: '%PDF-1.4\nSynthetic private fixture, not a real rights document.',
});
assert.equal(upload.status, 201);
const file = await upload.json();
await call(`/api/v1/review/evidence/${file.id}/decision`, key, {
  decision: 'accepted',
  note: 'Synthetic fixture accepted for CI only.',
});
await call(review + '/status', key, { status: 'reviewing', note: '' });
await call(review + '/status', key, {
  status: 'approved',
  note: 'Synthetic workflow approval only.',
});
const content = {
  name: 'Container publication fixture',
  handle: '@container.fixture',
  nature: 'synthetic',
  holder: 'Synthetic CI Studio',
  languages: 'English',
  occupation: 'Presenter',
  description: 'A synthetic persona for disposable container acceptance only.',
  usageTerms: 'Test fixture only. No commercial permissions are granted.',
};
const first = await call(review + '/publication/drafts', key, { content, expectedVersion: 0 }, 201);
await call('/api/v1/passports/' + first.passportId, null, undefined, 404);
await call(
  owner + '/publish',
  item.accessToken,
  { version: 1, digest: first.draft.digest, consent: false },
  422,
);
await call(owner + '/publish', item.accessToken, {
  version: 1,
  digest: first.draft.digest,
  consent: true,
});
const published = await call('/api/v1/passports/' + first.passportId);
assert.equal(published.version, 1);
assert.equal(published.name, content.name);
assert.ok(!JSON.stringify(published).includes(item.id));
assert.ok(!JSON.stringify(published).includes('private-container@example.test'));
const update = await call(
  owner + '/updates',
  item.accessToken,
  {
    content: {
      ...content,
      description: 'An updated synthetic description awaiting review and renewed consent.',
    },
    expectedVersion: 1,
  },
  201,
);
await call(
  owner + '/publish',
  item.accessToken,
  { version: 2, digest: update.draft.digest, consent: true },
  409,
);
assert.equal((await call('/api/v1/passports/' + first.passportId)).version, 1);
await call(review + '/publication/review', key, {
  version: 2,
  digest: update.draft.digest,
  decision: 'approve',
  note: 'Synthetic update approved.',
});
await call(owner + '/publish', item.accessToken, {
  version: 2,
  digest: update.draft.digest,
  consent: true,
});
assert.equal((await call('/api/v1/passports/' + first.passportId)).version, 2);
await call(owner + '/revoke', item.accessToken, {
  version: 2,
  reason: 'Disposable container test completed.',
  confirmed: true,
});
const tombstone = await call('/api/v1/passports/' + first.passportId);
assert.equal(tombstone.status, 'revoked');
assert.equal(Object.hasOwn(tombstone, 'name'), false);
assert.equal(
  (await call('/api/v1/personas')).personas.some((p) => p.id === first.passportId),
  false,
);
console.log(
  JSON.stringify({
    scope: 'synthetic-container-acceptance',
    publishedVersion: 2,
    finalStatus: tombstone.status,
    privatePublicBoundary: true,
  }),
);
