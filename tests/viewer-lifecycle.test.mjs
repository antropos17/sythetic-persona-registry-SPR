import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const page=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
const source=page.slice(page.indexOf('function createViewer('),page.indexOf('/* ---------- notices:'));

test('a 3D initialization error releases the renderer and removes its canvas',()=>{
  let renderer,removed=false;
  const canvas={setAttribute(){},remove(){removed=true;}};
  const THREE={WebGLRenderer:class {constructor(){renderer=this;this.domElement=canvas;}setPixelRatio(){}dispose(){this.disposed=true;}forceContextLoss(){this.lost=true;}},Scene:class {constructor(){throw new Error('3D scene unavailable');}},SRGBColorSpace:'srgb',ACESFilmicToneMapping:'aces'};
  const create=runInNewContext(source+'\ncreateViewer',{window:{THREE},devicePixelRatio:1,HTMLCanvasElement:class{}});
  const target={appendChild(node){assert.equal(node,canvas);}};
  assert.throws(()=>create(target),/3D scene unavailable/);
  assert.equal(renderer.disposed,true);
  assert.equal(renderer.lost,true);
  assert.equal(removed,true);
});
