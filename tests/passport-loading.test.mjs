import test from 'node:test';
import assert from 'node:assert/strict';

test('optional 3D library shares a download, preserves integrity and can retry failure',async()=>{
  const original={document:globalThis.document,location:globalThis.location,THREE:globalThis.THREE,integrity:globalThis.__THREE_INTEGRITY__};
  const scripts=[];
  globalThis.document={head:{appendChild(script){scripts.push(script);}},createElement(){return {remove(){this.removed=true;}};}};
  globalThis.location={protocol:'http:'};
  globalThis.__THREE_INTEGRITY__='sha384-test-fixture';
  delete globalThis.THREE;
  try{
    const {loadThree}=await import('../site/app/passport/library.mjs');
    const first=loadThree(),second=loadThree();
    assert.equal(first,second);
    assert.equal(scripts.length,1);
    assert.equal(scripts[0].integrity,'sha384-test-fixture');
    assert.equal(scripts[0].crossOrigin,'anonymous');
    scripts[0].onerror();
    await assert.rejects(first,/failed to load/);
    assert.equal(scripts[0].removed,true);
    const third=loadThree();
    globalThis.THREE={fixture:true};scripts[1].onload();
    assert.deepEqual(await third,{fixture:true});
    assert.equal(await loadThree(),globalThis.THREE);
    assert.equal(scripts.length,2);
  }finally{
    for(const [key,value] of Object.entries({document:original.document,location:original.location,THREE:original.THREE,__THREE_INTEGRITY__:original.integrity})){
      if(value===undefined)delete globalThis[key];else globalThis[key]=value;
    }
  }
});
