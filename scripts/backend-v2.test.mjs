import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createEditor} from '../editor/server.mjs';
import {snapshotFixture} from './fixtures/case-studies.mjs';
const sourceSite=JSON.parse(await readFile(new URL('../src/data/site-content.json',import.meta.url),'utf8'));
test('Pond Desk v2: contracts, persistence, isolated publication and private data',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'pond-v2-'));let server;let base,token,cookie;let failBuild=false,builds=0,scanAllowed=false;let time=new Date('2026-10-25T10:00:00Z');
 const cases=snapshotFixture();const start=async()=>{server=await createEditor({root,port:0,v2Options:{clock:()=>time,scanPdf:async()=>scanAllowed,builder:async()=>{builds++;if(failBuild)throw Error('fixture');}}});base=`http://127.0.0.1:${server.address().port}`;const s=await fetch(base+'/api/v2/session');assert.equal(s.status,200);cookie=s.headers.get('set-cookie').split(';')[0];token=(await s.json()).token;};
 const req=(method,route,body,auth=true)=>fetch(base+'/api/v2'+route,{method,headers:{...(auth?{'X-Editor-Token':token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const ok=async(method,route,body)=>{const r=await req(method,route,body);const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;};
 try{
 await mkdir(path.join(root,'src/data'),{recursive:true});await writeFile(path.join(root,'src/data/site-content.json'),JSON.stringify(sourceSite));await writeFile(path.join(root,'src/data/case-studies-public.json'),JSON.stringify(cases));await start();
 await t.test('local session, resources and rejected access',async()=>{
  assert.equal((await req('GET','/people',null,false)).status,403);assert.equal((await fetch(base+'/api/v2/session',{headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal((await fetch(base+'/v2/')).status,200);assert.equal((await fetch(base+'/v2/fonts/Boohong.otf')).status,200);assert.equal((await fetch(base+'/v2/secret.json')).status,404);
  assert.equal((await fetch(base+'/api/v2/export',{headers:{Cookie:cookie}})).status,200);
  assert.equal((await fetch(base+'/api/v2/people',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{"email":"x@example.com"}'})).status,403);
 });
 await t.test('English server messages retain status codes and field diagnostics',async()=>{
  const missing=await req('GET','/people',null,false);assert.equal(missing.status,403);assert.equal((await missing.json()).message,'Your editor session has expired. Reload the page.');
  const invalid=await req('POST','/items',{section:'press',fields:{title:''}});assert.equal(invalid.status,422);const error=await invalid.json();assert.equal(error.message,'Title: required; use no more than 160 characters.');assert.deepEqual(error.diagnostics,[{field:'title',message:error.message}]);
  const image=await req('POST','/media',{base64:Buffer.from('not an image').toString('base64')});assert.equal(image.status,422);assert.equal((await image.json()).message,'Choose a non-animated PNG, JPEG, or WebP image up to 5 MiB.');
  const person=await req('POST','/people',{email:'not-an-email'});assert.equal(person.status,422);assert.equal((await person.json()).message,'Enter a valid email address.');
  const unknown=await req('GET','/items/not-found');assert.equal(unknown.status,404);assert.equal((await unknown.json()).message,'Item not found.');
 });
 await t.test('v2 root, read-only legacy API and restricted form origins',async()=>{
  const redirect=await fetch(base+'/',{redirect:'manual'});assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),'/v2/');
  assert.equal((await fetch(base+'/api/create',{method:'POST'})).status,409);
  for(const origin of ['http://127.0.0.1:4321','http://127.0.0.1:4322']) {
   assert.equal((await fetch(base+'/api/v2/session',{headers:{Origin:origin}})).status,403);
   const res=await fetch(base+'/api/v2/forms/contact',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name:'Origin test',email:'test@example.com',message:'test',website:''})});assert.equal(res.status,200);await ok('DELETE','/conversations/'+(await res.json()).id);
  }
  assert.equal((await fetch(base+'/api/v2/forms/contact',{method:'POST',headers:{Origin:'http://127.0.0.1:9999','Content-Type':'application/json'},body:'{}'})).status,403);
 });
 await t.test('fixed site zones: rename, conflict, publish, restore and reject new sections',async()=>{
  let tree=await ok('GET','/structure');const original=structuredClone(tree.fields);const ids=tree.fields.nodes.map(n=>n.id);const originalItems=await ok('GET','/items?section=gram');
  assert.equal((await req('POST','/structure',{revision:tree.revision,title:'Fourth',kind:'page',zone:'menus',parentId:'advertising'})).status,422);
  let invalid=structuredClone(tree.fields);invalid.nodes.find(n=>n.id==='gram').parentId='advertising';
  assert.equal((await req('PUT','/structure',{revision:tree.revision,structure:invalid})).status,422);
  invalid=structuredClone(tree.fields);invalid.nodes.pop();assert.equal((await req('PUT','/structure',{revision:tree.revision,structure:invalid})).status,422);
  tree.fields.nodes.find(n=>n.id==='gram').title='Studio moments';tree.fields.nodes.find(n=>n.id==='advertising').title='Our studio';const oldRevision=tree.revision;
  tree=await ok('PUT','/structure',{revision:tree.revision,structure:tree.fields});
  assert.equal((await req('PUT','/structure',{revision:oldRevision,structure:original})).status,409);
  assert.notEqual(tree.live.nodes.find(n=>n.id==='gram').title,'Studio moments');
  await ok('POST','/structure/publish',{revision:tree.revision});const release=(await ok('GET','/publishes'))[0].id;
  const exported=JSON.parse(await readFile(path.join(root,'src/data/site-content.json')));assert.equal(exported.structure.nodes.find(n=>n.id==='gram').title,'Studio moments');assert.equal(exported.structure.nodes.find(n=>n.id==='gram').slug,'gram');
  tree=await ok('GET','/structure');tree.fields.nodes.find(n=>n.id==='gram').title='Draft name';await ok('PUT','/structure',{revision:tree.revision,structure:tree.fields});
  await ok('POST','/publishes/'+release+'/restore',{});tree=await ok('GET','/structure');assert.equal(tree.fields.nodes.find(n=>n.id==='gram').title,'Draft name');assert.equal(tree.live.nodes.find(n=>n.id==='gram').title,'Studio moments');assert.deepEqual(tree.fields.nodes.map(n=>n.id),ids);assert.deepEqual(await ok('GET','/items?section=gram'),originalItems);
  await ok('PUT','/structure',{revision:tree.revision,structure:original});tree=await ok('GET','/structure');await ok('POST','/structure/publish',{revision:tree.revision});
 });
 let migrated;
 await t.test('migration preserves case study and slug',async()=>{const list=await ok('GET','/items?section=case-studies');assert.equal(list.length,cases.cases.length);migrated=await ok('GET','/items/'+list[0].id);assert.equal(migrated.fields.title,cases.cases[0].content.title);assert.equal(migrated.status,'live');});
 let item;
 await t.test('title-only creation, duplicates and per-record conflicts',async()=>{
  const both=await Promise.all([ok('POST','/items',{section:'press',fields:{title:'Été studio'}}),ok('POST','/items',{section:'press',fields:{title:'Été studio'}})]);assert.notEqual(both[0].id,both[1].id);item=both[0];
  const fields={title:'Été studio',outlet:'Fixture',date:'2026-10-25',url:'https://example.com/article',quote:''};item=await ok('PUT','/items/'+item.id,{revision:item.revision,fields});
  assert.equal((await req('PUT','/items/'+item.id,{revision:1,fields:{title:'STALE'}})).status,409);
  const state=JSON.parse(await readFile(path.join(root,'.local-editor/v2/state.json')));assert(state.reserved.includes('ete-studio'));assert(state.reserved.includes('ete-studio-2'));
 });
 let firstRelease;
 await t.test('publication preserves other content and excludes drafts',async()=>{
  await ok('POST','/items/'+item.id+'/publish',{revision:item.revision});const pub=JSON.parse(await readFile(path.join(root,'src/data/site-content.json')));assert.equal(pub.press.filter(x=>x.title==='Été studio').length,1);assert.equal(pub.works.length,sourceSite.works.length);assert.equal(JSON.parse(await readFile(path.join(root,'src/data/case-studies-public.json'))).cases[0].slug,cases.cases[0].slug);firstRelease=(await ok('GET','/publishes'))[0].id;
 });
 await t.test('build failures preserve both sources and live state',async()=>{
  const before=await readFile(path.join(root,'src/data/site-content.json'),'utf8');item=await ok('PUT','/items/'+item.id,{revision:item.revision,fields:{...item.fields,title:'Nouveau titre'}});failBuild=true;
  assert.equal((await req('POST','/items/'+item.id+'/publish',{revision:item.revision})).status,422);assert.equal(await readFile(path.join(root,'src/data/site-content.json'),'utf8'),before);assert.equal((await ok('GET','/items/'+item.id)).status,'changed');failBuild=false;
 });
 await t.test('public removal and restoration preserve the draft',async()=>{
  await ok('POST','/items/'+item.id+'/unpublish',{revision:item.revision});assert.equal((await ok('GET','/items/'+item.id)).status,'draft');await ok('POST','/publishes/'+firstRelease+'/restore',{});const current=await ok('GET','/items/'+item.id);assert.equal(current.fields.title,'Nouveau titre');assert.equal(current.status,'changed');
 });
 await t.test('pages: conflict, publication and strict validation',async()=>{
  const p=await ok('GET','/pages/home');const fields={...p.fields,announcementTitle:'Local news'};await ok('PUT','/pages/home',{revision:p.revision,fields});assert.equal((await req('PUT','/pages/home',{revision:p.revision,fields})).status,409);await ok('POST','/pages/home/publish',{});
  const newer=await ok('GET','/pages/home');await ok('PUT','/pages/home',{revision:newer.revision,fields:{...fields,announcementLink:'https://evil.example'}});assert.equal((await req('POST','/pages/home/publish',{})).status,422);
 });
 await t.test("two tabs cannot publish each other's draft",async()=>{
  const first=token;const page=await ok('GET','/pages/contact');await ok('PUT','/pages/contact',{revision:page.revision,fields:{...page.fields,intro:'Window A'}});
  token=(await (await fetch(base+'/api/v2/session')).json()).token;const other=await ok('GET','/pages/contact');await ok('PUT','/pages/contact',{revision:other.revision,fields:{...other.fields,intro:'Window B'}});const second=token;
  token=first;assert.equal((await req('POST','/pages/contact/publish',{})).status,409);token=second;await ok('POST','/pages/contact/publish',{});
 });
 await t.test('external changes detected before publication',async()=>{
  const file=path.join(root,'src/data/site-content.json');const original=await readFile(file,'utf8');const changed=JSON.parse(original);changed.home.announcement.title='EXTERNAL';await writeFile(file,JSON.stringify(changed));assert.equal((await req('POST','/items/'+item.id+'/publish',{revision:item.revision})).status,409);await writeFile(file,original);
 });
 await t.test('private media, rejected types and required descriptions',async()=>{
  assert.equal((await req('POST','/media',{name:'bad.svg',base64:Buffer.from('<svg/>').toString('base64')})).status,422);
  const a=await ok('POST','/media',{name:'pixel.png',base64:cases.media[0].base64});assert.equal((await req('GET','/media/'+a.mediaId,null,false)).status,403);assert.equal((await req('GET','/media/'+a.mediaId)).status,200);
 });
 let talk;
 await t.test('real local intake and clearly simulated replies',async()=>{
  talk=await ok('POST','/testing/receive',{box:'msg',name:'Private test',email:'fixture@example.com',message:'PRIVATE_SENTINEL',website:''});
  assert.equal((await ok('GET','/conversations?box=msg&state=open')).length,1);const conv=await ok('GET','/conversations/'+talk.id);assert.equal(conv.unread,false);
  assert.equal((await ok('POST','/conversations/'+talk.id+'/replies',{text:'Test reply'})).status,'simulated');
  assert.equal((await ok('POST','/conversations/'+talk.id+'/replies',{text:'Test reply'})).status,'simulated');const sent=await ok('GET','/conversations/'+talk.id);assert.equal(sent.messages.at(-1).simulation,true);assert.equal(sent.messages.at(-1).status,'simulated');assert.equal(sent.messages.length,2);
  await ok('POST','/testing/reply',{conversationId:talk.id,from:'fixture@example.com',text:'Incoming reply'});assert.equal((await req('POST','/testing/reply',{conversationId:talk.id,from:'another@example.com',text:'Forger'})).status,403);
 });
 await t.test('exports exclude conversations; notifications exclude personal data',async()=>{
  const r=await req('GET','/export');const exported=gunzipSync(Buffer.from(await r.arrayBuffer())).toString();assert(!exported.includes('PRIVATE_SENTINEL'));assert(!exported.includes('fixture@example.com'));const mail=await ok('GET','/testing/outbox');assert(mail.every(m=>!JSON.stringify(m).includes('PRIVATE_SENTINEL')));
 });
 await t.test('people: protect self and last access',async()=>{await ok('POST','/people',{email:'colleague@example.com'});assert.equal((await req('DELETE','/people/local%40example.invalid')).status,409);await ok('DELETE','/people/colleague%40example.com');assert.equal((await ok('GET','/people')).length,1);});
 await t.test('honeypot, forged PDF and rate limiting',async()=>{assert.equal((await req('POST','/testing/receive',{box:'cv',name:'Test',email:'test@example.com',message:'test',website:'spam'})).status,422);assert.equal((await req('POST','/testing/receive',{box:'cv',name:'Test',email:'test@example.com',message:'test',website:'',cv:{name:'cv.pdf',base64:Buffer.from('%PDF-not-a-file').toString('base64')}})).status,422);});
 await t.test('local form intake without a session but with origin validation',async()=>{
  const response=await req('POST','/forms/contact',{name:'Contact local',email:'contact@example.com',message:'Un message local',website:''},false);assert.equal(response.status,200);
  assert.equal((await fetch(base+'/api/v2/forms/contact',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'})).status,403);
  const result=await response.json();await ok('DELETE','/conversations/'+result.id);
 });
 await t.test('rate limit: five public submissions per hour, then 429',async()=>{
  // The previous public-origin checks accepted three submissions from this peer.
  for(let i=0;i<2;i++) {
   const response=await req('POST','/forms/contact',{name:'Quota test',email:'quota@example.com',message:'Test quota',website:''},false);assert.equal(response.status,200);await ok('DELETE','/conversations/'+(await response.json()).id);
  }
  const rejected=await req('POST','/forms/contact',{name:'Quota test',email:'quota@example.com',message:'Excess',website:''},false);assert.equal(rejected.status,429);
 });
 await t.test('readable resumes stay quarantined, never exported or opened without scanning',async()=>{
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>'];let file='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(file));file+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const xref=Buffer.byteLength(file);file+='xref\n0 4\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const c=await ok('POST','/testing/receive',{box:'cv',name:'CV Test',email:'cv@example.com',message:'Motivation',website:'',cv:{name:'test.pdf',base64:Buffer.from(file).toString('base64')}});const detail=await ok('GET','/conversations/'+c.id);const a=detail.messages[0].attachments[0];assert.equal((await req('GET','/attachments/'+a.id,null,false)).status,403);assert.equal((await req('GET','/attachments/'+a.id)).status,423);await ok('DELETE','/conversations/'+c.id);assert.equal((await req('GET','/attachments/'+a.id)).status,404);scanAllowed=true;const approved=await ok('POST','/testing/receive',{box:'cv',name:'Fictional scanned resume',email:'safe@example.com',message:'Injected test scanner',website:'',cv:{name:'safe.pdf',base64:Buffer.from(file).toString('base64')}});const approvedTalk=await ok('GET','/conversations/'+approved.id);const download=await req('GET','/attachments/'+approvedTalk.messages[0].attachments[0].id);assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/^attachment;/);assert.equal(download.headers.get('cache-control'),'no-store');await ok('DELETE','/conversations/'+approved.id);scanAllowed=false;
 });
 await t.test('recovery after interruption between public writes',async()=>{
  const before={site:JSON.parse(await readFile(path.join(root,'src/data/site-content.json'))),cases:JSON.parse(await readFile(path.join(root,'src/data/case-studies-public.json')))};await new Promise(r=>server.close(r));server=null;
  const next=structuredClone(before);next.site.home.announcement.title='INCOMPLETE';await writeFile(path.join(root,'.local-editor/v2/pending.json'),JSON.stringify({id:'interrupted',before,next}));await writeFile(path.join(root,'src/data/site-content.json'),JSON.stringify(next.site));await start();assert.deepEqual(JSON.parse(await readFile(path.join(root,'src/data/site-content.json'))),before.site);
 });
 await t.test('restart preserves data; purge removes conversations and simulated outbox',async()=>{await new Promise(r=>server.close(r));server=null;await start();assert.equal((await ok('GET','/conversations?box=msg&state=open')).length,1);time=new Date('2029-01-01T00:00:00Z');assert.equal((await req('GET','/people')).status,403);token=(await (await fetch(base+'/api/v2/session')).json()).token;await ok('POST','/testing/purge',{});assert.equal((await ok('GET','/conversations?box=msg&state=open')).length,0);assert.equal((await ok('GET','/testing/outbox')).length,0);});
 assert(builds>=4);
 }finally{if(server)await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});}
});
