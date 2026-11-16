import test from 'node:test';import assert from 'node:assert/strict';import {request} from 'node:http';import {createHmac,randomBytes} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createHosted} from '../editor/hosted.mjs';import {deploymentConfig} from '../hosting/config.mjs';
import {mailTransport,deliverPending} from '../editor/backend/mail.mjs';import {formSecurity} from '../editor/backend/form-security.mjs';
import {encryptDump,decryptDump} from './backup.mjs';

test('public intake: explicit gate, origin, Turnstile, private attachments, shared inbox, replies and replay protection',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'fpb-intake-'));let app,payload,finishDelivery,holdDelivery=false;const blobs=new Map(),sent=[];
 const store={load:async()=>structuredClone(payload),save:async x=>{payload=structuredClone(x);},saveFile:async(id,b)=>blobs.set(id,b),loadFile:async id=>blobs.get(id),deleteFile:async id=>blobs.delete(id),close:async()=>{}};
 const secret='a'.repeat(40),inbound='b'.repeat(40),mail={mode:'resend',notifications:['notify@studio.test'],replyDomain:'reply.studio.test',send:async message=>{sent.push(structuredClone(message));if(holdDelivery)await new Promise(resolve=>{finishDelivery=resolve;});return 'provider-'+message.id;}};
 const forms={enabled:true,proxySecret:secret,verify:async(token,host,action)=>{if(token!=='good'||host!=='frogpondboys.com'||!['join','contact'].includes(action))throw Object.assign(Error('Verification failed.'),{status:422});}};
 try{
 await mkdir(path.join(root,'src/data'),{recursive:true});for(const name of ['site-content.json','case-studies-public.json'])await writeFile(path.join(root,'src/data',name),await readFile(new URL('../src/data/'+name,import.meta.url)));
 app=await createHosted({root,port:0,store,forms,mail,inboundSecret:inbound,config:deploymentConfig({POND_PUBLIC_SITE:'true'}),testers:['one@studio.test','two@studio.test'],verify:async token=>{if(!['one','two'].includes(token))throw Error('Access token required.');return {email:token+'@studio.test'};},builder:async()=>{}});
 const waitFor=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}throw Error('Mail delivery did not settle.');};
 const base='http://127.0.0.1:'+app.server.address().port;let token;
 const req=async(route,{body,raw,publicRequest=false,identity='one',headers={},method=body||raw?'POST':'GET'}={})=>{
  const host=publicRequest?'frogpondboys.com':'desk.frogpondboys.com';const bytes=raw??(body?Buffer.from(JSON.stringify(body)):null);
  return new Promise((resolve,reject)=>{const q=request(base+route,{method,headers:{Host:host,'X-Forwarded-Proto':'https',Origin:'https://'+host,'Content-Type':'application/json','X-Pond-Form-Proxy':secret,'X-Pond-Client-IP':'192.0.2.11',...(!publicRequest?{'Cf-Access-Jwt-Assertion':identity,...(token?{'X-Editor-Token':token}:{})}:{}),...headers}},r=>{const parts=[];r.on('data',c=>parts.push(c));r.on('end',()=>resolve(new Response(Buffer.concat(parts),{status:r.statusCode,headers:r.headers})));});q.on('error',reject);q.end(bytes);});
 };
 token=(await(await req('/api/v2/session')).json()).token;
 const body={name:'Visitor',email:'visitor@studio.test',message:'PRIVATE_INQUIRY',website:'',turnstileToken:'good',portfolioUrl:'https://portfolio.test/work'};
 assert.equal((await req('/api/v2/forms/contact',{publicRequest:true,body,headers:{Origin:'https://evil.test'}})).status,403);
 assert.equal((await req('/api/v2/forms/contact',{publicRequest:true,body,headers:{'X-Pond-Form-Proxy':'wrong'}})).status,403);
 assert.equal((await req('/api/v2/forms/contact',{publicRequest:true,body:{...body,turnstileToken:'bad'}})).status,422);
 assert.equal((await req('/api/v2/forms/contact',{publicRequest:true,body:{...body,website:'spam'}})).status,422);
 const {snapshotFixture}=await import('./fixtures/case-studies.mjs');const image=snapshotFixture().media[0];
 const form=new FormData();for(const [key,value]of Object.entries({...body,full_name:body.name,phone:'+1 555 123'}))if(key!=='name')form.set(key,value);form.set('attachment',new Blob([Buffer.from(image.base64,'base64')],{type:image.mime}),'work.png');
 const encoded=new Request('https://unused.test',{method:'POST',body:form});const response=await req('/api/v2/forms/join',{publicRequest:true,raw:Buffer.from(await encoded.arrayBuffer()),headers:{'Content-Type':encoded.headers.get('content-type')}});
 assert.equal(response.status,201,await response.clone().text());const saved=await response.json();assert.equal(saved.status,'received');
 const conversation=await(await req('/api/v2/conversations/'+saved.id)).json();assert.equal(conversation.messages[0].portfolioUrl,body.portfolioUrl);
 const attachment=conversation.messages[0].attachments[0];assert(attachment.id);assert.equal(blobs.size,2);assert(!JSON.stringify(payload.attachments).includes('base64'));
 assert.equal((await req('/files/'+attachment.id,{publicRequest:true})).status,404);
 assert.equal((await req('/api/v2/attachments/'+attachment.id,{identity:'forged',headers:{'X-Editor-Token':''}})).status,403);
 const download=await req('/api/v2/attachments/'+attachment.id);assert.equal(download.status,200);assert.equal(download.headers.get('content-type'),'image/webp');
 assert.equal((await req('/api/v2/attachments/'+attachment.id+'?original=1')).status,423);
 assert.equal((await req('/api/v2/attachments/'+attachment.id+'?original=1&confirm=1')).status,200);
 await waitFor(()=>sent.length===1);assert.equal(sent.length,1);assert(!JSON.stringify(sent[0]).includes(body.message));assert(!JSON.stringify(sent[0]).includes(body.email));
 token=undefined;token=(await(await req('/api/v2/session',{identity:'two'})).json()).token;
 assert.equal((await req('/api/v2/conversations/'+saved.id,{identity:'two'})).status,200,'another authorized owner sees the same inbox');
 holdDelivery=true;const reply=await req('/api/v2/conversations/'+saved.id+'/replies',{identity:'two',body:{text:'A reply'}});assert.equal((await reply.json()).status,'queued');await waitFor(()=>sent.length===2);const independent=await Promise.race([req('/api/v2/conversations/'+saved.id+'/state',{identity:'two',body:{state:'callback'}}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Mail provider blocked editing')),1000))]);assert.equal(independent.status,200);holdDelivery=false;finishDelivery();await waitFor(()=>payload.conversations[0].messages.at(-1).status==='sent');assert.equal(payload.conversations[0].state,'callback','mail receipt preserves concurrent edits');assert.equal(sent.length,2);
 await req('/api/v2/conversations/'+saved.id+'/replies',{identity:'two',body:{text:'A reply'}});assert.equal(sent.length,2,'duplicate reply is not sent twice');
 const incoming={eventId:'message-123',to:payload.conversations[0].replyKey+'@reply.studio.test',from:body.email,text:'A visitor reply'};const raw=Buffer.from(JSON.stringify(incoming)),stamp=String(Date.now());const signature=createHmac('sha256',inbound).update(stamp+'.').update(raw).digest('hex');
 const h={'X-Pond-Mail-Time':stamp,'X-Pond-Mail-Signature':signature,Origin:''};
 assert.equal((await req('/api/v2/mail/inbound',{publicRequest:true,raw,headers:{...h,'X-Pond-Mail-Signature':'wrong'}})).status,403);
 assert.equal((await req('/api/v2/mail/inbound',{publicRequest:true,raw,headers:h})).status,200);
 await req('/api/v2/mail/inbound',{publicRequest:true,raw,headers:h});assert.equal(payload.conversations[0].messages.length,3);
 await req('/api/v2/conversations/'+saved.id,{identity:'two',method:'DELETE'});assert(payload.conversations[0].deletedAt);assert.equal(blobs.size,2,'archiving retains private bytes until retention expiry');
 assert.equal((await req('/api/v2/attachments/'+attachment.id,{identity:'two'})).status,404);
 for(let i=0;i<4;i++)assert.equal((await req('/api/v2/forms/contact',{publicRequest:true,body})).status,201);
 assert.equal((await req('/api/v2/forms/contact',{publicRequest:true,body})).status,429);
 }finally{finishDelivery?.();if(app)await app.close();await rm(root,{recursive:true,force:true});}
});

test('mail adapter uses provider idempotency, plain text and bounded retry; simulated adapter never sends',async()=>{
 let calls=0;const mail=mailTransport({POND_MAIL_MODE:'resend',RESEND_API_KEY:'test-key',POND_MAIL_FROM:'hello@studio.test',POND_REPLY_DOMAIN:'reply.studio.test'},async(url,options)=>{calls++;assert.equal(url,'https://api.resend.com/emails');assert.equal(options.headers['Idempotency-Key'],'stable-id');const body=JSON.parse(options.body);assert.equal(body.text,'<script>literal</script>');assert.equal(body.html,undefined);return new Response(JSON.stringify({id:'receipt'}));});
 const state={outbox:[{id:'stable-id',at:new Date().toISOString(),status:'queued',attempts:0,to:['visitor@studio.test'],subject:'Reply',text:'<script>literal</script>'}],conversations:[]};
 await deliverPending(state,mail,new Date().toISOString(),async()=>{});assert.equal(calls,1);assert.equal(state.outbox[0].status,'sent');
 await deliverPending(state,mail,new Date().toISOString(),async()=>{});assert.equal(calls,1);
 const simulated=mailTransport();assert.equal(simulated.mode,'simulated');assert.equal(simulated.send,undefined);
 const failed={outbox:[{id:'old',at:'2020-01-01',status:'failed',attempts:1}],conversations:[]};await deliverPending(failed,mail,new Date().toISOString(),async()=>{});assert.equal(failed.outbox[0].status,'review_required');assert.equal(calls,1);
});

test('Turnstile validates server-side hostname and action and fails closed',async()=>{
 const env={POND_FORMS_ENABLED:'true',POND_MAIL_MODE:'resend',TURNSTILE_SECRET_KEY:'server-key',POND_FORM_PROXY_SECRET:'x'.repeat(40)};
 const gate=formSecurity(env,async()=>new Response(JSON.stringify({success:true,hostname:'frogpondboys.com',action:'join'})));
 await gate.verify('token','frogpondboys.com','join');await assert.rejects(gate.verify('token','other.test','join'));await assert.rejects(gate.verify('token','frogpondboys.com','contact'));
 assert.equal(formSecurity({}).enabled,false);assert.throws(()=>formSecurity({POND_FORMS_ENABLED:'true'}));
});

test('encrypted backups authenticate bytes before restoration and reject tampering',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'fpb-backup-test-'));try{const plain=path.join(dir,'source'),encrypted=path.join(dir,'backup'),restored=path.join(dir,'restored'),key=randomBytes(32);const bytes=Buffer.from('PRIVATE_BACKUP_SENTINEL');await writeFile(plain,bytes);await encryptDump(plain,encrypted,key);assert(!(await readFile(encrypted)).includes(bytes));await decryptDump(encrypted,restored,key);assert.deepEqual(await readFile(restored),bytes);await assert.rejects(decryptDump(encrypted,restored+'-bad',randomBytes(32)));const damaged=await readFile(encrypted);damaged[20]^=1;await writeFile(encrypted,damaged);await assert.rejects(decryptDump(encrypted,restored+'-bad',key));await assert.rejects(readFile(restored+'-bad'));}finally{await rm(dir,{recursive:true,force:true});}
});
