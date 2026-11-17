import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {createOperations,operationPlan} from '../editor/backend/operations.mjs';
import {createEditor} from '../editor/server.mjs';
test('operation progress: session isolation, capacity, completion, error and expiry',()=>{
 let now=0;const jobs=createOperations({now:()=>now,limit:1,ttl:600000});const plan=operationPlan('POST','/structure/publish',['a']);const job=jobs.create('session A',plan);
 assert.equal(jobs.get(job.id,'session B'),null);assert.equal(jobs.get(job.id,'session A').state,'running');assert.throws(()=>jobs.create('session A',plan),e=>e.status===429);
 job.stage('content');job.stage('build-a');assert.deepEqual(jobs.get(job.id,'session A').steps.map(s=>s.state),['done','running','waiting','waiting']);
 now=900000;assert(jobs.get(job.id,'session A'),'running jobs must not vanish');job.fail(Error('PRIVATE PATH AND SECRET'));let saved=jobs.get(job.id,'session A');assert.equal(saved.state,'failed');assert.equal(saved.error.step,'build-a');assert(!JSON.stringify(saved).includes('PRIVATE PATH'));job.succeed({message:'not really'});assert.equal(jobs.get(job.id,'session A').state,'failed');
 now+=600000;assert.equal(jobs.get(job.id,'session A'),null);const next=jobs.create('session A',operationPlan('POST','/files'));next.stage('processing',{done:1,total:3});assert.equal(jobs.get(next.id,'session A').steps[1].done,1);next.succeed({id:'file-fixture'});saved=jobs.get(next.id,'session A');assert.equal(saved.state,'done');assert(saved.steps.every(s=>s.state==='done'));assert.deepEqual(saved.result,{id:'file-fixture'});assert.equal(saved.owner,undefined);
 for(const route of ['/settings','/mail/inbound','/forms/contact','/files/file-x'])assert.equal(operationPlan('POST',route),null);assert.equal(operationPlan('GET','/structure/publish'),null);
});
test('operation API: sync unchanged, real async stages, queue serialization and private polling',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'fpb-jobs-'));let server,token,base,entered,release,failBuild=false;let gate=null;
 const builder=async(r,f,id,snapshot,{onProgress=()=>{}}={})=>{onProgress('build-a');if(gate){entered();await gate;}onProgress('check-a');onProgress('build-b');if(failBuild)throw Error('fixture failure');onProgress('check-b');};
 const request=(method,route,body,extra={})=>fetch(base+'/api/v2'+route,{method,headers:{'X-Editor-Token':token,...(body?{'Content-Type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined});
 const ok=async(method,route,body)=>{const res=await request(method,route,body),value=await res.json();assert.equal(res.status,200,JSON.stringify(value));return value;};
 const waitJob=async id=>{for(let i=0;i<100;i++){const res=await ok('GET','/jobs/'+id);if(res.state!=='running')return res;await new Promise(r=>setTimeout(r,10));}throw Error('job timed out');};
 try{await mkdir(path.join(root,'src/data'),{recursive:true});for(const name of ['site-content.json','case-studies-public.json'])await copyFile(new URL('../src/data/'+name,import.meta.url),path.join(root,'src/data',name));server=await createEditor({root,port:0,v2Options:{builder}});base=`http://127.0.0.1:${server.address().port}`;token=(await(await fetch(base+'/api/v2/session')).json()).token;
  let tree=await ok('GET','/structure');assert.equal((await request('POST','/structure/publish',{revision:tree.revision})).status,200);
  let started;const waiting=new Promise(r=>{started=r;});entered=started;gate=new Promise(r=>{release=r;});
  let res=await request('POST','/structure/publish',{revision:tree.revision},{Prefer:'respond-async'});assert.equal(res.status,202);assert.equal(res.headers.get('preference-applied'),'respond-async');const id=(await res.json()).job.id;await waiting;
  let job=await ok('GET','/jobs/'+id);assert.equal(job.state,'running');assert.equal(job.steps.find(s=>s.state==='running').id,'build-a');assert.equal(job.result,undefined);
  assert.equal((await request('GET','/jobs/'+id,null,{'X-Editor-Token':'wrong'})).status,403);
  let writeDone=false;const write=request('PUT','/structure',{revision:tree.revision,structure:tree.fields}).then(r=>{writeDone=true;return r;});await new Promise(r=>setTimeout(r,30));assert.equal(writeDone,false);assert.equal((await ok('GET','/structure')).revision,tree.revision);
  release();gate=null;job=await waitJob(id);assert.equal(job.state,'done');assert(job.steps.every(s=>s.state==='done'));assert.match(job.result.message,/Published/);assert.equal((await write).status,200);
  const first=token;token=(await(await fetch(base+'/api/v2/session')).json()).token;assert.equal((await request('GET','/jobs/'+id)).status,404);token=first;
  tree=await ok('GET','/structure');failBuild=true;res=await request('POST','/structure/publish',{revision:tree.revision},{Prefer:'respond-async'});const bad=await waitJob((await res.json()).job.id);assert.equal(bad.state,'failed');assert.equal(bad.error.step,'build-b');assert.equal(bad.error.status,422);assert(bad.steps.some(s=>s.state==='waiting'));failBuild=false;
  res=await request('POST','/files',{name:'bad.pdf',base64:Buffer.from('invalid').toString('base64')},{Prefer:'respond-async'});assert.equal(res.status,202);assert.equal((await waitJob((await res.json()).job.id)).state,'failed');
  res=await request('POST','/structure/publish',{revision:-1},{Prefer:'respond-async'});const stale=await waitJob((await res.json()).job.id);assert.equal(stale.state,'failed');assert.equal(stale.error.status,409);
  assert.equal((await request('GET','/structure',null,{Prefer:'respond-async'})).status,200);
  await new Promise(r=>server.close(r));server=await createEditor({root,port:0,v2Options:{builder}});base=`http://127.0.0.1:${server.address().port}`;token=(await(await fetch(base+'/api/v2/session')).json()).token;assert.equal((await request('GET','/jobs/'+id)).status,404,'ephemeral progress cannot claim success after restart');
 }finally{release?.();if(server?.listening)await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});}
});
