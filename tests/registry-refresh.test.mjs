import test from 'node:test';
import assert from 'node:assert/strict';
import { PEOPLE, byId, refreshPeople, isCurrentRefresh } from '../site/app/domain/registry.mjs';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const response = (personas) => ({ ok: true, json: async () => ({ personas }) });
const passport = {
  id: 'PP-SPR-012345ABCDEF',
  recordType: 'published',
  name: 'Example',
  handle: '@example',
  occupation: 'Artist',
  languages: 'English',
  updatedAt: '2026-01-01',
  publishedAt: '2026-01-01',
};

test('a delayed pre-revocation response cannot restore a passport after a newer refresh', async () => {
  const originalFetch = globalThis.fetch;
  const originalPeople = PEOPLE.slice();
  const oldResponse = deferred();
  let call = 0;
  globalThis.fetch = () => (++call === 1 ? oldResponse.promise : Promise.resolve(response([])));
  try {
    const old = refreshPeople();
    const newer = await refreshPeople();
    assert.equal(newer.superseded, false);
    assert.equal(isCurrentRefresh(newer.requestId), true);
    oldResponse.resolve(response([passport]));
    assert.equal((await old).superseded, true);
    assert.equal(byId(passport.id), undefined);
  } finally {
    globalThis.fetch = originalFetch;
    PEOPLE.splice(0, PEOPLE.length, ...originalPeople);
  }
});

test('a delayed failed refresh is superseded by a newer successful refresh', async () => {
  const originalFetch = globalThis.fetch;
  const originalPeople = PEOPLE.slice();
  const oldResponse = deferred();
  let call = 0;
  globalThis.fetch = () =>
    ++call === 1 ? oldResponse.promise : Promise.resolve(response([passport]));
  try {
    const old = refreshPeople();
    const newer = await refreshPeople();
    oldResponse.reject(new Error('offline'));
    const result = await old;
    assert.equal(result.superseded, true);
    assert.equal(isCurrentRefresh(result.requestId), false);
    assert.equal(isCurrentRefresh(newer.requestId), true);
    assert.equal(byId(passport.id).name, 'Example');
  } finally {
    globalThis.fetch = originalFetch;
    PEOPLE.splice(0, PEOPLE.length, ...originalPeople);
  }
});
