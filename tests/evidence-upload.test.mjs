import test from 'node:test';
import assert from 'node:assert/strict';
import {submitCaseEvidence as submit} from '../site/app/domain/api.mjs';
const file={name:'example.pdf',type:'application/pdf'};

test('a stored file is cleared when the subsequent refresh fails',async()=>{
  const requests=[];let selected=file,refreshes=0;
  globalThis.fetch=async(path,options)=>{requests.push({path,options});return {ok:true,json:async()=>({id:'file-one'})};};
  const refreshed=await submit('SPR-2026-123','test-token','images',file,'  A fictional test source  ',()=>{selected=null;},async()=>{refreshes++;throw new Error('offline');});
  assert.equal(refreshed,false);
  assert.equal(selected,null);
  assert.equal(requests.length,1);
  assert.equal(requests[0].options.method,'POST');
  assert.equal(refreshes,1);
});

test('a rejected upload keeps the selected file for correction',async()=>{
  let selected=file,refreshes=0;
  globalThis.fetch=async()=>({ok:false,json:async()=>({error:'File rejected'})});
  await assert.rejects(submit('SPR-2026-123','test-token','images',file,'A fictional test source',()=>{selected=null;},async()=>{refreshes++;}),/File rejected/);
  assert.equal(selected,file);
  assert.equal(refreshes,0);
});
