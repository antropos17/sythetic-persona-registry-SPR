import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const page=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
const PEOPLE=JSON.parse(readFileSync(new URL('../data/personas.json',import.meta.url),'utf8')).personas;
const ORDER=['Valid','Under review','Suspended','Revoked'];
const source=page.slice(page.indexOf('function readCatalogQuery('),page.indexOf('function Notices('));
const parseSource=page.match(/function parse\(\)\{[\s\S]*?\n\}/)[0];
function catalogApi(){
  const location={hash:'#notices'},entries=['#notices'];
  const history={
    pushState(_state,_title,hash){entries.push(hash);location.hash=hash;},
    replaceState(_state,_title,hash){entries[entries.length-1]=hash;location.hash=hash;}
  };
  return {...runInNewContext(source+'\n'+parseSource+'\n({readCatalogQuery,catalogRoute,withoutCatalogFilters,writeCatalogHistory,parse})',{PEOPLE,ORDER,URLSearchParams,location,history,byId:id=>PEOPLE.find(p=>p.id===id)}),location,entries};
}
const plain=value=>JSON.parse(JSON.stringify(value));

test('catalog URLs round-trip public filters, unicode and reserved characters exactly once',()=>{
  const api=catalogApi(),person=PEOPLE.find(p=>p.id==='PP-TR-0027');
  const state={...api.readCatalogQuery(),q:'Emré + @emre.frames & 100% / ? #',notice:person.status,sort:'name',language:person.lang,occupation:person.role,proof:person.level,savedOnly:true};
  api.location.hash='#'+api.catalogRoute({...state,savedRecords:['private-record'],view:'list',filtersOpen:true});
  const route=api.parse();assert.equal(route.name,'notices');
  assert.deepEqual(plain(api.readCatalogQuery(route.catalogQuery)),plain(state));
  assert.doesNotMatch(api.location.hash,/private-record|view=|filtersOpen=/);
  assert.equal(api.catalogRoute(api.readCatalogQuery()),'notices');
});

test('unknown filter values fall back safely while a bounded search is retained',()=>{
  const api=catalogApi();
  const state=api.readCatalogQuery('q='+encodeURIComponent('x'.repeat(210))+'&notice=missing&sort=__proto__&language=missing&occupation=missing&proof=missing&saved=true&accessToken=private');
  assert.deepEqual(plain(state),{q:'x'.repeat(200),notice:'All',sort:'recent',language:'',occupation:'',proof:'',savedOnly:false});
  assert.doesNotMatch(api.catalogRoute(state),/missing|__proto__|private/);
  assert.doesNotThrow(()=>api.readCatalogQuery('q=%E0%A4%A'));
});

test('empty-result recovery clears restrictions and preserves the exact query, sort and layout',()=>{
  const api=catalogApi();
  const before={q:'Emre Demir',notice:'Valid',sort:'name',language:'Arabic',occupation:'Designer',proof:'Reviewed',savedOnly:true,view:'list',filtersOpen:true};
  const after=api.withoutCatalogFilters(before);
  assert.deepEqual(plain(after),{...before,notice:'All',language:'',occupation:'',proof:'',savedOnly:false});
  assert.equal(before.notice,'Valid','Recovery must not mutate the prior history state');
});

test('filter selection adds a history step; typing replaces it without per-character entries',()=>{
  const api=catalogApi();let state=api.readCatalogQuery();
  state={...state,notice:'Valid'};api.writeCatalogHistory(state);
  for(const q of ['E','Em','Emr','Emre']){state={...state,q};api.writeCatalogHistory(state,{replace:true});}
  assert.equal(api.entries.length,2);
  assert.equal(api.entries[0],'#notices');
  state={...state,sort:'name'};api.writeCatalogHistory(state);
  api.writeCatalogHistory(state);
  assert.equal(api.entries.length,3,'An unchanged selection adds no duplicate');
  api.location.hash=api.entries[1];
  assert.deepEqual(plain(api.readCatalogQuery(api.parse().catalogQuery)),{...plain(state),sort:'recent'});
});
