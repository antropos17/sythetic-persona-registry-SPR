import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = join(root, 'data/media-provenance.json');
const personas = JSON.parse(readFileSync(join(root, 'data/personas.json'), 'utf8')).personas;
const assets = personas.flatMap(person => [
  { personaId: person.id, role: 'portrait', path: `assets/portraits/${person.id}.jpg` },
  { personaId: person.id, role: 'full_body', path: `assets/full-body/${person.id}.jpg` }
].map(asset => ({ ...asset, sha256: createHash('sha256').update(readFileSync(join(root, asset.path))).digest('hex') })));
const manifest = {
  version: 1,
  originClaim: 'Project-created AI-generated fictional illustrations',
  originBasis: 'Project declaration; original generation files and C2PA manifests were not captured',
  assets
};
const output = JSON.stringify(manifest, null, 2) + '\n';
if (process.argv.includes('--write')) {
  writeFileSync(destination, output);
  console.log('Updated data/media-provenance.json');
} else {
  let existing;
  try { existing = JSON.parse(readFileSync(destination, 'utf8')); }
  catch { existing = null; }
  if (JSON.stringify(existing) !== JSON.stringify(manifest)) {
    console.error('Media manifest does not match the checked-in images. Run npm run media:update after reviewing the assets.');
    process.exitCode = 1;
  }
}
