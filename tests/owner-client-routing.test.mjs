import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../site/app/domain/routing.mjs';
import { privateJson, submitCaseEvidence, submitToRegistry } from '../site/app/domain/api.mjs';

test('account, claimed case and legacy private routes remain distinct', () => {
  const id = 'SPR-2026-0123456789AB';
  const token = 'a'.repeat(43);
  globalThis.location = { hash: '#account' };
  assert.deepEqual(parse(), { name: 'account' });
  globalThis.location.hash = '#case-status';
  assert.deepEqual(parse(), { name: 'case-status' });
  globalThis.location.hash = '#case/' + id;
  assert.deepEqual(parse(), { name: 'case', id });
  globalThis.location.hash = '#case/' + id + '/' + token;
  assert.deepEqual(parse(), { name: 'case', id, accessToken: token });
  globalThis.location.hash = '#account/claim/' + id + '/' + token;
  assert.deepEqual(parse(), { name: 'account', claim: { id, token } });
});

test('cookie writes use owner header and legacy bearer access retains authorization', async () => {
  const calls = [];
  globalThis.location = { protocol: 'https:' };
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options });
    return { ok: true, json: async () => ({}) };
  };
  await privateJson('/case/publication', undefined, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  await privateJson('/case', 'private-token');
  await submitCaseEvidence(
    'case',
    null,
    'images',
    { type: 'image/png', name: 'a.png' },
    'source statement',
    () => {},
    async () => {},
  );
  await submitToRegistry('/application', {});
  assert.equal(calls[0].options.headers['X-SPR-Owner'], '1');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer private-token');
  assert.equal(calls[2].options.headers['X-SPR-Owner'], '1');
  assert.equal(calls[3].options.headers['X-SPR-Owner'], '1');
  for (const call of calls) assert.equal(call.options.credentials, 'same-origin');
});
