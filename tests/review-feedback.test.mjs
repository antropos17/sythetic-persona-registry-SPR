import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const page=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
const source=page.slice(page.indexOf('  const changeStatus = async event =>'),page.indexOf('  const download = async item =>'));
function handlers({refreshFails=false,note='',fileReason='Reviewed'}={}){
  const result={};
  const updated={id:'case-1',kind:'report',status:'reviewing'};
  const context={selected:{id:'case-1'},busy:false,next:'reviewing',note,token:'test',fileNotes:{'file-1':fileReason},
    REVIEW_NEXT:{report:{reviewing:['resolved']}},CASE_LABELS:{reviewing:'Under review'},
    privateJson:async()=>updated,refreshList:async()=>{if(refreshFails)throw Error('network');},
    setBusy:v=>{result.busy=v;},setError:v=>{result.error=v;},setMessage:v=>{result.message=v;},
    setDecisionMessage:v=>{result.decisionMessage=v;},setSelected:v=>{result.selected=v;},setNext:()=>{},setNote:()=>{},setFileNotes:()=>{},
    setFileMessages:update=>{result.fileMessages=update(result.fileMessages || {});}};
  return {...runInNewContext(source+'\n({changeStatus,decideFile})',context),result};
}
test('successful status decision stays confirmed when queue refresh fails',async()=>{
  const {changeStatus,result}=handlers({refreshFails:true});
  await changeStatus({preventDefault(){}});
  assert.equal(result.selected.status,'reviewing');
  assert.match(result.decisionMessage,/Decision saved/);
  assert.doesNotMatch(result.decisionMessage,/message is visible/);
  assert.match(result.message,/Decision saved, but the queue could not refresh/);
  assert.equal(result.error,'');
});
test('evidence decision stays confirmed when queue refresh fails',async()=>{
  const {decideFile,result}=handlers({refreshFails:true});
  await decideFile({id:'file-1'},'accepted');
  assert.match(result.fileMessages['file-1'],/Evidence decision recorded, but the queue could not refresh/);
  assert.equal(result.error,'');
});
test('missing evidence reason is reported next to that file',async()=>{
  const {decideFile,result}=handlers({fileReason:'  '});
  await decideFile({id:'file-1'},'accepted');
  assert.match(result.fileMessages['file-1'],/Write a reason/);
  assert.equal(result.selected,undefined);
});
test('status decision confirms a supplied message is visible',async()=>{
  const {changeStatus,result}=handlers({note:'Please send evidence.'});
  await changeStatus({preventDefault(){}});
  assert.match(result.decisionMessage,/Your message is visible to the submitter/);
});
