// Exercise the actual hosted builder with the launch configuration.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {buildRelease} from '../editor/backend/publisher.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const folder=await mkdtemp(path.join(tmpdir(),'fpb-public-build-'));
try {
 const read=async name=>JSON.parse(await readFile(path.join(root,'src/data',name),'utf8'));
 const snapshot={site:await read('site-content.json'),cases:await read('case-studies-public.json')};
 const release=await buildRelease(root,folder,'public',snapshot,{hosted:true,publicSite:true,variants:['a']});
 assert.deepEqual((await readdir(release)).sort(),['a','snapshot.json']);
 for(const page of ['contact','join']) {
  const html=await readFile(path.join(release,'a',page+'.html'),'utf8');
  assert.match(html, /method="dialog"/);
  assert.match(html, /data-ready="false"/);
  assert(!html.includes('action="/api/v2/forms/'));
  assert(!html.includes('data-hosted="true"'));
 }
 console.log('PASS: real hosted build produces only A, with public submission disabled.');
} finally { await rm(folder,{recursive:true,force:true}); }
