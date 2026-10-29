// Routes, local sessions, serialized mutations, conversations and retention. No external mail transport.
// Loopback-only API. Local mail/testing adapters never connect to a provider.
import {existsSync} from 'node:fs';
import {readFile,writeFile,mkdir,rm,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {clone,uid,sections,sectionIds,group,fail,check,plain,text,email,address,draftFields,migrate,snapshots,status,revision,mediaView,viewItem,log as modelLog,setPage,homeFields} from './model.mjs';
import {prepareStructure,collectionKinds,zones} from '../../src/data/structure.js';
import {atomic,buildRelease,validateImages} from './publisher.mjs';
import {upgradeContent,cleanPlaceholderLinks} from './content-upgrade.mjs';
import {image,pdf} from './files.mjs';
import {historyLabel,conversationView} from './messages.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"};
function send(res,status,data,type='application/json',extra={}){res.writeHead(status,{...headers,'Content-Type':type,...extra});res.end(type==='application/json'?JSON.stringify(data):data);}
async function bodyOf(req,form=false){
 const type=req.headers['content-type']??'';
 check(type==='application/json'||(form&&/^(multipart\/form-data;|application\/x-www-form-urlencoded)/.test(type)),'This data format is not supported.',415);
 let size=0;const chunks=[];for await(const part of req){size+=part.length;check(size<=8*1024*1024,'This upload is too large. The limit is 8 MiB per request.',413);chunks.push(part);}const bytes=Buffer.concat(chunks);
 if(type==='application/json'){const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));plain(value);return value;}
 const data=await new Response(bytes,{headers:{'Content-Type':type}}).formData();
 const fields={name:data.get('full_name'),email:data.get('email'),message:data.get('message'),website:data.get('website'),facts:data.get('phone')??''};
 const cv=data.get('cv');if(cv&&typeof cv.arrayBuffer==='function')fields.cv={name:cv.name,base64:Buffer.from(await cv.arrayBuffer()).toString('base64')};return fields;
}
export function createV2({root,token,clock=()=>new Date(),builder=buildRelease,scanPdf=null,store=null,hosted=false,testers=[],publicUrls={},maxStateBytes=128*1024*1024,sessionSeconds=28800}){
 check(Number.isInteger(sessionSeconds)&&sessionSeconds>=1&&sessionSeconds<=604800,'Invalid session length.');
 const folder=path.join(root,'.local-editor','v2'),file=path.join(folder,'state.json'),pending=path.join(folder,'pending.json'),lock=path.join(folder,'lock.json');
 const siteFile=path.join(root,'src/data/site-content.json'),caseFile=path.join(root,'src/data/case-studies-public.json');
 let state,init,queue=Promise.resolve(),locked=false;const rates=new Map(), sessions=new Map();
 let actor='local';
 const log=(next,action,at)=>modelLog(next,action,at,actor);
 const now=()=>clock().toISOString();
 const diskSnapshot=async()=>({site:await read(siteFile),cases:await read(caseFile)});
 const save=async next=>{check(Buffer.byteLength(JSON.stringify(next))<=maxStateBytes,`This test version has reached its ${Math.round(maxStateBytes/1024/1024)} MiB storage limit. Your previous data is safe. Contact the site manager.`,413);if(store)await store.save(next);else await atomic(file,next);state=next;};
 async function initialize(){
  if(state)return;if(init)return init;
  init=(async()=>{
   await mkdir(folder,{recursive:true,mode:0o700});
   try{await writeFile(lock,JSON.stringify({pid:process.pid}),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;let held=true;try{process.kill((await read(lock)).pid,0)}catch(err){if(err.code==='ESRCH')held=false;}check(!held,'Another editor is using this data. Close it before continuing.',409);await rm(lock);await writeFile(lock,JSON.stringify({pid:process.pid}),{flag:'wx',mode:0o600});}locked=true;
   try{state=store?await store.load():await read(file);if(!state){const missing=new Error();missing.code='ENOENT';throw missing;}check(state.schemaVersion===2,'This saved data uses an unsupported format.');}catch(e){if(e.code!=='ENOENT')throw e;let legacy;try{legacy=await read(path.join(root,'.local-editor/draft.json'))}catch(e){if(e.code!=='ENOENT')throw e;}const pub=await diskSnapshot();state=migrate(pub.site,pub.cases,legacy,now());state.sourceHash=hash(pub);state.initialPublic=pub;await save(state);}
   const upgrade=upgradeContent(state,(await diskSnapshot()).site);
   if(upgrade&&!upgrade.changed)await save(upgrade.state);
   if(upgrade?.changed){
    const id=uid('upgrade');await builder(root,folder,id,upgrade.snapshot);
    const next=upgrade.state;next.release=id;next.sourceHash=hash(upgrade.snapshot);
    next.publishes.unshift({id,at:now(),summary:'Website content compatibility updated',snapshot:upgrade.snapshot});
    modelLog(next,'content_upgrade',now(),'system');
    await atomic(siteFile,upgrade.snapshot.site);await atomic(caseFile,upgrade.snapshot.cases);await save(next);
   }
   if(store&&!upgrade?.changed){
    const pub=state.publishes[0]?.snapshot??state.initialPublic;check(pub,'Missing durable public snapshot.');
    await atomic(siteFile,pub.site);await atomic(caseFile,pub.cases);state.sourceHash=hash(pub);
    const id=uid('boot');await builder(root,folder,id,pub);state.release=id;await save(state);
   }
   // A crash between two public source writes is recovered before any request.
   try{if(store)await rm(pending,{force:true});const plan=await read(pending);const chosen=state.release===plan.id?plan.next:plan.before;await atomic(siteFile,chosen.site);await atomic(caseFile,chosen.cases);await rm(pending);}catch(e){if(e.code!=='ENOENT')throw e;}
  })();try{await init}catch(e){state=undefined;init=undefined;if(locked){await rm(lock,{force:true});locked=false;}throw e;}
 }
 async function publish(next,summary){
  const before=await diskSnapshot();check(hash(before)===state.sourceHash,'The site files changed outside Pond Desk. Ask the site manager to check them before publishing. Your drafts are saved.',409);
  let pub;try{pub=snapshots(next);await validateImages(pub);}catch(e){if(e.status)throw e;fail('Cannot publish. Check the required fields, dates, links, and photos. Your drafts are saved.',422);}
  const id=uid('release');try{await builder(root,folder,id,pub);}catch(e){const failed=clone(state);log(failed,'publication_failed',now());failed.lastFailure={at:now(),message:'The site could not be built. The previous site is still available.'};(failed.failures??=[]).unshift({id:uid('failed'),at:now(),summary:'FAILED - previous site kept',status:'failed'});await save(failed);fail(failed.lastFailure.message,422);}
  next.release=id;next.sourceHash=hash(pub);next.publishes.unshift({id,at:now(),summary,snapshot:pub});next.lastFailure=null;log(next,'publish',now());
  await atomic(pending,{id,before,next:pub});
  try{await atomic(siteFile,pub.site);await atomic(caseFile,pub.cases);await save(next);}catch(e){await atomic(siteFile,before.site);await atomic(caseFile,before.cases);await rm(pending,{force:true});throw e;}
  await rm(pending,{force:true});return {message:hosted?'Published to the website ✓':'Published to the local site ✓ Not uploaded online.'};
 }
 function removeConversation(next,id){next.conversations=next.conversations.filter(t=>t.id!==id);next.attachments=next.attachments.filter(a=>a.conversationId!==id);next.outbox=next.outbox.filter(m=>m.conversationId!==id);}
 async function purge(){
  const current=clock();
  const expired=state.conversations.filter(t=>{const limit=new Date(t.createdAt);limit.setUTCMonth(limit.getUTCMonth()+(t.box==='cv'?12:24));return current>=limit;}).map(t=>t.id);
  const cutoff=new Date(current);cutoff.setUTCMonth(cutoff.getUTCMonth()-24);
  if(!expired.length&&!state.journal.some(e=>new Date(e.at)<cutoff))return;
  const next=clone(state);
  for(const id of expired){removeConversation(next,id);log(next,'purge',now());}
  next.journal=next.journal.filter(e=>new Date(e.at)>=cutoff);
  await save(next);
 }
 function readOnly(method,url){
  if(method!=='GET')return false;
  const route=url.pathname.slice('/api/v2'.length);
  return /^\/(sections|counts|structure|settings|people|publishes|journal)$/.test(route)||route==='/conversations'||/^\/items(?:\/[^/]+(?:\/history)?)?$/.test(route)||/^\/pages\/[^/]+$/.test(route)||/^\/media\/[^/]+$/.test(route);
 }
 async function execute(method,url,body,res,sessionState,requestActor=actor){
  const route=url.pathname.slice('/api/v2'.length),parts=route.split('/').filter(Boolean).map(decodeURIComponent);const [resource,id,action]=parts;
  const next=readOnly(method,url)?state:clone(state);let result={},changed=false;
  const item=()=>{const x=next.items.find(i=>i.id===id);check(x,'Item not found.',404);return x;};
  const talk=()=>{const x=next.conversations.find(i=>i.id===id);check(x,'Conversation not found.',404);return x;};
  let urls;const assetUrls=()=>urls??=mediaView(next);
  if(method==='GET'&&resource==='counts')return Object.fromEntries(['cv','msg'].map(box=>[box,next.conversations.filter(t=>t.box===box&&t.state!=='archived'&&t.unread).length]));
  if(method==='GET'&&resource==='sections')return Object.fromEntries(sectionIds(next).map(s=>[s,next.items.filter(i=>i.section===s).length]));

  if(resource==='structure'){
   const tree=next.structure;check(tree,'The site structure is not ready.',503);
   if(method==='GET')return {...clone(tree),zones:clone(zones)};
   if(method==='POST'&&id==='publish'){revision(tree,body.revision);tree.live=clone(tree.fields);return publish(next,'Site structure updated');}
   if(method==='POST'&&!id)fail('The site sections are fixed. You can rename them and edit their content.');
   if(method==='PUT'&&!id){
    revision(tree,body.revision);let candidate;try{candidate=prepareStructure(body.structure);}catch(e){fail(e.message);}
    check(candidate.nodes.length===tree.fields.nodes.length,'The site sections are fixed. You can rename them and edit their content.');
    for(const old of tree.fields.nodes){const node=candidate.nodes.find(n=>n.id===old.id);check(node&&node.slug===old.slug&&node.kind===old.kind&&node.parentId===old.parentId&&node.zone===old.zone,'Page addresses and content types stay fixed to protect existing links and content.');}
    tree.fields=candidate;tree.revision++;result={...clone(tree),zones:clone(zones)};changed=true;
   }
  }else if(resource==='items'&&!id){
   const section=url.searchParams.get('section');
   if(method==='GET'){check(sectionIds(next).includes(section),'Section not found.',404);return next.items.filter(i=>i.section===section).sort((a,b)=>(b.fields.date??b.fields.start??'').localeCompare(a.fields.date??a.fields.start??'')).map(i=>({id:i.id,title:i.fields.title,status:status(i),thumb:(i.fields.image??i.fields.cover)?.mediaId?assetUrls()[(i.fields.image??i.fields.cover).mediaId]:''}));}
   if(method==='POST'){check(next.items.length<1000,'The limit of 1,000 items has been reached.',413);const fields=draftFields(body.section,body.fields,{},next),slug=address(fields.title,next.reserved);const x={id:uid('item'),publicId:slug,slug,section:body.section,revision:1,fields,live:null};next.reserved.push(slug);next.items.unshift(x);result=viewItem(next,x);changed=true;}
  }else if(resource==='items'&&id){
   const x=item();
   if(method==='GET'&&!action)return viewItem(next,x);
   if(method==='GET'&&action==='history')return x.previousVersions??{};
   if(method==='POST'&&action==='restore'){revision(x,body.revision);check(Object.hasOwn(x.previousVersions??{},body.version),'Saved item version not found.',404);x.fields=clone(x.previousVersions[body.version]);x.revision++;result=viewItem(next,x);changed=true;}
   if(method==='PUT'&&!action){revision(x,body.revision);x.fields=draftFields(x.section,body.fields,x.fields,next);x.revision++;result=viewItem(next,x);changed=true;}
   if(method==='POST'&&['publish','unpublish'].includes(action)){revision(x,body.revision);if(action==='publish')check(next.structure.live.nodes.some(n=>n.id===x.section),'Publish the site structure before publishing content in this new section.');x.live=action==='publish'?clone(x.fields):null;const answer=await publish(next,action==='publish'?'Content published':'Content taken off the site');return {...answer,item:viewItem(state,state.items.find(i=>i.id===id))};}
   if(method==='DELETE'&&!action){next.items=next.items.filter(i=>i.id!==id);if(x.live)return publish(next,'Content deleted');changed=true;}
  }else if(resource==='pages'&&id){
   check(Object.hasOwn(next.pages,id),'Page not found.',404);const p=next.pages[id];
   if(method==='GET'&&!action)return {...clone(p),fields:id==='home'?{...homeFields(next.base.home),...clone(p.fields)}:clone(p.fields),media:assetUrls()};
   if(method==='PUT'&&!action){revision(p,body.revision);plain(body.fields);check(Buffer.byteLength(JSON.stringify(body.fields))<=60000,'This page is too large. Shorten its content and try again.',413);const candidate=clone(next);setPage(candidate.base,id,body.fields);
    // Merge fields the current UI does not expose (team photos and job locations).
    const f=id==='home'?{...p.fields,...clone(body.fields)}:clone(body.fields);if(id==='about')f.team=(f.team??[]).map(person=>({...p.fields.team?.find(x=>x.name===person.name),...person}));if(id==='join')f.positions=(f.positions??[]).map(job=>({...p.fields.positions?.find(x=>x.title===job.title),...job}));
    p.fields=f;p.revision++;sessionState.pages[id]=p.revision;result={revision:p.revision};changed=true;
   }
   if(method==='POST'&&action==='publish'){check(sessionState.pages[id]===p.revision,'This page changed in another window. Save it again before publishing.',409);p.live=clone(p.fields);return publish(next,'Page updated');}
  }else if(resource==='media'){
   if(method==='POST'&&!id){const a=await image(body);check(next.media.length<500,'The limit of 500 media files has been reached.',413);next.media.push(a);result={mediaId:a.id,src:`/api/v2/media/${a.id}`};changed=true;}
   if(method==='GET'&&id){const a=next.media.find(m=>m.id===id);check(a,'Photo not found.',404);send(res,200,Buffer.from(a.base64,'base64'),a.mime);return null;}
  }else if(resource==='publishes'){
   if(method==='GET'&&!id)return [...next.publishes.map(({snapshot,...entry})=>entry),...(next.failures??[])].map(entry=>({...entry,summary:historyLabel(entry.summary)}));
   if(method==='POST'&&action==='restore'){const saved=next.publishes.find(p=>p.id===id);check(saved,'Version not found.',404);const safe=cleanPlaceholderLinks(saved.snapshot);const restored=migrate(safe.site,safe.cases,undefined,now());for(const i of next.items)i.live=null;
    for(const old of restored.items){const current=next.items.find(i=>i.publicId===old.publicId&&i.section===old.section);if(current)current.live=clone(old.live);else{next.items.push(old);next.reserved.push(old.slug);}}
    for(const m of restored.media)if(!next.media.some(a=>a.id===m.id))next.media.push(m);
    for(const name of Object.keys(next.pages))next.pages[name].live=clone(restored.pages[name].live);
    // Restore published navigation without discarding newer drafts or reserved addresses.
    next.structure.live=clone(restored.structure.live);
    for(const node of restored.structure.fields.nodes)if(!next.structure.fields.nodes.some(n=>n.id===node.id))next.structure.fields.nodes.push(clone(node));
    next.structure.revision++;
    return publish(next,'Earlier version restored');
   }
  }else if(resource==='settings'&&!id){if(method==='GET')return next.settings;if(method==='PUT'){plain(body.notifications);check(typeof body.notifications.cv==='boolean'&&typeof body.notifications.msg==='boolean','Invalid notification settings.');next.settings={notifications:{cv:body.notifications.cv,msg:body.notifications.msg},signature:text(body.signature??'',300,'signature',false)};result=next.settings;changed=true;}}
  else if(resource==='people'){
   if(hosted){if(method==='GET'&&!id)return testers.map(e=>({email:e,me:e===requestActor}));fail('Ask the site manager to add this address to both the sign-in list and the server settings before it can receive a code.',403);}
   if(method==='GET'&&!id)return next.people.map(e=>({email:e,me:e==='local@example.invalid'}));
   if(method==='POST'&&!id){const e=email(body.email);check(!next.people.includes(e),'This person is already on the list.',409);check(next.people.length<100,'The limit is 100 people.');next.people.push(e);changed=true;}
   if(method==='DELETE'&&id){check(next.people.includes(id),'Person not found.',404);check(id!=='local@example.invalid'&&next.people.length>1,'You cannot remove your own access or the last person on the list.',409);next.people=next.people.filter(e=>e!==id);changed=true;}
  }else if(resource==='conversations'){
   if(method==='GET'&&!id){const box=url.searchParams.get('box'),archived=url.searchParams.get('state')==='archived';check(['cv','msg'].includes(box),'Inbox not found.',404);return next.conversations.filter(t=>t.box===box&&(t.state==='archived')===archived).map(t=>({id:t.id,name:t.name,email:t.email,unread:t.unread,lastAt:t.messages.at(-1).at,preview:conversationView(t).messages.at(-1).text.slice(0,240)})).sort((a,b)=>b.lastAt.localeCompare(a.lastAt));}
   if(id){const t=talk();if(method==='GET'&&!action){t.unread=false;result=conversationView(t);changed=true;}
    if(method==='POST'&&action==='state'){check(['open','archived','callback'].includes(body.state),'Unknown status.');t.state=body.state;changed=true;}
    if(method==='DELETE'&&!action){removeConversation(next,id);changed=true;}
    if(method==='POST'&&action==='replies'){
     const value=text(body.text,10000,'text');const key=hash({text:value,signature:next.settings.signature});if(t.messages.at(-1)?.simulationKey===key)return {status:'simulated',message:'This simulated reply is already saved. No email was sent.'};const message={from:'us',at:now(),text:`[Simulation - no email sent]\n${value}\n\n${next.settings.signature}`,status:'simulated',simulation:true,simulationKey:key,attachments:[]};
     t.messages.push(message);next.outbox.push({id:uid('mail'),conversationId:id,at:now(),status:'simulated',kind:'reply',replyAddress:`${t.replyKey}@reply.example.invalid`});log(next,'reply_simulated',now());await save(next);
     return {status:'simulated',message:'Simulated reply saved. No email was sent.'};
    }
   }
  }else if(resource==='attachments'&&id&&method==='GET'){
   const a=next.attachments.find(a=>a.id===id);check(a,'File not found.',404);check(a.state==='clean','This resume is in quarantine. Its safety check is not complete.',423);log(next,'attachment_open',now());await save(next);send(res,200,Buffer.from(a.base64,'base64'),'application/pdf',{'Content-Disposition':`attachment; filename="cv.pdf"; filename*=UTF-8''${encodeURIComponent(a.name)}`});return null;
  }else if(resource==='export'&&method==='GET'){
   const current=await diskSnapshot();send(res,200,gzipSync(JSON.stringify(current)),'application/gzip',{'Content-Disposition':'attachment; filename="pond-public-content.json.gz"'});return null;
  }else if(resource==='journal'&&method==='GET')return next.journal;
  else if(resource==='testing'&&id==='outbox'&&method==='GET')return next.outbox;
  else if(resource==='testing'&&id==='receive'&&method==='POST'){
   check(['cv','msg'].includes(body.box),'Inbox not found.');check(typeof body.website==='string'&&!body.website,'Submission rejected.',422);const key=body.rateKey??'local-testing';const rateTable=store?(next.formRates??={}):null;const attempts=rateTable?(rateTable[key]??[]):(rates.get(key)??[]);const recent=attempts.filter(t=>clock().getTime()-t<3600000);check(recent.length<5,'Too many submissions. Try again in one hour.',429);recent.push(clock().getTime());if(rateTable){for(const k of Object.keys(rateTable))if(!rateTable[k].some(t=>clock().getTime()-t<3600000))delete rateTable[k];rateTable[key]=recent;}else rates.set(key,recent);
   const t={id:uid('conversation'),box:body.box,state:'open',name:text(body.name,120,'name'),email:email(body.email),subject:text(body.subject??(body.box==='cv'?'Application':'Contact'),160,'subject'),createdAt:now(),unread:true,replyKey:uid('reply'),messages:[]};
   const message={from:'them',at:now(),text:text(body.message,10000,'message'),facts:text(body.facts??'',300,'facts',false),attachments:[]};
   if(body.box==='cv'){check(body.cv,'A resume is required.',422,'cv');const a=await pdf(body.cv,folder);a.conversationId=t.id;if(scanPdf&&await scanPdf(Buffer.from(a.base64,'base64'))===true)a.state='clean';next.attachments.push(a);message.attachments.push({id:a.id,name:a.name,size:a.size});}
   t.messages.push(message);next.conversations.push(t);if(next.settings.notifications[t.box])next.outbox.push({id:uid('mail'),conversationId:t.id,at:now(),kind:'notification',status:'simulated',text:t.box==='cv'?'New application - read it in Pond Desk':'New message - read it in Pond Desk'});result={id:t.id,message:'Saved in Pond Desk. No email was sent.'};changed=true;
  }else if(resource==='testing'&&id==='reply'&&method==='POST'){
   const t=next.conversations.find(t=>t.id===body.conversationId);check(t,'Conversation not found.',404);check(email(body.from)===t.email,'The sender does not match this conversation.',403);t.messages.push({from:'them',at:now(),text:text(body.text,10000,'text'),attachments:[]});t.unread=true;changed=true;
  }else if(resource==='testing'&&id==='purge'&&method==='POST'){await purge();return {message:'Expired local records removed.'};}
  check(changed,'Unknown action.',404);log(next,resource==='conversations'&&method==='GET'?'conversation_read':`${method.toLowerCase()}_${resource}`,now());await save(next);return result;
 }
 async function handler(req,res,url){
  if(url.pathname.startsWith('/v2/')){
   const relative=url.pathname.slice(4)||'index.html';const ok=['index.html','app.js','style.css'].includes(relative)||/^fonts\/[A-Za-z0-9-]+\.(woff2|otf|txt)$/.test(relative);if(!ok){send(res,404,{message:'File not found.'});return true;}
   try{const data=await readFile(new URL('../v2/'+relative,import.meta.url));const type=relative.endsWith('.html')?'text/html; charset=utf-8':relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':relative.endsWith('.woff2')?'font/woff2':relative.endsWith('.otf')?'font/otf':'text/plain';send(res,200,data,type);}catch{send(res,404,{message:'File not found.'});}return true;
  }
  if(!url.pathname.startsWith('/api/v2/'))return false;
  try{
   const form=['/api/v2/forms/contact','/api/v2/forms/join'].includes(url.pathname)&&req.method==='POST';
   const session=url.pathname==='/api/v2/session'&&req.method==='GET';
   const cookie=(req.headers.cookie??'').split(';').map(v=>v.trim()).find(v=>v.startsWith('pond_session='))?.slice(13);
   for(const [key,value] of sessions)if(value.expires<clock().getTime())sessions.delete(key);
   const sessionKey=req.headers['x-editor-token']||(req.method==='GET'?cookie:undefined);
   const auth=hosted&&store?.loadSession&&typeof sessionKey==='string'?await store.loadSession(hash(sessionKey),clock().getTime()):sessions.get(sessionKey);
   if(hosted)check(req.pondIdentity&&(!auth||auth.email===req.pondIdentity.email),'Sign in to access this test site.',403);
   if(hosted&&url.pathname.startsWith('/api/v2/testing/'))fail('This page or action is not available.',404);
   check(form||session||auth,'Your editor session has expired. Reload the page.',403);
   const body=['POST','PUT','DELETE'].includes(req.method)?(req.method==='DELETE'?{}:await bodyOf(req,form)):{};
   // Only audited, side-effect-free reads bypass the mutation queue. They observe
   // the last committed state while a new release is being built. Authentication
   // is still checked above, and reads never persist or extend a session.
   if(readOnly(req.method,url)){
    await initialize();
    const result=await execute(req.method,url,{},res,auth,req.pondIdentity?.email??'local');
    if(result!==null)send(res,200,result);
    return true;
   }
   const operation=async()=>{await initialize();actor=req.pondIdentity?.email??'local';await purge();if(session){const token=uid('session');const duration=hosted?sessionSeconds*1000:28800000;const info={expires:clock().getTime()+duration,pages:{},email:actor};if(hosted&&store?.saveSession)await store.saveSession(hash(token),info,clock().getTime());else{check(sessions.size<1000,'Too many open sessions. Try again later.',429);sessions.set(token,info);}send(res,200,{token,user:{email:actor==='local'?'local@example.invalid':actor},mode:hosted?'hosted-test':'local',mail:'simulated',publicUrls },'application/json',{'Set-Cookie':`pond_session=${token}; ${hosted?'Secure; ':''}HttpOnly; SameSite=Strict; Path=/api/v2; Max-Age=${hosted?sessionSeconds:28800}`});return;}
    if(form){body.box=url.pathname.endsWith('/join')?'cv':'msg';body.rateKey=hosted?req.pondIdentity.subject:req.socket.remoteAddress;url=new URL('/api/v2/testing/receive',url);}
    const previousContext=auth?JSON.stringify(auth.pages):null;
    const result=await execute(req.method,url,body,res,auth);
    if(auth&&hosted&&store?.saveSession&&previousContext!==JSON.stringify(auth.pages))await store.saveSession(hash(sessionKey),auth,clock().getTime());
    if(result!==null)send(res,200,result);
   };
   const task=queue.then(operation);queue=task.catch(()=>{});await task;
  }catch(error){if(res.headersSent){res.end();return true;}if(error.status===413)res.setHeader('Connection','close');send(res,error.status??400,{message:error.status?error.message:'Could not process this data. Check the fields and try again.',...(error.diagnostics?{diagnostics:error.diagnostics}:{})});}
  return true;
 }
 return {handler,initialize,release:()=>state?.release,active:()=>Boolean(state)||existsSync(file),close:async()=>{await queue;if(locked)await rm(lock,{force:true});locked=false;},purge:()=>queue=queue.then(async()=>{if(state)await purge()}).catch(()=>{})};
}
