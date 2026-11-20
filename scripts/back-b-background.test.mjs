import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {createEditor} from '../editor/server.mjs';
import {migrate,snapshots,homeFields,setPage} from '../editor/backend/model.mjs';
import {upgradeContent} from '../editor/backend/content-upgrade.mjs';
import {prepareSiteContent} from '../src/data/site-content.js';
import {validateBBackground,resolveHomeLook} from '../src/data/home-look.js';
const site=JSON.parse(await readFile(new URL('../src/data/site-content.json',import.meta.url)));
const cases=JSON.parse(await readFile(new URL('../src/data/case-studies-public.json',import.meta.url)));
const invalid=[null,'','Cream',' cream ','blue','standard\n','<style>body{}</style>','url(https://example.test)',0,false,[],{},['cream']];
const rejected=error=>error.status===422&&error.diagnostics[0].field==='look_bBackground';

test('B background: closed values at API/build boundaries and legacy default without mutation',()=>{
 const before=structuredClone(site);
 for(const value of invalid){
  assert.throws(()=>validateBBackground(value),rejected);
  assert.throws(()=>prepareSiteContent({...site,home:{...site.home,look:{bBackground:value}}}),rejected);
 }
 for(const look of [null,[],false,'cream',{color:'cream'},{bBackground:'cream',css:'body{}'},JSON.parse('{"__proto__":{}}')])
  assert.throws(()=>resolveHomeLook(look),rejected);
 for(const prefer of ['', 'pixel']){
  assert.equal(prepareSiteContent(site,{prefer}).home.look.bBackground,'standard');
  for(const value of ['standard','cream'])assert.equal(prepareSiteContent({...site,home:{...site.home,look:{bBackground:value}}},{prefer}).home.look.bBackground,value);
 }
 assert.deepEqual(resolveHomeLook({}),{bBackground:'standard'});
 assert.deepEqual(site,before);
});

test('B background: old state/history stay unchanged and old/new snapshots round-trip',()=>{
 const state=upgradeContent(migrate(site,cases,undefined,'2026-11-20T00:00:00Z')).state;
 state.pages.home.fields.announcementTitle='Private draft';
 state.initialPublic={site:structuredClone(site),cases:structuredClone(cases)};
 state.publishes=[{id:'legacy',snapshot:structuredClone(state.initialPublic)}];
 const before=structuredClone(state);
 assert.equal(upgradeContent(state),null,'no migration marker or new publication is required');
 const publicSite=snapshots(state).site;
 assert(!Object.hasOwn(publicSite.home,'look'),'absence is preserved in legacy public data');
 assert.equal(prepareSiteContent(publicSite).home.look.bBackground,'standard');
 assert.notEqual(publicSite.home.announcement.title,'Private draft');
 assert.deepEqual(state,before,'reading defaults does not alter revisions, drafts or history');
 for(const value of ['standard','cream']){
  const source={...site,home:{...site.home,look:{bBackground:value}}};
  const migrated=migrate(source,cases,undefined,'2026-11-20T00:00:00Z');
  assert.equal(migrated.pages.home.fields.look_bBackground,value);
  assert.equal(snapshots(migrated).site.home.look.bBackground,value);
  const copy=structuredClone(source);setPage(copy,'home',homeFields(site.home));
  assert(!Object.hasOwn(copy.home,'look'),'restoring a legacy page removes the newer setting');
  assert.equal(prepareSiteContent(copy).home.look.bBackground,'standard');
 }
});

test('B background API: validation, draft isolation, conflicts, failure, restoration and durability',async()=>{
 const root=await mkdtemp('/tmp/fpb-background-');let server,base,token,failBuild=false;const built=[];
 const source=root+'/src/data/site-content.json',stateFile=root+'/.local-editor/v2/state.json';
 const start=async()=>{
  server=await createEditor({root,port:0,v2Options:{builder:async(r,f,id,snapshot)=>{
   if(failBuild)throw Error('Fixture build failure');
   prepareSiteContent(snapshot.site);built.push(structuredClone(snapshot));
  }}});
  base='http://127.0.0.1:'+server.address().port;
  token=(await(await fetch(base+'/api/v2/session')).json()).token;
 };
 const stop=()=>new Promise(resolve=>server.close(resolve));
 const req=async(method,route,body,auth=true)=>{
  const r=await fetch(base+'/api/v2'+route,{method,headers:{...(auth?{'X-Editor-Token':token}:{}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,data:await r.json()};
 };
 const ok=async(method,route,body)=>{const r=await req(method,route,body);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;};
 const home=()=>ok('GET','/pages/home');
 const save=async fields=>{const p=await home();return ok('PUT','/pages/home',{revision:p.revision,fields});};
 try{
  await mkdir(root+'/src/data',{recursive:true});await writeFile(source,JSON.stringify(site));await writeFile(root+'/src/data/case-studies-public.json',JSON.stringify(cases));await start();
  assert.equal((await req('GET','/pages/home',undefined,false)).status,403);
  let p=await home();assert.equal(p.fields.look_bBackground,'standard');assert.equal(p.live.look_bBackground,'standard');
  const legacy=(await ok('GET','/publishes'))[0].id;
  const savedState=await readFile(stateFile,'utf8'),savedSource=await readFile(source,'utf8');
  assert(!Object.hasOwn(JSON.parse(savedState).pages.home.fields,'look_bBackground'));
  await stop();await start();await home();
  assert.equal(await readFile(stateFile,'utf8'),savedState,'opening old content does not rewrite its stored state');
  assert.equal(await readFile(source,'utf8'),savedSource);
  for(const value of invalid){
   const r=await req('PUT','/pages/home',{revision:p.revision,fields:{look_bBackground:value}});
   assert.equal(r.status,422);assert.equal(r.data.diagnostics[0].field,'look_bBackground');
  }
  assert.equal(await readFile(stateFile,'utf8'),savedState,'invalid choices leave data and revisions untouched');
  assert.equal((await req('PUT','/pages/home',{revision:p.revision,fields:{look_bBackground:'cream'}},false)).status,403);
  assert.equal((await req('POST','/pages/home/publish',{})).status,409);
  await save({look_bBackground:'cream'});p=await home();
  assert.equal(p.fields.look_bBackground,'cream');assert.equal(p.live.look_bBackground,'standard');
  assert.equal(await readFile(source,'utf8'),savedSource,'saving the setting does not publish it');
  const firstToken=token;token=(await(await fetch(base+'/api/v2/session')).json()).token;
  await save({announcementTitle:'Studio news'});
  assert.equal((await home()).fields.look_bBackground,'cream','old clients omitting the field preserve the draft choice');
  const secondToken=token;token=firstToken;
  assert.equal((await req('POST','/pages/home/publish',{})).status,409);token=secondToken;
  assert.equal((await req('PUT','/pages/home',{revision:p.revision,fields:{look_bBackground:'standard'}})).status,409);
  failBuild=true;assert.equal((await req('POST','/pages/home/publish',{})).status,422);failBuild=false;
  assert.equal(await readFile(source,'utf8'),savedSource);assert.equal((await home()).live.look_bBackground,'standard');
  await ok('POST','/pages/home/publish',{});
  assert.equal(built.at(-1).site.home.look.bBackground,'cream');
  assert.equal(JSON.parse(await readFile(source)).home.look.bBackground,'cream');
  const cream=(await ok('GET','/publishes')).find(x=>x.summary==='Page updated').id;
  await save({look_bBackground:'standard',announcementTitle:'Private next draft'});
  const tree=await ok('GET','/structure');await ok('POST','/structure/publish',{revision:tree.revision});
  assert.equal(built.at(-1).site.home.look.bBackground,'cream','publishing navigation does not leak a home draft');
  await ok('POST','/publishes/'+legacy+'/restore',{});p=await home();
  assert.equal(p.live.look_bBackground,'standard');assert.equal(p.fields.announcementTitle,'Private next draft');
  assert.equal(prepareSiteContent(built.at(-1).site).home.look.bBackground,'standard');
  assert(!Object.hasOwn(built.at(-1).site.home,'look'),'old publication retains its original missing field');
  await ok('POST','/publishes/'+cream+'/restore',{});p=await home();
  assert.equal(p.live.look_bBackground,'cream');assert.equal(p.fields.look_bBackground,'standard');
  assert.equal(p.fields.announcementTitle,'Private next draft');
  await stop();await start();p=await home();
  assert.equal(p.live.look_bBackground,'cream');assert.equal(p.fields.look_bBackground,'standard');
  await save({look_bBackground:'standard'});await ok('POST','/pages/home/publish',{});
  assert.equal(prepareSiteContent(built.at(-1).site).home.look.bBackground,'standard');
 }finally{if(server?.listening)await stop();await rm(root,{recursive:true,force:true});}
});
