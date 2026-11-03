// Exercise only a disposable loopback service using the public synthetic CI key.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const base = process.argv[2];
const key = process.env.SPR_REVIEWER_TOKEN;
const address = base && new URL(base);
if (
  !address ||
  address.protocol !== 'http:' ||
  !['127.0.0.1', 'localhost'].includes(address.hostname) ||
  address.pathname !== '/' ||
  address.search ||
  address.hash ||
  address.username ||
  address.password ||
  key !== 'ci-publication-synthetic-reviewer-key-2026'
)
  throw new Error('Use an explicit disposable loopback service and the CI synthetic reviewer key');

async function call(path, body, { jar, bearer, status = 200, ownerHeader = true } = {}) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(jar?.cookie ? { Cookie: jar.cookie } : {}),
      ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}),
      ...(body === undefined
        ? {}
        : {
            'Content-Type': 'application/json',
            Origin: address.origin,
            ...(ownerHeader ? { 'X-SPR-Owner': '1' } : {}),
          }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  assert.equal(response.status, status, `${path}: ${data.error || 'unexpected status'}`);
  const cookie = response.headers.get('set-cookie');
  if (cookie && jar) jar.cookie = cookie.split(';')[0];
  return { data, cookie };
}
await call('/api/v1/review/cases', undefined, { bearer: key });
const owner = {},
  secondSession = {},
  outsider = {};
const username = 'ci.' + randomBytes(8).toString('hex');
const password = 'Synthetic account password A 2026';
const changedPassword = 'Synthetic account password B 2026';
const recoveredPassword = 'Synthetic account password C 2026';
const application = (
  await call(
    '/api/v1/applications',
    {
      name: 'Account container fixture',
      handle: '@account.container',
      nature: 'synthetic',
      holderType: 'company',
      holder: 'Synthetic Account Studio',
      langs: 'English',
      email: 'private-owner-container@example.test',
      evidence: ['licences'],
    },
    { status: 201 },
  )
).data;
const registration = await call(
  '/api/v1/account/register',
  { username, password },
  { jar: owner, status: 201 },
);
assert.ok(registration.data.recoveryCode);
assert.match(registration.cookie, /HttpOnly/);
assert.match(registration.cookie, /SameSite=Strict/);
const claim = { id: application.id, accessToken: application.accessToken };
await call('/api/v1/account/cases', claim, { jar: owner, ownerHeader: false, status: 403 });
await call(
  '/api/v1/account/cases',
  { ...claim, accessToken: 'x'.repeat(43) },
  { jar: owner, status: 404 },
);
await call('/api/v1/account/cases', claim, { jar: owner });
const casePath = '/api/v1/cases/' + application.id;
await call(casePath, undefined, { bearer: application.accessToken, status: 404 });
await call(casePath, undefined, { jar: owner });
await call(
  '/api/v1/account/register',
  { username: username + '.other', password },
  { jar: outsider, status: 201 },
);
await call(casePath, undefined, { jar: outsider, status: 404 });
await call('/api/v1/account/cases', claim, { jar: outsider, status: 404 });

const upload = await fetch(base + casePath + '/evidence', {
  method: 'POST',
  headers: {
    Cookie: owner.cookie,
    Origin: address.origin,
    'X-SPR-Owner': '1',
    'Content-Type': 'application/pdf',
    'X-Evidence-Kind': 'licences',
    'X-File-Name': 'synthetic-account-evidence.pdf',
    'X-Evidence-Source': 'Synthetic account container fixture only',
  },
  body: '%PDF-1.4\nSynthetic test fixture. Not an actual rights document.',
});
assert.equal(upload.status, 201);
const evidence = await upload.json();
await call(
  '/api/v1/review/evidence/' + evidence.id + '/decision',
  {
    decision: 'accepted',
    note: 'Synthetic account fixture only.',
  },
  { bearer: key },
);
const review = '/api/v1/review/cases/' + application.id;
await call(review + '/status', { status: 'reviewing', note: '' }, { bearer: key });
await call(
  review + '/status',
  { status: 'approved', note: 'Synthetic account workflow approved.' },
  { bearer: key },
);
const content = {
  name: 'Account container fixture',
  handle: '@account.container',
  nature: 'synthetic',
  holder: 'Synthetic Account Studio',
  languages: 'English',
  occupation: 'Presenter',
  description: 'A synthetic account fixture for disposable container acceptance.',
  usageTerms: 'Test fixture only. No commercial permissions are granted.',
};
const draft = (
  await call(
    review + '/publication/drafts',
    { content, expectedVersion: 0 },
    { bearer: key, status: 201 },
  )
).data;
const publication = casePath + '/publication';
await call('/api/v1/passports/' + draft.passportId, undefined, { status: 404 });
await call(
  publication + '/publish',
  { version: 1, digest: draft.draft.digest, consent: true },
  { jar: owner, ownerHeader: false, status: 403 },
);
await call(
  publication + '/publish',
  { version: 1, digest: draft.draft.digest, consent: true },
  { jar: owner },
);
const update = (
  await call(
    publication + '/updates',
    {
      expectedVersion: 1,
      content: {
        ...content,
        description: 'An updated account fixture awaiting review and renewed consent.',
      },
    },
    { jar: owner, status: 201 },
  )
).data;
assert.equal((await call('/api/v1/passports/' + draft.passportId)).data.version, 1);
await call(
  review + '/publication/review',
  { version: 2, digest: update.draft.digest, decision: 'approve', note: 'Synthetic update only.' },
  { bearer: key },
);
await call(
  publication + '/publish',
  { version: 2, digest: update.draft.digest, consent: true },
  { jar: owner },
);
const publicRecord = (await call('/api/v1/passports/' + draft.passportId)).data;
assert.equal(publicRecord.version, 2);
for (const privateValue of [
  username,
  application.id,
  application.accessToken,
  registration.data.recoveryCode,
  'private-owner-container@example.test',
]) {
  assert.equal(JSON.stringify(publicRecord).includes(privateValue), false);
}
await call(
  publication + '/revoke',
  { version: 2, confirmed: true, reason: 'Synthetic account acceptance completed.' },
  { jar: owner },
);
assert.equal((await call('/api/v1/passports/' + draft.passportId)).data.status, 'revoked');

await call('/api/v1/account/login', { username, password }, { jar: secondSession });
assert.equal(
  (await call('/api/v1/account/sessions', undefined, { jar: owner })).data.sessions.length,
  2,
);
await call('/api/v1/account/sessions/revoke-others', { currentPassword: password }, { jar: owner });
assert.equal((await call('/api/v1/account', undefined, { jar: secondSession })).data.account, null);
await call('/api/v1/account/login', { username, password }, { jar: secondSession });
const passwordChange = (
  await call(
    '/api/v1/account/password',
    { currentPassword: password, newPassword: changedPassword },
    { jar: owner },
  )
).data;
assert.equal((await call('/api/v1/account', undefined, { jar: secondSession })).data.account, null);
await call('/api/v1/account/login', { username, password }, { status: 401 });
await call(
  '/api/v1/account/recover',
  { username, recoveryCode: registration.data.recoveryCode, newPassword: recoveredPassword },
  { status: 401 },
);
const recovery = (
  await call('/api/v1/account/recover', {
    username,
    recoveryCode: passwordChange.recoveryCode,
    newPassword: recoveredPassword,
  })
).data;
assert.notEqual(recovery.recoveryCode, passwordChange.recoveryCode);
assert.equal((await call('/api/v1/account', undefined, { jar: owner })).data.account, null);
await call(
  '/api/v1/account/recover',
  { username, recoveryCode: passwordChange.recoveryCode, newPassword: password },
  { status: 401 },
);
await call('/api/v1/account/login', { username, password: recoveredPassword }, { jar: owner });
const cases = (await call('/api/v1/account/cases', undefined, { jar: owner })).data.cases;
assert.ok(cases.some((item) => item.id === application.id));
const automatic = (
  await call(
    '/api/v1/reports',
    {
      who: 'Synthetic account container fixture',
      what: 'other',
      details: 'A disposable report testing automatic ownership after account recovery.',
      email: '',
    },
    { jar: owner, status: 201 },
  )
).data;
assert.equal(automatic.owned, true);
assert.equal(automatic.accessToken, null);
await call('/api/v1/cases/' + automatic.id, undefined, { jar: owner });
await call('/api/v1/account/logout', {}, { jar: owner });
assert.equal((await call('/api/v1/account', undefined, { jar: owner })).data.account, null);
console.log(
  JSON.stringify({
    scope: 'synthetic-owner-container-acceptance',
    bearerInvalidatedOnClaim: true,
    sessionRevocation: true,
    recoveryRotation: true,
    accountPublicationVersion: 2,
    finalPassportStatus: 'revoked',
    automaticOwnership: true,
  }),
);
