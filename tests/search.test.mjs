import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const page = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const source = page.match(/const normalizeSearch =[\s\S]*?\nconst navigate =/);
assert.ok(source, 'Shared search helpers are present');
const PEOPLE = JSON.parse(readFileSync(new URL('../data/personas.json', import.meta.url), 'utf8')).personas;
const search = runInNewContext(source[0].replace(/\nconst navigate =$/, '') + '\nsearchPeople', { PEOPLE });
const names = rows => Array.from(rows, person => person.name);

test('search normalizes whitespace and case and prioritizes exact identifiers', () => {
  for (const query of ['  Emre   DEMIR  ', 'Emré Demir', 'pp-tr-0027', '@EMRE.FRAMES', 'emre.frames']) {
    const result = search(query);
    assert.deepEqual(names(result.matches), ['Emre Demir']);
    assert.equal(result.suggestions.length, 0);
  }
  const pool = [...PEOPLE, { ...PEOPLE[0], id: 'PP-XX-9999', name: 'Emre Frames', holder: '@emre.frames' }];
  assert.deepEqual(names(search('@emre.frames', pool).matches), ['Emre Demir']);
});

test('misspelled names return explicit suggestions without turning into matches', () => {
  for (const [query, expected] of [['Emre Demr', 'Emre Demir'], ['Emre Dmeir', 'Emre Demir'], ['Fidna', 'Fidan'], ['Mria', 'Mira Sol'], ['Rafel Costa', 'Rafael Costa']]) {
    const result = search(query);
    assert.equal(result.matches.length, 0, query);
    assert.deepEqual(names(result.suggestions), [expected], query);
  }
  assert.deepEqual(names(search('Demr').suggestions), ['Emre Demir']);
  assert.deepEqual(names(search('Emre').matches), ['Emre Demir']);
});

test('identifier typos, short queries and unrelated input never receive name correction', () => {
  for (const query of ['PP-TR-0028', '@emre.farmes', 'emre.farmes', 'https://emre.example', 'xyz', 'zzzzzzzz', 'x'.repeat(10000), '']) {
    const result = search(query);
    assert.equal(result.matches.length, 0, query.slice(0, 80));
    assert.equal(result.suggestions.length, 0, query.slice(0, 80));
  }
});

test('the comparison candidate pool excludes the first persona even for approximate names', () => {
  const pool = PEOPLE.filter(person => person.id !== 'PP-TR-0027');
  assert.equal(search('Emre Demir', pool).matches.length, 0);
  assert.equal(search('Emre Demr', pool).suggestions.length, 0);
  assert.deepEqual(names(search('Leyla Kya', pool).suggestions), ['Leyla Kaya']);
});

test('an incomplete passport prefix retains all candidates while a full ID remains unique', () => {
  assert.deepEqual(names(search('PP-TR').matches), ['Leyla Kaya', 'Emre Demir']);
  assert.deepEqual(names(search('PP-TR-0027').matches), ['Emre Demir']);
  assert.equal(search('PP-TR').suggestions.length, 0);
});
