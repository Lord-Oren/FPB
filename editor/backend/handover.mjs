import {createServer} from 'node:http';
import {mkdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import path from 'node:path';
import {tuneHttpServer} from '../../hosting/http-runtime.mjs';
import {referencedFiles} from './file-references.mjs';

// Only a built, committed publication is exposed. A publication changed by the
// previous writer invalidates this preview until the replacement is built.
export async function preparePublishedSite({root,reader,builder}) {
 const folder=path.join(root,'.local-editor/v2');await mkdir(folder,{recursive:true,mode:0o700});
 let installed=null,pendingCurrent=null;
 // Concurrent requests share only the in-flight read, never a cached answer.
 // A later request still observes revocation immediately, even after success.
 async function current(){
  if(!installed)return false;
  const generation=installed.generation;
  if(pendingCurrent?.generation!==generation){
   const entry={generation};
   entry.promise=Promise.resolve().then(()=>reader.current(generation)).then(valid=>installed?.generation===generation&&valid).finally(()=>{if(pendingCurrent===entry)pendingCurrent=null;});
   pendingCurrent=entry;
  }
  return pendingCurrent.promise;
 }
 async function refresh(){
  if(installed&&await reader.current(installed.generation))return true;
  const publication=await reader.loadPublished(),id='warm-'+randomBytes(12).toString('hex');
  await builder(root,folder,id,publication.snapshot,{files:publication.files});
  if(!await reader.current(publication.generation))return false;
  installed={...publication,id,used:referencedFiles(publication.snapshot)};return true;
 }
 await refresh();
 return {
  initialize:async()=>{},close:async()=>{},purge:async()=>{},
  release:()=>installed?.id,refresh,
  current,
  async publicFile(id,res,head=false){
   const publication=installed;
   if(!/^file-[a-f0-9]{24}$/.test(id)||!publication?.used.has(id))return false;
   const file=publication.files.find(f=>f.id===id);if(!file)return false;
   const bytes=await reader.loadFile(id,publication.generation);
   if(!bytes)throw Error('Published file is no longer current.');
   res.writeHead(200,{'Content-Type':file.mime,'Content-Length':bytes.length,'Content-Disposition':file.kind==='pdf'?'inline; filename="document.pdf"':'inline','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"});res.end(head?undefined:bytes);return true;
  }
 };
}

// Starts listening immediately, but reports 503 until a public snapshot has
// actually been built. Writer ownership is never shared or forcibly stolen.
export async function startHostedHandover({port,root,builder,createApp,openWriter,openReader,hosted={},waitMs=300000,pollMs=1000,onEvent=()=>{}}) {
 const abort=new AbortController();let app,preview,writer,reader,closing=false,closePromise;
 const unavailable=(req,res)=>{res.writeHead(503,{'Content-Type':'text/plain','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Retry-After':'5'});res.end('The site is starting. Please try again shortly.');};
 const server=tuneHttpServer(createServer(unavailable));
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'0.0.0.0',resolve);});
 const started=Date.now();const event=name=>onEvent({event:name,elapsedMs:Date.now()-started});
 const check=()=>{if(closing)throw new DOMException('Startup stopped.','AbortError');};
 const ready=(async()=>{
  try{
   const deadline=Date.now()+waitMs;let announced=false;
   while(!writer){
    check();try{writer=await openWriter();}catch(error){
     if(error.code!=='POND_WRITER_BUSY'||Date.now()>=deadline)throw error;
     if(!announced){event('pond_writer_wait');announced=true;}
     if(!reader){
      reader=await openReader();check();
      const readOnly=await preparePublishedSite({root,reader,builder});check();
      preview=await createApp({...hosted,port,root,server,store:reader,builder,readOnly});
      event('pond_public_ready');
     }else{await preview.readOnly.refresh();check();}
     await delay(pollMs,undefined,{signal:abort.signal});
    }
   }
   check();event('pond_writer_acquired');
   // createApp reloads/reconciles PostgreSQL under the writer lock and installs
   // the new request handler only after its builds and durable save succeed.
   app=await createApp({...hosted,port,root,server,store:writer,builder});check();
   if(preview){await preview.dispose();preview=null;reader=null;}
   event('pond_ready');return app;
  }catch(error){
   // Do not leave a stale preview or a writer lock alive after failed startup.
   server.removeAllListeners('request');server.on('request',unavailable);
   if(app)await app.dispose().catch(()=>{});
   else if(writer)await writer.close().catch(()=>{});
   if(preview)await preview.dispose().catch(()=>{});else if(reader)await reader.close().catch(()=>{});
   if(server.listening)await new Promise(resolve=>server.close(resolve));
   throw error;
  }
 })();
 // A caller may install signal handlers before awaiting ready.
 void ready.catch(()=>{});
 return {server,ready,async close(){
  if(closePromise)return closePromise;closing=true;abort.abort();event('pond_stopping');
  server.removeAllListeners('request');server.on('request',unavailable);
  closePromise=(async()=>{await ready.catch(()=>{});if(app)await app.close();else if(server.listening)await new Promise(resolve=>server.close(resolve));})();return closePromise;
 }};
}
