import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(path = './var/spr.sqlite') {
  const file = path === ':memory:' ? path : resolve(path);
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN (\'application\', \'report\')), payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'received\', created_at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS submissions_created_at ON submissions(created_at);');
  const insert = db.prepare('INSERT INTO submissions (id, kind, payload, created_at) VALUES (?, ?, ?, ?)');
  return {
    create(kind, payload) {
      const prefix = kind === 'application' ? 'SPR' : 'RPT';
      const createdAt = new Date().toISOString();
      const id = `${prefix}-${createdAt.slice(0, 4)}-${randomBytes(6).toString('hex').toUpperCase()}`;
      insert.run(id, kind, JSON.stringify(payload), createdAt);
      return { id, status: 'received', createdAt };
    },
    count() { return db.prepare('SELECT COUNT(*) AS n FROM submissions').get().n; },
    close() { db.close(); }
  };
}
