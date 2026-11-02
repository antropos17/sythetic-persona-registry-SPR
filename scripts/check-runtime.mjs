import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const root=new URL('../',import.meta.url);
const {assets}=JSON.parse(readFileSync(new URL('data/runtime-assets.json',root),'utf8'));
for(const asset of assets){
  if(!/^assets\/vendor\/[A-Za-z0-9_.-]+$/.test(asset.path))throw new Error('Invalid runtime asset path');
  const bytes=readFileSync(new URL(asset.path,root));
  if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw new Error('Runtime asset changed: '+asset.path);
}
const page=readFileSync(new URL('site/index.html',root),'utf8');
const scripts=[...page.matchAll(/<script\b([^>]*\bsrc="[^"]+"[^>]*)>/g)];
const expected=['react.production.min.js','react-dom.production.min.js','htm.umd.js'];
const vendorScripts=scripts.filter(match => /\bsrc="\.\.\/assets\/vendor\//.test(match[1]));
if(vendorScripts.length!==expected.length || scripts.length!==expected.length+1)throw new Error('Expected three pinned vendor scripts and the application bundle');
if(!scripts.some(match=>match[0]==='<script src="./dist/app.js">'))throw new Error('Missing application bundle');
if(!page.includes('<link rel="stylesheet" href="./dist/app.css">'))throw new Error('Missing application stylesheet');
if(/<script(?:\s[^>]*)?>\s*[^\s<]/i.test(page))throw new Error('Inline application script is not allowed');
for(const path of ['site/dist/app.js','site/dist/app.css']) if(!readFileSync(new URL(path,root)).length)throw new Error('Empty application bundle: '+path);
for(const [index,match] of vendorScripts.entries()){
  const src=/\bsrc="([^"]+)"/.exec(match[1])?.[1];
  if(match[0]!==`<script src="${src}">`)throw new Error('Runtime tag must match the HTTP integrity injection format');
  if(src!=='../assets/vendor/'+expected[index] || !assets.some(a=>a.path==='assets/vendor/'+expected[index]))throw new Error('Missing or unexpected runtime dependency');
  if(!src.startsWith('../assets/vendor/'))throw new Error('Runtime script is not self-hosted: '+src);
  const bytes=readFileSync(new URL(src,new URL('site/index.html',root)));
  const declared=assets.find(a=>a.path==='assets/vendor/'+expected[index]);
  if(createHash('sha384').update(bytes).digest('base64')!==declared.sha384)throw new Error('Script integrity mismatch: '+src);
}
const three=assets.find(a=>a.path==='assets/vendor/three.min.js');
if(!three?.sha384 || createHash('sha384').update(readFileSync(new URL(three.path,root))).digest('base64')!==three.sha384)throw new Error('Three.js integrity mismatch');
const fonts=readFileSync(new URL('assets/vendor/fonts.css',root),'utf8');
if(/https?:\/\//.test(fonts))throw new Error('Font stylesheet contains a remote dependency');
for(const [,path] of fonts.matchAll(/url\(([^)]+)\)/g)){
  if(!/^font-\d+\.woff2$/.test(path) || !assets.some(a=>a.path==='assets/vendor/'+path))throw new Error('Font is missing from the verified manifest: '+path);
}
