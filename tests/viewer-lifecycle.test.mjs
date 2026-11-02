import test from 'node:test';
import assert from 'node:assert/strict';
import {createViewer} from '../site/app/passport/renderer.mjs';

test('a 3D initialization error releases the renderer and removes its canvas',()=>{
  let renderer,removed=false;
  const canvas={setAttribute(){},remove(){removed=true;}};
  const THREE={WebGLRenderer:class {constructor(){renderer=this;this.domElement=canvas;}setPixelRatio(){}dispose(){this.disposed=true;}forceContextLoss(){this.lost=true;}},Scene:class {constructor(){throw new Error('3D scene unavailable');}},SRGBColorSpace:'srgb',ACESFilmicToneMapping:'aces'};
  globalThis.window={THREE}; globalThis.devicePixelRatio=1; globalThis.HTMLCanvasElement=class{};
  const create=createViewer;
  const target={appendChild(node){assert.equal(node,canvas);}};
  assert.throws(()=>create(target),/3D scene unavailable/);
  assert.equal(renderer.disposed,true);
  assert.equal(renderer.lost,true);
  assert.equal(removed,true);
});
