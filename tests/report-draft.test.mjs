import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const page = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const source = page.match(/const REPORT_DRAFT_TTL=[\s\S]*?\nfunction Report\(/);
assert.ok(source);
const { restoreReportDraft, readReportDraft, saveReportDraft, reportDraftKey, REPORT_DRAFT_TTL } = runInNewContext(
  source[0].replace(/\nfunction Report\($/, '') + '\n({restoreReportDraft,readReportDraft,saveReportDraft,reportDraftKey,REPORT_DRAFT_TTL})'
);
const now = Date.UTC(2026, 9, 22, 10);
const data = { who: 'Leyla Kaya (PP-TR-0004)', what: 'other', details: '  Draft with a link: https://example.com/demo\nSecond line.  ', email: 'draft@example.com' };
const packet = { version: 1, savedAt: now, data };
const plain = value => JSON.parse(JSON.stringify(value));
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('report drafts preserve unfinished fields verbatim across serialization', () => {
  const saved = storage(), key = reportDraftKey('PP-TR-0004');
  saveReportDraft(saved, key, data, now);
  assert.deepEqual(plain(readReportDraft(saved, key, now + 1)), { savedAt: now, data });
  const unfinished = { who: '', what: '', details: 'short', email: 'unfinished@' };
  saveReportDraft(saved, key, unfinished, now + 2);
  assert.deepEqual(plain(readReportDraft(saved, key, now + 3)).data, unfinished);
});

test('drafts expire after 24 hours and malformed or oversized records cannot restore', () => {
  assert.ok(restoreReportDraft(packet, now + REPORT_DRAFT_TTL - 1));
  assert.equal(restoreReportDraft(packet, now + REPORT_DRAFT_TTL), null);
  for (const value of [null, [], {}, { ...packet, version: 2 }, { ...packet, savedAt: Infinity }, { ...packet, savedAt: 'today' }, { ...packet, savedAt: now + 60001 }, { ...packet, data: null }, { ...packet, data: { ...data, who: 42 } }, { ...packet, data: { ...data, what: 'unknown' } }, { ...packet, data: { ...data, details: 'x'.repeat(4001) } }, { ...packet, data: { ...data, who: 'x'.repeat(161) } }, { ...packet, data: { ...data, email: 'x'.repeat(255) } }]) {
    assert.equal(restoreReportDraft(value, now), null);
  }
});

test('persona and general drafts stay separate and cleanup only removes the requested key', () => {
  const saved = storage(), first = reportDraftKey('PP-TR-0004'), second = reportDraftKey('PP-TR-0027'), general = reportDraftKey();
  saveReportDraft(saved, first, data, now);
  saveReportDraft(saved, second, { ...data, who: 'Emre Demir' }, now);
  saveReportDraft(saved, general, { ...data, who: 'Unregistered example' }, now);
  saved.setItem('unrelated', 'keep');
  saved.removeItem(first);
  assert.equal(readReportDraft(saved, first, now), null);
  assert.equal(readReportDraft(saved, second, now).data.who, 'Emre Demir');
  assert.equal(readReportDraft(saved, general, now).data.who, 'Unregistered example');
  assert.equal(saved.getItem('unrelated'), 'keep');
  saved.setItem(first, '{broken');
  assert.equal(readReportDraft(saved, first, now), null);
  assert.equal(saved.getItem(first), null);
  saveReportDraft(saved, first, data, now - REPORT_DRAFT_TTL);
  assert.equal(readReportDraft(saved, first, now), null);
  assert.equal(saved.getItem(first), null);
  assert.ok(saved.getItem(second));
});

test('storage failures remain observable so the interface cannot claim a successful save', () => {
  assert.throws(() => saveReportDraft({ setItem() { throw new Error('quota'); } }, 'draft', data, now), /quota/);
  assert.throws(() => readReportDraft({ getItem() { throw new Error('blocked'); } }, 'draft', now), /blocked/);
  const saved = storage();
  assert.throws(() => saveReportDraft(saved, 'draft', { ...data, what: 'invalid' }, now), /Invalid report draft/);
  assert.equal(saved.getItem('draft'), null);
});

test('report routes retain only a known persona context after reload', () => {
  const people = JSON.parse(readFileSync(new URL('../data/personas.json', import.meta.url), 'utf8')).personas;
  const parseSource = page.match(/function parse\(\)\{[\s\S]*?\n\}/)[0];
  const parse = hash => plain(runInNewContext(parseSource + '\nparse()', { location: { hash }, PEOPLE: people, byId: id => people.find(person => person.id === id) }));
  assert.deepEqual(parse('#report'), { name: 'report' });
  assert.deepEqual(parse('#report/PP-TR-0004'), { name: 'report', id: 'PP-TR-0004' });
  assert.deepEqual(parse('#report/pp-tr-0027'), { name: 'report', id: 'PP-TR-0027' });
  for (const hash of ['#report/unknown', '#report/PP-TR-0004/extra', '#report/%E0%A4%A']) assert.deepEqual(parse(hash), { name: 'home' });
});
