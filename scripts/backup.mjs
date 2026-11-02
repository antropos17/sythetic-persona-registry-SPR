import { DatabaseSync, backup } from 'node:sqlite';
import { openSync, closeSync, statSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Reserve the destination exclusively before SQLite opens it. A failed backup is
// left in place for inspection and must never be treated as a valid snapshot.
export async function backupDatabase(sourcePath, destinationPath) {
  if (!sourcePath || !destinationPath) throw new Error('Provide explicit source and destination paths');
  const source = resolve(sourcePath), destination = resolve(destinationPath);
  if (!statSync(source).isFile()) throw new Error('Source must be an existing database file');
  if (['-wal', '-shm', '-journal'].some(suffix => existsSync(destination + suffix))) throw new Error('Destination has existing SQLite sidecar files');
  const input = new DatabaseSync(source, { readOnly: true });
  try {
    const fd = openSync(destination, 'wx', 0o600);
    closeSync(fd);
    await backup(input, destination);
    const snapshot = new DatabaseSync(destination, { readOnly: true });
    try {
      const result = snapshot.prepare('PRAGMA integrity_check').all();
      if (result.length !== 1 || result[0].integrity_check !== 'ok') throw new Error('Snapshot failed SQLite integrity_check');
    } finally { snapshot.close(); }
  } finally { input.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4) {
    console.error('Usage: node scripts/backup.mjs <existing-source.sqlite> <new-backup.sqlite>');
    process.exitCode = 1;
  } else {
    try {
      await backupDatabase(process.argv[2], process.argv[3]);
      console.log('Backup completed and passed SQLite integrity_check. Protect the backup as private data.');
    } catch (error) {
      console.error('Backup failed:', error.message, 'If a destination was created, it is incomplete and must not be used.');
      process.exitCode = 1;
    }
  }
}
