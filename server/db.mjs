import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const transitions = {
  application: {
    received: ['reviewing', 'needs_evidence', 'rejected'],
    reviewing: ['needs_evidence', 'approved', 'rejected'],
    needs_evidence: ['reviewing', 'rejected']
  },
  report: {
    received: ['reviewing', 'needs_evidence', 'dismissed'],
    reviewing: ['needs_evidence', 'resolved', 'dismissed'],
    needs_evidence: ['reviewing', 'resolved', 'dismissed']
  }
};

function fail(status, error) { throw { status, error }; }
function tokenHash(token) { return createHash('sha256').update(token).digest('hex'); }

export function openDatabase(path = './var/spr.sqlite') {
  const file = path === ':memory:' ? path : resolve(path);
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA busy_timeout=5000;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('application', 'report')),
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'received',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS submissions_created_at ON submissions(created_at);
  `);
  // Existing local databases remain readable. Older cases have no owner token;
  // an operator can review them, but they cannot be guessed from a case number.
  const columns = new Set(db.prepare('PRAGMA table_info(submissions)').all().map(row => row.name));
  if (!columns.has('access_hash')) db.exec('ALTER TABLE submissions ADD COLUMN access_hash TEXT');
  if (!columns.has('updated_at')) db.exec('ALTER TABLE submissions ADD COLUMN updated_at TEXT');
  db.exec(`
    UPDATE submissions SET updated_at = created_at WHERE updated_at IS NULL;
    CREATE TABLE IF NOT EXISTS submission_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id TEXT NOT NULL REFERENCES submissions(id),
      at TEXT NOT NULL,
      actor TEXT NOT NULL CHECK (actor IN ('submitter', 'reviewer')),
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      evidence_id TEXT
    );
    CREATE INDEX IF NOT EXISTS events_case_id ON submission_events(submission_id, id);
    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES submissions(id),
      kind TEXT NOT NULL,
      original_name TEXT NOT NULL,
      source_statement TEXT NOT NULL DEFAULT '',
      mime TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      content BLOB NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'accepted', 'rejected')),
      review_note TEXT NOT NULL DEFAULT '',
      reviewed_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS evidence_case_id ON evidence(submission_id, created_at);
  `);
  const evidenceColumns = new Set(db.prepare('PRAGMA table_info(evidence)').all().map(row => row.name));
  if (!evidenceColumns.has('source_statement')) db.exec("ALTER TABLE evidence ADD COLUMN source_statement TEXT NOT NULL DEFAULT ''");

  const insert = db.prepare('INSERT INTO submissions (id, kind, payload, status, created_at, updated_at, access_hash) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const event = db.prepare('INSERT INTO submission_events (submission_id, at, actor, action, status, note, evidence_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const rowById = db.prepare('SELECT * FROM submissions WHERE id = ?');
  const rowByAccess = db.prepare('SELECT * FROM submissions WHERE id = ? AND access_hash = ?');
  const eventsFor = db.prepare('SELECT at, actor, action, status, note, evidence_id AS evidenceId FROM submission_events WHERE submission_id = ? ORDER BY id');
  const evidenceFor = db.prepare('SELECT id, kind, original_name AS fileName, source_statement AS sourceStatement, mime, bytes, sha256, review_status AS reviewStatus, review_note AS reviewNote, reviewed_at AS reviewedAt, created_at AS createdAt FROM evidence WHERE submission_id = ? ORDER BY created_at, id');
  const evidenceMetaById = db.prepare('SELECT id, submission_id, review_status, review_note FROM evidence WHERE id = ?');
  const evidenceById = db.prepare('SELECT * FROM evidence WHERE id = ?');

  function transaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = work(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  function present(row, reviewer = false) {
    const value = {
      id: row.id, kind: row.kind, status: row.status,
      createdAt: row.created_at, updatedAt: row.updated_at || row.created_at,
      events: eventsFor.all(row.id), evidence: evidenceFor.all(row.id)
    };
    if (reviewer) value.payload = JSON.parse(row.payload);
    return value;
  }

  return {
    create(kind, payload) {
      const prefix = kind === 'application' ? 'SPR' : 'RPT';
      const createdAt = new Date().toISOString();
      const id = `${prefix}-${createdAt.slice(0, 4)}-${randomBytes(6).toString('hex').toUpperCase()}`;
      const accessToken = randomBytes(32).toString('base64url');
      transaction(() => {
        insert.run(id, kind, JSON.stringify(payload), 'received', createdAt, createdAt, tokenHash(accessToken));
        event.run(id, createdAt, 'submitter', 'submitted', 'received', '', null);
      });
      return { id, status: 'received', createdAt, accessToken };
    },
    getCase(id, accessToken) {
      const row = rowByAccess.get(id, tokenHash(accessToken));
      return row ? present(row) : null;
    },
    getReview(id) {
      const row = rowById.get(id);
      return row ? present(row, true) : null;
    },
    listReview(offset = 0) {
      return db.prepare('SELECT id, kind, status, created_at AS createdAt, COALESCE(updated_at, created_at) AS updatedAt FROM submissions ORDER BY created_at DESC, id DESC LIMIT 50 OFFSET ?').all(offset);
    },
    addEvidence(id, accessToken, data) {
      return transaction(() => {
        const row = rowByAccess.get(id, tokenHash(accessToken));
        if (!row) fail(404, 'Case not found');
        if (!transitions[row.kind][row.status]) fail(409, 'This case is closed');
        const count = db.prepare('SELECT COUNT(*) AS n FROM evidence WHERE submission_id = ?').get(id).n;
        if (count >= 5) fail(409, 'This case already has five evidence files');
        const at = new Date().toISOString();
        const evidenceId = `EV-${randomBytes(12).toString('hex').toUpperCase()}`;
        const sha256 = createHash('sha256').update(data.content).digest('hex');
        db.prepare('INSERT INTO evidence (id, submission_id, kind, original_name, source_statement, mime, bytes, sha256, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(evidenceId, id, data.kind, data.fileName, data.sourceStatement, data.mime, data.content.length, sha256, data.content, at);
        event.run(id, at, 'submitter', 'evidence_uploaded', row.status, '', evidenceId);
        db.prepare('UPDATE submissions SET updated_at = ? WHERE id = ?').run(at, id);
        return { id: evidenceId, kind: data.kind, fileName: data.fileName, sourceStatement: data.sourceStatement, bytes: data.content.length, sha256, reviewStatus: 'pending', createdAt: at };
      });
    },
    reviewEvidence(id, decision, note) {
      return transaction(() => {
        const item = evidenceMetaById.get(id);
        if (!item) fail(404, 'Evidence not found');
        const row = rowById.get(item.submission_id);
        if (!transitions[row.kind][row.status]) fail(409, 'This case is closed');
        if (item.review_status === decision && item.review_note === note) return present(row, true);
        const at = new Date().toISOString();
        db.prepare('UPDATE evidence SET review_status = ?, review_note = ?, reviewed_at = ? WHERE id = ?').run(decision, note, at, id);
        event.run(row.id, at, 'reviewer', `evidence_${decision}`, row.status, note, id);
        db.prepare('UPDATE submissions SET updated_at = ? WHERE id = ?').run(at, row.id);
        return present(rowById.get(row.id), true);
      });
    },
    updateStatus(id, next, note) {
      return transaction(() => {
        const row = rowById.get(id);
        if (!row) fail(404, 'Case not found');
        if (!transitions[row.kind][row.status]?.includes(next)) fail(409, 'Invalid status change');
        if (['approved', 'rejected', 'resolved', 'dismissed', 'needs_evidence'].includes(next) && !note) fail(422, 'A message to the submitter is required');
        if (next === 'approved') {
          const accepted = db.prepare("SELECT kind FROM evidence WHERE submission_id = ? AND review_status = 'accepted'").all(id).map(item => item.kind);
          if (!accepted.length) fail(409, 'Accept at least one evidence file before approving');
          if (JSON.parse(row.payload).nature === 'likeness' && !accepted.includes('consent')) fail(409, 'A licensed likeness requires accepted consent evidence');
        }
        const at = new Date().toISOString();
        db.prepare('UPDATE submissions SET status = ?, updated_at = ? WHERE id = ?').run(next, at, id);
        event.run(id, at, 'reviewer', 'status_changed', next, note, null);
        return present(rowById.get(id), true);
      });
    },
    getEvidence(id) { return evidenceById.get(id) || null; },
    count() { return db.prepare('SELECT COUNT(*) AS n FROM submissions').get().n; },
    close() { db.close(); }
  };
}
