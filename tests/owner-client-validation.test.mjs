import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOwnerFields } from '../site/app/domain/owner.mjs';

test('account validation counts Unicode code points and preserves password spaces', () => {
  assert.deepEqual(
    validateOwnerFields({ username: 'Member.1', password: '😀'.repeat(15), enforceLength: true }),
    {},
  );
  assert.deepEqual(
    validateOwnerFields({ username: 'member', password: ' '.repeat(15), enforceLength: true }),
    {},
  );
  assert.match(
    validateOwnerFields({ username: 'member', password: '😀'.repeat(14), enforceLength: true })[
      'owner-password'
    ],
    /15 to 128/,
  );
  assert.match(
    validateOwnerFields({ username: 'member', password: 'x'.repeat(129), enforceLength: true })[
      'owner-password'
    ],
    /15 to 128/,
  );
});

test('account validation identifies missing or invalid fields in navigation order', () => {
  assert.deepEqual(
    Object.keys(
      validateOwnerFields({
        username: 'ab',
        recoveryInput: '',
        newPassword: '',
        enforceLength: true,
      }),
    ),
    ['owner-username', 'owner-recovery', 'owner-password'],
  );
  assert.deepEqual(
    Object.keys(
      validateOwnerFields({
        currentPassword: '',
        newPassword: 'short',
        security: true,
        enforceLength: true,
      }),
    ),
    ['owner-current', 'owner-new'],
  );
  assert.ok(validateOwnerFields({ sessionPassword: '' })['owner-session-password']);
  assert.deepEqual(
    validateOwnerFields({ username: 'good_name', password: 'old', enforceLength: false }),
    {},
  );
});
