import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';
import {buildRelease,run} from '../editor/backend/publisher.mjs';import {snapshotFixture} from './fixtures/case-studies.mjs';import {approvedFiles} from '../editor/backend/file-references.mjs';import {checkExport} from './check-export.mjs';import {prepareJoinFile} from '../editor/backend/join-files.mjs';import {receiveEmail} from '../hosting/email-worker.mjs';import {verifyInbound} from '../editor/backend/form-security.mjs';
const pdf='file-'+ 'a'.repeat(24),video='file-'+ 'b'.repeat(24);
test('real A/B publication includes checked legal/case PDFs and video; foreign IDs and wrong media kinds fail',async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),dir=await mkdtemp(path.join(os.tmpdir(),'fpb-checked-build-'));
 try{
 const site=JSON.parse(await readFile(path.join(root,'src/data/site-content.json'))),cases=snapshotFixture();
 cases.cases[0].content.documentId=pdf;cases.cases[0].content.context='';cases.cases[0].content.work='';
 site.legal={intro:'Our policies.',documentId:pdf};
 site.media=cases.media;
 site.works=[{id:'checked-video',rubric:'films-videos',title:'Checked film',date:'2026-11',summary:'A film.',image:{mediaId:cases.media[0].id,alt:'Film'},gallery:[],video:'',videoId:video,audio:'',link:''}];
 const snapshot={site,cases},files=[{id:pdf,kind:'pdf'},{id:video,kind:'video'}];
 assert.throws(()=>approvedFiles(snapshot,[]));assert.throws(()=>approvedFiles(snapshot,[{id:pdf,kind:'video'},files[1]]));
 const release=await buildRelease(root,dir,'with-files',snapshot,{files});
 for(const variant of ['a','b']){assert((await readFile(path.join(release,variant,'legal.html'),'utf8')).includes('files/'+pdf));assert((await readFile(path.join(release,variant,'case-study-synthetic-one.html'),'utf8')).includes('files/'+pdf));assert((await readFile(path.join(release,variant,'films-videos.html'),'utf8')).includes('files/'+video));}
 const invalid=path.join(dir,'invalid');await mkdir(invalid);await writeFile(path.join(invalid,'index.html'),`<!doctype html><html><body><a href="files/${pdf}">PDF</a></body></html>`);
 await assert.rejects(checkExport(invalid));await checkExport(invalid,{publishedFiles:{[pdf]:'pdf'}});await assert.rejects(checkExport(invalid,{publishedFiles:{[pdf]:'video'}}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('DOCX becomes an image-only PDF; malformed archives, macros and entities are rejected',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'fpb-docx-'));try{
 const file=path.join(dir,'input.docx');
 const zip=async(extra='',content='Hello &amp; welcome')=>{await run('python3',['-c',`import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1],'w') as z:\n z.writestr('[Content_Types].xml','application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml')\n z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>'+sys.argv[3]+'</w:t></w:r></w:p></w:body></w:document>')\n if sys.argv[2]: z.writestr(sys.argv[2],'blocked')`,file,extra,content]);return {name:'resume.docx',base64:(await readFile(file)).toString('base64')};};
 const clean=await prepareJoinFile(await zip(),dir);assert.equal(clean.kind,'pdf');assert.match(clean.bytes.toString('latin1'),/\/Subtype \/Image/);assert.equal(clean.state,'clean');assert(!clean.bytes.equals(clean.original));
 await assert.rejects(prepareJoinFile(await zip('word/vbaProject.bin'),dir));await assert.rejects(prepareJoinFile(await zip('../escape'),dir));await assert.rejects(prepareJoinFile(await zip('','&unknown;'),dir));await assert.rejects(prepareJoinFile({name:'bad.docx',base64:Buffer.from('PKbroken').toString('base64')},dir));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('inbound email worker authenticates DMARC, strips MIME and signs only bounded plain-text replies',async()=>{
 const env={POND_INBOUND_SECRET:'x'.repeat(40),POND_REPLY_DOMAIN:'reply.studio.test',RENDER_ORIGIN_HOST:'fpb.onrender.com',POND_PUBLIC_HOST:'frogpondboys.com'};let calls=0,rejected='';
 const message=(auth='mx.cloudflare.net; dmarc=pass header.from=studio.test')=>{const raw=new TextEncoder().encode('From: Visitor <visitor@studio.test>\r\nTo: reply-'+ 'a'.repeat(24)+'@reply.studio.test\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nA reply.');return {headers:new Headers({'Authentication-Results':auth}),from:'visitor@studio.test',to:'reply-'+ 'a'.repeat(24)+'@reply.studio.test',rawSize:raw.length,raw:new ReadableStream({start(c){c.enqueue(raw);c.close();}}),setReject:v=>{rejected=v;}};};
 await receiveEmail(message(),env,async(url,opt)=>{calls++;assert.equal(url,'https://fpb.onrender.com/api/v2/mail/inbound');assert.equal(JSON.parse(opt.body).text,'A reply.');verifyInbound(Buffer.from(opt.body),{'x-pond-mail-time':opt.headers['X-Pond-Mail-Time'],'x-pond-mail-signature':opt.headers['X-Pond-Mail-Signature']},env.POND_INBOUND_SECRET);return new Response('{}');});assert.equal(calls,1);
 await receiveEmail(message('forged.test; dmarc=pass'),env,()=>{throw Error('must not forward');});assert(rejected);
 rejected='';await receiveEmail(message('mx.cloudflare.net; dmarc=fail'),env,()=>{throw Error('must not forward');});assert(rejected);
});
