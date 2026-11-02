import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'espree';
import { analyze } from 'eslint-scope';
import globals from 'globals';

const known = new Set([
  ...Object.keys(globals.browser),
  ...Object.keys(globals.es2022),
  '__THREE_INTEGRITY__',
]);
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) =>
    item.isDirectory() ? walk(join(dir, item.name)) : [join(dir, item.name)],
  );
}
let failed = false;
for (const file of walk('site/app').filter((file) => file.endsWith('.mjs'))) {
  const source = readFileSync(file, 'utf8');
  const ast = parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    range: true,
    loc: true,
  });
  const scopes = analyze(ast, { ecmaVersion: 2022, sourceType: 'module' });
  for (const ref of scopes.globalScope.through) {
    if (!known.has(ref.identifier.name)) {
      console.error(`${file}:${ref.identifier.loc.start.line}: undefined ${ref.identifier.name}`);
      failed = true;
    }
  }
  for (const scope of scopes.scopes) {
    for (const variable of scope.variables) {
      if (
        variable.defs.some((def) => def.type === 'ImportBinding') &&
        variable.references.length === 0
      ) {
        console.error(`${file}: unused import ${variable.name}`);
        failed = true;
      }
    }
  }
}
if (failed) process.exitCode = 1;
