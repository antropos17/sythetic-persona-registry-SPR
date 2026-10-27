import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const page=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
const source=page.slice(page.indexOf('const navigate ='),page.indexOf('const store ='));
function router(){
  let hash='#home';const pushes=[],events=[];
  const api=runInNewContext(source+'\n({navigate,handleRouteLink})',{
    location:{get hash(){return hash;},set hash(value){throw new Error('Native hash scrolling must not run');}},
    history:{pushState(_state,_title,value){pushes.push(value);hash=value;}},
    window:{dispatchEvent(event){events.push(event.type);}},
    HashChangeEvent:class{constructor(type){this.type=type;}}
  });
  return {...api,pushes,events};
}
function click(href,changes={}){
  const link={target:'',hasAttribute:()=>false,getAttribute:()=>href};
  return {button:0,defaultPrevented:false,target:{closest:()=>link},preventDefault(){this.defaultPrevented=true;},...changes};
}

test('route navigation adds one history entry without native anchor scrolling',()=>{
  const r=router();r.navigate('PP-TR-0027/images');
  assert.deepEqual(r.pushes,['#PP-TR-0027/images']);
  assert.deepEqual(r.events,['hashchange']);
  r.navigate('PP-TR-0027/images');
  assert.equal(r.pushes.length,1);
  assert.equal(r.events.length,2,'Repeating a section link must still align its target');
});

test('ordinary route links use the router; modifiers and local form anchors stay native',()=>{
  for(const href of ['#home','#notices','#apply','#report/PP-TR-0004','#PP-TR-0027/images','#compare/PP-TR-0004/PP-TR-0027?differences=1']){
    const r=router(),event=click(href);r.handleRouteLink(event);
    assert.equal(event.defaultPrevented,true,href);
    assert.equal(r.events.length,1,href);
  }
  for(const changes of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1},{defaultPrevented:true}]){
    const r=router();r.handleRouteLink(click('#notices',changes));assert.equal(r.events.length,0);
  }
  for(const href of ['#main','#r-details','#a-name','https://example.com/']){
    const r=router(),event=click(href);r.handleRouteLink(event);assert.equal(r.events.length,0,href);
  }
  const r=router();r.handleRouteLink(click('#notices',{target:{closest:()=>({target:'_blank',hasAttribute:()=>false})}}));assert.equal(r.events.length,0);
});

test('catalog links resume the selected filters without duplicate history entries',()=>{
  const r=router();
  r.handleRouteLink(click('#notices'),'notices?q=Emre&sort=name');
  r.handleRouteLink(click('#notices'),'notices?q=Emre&sort=name');
  assert.deepEqual(r.pushes,['#notices?q=Emre&sort=name']);
  assert.equal(r.events.length,2,'A repeated catalog link may still scroll to the catalog');
});
