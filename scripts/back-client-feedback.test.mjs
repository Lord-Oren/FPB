import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {migrate} from '../editor/backend/model.mjs';
import {upgradeContent} from '../editor/backend/content-upgrade.mjs';
import {validateWording,wordingDefaults} from '../src/data/wording.js';
import {prepareSiteContent} from '../src/data/site-content.js';
import {createEditor} from '../editor/server.mjs';
import sharp from 'sharp';
const site=JSON.parse(await readFile(new URL('../src/data/site-content.json',import.meta.url)));
const cases=JSON.parse(await readFile(new URL('../src/data/case-studies-public.json',import.meta.url)));
test('client feedback migration preserves customized titles, drafts, history and private data',()=>{
 const old=upgradeContent(migrate(site,cases,undefined,'2026-11-17T00:00:00Z')).state;
 old.migrations=old.migrations.filter(x=>x!=='client-feedback-20261117');
 old.pages.about.fields.teamTitle='My custom team';old.pages.about.live.teamTitle='Our Team';old.pages.about.fields.story='PRIVATE DRAFT';
 old.pages.wording.fields['contact.emailLabel']='Old custom label';old.pages.wording.live['contact.emailLabel']='Email';old.pages.wording.fields['home.title']='PRIVATE WORDS';
 old.structure.fields.nodes.find(n=>n.id==='recents').message='PRIVATE';
 for(const v of ['fields','live'])for(const n of old.structure[v].nodes)if(['footer-legal','magazine'].includes(n.id))n.visible=true;
 old.conversations=[{private:'keep'}];old.publishes=[{id:'historical',snapshot:{site,cases}}];old.initialPublic={site,cases};
 const before=structuredClone(old),result=upgradeContent(old),next=result.state;
 assert(result.changed);assert.equal(next.pages.about.fields.teamTitle,'My custom team');assert.equal(next.pages.about.live.teamTitle,'The Frogs');
 assert.equal(result.snapshot.site.about.teamTitle,'The Frogs');assert.notEqual(result.snapshot.site.about.story,'PRIVATE DRAFT');assert.notEqual(result.snapshot.site.wording['home.title'],'PRIVATE WORDS');
 assert.equal(next.pages.about.revision,before.pages.about.revision,'unchanged draft keeps its version');assert.equal(next.pages.wording.revision,before.pages.wording.revision+1);assert.equal(next.structure.revision,before.structure.revision+1);
 for(const v of ['fields','live'])assert(next.structure[v].nodes.filter(n=>['footer-legal','magazine'].includes(n.id)).every(n=>!n.visible));
 assert.deepEqual(next.publishes,before.publishes);assert.deepEqual(next.initialPublic,before.initialPublic);assert.deepEqual(next.conversations,before.conversations);assert.deepEqual(old,before);
 next.structure.fields.nodes.find(n=>n.id==='footer-legal').visible=true;next.pages.about.fields.teamTitle='Our Team';assert.equal(upgradeContent(next),null,'later deliberate edits stay untouched');
});
test('retired Contact wording accepts old snapshots without re-exposing the field',()=>{
 assert(!Object.hasOwn(wordingDefaults,'contact.emailLabel'));
 const old={...site,wording:{'contact.emailLabel':'My old label','home.title':'My studio'}};
 assert.equal(prepareSiteContent(old).wording['home.title'],'My studio');assert(!Object.hasOwn(validateWording(old.wording),'contact.emailLabel'));
 for(const value of [null,{},'<b>Label</b>','x'.repeat(241)])assert.throws(()=>validateWording({'contact.emailLabel':value}),e=>e.status===422);
 assert.throws(()=>validateWording({'contact.unknown':'x'}),e=>e.status===422);
});
test('team API diagnoses missing roles and broken photos; only published images appear and survive restart',async()=>{
 const root=await mkdtemp('/tmp/fpb-feedback-');let server,base,token;const built=[];
 const start=async()=>{server=await createEditor({root,port:0,v2Options:{builder:async(r,f,id,pub)=>{prepareSiteContent(pub.site);built.push(structuredClone(pub));}}});base='http://127.0.0.1:'+server.address().port;token=(await(await fetch(base+'/api/v2/session')).json()).token;};
 const stop=()=>new Promise(r=>server.close(r));
 const req=async(method,p,body)=>{const r=await fetch(base+'/api/v2'+p,{method,headers:{'X-Editor-Token':token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
 const save=async fields=>{const p=(await req('GET','/pages/about')).data;assert.equal((await req('PUT','/pages/about',{revision:p.revision,fields:{...p.fields,...fields}})).status,200);};
 try{
  await mkdir(root+'/src/data',{recursive:true});await writeFile(root+'/src/data/site-content.json',JSON.stringify(site));await writeFile(root+'/src/data/case-studies-public.json',JSON.stringify(cases));await start();
  const initial=await readFile(root+'/src/data/site-content.json','utf8');
  for(const field of ['team','extendedTeam']){
   await save({team:[],extendedTeam:[],[field]:[{name:'Test person',role:'  '}]});const error=await req('POST','/pages/about/publish',{});
   assert.equal(error.status,422);assert.match(error.data.message,/enter a role/);assert.equal(error.data.diagnostics[0].field,field);assert.equal(await readFile(root+'/src/data/site-content.json','utf8'),initial);
  }
  const bytes=await sharp({create:{width:20,height:20,channels:3,background:'green'}}).png().toBuffer();
  const photo=(await req('POST','/media',{base64:bytes.toString('base64')})).data;
  const person={name:'Test person',role:'Designer',photo:{mediaId:photo.mediaId,alt:'Test portrait'}};
  await save({team:[person],extendedTeam:[]});assert.equal((await req('POST','/pages/about/publish',{})).status,200);assert.equal(built.at(-1).site.media.length,1);assert.equal(prepareSiteContent(built.at(-1).site).about.team[0].photo.src.startsWith('data:image/webp;base64,'),true);
  const published=await readFile(root+'/src/data/site-content.json','utf8');
  await save({team:[{...person,photo:{mediaId:'missing',alt:'Photo'}}]});const missing=await req('POST','/pages/about/publish',{});assert.equal(missing.status,422);assert.match(missing.data.message,/uploaded photo/);assert.equal(await readFile(root+'/src/data/site-content.json','utf8'),published);
  await save({team:[{...person,photo:{mediaId:photo.mediaId,alt:''}}]});assert.match((await req('POST','/pages/about/publish',{})).data.message,/photo description/);
  await stop();await start();const p=(await req('GET','/pages/about')).data;assert.equal(p.live.team[0].photo.mediaId,photo.mediaId);assert.equal(p.fields.team[0].photo.alt,'');
  await save({team:[{...person,photo:null}]});assert.equal((await req('POST','/pages/about/publish',{})).status,200);assert.equal(built.at(-1).site.about.team[0].photo,null);assert(!built.at(-1).site.media.some(m=>m.id===photo.mediaId));
 }finally{if(server?.listening)await stop();await rm(root,{recursive:true,force:true});}
});
