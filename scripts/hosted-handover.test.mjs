import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {request} from 'node:http';
import {mkdtemp,mkdir,copyFile,rm} from 'node:fs/promises';
import pg from 'pg';
import sharp from 'sharp';
import {imagePdf} from '../editor/backend/public-files.mjs';
import {openPostgres} from '../editor/backend/postgres.mjs';
import {openPublishedReader} from '../editor/backend/published-reader.mjs';
import {preparePublishedSite,startHostedHandover} from '../editor/backend/handover.mjs';
const database=process.env.POND_TEST_DATABASE_URL;
test('published preview only installs a complete current build; a changed publication revokes the old files',async()=>{
 const root=await mkdtemp('/tmp/fpb-preview-');let generation='one',builds=0,fail=false;
 const file='file-'+'a'.repeat(24),secret='file-'+'b'.repeat(24);
 const reader={current:async id=>id===generation,loadPublished:async()=>({generation,snapshot:{site:{legal:{documentId:file}}},files:[{id:file,kind:'pdf',mime:'application/pdf'}]}),loadFile:async(id,g)=>id===file&&g===generation?Buffer.from('checked'):undefined};
 try{
  const p=await preparePublishedSite({root,reader,builder:async()=>{builds++;if(fail)throw Error('failed build');}});
  assert(await p.current());const old=p.release();assert.equal(await p.publicFile(secret,{}),false);
  generation='two';assert.equal(await p.current(),false);await assert.rejects(()=>p.publicFile(file,{}),/no longer current/);
  fail=true;await assert.rejects(p.refresh,/failed build/);assert.equal(p.release(),old);assert.equal(await p.current(),false);
  fail=false;await p.refresh();assert(await p.current());assert.notEqual(p.release(),old);assert.equal(builds,3);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('handover failure before a snapshot closes its listener',async()=>{
 const busy=Object.assign(Error('busy'),{code:'POND_WRITER_BUSY'});
 const app=await startHostedHandover({root:'/tmp',port:0,builder:async()=>{},createApp:async()=>{throw Error('must not create an app');},openWriter:async()=>{throw busy;},openReader:async()=>{throw Error('reader unavailable');}});
 await assert.rejects(app.ready,/reader unavailable/);assert.equal(app.server.listening,false);await app.close();
});
test('rolling PostgreSQL: two real processes, latest-public refresh, private routes, lock transfer, cancellation and rebuild failure',{skip:!database,timeout:60000},async()=>{
 const u=new URL(database);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'48432');assert.equal(u.pathname,'/fpb_test');
 const admin=new pg.Client({connectionString:database});await admin.connect();
 const db='fpb_handover_test';await admin.query('DROP DATABASE IF EXISTS '+db+' WITH (FORCE)');await admin.query('CREATE DATABASE '+db);u.pathname='/'+db;const connectionString=u.toString();
 const children=[],roots=[];
 const launch=async hold=>{
  const root=await mkdtemp('/tmp/fpb-handover-');roots.push(root);await mkdir(root+'/src/data',{recursive:true});for(const name of ['site-content.json','case-studies-public.json'])await copyFile(new URL('../src/data/'+name,import.meta.url),root+'/src/data/'+name);
  const child=fork(new URL('./helpers/handover-child.mjs',import.meta.url),[],{env:{...process.env,POND_TEST_ROOT:root,POND_TEST_DATABASE_URL:connectionString,POND_TEST_HOLD:hold?'yes':'no'},stdio:['ignore','ignore','pipe','ipc']});children.push(child);let log='';child.stderr.on('data',b=>{log+=b;});
  const events=[];child.on('message',m=>events.push(m));const wait=async name=>{for(let i=0;i<500;i++){const m=events.find(x=>x.event===name);if(m)return m;if(child.exitCode!==null)throw Error('Child exited '+child.exitCode+' '+log);await new Promise(r=>setTimeout(r,10));}throw Error('Timed out: '+name+' '+JSON.stringify(events)+' '+log);};
  const port=(await wait('listening')).port;return {child,events,wait,port};
 };
 const stop=async x=>{if(x.child.exitCode!==null)return;x.child.kill('SIGTERM');await once(x.child,'exit');};
 const req=(x,host,p,method='GET',body,token='',access='test-only')=>new Promise((resolve,reject)=>{const q=request({hostname:'127.0.0.1',port:x.port,path:p,method,headers:{Host:host,'X-Forwarded-Proto':'https','Cf-Access-Jwt-Assertion':access,Origin:'https://'+host,'X-Editor-Token':token,'Content-Type':'application/json'}},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(chunks).toString()}));});q.on('error',reject);q.end(body?JSON.stringify(body):undefined);});
 const a='frogpondboys.com',desk='desk.frogpondboys.com';
 const token=async x=>JSON.parse((await req(x,desk,'/api/v2/session')).text).token;
 const publish=async(x,t,title)=>{const p=JSON.parse((await req(x,desk,'/api/v2/pages/home','GET',null,t)).text);assert.equal((await req(x,desk,'/api/v2/pages/home','PUT',{revision:p.revision,fields:{...p.fields,announcementTitle:title}},t)).status,200);assert.equal((await req(x,desk,'/api/v2/pages/home/publish','POST',{},t)).status,200);};
 try{
  const old=await launch(false);await old.wait('pond_ready');const t=await token(old);await publish(old,t,'Published one');
  const jpeg=await sharp({create:{width:20,height:20,channels:3,background:'white'}}).jpeg().toBuffer();
  const bytes=imagePdf([{bytes:jpeg,width:20,height:20}]);
  const upload=async name=>{const response=await req(old,desk,'/api/v2/files','POST',{name,base64:bytes.toString('base64')},t);assert.equal(response.status,200,response.text);return JSON.parse(response.text);};
  const publicFile=await upload('policy.pdf'),privateFile=await upload('private-draft.pdf');
  const legal=JSON.parse((await req(old,desk,'/api/v2/pages/legal','GET',null,t)).text);
  await req(old,desk,'/api/v2/pages/legal','PUT',{revision:legal.revision,fields:{...legal.fields,documentId:publicFile.id}},t);
  assert.equal((await req(old,desk,'/api/v2/pages/legal/publish','POST',{},t)).status,200);
  const home=JSON.parse((await req(old,desk,'/api/v2/pages/home','GET',null,t)).text);await req(old,desk,'/api/v2/pages/home','PUT',{revision:home.revision,fields:{...home.fields,announcementTitle:'PRIVATE DRAFT'}},t);
  const next=await launch(true);await next.wait('building');assert.equal((await req(next,a,'/livez')).status,503,'a listening process alone must not be healthy');
  assert.equal((await req(next,a,'/')).status,503);assert(!next.events.some(e=>e.event==='pond_writer_acquired'));
  next.child.send('release');await next.wait('pond_public_ready');
  for(const host of [a,'b.frogpondboys.com']){const r=await req(next,host,'/');assert.equal(r.status,200);assert.match(r.text,/Published one/);assert(!r.text.includes('PRIVATE'));assert.match(r.headers['content-security-policy'],/sha256-/);}
  const pdf=await req(next,a,'/files/'+publicFile.id);assert.equal(pdf.status,200);assert.match(pdf.text,/^%PDF-/);
  assert.equal((await req(next,a,'/files/'+privateFile.id)).status,404);assert.equal((await req(next,a,'/api/v2/files/'+privateFile.id)).status,404);
  assert.equal((await req(next,a,'/files/'+publicFile.id,'HEAD')).status,200);
  assert.equal((await req(next,a,'/livez')).status,200);assert.equal((await req(next,a,'/healthz')).status,503);
  assert.equal((await req(next,a,'/api/v2/session')).status,404);assert.equal((await req(next,desk,'/api/v2/session','GET',null,'','')).status,403);
  assert.equal((await req(next,desk,'/api/v2/session')).status,503);assert.equal((await req(next,desk,'/api/v2/pages/home','PUT',{},t)).status,503);
  assert.equal((await req(next,'unknown.example','/')).status,403);
  await assert.rejects(()=>openPostgres({connectionString,ssl:false}),{code:'POND_WRITER_BUSY'});
  const reader=await openPublishedReader({connectionString,ssl:false});const snapshot=await reader.loadPublished();assert.equal(reader.save,undefined);assert.equal(snapshot.snapshot.site.home.announcement.title,'Published one');assert(!JSON.stringify(snapshot).includes('PRIVATE DRAFT'));assert.deepEqual(snapshot.files.map(f=>f.id),[publicFile.id]);assert.equal((await reader.loadFile(publicFile.id,snapshot.generation)).subarray(0,5).toString(),'%PDF-');assert.equal(await reader.loadFile(publicFile.id,'obsolete'),undefined);await reader.close();
  await publish(old,t,'Published two');
  for(let n=0;n<100;n++){const r=await req(next,a,'/');if(r.status===200&&r.text.includes('Published two'))break;assert.equal(r.status,503,'never serve a revoked old publication');await new Promise(r=>setTimeout(r,20));}
  assert.match((await req(next,a,'/')).text,/Published two/);
  old.child.send('hold');
  await new Promise(r=>setTimeout(r,20));
  const beforeDrain=JSON.parse((await req(old,desk,'/api/v2/pages/home','GET',null,t)).text);
  await req(old,desk,'/api/v2/pages/home','PUT',{revision:beforeDrain.revision,fields:{...beforeDrain.fields,announcementTitle:'Committed while draining'}},t);
  const draining=req(old,desk,'/api/v2/pages/home/publish','POST',{},t);
  await new Promise(r=>setTimeout(r,30));
  await stop(old);assert.equal((await draining).status,200);await next.wait('pond_ready');
  assert.match((await req(next,a,'/')).text,/Committed while draining/,'new writer reloads the final old-instance commit');assert.equal((await req(next,a,'/healthz')).status,200);
  assert.equal((await req(next,desk,'/api/v2/pages/home','GET',null,t)).status,200,'saved sessions survive the process change');
  await publish(next,t,'Written after handover');assert.match((await req(next,a,'/')).text,/Written after handover/);
  const canceled=await launch(false);await canceled.wait('pond_public_ready');await stop(canceled);assert.equal(canceled.child.exitCode,0);assert.equal((await req(next,a,'/')).status,200,'canceling a replacement does not stop the old writer');
  const canceledBuild=await launch(true);await canceledBuild.wait('building');await stop(canceledBuild);assert.equal(canceledBuild.child.exitCode,0);assert.equal((await req(next,a,'/')).status,200,'SIGTERM during warm build does not take the writer lock');
  const broken=await launch(true);await broken.wait('building');broken.child.send('fail');broken.child.send('release');await once(broken.child,'exit');assert.equal(broken.child.exitCode,1);assert.equal((await req(next,a,'/')).status,200,'failed warm build leaves old writer available');
  const rebuildFailure=await launch(false);await rebuildFailure.wait('pond_public_ready');rebuildFailure.child.send('fail');await new Promise(r=>setTimeout(r,20));await stop(next);await once(rebuildFailure.child,'exit');assert.equal(rebuildFailure.child.exitCode,1,'failed final reconciliation never opens Desk');
  const final=await openPostgres({connectionString,ssl:false});assert.equal((await final.load()).pages.home.live.announcementTitle,'Written after handover');await final.close();
 }finally{
  for(const child of children)if(child.exitCode===null){child.kill('SIGKILL');await once(child,'exit');}
  for(const root of roots)await rm(root,{recursive:true,force:true});await admin.query('DROP DATABASE IF EXISTS '+db+' WITH (FORCE)');await admin.end();
 }
});
