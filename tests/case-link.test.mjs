import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const page = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const source = page.match(/const CASE_ID_FORMAT =[\s\S]*?\n}\nfunction CaseAccess/);
assert.ok(source, 'Private link parser is present in the standalone interface');
const parseLink = runInNewContext(source[0].replace(/\nfunction CaseAccess$/, '') + '\nparsePrivateCaseLink', { URL });
const base = 'http://127.0.0.1:4178/';
const id = 'SPR-2026-0123456789AB';
const token = 'aB9_-'.repeat(8) + 'XyZ';
const hash = `#case/${id}/${token}`;

test('private links preserve the token and support complete, fragment and encoded links', () => {
  for (const input of [base + hash, hash, `  ${base + hash}\n`, base + '#case/' + id.toLowerCase() + '/' + token, base + '#' + encodeURIComponent(hash.slice(1))]) {
    const result = parseLink(input, base + '#case-status');
    assert.equal(result.id, id);
    assert.equal(result.token, token);
    assert.equal(result.error, undefined);
  }
  assert.equal(parseLink(base + hash.replace('SPR-', 'RPT-'), base).id, 'RPT-2026-0123456789AB');
});

test('private links reject foreign addresses, executable URLs and malformed credentials', () => {
  const invalid = [
    '', 'not a link', 'javascript:alert(1)', '//evil.example/' + hash,
    'https://evil.example/' + hash, 'http://127.0.0.1:4179/' + hash,
    'https://127.0.0.1:4178/' + hash, base + 'another-registry/' + hash,
    'http://user:password@127.0.0.1:4178/' + hash,
    base + '#case/' + id, base + hash + '/extra', base + hash + '?extra=1',
    base + hash.slice(0, -1), base + hash + 'X', base + hash.replace('2026', '26'),
    base + '#case/' + id + '/%E0%A4%A', base + hash.slice(0, -1) + '%2F',
    base + hash.slice(0, -1) + ' ', base + hash.replace('aB9', 'a B9'),
  ];
  for (const input of invalid) {
    const result = parseLink(input, base);
    assert.ok(result.error, `Expected rejection: ${input}`);
    assert.equal(result.id, undefined);
    assert.equal(result.token, undefined);
  }
});
