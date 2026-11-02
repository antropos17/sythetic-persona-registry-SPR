import test from 'node:test';
import assert from 'node:assert/strict';
import {persistApplicationDraft,finishApplicationDraft} from '../site/app/domain/forms.mjs';
import {store} from '../site/app/domain/storage.mjs';
const draft={name:'Fictional example',handle:'@example',evidence:['images']};
function makeStorage(){
  const data=new Map();
  return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
}
function client(storage){globalThis.localStorage=storage;return {persistApplicationDraft,finishApplicationDraft,store};}

test('an application draft remains recoverable after a standalone demo submission',()=>{
  const storage=makeStorage(),ui=client(storage);
  assert.equal(ui.persistApplicationDraft(draft,4,null),true);
  ui.finishApplicationDraft({id:'DEMO-EXAMPLE',demo:true});
  const reloaded=client(storage);
  assert.deepEqual(JSON.parse(JSON.stringify(reloaded.store.get('spr-apply'))),draft);
  assert.equal(reloaded.store.get('spr-apply-step'),4);
  reloaded.finishApplicationDraft({id:'SPR-2026-EXAMPLE',demo:false});
  assert.equal(reloaded.store.get('spr-apply'),null);
  assert.equal(reloaded.store.get('spr-apply-step'),null);
});

test('a blocked browser store reports failure instead of claiming the draft was saved',()=>{
  const storage={getItem(){throw new Error('blocked');},setItem(){throw new Error('quota');},removeItem(){throw new Error('blocked');}};
  assert.equal(client(storage).persistApplicationDraft(draft,1,null),false);
});
