import test from 'node:test';
import { get } from 'node:http';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createEditor } from '../editor/server.mjs';
import { snapshotFixture } from './fixtures/case-studies.mjs';

test('local API: security, migration, selection, publishing, removal/restoration and recovery',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'fpb-editor-'));const file=path.join(root,'src/data/case-studies-public.json');const empty={schemaVersion:1,cases:[],media:[]};let server;
 try{
  await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(empty));await mkdir(path.join(root,'.local-editor'));await writeFile(path.join(root,'.local-editor/draft.json'),JSON.stringify({revision:0,snapshot:empty}));
  server=await createEditor({root,port:0,legacyWrites:true});let base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base+'/favicon.ico')).status,204);
  assert.equal((await fetch(base+'/api/state')).status,403);assert.equal((await fetch(base+'/api/session',{headers:{Origin:'https://untrusted.example'}})).status,403);
  assert.equal(await new Promise((resolve,reject)=>{get(base+'/api/session',{headers:{Host:'untrusted.example'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);}),403);
  const {token}=await(await fetch(base+'/api/session')).json();const post=(route,body)=>fetch(base+'/api/'+route,{method:'POST',headers:{'X-Editor-Token':token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const oversized=await post('save',{padding:'x'.repeat(21*1024*1024)});assert.equal(oversized.status,413);assert.equal(oversized.headers.get('connection'),'close');
  let view=await(await fetch(base+'/api/state',{headers:{'X-Editor-Token':token}})).json();
  assert.equal(view.catalog.schemaVersion,2);assert.deepEqual(JSON.parse(await readFile(path.join(root,'.local-editor/draft-v1-backup.json'))),{revision:0,snapshot:empty});
  view=await(await post('create',{revision:0,title:'one'})).json();assert.equal(view.catalog.records.length,1);
  let response=await post('select',{revision:view.catalog.revision,id:'one',draftRevision:1});assert.equal(response.status,400);assert.match((await response.json()).error,/one.summary/);
  const svg=await post('image',{base64:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>').toString('base64')});assert.equal(svg.status,400);
  const png=await sharp({create:{width:2200,height:20,channels:3,background:'#00ff00'}}).png().toBuffer();const upload=await post('image',{base64:png.toString('base64')});assert.equal(upload.status,200);const asset=await upload.json();assert.equal((await sharp(Buffer.from(asset.base64,'base64')).metadata()).width,2000);
  const content=snapshotFixture().cases[0].content;content.cover.assetId=asset.id;content.gallery=[{assetId:asset.id,alt:'Gallery alt',caption:'Gallery caption',credit:'Studio'}];
  view=await(await post('save',{id:'one',draftRevision:1,content,media:[asset]})).json();assert.equal(view.catalog.records[0].draft.revision,2);assert.deepEqual(JSON.parse(await readFile(file)),empty);
  assert.equal((await post('save',{id:'one',draftRevision:1,content})).status,409);
  view=await(await post('select',{revision:view.catalog.revision,id:'one',draftRevision:2})).json();
  view=await(await post('save',{id:'one',draftRevision:2,content:{title:'PRIVATE DRAFT SENTINEL',gallery:[]}})).json();
  view=await(await post('apply',{revision:view.catalog.revision,publicFingerprint:view.publicFingerprint})).json();
  const published=JSON.parse(await readFile(file));assert.equal(published.cases.length,1);assert.equal(published.cases[0].content.gallery[0].caption,'Gallery caption');assert.ok(!JSON.stringify(published).includes('PRIVATE DRAFT SENTINEL'));
  assert.deepEqual(JSON.parse(await readFile(path.join(root,'.local-editor/previous-public.json'))),empty);
  const oldFingerprint=view.publicFingerprint;await writeFile(file,JSON.stringify(empty));assert.equal((await post('apply',{revision:view.catalog.revision,publicFingerprint:oldFingerprint})).status,409);assert.deepEqual(JSON.parse(await readFile(file)),empty);
  view=await(await fetch(base+'/api/state',{headers:{'X-Editor-Token':token}})).json();
  view=await(await post('withdraw',{revision:view.catalog.revision,id:'one'})).json();view=await(await post('restore',{revision:view.catalog.revision,id:'one'})).json();assert.equal(view.catalog.records[0].selected,null);
  view=await(await post('apply',{revision:view.catalog.revision,publicFingerprint:view.publicFingerprint})).json();assert.deepEqual(JSON.parse(await readFile(file)),empty);
  await new Promise(resolve=>server.close(resolve));server=await createEditor({root,port:0,legacyWrites:true});const stored=JSON.parse(await readFile(path.join(root,'.local-editor/draft.json')));assert.equal(stored.records[0].recoveryDraft.content.title,'PRIVATE DRAFT SENTINEL');assert.equal(stored.records[0].draft.content.title,content.title);assert.equal(stored.records[0].selected,null);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
});

test('API: concurrent creation of matching titles, saving and recovery',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'fpb-titles-'));let server;
 try{
  await mkdir(path.join(root,'src/data'),{recursive:true});await writeFile(path.join(root,'src/data/case-studies-public.json'),JSON.stringify({schemaVersion:1,cases:[],media:[]}));
  server=await createEditor({root,port:0,legacyWrites:true});const base=`http://127.0.0.1:${server.address().port}`;const {token}=await(await fetch(base+'/api/session')).json();
  const post=title=>fetch(base+'/api/create',{method:'POST',headers:{'X-Editor-Token':token,'Content-Type':'application/json'},body:JSON.stringify({title,revision:0})});
  const responses=await Promise.all([post('Été !'),post('Été !'),post('ete')]);assert.ok(responses.every(r=>r.status===200));const views=await Promise.all(responses.map(r=>r.json()));assert.equal(new Set(views.map(v=>v.createdId)).size,3);
  const bad=await post(' ');assert.equal(bad.status,400);assert.equal((await bad.json()).diagnostics[0].field,'newTitle');
  const stored=JSON.parse(await readFile(path.join(root,'.local-editor/draft.json')));assert.deepEqual(stored.records.map(r=>r.slug),['ete','ete-2','ete-3']);assert.equal(stored.records[0].draft.content.title,'Été !');
  await new Promise(resolve=>server.close(resolve));server=await createEditor({root,port:0,legacyWrites:true});assert.deepEqual(JSON.parse(await readFile(path.join(root,'.local-editor/draft.json'))),stored);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
});
