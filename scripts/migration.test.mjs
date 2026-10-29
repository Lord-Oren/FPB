import test from 'node:test';
import {request} from 'node:http';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHosted} from '../editor/hosted.mjs';
import {deploymentConfig} from '../hosting/config.mjs';
import {proxy} from '../hosting/cloudflare-worker.mjs';

async function fixture(publicSite=false) {
 const root=await mkdtemp(path.join(tmpdir(),'fpb-migration-test-'));
 await mkdir(path.join(root,'src/data'),{recursive:true});
 for(const name of ['site-content.json','case-studies-public.json'])await copyFile(new URL('../src/data/'+name,import.meta.url),path.join(root,'src/data',name));
 let data=null, sessionWrites=0, stateWrites=0, hold=null, entered=()=>{};
 const sessions=new Map();
 const store={load:async()=>data,save:async value=>{data=structuredClone(value);stateWrites++;},loadSession:async key=>structuredClone(sessions.get(key)),saveSession:async(key,value)=>{sessionWrites++;sessions.set(key,structuredClone(value));},close:async()=>{}};
 const builder=async(r,folder,id)=>{
  if(hold){entered();await hold;}
  for(const variant of ['a','b']){const dir=path.join(folder,'releases',id,variant);await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'index.html'),'<!doctype html><title>Fixture</title>');}
 };
 const config=deploymentConfig({POND_PUBLIC_SITE:String(publicSite)});
 const app=await createHosted({root,port:0,originHost:'fixture.onrender.com',store,config,testers:['owner@example.test'],verify:async token=>{if(token!=='test-token')throw Error('Access token required.');return {email:'owner@example.test',subject:'owner'};},builder});
 const base='http://127.0.0.1:'+app.server.address().port;
 let token;
 const req=async(host,route,method='GET',body,{access=true,origin=host}={})=>new Promise((resolve,reject)=>{
  const q=request(base+route,{method,headers:{Host:'fixture.onrender.com','X-Pond-Public-Host':host,'X-Forwarded-Proto':'https',...(access?{'Cf-Access-Jwt-Assertion':'test-token'}:{}),...(token?{'X-Editor-Token':token}:{}),...(method!=='GET'?{Origin:'https://'+origin}:{}),...(body?{'Content-Type':'application/json'}:{})}},r=>{const chunks=[];r.on('data',c=>chunks.push(c));r.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:r.statusCode,headers:r.headers})));});q.on('error',reject);q.end(body?JSON.stringify(body):undefined);
 });
 const desk=config.hosts.desk;
 const session=await req(desk,'/api/v2/session');token=(await session.json()).token;
 return {req,desk,config,counts:()=>({sessionWrites,stateWrites}),hold(value,onEnter){hold=value;entered=onEnter;},close:async()=>{await app.close();await rm(root,{recursive:true,force:true});}};
}

test('authenticated reads stay responsive during a publication and never rewrite sessions',async t=>{
 const f=await fixture();let release;const hold=new Promise(resolve=>release=resolve);
 try{
  const tree=await(await f.req(f.desk,'/api/v2/structure')).json();
  const before=f.counts();
  let entered;const building=new Promise(resolve=>entered=resolve);
  f.hold(hold,entered);
  const publish=f.req(f.desk,'/api/v2/structure/publish','POST',{revision:tree.revision});
  // The publish request enters its asynchronous builder before we inspect reads.
  await building;
  const started=performance.now();
  const timeout=new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Reads waited for the build')),1500);timer.unref();});
  const routes=['/structure','/sections','/counts','/settings','/pages/home','/conversations?box=cv&state=open','/publishes'];
  const responses=await Promise.race([Promise.all(routes.map(route=>f.req(f.desk,'/api/v2'+route))),timeout]);
  for(const response of responses)assert.equal(response.status,200);
  assert.deepEqual(f.counts(),before);
  t.diagnostic(`Seven reads completed in ${Math.round(performance.now()-started)} ms with publication still blocked; zero session/state writes.`);
  assert.equal((await f.req(f.desk,'/api/v2/structure','GET',null,{access:false})).status,403);
  release();assert.equal((await publish).status,200);
  assert.equal(f.counts().sessionWrites,before.sessionWrites);
  const page=await(await f.req(f.desk,'/api/v2/pages/contact')).json();
  const saved=await f.req(f.desk,'/api/v2/pages/contact','PUT',{revision:page.revision,fields:page.fields});assert.equal(saved.status,200);
  assert.equal(f.counts().sessionWrites,before.sessionWrites+1,'page revision context must still be durable');
  const home=await(await f.req(f.desk,'/api/v2/pages/home')).json();
  home.fields.editorial_homeLatestTitle='From our studio';home.fields.editorial_homeNewsTitle='Studio news';
  assert.equal((await f.req(f.desk,'/api/v2/pages/home','PUT',{revision:home.revision,fields:home.fields})).status,200);
  assert.equal((await f.req(f.desk,'/api/v2/pages/home/publish','POST',{})).status,200);
  const published=await(await f.req(f.desk,'/api/v2/pages/home')).json();
  assert.equal(published.live.editorial_homeLatestTitle,'From our studio');
  assert.equal(published.live.editorial_homeNewsTitle,'Studio news');
 }finally{release();await f.close();}
});

test('public A is anonymous, Desk remains private, preview and public API are closed',async()=>{
 const f=await fixture(true);
 try{
  assert.equal((await f.req(f.config.hosts.a,'/','GET',null,{access:false})).status,200);
  assert.equal((await f.req(f.config.hosts.desk,'/v2/','GET',null,{access:false})).status,403);
  assert.equal((await f.req(f.config.hosts.a,'/api/v2/session','GET',null,{access:false})).status,404);
  assert.equal((await f.req(f.config.hosts.a,'/api/v2/forms/contact','POST',{}, {access:false})).status,404);
  assert.equal((await f.req(f.config.hosts.b,'/')).status,404);
  const redirect=await f.req(f.config.www,'/about.html','GET',null,{access:false});assert.equal(redirect.status,308);assert.equal(redirect.headers.get('location'),'https://frogpondboys.com/about.html');
  assert.equal((await f.req(f.desk,'/api/v2/settings','PUT',{}, {origin:'evil.example'})).status,403);
 }finally{await f.close();}
});

test('edge routing protects private routes even with public mode enabled',async()=>{
 const env={POND_PUBLIC_SITE:'true',RENDER_ORIGIN_HOST:'fixture.onrender.com'};let forwarded=0;
 const forward=async()=>{forwarded++;return new Response('public');};
 assert.equal((await proxy(new Request('https://frogpondboys.com/'),env,forward)).status,200);
 assert.equal((await proxy(new Request('https://desk.frogpondboys.com/v2/'),env,forward)).status,403);
 assert.equal((await proxy(new Request('https://frogpondboys.com/api/v2/media/x'),env,forward)).status,404);
 assert.equal(forwarded,1);
 assert.throws(()=>deploymentConfig({POND_PUBLIC_HOST:'https://frogpondboys.com'}));
 assert.throws(()=>deploymentConfig({POND_DESK_HOST:'frogpondboys.com'}));
});
