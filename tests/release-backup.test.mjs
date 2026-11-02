import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { backupDatabase } from '../scripts/backup.mjs';

test('online backup includes committed WAL evidence and refuses existing destinations', async t => {
  const dir=mkdtempSync(join(tmpdir(),'spr-backup-test-'));
  const source=join(dir,'source.sqlite'), dest=join(dir,'snapshot.sqlite');
  const db=new DatabaseSync(source);
  t.after(()=>{ db.close(); rmSync(dir,{recursive:true,force:true}); });
  db.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE evidence (name TEXT, content BLOB)');
  const bytes=Buffer.from('%PDF- fixture private evidence');
  db.prepare('INSERT INTO evidence VALUES (?,?)').run('sample.pdf',bytes);
  assert.ok(existsSync(source+'-wal'));
  await backupDatabase(source,dest);
  const copy=new DatabaseSync(dest,{readOnly:true});
  try {
    const row=copy.prepare('SELECT name, content FROM evidence').get();
    assert.equal(row.name,'sample.pdf');
    assert.deepEqual(Buffer.from(row.content),bytes);
    assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  } finally { copy.close(); }
  const before=readFileSync(dest);
  await assert.rejects(backupDatabase(source,dest), /exist/i);
  assert.deepEqual(readFileSync(dest),before);
  await assert.rejects(backupDatabase(source,source), /exist/i);
  assert.deepEqual(Buffer.from(db.prepare('SELECT content FROM evidence').get().content),bytes);
  const existing=join(dir,'already.sqlite'); writeFileSync(existing,'existing');
  await assert.rejects(backupDatabase(source,existing), /exist/i);
  assert.equal(readFileSync(existing,'utf8'),'existing');
  const sidecar=join(dir,'reserved.sqlite'); writeFileSync(sidecar+'-wal','preserve');
  await assert.rejects(backupDatabase(source,sidecar), /sidecar/);
  assert.equal(readFileSync(sidecar+'-wal','utf8'),'preserve');
  assert.equal(existsSync(sidecar),false);
  await assert.rejects(backupDatabase(join(dir,'missing.sqlite'),join(dir,'new.sqlite')), /ENOENT/);
  assert.equal(existsSync(join(dir,'missing.sqlite')),false);
});
