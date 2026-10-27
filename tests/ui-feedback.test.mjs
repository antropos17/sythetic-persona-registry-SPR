import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const page=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
const validation=page.slice(page.indexOf('const HANDLE_FORMAT ='),page.indexOf('function restoreApplication('));
const {validateReport,validateApplication}=runInNewContext(validation+'\n({validateReport,validateApplication})');
const adviceSource=page.slice(page.indexOf('const NOTICE ='),page.indexOf('function socialHref('));
const {recordAdvice,NOTICE}=runInNewContext(adviceSource+'\n({recordAdvice,NOTICE})');
const people=JSON.parse(readFileSync(new URL('../data/personas.json',import.meta.url),'utf8')).personas;
const plain=value=>JSON.parse(JSON.stringify(value));

test('report corrections remove resolved errors while preserving unresolved fields',()=>{
  const draft={who:'',what:'',details:'',email:''};
  assert.deepEqual(Object.keys(validateReport(draft)),['who','what','details']);
  draft.who='UI audit placeholder';
  assert.deepEqual(Object.keys(validateReport(draft)),['what','details']);
  draft.what='other';draft.details='A neutral description for a local UI test.';
  assert.deepEqual(plain(validateReport(draft)),{});
  draft.who='   ';
  assert.deepEqual(Object.keys(validateReport(draft)),['who']);
});

test('report validation keeps text bounds and permits clearing an optional invalid email',()=>{
  const draft={who:'Example',what:'other',details:'x'.repeat(20),email:'unfinished@'};
  assert.deepEqual(Object.keys(validateReport(draft)),['email']);
  assert.deepEqual(plain(validateReport({...draft,email:''})),{});
  assert.deepEqual(plain(validateReport({...draft,email:'test@example.com',details:'x'.repeat(4000)})),{});
  for(const details of ['x'.repeat(19),' '.repeat(20),'x'.repeat(4001)])assert.ok(validateReport({...draft,email:'',details}).details);
});

test('application corrections keep step and consent requirements intact',()=>{
  const draft={name:'',handle:'',nature:'',langs:'',holderType:'',holder:'',email:'',evidence:[]};
  assert.deepEqual(Object.keys(validateApplication(draft,1)),['name','handle','nature']);
  Object.assign(draft,{name:'Example',handle:'@example',nature:'likeness'});
  assert.deepEqual(plain(validateApplication(draft,1)),{});
  assert.ok(validateApplication({...draft,evidence:['images']},3).evidence);
  assert.deepEqual(plain(validateApplication({...draft,evidence:['consent']},3)),{});
  assert.deepEqual(Object.keys(validateApplication({...draft,holderType:'person',holder:'Example'},2)),['email']);
  assert.deepEqual(plain(validateApplication({...draft,holderType:'person',holder:'Example',email:'test@example.com'},2)),{});
});

test('record advice reflects each risk count and preserves restrictive notice guidance',()=>{
  for(const person of people){
    const advice=recordAdvice(person),count=person.risks.length;
    if(count)assert.ok(advice.includes(count+' open risk'+(count===1?'':'s')),person.id);
    else{
      assert.match(advice,/No open risks listed in this demo record/);
      assert.match(advice,/does not guarantee/);
      assert.doesNotMatch(advice,/review before collaborating/);
    }
    if(person.status!=='Valid')assert.ok(advice.startsWith(NOTICE[person.status].advice),person.id);
  }
  const fidan=people.find(p=>p.id==='PP-AZ-0001'),leyla=people.find(p=>p.id==='PP-TR-0004');
  assert.notEqual(recordAdvice(fidan),recordAdvice(leyla));
  const comparisonSource=page.match(/function comparisonValue\(person,key\)\{[\s\S]*?\n\}/)[0];
  const comparisonValue=runInNewContext(comparisonSource+'\ncomparisonValue',{recordAdvice,socialHref:()=>null});
  assert.notEqual(comparisonValue(fidan,'notice'),comparisonValue({...fidan,risks:[]},'notice'),'Differences-only comparison must retain changed risk advice');
});
