import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  gzipSync,
  brotliCompressSync,
  gunzipSync,
  brotliDecompressSync,
  constants,
} from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const { assets } = JSON.parse(readFileSync(join(root, 'data/runtime-assets.json'), 'utf8'));
const three = assets.find((asset) => asset.path === 'assets/vendor/three.min.js');
const outputs = await Promise.all([
  build({
    absWorkingDir: root,
    entryPoints: ['site/app/main.mjs'],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    charset: 'utf8',
    legalComments: 'none',
    write: false,
    outfile: 'site/dist/app.js',
    define: { __THREE_INTEGRITY__: JSON.stringify('sha384-' + three.sha384) },
  }),
  build({
    absWorkingDir: root,
    entryPoints: ['site/styles/index.css'],
    bundle: true,
    minify: true,
    target: 'es2022',
    write: false,
    outfile: 'site/dist/app.css',
  }),
]);
const check = process.argv.includes('--check');
for (const result of outputs) {
  for (const file of result.outputFiles) {
    if (check) {
      let existing;
      try {
        existing = readFileSync(file.path);
      } catch {
        throw new Error('Missing build output; run npm run build');
      }
      if (!existing.equals(Buffer.from(file.contents)))
        throw new Error('Stale build output; run npm run build: ' + file.path);
    } else {
      mkdirSync(join(root, 'site/dist'), { recursive: true });
      writeFileSync(file.path, file.contents);
    }
    const bytes = Buffer.from(file.contents);
    if (check) {
      for (const [extension, decode] of [
        ['.gz', gunzipSync],
        ['.br', brotliDecompressSync],
      ]) {
        if (!decode(readFileSync(file.path + extension)).equals(bytes))
          throw new Error('Stale compressed output; run npm run build: ' + file.path + extension);
      }
    } else {
      writeFileSync(file.path + '.gz', gzipSync(bytes, { level: 9 }));
      writeFileSync(
        file.path + '.br',
        brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }),
      );
    }
  }
}
