import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const workflow=readFileSync(new URL('../.github/workflows/ai_review.yml',import.meta.url),'utf8');
const block=workflow.slice(workflow.indexOf('      - name: Check review history'),workflow.indexOf('      - name: Publish advisory review comments'));
const source=block.split('        run: |\n')[1]?.replace(/^          /gm,'');
assert.ok(source,'Review history step must be present');

async function run(action,pages=[]){
  const event={action,pull_request:{number:12}},outputs={},requests=[];
  const process={env:{GITHUB_EVENT_PATH:'/event',GITHUB_OUTPUT:'/output',GITHUB_STEP_SUMMARY:'/summary',GITHUB_API_URL:'https://api.github.test',GITHUB_REPOSITORY:'example/repo',GITHUB_TOKEN:'test-token'},exitCode:0};
  const fs={readFileSync:()=>JSON.stringify(event),appendFileSync:(file,text)=>{outputs[file]=(outputs[file]||'')+text;}};
  const fetch=async url=>{requests.push(url);const page=pages[requests.length-1];return page instanceof Error ? {ok:false} : {ok:true,json:async()=>page??[]};};
  await runInNewContext(source,{require:()=>fs,process,fetch,AbortSignal:{timeout:()=>undefined},console:{error:()=>{}}});
  return {outputs,requests,exitCode:process.exitCode};
}

test('a newly opened PR is eligible for a full initial review',async()=>{
  const result=await run('opened');
  assert.equal(result.outputs['/output'],'ready=true\n');
  assert.equal(result.requests.length,0);
});

test('an update without an earlier bot review does not claim complete coverage',async()=>{
  const result=await run('synchronize',[[]]);
  assert.equal(result.outputs['/output'],'ready=false\n');
  assert.match(result.outputs['/summary'],/only the latest push/);
  assert.match(result.outputs['/summary'],/Review the full PR manually/);
});

test('review history is paginated and a marked bot review permits an update',async()=>{
  const unrelated=Array.from({length:100},()=>({user:{type:'User'},body:'unrelated'}));
  const result=await run('synchronize',[unrelated,[{user:{type:'Bot'},body:'<!-- chatgpt-code-review -->'}]]);
  assert.equal(result.outputs['/output'],'ready=true\n');
  assert.equal(result.requests.length,2);
});

test('a history API failure fails closed instead of starting an incomplete review',async()=>{
  const result=await run('synchronize',[new Error('unavailable')]);
  assert.equal(result.exitCode,1);
  assert.equal(result.outputs['/output'],undefined);
});
