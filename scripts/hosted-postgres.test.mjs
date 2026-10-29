import {createHash} from 'node:crypto';
import {request} from 'node:http';import pg from 'pg';
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,writeFile,readFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {openPostgres} from '../editor/backend/postgres.mjs';import {createHosted} from '../editor/hosted.mjs';
const database=process.env.POND_TEST_DATABASE_URL;
test('hosted PostgreSQL: origin gate, sessions, publishing and restart durability',{skip:!database},async()=>{
 const parsed=new URL(database);assert.equal(parsed.hostname,'127.0.0.1');assert.equal(parsed.port,'48432');assert.equal(parsed.pathname,'/fpb_test');
 const reset=new pg.Client({connectionString:database});await reset.connect();await reset.query('DROP TABLE IF EXISTS pond_state');await reset.end();
 let root=await mkdtemp(path.join(os.tmpdir(),'fpb-hosted-'));let app;const store=()=>openPostgres({connectionString:database,ssl:false});
 const seed=async()=>{await mkdir(path.join(root,'src/data'),{recursive:true});for(const name of ['site-content.json','case-studies-public.json'])await copyFile(new URL('../src/data/'+name,import.meta.url),path.join(root,'src/data',name));};
 const motion=await readFile(new URL('../src/scripts/motion.js',import.meta.url),'utf8');
 const reveal=await readFile(new URL('../src/scripts/reveal.js',import.meta.url),'utf8');
 const builder=async(r,folder,id,pub)=>{for(const v of ['a','b']){const d=path.join(folder,'releases',id,v);await mkdir(d,{recursive:true});await writeFile(path.join(d,'index.html'),'<!doctype html><title>'+pub.site.home.announcement.title+'</title><script>window.test=true</script><script>'+motion+'</script>'+  (v==='b'?'<script>'+reveal+'</script>':'' ));}};
 const start=async()=>{app=await createHosted({root,port:0,originHost:'fixture.onrender.com',store:await store(),sessionSeconds:604800,testers:['alice@example.test','bob@example.test'],verify:async token=>{if(token==='network-down-fixture')throw new TypeError('fetch failed');if(token==='bob-test-fixture')return {email:'bob@example.test',subject:'bob'};if(token!=='signed-test-fixture')throw Error('Access token required.');return {email:'alice@example.test',subject:'alice'};},builder});};
 await seed();await start();let base=()=>`http://127.0.0.1:${app.server.address().port}`;let token;
 const req=(host,url,method='GET',body,extra={})=>new Promise((resolve,reject)=>{
  const q=request(base()+url,{method,headers:{Host:host,'X-Forwarded-Proto':'https','Cf-Access-Jwt-Assertion':'signed-test-fixture',...(method!=='GET'?{Origin:'https://'+host}:{}),...(token?{'X-Editor-Token':token}:{}),...(body?{'Content-Type':'application/json'}:{}),...extra}},r=>{const chunks=[];r.on('data',c=>chunks.push(c));r.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:r.statusCode,headers:r.headers})));});q.on('error',reject);q.end(body?JSON.stringify(body):undefined);
 });
 const desk='desk.frogpondboys.com',a='frogpondboys.com',b='preview.frogpondboys.com';
 try{
  await assert.rejects(store,/./);
  const response=await req(b,'/');const html=await response.text();const policy=response.headers.get('content-security-policy');
  const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
  assert(scripts.includes(reveal));assert(scripts.includes(motion));assert.match(policy,/img-src data: 'self'/);
  for(const script of scripts)assert(policy.includes("'sha256-"+createHash('sha256').update(script).digest('base64')+"'"));
  const scriptPolicy=policy.split(';').find(x=>x.trim().startsWith('script-src'));
  assert(!scriptPolicy.includes('unsafe-inline'));assert(!scriptPolicy.includes('unsafe-eval'));
  assert(!policy.includes(createHash('sha256').update(reveal+';alert(1)').digest('base64')));

  assert.equal((await req(a,'/healthz')).status,200);assert.equal((await req(a,'/livez')).status,200);assert.equal((await req(a,'/')).status,200);assert.equal((await req(a,'/api/v2/session')).status,404);
  assert.equal((await req(b,'/','GET',null,{'Cf-Access-Jwt-Assertion':'network-down-fixture'})).status,503);
  assert.equal((await req('unknown.example','/')).status,403);assert.equal((await req(desk,'/api/v2/session','GET',null,{'Cf-Access-Jwt-Assertion':''})).status,403);
  assert.equal((await req(desk,'/')).status,302);
  assert.equal((await req(desk,'/','GET',null,{'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate'})).status,302);
  assert.equal((await req(desk,'/api/v2/session','GET',null,{'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate'})).status,403);
  assert.equal((await req(desk,'/api/v2/settings','PUT',{}, {'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate'})).status,403);
  assert.equal((await req('fixture.onrender.com','/','GET',null,{'X-Pond-Public-Host':a})).status,200);
  assert.equal((await req('fixture.onrender.com','/','GET',null,{'X-Pond-Public-Host':a,'Cf-Access-Jwt-Assertion':''})).status,403);
  assert.equal((await req('fixture.onrender.com','/','GET',null,{'X-Pond-Public-Host':'other.example'})).status,403);

  let session=await req(desk,'/api/v2/session');assert.match(session.headers.get('set-cookie'),/Secure;/);assert.match(session.headers.get('set-cookie'),/Max-Age=604800/);let details=await session.json();token=details.token;assert.equal(details.mode,'hosted-test');assert.equal(details.user.email,'alice@example.test');
  assert.equal((await req(desk,'/api/v2/testing/outbox')).status,404);
  assert.equal((await req(desk,'/api/v2/settings','PUT',{},{Origin:'https://'+a})).status,403);
  const received=await req(a,'/api/v2/forms/contact','POST',{name:'Fictional sender',email:'sender@example.test',message:'PRIVATE_POSTGRES_SENTINEL',website:''});assert.equal(received.status,200);const conversation=(await received.json()).id;
  const reply=await req(desk,'/api/v2/conversations/'+conversation+'/replies','POST',{text:'Simulated reply'});assert.equal((await reply.json()).status,'simulated');
  assert.equal((await req(desk,'/api/v2/forms/contact','POST',{})).status,404);
  await req(desk,'/api/v2/settings','PUT',{notifications:{cv:false,msg:false},signature:'Test signature'});
  const page=await(await req(desk,'/api/v2/pages/home')).json();await req(desk,'/api/v2/pages/home','PUT',{revision:page.revision,fields:{...page.fields,announcementTitle:'PostgreSQL publication'}});assert.equal((await req(desk,'/api/v2/pages/home/publish','POST',{})).status,200);
  assert((await(await req(a,'/')).text()).includes('PostgreSQL publication'));assert((await(await req(b,'/')).text()).includes('PostgreSQL publication'));
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>'];let file='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(file));file+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const xref=Buffer.byteLength(file);file+='xref\n0 4\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const cvResult=await req(b,'/api/v2/forms/join','POST',{name:'Fictional applicant',email:'applicant@example.test',message:'Fictional CV only',website:'',cv:{name:'fictional.pdf',base64:Buffer.from(file).toString('base64')}});assert.equal(cvResult.status,200);const cvId=(await cvResult.json()).id;const attachment=(await(await req(desk,'/api/v2/conversations/'+cvId)).json()).messages[0].attachments[0];assert.equal((await req(desk,'/api/v2/attachments/'+attachment.id)).status,423);
  const before=await(await req(desk,'/api/v2/publishes')).json();await app.close();app=null;await rm(root,{recursive:true,force:true});root=await mkdtemp(path.join(os.tmpdir(),'fpb-hosted-restart-'));await seed();await start();
  assert.equal((await req(desk,'/api/v2/settings')).status,200,'session survives restart');
  assert.equal((await req(desk,'/api/v2/settings','GET',null,{'Cf-Access-Jwt-Assertion':'bob-test-fixture'})).status,403,'session is tied to its Access identity');
  const sessionProbe=new pg.Client({connectionString:database});await sessionProbe.connect();const rows=(await sessionProbe.query('SELECT digest,payload FROM pond_sessions')).rows;await sessionProbe.end();assert(rows.length>0);assert(!JSON.stringify(rows).includes(token));
  token=(await(await req(desk,'/api/v2/session')).json()).token;
  assert.equal((await req(desk,'/api/v2/attachments/'+attachment.id)).status,423);
  const probe= new pg.Client({connectionString:database});await probe.connect();const persisted=(await probe.query('SELECT payload FROM pond_state WHERE id=1')).rows[0].payload;await probe.end();assert.equal(persisted.attachments.find(x=>x.id===attachment.id).base64,Buffer.from(file).toString('base64'));
  const saved=await(await req(desk,'/api/v2/conversations/'+conversation)).json();assert.equal(saved.messages[0].text,'PRIVATE_POSTGRES_SENTINEL');assert.equal(saved.messages[1].status,'simulated');
  assert.equal((await(await req(desk,'/api/v2/settings')).json()).signature,'Test signature');assert.deepEqual(await(await req(desk,'/api/v2/publishes')).json(),before);assert((await(await req(a,'/')).text()).includes('PostgreSQL publication'));
  await app.close();app=null;
  const sleeper=await store();const original=await sleeper.load();assert.equal(await sleeper.loadSession(createHash('sha256').update(JSON.stringify(token)).digest('hex'),Date.now()+8*86400000),undefined,'expired session rejected');
  const disconnect=async()=>{const admin=new pg.Client({connectionString:database});await admin.connect();await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name='fpb-pond-desk' AND pid<>pg_backend_pid()");await admin.end();await new Promise(resolve=>setTimeout(resolve,50));};
  try{
   await disconnect();await sleeper.save({...original,testReconnect:'preserved'});assert.equal((await sleeper.load()).testReconnect,'preserved');
   await disconnect();const replacement=await store();try{const latest=await replacement.load();await replacement.save({...latest,testReconnect:'new writer'});}finally{await replacement.close();}
   await assert.rejects(()=>sleeper.save(original),{code:'POND_STALE_INSTANCE'});
  }finally{await sleeper.close();}
 }finally{if(app)await app.close();await rm(root,{recursive:true,force:true});}
});
