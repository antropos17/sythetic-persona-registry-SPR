import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const page=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
const latest=page.match(/function latestReviewerMessage\(events,status\)\{[\s\S]*?\n\}/)[0];
const answer=page.match(/const REVIEW_ANSWER_LABELS=[\s\S]*?(?=function ReviewConsole\()/)[0];
const helpers=runInNewContext(`${latest}\n${answer}\n({latestReviewerMessage,reviewAnswerLabel,reviewAnswerValue})`,{EVIDENCE:[['images','Reference images of the persona'],['consent','Signed consent from a real person, if the persona is based on one']]});
test('current status message survives a later evidence decision',()=>{
  const items=[
    {actor:'reviewer',action:'status_changed',status:'needs_evidence',note:'Please upload the licence',at:'2026-10-27T12:00:00Z'},
    {actor:'reviewer',action:'evidence_accepted',status:'needs_evidence',note:'Image accepted',at:'2026-10-27T13:00:00Z'},
  ];
  assert.equal(helpers.latestReviewerMessage(items,'needs_evidence').note,'Please upload the licence');
  assert.equal(helpers.latestReviewerMessage(items,'reviewing'),null);
  items.push({actor:'reviewer',action:'status_changed',status:'needs_evidence',note:' ',at:'2026-10-27T14:00:00Z'});
  assert.equal(helpers.latestReviewerMessage(items,'needs_evidence'),null);
});
test('submitted answers use understandable field and choice labels',()=>{
  assert.equal(helpers.reviewAnswerLabel('holderType'),'Rights holder type');
  assert.equal(helpers.reviewAnswerValue('nature','likeness'),'Yes, with signed consent');
  assert.equal(helpers.reviewAnswerValue('what','undisclosed'),'It does not say it is an AI');
  assert.equal(helpers.reviewAnswerValue('evidence',['images','consent']),'Reference images of the persona; Signed consent from a real person, if the persona is based on one');
  assert.equal(helpers.reviewAnswerValue('langs',''),'Not given');
});
