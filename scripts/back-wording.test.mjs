import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createEditor} from '../editor/server.mjs';
import {migrate,snapshots} from '../editor/backend/model.mjs';
import {upgradeContent} from '../editor/backend/content-upgrade.mjs';
import {wordingDefaults,wordingLimits,validateWording,resolveWording} from '../src/data/wording.js';
import {prepareSiteContent} from '../src/data/site-content.js';
const site=JSON.parse(await readFile(new URL('../src/data/site-content.json',import.meta.url)));
const cases=JSON.parse(await readFile(new URL('../src/data/case-studies-public.json',import.meta.url)));
test('wording: 66 original values, blank fallback and strict build-time text boundary',()=>{
 assert.equal(Object.keys(wordingDefaults).length,66);
 assert.equal(resolveWording({'home.title':'   '})['home.title'],'FROG POND BOYS');
 assert.equal(resolveWording({'home.title':' New & original '})['home.title'],'New & original');
 for(const bad of [null,[],{'unknown':'x'},JSON.parse('{"__proto__":"x"}'),{'home.title':12},{'home.title':'<b>hi</b>'},{'home.title':'a\nb'},{'home.title':'\u202ehi'},{'home.title':'x'.repeat(241)},{'join.fileHelp':'x'.repeat(601)}])
  assert.throws(()=>prepareSiteContent({...site,wording:bad}),e=>e.status===422);
 assert.equal(validateWording({'join.fileHelp':'x'.repeat(600)})['join.fileHelp'].length,600);
 assert.deepEqual(prepareSiteContent(site).wording,wordingDefaults);
});
test('wording: legacy state upgrade is idempotent and does not publish a draft or alter history',()=>{
 let state=migrate(site,cases,undefined,'2026-11-16T22:00:00Z');state=upgradeContent(state)?.state??state;
 delete state.pages.wording;state.pages.about.fields.title='Private draft';
 state.initialPublic={site:structuredClone(site),cases:structuredClone(cases)};
 const before=structuredClone(state), upgraded=upgradeContent(state);
 assert.equal(upgraded.changed,false);assert.equal(upgraded.state.pages.wording.revision,1);
 assert.deepEqual(upgraded.state.initialPublic,before.initialPublic);assert.deepEqual(upgraded.state.pages.about,before.pages.about);
 assert.equal(upgradeContent(upgraded.state),null);assert.deepEqual(state,before);
 assert.deepEqual(prepareSiteContent(snapshots(upgraded.state).site).wording,wordingDefaults);
});
test('wording API: auth, validation, stale edits, publication rollback, restore and restart',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'wording-'));let server,base,token,failBuild=false;const built=[];
 const source=path.join(root,'src/data/site-content.json');
 const start=async()=>{server=await createEditor({root,port:0,v2Options:{builder:async(r,f,id,snapshot)=>{if(failBuild)throw Error('Fixture build failure');built.push(structuredClone(snapshot));}}});base='http://127.0.0.1:'+server.address().port;token=(await (await fetch(base+'/api/v2/session')).json()).token;};
 const request=async(method,route,body,auth=true)=>{const r=await fetch(base+'/api/v2'+route,{method,headers:{...(auth?{'X-Editor-Token':token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
 const ok=async(method,route,body)=>{const r=await request(method,route,body);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;};
 const stop=()=>new Promise(resolve=>server.close(resolve));
 try{
  await mkdir(path.join(root,'src/data'),{recursive:true});await writeFile(source,JSON.stringify(site));await writeFile(path.join(root,'src/data/case-studies-public.json'),JSON.stringify(cases));await start();
  assert.equal((await request('GET','/pages/wording',null,false)).status,403);
  let p=await ok('GET','/pages/wording');assert.deepEqual(p.defaults,wordingDefaults);assert.deepEqual(p.limits,wordingLimits);
  const legacy=(await ok('GET','/publishes'))[0].id;
  assert.equal((await request('POST','/pages/wording/publish',{})).status,409);
  for(const fields of [{'bad.key':'no'},{'home.title':'<img src=x>'},{'home.title':false}])assert.equal((await request('PUT','/pages/wording',{revision:p.revision,fields})).status,422);
  assert.equal((await ok('GET','/pages/wording')).revision,p.revision);
  const before=await readFile(source,'utf8');
  await ok('PUT','/pages/wording',{revision:p.revision,fields:{'home.title':'Our shared studio'}});
  assert.equal(await readFile(source,'utf8'),before);
  assert.equal((await request('PUT','/pages/wording',{revision:p.revision,fields:{}})).status,409);
  const firstToken=token;token=(await (await fetch(base+'/api/v2/session')).json()).token;
  p=await ok('GET','/pages/wording');await ok('PUT','/pages/wording',{revision:p.revision,fields:{'home.title':'Published words'}});
  const secondToken=token;token=firstToken;assert.equal((await request('POST','/pages/wording/publish',{})).status,409);token=secondToken;
  failBuild=true;assert.equal((await request('POST','/pages/wording/publish',{})).status,422);assert.equal(await readFile(source,'utf8'),before);failBuild=false;
  await ok('POST','/pages/wording/publish',{});assert.equal(built.at(-1).site.wording['home.title'],'Published words');
  const release=(await ok('GET','/publishes')).find(p=>p.summary==='Page updated').id;
  p=await ok('GET','/pages/wording');await ok('PUT','/pages/wording',{revision:p.revision,fields:{'home.title':'Private next draft'}});
  await ok('POST','/publishes/'+legacy+'/restore',{});p=await ok('GET','/pages/wording');assert.equal(p.fields['home.title'],'Private next draft');assert.equal(resolveWording(p.live)['home.title'],wordingDefaults['home.title']);
  await ok('POST','/publishes/'+release+'/restore',{});p=await ok('GET','/pages/wording');assert.equal(p.live['home.title'],'Published words');assert.equal(p.fields['home.title'],'Private next draft');
  await stop();await start();p=await ok('GET','/pages/wording');assert.equal(p.fields['home.title'],'Private next draft');assert.equal(p.live['home.title'],'Published words');
  await ok('PUT','/pages/wording',{revision:p.revision,fields:{'home.title':'   '}});await ok('POST','/pages/wording/publish',{});assert.equal(prepareSiteContent(built.at(-1).site).wording['home.title'],wordingDefaults['home.title']);
 }finally{if(server?.listening)await stop();await rm(root,{recursive:true,force:true});}
});
