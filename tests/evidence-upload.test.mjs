import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const page=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
const source=page.slice(page.indexOf('async function submitCaseEvidence('),page.indexOf('function CasePage('));
const file={name:'example.pdf',type:'application/pdf'};

test('a stored file is cleared when the subsequent refresh fails',async()=>{
  const requests=[];let selected=file,refreshes=0;
  const submit=runInNewContext(source+'\nsubmitCaseEvidence',{fetch:async(path,options)=>{requests.push({path,options});return {ok:true,json:async()=>({id:'file-one'})};},encodeURIComponent});
  const refreshed=await submit('SPR-2026-123','test-token','images',file,'  A fictional test source  ',()=>{selected=null;},async()=>{refreshes++;throw new Error('offline');});
  assert.equal(refreshed,false);
  assert.equal(selected,null);
  assert.equal(requests.length,1);
  assert.equal(requests[0].options.method,'POST');
  assert.equal(refreshes,1);
});

test('a rejected upload keeps the selected file for correction',async()=>{
  let selected=file,refreshes=0;
  const submit=runInNewContext(source+'\nsubmitCaseEvidence',{fetch:async()=>({ok:false,json:async()=>({error:'File rejected'})}),encodeURIComponent});
  await assert.rejects(submit('SPR-2026-123','test-token','images',file,'A fictional test source',()=>{selected=null;},async()=>{refreshes++;}),/File rejected/);
  assert.equal(selected,file);
  assert.equal(refreshes,0);
});
