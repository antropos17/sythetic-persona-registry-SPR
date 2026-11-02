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
const expected=['react.production.min.js','react-dom.production.min.js','htm.umd.js','three.min.js'];
if(scripts.length!==expected.length)throw new Error('Expected four pinned runtime scripts');
for(const [index,match] of scripts.entries()){
  const src=/\bsrc="([^"]+)"/.exec(match[1])?.[1];
  if(match[0]!==`<script src="${src}">`)throw new Error('Runtime tag must match the HTTP integrity injection format');
  if(src!=='../assets/vendor/'+expected[index] || !assets.some(a=>a.path==='assets/vendor/'+expected[index]))throw new Error('Missing or unexpected runtime dependency');
  if(!src.startsWith('../assets/vendor/'))throw new Error('Runtime script is not self-hosted: '+src);
  const bytes=readFileSync(new URL(src,new URL('site/index.html',root)));
  const declared=assets.find(a=>a.path==='assets/vendor/'+expected[index]);
  if(createHash('sha384').update(bytes).digest('base64')!==declared.sha384)throw new Error('Script integrity mismatch: '+src);
}
const fonts=readFileSync(new URL('assets/vendor/fonts.css',root),'utf8');
if(/https?:\/\//.test(fonts))throw new Error('Font stylesheet contains a remote dependency');
for(const [,path] of fonts.matchAll(/url\(([^)]+)\)/g)){
  if(!/^font-\d+\.woff2$/.test(path) || !assets.some(a=>a.path==='assets/vendor/'+path))throw new Error('Font is missing from the verified manifest: '+path);
}
