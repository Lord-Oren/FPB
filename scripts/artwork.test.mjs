import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkOriginalArtwork } from './check-original-artwork.mjs';
for (const pixel of [false,true]) test(`Artwork contract ${pixel ? 'A pixel' : 'B smooth'} rejects wrong paths and colours`,async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'fpb-artwork-'));
 try {
  const assetRoot=new URL(`../src/assets/${pixel ? 'ruben' : 'ruben-smooth'}/`,import.meta.url);
  const manifest=JSON.parse(await readFile(new URL('source-manifest.json',assetRoot),'utf8'));
  let html=`<section data-artwork-mode="${pixel?'original':'adapted'}">`;
  for(const name of [...manifest.assets.map(x=>x.name),'television']){
   const url=name==='television'?new URL(`../src/assets/television${pixel?'-pixel':''}.svg`,import.meta.url):new URL(name+'.svg',assetRoot);
   const svg=await readFile(url,'utf8');
   const body=svg.replace(/^[\s\S]*?<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'');
   html+=`<symbol id="art-${name}" shape-rendering="${pixel?'crispEdges':'geometricPrecision'}">${body}</symbol>`;
  }
  const file=path.join(dir,'index.html');await writeFile(file,html);await checkOriginalArtwork(dir);
  await writeFile(file,html.replace('fill="rgb(', 'fill="changed('));await assert.rejects(checkOriginalArtwork(dir));
  await writeFile(file,html.replace('<path ', '<path transform="scale(2)" '));await assert.rejects(checkOriginalArtwork(dir));
 }finally{await rm(dir,{recursive:true,force:true});}
});
