import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../server/db.mjs';

const content = {
  name: 'Ada',
  handle: '@ada',
  nature: 'synthetic',
  holder: 'Example Ltd',
  languages: 'English',
  occupation: 'Artist',
  description: 'A fictional artist working with sound.',
  usageTerms: 'Please request permission before any commercial use.',
};
function approved(db) {
  const submission = db.create('application', {
    name: 'Ada',
    handle: '@ada',
    nature: 'synthetic',
    holder: 'Example Ltd',
    email: 'secret@example.com',
    evidence: ['images'],
  });
  const ev = db.addEvidence(submission.id, submission.accessToken, {
    kind: 'images',
    fileName: 'private.png',
    sourceStatement: 'private evidence source',
    mime: 'image/png',
    content: Buffer.from('private'),
  });
  db.reviewEvidence(ev.id, 'accepted', 'Accepted');
  db.updateStatus(submission.id, 'reviewing', '');
  db.updateStatus(submission.id, 'approved', 'Approved');
  return submission;
}
function errorStatus(fn, status) {
  assert.throws(fn, (error) => error.status === status);
}

test('publication persists consent, protects private data and terminal revocation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spr-publication-'));
  const path = join(dir, 'test.sqlite');
  let db = openDatabase(path);
  try {
    const owner = approved(db);
    assert.deepEqual(db.publication.getOwner(owner.id, owner.accessToken), {
      passportId: null,
      latestVersion: 0,
      current: null,
      draft: null,
    });
    errorStatus(() => db.publication.getOwner(owner.id, 'wrong'), 404);
    errorStatus(
      () =>
        db.publication.createOwner(owner.id, owner.accessToken, { content, expectedVersion: 0 }),
      409,
    );
    errorStatus(
      () =>
        db.publication.createReviewer(owner.id, {
          content: { ...content, email: 'secret@example.com' },
          expectedVersion: 0,
        }),
      422,
    );
    errorStatus(
      () =>
        db.publication.createReviewer(owner.id, {
          content: { ...content, holder: 'Another holder' },
          expectedVersion: 0,
        }),
      422,
    );
    const first = db.publication.createReviewer(owner.id, { content, expectedVersion: 0 });
    assert.match(first.passportId, /^PP-SPR-[A-F0-9]{12}$/);
    assert.equal(db.publication.getPublic(first.passportId), null);
    errorStatus(
      () =>
        db.publication.publish(owner.id, owner.accessToken, {
          version: 1,
          digest: '0'.repeat(64),
          consent: true,
        }),
      409,
    );
    const published = db.publication.publish(owner.id, owner.accessToken, {
      version: 1,
      digest: first.draft.digest,
      consent: true,
    });
    assert.equal(published.current.name, 'Ada');
    assert.equal(JSON.stringify(published.current).includes('secret'), false);
    assert.deepEqual(
      db.publication.publish(owner.id, owner.accessToken, {
        version: 1,
        digest: first.draft.digest,
        consent: true,
      }),
      published,
    );
    const pending = db.publication.createOwner(owner.id, owner.accessToken, {
      content: { ...content, name: 'Ada Two' },
      expectedVersion: 1,
    });
    assert.equal(pending.draft.status, 'pending_review');
    assert.equal(db.publication.getPublic(first.passportId).name, 'Ada');
    errorStatus(
      () =>
        db.publication.publish(owner.id, owner.accessToken, {
          version: 1,
          digest: first.draft.digest,
          consent: true,
        }),
      409,
    );
    const reviewed = db.publication.review(owner.id, {
      version: 2,
      digest: pending.draft.digest,
      decision: 'approve',
      note: 'Reviewed',
    });
    assert.equal(reviewed.draft.status, 'awaiting_consent');
    db.close();
    db = openDatabase(path);
    assert.deepEqual(db.publication.getOwner(owner.id, owner.accessToken), reviewed);
    const revoked = db.publication.revoke(owner.id, owner.accessToken, {
      version: 1,
      reason: 'This record is withdrawn.',
      confirmed: true,
    });
    assert.deepEqual(
      Object.keys(revoked.current).sort(),
      [
        'id',
        'recordType',
        'registryMode',
        'revocationReason',
        'revokedAt',
        'status',
        'updatedAt',
        'version',
      ].sort(),
    );
    assert.equal(revoked.draft, null);
    assert.deepEqual(db.publication.listPublic(), []);
    assert.deepEqual(
      db.publication.revoke(owner.id, owner.accessToken, {
        version: 1,
        reason: 'This record is withdrawn.',
        confirmed: true,
      }),
      revoked,
    );
    errorStatus(
      () =>
        db.publication.publish(owner.id, owner.accessToken, {
          version: 2,
          digest: pending.draft.digest,
          consent: true,
        }),
      409,
    );
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('only approved token-bearing applications can receive drafts', () => {
  const db = openDatabase(':memory:');
  try {
    const application = db.create('application', { nature: 'synthetic', holder: 'Example Ltd' });
    const report = db.create('report', {});
    errorStatus(
      () => db.publication.createReviewer(application.id, { content, expectedVersion: 0 }),
      409,
    );
    errorStatus(
      () => db.publication.createReviewer(report.id, { content, expectedVersion: 0 }),
      409,
    );
  } finally {
    db.close();
  }
});

test('review audit and temporary revision quota preserve publication and recovery', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spr-publication-quota-'));
  const path = join(dir, 'test.sqlite');
  let db = openDatabase(path);
  try {
    const owner = approved(db);
    db.publication.createReviewer(owner.id, { content, expectedVersion: 0 });
    const pending = db.publication.createOwner(owner.id, owner.accessToken, {
      content,
      expectedVersion: 1,
    });
    db.publication.review(owner.id, {
      version: 2,
      digest: pending.draft.digest,
      decision: 'reject',
      note: 'Please correct the description.',
    });
    const rejection = db
      .getCase(owner.id, owner.accessToken)
      .events.find((event) => event.action === 'publication_rejected');
    assert.ok(rejection);
    assert.match(rejection.note, /Version 2/);
    assert.ok(rejection.note.includes(pending.draft.digest));
    assert.ok(rejection.note.includes('Please correct the description.'));
    let state;
    for (let expectedVersion = 2; expectedVersion < 30; expectedVersion++) {
      state = db.publication.createReviewer(owner.id, { content, expectedVersion });
    }
    errorStatus(
      () => db.publication.createReviewer(owner.id, { content, expectedVersion: 30 }),
      429,
    );
    const consent = { version: 30, digest: state.draft.digest, consent: true };
    db.publication.publish(owner.id, owner.accessToken, consent);
    db.publication.publish(owner.id, owner.accessToken, consent);
    const events = db.getCase(owner.id, owner.accessToken).events;
    assert.equal(events.filter((event) => event.action === 'publication_consented').length, 1);
    assert.equal(events.filter((event) => event.action === 'publication_published').length, 1);
    db.close();
    const raw = new DatabaseSync(path);
    raw.prepare("UPDATE publication_revisions SET created_at = '2000-01-01T00:00:00.000Z'").run();
    raw.close();
    db = openDatabase(path);
    const resumed = db.publication.createOwner(owner.id, owner.accessToken, {
      content,
      expectedVersion: 30,
    });
    assert.equal(resumed.latestVersion, 31);
    assert.equal(resumed.current.version, 30);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
