// Authenticated editing, shared conversations and retention. Public intake is explicitly gated.
// Mail is simulated unless the hosted adapter is explicitly configured.
import {existsSync} from 'node:fs';
import {readFile,writeFile,mkdir,rm,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {clone,uid,sections,sectionIds,group,fail,check,plain,text,email,address,draftFields,migrate,snapshots,status,revision,mediaView,viewItem,log as modelLog,setPage,homeFields} from './model.mjs';
import {validateWording,wordingDefaults,wordingLimits} from '../../src/data/wording.js';
import {prepareStructure,collectionKinds,zones} from '../../src/data/structure.js';
import {atomic,buildRelease,validateImages} from './publisher.mjs';
import {upgradeContent,cleanPlaceholderLinks,cleanPublicSnapshot} from './content-upgrade.mjs';
import {referencedFiles} from './file-references.mjs';
import {prepareUpload} from './public-files.mjs';
import {FILE_TOO_LARGE_MESSAGE} from './attachment-policy.mjs';
import {prepareJoinFile} from './join-files.mjs';
import {mailTransport,queueEmail,deliverPending} from './mail.mjs';
import {privateRateKey,verifyInbound} from './form-security.mjs';
import {validatePortfolioUrl} from './attachment-policy.mjs';
import {image,pdf} from './files.mjs';
import {compactHistory,hydrateSnapshot,preserveRestoredMedia} from './history.mjs';
import {historyLabel,conversationView} from './messages.mjs';
import {createOperations,operationPlan} from './operations.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"};
function send(res,status,data,type='application/json',extra={}){res.writeHead(status,{...headers,'Content-Type':type,...extra});res.end(type==='application/json'?JSON.stringify(data):data);}
async function bodyOf(req,form=false){
 const type=req.headers['content-type']??'';
 check(type==='application/json'||(form&&/^(multipart\/form-data;|application\/x-www-form-urlencoded)/.test(type)),'This data format is not supported.',415);
 const requestPath=new URL(req.url,'http://local').pathname;const fileRequest=requestPath==='/api/v2/files';const ceiling=requestPath==='/api/v2/mail/inbound'?128*1024:(fileRequest||form?15:8)*1024*1024;
 let size=0;const chunks=[];for await(const part of req){size+=part.length;if(size>ceiling){const error=new Error(fileRequest||form?FILE_TOO_LARGE_MESSAGE:'This upload is too large. The limit is 8 MiB per request.');error.status=413;if(fileRequest||form)error.code='file_too_large';throw error;}chunks.push(part);}const bytes=Buffer.concat(chunks);req.pondRawBody=bytes;
 if(type==='application/json'){const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));plain(value);return value;}
 const data=await new Response(bytes,{headers:{'Content-Type':type}}).formData();
 for(const key of new Set(data.keys()))check(data.getAll(key).length===1,'Duplicate form field.',422);
 const fields={name:data.get('full_name'),email:data.get('email'),message:data.get('message'),website:data.get('website')??'',facts:data.get('phone')??'',portfolioUrl:data.get('portfolioUrl')??'',turnstileToken:data.get('turnstileToken')??data.get('cf-turnstile-response')??''};
 const attachment=data.get('attachment')??data.get('cv');if(attachment&&typeof attachment.arrayBuffer==='function'&&attachment.size)fields.attachment={name:attachment.name,base64:Buffer.from(await attachment.arrayBuffer()).toString('base64')};return fields;
}
export function createV2({root,token,clock=()=>new Date(),builder=buildRelease,scanPdf=null,store=null,hosted=false,testers=[],publicUrls={},maxStateBytes=128*1024*1024,sessionSeconds=28800,publicVariants=['a','b'],mail=mailTransport(),forms={enabled:false},inboundSecret=''}){
 check(Number.isInteger(sessionSeconds)&&sessionSeconds>=1&&sessionSeconds<=604800,'Invalid session length.');
 const folder=path.join(root,'.local-editor','v2'),file=path.join(folder,'state.json'),pending=path.join(folder,'pending.json'),lock=path.join(folder,'lock.json');
 const siteFile=path.join(root,'src/data/site-content.json'),caseFile=path.join(root,'src/data/case-studies-public.json');
 const fileFolder=path.join(folder,'files');
 const saveFile=async(id,bytes)=>store?.saveFile?store.saveFile(id,bytes):writeFile(path.join(fileFolder,id),bytes,{mode:0o600,flag:'wx'});
 const deleteFile=async id=>store?.deleteFile?store.deleteFile(id):rm(path.join(fileFolder,id),{force:true});
 const fileBytes=async id=>store?.loadFile?store.loadFile(id):readFile(path.join(fileFolder,id));
 const operations=createOperations({now:()=>clock().getTime()});let activeOperation=null;
 let state,init,queue=Promise.resolve(),locked=false;const rates=new Map(), sessions=new Map();
 let actor='local',intakeInFlight=0,mailPump=null,closing=false;const attempts=new Map();
 const log=(next,action,at)=>modelLog(next,action,at,actor);
 const now=()=>clock().toISOString();
 const diskSnapshot=async()=>({site:await read(siteFile),cases:await read(caseFile)});
 const save=async next=>{compactHistory(next);check(Buffer.byteLength(JSON.stringify(next))<=maxStateBytes,`This site has reached its ${Math.round(maxStateBytes/1024/1024)} MiB storage limit. Your previous data is safe. Contact the site manager.`,413);if(store)await store.save(next);else await atomic(file,next);state=next;};
 // Provider latency must not hold the editor mutation queue. Every outbox transition
 // merges into the latest state under that queue, never a stale message snapshot.
 function sendPending(){
  if(closing||mailPump||mail.mode!=='resend'||!state)return;
  const serial=operation=>{const task=queue.then(operation);queue=task.catch(()=>{});return task;};
  mailPump=(async()=>{
   const entries=await serial(()=>clone(state.outbox.filter(m=>['queued','failed'].includes(m.status)&&(!m.nextAttemptAt||m.nextAttemptAt<=now())).slice(0,5)));
   for(const entry of entries){
    await deliverPending({outbox:[entry],conversations:[]},mail,now(),()=>serial(async()=>{
     const next=clone(state),target=next.outbox.find(m=>m.id===entry.id);if(!target)return;
     Object.assign(target,entry);const message=next.conversations.find(t=>t.id===entry.conversationId)?.messages.find(m=>m.mailId===entry.id);if(message)message.status=entry.status;
     await save(next);
    }));
   }
  })().catch(()=>{}).finally(()=>{mailPump=null;});
 }
 async function initialize(){
  if(state)return;if(init)return init;
  init=(async()=>{
   await mkdir(folder,{recursive:true,mode:0o700});await mkdir(fileFolder,{recursive:true,mode:0o700});
   try{await writeFile(lock,JSON.stringify({pid:process.pid}),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;let held=true;try{process.kill((await read(lock)).pid,0)}catch(err){if(err.code==='ESRCH')held=false;}check(!held,'Another editor is using this data. Close it before continuing.',409);await rm(lock);await writeFile(lock,JSON.stringify({pid:process.pid}),{flag:'wx',mode:0o600});}locked=true;
   try{state=store?await store.load():await read(file);if(!state){const missing=new Error();missing.code='ENOENT';throw missing;}check(state.schemaVersion===2,'This saved data uses an unsupported format.');}catch(e){if(e.code!=='ENOENT')throw e;let legacy;try{legacy=await read(path.join(root,'.local-editor/draft.json'))}catch(e){if(e.code!=='ENOENT')throw e;}const pub=await diskSnapshot();state=migrate(pub.site,pub.cases,legacy,now());state.sourceHash=hash(pub);state.initialPublic=pub;await save(state);}
   let moved=false;
   for(const attachment of state.attachments??[])if(attachment.base64){
    const bytes=Buffer.from(attachment.base64,'base64');
    // Upsert is deliberately avoided: a crash may leave an already copied immutable blob.
    try{await saveFile(attachment.id,bytes);}catch(e){if(!['23505','EEXIST'].includes(e.code))throw e;}
    delete attachment.base64;moved=true;
   }
   if(moved)await save(state);
   const upgrade=upgradeContent(state,(await diskSnapshot()).site);
   if(upgrade&&!upgrade.changed)await save(upgrade.state);
   if(upgrade?.changed){
    const id=uid('upgrade');await builder(root,folder,id,upgrade.snapshot,{files:upgrade.state.files??[]});
    const next=upgrade.state;next.release=id;next.sourceHash=hash(upgrade.snapshot);
    next.publishes.unshift({id,at:now(),summary:'Website content compatibility updated',snapshot:upgrade.snapshot});
    modelLog(next,'content_upgrade',now(),'system');
    await atomic(siteFile,upgrade.snapshot.site);await atomic(caseFile,upgrade.snapshot.cases);await save(next);
   }
   if(store&&!upgrade?.changed){
    const pub=hydrateSnapshot(state,state.publishes[0]?.snapshot??state.initialPublic);check(pub,'Missing durable public snapshot.');
    await atomic(siteFile,pub.site);await atomic(caseFile,pub.cases);state.sourceHash=hash(pub);
    const id=uid('boot');await builder(root,folder,id,pub,{files:state.files??[]});state.release=id;await save(state);
   }
   // A crash between two public source writes is recovered before any request.
   try{if(store)await rm(pending,{force:true});const plan=await read(pending);const chosen=state.release===plan.id?plan.next:plan.before;await atomic(siteFile,chosen.site);await atomic(caseFile,chosen.cases);await rm(pending);}catch(e){if(e.code!=='ENOENT')throw e;}
  })();try{await init}catch(e){state=undefined;init=undefined;if(locked){await rm(lock,{force:true});locked=false;}throw e;}
 }
 async function publish(next,summary){
  activeOperation?.stage('content');
  const before=await diskSnapshot();check(hash(before)===state.sourceHash,'The site files changed outside Pond Desk. Ask the site manager to check them before publishing. Your drafts are saved.',409);
  let pub;try{pub=snapshots(next);const checkRefs=x=>{if(!x||typeof x!=='object')return;for(const[k,v]of Object.entries(x)){if(['documentId','videoId'].includes(k)&&v){const f=next.files?.find(f=>f.id===v);check(f&&(k==='videoId'?f.kind==='video':f.kind==='pdf'),'Upload a checked file before publishing.',422,k);}else checkRefs(v);}};checkRefs(pub);await validateImages(pub);}catch(e){if(e.status)throw e;fail('Cannot publish. Check the required fields, dates, links, and photos. Your drafts are saved.',422);}
  const id=uid('release');try{await builder(root,folder,id,pub,{files:next.files??[],onProgress:(id,counts)=>activeOperation?.stage(id,counts)});}catch(e){console.warn(JSON.stringify({event:'publication_failed',stage:'build',reason:/Sidecar|Missing page|Nonportable|file reference|checked metadata/.test(e.message)?'asset_reference':/anchor|routes/.test(e.message)?'page_links':/site check failed/.test(e.message)?'build_process':'validation'}));const failed=clone(state);log(failed,'publication_failed',now());failed.lastFailure={at:now(),message:'The site could not be built. The previous site is still available.'};(failed.failures??=[]).unshift({id:uid('failed'),at:now(),summary:'FAILED - previous site kept',status:'failed'});await save(failed);fail(failed.lastFailure.message,422);}
  activeOperation?.stage('install');
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
  for(const id of expired){for(const a of next.attachments.filter(a=>a.conversationId===id)){await deleteFile(a.id);if(a.originalId)await deleteFile(a.originalId);}removeConversation(next,id);log(next,'purge',now());}
  next.journal=next.journal.filter(e=>new Date(e.at)>=cutoff);
  await save(next);
 }
 function readOnly(method,url){
  if(method!=='GET')return false;
  const route=url.pathname.slice('/api/v2'.length);
  return /^\/(sections|counts|structure|settings|people|publishes|journal)$/.test(route)||route==='/conversations'||/^\/items(?:\/[^/]+(?:\/history)?)?$/.test(route)||/^\/pages\/[^/]+$/.test(route)||/^\/(media|files)\/[^/]+$/.test(route);
 }
 async function execute(method,url,body,res,sessionState,requestActor=actor){
  const route=url.pathname.slice('/api/v2'.length),parts=route.split('/').filter(Boolean).map(decodeURIComponent);const [resource,id,action]=parts;
  const next=readOnly(method,url)?state:clone(state);let result={},changed=false;
  const item=()=>{const x=next.items.find(i=>i.id===id);check(x,'Item not found.',404);return x;};
  const talk=()=>{const x=next.conversations.find(i=>i.id===id&&(!i.deletedAt||action==='restore-archived'));check(x,'Conversation not found.',404);return x;};
  const filesView=()=>Object.fromEntries((next.files??[]).map(({id,name,kind,size})=>[id,{name,kind,size}]));
 const fileBudget=extra=>{const used=(next.files??[]).reduce((n,f)=>n+f.size,0)+(next.attachments??[]).reduce((n,a)=>n+a.size+(a.originalId?(a.originalSize??10*1024*1024):0),0);check(used+extra<=500*1024*1024,'File storage is full. Please contact the site manager.',413);};
 const itemView=x=>({...viewItem(next,x),files:filesView()});
 let urls;const assetUrls=()=>urls??=mediaView(next);
  if(method==='GET'&&resource==='counts')return Object.fromEntries(['cv','msg'].map(box=>[box,next.conversations.filter(t=>t.box===box&&t.state!=='archived'&&t.unread).length]));
  if(method==='GET'&&resource==='sections')return Object.fromEntries(sectionIds(next).map(s=>[s,next.items.filter(i=>i.section===s).length]));

  if(resource==='structure'){
   const tree=next.structure;check(tree,'The site structure is not ready.',503);
   if(method==='GET')return {...clone(tree),zones:clone(zones)};
   if(method==='POST'&&id==='publish'){revision(tree,body.revision);tree.live=clone(tree.fields);return publish(next,'Site structure updated');}
   if(method==='POST'&&!id)fail('The site sections are fixed. You can rename them and edit their content.');
   if(method==='PUT'&&!id){
    revision(tree,body.revision);let candidate;try{candidate=prepareStructure(body.structure);}catch(e){if(e.status)throw e;fail(e.message);}
    check(candidate.nodes.length===tree.fields.nodes.length,'The site sections are fixed. You can rename them and edit their content.');
    for(const old of tree.fields.nodes){const node=candidate.nodes.find(n=>n.id===old.id);check(node&&node.slug===old.slug&&node.kind===old.kind&&node.parentId===old.parentId&&node.zone===old.zone,'Page addresses and content types stay fixed to protect existing links and content.');}
    tree.fields=candidate;tree.revision++;result={...clone(tree),zones:clone(zones)};changed=true;
   }
  }else if(resource==='items'&&!id){
   const section=url.searchParams.get('section');
   if(method==='GET'){check(sectionIds(next).includes(section),'Section not found.',404);return next.items.filter(i=>i.section===section).sort((a,b)=>(b.fields.date??b.fields.start??'').localeCompare(a.fields.date??a.fields.start??'')).map(i=>({id:i.id,title:i.fields.title,status:status(i),thumb:(i.fields.image??i.fields.cover)?.mediaId?assetUrls()[(i.fields.image??i.fields.cover).mediaId]:''}));}
   if(method==='POST'){check(next.items.length<1000,'The limit of 1,000 items has been reached.',413);const fields=draftFields(body.section,body.fields,{},next),slug=address(fields.title,next.reserved);const x={id:uid('item'),publicId:slug,slug,section:body.section,revision:1,fields,live:null};next.reserved.push(slug);next.items.unshift(x);result=itemView(x);changed=true;}
  }else if(resource==='items'&&id){
   const x=item();
   if(method==='GET'&&!action)return itemView(x);
   if(method==='GET'&&action==='history')return x.previousVersions??{};
   if(method==='POST'&&action==='restore'){revision(x,body.revision);check(Object.hasOwn(x.previousVersions??{},body.version),'Saved item version not found.',404);x.fields=clone(x.previousVersions[body.version]);x.revision++;result=itemView(x);changed=true;}
   if(method==='PUT'&&!action){revision(x,body.revision);x.fields=draftFields(x.section,body.fields,x.fields,next);x.revision++;result=itemView(x);changed=true;}
   if(method==='POST'&&['publish','unpublish'].includes(action)){revision(x,body.revision);if(action==='publish')check(next.structure.live.nodes.some(n=>n.id===x.section),'Publish the site structure before publishing content in this new section.');x.live=action==='publish'?clone(x.fields):null;const answer=await publish(next,action==='publish'?'Content published':'Content taken off the site');return {...answer,item:viewItem(state,state.items.find(i=>i.id===id))};}
   if(method==='DELETE'&&!action){(next.archivedItems??=[]).push({...x,deletedAt:now()});next.items=next.items.filter(i=>i.id!==id);log(next,'item_archived',now());if(x.live)return publish(next,'Content archived');changed=true;}
  }else if(resource==='pages'&&id){
   check(Object.hasOwn(next.pages,id),'Page not found.',404);const p=next.pages[id];
   if(method==='GET'&&!action)return {...clone(p),fields:id==='home'?{...homeFields(next.base.home),...clone(p.fields)}:clone(p.fields),media:assetUrls(),files:filesView(),...(id==='wording'?{defaults:wordingDefaults,limits:wordingLimits}:{})};
   if(method==='PUT'&&!action){revision(p,body.revision);plain(body.fields);check(Buffer.byteLength(JSON.stringify(body.fields))<=60000,'This page is too large. Shorten its content and try again.',413);const candidate=clone(next);setPage(candidate.base,id,body.fields);
    // Merge fields the current UI does not expose (team photos and job locations).
    const f=id==='wording'?validateWording(body.fields):['home','about','contact'].includes(id)?{...p.fields,...clone(body.fields)}:clone(body.fields);if(id==='about')f.team=(f.team??[]).map(person=>({...p.fields.team?.find(x=>x.name===person.name),...person}));if(id==='join')f.positions=(f.positions??[]).map(job=>({...p.fields.positions?.find(x=>x.title===job.title),...job}));
    p.fields=f;p.revision++;sessionState.pages[id]=p.revision;result={revision:p.revision};changed=true;
   }
   if(method==='POST'&&action==='publish'){check(sessionState.pages[id]===p.revision,'This page changed in another window. Save it again before publishing.',409);p.live=clone(p.fields);return publish(next,'Page updated');}
  }else if(resource==='files'){
   if(method==='POST'&&!id){check((next.files??[]).length<100,'The limit of 100 uploaded documents and videos has been reached.',413);const upload=await prepareUpload(body,folder,{onProgress:(id,counts)=>activeOperation?.stage(id,counts)});activeOperation?.stage('saving');const {bytes,...metadata}=upload;fileBudget(bytes.length);if(store){check(store.saveFile,'File storage is not available.',503);await store.saveFile(upload.id,bytes);}else await writeFile(path.join(fileFolder,upload.id),bytes,{mode:0o600,flag:'wx'});(next.files??=[]).push(metadata);result={...metadata,url:'/files/'+upload.id};changed=true;}
   if(method==='GET'&&id){const file=next.files?.find(f=>f.id===id);check(file,'File not found.',404);send(res,200,await fileBytes(id),file.mime,{'Content-Disposition':file.kind==='pdf'?'inline; filename="document.pdf"':'inline'});return null;}
  }else if(resource==='media'){
   if(method==='POST'&&!id){const a=await image(body);check(next.media.length<500,'The limit of 500 media files has been reached.',413);next.media.push(a);result={mediaId:a.id,src:`/api/v2/media/${a.id}`};changed=true;}
   if(method==='GET'&&id){const a=next.media.find(m=>m.id===id);check(a,'Photo not found.',404);send(res,200,Buffer.from(a.base64,'base64'),a.mime);return null;}
  }else if(resource==='publishes'){
   if(method==='GET'&&!id)return [...next.publishes.map(({snapshot,...entry})=>entry),...(next.failures??[])].map(entry=>({...entry,summary:historyLabel(entry.summary)}));
   if(method==='POST'&&action==='restore'){const saved=next.publishes.find(p=>p.id===id);check(saved,'Version not found.',404);const safe=cleanPublicSnapshot(hydrateSnapshot(next,saved.snapshot));const restored=migrate(safe.site,safe.cases,undefined,now());preserveRestoredMedia(next,restored);for(const i of next.items)i.live=null;
    for(const old of restored.items){const current=next.items.find(i=>i.publicId===old.publicId&&i.section===old.section);if(current)current.live=clone(old.live);else{next.items.push(old);next.reserved.push(old.slug);}}
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
   if(method==='GET'&&!id){const box=url.searchParams.get('box'),archived=url.searchParams.get('state')==='archived';check(['cv','msg'].includes(box),'Inbox not found.',404);return next.conversations.filter(t=>!t.deletedAt&&t.box===box&&(t.state==='archived')===archived).map(t=>({id:t.id,name:t.name,email:t.email,unread:t.unread,lastAt:t.messages.at(-1).at,preview:conversationView(t).messages.at(-1).text.slice(0,240)})).sort((a,b)=>b.lastAt.localeCompare(a.lastAt));}
   if(id){const t=talk();if(method==='GET'&&!action){t.unread=false;result=conversationView(t);changed=true;}
    if(method==='POST'&&action==='state'){check(['open','archived','callback'].includes(body.state),'Unknown status.');t.state=body.state;changed=true;}
    if(method==='DELETE'&&!action){t.state='archived';t.deletedAt=now();t.unread=false;changed=true;}
    if(method==='POST'&&action==='restore-archived'){delete t.deletedAt;t.state='archived';changed=true;}
    if(method==='POST'&&action==='retry-reply'){
     check(mail.mode==='resend','Email sending is not configured.',503);
     const previous=next.outbox.find(m=>m.id===body.mailId&&m.conversationId===t.id&&m.kind==='reply');check(previous,'Reply not found.',404);
     const existing=next.outbox.find(m=>m.retryOf===previous.id);if(existing)return {mailId:existing.id,status:existing.status,message:'This retry is already saved.'};
     check(previous.status==='review_required','This reply is not awaiting delivery review.',409);
     check(body.confirmPotentialDuplicate===true,'Delivery may already have occurred. Review the provider record and confirm the risk of a duplicate before retrying.',409);
     const message=t.messages.find(m=>m.mailId===previous.id);check(message,'Reply message not found.',404);
     const entry=queueEmail(next,mail,{id:uid('mail'),conversationId:t.id,kind:'reply',to:previous.to,subject:previous.subject,text:previous.text,replyTo:previous.replyTo,at:now()});
     entry.retryOf=previous.id;previous.status='superseded';message.mailId=entry.id;message.status=entry.status;
     log(next,'reply_retry_authorized',now());await save(next);return {mailId:entry.id,status:entry.status,message:'Retry queued. A duplicate email is possible.'};
    }
    if(method==='POST'&&action==='replies'){
     const value=text(body.text,10000,'text'),key=hash({text:value,signature:next.settings.signature});
     if(t.messages.at(-1)?.simulationKey===key)return {status:t.messages.at(-1).status,message:'This reply is already saved.'};
     const at=now(),id=uid('mail');const entry=queueEmail(next,mail,{id,conversationId:t.id,kind:'reply',to:[t.email],subject:'Re: '+t.subject,text:value+(next.settings.signature?'\n\n'+next.settings.signature:''),replyTo:t.replyKey+'@'+mail.replyDomain,at});
     t.messages.push({from:'us',at,text:entry.text,status:entry.status,simulation:mail.mode==='simulated',simulationKey:key,mailId:id,attachments:[]});
     log(next,'reply_saved',at);await save(next);
     return {status:entry.status,message:entry.status==='sent'?'Reply sent.':entry.status==='simulated'?'Reply saved for testing. No email was sent.':'Reply saved. Email delivery will be retried.'};
    }
   }
  }else if(resource==='attachments'&&id&&method==='GET'){
   const a=next.attachments.find(a=>a.id===id);check(a&&next.conversations.some(t=>t.id===a.conversationId&&!t.deletedAt),'File not found.',404);
   const original=url.searchParams.get('original')==='1';
   if(original)check(url.searchParams.get('confirm')==='1'&&a.originalId,'Confirm that you are downloading the unprocessed original.',423);
   else check(a.state==='clean','This attachment is in quarantine. Its safety check is not complete.',423);
   log(next,original?'attachment_original_open':'attachment_open',now());await save(next);
   const bytes=a.base64?Buffer.from(a.base64,'base64'):await fileBytes(original?a.originalId:a.id);
   send(res,200,bytes,original?'application/octet-stream':a.mime??'application/pdf',{'Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'",'Content-Disposition':`attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(original?a.name:(a.previewName??a.name))}`});return null;
  }else if(resource==='intake'&&method==='POST'){
   check(['cv','msg'].includes(body.box),'Unknown inbox.');check(!body.website,'Submission rejected.',422);
   check(next.conversations.length<2000,'The inbox is full. Please contact the studio by email.',503);
   const rateKey=privateRateKey(body.rateKey),time=clock().getTime();const table=next.formRates??={};
   for(const key of Object.keys(table))if(!table[key].some(t=>time-t<3600000))delete table[key];
   const recent=(table[rateKey]??[]).filter(t=>time-t<3600000);check(recent.length<5,'Too many submissions. Please try again later.',429);table[rateKey]=[...recent,time];
   const t={id:uid('conversation'),box:body.box,state:'open',name:text(body.name??body.full_name,120,'name'),email:email(body.email),subject:body.box==='cv'?'Application':'Contact',createdAt:now(),unread:true,replyKey:uid('reply'),messages:[]};
   const message={from:'them',at:now(),text:text(body.message,5000,'message'),facts:text(body.facts??body.phone??'',40,'facts',false),portfolioUrl:validatePortfolioUrl(body.portfolioUrl??''),attachments:[]};
   const input=body.attachment??body.cv;
   check(body.box==='cv'||!input,'Attachments are only accepted with applications.',422);
   if(input){const a=await prepareJoinFile(input,folder);const {bytes,original,...metadata}=a;metadata.conversationId=t.id;metadata.originalId=a.id+'-original';metadata.originalSize=original.length;fileBudget(bytes.length+original.length);await saveFile(a.id,bytes);await saveFile(metadata.originalId,original);next.attachments.push(metadata);message.attachments.push({id:a.id,name:a.name,size:a.size,kind:a.kind,mime:a.mime});}
   t.messages.push(message);next.conversations.push(t);
   if(next.settings.notifications[t.box]&&mail.notifications.length)queueEmail(next,mail,{id:uid('mail'),conversationId:t.id,kind:'notification',to:mail.notifications,subject:t.box==='cv'?'New application':'New message',text:'A new message is available in Pond Desk. Sign in to read it.',at:now()});
   log(next,'inquiry_received',now());await save(next);return {id:t.id,status:'received'};
  }else if(resource==='mail-inbound'&&method==='POST'){
   verifyInbound(body.raw,body.headers,inboundSecret,clock().getTime());const value=body.value;
   check(typeof value.eventId==='string'&&value.eventId.length<=200,'Invalid incoming message.',422);
   const key=privateRateKey(value.eventId);if((next.inboundEvents??[]).some(e=>e.key===key))return {status:'received'};
   const t=next.conversations.find(t=>!t.deletedAt&&value.to===t.replyKey+'@'+mail.replyDomain);check(t&&email(value.from)===t.email,'Incoming sender or conversation does not match.',403);
   check(t.messages.filter(m=>m.from==='them'&&clock().getTime()-Date.parse(m.at)<3600000).length<30,'Too many replies.',429);
   t.messages.push({from:'them',at:now(),text:text(value.text,10000,'text'),attachments:[]});t.unread=true;
   next.inboundEvents=[...(next.inboundEvents??[]).filter(e=>clock().getTime()-e.at<7*86400000),{key,at:clock().getTime()}].slice(-10000);log(next,'reply_received',now());result={status:'received'};changed=true;
  }else if(resource==='archive'&&method==='POST'&&id&&action==='restore'){
   const archived=(next.archivedItems??[]).find(x=>x.id===id);check(archived,'Archived item not found.',404);check(next.items.length<1000,'The limit of 1,000 items has been reached.',413);check(!next.items.some(x=>x.id===id),'This item has already been restored.',409);
   const restored=clone(archived);delete restored.deletedAt;restored.live=null;restored.revision++;next.items.push(restored);next.archivedItems=next.archivedItems.filter(x=>x.id!==id);log(next,'item_restored',now());result=itemView(restored);changed=true;
  }else if(resource==='archive'&&method==='GET'){
   return {items:(next.archivedItems??[]).map(x=>({id:x.id,title:x.fields.title,deletedAt:x.deletedAt})),conversations:next.conversations.filter(t=>t.deletedAt).map(t=>({id:t.id,name:t.name,deletedAt:t.deletedAt}))};
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
  let counted=false;
  try{
   const inbound=url.pathname==='/api/v2/mail/inbound'&&req.method==='POST';
   const form=['/api/v2/forms/contact','/api/v2/forms/join'].includes(url.pathname)&&req.method==='POST';
   if(['/api/v2/intake','/api/v2/mail-inbound'].includes(url.pathname))fail('Unknown action.',404);
   const session=url.pathname==='/api/v2/session'&&req.method==='GET';
   const cookie=(req.headers.cookie??'').split(';').map(v=>v.trim()).find(v=>v.startsWith('pond_session='))?.slice(13);
   for(const [key,value] of sessions)if(value.expires<clock().getTime())sessions.delete(key);
   const sessionKey=req.headers['x-editor-token']||(req.method==='GET'?cookie:undefined);
   const auth=hosted&&store?.loadSession&&typeof sessionKey==='string'?await store.loadSession(hash(sessionKey),clock().getTime()):sessions.get(sessionKey);
   if(hosted&&!req.pondPublicForm&&!inbound)check(req.pondIdentity&&(!auth||auth.email===req.pondIdentity.email),'Sign in to access Pond Desk.',403);
   if(hosted&&url.pathname.startsWith('/api/v2/testing/'))fail('This page or action is not available.',404);
   check(form||inbound||session||auth,'Your editor session has expired. Reload the page.',403);
   if(form||inbound){
    check(intakeInFlight<4,'The form is busy. Please try again shortly.',503);intakeInFlight++;counted=true;
   }
   if(form){
    const key=privateRateKey(req.pondClientIp??req.pondIdentity?.subject??req.socket.remoteAddress),time=clock().getTime();
    for(const [k,v] of attempts)if(time-v[0]>3600000)attempts.delete(k);
    const recent=attempts.get(key)??[];check(recent.length<20&&attempts.size<10000,'Too many submissions. Please try again later.',429);attempts.set(key,[...recent,time]);
   }
   const body=['POST','PUT','DELETE'].includes(req.method)?(req.method==='DELETE'?{}:await bodyOf(req,form)):{};
   if(form&&req.pondPublicForm){check(!body.website,'Submission rejected.',422);check(forms.enabled,'Online sending is not open yet.',503);await forms.verify(body.turnstileToken,req.pondPublicForm,url.pathname.endsWith('/join')?'join':'contact');}
   // These reads must stay outside the mutation queue so a build can report progress.
   if(req.method==='GET'&&/^\/api\/v2\/jobs\/[^/]+$/.test(url.pathname)){
    const job=operations.get(url.pathname.split('/').at(-1),hash(sessionKey));check(job,'Operation not found. Check the site history before trying again.',404);send(res,200,job);return true;
   }
   const plan=operationPlan(req.method,url.pathname.slice('/api/v2'.length),publicVariants);
   const asynchronous=plan&&String(req.headers.prefer??'').split(',').some(p=>p.trim().toLowerCase()==='respond-async');
   const job=asynchronous?operations.create(hash(sessionKey),plan):null;
   // Only audited, side-effect-free reads bypass the mutation queue. They observe
   // the last committed state while a new release is being built. Authentication
   // is still checked above, and reads never persist or extend a session.
   if(readOnly(req.method,url)){
    await initialize();
    const result=await execute(req.method,url,{},res,auth,req.pondIdentity?.email??'local');
    if(result!==null)send(res,200,result);
    return true;
   }
   const operation=async()=>{await initialize();actor=req.pondIdentity?.email??'local';await purge();if(session){const token=uid('session');const duration=hosted?sessionSeconds*1000:28800000;const info={expires:clock().getTime()+duration,pages:{},email:actor};if(hosted&&store?.saveSession)await store.saveSession(hash(token),info,clock().getTime());else{check(sessions.size<1000,'Too many open sessions. Try again later.',429);sessions.set(token,info);}send(res,200,{token,user:{email:actor==='local'?'local@example.invalid':actor},mode:hosted?'hosted-test':'local',deployment:hosted?'hosted':'local',mail:mail.mode,publicUrls,publicVariants },'application/json',{'Set-Cookie':`pond_session=${token}; ${hosted?'Secure; ':''}HttpOnly; SameSite=Strict; Path=/api/v2; Max-Age=${hosted?sessionSeconds:28800}`});return;}
    if(form){body.box=url.pathname.endsWith('/join')?'cv':'msg';body.rateKey=req.pondClientIp??req.pondIdentity?.subject??req.socket.remoteAddress;url=new URL('/api/v2/intake',url);}
    const previousContext=auth?JSON.stringify(auth.pages):null;
    const result=inbound?await execute('POST',new URL('/api/v2/mail-inbound',url),{raw:req.pondRawBody,headers:req.headers,value:body},res,auth):await execute(req.method,url,body,res,auth);
    if(auth&&hosted&&store?.saveSession&&previousContext!==JSON.stringify(auth.pages))await store.saveSession(hash(sessionKey),auth,clock().getTime());
    if(job)job.succeed(result);else if(result!==null)send(res,form?201:200,result);
   };
   const task=queue.then(async()=>{activeOperation=job;try{if(job)job.stage(plan[0][0]);await operation();}catch(error){if(!job)throw error;job.fail(error);}finally{activeOperation=null;}});queue=task.catch(()=>{});
   if(job){send(res,202,{job:{id:job.id}},'application/json',{'Preference-Applied':'respond-async'});void task.then(sendPending,()=>{});}else{await task;sendPending();}
  }catch(error){if(res.headersSent){res.end();return true;}if(error.status===413)res.setHeader('Connection','close');send(res,error.status??400,{...(error.code?{code:error.code}:{}),message:error.status?error.message:'Could not process this data. Check the fields and try again.',...(error.diagnostics?{diagnostics:error.diagnostics}:{})});}
  finally{if(counted)intakeInFlight--;}
  return true;
 }
 async function publicFile(id,res,head=false){
  if(!/^file-[a-f0-9]{24}$/.test(id))return false;const pub=state.publishes[0]?.snapshot??state.initialPublic;const used=referencedFiles(pub).has(id);const file=state.files?.find(f=>f.id===id);if(!used||!file)return false;send(res,200,head?Buffer.alloc(0):await fileBytes(id),file.mime,{'Content-Disposition':file.kind==='pdf'?'inline; filename="document.pdf"':'inline'});return true;
 }
 return {handler,publicFile,initialize,release:()=>state?.release,active:()=>Boolean(state)||existsSync(file),close:async()=>{closing=true;await mailPump;await queue;if(locked)await rm(lock,{force:true});locked=false;},purge:async()=>{const task=queue.then(async()=>{if(state)await purge();});queue=task.catch(()=>{});await task;sendPending();}};
}
