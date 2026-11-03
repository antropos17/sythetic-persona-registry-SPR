import { createHash, randomBytes } from 'node:crypto';

const fields = [
  'name',
  'handle',
  'nature',
  'holder',
  'languages',
  'occupation',
  'description',
  'usageTerms',
];
const limits = {
  name: [1, 120],
  handle: [2, 80],
  nature: [1, 20],
  holder: [1, 160],
  languages: [0, 160],
  occupation: [1, 80],
  description: [20, 600],
  usageTerms: [20, 1500],
};
const badControls = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/;
function fail(status, error) {
  throw { status, error };
}
function exact(body, keys) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(body, k))
  )
    fail(422, 'Invalid request fields');
}
function contentValue(value, application) {
  exact(value, fields);
  const result = {};
  for (const key of fields) {
    if (
      typeof value[key] !== 'string' ||
      badControls.test(value[key]) ||
      (!['description', 'usageTerms'].includes(key) && /[\r\n\t]/.test(value[key]))
    )
      fail(422, `Invalid ${key}`);
    const normalized = value[key].trim().replace(/\r\n?/g, '\n');
    const [min, max] = limits[key];
    if (normalized.length < min || normalized.length > max) fail(422, `Invalid ${key}`);
    result[key] = normalized;
  }
  if (
    !/^@?[\p{L}\p{N}_.]{2,80}$/u.test(result.handle) ||
    !['synthetic', 'likeness'].includes(result.nature)
  )
    fail(422, 'Invalid publication content');
  if (result.nature !== application.nature || result.holder !== application.holder)
    fail(422, 'Nature and holder must match the approved application');
  return result;
}
function version(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail(422, 'Invalid version');
}
function digest(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(422, 'Invalid digest');
}
function text(value, min, max) {
  if (typeof value !== 'string' || badControls.test(value)) fail(422, 'Invalid message');
  const result = value.trim().replace(/\r\n?/g, '\n');
  if (result.length < min || result.length > max) fail(422, 'Invalid message');
  return result;
}

export function publicationStore(db, transaction, rowById, resolveAccess, event) {
  db.exec(`CREATE TABLE IF NOT EXISTS publications (
    id TEXT PRIMARY KEY, submission_id TEXT NOT NULL UNIQUE REFERENCES submissions(id),
    latest_version INTEGER NOT NULL DEFAULT 0, current_version INTEGER, created_at TEXT NOT NULL,
    revoked_at TEXT, revocation_reason TEXT
  );
  CREATE TABLE IF NOT EXISTS publication_revisions (
    publication_id TEXT NOT NULL REFERENCES publications(id), version INTEGER NOT NULL,
    digest TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL,
    reviewed_at TEXT, review_note TEXT NOT NULL DEFAULT '', published_at TEXT,
    PRIMARY KEY(publication_id, version)
  );`);
  const pubByCase = db.prepare('SELECT * FROM publications WHERE submission_id = ?');
  const pubById = db.prepare('SELECT * FROM publications WHERE id = ?');
  const revision = db.prepare(
    'SELECT * FROM publication_revisions WHERE publication_id = ? AND version = ?',
  );
  function owner(id, token) {
    const row = resolveAccess(id, token);
    if (!row) fail(404, 'Case not found');
    return row;
  }
  function reviewer(id) {
    const row = rowById.get(id);
    if (!row) fail(404, 'Case not found');
    return row;
  }
  function eligible(row) {
    if (row.kind !== 'application' || row.status !== 'approved' || !row.access_hash && !row.owner_account_id)
      fail(409, 'An approved application with an owner token is required');
  }
  function publicValue(pub) {
    if (!pub || !pub.current_version) return null;
    if (pub.revoked_at)
      return {
        id: pub.id,
        recordType: 'published',
        version: pub.current_version,
        status: 'revoked',
        revokedAt: pub.revoked_at,
        updatedAt: pub.revoked_at,
        revocationReason: pub.revocation_reason,
        registryMode: 'demonstration',
      };
    const rev = revision.get(pub.id, pub.current_version);
    return {
      id: pub.id,
      recordType: 'published',
      version: rev.version,
      status: 'published',
      ...JSON.parse(rev.content),
      createdAt: pub.created_at,
      publishedAt: rev.published_at,
      updatedAt: rev.published_at,
      reviewedAt: rev.reviewed_at,
      registryMode: 'demonstration',
    };
  }
  function state(row) {
    const pub = pubByCase.get(row.id);
    if (!pub) return { passportId: null, latestVersion: 0, current: null, draft: null };
    const rev = revision.get(pub.id, pub.latest_version);
    const draft =
      !pub.revoked_at &&
      rev &&
      ['pending_review', 'awaiting_consent', 'rejected'].includes(rev.status)
        ? {
            version: rev.version,
            digest: rev.digest,
            status: rev.status,
            content: JSON.parse(rev.content),
            createdAt: rev.created_at,
            reviewedAt: rev.reviewed_at,
            reviewNote: rev.review_note,
          }
        : null;
    return {
      passportId: pub.id,
      latestVersion: pub.latest_version,
      current: publicValue(pub),
      draft,
    };
  }
  function createRevision(row, body, actor) {
    exact(body, ['content', 'expectedVersion']);
    version(body.expectedVersion);
    eligible(row);
    const content = contentValue(body.content, JSON.parse(row.payload));
    let pub = pubByCase.get(row.id);
    if ((pub?.latest_version || 0) !== body.expectedVersion) fail(409, 'Stale publication version');
    if (pub?.revoked_at) fail(409, 'Passport is revoked');
    if (actor === 'submitter' && !pub) fail(409, 'A reviewer must prepare the first draft');
    const now = Date.now();
    if (
      pub &&
      db
        .prepare(
          'SELECT COUNT(*) AS n FROM publication_revisions WHERE publication_id = ? AND created_at > ?',
        )
        .get(pub.id, new Date(now - 3_600_000).toISOString()).n >= 30
    )
      fail(429, 'Too many publication revisions; try again later');
    const at = new Date(now).toISOString();
    if (!pub) {
      const id = `PP-SPR-${randomBytes(6).toString('hex').toUpperCase()}`;
      db.prepare('INSERT INTO publications (id, submission_id, created_at) VALUES (?, ?, ?)').run(
        id,
        row.id,
        at,
      );
      pub = pubByCase.get(row.id);
    }
    const next = pub.latest_version + 1;
    const serialized = JSON.stringify(content);
    const hash = createHash('sha256').update(serialized).digest('hex');
    db.prepare(
      "UPDATE publication_revisions SET status = 'superseded' WHERE publication_id = ? AND status IN ('pending_review','awaiting_consent','rejected')",
    ).run(pub.id);
    db.prepare(
      'INSERT INTO publication_revisions (publication_id, version, digest, content, status, created_at, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(
      pub.id,
      next,
      hash,
      serialized,
      actor === 'reviewer' ? 'awaiting_consent' : 'pending_review',
      at,
      actor === 'reviewer' ? at : null,
    );
    db.prepare('UPDATE publications SET latest_version = ? WHERE id = ?').run(next, pub.id);
    event.run(
      row.id,
      at,
      actor,
      'publication_revision_created',
      row.status,
      `Version ${next}; SHA-256 ${hash}`,
      null,
    );
    return state(row);
  }
  return {
    getOwner(id, token) {
      return state(owner(id, token));
    },
    getReviewer(id) {
      return state(reviewer(id));
    },
    createOwner(id, token, body) {
      return transaction(() => createRevision(owner(id, token), body, 'submitter'));
    },
    createReviewer(id, body) {
      return transaction(() => createRevision(reviewer(id), body, 'reviewer'));
    },
    review(id, body) {
      return transaction(() => {
        const row = reviewer(id);
        exact(body, ['version', 'digest', 'decision', 'note']);
        version(body.version);
        digest(body.digest);
        if (!['approve', 'reject'].includes(body.decision)) fail(422, 'Invalid decision');
        const note = text(body.note, body.decision === 'reject' ? 1 : 0, 1000);
        eligible(row);
        const pub = pubByCase.get(id);
        if (!pub || pub.revoked_at || pub.latest_version !== body.version)
          fail(409, 'Stale publication version');
        const rev = revision.get(pub.id, body.version);
        if (!rev || rev.digest !== body.digest || rev.status !== 'pending_review')
          fail(409, 'Revision is not pending review');
        const at = new Date().toISOString();
        db.prepare(
          'UPDATE publication_revisions SET status = ?, reviewed_at = ?, review_note = ? WHERE publication_id = ? AND version = ?',
        ).run(
          body.decision === 'approve' ? 'awaiting_consent' : 'rejected',
          at,
          note,
          pub.id,
          body.version,
        );
        event.run(
          id,
          at,
          'reviewer',
          body.decision === 'approve' ? 'publication_approved' : 'publication_rejected',
          row.status,
          `Version ${body.version}; SHA-256 ${body.digest}${note ? `; ${note}` : ''}`,
          null,
        );
        return state(row);
      });
    },
    publish(id, token, body) {
      return transaction(() => {
        const row = owner(id, token);
        exact(body, ['version', 'digest', 'consent']);
        version(body.version);
        digest(body.digest);
        if (body.consent !== true) fail(422, 'Explicit consent is required');
        eligible(row);
        const pub = pubByCase.get(id);
        if (!pub || pub.revoked_at || pub.latest_version !== body.version)
          fail(409, 'Stale publication version');
        const rev = revision.get(pub.id, body.version);
        if (!rev || rev.digest !== body.digest) fail(409, 'Revision digest does not match');
        if (pub.current_version === body.version && rev.status === 'published') return state(row);
        if (rev.status !== 'awaiting_consent') fail(409, 'Revision is not awaiting consent');
        const at = new Date().toISOString();
        db.prepare(
          "UPDATE publication_revisions SET status = 'published', published_at = ? WHERE publication_id = ? AND version = ?",
        ).run(at, pub.id, body.version);
        db.prepare('UPDATE publications SET current_version = ? WHERE id = ?').run(
          body.version,
          pub.id,
        );
        event.run(
          id,
          at,
          'submitter',
          'publication_consented',
          row.status,
          `Version ${body.version}; SHA-256 ${body.digest}`,
          null,
        );
        event.run(
          id,
          at,
          'submitter',
          'publication_published',
          row.status,
          `Version ${body.version}; SHA-256 ${body.digest}`,
          null,
        );
        return state(row);
      });
    },
    revoke(id, token, body) {
      return transaction(() => {
        const row = owner(id, token);
        exact(body, ['version', 'reason', 'confirmed']);
        version(body.version);
        if (body.confirmed !== true) fail(422, 'Explicit confirmation is required');
        const reason = text(body.reason, 10, 300);
        eligible(row);
        const pub = pubByCase.get(id);
        if (!pub || !pub.current_version) fail(409, 'Passport is not published');
        if (pub.revoked_at) {
          if (pub.current_version === body.version && pub.revocation_reason === reason)
            return state(row);
          fail(409, 'Passport is revoked');
        }
        if (pub.current_version !== body.version) fail(409, 'Stale publication version');
        const at = new Date().toISOString();
        db.prepare(
          "UPDATE publication_revisions SET status = 'superseded' WHERE publication_id = ? AND status IN ('pending_review','awaiting_consent','rejected')",
        ).run(pub.id);
        db.prepare(
          'UPDATE publications SET revoked_at = ?, revocation_reason = ? WHERE id = ?',
        ).run(at, reason, pub.id);
        event.run(
          id,
          at,
          'submitter',
          'publication_revoked',
          row.status,
          `Version ${body.version}`,
          null,
        );
        return state(row);
      });
    },
    getPublic(id) {
      return publicValue(pubById.get(id));
    },
    listPublic() {
      return db
        .prepare(
          'SELECT * FROM publications WHERE current_version IS NOT NULL AND revoked_at IS NULL ORDER BY created_at, id',
        )
        .all()
        .map(publicValue);
    },
  };
}
