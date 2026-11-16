import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {trustedDmarc,receiveEmail} from '../hosting/email-worker.mjs';import {prepareJoinFile} from '../editor/backend/join-files.mjs';import {run} from '../editor/backend/publisher.mjs';import {createEditor} from '../editor/server.mjs';
test('only the first Cloudflare authentication result grants access; folded, quoted and commented forgeries fail closed',async()=>{
 const value=s=>new Headers({'Authentication-Results':s});
 assert(trustedDmarc(value('mx.cloudflare.net; dkim=pass; dmarc=pass header.from=studio.test')));
 assert(trustedDmarc(value('mx.cloudflare.net; dmarc=pass, forged.test; dmarc=fail')));
 assert(trustedDmarc(value('mx.cloudflare.net; dmarc=pass reason="normal, comma"')));
 for(const s of ['mx.cloudflare.net; dmarc=fail, forged.test; dmarc=pass','mx.cloudflare.net; dmarc=fail, mx.cloudflare.net; dmarc=pass','other.test; dmarc=pass, mx.cloudflare.net; dmarc=pass','mx.cloudflare.net; spf=pass reason="; dmarc=pass"','mx.cloudflare.net; spf=pass (nested (x); dmarc=pass)','mx.cloudflare.net; dmarc=pass; dmarc=fail','mx.cloudflare.net; dmarc=passive','mx.cloudflare.net; spf=pass "unclosed; dmarc=pass'])assert.equal(trustedDmarc(value(s)),false,s);
 const headers=value('mx.cloudflare.net; dmarc=fail');headers.append('Authentication-Results','forged.test; dmarc=pass');let rejected=false;
 await receiveEmail({headers,setReject:()=>{rejected=true;}},{},()=>{throw Error('Forged authentication must not reach the network');});assert(rejected);
});
test('Word XML accepts UTF-8 only and rejects entity declarations, invalid bytes and alternate encodings',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'fpb-t5-word-'));try{
 const content='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>A résumé</w:t></w:r></w:p></w:body></w:document>';
 const make=async(bytes,types=Buffer.from('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'))=>{const file=path.join(dir,'input.docx');await run('python3',['-c',"import zipfile,base64,sys\nwith zipfile.ZipFile(sys.argv[1],'w') as z:\n z.writestr('[Content_Types].xml',base64.b64decode(sys.argv[3]))\n z.writestr('word/document.xml',base64.b64decode(sys.argv[2]))",file,bytes.toString('base64'),types.toString('base64')]);return {name:'resume.docx',base64:(await readFile(file)).toString('base64')};};
 assert.equal((await prepareJoinFile(await make(Buffer.from(content)),dir)).kind,'pdf');
 for(const bytes of [Buffer.from(content,'utf16le'),Buffer.concat([Buffer.from([255,254]),Buffer.from(content,'utf16le')]),Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?>'+content),Buffer.from('<!DOCTYPE x [<!ENTITY x "unsafe">]>'+content),Buffer.concat([Buffer.from([255]),Buffer.from(content)])])await assert.rejects(prepareJoinFile(await make(bytes),dir));
 await assert.rejects(prepareJoinFile(await make(Buffer.from(content),Buffer.from('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml','utf16le')),dir));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('manual retry requires delivery-review confirmation, is idempotent and never overwrites the saved reply',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'fpb-t5-retry-'));let app,payload,token,now=new Date('2026-11-16T00:00:00Z');const sent=[];
 const store={load:async()=>structuredClone(payload),save:async s=>{payload=structuredClone(s);}};
 const mail={mode:'resend',notifications:[],replyDomain:'reply.studio.test',send:async entry=>{sent.push(structuredClone(entry));if(sent.length===1)throw Error('Unknown delivery outcome');return 'receipt';}};
 const waitFor=async condition=>{for(let i=0;i<100;i++){if(condition())return;await new Promise(r=>setTimeout(r,10));}throw Error('Outbox did not settle');};
 try{
 await mkdir(path.join(root,'src/data'),{recursive:true});for(const name of ['site-content.json','case-studies-public.json'])await writeFile(path.join(root,'src/data',name),await readFile(new URL('../src/data/'+name,import.meta.url)));
 app=await createEditor({root,port:0,v2Options:{store,mail,builder:async()=>{},clock:()=>now}});const base='http://127.0.0.1:'+app.address().port;
 const req=(url,body,headers={})=>fetch(base+'/api/v2'+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{'X-Editor-Token':token}:{}),...headers},body:body?JSON.stringify(body):undefined});
 token=(await(await req('/session')).json()).token;
 const inquiry=await(await req('/forms/contact',{name:'Visitor',email:'visitor@studio.test',message:'A request',website:''})).json();
 const reply=await req('/conversations/'+inquiry.id+'/replies',{text:'The original studio reply'});assert.equal((await reply.json()).status,'queued');await waitFor(()=>payload.outbox[0].status==='failed');const oldId=payload.outbox[0].id;
 now=new Date(now.getTime()+24*3600000);token=(await(await req('/session')).json()).token;await waitFor(()=>payload.outbox[0].status==='review_required');
 const route='/conversations/'+inquiry.id+'/retry-reply';
 assert.equal((await req(route,{mailId:oldId},{'X-Editor-Token':''})).status,403);
 assert.equal((await req(route,{mailId:oldId})).status,409);assert.equal(sent.length,1);
 const response=await req(route,{mailId:oldId,confirmPotentialDuplicate:true});assert.equal(response.status,200,await response.clone().text());const retry=await response.json();assert.equal(retry.status,'queued');assert.notEqual(retry.mailId,oldId);
 await waitFor(()=>payload.outbox.find(m=>m.id===retry.mailId)?.status==='sent');
 const duplicate=await(await req(route,{mailId:oldId,confirmPotentialDuplicate:true})).json();assert.equal(duplicate.mailId,retry.mailId);assert.equal(sent.length,2);
 assert.equal((await req(route,{mailId:retry.mailId,confirmPotentialDuplicate:true})).status,409);
 assert.equal(payload.conversations[0].messages.length,2);assert.equal(payload.conversations[0].messages[1].text,'The original studio reply');assert.equal(payload.outbox[0].status,'superseded');assert.equal(sent[1].text,sent[0].text);
 }finally{if(app)await new Promise(resolve=>app.close(resolve));await rm(root,{recursive:true,force:true});}
});

test('approved contact fallback fills only empty addresses once without publishing unrelated drafts',async()=>{
 const {migrate}=await import('../editor/backend/model.mjs');const {upgradeContent}=await import('../editor/backend/content-upgrade.mjs');
 const site=JSON.parse(await readFile(new URL('../src/data/site-content.json',import.meta.url)));site.contact.email='';
 const state=migrate(site,{schemaVersion:1,cases:[],media:[]},undefined,'2026-11-16');state.pages.contact.fields.intro='Unpublished contact introduction';
 const result=upgradeContent(state);assert.equal(result.state.pages.contact.fields.email,'frogpondboys@gmail.com');assert.equal(result.snapshot.site.contact.email,'frogpondboys@gmail.com');assert.equal(result.snapshot.site.contact.intro,site.contact.intro);assert.equal(result.state.pages.contact.fields.intro,'Unpublished contact introduction');
 result.state.pages.contact.fields.email='';assert.equal(upgradeContent(result.state),null,'Later intentional clearing must remain possible');
 const custom=migrate(site,{schemaVersion:1,cases:[],media:[]},undefined,'2026-11-16');custom.pages.contact.fields.email='draft@studio.test';custom.pages.contact.live.email='public@studio.test';
 const kept=upgradeContent(custom);assert.equal(kept.state.pages.contact.fields.email,'draft@studio.test');assert.equal(kept.snapshot.site.contact.email,'public@studio.test');
});
