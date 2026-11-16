import {request} from 'node:http';
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {run} from '../editor/backend/publisher.mjs';import {createEditor} from '../editor/server.mjs';import {prepareUpload} from '../editor/backend/public-files.mjs';
function blankPdf(){const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>'];let f='%PDF-1.4\n';const offsets=[];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(f));f+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const n=Buffer.byteLength(f);return Buffer.from(f+'xref\n0 4\n0000000000 65535 f \n'+offsets.map(x=>String(x).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${n}\n%%EOF\n`);}
test('PDF is rebuilt as images; active and forged documents fail closed',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'fpb-pdf-'));try{
 const result=await prepareUpload({name:'legal.pdf',base64:blankPdf().toString('base64')},dir);
 assert.equal(result.mime,'application/pdf');assert.match(result.bytes.toString('latin1'),/\/Subtype \/Image/);assert.doesNotMatch(result.bytes.toString('latin1'),/\/JavaScript|\/OpenAction/);
 await writeFile(path.join(dir,'checked.pdf'),result.bytes);assert.match(await run('pdfinfo',[path.join(dir,'checked.pdf')]),/Pages:\s+1/);
 await assert.rejects(prepareUpload({name:'bad.pdf',base64:Buffer.from('%PDF-invalid').toString('base64')},dir));
 const active=Buffer.concat([blankPdf(),Buffer.from('\n/JavaScript')]);await assert.rejects(prepareUpload({name:'active.pdf',base64:active.toString('base64')},dir),/active/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('video uploads persist outside JSON state, reject forged content and publish only a reference',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'fpb-video-'));let app;try{
 await mkdir(path.join(root,'src/data'),{recursive:true});for(const name of ['site-content.json','case-studies-public.json'])await writeFile(path.join(root,'src/data',name),await readFile(new URL('../src/data/'+name,import.meta.url)));
 const clip=path.join(root,'clip.mp4');await run('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=64x64:d=1','-c:v','libx264','-pix_fmt','yuv420p',clip]);
 const start=async()=>{app=await createEditor({root,port:0,v2Options:{builder:async()=>{}}});const base='http://127.0.0.1:'+app.address().port;const session=await(await fetch(base+'/api/v2/session')).json();return {base,token:session.token};};let auth=await start();
 const req=(route,method='GET',body)=>fetch(auth.base+'/api/v2'+route,{method,headers:{'X-Editor-Token':auth.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const uploaded=await req('/files','POST',{name:'clip.mp4',base64:(await readFile(clip)).toString('base64')});assert.equal(uploaded.status,200,await uploaded.clone().text());const file=await uploaded.json();assert.equal(file.kind,'video');
 const {snapshotFixture}=await import('./fixtures/case-studies.mjs');const image=await(await req('/media','POST',{name:'pixel.png',base64:snapshotFixture().media[0].base64})).json();
 const itemResponse=await req('/items','POST',{section:'films-videos',fields:{title:'Studio film',date:'2026-11',summary:'A short film.',image:{mediaId:image.mediaId,alt:'Blue frame'},gallery:[],video:'',videoId:file.id,audio:'',link:''}});assert.equal(itemResponse.status,200,await itemResponse.clone().text());const item=await itemResponse.json();const publication=await req('/items/'+item.id+'/publish','POST',{revision:item.revision});assert.equal(publication.status,200,await publication.clone().text());
 const published=JSON.parse(await readFile(path.join(root,'src/data/site-content.json')));assert.equal(published.works[0].videoId,file.id);
 assert.equal((await req('/files/'+file.id)).status,200);assert.equal((await fetch(auth.base+'/api/v2/files/'+file.id)).status,403);
 const state=JSON.parse(await readFile(path.join(root,'.local-editor/v2/state.json')));assert(!JSON.stringify(state.files).includes('base64'));assert(state.files.find(f=>f.id===file.id));
 const forged=await req('/files','POST',{name:'fake.mp4',base64:Buffer.from('0000ftypgarbage').toString('base64')});assert.equal(forged.status,400);
 await new Promise(r=>app.close(r));app=null;auth=await start();assert.equal((await req('/files/'+file.id)).status,200);
 }finally{if(app)await new Promise(r=>app.close(r));await rm(root,{recursive:true,force:true});}
});

test('uploaded PDF is private until publication, durable in separate storage, and revoked on withdrawal',async()=>{
 const {createHosted}=await import('../editor/hosted.mjs');const {deploymentConfig}=await import('../hosting/config.mjs');
 const root=await mkdtemp(path.join(os.tmpdir(),'fpb-public-doc-'));let app,payload;const blobs=new Map();
 const store={load:async()=>structuredClone(payload),save:async x=>{payload=structuredClone(x);},saveFile:async(id,bytes)=>blobs.set(id,bytes),loadFile:async id=>blobs.get(id),close:async()=>{}};
 try{
 await mkdir(path.join(root,'src/data'),{recursive:true});for(const name of ['site-content.json','case-studies-public.json'])await writeFile(path.join(root,'src/data',name),await readFile(new URL('../src/data/'+name,import.meta.url)));
 app=await createHosted({root,port:0,store,config:deploymentConfig({POND_PUBLIC_SITE:'true'}),testers:['owner@studio.test'],verify:async token=>{if(token!=='test-assertion')throw Error('Access token required.');return {email:'owner@studio.test'};},builder:async()=>{}});
 const base='http://127.0.0.1:'+app.server.address().port;let token;
 const req=(route,method='GET',body,publicRequest=false)=>new Promise((resolve,reject)=>{const q=request(base+route,{method,headers:{Host:publicRequest?'frogpondboys.com':'desk.frogpondboys.com','X-Forwarded-Proto':'https',...(!publicRequest?{'Cf-Access-Jwt-Assertion':'test-assertion'}:{}),...(token?{'X-Editor-Token':token}:{}),...(body?{Origin:'https://desk.frogpondboys.com','Content-Type':'application/json'}:{})}},r=>{const chunks=[];r.on('data',c=>chunks.push(c));r.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:r.statusCode,headers:r.headers})));});q.on('error',reject);q.end(body?JSON.stringify(body):undefined);});
 token=(await(await req('/api/v2/session')).json()).token;
 const response=await req('/api/v2/files','POST',{name:'policy.pdf',base64:blankPdf().toString('base64')});assert.equal(response.status,200,await response.clone().text());const file=await response.json();
 assert.equal((await req('/files/'+file.id,'GET',undefined,true)).status,404);
 let page=await(await req('/api/v2/pages/legal')).json();let saved=await req('/api/v2/pages/legal','PUT',{revision:page.revision,fields:{intro:'Our policies.',documentId:file.id}});assert.equal(saved.status,200);
 const publication=await req('/api/v2/pages/legal/publish','POST',{});assert.equal(publication.status,200,await publication.clone().text());
 const publicPdf=await req('/files/'+file.id,'GET',undefined,true);assert.equal(publicPdf.status,200);assert.equal(publicPdf.headers.get('content-type'),'application/pdf');assert.match(publicPdf.headers.get('content-disposition'),/attachment/);
 assert.equal(payload.files[0].id,file.id);assert.equal(blobs.size,1);assert(!JSON.stringify(payload.files).includes('base64'));
 const {snapshotFixture}=await import('./fixtures/case-studies.mjs');const fixture=snapshotFixture();const uploadImage=await(await req('/api/v2/media','POST',{name:'logo.png',base64:fixture.media[0].base64})).json();const picture={mediaId:uploadImage.mediaId,alt:'Studio logo'};
 const itemResponse=await req('/api/v2/items','POST',{section:'case-studies',fields:{title:'A case study',summary:'A concise summary.',context:'Client brief.',work:'Studio work.',cover:picture,brandLogo:picture,gallery:[],documentId:file.id}});assert.equal(itemResponse.status,200,await itemResponse.clone().text());const item=await itemResponse.json();assert.equal((await req('/api/v2/items/'+item.id+'/publish','POST',{revision:item.revision})).status,200);
 const publicCase=JSON.parse(await readFile(path.join(root,'src/data/case-studies-public.json')));assert.equal(publicCase.cases[0].content.documentId,file.id);assert.equal(publicCase.cases[0].content.brandLogo.assetId,uploadImage.mediaId);
 assert.equal((await req('/api/v2/items/'+item.id+'/unpublish','POST',{revision:item.revision})).status,200);
 const invalidPage=await(await req('/api/v2/pages/legal')).json();await req('/api/v2/pages/legal','PUT',{revision:invalidPage.revision,fields:{intro:'',documentId:'file-aaaaaaaaaaaaaaaaaaaaaaaa'}});assert.equal((await req('/api/v2/pages/legal/publish','POST',{})).status,422,'unknown file is not publishable');

 page=await(await req('/api/v2/pages/legal')).json();await req('/api/v2/pages/legal','PUT',{revision:page.revision,fields:{intro:'',documentId:null}});assert.equal((await req('/api/v2/pages/legal/publish','POST',{})).status,200);assert.equal((await req('/files/'+file.id,'GET',undefined,true)).status,404);
 }finally{if(app)await app.close();await rm(root,{recursive:true,force:true});}
});
